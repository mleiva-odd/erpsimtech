/**
 * Fase 22d-2 · Registro de comandos del Command Palette (Cmd+K).
 *
 * Catálogo declarativo de páginas y acciones rápidas que se exponen al
 * usuario al abrir el palette. Se mantiene aislado de la UI para poder:
 *   - Hacer pruebas unitarias del fuzzy matcher sin React/DOM.
 *   - Re-usar el catálogo desde otros lugares (ej. ayuda contextual).
 *
 * El icono se modela como `LucideIcon` (el componente), no como un
 * elemento JSX, para que este archivo sea `.ts` puro (sin JSX) y a la
 * vez sea estrictamente tipado.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Home,
  Store,
  ReceiptText,
  FileText,
  Calculator,
  HandCoins,
  CreditCard,
  Landmark,
  Truck,
  Inbox,
  ArrowRightLeft,
  Package,
  Users,
  Building2,
  Settings,
  Shield,
  Activity,
  Bell,
  BarChart3,
  Wallet,
  ClipboardCheck,
  Palmtree,
  Key,
  TrendingUp,
  DollarSign,
  RefreshCcw,
  Plus,
  FileBarChart,
  FileSpreadsheet,
  ClipboardList,
  Tags,
  Hourglass,
} from 'lucide-react';

export type CommandCategory = 'pages' | 'actions' | 'recent' | 'entities';

/**
 * Comando que se renderiza dentro del Command Palette.
 *
 * - `icon` es el COMPONENTE Lucide (no un ReactElement). Se instancia en
 *   el render del palette. Eso permite mantener este archivo libre de
 *   JSX y type-safe.
 * - `perform` es invocado al hacer Enter o click. Recibe un `router`
 *   tipo Next.js para navegar; cualquier callback custom puede ignorar
 *   el argumento.
 * - `permissions` actúa como filtro inclusivo: si está definido, el
 *   usuario debe tener AL MENOS UNO de los permisos listados (`OR`
 *   semántico, consistente con cómo el sidebar gatea secciones).
 *   SUPER_ADMIN y `admin:all` siempre pasan, sin importar la lista.
 */
export interface Command {
  id: string;
  category: CommandCategory;
  title: string;
  description?: string;
  icon: LucideIcon;
  keywords?: string[];
  shortcut?: string;
  perform: (router: CommandRouter) => void;
  permissions?: string[];
}

/**
 * Subset de la API de `next/navigation` router que necesitan los
 * comandos. Definirlo aquí permite testear comandos sin mockear todo
 * `next/navigation`.
 */
export interface CommandRouter {
  push: (href: string) => void;
}

/* ------------------------------------------------------------------ */
/* Páginas                                                             */
/* ------------------------------------------------------------------ */

