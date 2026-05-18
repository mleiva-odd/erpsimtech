/**
 * Fase 25-3a · Fixtures para integration tests.
 *
 * Helpers reusables que crean entidades mínimas en la DB de test (empresa,
 * sucursal, usuario, producto, empleado, etc). Cada función acepta overrides
 * opcionales y devuelve el record creado.
 *
 * Convenciones:
 *  - Cada test recibe data fresca (afterEach hace TRUNCATE — fixtures.ts no
 *    cachea nada).
 *  - Defaults sensatos: empresa "Test Co", NIT 12345678, branch "Principal",
 *    empleado Q5000 mensual IGSS afiliado.
 *  - NUNCA usar en runtime (solo tests). El path `src/test-utils/` no se
 *    incluye en el bundle de Next.
 */

import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

let counter = 0;
const nextId = () => ++counter;

export interface CreateCompanyOptions {
  name?: string;
  slug?: string;
  email?: string;
  nit?: string;
}

/** Crea una Company de test con defaults sensatos. */
export async function createTestCompany(opts: CreateCompanyOptions = {}) {
  const n = nextId();
  return prisma.company.create({
    data: {
      name: opts.name ?? `Test Co ${n}`,
      slug: opts.slug ?? `test-co-${n}-${Date.now()}`,
      email: opts.email ?? `test${n}@example.com`,
      nit: opts.nit ?? `1234567${n}`,
    },
  });
}

export interface CreateBranchOptions {
  name?: string;
  code?: string;
  isMain?: boolean;
}

export async function createTestBranch(
  companyId: string,
  opts: CreateBranchOptions = {},
) {
  const n = nextId();
  return prisma.branch.create({
    data: {
      companyId,
      name: opts.name ?? 'Principal',
      code: opts.code ?? `BR${n}`,
      isMain: opts.isMain ?? true,
    },
  });
}

export interface CreateUserOptions {
  email?: string;
  password?: string;
  name?: string;
  /** El enum `Role` solo tiene SUPER_ADMIN | USER. Permisos finos se manejan
   *  vía `CustomRole`. Default USER (caso típico). */
  role?: 'SUPER_ADMIN' | 'USER';
  branchId?: string | null;
}

export async function createTestUser(
  companyId: string,
  opts: CreateUserOptions = {},
) {
  const n = nextId();
  const password = await bcrypt.hash(opts.password ?? 'TestPass123!', 10);
  return prisma.user.create({
    data: {
      companyId,
      branchId: opts.branchId ?? null,
      email: opts.email ?? `user${n}-${Date.now()}@example.com`,
      name: opts.name ?? `Test User ${n}`,
      password,
      role: opts.role ?? 'USER',
    },
  });
}

export interface CreateProductOptions {
  name?: string;
  sku?: string;
  price?: number;
  cost?: number;
  /** Product no tiene taxRate directo — el IVA se setea por línea en
   *  SaleItem.taxRate. Si querés un producto exento, pasá `isTaxExempt: true`. */
  isTaxExempt?: boolean;
}

export async function createTestProduct(
  companyId: string,
  categoryId: string,
  opts: CreateProductOptions = {},
) {
  const n = nextId();
  return prisma.product.create({
    data: {
      companyId,
      categoryId,
      name: opts.name ?? `Producto ${n}`,
      sku: opts.sku ?? `SKU-${n}-${Date.now()}`,
      price: new Prisma.Decimal(opts.price ?? 100),
      cost: new Prisma.Decimal(opts.cost ?? 60),
      isTaxExempt: opts.isTaxExempt ?? false,
    },
  });
}

export async function createTestCategory(companyId: string, name = 'General') {
  return prisma.category.create({
    data: { companyId, name },
  });
}

/** Crea un ProductStock para un producto+branch. `quantity` es Int (no Decimal). */
export async function createTestProductStock(
  productId: string,
  branchId: string,
  quantity = 0,
) {
  return prisma.productStock.create({
    data: {
      productId,
      branchId,
      quantity, // Int @default(0)
    },
  });
}

export interface CreateEmployeeOptions {
  firstName?: string;
  lastName?: string;
  baseSalary?: number;
  bonusIncentive?: number;
  igssAffiliated?: boolean;
  payrollFrequency?: 'MONTHLY' | 'BIWEEKLY';
  hireDate?: Date;
}

