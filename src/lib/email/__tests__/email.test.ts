import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Fase 31a · Tests de la capa email.
 *
 * - ConsoleEmailProvider nunca falla y devuelve ID determinístico.
 * - sendEmail no propaga errores; sendEmailOrThrow sí.
 * - Templates generan subject/html/text bien formados (smoke).
 */

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    })),
  },
}));

describe('email · ConsoleEmailProvider', () => {
  it('send devuelve id con prefijo mock-', async () => {
    const { ConsoleEmailProvider } = await import('../console-provider');
    const p = new ConsoleEmailProvider();
    const r = await p.send({
      to: { email: 'test@example.com' },
      subject: 'Hello',
      text: 'World',
    });
    expect(r.provider).toBe('console');
    expect(r.id.startsWith('mock-')).toBe(true);
  });

  it('acepta múltiples destinatarios sin lanzar', async () => {
    const { ConsoleEmailProvider } = await import('../console-provider');
    const p = new ConsoleEmailProvider();
    await expect(
      p.send({
        to: [
          { email: 'a@x.com' },
          { name: 'B Person', email: 'b@x.com' },
        ],
        subject: 'Multi',
        html: '<p>multi</p>',
      }),
    ).resolves.toBeDefined();
  });
});

describe('email · sendEmail / sendEmailOrThrow', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  });

  it('sendEmail devuelve resultado válido con ConsoleProvider', async () => {
    const mod = await import('../index');
    mod.__resetEmailProviderCache();
    const r = await mod.sendEmail({
      to: { email: 'x@y.com' },
      subject: 'test',
      text: 'body',
    });
    expect(r).not.toBeNull();
    expect(r?.provider).toBe('console');
  });

  it('sendEmailOrThrow se comporta igual con ConsoleProvider', async () => {
    const mod = await import('../index');
    mod.__resetEmailProviderCache();
    const r = await mod.sendEmailOrThrow({
      to: { email: 'x@y.com' },
      subject: 'test',
      text: 'body',
    });
    expect(r.provider).toBe('console');
  });
});

describe('email · templates', () => {
  it('passwordResetTemplate produce subject + html + text + tag', async () => {
    const { passwordResetTemplate } = await import('../templates');
    const t = passwordResetTemplate({
      toName: 'Marvin',
      resetUrl: 'https://erp.simtechgt.com/reset?token=abc',
      validForMinutes: 30,
    });
    expect(t.subject).toContain('Restablecer');
    expect(t.html).toContain('Marvin');
    expect(t.html).toContain('erp.simtechgt.com');
    expect(t.text).toContain('30 minutos');
    expect(t.tag).toBe('password-reset');
  });

  it('payrollGeneratedTemplate incluye datos clave', async () => {
    const { payrollGeneratedTemplate } = await import('../templates');
    const t = payrollGeneratedTemplate({
      payrollName: 'Quincena 1 Mayo',
      employeeCount: 12,
      totalNet: 'Q 45,678.90',
      detailUrl: 'https://erp.simtechgt.com/apps/hr/payroll/abc',
    });
    expect(t.subject).toContain('Quincena 1 Mayo');
    expect(t.html).toContain('12');
    expect(t.html).toContain('Q 45,678.90');
    expect(t.tag).toBe('payroll-generated');
  });

  it('invoiceSentTemplate escapa HTML en inputs', async () => {
    const { invoiceSentTemplate } = await import('../templates');
    const t = invoiceSentTemplate({
      companyName: '<script>alert(1)</script>',
      invoiceNumber: 'A-001',
      totalFormatted: 'Q 100.00',
    });
    expect(t.html).not.toContain('<script>');
    expect(t.html).toContain('&lt;script&gt;');
  });

  it('welcomeNewAccountTemplate incluye días de trial y CTA login', async () => {
    const { welcomeNewAccountTemplate } = await import('../templates');
    const t = welcomeNewAccountTemplate({
      toName: 'Marvin',
      companyName: 'Distexma',
      loginUrl: 'https://erp.simtechgt.com/login',
      trialDays: 30,
    });
    expect(t.subject).toContain('Distexma');
    expect(t.html).toContain('30 días');
    expect(t.html).toContain('erp.simtechgt.com/login');
    expect(t.tag).toBe('welcome-new-account');
  });

  it('paymentReminderTemplate cambia tono según urgencia', async () => {
    const { paymentReminderTemplate } = await import('../templates');
    const lejos = paymentReminderTemplate({
      companyName: 'Distexma',
      amountDue: 'Q 599.00',
      dueDate: '31 de mayo de 2026',
      daysRemaining: 7,
    });
    expect(lejos.subject).toContain('7 días');

    const hoy = paymentReminderTemplate({
      companyName: 'Distexma',
      amountDue: 'Q 599.00',
      dueDate: 'hoy',
      daysRemaining: 0,
    });
    expect(hoy.subject).toContain('vence hoy');
    expect(hoy.html).toContain('vence hoy');
  });

  it('accountSuspendedTemplate menciona días de gracia y saldo', async () => {
    const { accountSuspendedTemplate } = await import('../templates');
    const t = accountSuspendedTemplate({
      toName: 'Marvin',
      companyName: 'Distexma',
      amountDue: 'Q 599.00',
      graceDays: 30,
    });
    expect(t.subject).toContain('suspendida');
    expect(t.html).toContain('Q 599.00');
    expect(t.html).toContain('30 días');
    expect(t.tag).toBe('account-suspended');
  });
});