const PAGE_COMMANDS: Command[] = [
  {
    id: 'page:dashboard',
    category: 'pages',
    title: 'Inicio',
    description: 'Resumen general del negocio',
    icon: Home,
    keywords: ['home', 'dashboard', 'inicio', 'principal'],
    perform: (r) => r.push('/dashboard'),
  },
  {
    id: 'page:pos',
    category: 'pages',
    title: 'POS',
    description: 'Punto de venta',
    icon: Store,
    keywords: ['punto de venta', 'caja', 'vender'],
    perform: (r) => r.push('/pos'),
  },
  {
    id: 'page:sales',
    category: 'pages',
    title: 'Ventas',
    description: 'Historial de ventas',
    icon: ReceiptText,
    keywords: ['historial', 'facturas', 'remotas'],
    permissions: ['sales:view', 'reports:view'],
    perform: (r) => r.push('/sales'),
  },
  {
    id: 'page:delivery-notes',
    category: 'pages',
    title: 'Notas de Entrega',
    description: 'Despachos y entregas',
    icon: FileText,
    keywords: ['delivery', 'envios', 'despacho'],
    permissions: ['sales:view'],
    perform: (r) => r.push('/sales/delivery-notes'),
  },
  {
    id: 'page:commissions',
    category: 'pages',
    title: 'Comisiones',
    description: 'Comisiones por vendedor',
    icon: HandCoins,
    keywords: ['vendedores', 'comision'],
    permissions: ['sales:view', 'reports:view'],
    perform: (r) => r.push('/sales/commissions'),
  },
  {
    id: 'page:commission-rules',
    category: 'pages',
    title: 'Reglas de Comisiones',
    description: 'Configurar comisiones',
    icon: Tags,
    keywords: ['reglas', 'comision'],
    permissions: ['sales:view', 'settings:manage'],
    perform: (r) => r.push('/sales/commission-rules'),
  },
  {
    id: 'page:pricing',
    category: 'pages',
    title: 'Listas y Promociones',
    description: 'Precios, promos y cupones',
    icon: Tags,
    keywords: ['precios', 'pricing', 'promociones', 'cupones'],
    permissions: ['sales:view', 'settings:manage'],
    perform: (r) => r.push('/pricing'),
  },
  {
    id: 'page:purchases',
    category: 'pages',
    title: 'Compras',
    description: 'Ingresos por compras',
    icon: Inbox,
    keywords: ['compras', 'proveedores'],
    permissions: ['purchases:view', 'purchases:create'],
    perform: (r) => r.push('/purchases'),
  },
  {
    id: 'page:purchase-requests',
    category: 'pages',
    title: 'Solicitudes de Compra',
    description: 'Requisiciones internas',
    icon: ClipboardList,
    keywords: ['requisicion', 'pedido', 'requests'],
    permissions: ['purchases:view', 'purchases:create'],
    perform: (r) => r.push('/purchases/requests'),
  },
  {
    id: 'page:rfq',
    category: 'pages',
    title: 'RFQ',
    description: 'Solicitudes de cotización',
    icon: FileText,
    keywords: ['cotizacion', 'rfq', 'quote'],
    permissions: ['purchases:view', 'purchases:create'],
    perform: (r) => r.push('/purchases/rfq'),
  },
  {
    id: 'page:inventory',
    category: 'pages',
    title: 'Inventario',
    description: 'Stock y productos',
    icon: Package,
    keywords: ['stock', 'productos', 'bodega'],
    permissions: ['inventory:view'],
    perform: (r) => r.push('/inventory'),
  },
  {
    id: 'page:stock-transfers',
    category: 'pages',
    title: 'Transferencias',
    description: 'Traslados de inventario',
    icon: ArrowRightLeft,
    keywords: ['traslados', 'transfer', 'movimientos'],
    permissions: ['inventory:transfer'],
    perform: (r) => r.push('/stock-transfers'),
  },
  {
    id: 'page:accounting',
    category: 'pages',
    title: 'Contabilidad',
    description: 'Contabilidad general',
    icon: Calculator,
    keywords: ['contabilidad', 'asientos', 'libro'],
    permissions: ['treasury:view', 'treasury:manage'],
    perform: (r) => r.push('/accounting'),
  },
  {
    id: 'page:banks',
    category: 'pages',
    title: 'Tesorería y Bancos',
    description: 'Cuentas bancarias y caja',
    icon: Landmark,
    keywords: ['bancos', 'tesoreria', 'caja'],
    permissions: ['treasury:view', 'treasury:manage'],
    perform: (r) => r.push('/accounting/banks'),
  },
  {
    id: 'page:exchange-rates',
    category: 'pages',
    title: 'Tipos de Cambio',
    description: 'FX y BANGUAT',
    icon: RefreshCcw,
    keywords: ['fx', 'tipos de cambio', 'banguat', 'tasas', 'dolar'],
    permissions: ['treasury:view', 'treasury:manage'],
    perform: (r) => r.push('/accounting/exchange-rates'),
  },
  {
    id: 'page:receivables',
    category: 'pages',
    title: 'Cuentas por Cobrar',
    description: 'CxC pendientes',
    icon: HandCoins,
    keywords: ['cxc', 'cobrar', 'clientes', 'cobranza'],
    permissions: ['treasury:view', 'treasury:manage'],
    perform: (r) => r.push('/accounting/receivables'),
  },
  {
    id: 'page:payables',
    category: 'pages',
    title: 'Cuentas por Pagar',
    description: 'CxP pendientes',
    icon: CreditCard,
    keywords: ['cxp', 'pagar', 'proveedores'],
    permissions: ['treasury:view', 'treasury:manage'],
    perform: (r) => r.push('/accounting/payables'),
  },
  {
    id: 'page:receivables-aging',
    category: 'pages',
    title: 'Antigüedad CxC',
    description: 'Aging de cuentas por cobrar',
    icon: Hourglass,
    keywords: ['aging', 'antiguedad', 'cxc'],
    permissions: ['treasury:view', 'treasury:manage'],
    perform: (r) => r.push('/accounting/receivables/aging'),
  },
  {
    id: 'page:payables-aging',
    category: 'pages',
    title: 'Antigüedad CxP',
    description: 'Aging de cuentas por pagar',
    icon: Hourglass,
    keywords: ['aging', 'antiguedad', 'cxp'],
    permissions: ['treasury:view', 'treasury:manage'],
    perform: (r) => r.push('/accounting/payables/aging'),
  },
  {
    id: 'page:accounting-reports',
    category: 'pages',
    title: 'Reportes Contables',
    description: 'Estados financieros',
    icon: FileBarChart,
    keywords: ['reportes', 'contables', 'balance', 'estado'],
    permissions: ['treasury:view', 'reports:view'],
    perform: (r) => r.push('/accounting/reports'),
  },
  {
    id: 'page:customers',
    category: 'pages',
    title: 'Clientes',
    description: 'Directorio de clientes',
    icon: Users,
    keywords: ['clientes', 'customers', 'directorio'],
    perform: (r) => r.push('/customers'),
  },
  {
    id: 'page:suppliers',
    category: 'pages',
    title: 'Proveedores',
    description: 'Directorio de proveedores',
    icon: Truck,
    keywords: ['proveedores', 'suppliers'],
    permissions: ['suppliers:view', 'suppliers:manage', 'purchases:view'],
    perform: (r) => r.push('/suppliers'),
  },
  {
    id: 'page:branches',
    category: 'pages',
    title: 'Sucursales',
    description: 'Gestión de sucursales',
    icon: Building2,
    keywords: ['sucursales', 'tiendas', 'puntos'],
    permissions: ['settings:manage'],
    perform: (r) => r.push('/branches'),
  },
  {
    id: 'page:hr-employees',
    category: 'pages',
    title: 'Empleados',
    description: 'Personal de la empresa',
    icon: Users,
    keywords: ['personal', 'empleados', 'rh', 'rrhh'],
    permissions: ['hr:manage'],
    perform: (r) => r.push('/hr/employees'),
  },
  {
    id: 'page:hr-payroll',
    category: 'pages',
    title: 'Planillas',
    description: 'Nóminas y pagos',
    icon: Wallet,
    keywords: ['planilla', 'nomina', 'sueldos'],
    permissions: ['payroll:manage'],
    perform: (r) => r.push('/hr/payroll'),
  },
  {
    id: 'page:hr-attendance',
    category: 'pages',
    title: 'Asistencia',
    description: 'Control de asistencia',
    icon: ClipboardCheck,
    keywords: ['asistencia', 'marcaje', 'horas'],
    permissions: ['hr:manage'],
    perform: (r) => r.push('/hr/attendance'),
  },
  {
    id: 'page:hr-leaves',
    category: 'pages',
    title: 'Permisos',
    description: 'Vacaciones y permisos',
    icon: Palmtree,
    keywords: ['vacaciones', 'permisos', 'leaves'],
    permissions: ['hr:manage'],
    perform: (r) => r.push('/hr/leaves'),
  },
  {
    id: 'page:hr-loans',
    category: 'pages',
    title: 'Préstamos',
    description: 'Préstamos a empleados',
    icon: HandCoins,
    keywords: ['prestamos', 'anticipos'],
    permissions: ['hr:manage', 'payroll:manage'],
    perform: (r) => r.push('/hr/loans'),
  },
  {
    id: 'page:reports',
    category: 'pages',
    title: 'Reportes',
    description: 'Centro de reportes',
    icon: BarChart3,
    keywords: ['reportes', 'analytics'],
    permissions: ['reports:view'],
    perform: (r) => r.push('/reports'),
  },
  {
    id: 'page:reports-sales',
    category: 'pages',
    title: 'Reporte de Ventas',
    description: 'Analítica de ventas',
    icon: TrendingUp,
    keywords: ['ventas', 'reporte'],
    permissions: ['reports:view', 'sales:view'],
    perform: (r) => r.push('/reports/sales'),
  },
  {
    id: 'page:reports-inventory',
    category: 'pages',
    title: 'Reporte de Inventario',
    description: 'Analítica de stock',
    icon: Package,
    keywords: ['inventario', 'stock', 'reporte'],
    permissions: ['reports:view', 'inventory:view'],
    perform: (r) => r.push('/reports/inventory'),
  },
  {
    id: 'page:reports-tax',
    category: 'pages',
    title: 'Reporte Tributario',
    description: 'SAT y libros fiscales',
    icon: FileSpreadsheet,
    keywords: ['sat', 'tributario', 'impuestos', 'iva'],
    permissions: ['reports:view', 'treasury:manage'],
    perform: (r) => r.push('/reports/tax'),
  },
  {
    id: 'page:notifications',
    category: 'pages',
    title: 'Notificaciones',
    description: 'Bandeja de avisos',
    icon: Bell,
    keywords: ['notificaciones', 'avisos', 'alertas'],
    perform: (r) => r.push('/notifications'),
  },
  {
    id: 'page:audit',
    category: 'pages',
    title: 'Auditoría',
    description: 'Historial de cambios',
    icon: Activity,
    keywords: ['auditoria', 'log', 'historial'],
    permissions: ['settings:manage'],
    perform: (r) => r.push('/audit'),
  },
  {
    id: 'page:users',
    category: 'pages',
    title: 'Usuarios',
    description: 'Equipo de la empresa',
    icon: Users,
    keywords: ['equipo', 'usuarios', 'staff'],
    permissions: ['users:manage', 'settings:manage'],
    perform: (r) => r.push('/users'),
  },
  {
    id: 'page:roles',
    category: 'pages',
    title: 'Roles',
    description: 'Roles y permisos',
    icon: Key,
    keywords: ['roles', 'permisos', 'accesos'],
    permissions: ['users:manage', 'settings:manage'],
    perform: (r) => r.push('/users/roles'),
  },
  {
    id: 'page:settings',
    category: 'pages',
    title: 'Configuración',
    description: 'Ajustes generales',
    icon: Settings,
    keywords: ['ajustes', 'config', 'settings'],
    permissions: ['settings:manage'],
    perform: (r) => r.push('/settings'),
  },
  {
    id: 'page:admin',
    category: 'pages',
    title: 'Panel Global',
    description: 'Gestión SaaS (SUPER_ADMIN)',
    icon: Shield,
    keywords: ['admin', 'saas', 'global', 'empresas'],
    // Filtramos por rol SUPER_ADMIN en `filterCommandsByPermissions`.
    permissions: ['__super_admin_only__'],
    perform: (r) => r.push('/admin'),
  },
];

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