export async function createTestEmployee(
  companyId: string,
  branchId: string | null,
  opts: CreateEmployeeOptions = {},
) {
  const n = nextId();
  return prisma.employee.create({
    data: {
      companyId,
      branchId,
      firstName: opts.firstName ?? `Empleado${n}`,
      lastName: opts.lastName ?? 'Test',
      baseSalary: new Prisma.Decimal(opts.baseSalary ?? 5000),
      bonusIncentive: new Prisma.Decimal(opts.bonusIncentive ?? 250),
      igssAffiliated: opts.igssAffiliated ?? true,
      payrollFrequency: (opts.payrollFrequency ?? 'MONTHLY') as never,
      hireDate: opts.hireDate ?? new Date('2024-01-01'),
    },
  });
}

/**
 * Crea el grafo mínimo (Company + Branch + User + Category) que la mayoría
 * de tests necesitan. Útil como "base" antes de crear entidades específicas.
 */
export async function createTestBase() {
  const company = await createTestCompany();
  const branch = await createTestBranch(company.id);
  const user = await createTestUser(company.id, { branchId: branch.id });
  const category = await createTestCategory(company.id);
  return { company, branch, user, category };
}

// ─────────────────────────────────────────
// FEL fixtures (Fase 25-3d).
// ─────────────────────────────────────────

export interface CreateTaxSeriesOptions {
  prefix?: string;
  documentType?: 'FACT' | 'NCRE' | 'NDEB';
  nextNumber?: number;
  rangeFrom?: number | null;
  rangeTo?: number | null;
  authorization?: string | null;
  active?: boolean;
}

/**
 * Crea una TaxSeries autorizada SAT para tests de FEL.
 * Default: serie "A" para facturas, nextNumber=1, sin rango.
 */
export async function createTestTaxSeries(
  companyId: string,
  branchId: string,
  opts: CreateTaxSeriesOptions = {},
) {
  return prisma.taxSeries.create({
    data: {
      companyId,
      branchId,
      documentType: (opts.documentType ?? 'FACT') as never,
      prefix: opts.prefix ?? 'A',
      nextNumber: opts.nextNumber ?? 1,
      rangeFrom: opts.rangeFrom ?? null,
      rangeTo: opts.rangeTo ?? null,
      authorization: opts.authorization ?? null,
      active: opts.active ?? true,
    },
  });
}

// ─────────────────────────────────────────
// Customer + Credit Sale fixtures (Fase 25-3c).
// ─────────────────────────────────────────

export interface CreateCustomerOptions {
  name?: string;
  email?: string;
  nit?: string;
  balance?: number;
  creditDaysDefault?: number;
  maxOverdueDays?: number;
}

export async function createTestCustomer(
  companyId: string,
  opts: CreateCustomerOptions = {},
) {
  const n = nextId();
  return prisma.customer.create({
    data: {
      companyId,
      name: opts.name ?? `Cliente Test ${n}`,
      email: opts.email,
      nit: opts.nit,
      balance: new Prisma.Decimal(opts.balance ?? 0),
      creditDaysDefault: opts.creditDaysDefault ?? 30,
      maxOverdueDays: opts.maxOverdueDays ?? 30,
    },
  });
}

export interface CreateCreditSaleOptions {
  total?: number;
  dueDate?: Date | null;
  invoiceNumber?: string;
  status?: 'COMPLETED' | 'OVERDUE' | 'PENDING' | 'CANCELLED';
  /** Default 'CREDIT'. Para tests que necesitan ventas cash usar 'CASH'. */
  paymentMethod?: 'CASH' | 'CARD' | 'TRANSFER' | 'CREDIT';
}

/**
 * Crea una venta + un Payment asociado. Por default es venta a crédito
 * (method=CREDIT) con dueDate=hoy+30. Override con `opts`.
 */
export async function createTestCreditSale(
  companyId: string,
  branchId: string,
  userId: string,
  customerId: string,
  opts: CreateCreditSaleOptions = {},
) {
  const n = nextId();
  const total = opts.total ?? 1000;
  const dueDate =
    opts.dueDate === null
      ? null
      : opts.dueDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return prisma.sale.create({
    data: {
      companyId,
      branchId,
      userId,
      customerId,
      invoiceNumber: opts.invoiceNumber ?? `INV-${n}-${Date.now()}`,
      subtotal: new Prisma.Decimal(total),
      total: new Prisma.Decimal(total),
      status: (opts.status ?? 'COMPLETED') as never,
      dueDate,
      payments: {
        create: {
          method: (opts.paymentMethod ?? 'CREDIT') as never,
          amount: new Prisma.Decimal(total),
        },
      },
    },
  });
}

