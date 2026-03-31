import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { checkSubscription } from '@/lib/subscription';
import { createNotification } from '@/app/api/notifications/route';
import { z } from 'zod';

const SaleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
});

const PaymentSchema = z.object({
  method: z.enum(['CASH', 'CARD', 'TRANSFER']),
  amount: z.number().positive(),
  reference: z.string().optional().nullable(),
});

const CreateSaleSchema = z.object({
  items: z.array(SaleItemSchema).min(1, 'La venta debe tener al menos un ítem'),
  payments: z.array(PaymentSchema).min(1, 'Debe incluir al menos un pago'),
  discount: z.number().min(0).max(100).default(0),
  customerId: z.string().uuid().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  // Check subscription before allowing sale
  const subError = await checkSubscription(tenant.companyId);
  if (subError) {
    return NextResponse.json({ error: subError }, { status: 403 });
  }

  const body = await req.json();
  const parsed = CreateSaleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }

  const { items, payments, discount, customerId } = parsed.data;

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

  try {
    // Verify open cash register
    const activeRegister = await prisma.cashRegister.findFirst({
      where: { userId: tenant.userId, branchId, status: 'OPEN' },
    });

    if (!activeRegister) {
      return NextResponse.json({ error: 'Debes abrir turno de caja primero' }, { status: 400 });
    }

    const transactionResult = await prisma.$transaction(async (tx) => {
      // 1. Verify stock in this branch
      const productIds = items.map((i) => i.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, companyId: tenant.companyId, active: true },
        include: {
          stocks: { where: { branchId } },
        },
      });

      for (const item of items) {
        const product = products.find((p) => p.id === item.productId);
        if (!product) {
          throw new Error(`Producto ${item.productId} no encontrado`);
        }
        const branchStock = product.stocks[0];
        const available = branchStock?.quantity ?? 0;
        if (available < item.quantity) {
          throw new Error(`Stock insuficiente para "${product.name}". Disponible: ${available}`);
        }
      }

      // 2. Calculate totals
      const subtotal = items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
      const discountAmount = subtotal * (discount / 100);
      const total = subtotal - discountAmount;

      // 3. Validate payment amounts cover the total
      const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
      if (totalPaid < total) {
        throw new Error(`Pago insuficiente. Total: Q${total.toFixed(2)}, Pagado: Q${totalPaid.toFixed(2)}`);
      }

      // 4. Handle credit payment
      const hasCreditPayment = payments.some(p => p.method === 'TRANSFER' && false); // Credit handled differently now
      // Credit logic would go here if needed

      // 5. Validate customer if provided
      if (customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: customerId, companyId: tenant.companyId },
        });
        if (!customer) throw new Error('Cliente no encontrado');
      }

      // 6. Create the sale
      const newSale = await tx.sale.create({
        data: {
          companyId: tenant.companyId,
          branchId,
          userId: tenant.userId,
          customerId: customerId || null,
          cashRegisterId: activeRegister.id,
          subtotal,
          discount,
          tax: 0,
          total,
          status: 'COMPLETED',
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              subtotal: item.unitPrice * item.quantity,
            })),
          },
          payments: {
            create: payments.map((p) => ({
              method: p.method,
              amount: p.amount,
              reference: p.reference || null,
            })),
          },
        },
        include: {
          items: { include: { product: { select: { id: true, name: true, sku: true } } } },
          payments: true,
          user: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
        },
      });

      // 7. Decrement stock in this branch and capture new stock data
      const updatedStocks = await Promise.all(
        items.map((item) =>
          tx.productStock.update({
            where: {
              productId_branchId: { productId: item.productId, branchId: branchId! },
            },
            data: { quantity: { decrement: item.quantity } },
            include: { product: { select: { name: true } } }
          })
        )
      );

      return { newSale, updatedStocks };
    });

    const { newSale: sale, updatedStocks } = transactionResult;

    // Async tasks post-transaction
    
    // Low stock notifications
    updatedStocks.forEach(stock => {
      if (stock.quantity <= stock.minStock) {
        createNotification(
          tenant.companyId,
          'Alerta de Inventario',
          `El producto "${stock.product.name}" ha llegado a nivel bajo en inventario (${stock.quantity} unidades restantes).`,
          'WARNING'
        );
      }
    });

    // Audit log
    createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'SALE_CREATED',
      entity: 'Sale',
      entityId: sale.id,
      details: { total: sale.total, items: items.length, payments: payments.length },
    });

    return NextResponse.json(sale, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al procesar la venta';
    const status = message.includes('Stock insuficiente') || message.includes('crédito') || message.includes('insuficiente') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(req: NextRequest) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '20');

  const where: any = { companyId: tenant.companyId };

  // If user has a branch, only show that branch's sales
  if (tenant.branchId) {
    where.branchId = tenant.branchId;
  }

  const sales = await prisma.sale.findMany({
    where,
    include: {
      user: { select: { name: true } },
      customer: { select: { name: true } },
      branch: { select: { name: true } },
      items: { include: { product: { select: { name: true } } } },
      payments: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: (page - 1) * limit,
  });

  return NextResponse.json(sales);
}