const ACTION_COMMANDS: Command[] = [
  {
    id: 'action:new-sale',
    category: 'actions',
    title: 'Nueva venta',
    description: 'Abrir POS para vender',
    icon: Plus,
    keywords: ['vender', 'nueva venta', 'pos', 'caja'],
    shortcut: 'V',
    perform: (r) => r.push('/pos'),
  },
  {
    id: 'action:new-remote-sale',
    category: 'actions',
    title: 'Nueva venta remota',
    description: 'Crear venta sin POS',
    icon: Plus,
    keywords: ['venta remota', 'factura', 'nueva venta'],
    permissions: ['sales:view'],
    perform: (r) => r.push('/sales/new'),
  },
  {
    id: 'action:new-rfq',
    category: 'actions',
    title: 'Nueva RFQ',
    description: 'Solicitud de cotización',
    icon: Plus,
    keywords: ['rfq', 'cotizacion', 'nueva'],
    permissions: ['purchases:create', 'purchases:view'],
    perform: (r) => r.push('/purchases/rfq/new'),
  },
  {
    id: 'action:capture-fx',
    category: 'actions',
    title: 'Capturar tasa de cambio',
    description: 'Registrar FX del día',
    icon: DollarSign,
    keywords: ['fx', 'tipo de cambio', 'banguat', 'tasa'],
    permissions: ['treasury:manage', 'treasury:view'],
    perform: (r) => r.push('/accounting/exchange-rates?action=new'),
  },
  {
    id: 'action:sync-banguat',
    category: 'actions',
    title: 'Sincronizar BANGUAT',
    description: 'Obtener tipos de cambio oficiales',
    icon: RefreshCcw,
    keywords: ['banguat', 'sincronizar', 'sync', 'fx'],
    permissions: ['treasury:manage'],
    perform: (r) => r.push('/accounting/exchange-rates?action=sync'),
  },
  {
    id: 'action:cash-close',
    category: 'actions',
    title: 'Cerrar caja',
    description: 'Cierre del día en POS',
    icon: Wallet,
    keywords: ['cerrar caja', 'cierre', 'pos', 'arqueo'],
    perform: (r) => r.push('/pos?action=close'),
  },
  {
    id: 'action:aging-receivables',
    category: 'actions',
    title: 'Antigüedad de Saldos (CxC)',
    description: 'Ver aging de cuentas por cobrar',
    icon: Hourglass,
    keywords: ['aging', 'antiguedad', 'cobrar'],
    permissions: ['treasury:view', 'treasury:manage'],
    perform: (r) => r.push('/accounting/receivables/aging'),
  },
];

