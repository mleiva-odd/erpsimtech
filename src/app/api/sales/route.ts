import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission, requireOperationalPermission } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import { ACCOUNTS, createJournalEntry } from '@/lib/accounting';
import { getCurrentCost, logStockMovementInline } from '@/lib/inventory';
import { assertCustomerCanBuyOnCredit, ARAPError } from '@/lib/ar-ap';
import { calculateLineTax, validateGuatemalanNit, isCF } from '@/lib/fel';
import { z } from 'zod';

const SaleItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
});

const PaymentSchema = z.object({
  method: z.enum(['CASH', 'CARD', 'TRANSFER', 'CREDIT']),
  amount: z.number().positive(),
  reference: z.string().optional().nullable(),
  bankAccountId: z.string().uuid().optional().nullable(),
});

const CreateSaleSchema = z.object({
  clientRequestId: z.string().uuid().optional().nullable(),
  items: z.array(SaleItemSchema).min(1, 'La venta debe tener al menos un ítem'),
  payments: z.array(PaymentSchema).optional(),
  discount: z.number().min(0).max(100).default(0),
  customerId: z.string().uuid().optional().nullable(),
  // Fase 16: datos del receptor obligatorios para snapshot FEL.
  // Si customerId está presente, se toman del Customer salvo override.
  // Si NO hay customerId, customerNit y customerName son obligatorios.
  // "CF" (Consumidor Final) acepta nombre genérico "Consumidor Final".
  customerNit: z.string().trim().optional().nullable(),
  customerName: z.string().trim().optional().nullable(),
  status: z.enum(['COMPLETED', 'QUOTE']).default('COMPLETED'),
  channel: z.enum(['POS', 'REMOTE', 'WEB']).default('POS'),
});

const saleResponseInclude = {
  items: { include: { product: { select: { id: true, name: true, sku: true } }, variant: { select: { id: true, name: true } } } },
  payments: true,
  user: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true } },
  returns: { select: { id: true, amount: true, reason: true, createdAt: true } },
} as const;

