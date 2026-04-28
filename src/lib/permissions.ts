// Catálogo global de permisos disponibles en el sistema

export type PermissionGroup = {
  id: string;
  name: string;
  permissions: {
    id: string;
    name: string;
    description: string;
  }[];
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'pos',
    name: 'Punto de Venta',
    permissions: [
      { id: 'pos:access', name: 'Acceder al POS', description: 'Permite abrir turnos y cobrar ventas.' },
      { id: 'pos:discount', name: 'Aplicar Descuentos Libres', description: 'Permite modificar el precio final en caja.' },
    ]
  },
  {
    id: 'sales',
    name: 'Ventas y Comercial',
    permissions: [
      { id: 'sales:view', name: 'Ver Historial', description: 'Permite ver el historial de ventas de su sucursal.' },
      { id: 'sales:void', name: 'Anular Ventas', description: 'Permite ejecutar anulaciones de ventas (Genera egresos).' },
    ]
  },
  {
    id: 'inventory',
    name: 'Inventario y Logística',
    permissions: [
      { id: 'inventory:view', name: 'Ver Inventario', description: 'Consulta de stock y catálogo de productos.' },
      { id: 'inventory:adjust', name: 'Ajustar Inventario', description: 'Registrar mermas o sobrantes.' },
      { id: 'inventory:transfer', name: 'Traslados', description: 'Crear o recibir traslados entre sucursales.' },
    ]
  },
  {
    id: 'purchases',
    name: 'Compras (Ingresos)',
    permissions: [
      { id: 'purchases:view', name: 'Ver Compras', description: 'Consultar compras a proveedores.' },
      { id: 'purchases:create', name: 'Registrar Compras', description: 'Ingresar mercadería desde compras.' },
    ]
  },
  {
    id: 'treasury',
    name: 'Finanzas y Tesorería',
    permissions: [
      { id: 'treasury:view', name: 'Ver Cuentas', description: 'Visualizar saldos de bancos y libro mayor.' },
      { id: 'treasury:manage', name: 'Operar Cuentas', description: 'Crear pagos, cobros, gastos directos e ingresos extras.' },
    ]
  },
  {
    id: 'reports',
    name: 'Reportes y Auditoría',
    permissions: [
      { id: 'reports:view', name: 'Ver Reportes', description: 'Acceso al módulo de dashboards analíticos.' },
      { id: 'reports:export', name: 'Exportar a Excel', description: 'Permitir descarga de datos masivos.' },
    ]
  },
  {
    id: 'contacts',
    name: 'Contactos',
    permissions: [
      { id: 'customers:view', name: 'Ver Clientes', description: 'Acceso a la agenda de clientes.' },
      { id: 'customers:manage', name: 'Gestionar Clientes', description: 'Crear, editar o eliminar clientes.' },
      { id: 'suppliers:view', name: 'Ver Proveedores', description: 'Acceso a la agenda de proveedores.' },
      { id: 'suppliers:manage', name: 'Gestionar Proveedores', description: 'Crear, editar o eliminar proveedores.' },
    ]
  },
  {
    id: 'admin',
    name: 'Configuración Administrativa',
    permissions: [
      { id: 'settings:manage', name: 'Ajustes del Negocio', description: 'Modificar nombre, impuestos, datos de sucursales.' },
      { id: 'users:manage', name: 'Usuarios y Roles', description: 'Crear empleados y asignarles roles.' },
    ]
  },
  {
    id: 'hr',
    name: 'Recursos Humanos',
    permissions: [
      { id: 'hr:manage', name: 'Gestión de Empleados', description: 'Crear y editar fichas de personal.' },
      { id: 'payroll:manage', name: 'Gestión de Planillas', description: 'Procesar y aprobar pagos de nómina.' },
    ]
  }
];

// Helper array con todos los IDs de permisos válidos
export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.id));