/* ------------------------------------------------------------------ */
/* API pública                                                         */
/* ------------------------------------------------------------------ */

/**
 * Devuelve TODOS los comandos (sin filtrar por permisos). Pensado para
 * filtros downstream y para tests.
 */
export function getAllCommands(): Command[] {
  return [...PAGE_COMMANDS, ...ACTION_COMMANDS];
}

interface PermissionContext {
  role?: string | null;
  permissions: string[];
}

/**
 * Filtra el listado por contexto de sesión.
 *  - SUPER_ADMIN o permiso `admin:all` ven TODO.
 *  - Comandos sin `permissions` están abiertos a todos.
 *  - Comandos con `permissions` se muestran si el usuario tiene AL
 *    MENOS uno de los permisos listados (OR).
 *  - El sentinel `__super_admin_only__` restringe SOLO a SUPER_ADMIN.
 */
export function filterCommandsByPermissions(
  commands: Command[],
  ctx: PermissionContext,
): Command[] {
  const isSuper = ctx.role === 'SUPER_ADMIN';
  const hasAdminAll = ctx.permissions.includes('admin:all');
  return commands.filter((cmd) => {
    if (!cmd.permissions || cmd.permissions.length === 0) return true;
    if (cmd.permissions.includes('__super_admin_only__')) return isSuper;
    if (isSuper || hasAdminAll) return true;
    return cmd.permissions.some((p) => ctx.permissions.includes(p));
  });
}

