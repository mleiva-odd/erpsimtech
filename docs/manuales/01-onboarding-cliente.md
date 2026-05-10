# Onboarding de cliente nuevo

Este documento describe el proceso para dar de alta una empresa que va a usar SIMTECH ERP.

## Pre-requisitos

- El cliente firmó el alquiler / contrato de servicio.
- Se acordó el plan (Trial, Basic, Professional, Enterprise) con sus límites de sucursales y usuarios.
- El cliente tiene un correo electrónico para el administrador titular.

## Paso 1 · Registrar empresa desde el panel de Super Admin

1. Iniciá sesión como Super Admin en `https://erp.simtechgt.com/login`.
2. Andá a **Admin → Empresas**.
3. **Nueva empresa**, completá:
   - **Nombre comercial**: como aparece en facturas.
   - **Slug**: identificador URL-friendly, único. Ej. `lavanderia-tecpan`. Solo minúsculas, números y guiones.
   - **NIT** y datos fiscales si los conocés.
   - **Email de contacto** de la empresa (no el del admin — ese es distinto).
   - **Plan inicial**: usar Trial para los primeros 30 días, o el plan contratado.
4. **Datos del administrador titular**:
   - Nombre completo.
   - Email (este es el que va a usar para entrar al sistema).
   - Contraseña inicial — **debe ser fuerte**: 12+ caracteres, mayúscula, minúscula, número y símbolo. El cliente la cambia después en su primer login.
5. Guardar.

El sistema crea atómicamente:
- La empresa y su `companyId`.
- Una sucursal "Sucursal Central" con código `SUC-01`.
- Configuración fiscal en blanco.
- Suscripción con período activo (30 días si es trial).
- El usuario administrador con rol `Administrador` y todos los permisos.

## Paso 2 · Compartir credenciales con el cliente (con cuidado)

**No envíes la contraseña por email ni Slack en texto plano.**

Opciones recomendadas:
- Compartirla por **password manager** (1Password, Bitwarden) con expiración de 24h.
- O comunicarla por canal seguro y pedir que la cambie inmediatamente al entrar.

Lo que el cliente recibe:
```
URL: https://erp.simtechgt.com/login
Email: <admin-email-acordado>
Contraseña inicial: <generada-segura>
```

## Paso 3 · Llamada de bienvenida (15-30 min)

Recorrida en vivo con el cliente:
1. Login con sus credenciales.
2. Cambiar contraseña (Settings → Mi cuenta → Cambiar contraseña).
3. Datos de la empresa: NIT, dirección, teléfono, logo (Settings → Empresa).
4. Configurar primera sucursal con dirección y teléfono.
5. Crear roles personalizados si necesita (e.g., "Cajero", "Encargado").
6. Crear los primeros 1-2 usuarios del equipo.
7. Importar productos iniciales:
   - Manualmente desde Productos → Nuevo producto.
   - O carga masiva via CSV (Inventario → Importar).
8. Configurar métodos de pago aceptados (Settings → Pagos): Efectivo, Tarjeta, Transferencia, Crédito.
9. Si va a usar tesorería, agregar cuentas bancarias (Tesorería → Bancos).
10. Hacer una venta de prueba en POS y revisar que se vea en Reportes.

## Paso 4 · Seguimiento

A las 24h, 7d y 30d:
- Confirmar que el equipo se logueó.
- Revisar reportes de uso (cantidad de ventas, productos cargados).
- En el día 25 del trial, recordatorio de migración de plan si aplica.

## Checklist de cierre del onboarding

- [ ] Empresa creada con plan correcto.
- [ ] Admin titular con contraseña fuerte y entrada confirmada.
- [ ] Al menos 1 sucursal configurada.
- [ ] Al menos 1 usuario adicional (manager o cajero).
- [ ] Catálogo inicial de productos cargado (mínimo 10 items).
- [ ] Métodos de pago configurados.
- [ ] Cuenta bancaria registrada (si usa tesorería).
- [ ] Primera venta exitosa.
- [ ] Cliente sabe a quién contactar para soporte.

## Errores comunes

- **"Slug ya existe"**: el identificador URL ya está usado por otra empresa. Pedile al cliente uno alternativo.
- **"Contraseña débil"**: es 12+ chars, mayúscula, minúscula, número y símbolo. Generala con un password manager si dudás.
- **El admin no ve la sucursal central**: hacé logout/login. El JWT cachea permisos durante 14 días pero los datos de DB se cargan en cada request.
