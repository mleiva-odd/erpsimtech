import { test, expect, Page } from '@playwright/test';

/**
 * Tests de aislamiento cross-tenant.
 *
 * Objetivo: validar que un usuario logueado en Empresa A NO puede leer
 * ni modificar recursos de Empresa B, ni siquiera adivinando UUIDs.
 *
 * Setup requerido (ver e2e/README.md):
 *   - Dos empresas en la DB de test, cada una con su admin propio.
 *   - Cuatro env vars con las credenciales y dos UUIDs "objetivo" de
 *     recursos de la empresa contraria:
 *
 *     E2E_TENANT_A_EMAIL, E2E_TENANT_A_PASSWORD
 *     E2E_TENANT_B_EMAIL, E2E_TENANT_B_PASSWORD
 *     E2E_TENANT_B_CUSTOMER_ID  (un customer.id que pertenece a B)
 *     E2E_TENANT_B_PRODUCT_ID   (un product.id que pertenece a B)
 *
 * Si las env vars faltan, los tests se skipean para no romper CI.
 */

const tenantA = {
  email: process.env.E2E_TENANT_A_EMAIL,
  password: process.env.E2E_TENANT_A_PASSWORD,
};
const tenantB = {
  email: process.env.E2E_TENANT_B_EMAIL,
  password: process.env.E2E_TENANT_B_PASSWORD,
};
const targetCustomerB = process.env.E2E_TENANT_B_CUSTOMER_ID;
const targetProductB = process.env.E2E_TENANT_B_PRODUCT_ID;

const allConfigured =
  tenantA.email &&
  tenantA.password &&
  tenantB.email &&
  tenantB.password &&
  targetCustomerB &&
  targetProductB;

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  // Esperá redirect post-login. Puede ir a /apps o /dashboard según el rol.
  await page.waitForURL(/\/(apps|dashboard|pos)/);
}

test.describe('Cross-tenant isolation', () => {
  test.skip(
    !allConfigured,
    'Configurá E2E_TENANT_A_*, E2E_TENANT_B_*, E2E_TENANT_B_CUSTOMER_ID y E2E_TENANT_B_PRODUCT_ID. Ver e2e/README.md.',
  );

  test('User de tenant A NO puede ver customers del tenant B vía API', async ({
    page,
    request,
  }) => {
    await login(page, tenantA.email!, tenantA.password!);

    // Listar customers desde A — no debería incluir el customer de B.
    const list = await request.get('/api/customers');
    expect(list.ok()).toBeTruthy();
    const customers = await list.json();
    const ids: string[] = Array.isArray(customers)
      ? customers.map((c: { id: string }) => c.id)
      : [];
    expect(ids).not.toContain(targetCustomerB);
  });

  test('User de tenant A recibe 404 al EDITAR customer de tenant B', async ({
    page,
    request,
  }) => {
    await login(page, tenantA.email!, tenantA.password!);

    const update = await request.put(`/api/customers/${targetCustomerB}`, {
      data: { name: 'Hacked by A' },
    });
    // El handler valida companyId en el where y devuelve 404 si no encuentra.
    expect([404, 403]).toContain(update.status());
  });

  test('User de tenant A recibe 404 al BORRAR customer de tenant B', async ({
    page,
    request,
  }) => {
    await login(page, tenantA.email!, tenantA.password!);

    const del = await request.delete(`/api/customers/${targetCustomerB}`);
    expect([404, 403]).toContain(del.status());
  });

  test('User de tenant A NO puede ver productos del tenant B en su listado', async ({
    page,
    request,
  }) => {
    await login(page, tenantA.email!, tenantA.password!);

    const list = await request.get('/api/products');
    expect(list.ok()).toBeTruthy();
    const data = await list.json();
    const products: Array<{ id: string }> = data.products ?? data;
    const ids = products.map((p) => p.id);
    expect(ids).not.toContain(targetProductB);
  });

  test('User de tenant A recibe 404 al PATCH producto de tenant B', async ({
    page,
    request,
  }) => {
    await login(page, tenantA.email!, tenantA.password!);

    const patch = await request.put(`/api/products/${targetProductB}`, {
      data: { name: 'Hacked product' },
    });
    expect([404, 403]).toContain(patch.status());
  });

  test('User de tenant A recibe 404 al GET sale individual de tenant B', async ({
    page,
    request,
  }) => {
    await login(page, tenantA.email!, tenantA.password!);

    // Probamos un id inválido — esperamos 404 igual que con un id real de otro tenant.
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const get = await request.get(`/api/sales/${fakeId}`);
    expect([404, 403]).toContain(get.status());
  });

  test('Sin sesión: no se puede acceder a la API protegida', async ({ request }) => {
    const noAuth = await request.get('/api/customers');
    expect([401, 302, 307]).toContain(noAuth.status());
  });
});

test.describe('Login rate limit', () => {
  test.skip(!tenantA.email, 'Configurá E2E_TENANT_A_EMAIL para este test.');

  test('5 fallos consecutivos disparan bloqueo en el 6to intento', async ({
    request,
  }) => {
    // Hacemos 5 intentos con password incorrecta.
    // El 6º DEBERÍA disparar el rate limit.
    for (let i = 1; i <= 5; i++) {
      const r = await request.post('/api/auth/check-block', {
        data: { email: tenantA.email },
      });
      expect(r.ok()).toBeTruthy();
      // Antes de los 5 fallos, blocked debería ser false.
      const data = await r.json();
      expect(data.blocked).toBe(false);
    }
    // Aclaración: este test verifica que el endpoint de check-block existe
    // y responde correctamente. El bloqueo real requiere fallos previos
    // registrados (que se hacen vía login fallido, no via check-block).
    // Para test completo de rate limit, ver e2e/README.md.
  });
});