/* ------------------------------------------------------------------ */
/* Fuzzy matcher                                                       */
/* ------------------------------------------------------------------ */

/**
 * Devuelve un score numérico (>= 0) para el match query→cmd, o `null`
 * si no hace match. Reglas:
 *  - Match fuzzy clásico: TODAS las letras del query aparecen EN ORDEN
 *    en el título (no necesariamente consecutivas).
 *  - Bonus si el match es al INICIO del título (prefijo).
 *  - Bonus si alguna `keyword` matchea como substring.
 *  - Penaliza la longitud del título (los más cortos suben).
 *  - Match en `description` también puede ayudar a desempatar.
 */
export function scoreCommand(cmd: Command, rawQuery: string): number | null {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return 0;

  const title = cmd.title.toLowerCase();
  const description = (cmd.description ?? '').toLowerCase();

  let score = 0;
  let matched = false;

  // 1. Prefijo en título (más fuerte).
  if (title.startsWith(q)) {
    score += 100;
    matched = true;
  } else if (title.includes(q)) {
    score += 60;
    matched = true;
  }

  // 2. Fuzzy clásico sobre el título: letras en orden.
  const fuzzyScore = fuzzySequenceScore(title, q);
  if (fuzzyScore !== null) {
    score += fuzzyScore;
    matched = true;
  }

  // 3. Keywords (substring).
  if (cmd.keywords) {
    for (const kw of cmd.keywords) {
      const k = kw.toLowerCase();
      if (k === q) {
        score += 80;
        matched = true;
      } else if (k.startsWith(q)) {
        score += 40;
        matched = true;
      } else if (k.includes(q)) {
        score += 20;
        matched = true;
      }
    }
  }

  // 4. Descripción (sólo desempate).
  if (description.includes(q)) {
    score += 5;
    matched = true;
  }

  if (!matched) return null;

  // 5. Penalización por longitud (suave). Títulos más cortos ganan.
  score -= Math.min(title.length, 40) * 0.2;

  return score;
}