export async function POST(req: NextRequest) {
  const result = await requireOperationalPermission(['pos:access', 'sales:view', 'settings:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const body = await req.json();
  const parsed = CreateSaleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }

  const { clientRequestId, items, payments = [], discount, customerId, status, channel, customerNit: bodyCustomerNit, customerName: bodyCustomerName } = parsed.data;

  if (clientRequestId) {
    const existingSale = await prisma.sale.findFirst({
      where: {
        companyId: tenant.companyId,
        clientRequestId,
      },
      include: saleResponseInclude,
    });

    if (existingSale) {
      return NextResponse.json(existingSale);
    }
  }

  if (status === 'COMPLETED' && payments.length === 0) {
    return NextResponse.json({ error: 'La venta de contado requiere métodos de pago.' }, { status: 400 });
  }

  if (status === 'QUOTE' && payments.length > 0) {
    return NextResponse.json({ error: 'Las cotizaciones no deben registrar pagos.' }, { status: 400 });
  }

  const cardOrTransferWithoutReference = payments.find(
    (payment) => (payment.method === 'CARD' || payment.method === 'TRANSFER') && !payment.reference?.trim()
  );
  if (cardOrTransferWithoutReference) {
    return NextResponse.json({
      error: cardOrTransferWithoutReference.method === 'CARD'
        ? 'Debes registrar la autorización del pago con tarjeta.'
        : 'Debes registrar la referencia de la transferencia.',
    }, { status: 400 });
  }

  if (payments.filter((payment) => payment.method === 'CREDIT').length > 1) {
    return NextResponse.json({ error: 'Solo se admite un tramo de crédito por venta.' }, { status: 400 });
  }

  // Determine the branch for this sale
  let branchId = tenant.branchId;
  if (!branchId) {
    const mainBranch = await prisma.branch.findFirst({
      where: { companyId: tenant.companyId, isMain: true },
    });
    if (!mainBranch) {
      return NextResponse.json({ error: 'No se encontró una sucursal asignada' }, { status: 400 });
    }
    branchId = mainBranch.id;
  }

  const settings = await prisma.companySettings.findUnique({
    where: { companyId: tenant.companyId },
    select: {
      acceptsCash: true,
      acceptsCard: true,
      acceptsTransfer: true,
      acceptsCredit: true,
    },
  });

  // Fase 16: validar que la empresa tenga régimen tributario configurado.
  // Sin esto el cálculo de IVA no es determinístico (no podemos saber si
  // aplicar 12% o 5%). El admin debe setearlo en Settings/onboarding.
  // Cast del resultado: el cliente Prisma del sandbox no tiene `taxRegime`
  // generado aún (lo arregla `npx prisma generate` post-merge).
  const company = (await prisma.company.findUnique({
    where: { id: tenant.companyId },
  })) as
    | { taxRegime: 'GENERAL' | 'PEQUENO_CONTRIBUYENTE' | null; name: string; nit: string | null }
    | null;
  if (!company?.taxRegime) {
    return NextResponse.json(
      {
        error:
          'Debes configurar el régimen tributario (General o Pequeño Contribuyente) en Settings antes de facturar.',
        code: 'TAX_REGIME_NOT_CONFIGURED',
      },
      { status: 400 },
    );
  }
  const companyTaxRegime = company.taxRegime as 'GENERAL' | 'PEQUENO_CONTRIBUYENTE';

  // Resolver receptor (NIT + nombre):
  //   - Si customerId, leer del Customer (snapshot).
  //   - Sino, requerir customerNit y customerName del body.
  //   - Validar formato NIT GT (acepta "CF").
  let resolvedReceptorNit: string | null = null;
  let resolvedReceptorName: string | null = null;
  if (customerId) {
    const cust = await prisma.customer.findFirst({
      where: { id: customerId, companyId: tenant.companyId },
      select: { nit: true, name: true },
    });
    if (!cust) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
    }
    resolvedReceptorNit = (bodyCustomerNit?.trim() || cust.nit || 'CF').trim();
    resolvedReceptorName = (bodyCustomerName?.trim() || cust.name || 'Consumidor Final').trim();
  } else {
    resolvedReceptorNit = (bodyCustomerNit?.trim() || 'CF').trim();
    resolvedReceptorName = (bodyCustomerName?.trim() || 'Consumidor Final').trim();
  }

  // Validar formato del NIT (acepta "CF").
  const nitCheck = validateGuatemalanNit(resolvedReceptorNit);
  if (!nitCheck.ok) {
    return NextResponse.json(
      {
        error: `NIT del receptor inválido: ${nitCheck.error ?? 'formato incorrecto'}.`,
        code: 'INVALID_RECEPTOR_NIT',
      },
      { status: 400 },
    );
  }
  resolvedReceptorNit = nitCheck.normalized;
  if (!isCF(resolvedReceptorNit) && (!resolvedReceptorName || resolvedReceptorName.length < 2)) {
    return NextResponse.json(
      { error: 'Nombre del receptor requerido cuando el NIT no es CF.' },
      { status: 400 },
    );
  }

  const disabledMethod = payments.find((payment) => {
    if (payment.method === 'CASH') return settings?.acceptsCash === false;
    if (payment.method === 'CARD') return settings?.acceptsCard === false;
    if (payment.method === 'TRANSFER') return settings?.acceptsTransfer === false;
    if (payment.method === 'CREDIT') return settings?.acceptsCredit === false;
    return false;
  });

  if (disabledMethod) {
    return NextResponse.json({ error: `El método ${disabledMethod.method} no está habilitado en la configuración del negocio.` }, { status: 400 });
  }

  try {
    let activeRegisterId = null;
    // Solo requerir caja abierta para ventas POS completadas (no remotas ni cotizaciones)
    if (status === 'COMPLETED' && channel === 'POS') {
      const activeRegister = await prisma.cashRegister.findFirst({
        where: { userId: tenant.userId, branchId, status: 'OPEN' },
      });
      if (!activeRegister) {
        return NextResponse.json({ error: 'Debes abrir turno de caja primero' }, { status: 400 });
      }
      activeRegisterId = activeRegister.id;
    }
    
    const transactionResult = await prisma.$transaction(async (tx) => {
      // Fetch all products needed
      const productIds = items.map((i) => i.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, companyId: tenant.companyId, active: true },
        include: {
          bundleItems: true,
          stocks: { where: { branchId, variantId: null } },
          variants: { include: { stocks: { where: { branchId } } } }
        },
      });

      // 1. Verify stock if COMPLETED
      if (status === 'COMPLETED') {
        for (const item of items) {
          const product = products.find((p) => p.id === item.productId);
          if (!product) throw new Error(`Producto ${item.productId} no encontrado`);
          
          if (product.isBundle) {
            // VERIFY COMPONENTS STOCK
             for (const bundleItem of product.bundleItems) {
               const componentStock = await tx.productStock.findFirst({
                 where: { productId: bundleItem.componentId, branchId, variantId: null }
               });
               const required = item.quantity * bundleItem.quantity;
               if (!componentStock || componentStock.quantity < required) {
                 throw new Error(`Stock insuficiente de la pieza "${bundleItem.componentId}" para el combo "${product.name}". Disp: ${componentStock?.quantity||0}, Req: ${required}`);
               }
             }
          } else {
            // REGULAR VERIFICATION
            let available = 0;
            let itemName = product.name;
  
            if (item.variantId) {
              const variant = product.variants.find((v) => v.id === item.variantId);
              if (!variant) throw new Error(`Variante no encontrada para ${product.name}`);
              available = variant.stocks[0]?.quantity ?? 0;
              itemName = `${product.name} - ${variant.name}`;
            } else {
              available = product.stocks[0]?.quantity ?? 0;
            }
  
            if (available < item.quantity) {
              throw new Error(`Stock insuficiente para "${itemName}". Disponible: ${available}`);
            }
          }
        }
      }

      // 2. Calculate totals + IVA por línea (Fase 16).
      //
      // Estrategia:
      //   - El descuento `discount` (porcentaje 0-100) se distribuye
      //     prorrateado entre las líneas en proporción a su monto bruto.
      //   - Cada línea calcula su propio IVA según régimen + isTaxExempt
      //     del producto.
      //   - Sale.subtotal = Σ saleItem.subtotal (post-descuento, pre-IVA).
      //   - Sale.tax      = Σ saleItem.tax.
      //   - Sale.total    = Sale.subtotal + Sale.tax.
      //   - Sale.discount queda como antes (porcentaje aplicado).
      const grossSubtotal = items.reduce(
        (acc, item) => acc + item.unitPrice * item.quantity,
        0,
      );
      const discountFactor = discount > 0 ? discount / 100 : 0;

      type LineCalc = {
        taxRate: number;
        tax: number;
        subtotal: number; // post-descuento, pre-IVA
        total: number;
        lineDiscount: number; // monto descuento prorrateado
      };
      const lineCalcs: LineCalc[] = items.map((item) => {
        const lineGross = item.unitPrice * item.quantity;
        const lineDiscount = discountFactor > 0 ? lineGross * discountFactor : 0;
        const product = products.find((p) => p.id === item.productId);
        const isTaxExempt = product?.isTaxExempt ?? false;
        const calc = calculateLineTax({
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          discount: lineDiscount,
          isTaxExempt,
          companyTaxRegime,
        });
        return { ...calc, lineDiscount };
      });

      const subtotal = lineCalcs.reduce((s, l) => s + l.subtotal, 0);
      const taxTotal = lineCalcs.reduce((s, l) => s + l.tax, 0);
      const total = subtotal + taxTotal;
      // Nota: `grossSubtotal` se usa para validar contra clientes que
      // mandan el cálculo previo. Tax se incluye en `total` ahora.
      void grossSubtotal;

      // 3. Validate payment amounts & Handle Credit Payment
      let hasCreditPayment = false;
      if (status === 'COMPLETED') {
        const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
        if (totalPaid < total) {
          throw new Error(`Pago insuficiente. Total: Q${total.toFixed(2)}, Pagado: Q${totalPaid.toFixed(2)}`);
        }
        if (totalPaid > total + 0.01) {
          throw new Error(`Pago excedido. Total: Q${total.toFixed(2)}, Registrado: Q${totalPaid.toFixed(2)}`);
        }
        
        hasCreditPayment = payments.some(p => p.method === 'CREDIT');
        if (hasCreditPayment && !customerId) {
           throw new Error('Debes seleccionar un cliente para otorgar crédito.');
        }
      }

      // 4. Validate customer if provided
      // Fase 17: dueDate + assertCustomerCanBuyOnCredit (bloqueo por mora >
      // maxOverdueDays). El check viejo de creditLimit queda subsumido en
      // assertCustomerCanBuyOnCredit.
      let saleDueDate: Date | null = null;
      if (customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: customerId, companyId: tenant.companyId },
        }) as unknown as {
          id: string;
          name: string;
          balance: unknown;
          creditLimit: unknown;
          creditDaysDefault?: number;
        } | null;
        if (!customer) throw new Error('Cliente no encontrado');

        // Handle credit logic
        if (hasCreditPayment && status === 'COMPLETED') {
          const creditPaymentAmount = payments.find(p => p.method === 'CREDIT')?.amount || 0;

          // Bloqueo por mora + límite (Fase 17). Lanza ARAPError(409) si
          // el cliente tiene factura vencida hace más de maxOverdueDays
          // o si excedería el creditLimit.
          await assertCustomerCanBuyOnCredit(tx, {
            customerId: customer.id,
            newCreditAmount: creditPaymentAmount,
          });

          // dueDate = createdAt + customer.creditDaysDefault (default 30).
          const creditDays = Number(customer.creditDaysDefault ?? 30);
          saleDueDate = new Date();
          saleDueDate.setDate(saleDueDate.getDate() + creditDays);

          await tx.customer.update({
            where: { id: customer.id },
            data: { balance: { increment: creditPaymentAmount } }
          });
        }
      }

      // 5. Pre-compute unit costs using `getCurrentCost` (Fase 15):
      //    - Variantes: variant.cost
      //    - Bundles: suma de costos de componentes (no Product.cost del bundle
      //      que estaba hardcoded a 0).
      //    - Default: product.cost (que ahora es WAC desde Fase 15).
      const unitCostByItemIndex: number[] = [];
      for (const item of items) {
        const c = await getCurrentCost(tx, item.productId, item.variantId || null);
        unitCostByItemIndex.push(c);
      }

      const newSale = await tx.sale.create({
        data: {
          companyId: tenant.companyId,
          branchId,
          userId: tenant.userId,
          customerId: customerId || null,
          cashRegisterId: activeRegisterId,
          clientRequestId: clientRequestId || null,
          subtotal,
          discount,
          tax: taxTotal,
          total,
          status,
          channel,
          // Fase 17: dueDate solo si la venta tiene pago a crédito.
          // Calculado arriba en sección 4 (saleDueDate).
          ...(saleDueDate ? { dueDate: saleDueDate } : {}),
          // Fase 16: snapshot del receptor + régimen vigente al emitir.
          customerNit: resolvedReceptorNit,
          customerName: resolvedReceptorName,
          taxRegime: companyTaxRegime,
          items: {
            create: items.map((item, idx) => ({
              productId: item.productId,
              variantId: item.variantId || null,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unitCost: unitCostByItemIndex[idx], // Snapshot WAC al vender
              subtotal: lineCalcs[idx].subtotal,
              discount: lineCalcs[idx].lineDiscount,
              taxRate: lineCalcs[idx].taxRate,
              tax: lineCalcs[idx].tax,
            })),
          },
        } as Prisma.SaleUncheckedCreateInput,
      });

      // Handle Payments manually within transaction to capture bank IDs
      const finalPayments = [];
      if (status === 'COMPLETED') {
         // Resolve default bank account for company if missing
         let defaultBankAccount = null;
         if (payments.some(p => ['CARD', 'TRANSFER'].includes(p.method))) {
             defaultBankAccount = await tx.bankAccount.findFirst({
                 where: { companyId: tenant.companyId, type: 'BANK_ACCOUNT', isActive: true }
             });
             if (!defaultBankAccount) {
                 defaultBankAccount = await tx.bankAccount.create({
                     data: { companyId: tenant.companyId, name: 'Cuenta de Integración Base', type: 'BANK_ACCOUNT', currency: 'GTQ' }
                 });
             }
         }

         for (const p of payments) {
             let resolvedBankId = null;
             if (['CARD', 'TRANSFER'].includes(p.method)) {
                 resolvedBankId = p.bankAccountId || defaultBankAccount?.id;
             }
             
             const createdPayment = await tx.payment.create({
                 data: {
                     saleId: newSale.id,
                     method: p.method,
                     amount: p.amount,
                     reference: p.reference || null,
                      bankAccountId: resolvedBankId,
                 }
             });
             finalPayments.push(createdPayment);

             // Create BankTransaction if applicable
             if (resolvedBankId) {
                 await tx.bankTransaction.create({
                     data: {
                         bankAccountId: resolvedBankId,
                         userId: tenant.userId,
                         type: 'INCOME',
                         amount: p.amount,
                         reference: `Venta POS #${newSale.id.split('-')[0].toUpperCase()} - ${p.reference || ''}`,
                         description: 'Ingreso automatizado por venta facturada',
                         reconciled: false
                     }
                 });
             }
         }
      }

      // Re-fetch sale to include new payments
      const completedSale = await tx.sale.findUniqueOrThrow({
         where: { id: newSale.id },
         include: saleResponseInclude
      });

      // 6. Decrement stock in this branch and capture new stock data ONLY IF COMPLETED.
      // Mantenemos el patrón `updateMany ... where quantity: { gte }` para
      // race safety, y registramos el movimiento (StockMovement, Fase 15)
      // directamente — sin pasar por recordStockMovement (que aplicaría el
      // delta por su cuenta, doblando la operación).
      const updatedStocks = [];
      if (status === 'COMPLETED') {
        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          const product = products.find(p => p.id === item.productId);
          if (!product) continue;
          const unitCost = unitCostByItemIndex[idx];

          if (product.isBundle) {
            for (const bundleItem of product.bundleItems) {
              const requiredQuantity = item.quantity * bundleItem.quantity;
              const stockUpdate = await tx.productStock.updateMany({
                where: {
                  productId: bundleItem.componentId,
                  branchId: branchId!,
                  variantId: null,
                  quantity: { gte: requiredQuantity },
                },
                data: { quantity: { decrement: requiredQuantity } }
              });
              if (stockUpdate.count !== 1) {
                throw new Error(`El stock cambió mientras se procesaba la venta para el componente ${bundleItem.componentId}`);
              }
              const stk = await tx.productStock.findFirst({ where: { productId: bundleItem.componentId, branchId: branchId!, variantId: null }, include: { product: true } });
              if (stk) updatedStocks.push(stk);

              // Snapshot del costo del componente al momento (WAC vigente).
              const componentCost = await getCurrentCost(tx, bundleItem.componentId, null);

              // Log StockMovement (SALE) por cada componente del bundle.
              await logStockMovementInline(tx, {
                companyId: tenant.companyId,
                productId: bundleItem.componentId,
                variantId: null,
                branchId: branchId!,
                type: 'SALE',
                quantity: -requiredQuantity,
                unitCost: componentCost,
                referenceType: 'SALE',
                referenceId: newSale.id,
                userId: tenant.userId,
                date: newSale.createdAt,
                notes: `Bundle "${product.name}"`,
              });
            }
          } else {
            const variantWhere = item.variantId
              ? { productId: item.productId, branchId: branchId!, variantId: item.variantId, quantity: { gte: item.quantity } }
              : { productId: item.productId, branchId: branchId!, variantId: null, quantity: { gte: item.quantity } };
            const stockUpdate = await tx.productStock.updateMany({
              where: variantWhere,
              data: { quantity: { decrement: item.quantity } }
            });
            if (stockUpdate.count !== 1) {
              throw new Error(`El stock cambió mientras se procesaba la venta para ${product.name}`);
            }
            const stk = await tx.productStock.findFirst({
              where: item.variantId
                ? { productId: item.productId, branchId: branchId!, variantId: item.variantId }
                : { productId: item.productId, branchId: branchId!, variantId: null },
              include: { product: true },
            });
            if (stk) updatedStocks.push(stk);

            await logStockMovementInline(tx, {
              companyId: tenant.companyId,
              productId: item.productId,
              variantId: item.variantId || null,
              branchId: branchId!,
              type: 'SALE',
              quantity: -item.quantity,
              unitCost,
              referenceType: 'SALE',
              referenceId: newSale.id,
              userId: tenant.userId,
              date: newSale.createdAt,
            });
          }
        }
      }

      // Asiento contable automático DENTRO de la transacción (partida doble).
      // Si el asiento falla, la venta se rollbackea entera (consistencia).
      //
      // Reglas de imputación según los pagos:
      //   - Tramo CASH       → DR Caja (1.1.01)
      //   - Tramo CARD/XFER  → DR Bancos (1.1.02)
      //   - Tramo CREDIT     → DR Clientes (1.1.04)
      //
      // Reglas de imputación de CR según régimen (Fase 16):
      //   - GENERAL: CR Ventas (4.1.01) por subtotal + CR IVA Débito (2.1.02) por tax.
      //   - PEQUEÑO_CONTRIBUYENTE: CR Ventas (4.1.01) por subtotal+tax (el 5%
      //     NO es IVA débito recuperable contablemente; es parte del ingreso).
      //     Sale.tax sigue persistiéndose en la columna para que el Libro de
      //     Ventas SAT pueda reportar el 5%.
      if (status === 'COMPLETED') {
        const taxAmount = Number(completedSale.tax ?? 0);
        const subtotalAmount = Number(completedSale.subtotal ?? 0);
        const totalAmount = Number(completedSale.total ?? 0);

        const lines: Array<{ accountCode: string; debit?: number; credit?: number; description?: string }> = [];
        for (const p of finalPayments) {
          const amt = Number(p.amount);
          if (amt <= 0) continue;
          let accountCode: string;
          if (p.method === 'CASH') accountCode = ACCOUNTS.CASH;
          else if (p.method === 'CREDIT') accountCode = ACCOUNTS.AR;
          else accountCode = ACCOUNTS.BANKS; // CARD / TRANSFER
          lines.push({ accountCode, debit: amt, description: `Cobro ${p.method}` });
        }
        if (companyTaxRegime === 'GENERAL') {
          if (subtotalAmount > 0) {
            lines.push({ accountCode: ACCOUNTS.SALES, credit: subtotalAmount, description: 'Ventas' });
          }
          if (taxAmount > 0) {
            lines.push({ accountCode: ACCOUNTS.VAT_OUTPUT, credit: taxAmount, description: 'IVA Débito Fiscal' });
          }
        } else {
          // PEQUEÑO_CONTRIBUYENTE: el "IVA" 5% no es débito recuperable.
          // Lo contabilizamos íntegro en Ventas (subtotal + tax).
          if (totalAmount > 0) {
            lines.push({
              accountCode: ACCOUNTS.SALES,
              credit: totalAmount,
              description: 'Ventas (Pequeño Contribuyente, IVA incluido en ingreso)',
            });
          }
        }

        await createJournalEntry(tx, {
          companyId: tenant.companyId,
          branchId,
          date: completedSale.createdAt,
          description: `Venta #${completedSale.id.split('-')[0].toUpperCase()} — ${items.length} producto(s) [${channel}]`,
          referenceType: 'SALE',
          referenceId: completedSale.id,
          userId: tenant.userId,
          lines,
        });

        // 7. Asiento COGS (Fase 15): DR Costo de Ventas / CR Inventario por
        // la suma total de unitCost * quantity de los ítems. Si el costo
        // total es 0 (productos sin costo capturado), no generamos asiento
        // — un journal entry con DR=CR=0 violaría la validación de balance.
        const totalCost = items.reduce((sum, it, idx) => sum + unitCostByItemIndex[idx] * it.quantity, 0);
        if (totalCost > 0) {
          await createJournalEntry(tx, {
            companyId: tenant.companyId,
            branchId,
            date: completedSale.createdAt,
            description: `COGS Venta #${completedSale.id.split('-')[0].toUpperCase()}`,
            referenceType: 'SALE_COGS',
            referenceId: completedSale.id,
            userId: tenant.userId,
            lines: [
              { accountCode: ACCOUNTS.COGS, debit: totalCost, description: 'Costo de Ventas' },
              { accountCode: ACCOUNTS.INVENTORY, credit: totalCost, description: 'Inventario' },
            ],
          });
        }
      }

    return { newSale: completedSale, updatedStocks };
    });

    const { newSale: sale, updatedStocks } = transactionResult;

    // Async tasks post-transaction

    // Low stock notifications — esperamos para garantizar flush antes de devolver respuesta.
    await Promise.all(
      updatedStocks
        .filter((stock) => stock.quantity <= stock.minStock)
        .map((stock) =>
          createNotification(
            tenant.companyId,
            'Alerta de Inventario',
            `El producto "${stock.product.name}" ha llegado a nivel bajo en inventario (${stock.quantity} unidades restantes).`,
            'WARNING',
          ),
        ),
    );

    // Audit log — `createAuditLog` ya captura sus errores internos pero
    // esperamos a que termine para garantizar persistencia antes de cerrar la lambda.
    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'SALE_CREATED',
      entity: 'Sale',
      entityId: sale.id,
      details: { total: sale.total, items: items.length, payments: payments.length },
    });

    return NextResponse.json(sale, { status: 201 });
  } catch (error: unknown) {
    if (
      clientRequestId &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existingSale = await prisma.sale.findFirst({
        where: {
          companyId: tenant.companyId,
          clientRequestId,
        },
        include: saleResponseInclude,
      });

      if (existingSale) {
        return NextResponse.json(existingSale);
      }
    }

    console.error('ERROR EN VENTA:', error);
    // Fase 17: ARAPError lleva su propio status (409 para bloqueo por mora/límite).
    if (error instanceof ARAPError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    const message = error instanceof Error ? error.message : 'Error al procesar la venta';
    const status = message.includes('Stock insuficiente')
      || message.includes('crédito')
      || message.includes('insuficiente')
      || message.includes('Pago excedido')
      ? 409
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(req: NextRequest) {
  const result = await requireAnyPermission(['sales:view', 'reports:view', 'settings:manage']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '20');
  const requestedBranchId = searchParams.get('branchId');
  const isAdmin = tenant.role === 'SUPER_ADMIN' || tenant.permissions?.includes('settings:manage');

  const targetBranchId = (!isAdmin || !requestedBranchId || requestedBranchId === 'null')
    ? tenant.branchId
    : requestedBranchId;

  // Filtros avanzados
  const status = searchParams.get('status');
  const channel = searchParams.get('channel');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const userId = searchParams.get('userId');
  const customerId = searchParams.get('customerId');
  const paymentMethod = searchParams.get('paymentMethod');
  const search = searchParams.get('search');

  const where: Prisma.SaleWhereInput = { companyId: tenant.companyId };

  // Status filter (supports multiple comma-separated)
  if (status) {
    const statuses = status.split(',').filter(s => ['COMPLETED', 'PENDING', 'CANCELLED', 'QUOTE'].includes(s));
    if (statuses.length === 1) {
      where.status = statuses[0] as Prisma.EnumSaleStatusFilter;
    } else if (statuses.length > 1) {
      where.status = { in: statuses as Array<'COMPLETED' | 'PENDING' | 'CANCELLED' | 'QUOTE'> };
    }
  }

  // Channel filter
  if (channel && ['POS', 'REMOTE', 'WEB'].includes(channel)) {
    where.channel = channel as Prisma.EnumSaleChannelFilter;
  }

  // Branch filter
  if (targetBranchId) {
    where.branchId = targetBranchId;
  }

  // Date range filter
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) {
      (where.createdAt as Prisma.DateTimeFilter).gte = new Date(dateFrom);
    }
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      (where.createdAt as Prisma.DateTimeFilter).lte = endDate;
    }
  }

  // User (seller) filter
  if (userId) {
    where.userId = userId;
  }

  // Customer filter
  if (customerId) {
    where.customerId = customerId;
  }

  // Payment method filter
  if (paymentMethod && ['CASH', 'CARD', 'TRANSFER', 'CREDIT'].includes(paymentMethod)) {
    where.payments = { some: { method: paymentMethod as 'CASH' | 'CARD' | 'TRANSFER' | 'CREDIT' } };
  }

  // Text search (ticket ID or customer name)
  if (search && search.trim()) {
    const term = search.trim();
    where.OR = [
      { id: { startsWith: term.toLowerCase() } },
      { invoiceNumber: { contains: term, mode: 'insensitive' } },
      { customer: { name: { contains: term, mode: 'insensitive' } } },
    ];
  }

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        items: { include: { product: { select: { name: true, sku: true } }, variant: { select: { name: true } } } },
        payments: true,
        returns: { select: { id: true, amount: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.sale.count({ where }),
  ]);

  return NextResponse.json({
    data: sales,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
