/**
 * Fase 25-3d · E2E test de autenticación.
 *
 * Primer e2e Playwright del proyecto. Valida:
 *  - La página de login carga (HTTP 200, form visible).
 *  - Login con credenciales del seed (simtech@simtechgt.com) redirige a /apps.
 *  - Login con credenciales inválidas muestra un error visible.
 *
 * Pre-requisitos del entorno (configurados en .github/workflows/ci.yml):
 *  - Postgres con migraciones aplicadas + npm run seed.
 *  - Next.js server arrancado (npm run start) en http://localhost:3000.
 *  - Variables E2E_LOGIN_EMAIL y E2E_LOGIN_PASSWORD seteadas.
 *
 * Local: necesita docker postgres + seed + npm run dev en otra terminal.
 */

import { test, expect } from '@playwright/test';

const EMAIL = process.env.E2E_LOGIN_EMAIL ?? 'simtech@simtechgt.com';
const PASSWORD = process.env.E2E_LOGIN_PASSWORD ?? 'TestAdmin12345!';

test.describe('autenticación', () => {
  test('login page se renderiza correctamente', async ({ page }) => {
    await page.goto('/login');

    // Inputs visibles.
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();

    // Botón submit visible.
    const submit = page.locator('button[type="submit"]');
    await expect(submit).toBeVisible();
    await expect(submit).toContainText(/iniciar/i);
  });

  test('login con credenciales válidas redirige a /apps', async ({ page }) => {
    await page.goto('/login');

    await page.fill('#email', EMAIL);
    await page.fill('#password', PASSWORD);
    await page.click('button[type="submit"]');

    // Tras login exitoso, la app redirige a /apps (selector de empresa).
    // Damos timeout generoso porque incluye llamada NextAuth + fetch sesión.
    await expect(page).toHaveURL(/\/apps/, { timeout: 15000 });
  });

  test('login con credenciales inválidas muestra mensaje de error', async ({ page }) => {
    await page.goto('/login');

    await page.fill('#email', EMAIL);
    await page.fill('#password', 'PasswordIncorrecta123!');
    await page.click('button[type="submit"]');

    // Espera el error visible (el form muestra un div rojo con el mensaje).
    // Filtramos por clase 'text-red-600' que el componente del error usa.
    const errorBox = page.locator('.text-red-600').filter({ hasText: /./ });
    await expect(errorBox.first()).toBeVisible({ timeout: 10000 });

    // URL sigue siendo /login (no redirige).
    await expect(page).toHaveURL(/\/login/);
  });
});