/**
 * Recorre `haystack` y consume `needle` letra por letra en orden. Si
 * todas se encuentran, devuelve un score basado en cuán cerca quedaron
 * entre sí (menos huecos → mejor score). Devuelve null si no se pudo
 * consumir todo el needle.
 */
function fuzzySequenceScore(haystack: string, needle: string): number | null {
  if (!needle) return 0;
  let i = 0;
  let j = 0;
  let firstMatch = -1;
  let lastMatch = -1;
  let consecutive = 0;
  let bestConsecutive = 0;

  while (i < haystack.length && j < needle.length) {
    if (haystack[i] === needle[j]) {
      if (firstMatch === -1) firstMatch = i;
      if (lastMatch === i - 1) {
        consecutive += 1;
        if (consecutive > bestConsecutive) bestConsecutive = consecutive;
      } else {
        consecutive = 1;
        if (consecutive > bestConsecutive) bestConsecutive = consecutive;
      }
      lastMatch = i;
      j += 1;
    }
    i += 1;
  }
  if (j < needle.length) return null;

  const span = lastMatch - firstMatch + 1;
  const density = needle.length / Math.max(span, 1); // 0..1
  return 30 * density + 5 * bestConsecutive;
}

export interface ScoredCommand {
  cmd: Command;
  score: number;
}

/**
 * Filtra+ordena por relevancia. Sin query devuelve todos los comandos
 * en su orden de definición (más predecible que un ranking arbitrario
 * cuando no hay search).
 */
export function searchCommands(
  commands: Command[],
  query: string,
): ScoredCommand[] {
  if (!query.trim()) {
    return commands.map((cmd) => ({ cmd, score: 0 }));
  }
  const scored: ScoredCommand[] = [];
  for (const cmd of commands) {
    const score = scoreCommand(cmd, query);
    if (score !== null) {
      scored.push({ cmd, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/* ------------------------------------------------------------------ */
/* Recientes (Fase 22d-3 · A)                                          */
/* ------------------------------------------------------------------ */

const RECENTS_STORAGE_KEY = 'simtech.commandPalette.recents';
const MAX_RECENTS = 5;

interface RecentEntry {
  id: string;
  at: number;
}

/**
 * Lee de localStorage la lista cruda (sin validar contra el catálogo).
 * Devuelve [] si:
 *  - corremos en SSR (no hay window),
 *  - localStorage falla (modo incógnito / quota),
 *  - el JSON está corrupto.
 */
function readRecentsRaw(): RecentEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cleaned: RecentEntry[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as { id?: unknown }).id === 'string' &&
        typeof (item as { at?: unknown }).at === 'number'
      ) {
        cleaned.push({
          id: (item as { id: string }).id,
          at: (item as { at: number }).at,
        });
      }
    }
    return cleaned;
  } catch {
    return [];
  }
}

function writeRecentsRaw(entries: RecentEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      RECENTS_STORAGE_KEY,
      JSON.stringify(entries),
    );
  } catch {
    /* silencioso: localStorage puede estar bloqueado */
  }
}

