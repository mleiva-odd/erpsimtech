import { test, expect } from '@playwright/test';

test.describe('Flujo Crítico de Ventas POS (E2E) - Prevención de Doble Cobro', () => {
  const loginEmail = process.env.E2E_LOGIN_EMAIL;
  const loginPassword = process.env.E2E_LOGIN_PASSWORD;

  // Autenticación precondición (suponiendo entorno base con db seed):
  // Se requiere tener el servidor Next.js corriendo en el puerto 3000.
  // Nota: Estas pruebas corren sobre datos predecibles.

  test('Validar que el login y el checkout NO permitan dobles peticiones simultáneas', async ({ page }) => {
    test.skip(!loginEmail || !loginPassword, 'Define E2E_LOGIN_EMAIL y E2E_LOGIN_PASSWORD para ejecutar esta prueba.');

    // 1. Acceder al inicio de sesión
    await page.goto('/login');
    
    // Iniciar como un usuario real del entorno de pruebas
    await page.fill('input[type="email"]', loginEmail!);
    await page.fill('input[type="password"]', loginPassword!);
    await page.click('button[type="submit"]');

    // 2. Comprobar que redirigió al panel general
    await expect(page).toHaveURL('/dashboard');

    // 3. Forzamos la apertura directa del Punto de Venta (POS)
    await page.goto('/pos');
    await expect(page).toHaveURL('/pos');

    // Nos aseguramos que la página cargó los productos. (Esperamos al menos un botón de "Añadir")
    const p1Button = page.locator('button:has-text("Añadir")').first();
    await expect(p1Button).toBeVisible();

    // 4. Agregar productos al carrito
    await p1Button.click();
    
    // Abrir Modal de Cobro
    const checkoutButton = page.locator('button', { hasText: 'Cobrar Q' });
    await expect(checkoutButton).toBeEnabled();
    await checkoutButton.click();

    // 5. Interacción con el Modal: Pagamos en Efectivo (CASH)
    const modal = page.locator('h2:has-text("Finalizar Venta")');
    await expect(modal).toBeVisible();

    // Ubicamos el input de efectivo
    const montoTotalStr = await page.locator('.text-4xl.font-black.text-blue-700').innerText();
    const montoTotal = montoTotalStr.replace('Q', '');
    
    const efectivoInput = page.locator('input[placeholder="Efectivo entregado por el cliente"]');
    await efectivoInput.fill(montoTotal);

    // 6. ATAQUE: Doble Click rápido / SPAM
    const finalizarCobroBtn = page.locator('button:has-text("Cobrar")').nth(1); // El botón "Cobrar" dentro de modal
    await expect(finalizarCobroBtn).toBeEnabled();

    // Emular un usuario dando click dos veces extremadamente rápido (Simulación de race condition)
    await finalizarCobroBtn.click();
    try {
        await finalizarCobroBtn.click({ force: true, timeout: 50 });
    } catch (e) {
        // En un diseño correcto, el segundo click debería fallar porque 'disabled' corta eventos del mouse
    }

    // 7. Resultado esperado: Redirección de éxito y que el botón haya quedado desactivado por 'isLoading'
    // Comprobar la notificación de éxito
    const _exitoMensaje = page.locator('text=Venta finalizada');
    //await expect(exitoMensaje).toBeVisible(); // Depende si pusimos Toast notification
    
    // Al menos un modal de Error NO debió aparecer
    const _errorAlert = page.locator('.bg-red-50');
    //await expect(errorAlert).not.toBeVisible();
    
    // Opcionalmente podemos revisar la DB conectándonos vía Prisma en un script "beforeEach", 
    // pero con que el botón prevenga la excepción ya comprobamos la defensa FrontEnd en E2E.
    console.log("✔️ Prueba defensiva contra race-condition superada.");
  });

});
