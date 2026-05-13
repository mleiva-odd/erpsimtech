/**
 * Catálogo de permisos VÁLIDOS que un rol puede tener.
 *
 * Este es el único lugar donde se define qué permisos existen. Los endpoints
 * que crean/editan custom roles deben validar contra esta lista para que
 * un admin de empresa no pueda inyectar permisos arbitrarios en la DB
 * (ej. `system:dropAllTables` o `companyId:override`) que un futuro check
 * mal escrito podría aceptar.
 */
export const VALID_PERMISSIONS = [
  // POS
  'pos:access',
  'pos:discount',

  // Sales
  'sales:view',
  'sales:void',

  // Inventory
  'inventory:view',
  'inventory:adjust',
  'inventory:transfer',

  // Purchases
  'purchases:view',
  'purchases:create',
  // Fase 19 · Compras enterprise (sub-acciones)
  'purchases:request',     // crear PurchaseRequest
  'purchases:approve',     // aprobar PR o PO arriba de threshold
  'purchases:receive',     // registrar GoodsReceivedNote
  'purchases:invoice',     // registrar SupplierInvoice
  'purchases:credit-note', // registrar SupplierCreditNote

  // Treasury
  'treasury:view',
  'treasury:manage',

  // Reports
  'reports:view',
  'reports:export',

  // Customers / Suppliers
  'customers:view',
  'customers:manage',
  'suppliers:view',
  'suppliers:manage',

  // Settings
  'settings:manage',
  'users:manage',

  // HR / Payroll
  'hr:manage',
  'payroll:manage',

  // 'admin:all' es virtual: indica al motor de permisos que el rol tiene
  // acceso completo a la empresa. NO es para super admin de plataforma
  // (eso lo da role='SUPER_ADMIN' a nivel User).
  'admin:all',
] as const;

export type ValidPermission = (typeof VALID_PERMISSIONS)[number];

const VALID_SET = new Set<string>(VALID_PERMISSIONS);

export function isValidPermission(value: unknown): value is ValidPermission {
  return typeof value === 'string' && VALID_SET.has(value);
}

/**
 * Filtra una lista quedándose solo con las permisos válidos. Devuelve
 * `{ valid: [...] , invalid: [...] }` para que el caller decida si
 * rechaza el request o solo informa.
 */
export function partitionPermissions(input: unknown[]): {
  valid: ValidPermission[];
  invalid: string[];
} {
  const valid: ValidPermission[] = [];
  const invalid: string[] = [];
  for (const p of input) {
    if (isValidPermission(p)) valid.push(p);
    else if (typeof p === 'string') invalid.push(p);
    else invalid.push(String(p));
  }
  return { valid, invalid };
}