/**
 * Registra el `id` de un comando como reciente. Sube el ID al tope,
 * desduplica, recorta a `MAX_RECENTS`.
 *
 * Persistencia best-effort: si localStorage no está disponible (modo
 * incógnito, quota, SSR), la llamada es no-op silenciosa.
 */
export function pushRecent(id: string): void {
  if (!id) return;
  const current = readRecentsRaw().filter((entry) => entry.id !== id);
  const next: RecentEntry[] = [
    { id, at: Date.now() },
    ...current,
  ].slice(0, MAX_RECENTS);
  writeRecentsRaw(next);
}

/**
 * Devuelve los comandos recientes en orden (más nuevo primero),
 * filtrando IDs que ya no existen en el catálogo `allCommands`.
 * No incluye entities (sólo páginas/acciones) porque las entities
 * son dinámicas y no se persisten entre sesiones.
 */
export function getRecentCommands(allCommands: Command[]): Command[] {
  const entries = readRecentsRaw();
  if (entries.length === 0) return [];
  const byId = new Map<string, Command>();
  for (const cmd of allCommands) {
    byId.set(cmd.id, cmd);
  }
  const recents: Command[] = [];
  for (const entry of entries) {
    const cmd = byId.get(entry.id);
    if (cmd) {
      recents.push({ ...cmd, category: 'recent' });
    }
  }
  return recents;
}

/* ------------------------------------------------------------------ */
/* Entities (Fase 22d-3 · C)                                           */
/* ------------------------------------------------------------------ */

/**
 * Tipos mínimos que esperamos de cada endpoint. Mantenemos sólo los
 * campos que el palette renderiza: el resto se ignora.
 */
export interface ProductEntity {
  id: string;
  name: string;
  sku?: string | null;
}

export interface CustomerEntity {
  id: string;
  name: string;
  nit?: string | null;
  email?: string | null;
}

export interface SaleEntity {
  id: string;
  invoiceNumber?: string | null;
  total?: number | string | null;
  customer?: { name?: string | null } | null;
}

/**
 * Construye los comandos `entities` a partir de los resultados de los
 * fetches paralelos. Mantenemos esta función pura para poder testearla
 * sin DOM/fetch.
 *
 * Como no existen rutas de detalle (`/products/[id]`) en el dashboard
 * actual, navegamos a la lista correspondiente con un query param
 * `?focus={id}` o, en sales, al detalle real (`/sales/[id]`).
 */
export function buildEntityCommands(input: {
  products: ProductEntity[];
  customers: CustomerEntity[];
  sales: SaleEntity[];
}): Command[] {
  const out: Command[] = [];

  for (const p of input.products) {
    out.push({
      id: `entity:product:${p.id}`,
      category: 'entities',
      title: p.name,
      description: p.sku ? `SKU ${p.sku}` : 'Producto',
      icon: Package,
      perform: (r) => r.push(`/inventory?productId=${encodeURIComponent(p.id)}`),
    });
  }

  for (const c of input.customers) {
    const descParts: string[] = [];
    if (c.nit) descParts.push(`NIT ${c.nit}`);
    if (c.email) descParts.push(c.email);
    out.push({
      id: `entity:customer:${c.id}`,
      category: 'entities',
      title: c.name,
      description: descParts.length > 0 ? descParts.join(' · ') : 'Cliente',
      icon: Users,
      perform: (r) =>
        r.push(`/customers?customerId=${encodeURIComponent(c.id)}`),
    });
  }

  for (const s of input.sales) {
    const ref = s.invoiceNumber || s.id.split('-')[0].toUpperCase();
    const customerName = s.customer?.name ?? '';
    const descParts: string[] = [];
    if (customerName) descParts.push(customerName);
    if (s.total != null) descParts.push(`Q${Number(s.total).toFixed(2)}`);
    out.push({
      id: `entity:sale:${s.id}`,
      category: 'entities',
      title: `Venta ${ref}`,
      description: descParts.length > 0 ? descParts.join(' · ') : 'Venta',
      icon: ReceiptText,
      perform: (r) => r.push(`/sales/${s.id}`),
    });
  }

  return out;
}
