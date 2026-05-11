import { Prisma, PrismaClient } from '@prisma/client';

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

interface CreateAccountingEntryData {
  companyId: string;
  branchId?: string | null;
  type: 'INCOME' | 'EXPENSE';
  categoryName: string;
  description: string;
  amount: number | Prisma.Decimal;
  referenceType?: string | null;
  referenceId?: string | null;
  bankTransactionId?: string | null;
  userId: string;
  date?: Date;
}

/**
 * Helper reutilizable para crear entradas contables.
 * Busca (o crea) la categoría por nombre y genera el registro.
 * Diseñado para usarse dentro de una $transaction de Prisma.
 */
export async function createAccountingEntry(
  tx: TxClient,
  data: CreateAccountingEntryData
) {
  // Buscar o crear la categoría contable
  let category = await tx.accountingCategory.findFirst({
    where: {
      companyId: data.companyId,
      name: data.categoryName,
    },
  });

  if (!category) {
    category = await tx.accountingCategory.create({
      data: {
        companyId: data.companyId,
        name: data.categoryName,
        type: data.type,
        isSystem: true,
      },
    });
  }

  const entry = await tx.accountingEntry.create({
    data: {
      companyId: data.companyId,
      branchId: data.branchId || null,
      categoryId: category.id,
      type: data.type,
      description: data.description,
      amount: typeof data.amount === 'number'
        ? new Prisma.Decimal(data.amount)
        : data.amount,
      referenceType: data.referenceType || null,
      referenceId: data.referenceId || null,
      bankTransactionId: data.bankTransactionId || null,
      date: data.date || new Date(),
      userId: data.userId,
    },
  });

  return entry;
}

/**
 * Helper para crear una entrada contable FUERA de una transacción.
 * Útil para tareas asíncronas post-transacción.
 */
export async function createAccountingEntryAsync(
  prisma: PrismaClient,
  data: CreateAccountingEntryData
) {
  try {
    return await createAccountingEntry(prisma, data);
  } catch (error) {
    // No fallar silenciosamente pero tampoco bloquear el flujo principal
    console.error('[Accounting] Error creando entrada contable:', error);
    return null;
  }
}

/**
 * Categorías contables predeterminadas del sistema.
 * Se crean al inicializar una nueva empresa.
 */
export const SYSTEM_CATEGORIES = {
  INCOME: [
    'Ventas POS',
    'Ventas Remotas',
    'Abonos de Clientes',
    'Otros Ingresos',
  ],
  EXPENSE: [
    'Compras de Inventario',
    'Nómina y Salarios',
    'Alquiler',
    'Servicios Básicos',
    'Publicidad',
    'Transporte',
    'Devoluciones',
    'Retiros de Caja',
    'Pagos a Proveedores',
    'Otros Gastos',
  ],
} as const;

/**
 * Inicializa las categorías contables del sistema para una empresa nueva.
 */
export async function initializeAccountingCategories(
  prisma: PrismaClient,
  companyId: string
) {
  const categories = [
    ...SYSTEM_CATEGORIES.INCOME.map((name) => ({
      companyId,
      name,
      type: 'INCOME' as const,
      isSystem: true,
    })),
    ...SYSTEM_CATEGORIES.EXPENSE.map((name) => ({
      companyId,
      name,
      type: 'EXPENSE' as const,
      isSystem: true,
    })),
  ];

  // Upsert para ser idempotente
  for (const cat of categories) {
    await prisma.accountingCategory.upsert({
      where: {
        companyId_name: {
          companyId: cat.companyId,
          name: cat.name,
        },
      },
      update: {},
      create: cat,
    });
  }
}
