import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission, requireOperationalPermission } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import { createAccountingEntry } from '@/lib/accounting';
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

  const { clientRequestId, items, payments = [], discount, customerId, status, channel } = parsed.data;

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

      // 2. Calculate totals
      const subtotal = items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
      const discountAmount = subtotal * (discount / 100);
      const total = subtotal - discountAmount;

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
      if (customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: customerId, companyId: tenant.companyId },
        });
        if (!customer) throw new Error('Cliente no encontrado');
        
        // Handle credit logic
        if (hasCreditPayment && status === 'COMPLETED') {
           const creditPaymentAmount = payments.find(p => p.method === 'CREDIT')?.amount || 0;
           
           const currentBalance = Number(customer.balance) || 0;
           const creditLimit = Number(customer.creditLimit) || 0;

           if (creditLimit <= 0) {
               throw new Error(`El cliente ${customer.name} no tiene crédito autorizado.`);
           }
           if ((currentBalance + creditPaymentAmount) > creditLimit) {
               throw new Error(`El abono excede el límite de crédito de Q${creditLimit.toFixed(2)}.`);
           }

           await tx.customer.update({
             where: { id: customer.id },
             data: { balance: { increment: creditPaymentAmount } }
           });
        }
      }

      // 5. Create the sale
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
          tax: 0,
          total,
          status,
          channel,
          items: {
            create: items.map((item) => {
              const product = products.find((p) => p.id === item.productId);
              let unitCost = Number(product?.cost || 0);

              if (item.variantId) {
                const variant = product?.variants.find((v) => v.id === item.variantId);
                if (variant) {
                  unitCost = Number(variant.cost || 0);
                }
              }

              return {
                productId: item.productId,
                variantId: item.variantId || null,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                unitCost, // Persistencia de costo histórico
                subtotal: item.unitPrice * item.quantity,
              };
            }),
          },
        },
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

      // 6. Decrement stock in this branch and capture new stock data ONLY IF COMPLETED
      const updatedStocks = [];
      if (status === 'COMPLETED') {
        for (const item of items) {
           const product = products.find(p => p.id === item.productId);
           if (!product) continue;
           
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
                   data: { quantity: { decrement: item.quantity * bundleItem.quantity } }
                });
                if (stockUpdate.count !== 1) {
                  throw new Error(`El stock cambió mientras se procesaba la venta para el componente ${bundleItem.componentId}`);
                }
                const stk = await tx.productStock.findFirst({ where: { productId: bundleItem.componentId, branchId: branchId!, variantId: null }, include: { product: true } });
                if (stk) updatedStocks.push(stk);
             }
           } else {
             if (item.variantId) {
                const stockUpdate = await tx.productStock.updateMany({
                   where: {
                     productId: item.productId,
                     branchId: branchId!,
                     variantId: item.variantId,
                     quantity: { gte: item.quantity },
                   },
                   data: { quantity: { decrement: item.quantity } }
                });
                if (stockUpdate.count !== 1) {
                  throw new Error(`El stock cambió mientras se procesaba la venta para ${product.name}`);
                }
                const stk = await tx.productStock.findFirst({ where: { productId: item.productId, branchId: branchId!, variantId: item.variantId }, include: { product: true } });
                if (stk) updatedStocks.push(stk);
             } else {
                const stockUpdate = await tx.productStock.updateMany({
                   where: {
                     productId: item.productId,
                     branchId: branchId!,
                     variantId: null,
                     quantity: { gte: item.quantity },
                   },
                   data: { quantity: { decrement: item.quantity } }
                });
                if (stockUpdate.count !== 1) {
                  throw new Error(`El stock cambió mientras se procesaba la venta para ${product.name}`);
                }
                const stk = await tx.productStock.findFirst({ where: { productId: item.productId, branchId: branchId!, variantId: null }, include: { product: true } });
                if (stk) updatedStocks.push(stk);
             }
           }
        }
      }

      // Asiento contable automático DENTRO de la transacción.
      // Si el asiento falla, la venta se rollbackea entera (consistencia).
      // Antes este bloque corría fuera del $transaction y dejaba ventas
      // sin asiento si la lambda moría — ver Phase 4 audit M-1.
      if (status === 'COMPLETED') {
        const categoryName = channel === 'REMOTE' ? 'Ventas Remotas' : 'Ventas POS';
        await createAccountingEntry(tx, {
          companyId: tenant.companyId,
          branchId,
          type: 'INCOME',
          categoryName,
          description: `Venta #${completedSale.id.split('-')[0].toUpperCase()} — ${items.length} producto(s)`,
          amount: Number(completedSale.total),
          referenceType: 'SALE',
          referenceId: completedSale.id,
          userId: tenant.userId,
        });
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
