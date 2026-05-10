# Manual del Administrador de Empresa

Esta guía es para el **Administrador titular** de cada empresa cliente. No para el Super Admin (operador del sistema).

## Tu primera vez

1. Entrá a `https://erp.simtechgt.com/login` con el email y contraseña que te entregaron.
2. **Cambiá la contraseña inmediatamente** desde **Settings → Mi cuenta**. Usá 12+ caracteres con mayúscula, minúscula, número y símbolo.
3. Configurá los datos de tu empresa en **Settings → Empresa**: nombre, NIT, dirección, teléfono, logo.

## Estructura del sistema

El ERP organiza tu negocio en niveles:

- **Empresa**: tu razón social. Una sola.
- **Sucursales**: cada local físico u operación remota (e.g. "Tecpán", "Santa María", "Online"). Podés tener varias.
- **Usuarios**: personas que entran al sistema. Cada usuario pertenece a una sucursal principal y puede tener acceso a otras.
- **Roles**: definen qué puede hacer cada usuario (e.g. "Cajero solo puede vender", "Manager puede ver reportes y ajustar inventario").

## Sucursales

Settings → Sucursales.

- **Crear sucursal**: nombre, código corto (e.g. `TEC-01`), dirección, teléfono.
- **Sucursal principal**: una sola; suele ser la oficina central. El sistema usa esta para defaults cuando no se especifica otra.
- **Desactivar** en vez de borrar si tiene historial de ventas. Eliminar solo se permite si no tuvo ventas.

## Usuarios y Roles

Settings → Usuarios y Settings → Roles.

### Crear un rol personalizado

Las apps tienen roles base (Administrador, Manager, Cajero) pero podés crear los tuyos:

1. Settings → Roles → Nuevo rol.
2. Nombre y descripción.
3. **Permisos**: marcá los que aplican. Categorías:
   - **POS**: acceso al punto de venta (`pos:access`), descuento (`pos:discount`).
   - **Ventas**: ver historial (`sales:view`), anular (`sales:void`).
   - **Inventario**: ver (`inventory:view`), ajustar (`inventory:adjust`), traslados (`inventory:transfer`).
   - **Compras**: ver (`purchases:view`), crear (`purchases:create`).
   - **Tesorería**: ver bancos (`treasury:view`), gestionar (`treasury:manage`).
   - **Clientes / Proveedores**: ver y gestionar.
   - **Reportes**: ver y exportar.
   - **Configuración**: gestionar (`settings:manage` da acceso a todo lo administrativo).
   - **Usuarios**: gestionar.
   - **HR / Nómina**: gestionar empleados y planillas.

### Crear un usuario

1. Settings → Usuarios → Nuevo usuario.
2. Nombre, email, contraseña inicial (12+ chars complejo), rol.
3. **Sucursal principal** (donde trabaja por default).
4. **Acceso a otras sucursales** (opcional — útil para managers que rotan).
5. Compartí la contraseña por canal seguro y pedile que la cambie en su primer login.

### Desactivar un usuario

Settings → Usuarios → editar → marcar inactivo. **No se borra**, queda en el historial. Al desactivar, su próximo intento de login será rechazado y queda registrado en el audit log. Su sesión actual sigue válida hasta que expire (máx 14 días).

## Catálogo de productos

Inventario → Productos.

### Productos simples

- **Nombre, SKU** (único en tu empresa), código de barras (opcional).
- **Precio de venta** y costo (este último para márgenes).
- **Categoría** (para reportes).
- **Stock inicial** por sucursal.
- **Stock mínimo**: nivel que dispara alerta de reposición.

### Productos con variantes

- Activá "tiene variantes" y agregá filas: "Talla", "Color", etc. Cada variante tiene su propio SKU, código, precio, costo y stock.

### Combos (bundles)

- Activá "es combo" y elegí qué componentes lo forman. Al vender un combo se descuenta stock de los componentes individuales.

### Carga masiva

Inventario → Importar productos. Subí un CSV con columnas: `name, sku, barcode, category, price, cost, stock, minStock`. El sistema valida y reporta filas con error.

## Punto de venta (POS)

POS → Iniciar turno → ingresar fondo de caja inicial.

- **Buscar producto** por nombre, SKU o escaneando código de barras.
- **Carrito**: ajustar cantidades, aplicar descuento (si tu rol lo permite).
- **Cliente**: opcional. Si vas a vender a crédito, es obligatorio.
- **Métodos de pago**: efectivo, tarjeta, transferencia, crédito. Podés combinar varios.
- **Cerrar venta**: imprimí o mandá el ticket por correo si tenés configurado.
- **Cierre de caja**: al final del turno, declarás el efectivo contado. El sistema valida que cuadre con las ventas en efectivo + abonos - egresos. Si descuadra, marca el descuadre.

## Cuentas por cobrar (Crédito a clientes)

Tesorería → Cuentas por cobrar.

- **Listado de clientes con saldo deudor**.
- **Registrar abono**: efectivo o transferencia. Si es efectivo, se asocia al turno de caja activo.
- **Anular abono**: si lo registraste mal, anulalo. El saldo del cliente se restituye y queda registro de la anulación.

## Cuentas por pagar (Deuda a proveedores)

Tesorería → Cuentas por pagar.

- Cada compra a crédito genera automáticamente un Payable.
- Registrar pago al proveedor: marca el banco origen y el monto. Genera transacción bancaria.

## Bancos

Tesorería → Bancos.

- Registrar cuentas bancarias y caja chica.
- Ver historial de movimientos.
- Conciliar marcando transacciones como reconciled.
- Transferir entre cuentas (Tesorería → Transferencia entre cuentas).

## Reportes

Reportes →

- **Ventas**: por día, sucursal, vendedor, método de pago.
- **Inventario**: valuación, top productos, productos sin movimiento.
- **Tesorería**: estado de cuentas, conciliaciones pendientes.
- **Contabilidad**: ingresos, egresos, balance del período.

Exportables a Excel/PDF.

## Auditoría

Audit → ver historial de cambios. Cada acción crítica (venta, traslado, ajuste de inventario, cambio de configuración, anulación) queda registrada con usuario, hora y detalles. **No se puede borrar**.

## Tu rol vs. el de Super Admin

- **Vos (Administrador de empresa)** sos el dueño funcional de TU empresa: gestionás todo dentro de tu organización.
- **Super Admin** (el operador de SIMTECH) ve la lista de empresas, gestiona suscripciones y planes, pero **no entra a tus operaciones diarias** salvo soporte solicitado por vos.

## Soporte

[Definir canal: email/WhatsApp/...]
