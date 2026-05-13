import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { ACCOUNTS, createJournalEntry } from '@/lib/accounting';
import {
  getExchangeRate,
  toFunctionalAmount,
  normalizeCurrency,
  calculateFxDifference,
  ExchangeRateError,
  FUNCTIONAL_CURRENCY,
} from '@/lib/currency';
import { z } from 'zod';

const PaymentSchema = z.object({
  amount: z.number().positive('El monto debe ser mayor a cero'),
  method: z.enum(['CASH', 'CARD', 'TRANSFER']),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  // Fase 21 · Multi-moneda. Si se omite, hereda de la venta más reciente
  // del cliente (o GTQ por default si el cliente no tiene ventas).
  currency: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/, 'currency debe ser ISO-3 (USD, EUR, ...)'))
    .optional(),
});

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

/**
 * GET: Obtener historial de abonos de un cliente
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const resolvedParams = await params;

  try {
    const payments = await prisma.accountPayment.findMany({
      where: {
        customerId: resolvedParams.id,
        customer: { companyId: tenant.companyId }
      },
      include: {
        user: { select: { name: true } },
        cashRegister: { select: { branch: { select: { name: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(payments);
  } catch (error) {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

/**
 * POST: Registrar un nuevo abono a cuenta por cobrar
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  const resolvedParams = await params;

  try {
    const body = await req.json();
    const parsed = PaymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }

    const { amount, method, reference, notes, currency: bodyCurrency } = parsed.data;
    const guardedAmount = new Prisma.Decimal(amount);

    // 1. Verificar si hay caja abierta para ingresos en efectivo
    let activeRegisterId = null;
    if (method === 'CASH') {
       const activeRegister = await prisma.cashRegister.findFirst({
         where: {
           userId: tenant.userId,
           status: 'OPEN',
           branch: { companyId: tenant.companyId },
         },
       });
       if (!activeRegister) {
         return NextResponse.json({ error: 'No tienes un turno de caja abierto para recibir pagos en efectivo.' }, { status: 400 });
       }
       activeRegisterId = activeRegister.id;
    }

    // 2. Transacción Atómica
    const payment = await prisma.$transaction(async (tx) => {
      // Verificar cliente y saldo actual
      const customer = await tx.customer.findUnique({
        where: { id: resolvedParams.id, companyId: tenant.companyId }
      });

      if (!customer) throw new Error('Cliente no encontrado');
      if (Number(customer.balance) < amount) {
        throw new Error('El abono supera el saldo deudor del cliente');
      }

      // Fase 21 · Multi-moneda. Resolver la currency del cobro:
      //   1) body.currency si vino explícito,
      //   2) la moneda de la venta a crédito más reciente del cliente,
      //   3) GTQ funcional.
      // La venta original aporta `exchangeRate` (snapshot al facturar). El
      // cobro snapshotea el rate vigente "hoy" y compara para calcular FX.
      // Mutable: si bodyCurrency es null y encontramos una venta a crédito
      // reciente, adoptamos la currency de la venta como referencia.
      // eslint-disable-next-line prefer-const
      let resolvedCurrency = normalizeCurrency(bodyCurrency ?? FUNCTIONAL_CURRENCY);
      let originalRate: number | null = null;
      if (!bodyCurrency) {
        const latestCreditSale = (await tx.sale.findFirst({
          where: ({
            companyId: tenant.companyId,
            customerId: resolvedParams.id,
            payments: { some: { method: 'CREDIT' } },
          } as never),
          orderBy: { createdAt: 'desc' },
          select: ({ currency: true, exchangeRate: true } as never),
        })) as unknown as { currency?: string | null; exchangeRate?: unknown } | null;
        if (latestCreditSale?.currency) {
          resolvedCurrency = normalizeCurrency(latestCreditSale.currency);
          if (latestCreditSale.exchangeRate != null) {
            originalRate = Number(latestCreditSale.exchangeRate);
          }
        }
      } else {
        // El caller fijó la currency: igualmente buscamos la venta más
        // reciente en esa currency para tomar su rate como referencia
        // de la diferencia cambiaria.
        const matchSale = (await tx.sale.findFirst({
          where: ({
            companyId: tenant.companyId,
            customerId: resolvedParams.id,
            currency: resolvedCurrency,
            payments: { some: { method: 'CREDIT' } },
          } as never),
          orderBy: { createdAt: 'desc' },
          select: ({ exchangeRate: true } as never),
        })) as unknown as { exchangeRate?: unknown } | null;
        if (matchSale?.exchangeRate != null) {
          originalRate = Number(matchSale.exchangeRate);
        }
      }

      const currentRate = await getExchangeRate(
        tx as unknown as Parameters<typeof getExchangeRate>[0],
        tenant.companyId,
        resolvedCurrency,
        new Date(),
      );
      const paymentFunctional = toFunctionalAmount(amount, currentRate);

      // Crear el registro de abono (con snapshot del rate vigente).
      const newPayment = await tx.accountPayment.create({
        data: ({
          customerId: resolvedParams.id,
          userId: tenant.userId,
          cashRegisterId: activeRegisterId,
          amount,
          method,
          reference: reference || null,
          notes: notes || null,
          currency: resolvedCurrency,
          exchangeRate: currentRate,
          functionalAmount: paymentFunctional,
        } as never),
      });

      // Actualizar saldo del cliente (disminuye la deuda)
      const balanceUpdate = await tx.customer.updateMany({
        where: {
          id: resolvedParams.id,
          companyId: tenant.companyId,
          balance: { gte: guardedAmount },
        },
        data: {
          balance: { decrement: amount }
        }
      });

      if (balanceUpdate.count !== 1) {
        throw new Error('El saldo cambió mientras se procesaba el abono. Intenta de nuevo.');
      }

      // Asiento contable del cobro DENTRO del $transaction (H3):
      //   DR Caja (CASH) / Bancos (CARD|TRANSFER)  [GTQ funcional]
      //   CR Clientes (1.1.04) — disminuye la CxC  [GTQ funcional, original rate]
      //   DR/CR Diferencia cambiaria (Fase 21) si rate movió.
      //
      // Reglas (perspectiva cobro):
      //   - DR a Caja/Bancos por el monto que efectivamente entra (rate
      //     vigente al cobrar): functionalAmount calculado arriba.
      //   - CR a CxC por el equivalente GTQ que se generó en la factura
      //     original (originalRate × amount). Esto cancela la deuda en libros.
      //   - La diferencia (paymentFunctional - arOriginal) es la FX:
      //       + → FX_GAIN (Caja recibió más que la CxC libros)
      //       - → FX_LOSS
      //   Si currency=GTQ o no se conoce originalRate → originalRate ≈ currentRate
      //   y la diferencia es 0 (sin línea FX).
      const debitAccount = method === 'CASH' ? ACCOUNTS.CASH : ACCOUNTS.BANKS;
      const effectiveOriginalRate = originalRate ?? currentRate;
      const arOriginalAmount =
        Math.round(amount * effectiveOriginalRate * 100) / 100;
      const fx = calculateFxDifference({
        originalRate: effectiveOriginalRate,
        currentRate,
        foreignAmount: amount,
        side: 'COLLECTION',
        currency: resolvedCurrency,
      });

      const journalLines: Array<{
        accountCode: string;
        debit?: number;
        credit?: number;
        description?: string;
      }> = [
        { accountCode: debitAccount, debit: paymentFunctional, description: `Cobro ${method}` },
        { accountCode: ACCOUNTS.AR, credit: arOriginalAmount, description: 'Clientes (CxC)' },
      ];
      if (fx.gain > 0) {
        journalLines.push({
          accountCode: ACCOUNTS.FX_GAIN,
          credit: fx.gain,
          description: `Diferencia cambiaria positiva (${resolvedCurrency})`,
        });
      } else if (fx.loss > 0) {
        journalLines.push({
          accountCode: ACCOUNTS.FX_LOSS,
          debit: fx.loss,
          description: `Diferencia cambiaria negativa (${resolvedCurrency})`,
        });
      }

      await createJournalEntry(tx, {
        companyId: tenant.companyId,
        branchId: tenant.branchId,
        date: newPayment.createdAt,
        description: `Abono cliente ${customer.name} (${method})${reference ? ` Ref: ${reference}` : ''}`,
        referenceType: 'CUSTOMER_PAYMENT',
        referenceId: newPayment.id,
        userId: tenant.userId,
        lines: journalLines,
      });

      return newPayment;
    });

    // 3. Auditoría
    await createAuditLog({
      companyId: tenant.companyId,
      userId: tenant.userId,
      action: 'CUSTOMER_PAYMENT_RECORDED',
      entity: 'AccountPayment',
      entityId: payment.id,
      details: {
        amount,
        method,
        customerId: resolvedParams.id,
        newBalance: 'updated'
      }
    });

    return NextResponse.json(payment, { status: 201 });
    } catch (error) {
      console.error('Error recording payment:', error);
      if (error instanceof ExchangeRateError) {
        return NextResponse.json(
          { error: error.message, code: 'EXCHANGE_RATE_NOT_FOUND' },
          { status: error.status },
        );
      }
    return NextResponse.json({ error: getErrorMessage(error, 'Error al procesar el abono') }, { status: 500 });
  }
}
