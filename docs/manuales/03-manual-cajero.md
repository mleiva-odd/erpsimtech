# Manual del Cajero / Operador de POS

Esta guía es para personal que **opera el punto de venta** día a día.

## Tu primer día

1. Tu encargado ya creó tu usuario con tu email y contraseña inicial.
2. Entrá a `https://erp.simtechgt.com/login`.
3. Cambiá la contraseña en **Mi cuenta**. Mínimo 12 caracteres con mayúscula, minúscula, número y símbolo.

## Iniciar turno (apertura de caja)

Antes de la primera venta del día:

1. Andá a **POS**.
2. Si ves "Debes abrir turno de caja primero", apretá ese botón.
3. Ingresá el **fondo inicial** (el efectivo con que arrancás la caja, e.g. Q500).
4. Confirmá. Ya podés vender.

Solo podés tener **un turno abierto a la vez por usuario**. Si te tocan varias jornadas, cerrá una antes de abrir la próxima.

## Hacer una venta

1. Buscá productos:
   - Escribí el nombre o SKU en la barra.
   - O escaneá el código de barras con la pistola conectada al teclado.
2. Tocá "Añadir" en cada producto que el cliente lleva.
3. Ajustá cantidades en el carrito si necesita.
4. **Cliente**: si la venta va a crédito o querés guardar el dato del cliente, seleccionalo o creá uno nuevo (botón "Nuevo cliente"). Si es venta de mostrador anónima, dejá vacío.
5. **Aplicar descuento** (si tu rol lo permite): porcentaje sobre el subtotal.
6. **Métodos de pago**:
   - Efectivo: ingresá el monto recibido.
   - Tarjeta: ingresá la **autorización** que da el POS de tarjetas (es un código que el cliente firma).
   - Transferencia: ingresá la **referencia** del banco.
   - Crédito: requiere cliente seleccionado y que tenga línea de crédito autorizada.
   - Podés combinar (e.g. mitad efectivo, mitad tarjeta).
7. Apretá **"Cobrar"**. El sistema valida que el total pagado iguale el de la venta (no menos, no más de Q0.05 de diferencia).
8. Imprimí el ticket si tu impresora está configurada.

### Errores comunes durante la venta

- **"Stock insuficiente"**: el producto no tiene unidades en tu sucursal. Avisá a inventario para reposición o vendé otra cosa.
- **"Pago insuficiente"**: el total cobrado es menor al total de la venta. Revisá los montos.
- **"Pago excedido"**: pasaste el total por más de Q0.05. Ajustá los montos. Vuelto en efectivo es responsabilidad tuya, no del sistema.
- **"Debes registrar la autorización del pago con tarjeta"**: pegá el código de autorización del POS bancario.
- **"Descuento excede lo permitido"**: tu rol tiene límite de descuento. Pedile al manager que lo apruebe.

## Anulaciones / Devoluciones

POS → Devoluciones.

- Buscá la venta original por número.
- Marcá los productos que devuelven.
- Elegí motivo.
- Confirmá. El stock vuelve al inventario y se registra una nota de crédito.

**Importante**: las devoluciones quedan en auditoría. No se pueden esconder.

## Egresos de caja (gastos pequeños)

POS → Egreso de caja.

- Para gastos pequeños del día (pasajes, fletes, propina, etc.).
- Ingresá descripción y monto.
- Esto descuenta del efectivo de tu turno y queda registrado.

## Cobrar abonos a clientes

Si un cliente viene a pagar su saldo pendiente:

1. Clientes → buscá al cliente → "Registrar abono".
2. Ingresá el monto.
3. Método de pago: efectivo (entra a tu caja) o transferencia (entra al banco).
4. Confirmá. El saldo del cliente baja automáticamente.

## Cerrar turno (cierre de caja)

Al final del día:

1. POS → Cerrar turno.
2. **Contá el efectivo físicamente** y declará el monto.
3. El sistema te muestra:
   - Fondo inicial.
   - Suma de ventas en efectivo del turno.
   - Suma de abonos en efectivo recibidos.
   - Suma de egresos.
   - **Esperado en caja** = fondo + ventas + abonos − egresos.
4. Comparalo con tu **declarado**. Si la diferencia es ≤ Q0.05 (centavos), pasa. Si es mayor, el sistema te muestra el descuadre y NO permite cerrar.
5. Si hay descuadre, contá el efectivo de nuevo o avisá al encargado.
6. Confirmá. El turno queda cerrado y no podés vender hasta abrir uno nuevo.

## Lo que NO podés hacer (y está bien)

Tu rol de cajero está limitado a propósito. NO podés:
- Modificar productos o precios (lo hace el manager).
- Ver reportes globales.
- Anular ventas ya cerradas (solo devoluciones, que dejan rastro).
- Cambiar configuración de la empresa.
- Crear usuarios.

Si necesitás algo de eso, pedile al encargado.

## Si tu sesión expira

El sistema te desloguea automáticamente después de 14 días sin uso. Volvé a entrar con tu usuario y contraseña.

Si **no te acordás** la contraseña, pedile al admin de tu empresa que la resetee.

## Si la app no responde

1. Refrescá la página (F5).
2. Si sigue sin responder, contale al encargado y avisá a soporte.
3. **No abras múltiples turnos ni vendas la misma transacción dos veces** — el sistema previene doble cobro pero conviene confirmar antes.