// ─────────────────────────────────────────
// Payroll fixtures (Fase 25-3b).
// ─────────────────────────────────────────

export interface CreatePayrollOptions {
  name?: string;
  startDate?: Date;
  endDate?: Date;
  payrollType?: 'REGULAR' | 'BONO14' | 'AGUINALDO' | 'INDEMNIZACION' | 'EXTRAORDINARIA';
  status?: 'DRAFT' | 'APPROVED' | 'PAID' | 'CANCELLED';
}

/** Crea un Payroll en estado DRAFT con totales en 0 (se actualizan al recalcular). */
export async function createTestPayroll(
  companyId: string,
  opts: CreatePayrollOptions = {},
) {
  const n = nextId();
  return prisma.payroll.create({
    data: {
      companyId,
      name: opts.name ?? `Planilla Test ${n}`,
      startDate: opts.startDate ?? new Date('2026-05-01'),
      endDate: opts.endDate ?? new Date('2026-05-31'),
      payrollType: (opts.payrollType ?? 'REGULAR') as never,
      status: (opts.status ?? 'DRAFT') as never,
      totalGross: new Prisma.Decimal(0),
      totalDeductions: new Prisma.Decimal(0),
      totalNet: new Prisma.Decimal(0),
    },
  });
}

export interface CreatePayrollItemOptions {
  baseSalary?: number;
  bonusIncentive?: number;
  daysWorked?: number;
  totalGross?: number;
  igssLaboral?: number;
  isr?: number;
  loanDeduction?: number;
  otherDeductions?: number;
  totalDeductions?: number;
  netSalary?: number;
  bono14Provision?: number;
  aguinaldoProvision?: number;
  indemnizacionProvision?: number;
  vacacionesProvision?: number;
  igssPatronal?: number;
  irtra?: number;
  intecap?: number;
  totalCostoPatronal?: number;
}

/**
 * Crea un PayrollItem con valores realistas (Q5000 base, sin h.extras).
 * Override cualquier campo con `opts`. NO recalcula totales — el caller debe
 * pasar valores consistentes si valida balance DR=CR.
 */
export async function createTestPayrollItem(
  payrollId: string,
  employeeId: string,
  opts: CreatePayrollItemOptions = {},
) {
  const base = opts.baseSalary ?? 5000;
  const bonus = opts.bonusIncentive ?? 250;
  const totalGross = opts.totalGross ?? base + bonus;
  const igssLab = opts.igssLaboral ?? Math.round(base * 0.0483 * 100) / 100;
  const isr = opts.isr ?? 0;
  const totalDed = opts.totalDeductions ?? igssLab + isr;
  return prisma.payrollItem.create({
    data: {
      payrollId,
      employeeId,
      baseSalary: new Prisma.Decimal(base),
      bonusIncentive: new Prisma.Decimal(bonus),
      daysWorked: opts.daysWorked ?? 30,
      totalGross: new Prisma.Decimal(totalGross),
      igssLaboral: new Prisma.Decimal(igssLab),
      isr: new Prisma.Decimal(isr),
      loanDeduction: new Prisma.Decimal(opts.loanDeduction ?? 0),
      otherDeductions: new Prisma.Decimal(opts.otherDeductions ?? 0),
      totalDeductions: new Prisma.Decimal(totalDed),
      netSalary: new Prisma.Decimal(opts.netSalary ?? totalGross - totalDed),
      bono14Provision: new Prisma.Decimal(opts.bono14Provision ?? Math.round((base / 12) * 100) / 100),
      aguinaldoProvision: new Prisma.Decimal(opts.aguinaldoProvision ?? Math.round((base / 12) * 100) / 100),
      indemnizacionProvision: new Prisma.Decimal(opts.indemnizacionProvision ?? Math.round((base / 12) * 100) / 100),
      vacacionesProvision: new Prisma.Decimal(opts.vacacionesProvision ?? Math.round((base / 24) * 100) / 100),
      igssPatronal: new Prisma.Decimal(opts.igssPatronal ?? Math.round(base * 0.1067 * 100) / 100),
      irtra: new Prisma.Decimal(opts.irtra ?? Math.round(base * 0.01 * 100) / 100),
      intecap: new Prisma.Decimal(opts.intecap ?? Math.round(base * 0.01 * 100) / 100),
      totalCostoPatronal: new Prisma.Decimal(
        opts.totalCostoPatronal ?? Math.round(base * 0.1267 * 100) / 100,
      ),
    },
  });
}
