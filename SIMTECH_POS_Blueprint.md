# ESPECIFICACIONES TÉCNICAS: SIMTECH POS (v1.0)

## 1. ARQUITECTURA DEL SISTEMA (STACK)

- **Frontend:** Next.js 14+ (App Router) + Tailwind CSS.
    
- **Base de Datos:** PostgreSQL (Vía Prisma ORM para integridad referencial).
    
- **Autenticación:** NextAuth.js (Roles: `ADMIN`, `CASHIER`).
    
- **Estado/Cache:** TanStack Query (React Query) para sincronización en tiempo real.
    

## 2. ESQUEMA DE DATOS (MODELO RELACIONAL)

- **User:** `id, name, email, password, role (enum)`.
    
- **Product:** `id, sku (string, unique), name, price (decimal), cost (decimal), stock (int), min_stock (int), categoryId`.
    
- **Category:** `id, name`.
    
- **Sale:** `id, userId, total (decimal), paymentMethod (enum), createdAt (timestamp)`.
    
- **SaleItem:** `id, saleId, productId, quantity (int), unitPrice (decimal)`.
    

## 3. MÓDULOS DEL MVP (PRODUCTO MÍNIMO VIABLE)

### A. Terminal de Venta (Punto de Venta)

- Interfaz táctil con buscador predictivo y soporte para escáner de barras.
    
- Cesta de compra con edición de cantidades y eliminación de ítems.
    
- Cierre de venta con selección de método de pago (Efectivo, Tarjeta, Transferencia).
    

### B. Gestión de Inventario

- CRUD completo de productos y categorías.
    
- Indicadores visuales de **Stock Crítico** (Stock < Min_Stock).
    
- Ajustes manuales de inventario con registro de motivo.
    

### C. Reportes y Dashboard

- Resumen de ventas diarias vs. día anterior.
    
- Cálculo de utilidad neta (Venta - Costo).
    
- Lista de productos con mayor rotación.
    

## 4. REQUERIMIENTOS DE UX/UI

- **Diseño:** Estilo "Bento Grid" minimalista, botones grandes para pantallas táctiles.
    
- **Feedback:** Notificaciones instantáneas (Toasts) al agregar productos o completar ventas.
    
- **Modo:** Soporte para Dark/Light Mode.
    

---

## 🚀 Prompt para Antygraviti (Ingeniería de Software)


> **Rol:** Actúa como Senior Fullstack Developer experto en Next.js, Prisma ORM y PostgreSQL.
> 
> **Tarea:** Desarrollar el núcleo del sistema **SIMTECH POS** basado en el archivo de especificaciones adjunto (`SIMTECH_POS_Blueprint.md`).
> 
> **Entregables Iniciales:**
> 
> 1. **Esquema de Base de Datos:** Genera el archivo `schema.prisma` basado en el modelo de datos definido (User, Product, Category, Sale, SaleItem).
>     
> 2. **API Routes:** Crea los Endpoints de Next.js para:
>     
>     - CRUD de Productos con validación de Stock.
>         
>     - Creación de una Venta (Sale) que descuente automáticamente el stock de los productos involucrados y registre los SaleItems en una sola transacción de base de datos.
>         
> 3. **Estructura de Componentes:** Crea la estructura de carpetas y el layout base utilizando Tailwind CSS, asegurando que sea responsivo y apto para tablets.
>     
> 
> **Restricción Técnica:** Usa código limpio, tipado estricto con TypeScript y manejo de errores robusto. No utilices librerías externas innecesarias; prioriza la velocidad de carga y la simplicidad.

