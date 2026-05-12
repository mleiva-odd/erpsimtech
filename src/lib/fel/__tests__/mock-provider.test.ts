import { describe, it, expect } from 'vitest';
import { MockProvider } from '../mock';
import type { CertifyInput } from '../types';

const BASE_INPUT: CertifyInput = {
  type: 'FACT',
  seriePrefix: 'A',
  numero: 1,
  fechaEmision: new Date('2026-05-12T12:00:00Z'),
  emisor: {
    nit: '12345678',
    nombre: 'Test SA',
    codigoEstablecimiento: '1',
    taxRegime: 'GENERAL',
  },
  receptor: { nit: 'CF', nombre: 'Consumidor Final' },
  items: [
    {
      numeroLinea: 1,
      bienOServicio: 'B',
      codigoItem: 'SKU-1',
      descripcion: 'Producto X',
      cantidad: 1,
      precioUnitario: 100,
      descuento: 0,
      precio: 100,
      taxRate: 0.12,
      iva: 12,
      total: 112,
      isTaxExempt: false,
    },
  ],
  totales: { granTotal: 112, totalIva: 12, totalGravado: 100, totalExento: 0 },
  internalId: 'sale-uuid-1',
};

describe('MockProvider.certify', () => {
  it('Devuelve OK con UUID, autorización, XML firmado y hash', async () => {
    const mp = new MockProvider();
    const r = await mp.certify(BASE_INPUT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.uuid).toMatch(/^MOCK-/);
    expect(r.autorizacion).toBe(r.uuid);
    expect(r.xmlFirmado).toContain('<dte:GTDocumento');
    expect(r.xmlFirmado).toContain('<dte:Certificacion>');
    expect(r.hashCertificacion).toMatch(/^[A-F0-9]{40}$/);
    expect(r.providerName).toBe('MOCK');
  });

  it('Es determinístico: mismo input → mismo UUID', async () => {
    const mp = new MockProvider();
    const r1 = await mp.certify(BASE_INPUT);
    const r2 = await mp.certify(BASE_INPUT);
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.uuid).toBe(r2.uuid);
    expect(r1.hashCertificacion).toBe(r2.hashCertificacion);
  });

  it('Cambia de UUID al cambiar el correlativo', async () => {
    const mp = new MockProvider();
    const r1 = await mp.certify({ ...BASE_INPUT, numero: 1 });
    const r2 = await mp.certify({ ...BASE_INPUT, numero: 2 });
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.uuid).not.toBe(r2.uuid);
  });

  it('Rechaza certificación sin ítems', async () => {
    const mp = new MockProvider();
    const r = await mp.certify({ ...BASE_INPUT, items: [] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('NO_ITEMS');
  });

  it('Incluye régimen y NIT en el XML firmado', async () => {
    const mp = new MockProvider();
    const r = await mp.certify(BASE_INPUT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.xmlFirmado).toContain('AfiliacionIVA="GEN"');
    expect(r.xmlFirmado).toContain('NITEmisor="12345678"');
  });

  it('Régimen Pequeño Contribuyente queda como AfiliacionIVA="PEQ"', async () => {
    const mp = new MockProvider();
    const r = await mp.certify({
      ...BASE_INPUT,
      emisor: { ...BASE_INPUT.emisor, taxRegime: 'PEQUENO_CONTRIBUYENTE' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.xmlFirmado).toContain('AfiliacionIVA="PEQ"');
  });
});

describe('MockProvider.cancel', () => {
  it('Acepta cancel con UUID válido', async () => {
    const mp = new MockProvider();
    const r = await mp.cancel({
      uuid: 'MOCK-1234-5678',
      motivoAnulacion: 'Devolución',
      fechaAnulacion: new Date(),
      emisorNit: '12345678',
    });
    expect(r.ok).toBe(true);
  });

  it('Rechaza cancel sin UUID', async () => {
    const mp = new MockProvider();
    const r = await mp.cancel({
      uuid: '',
      motivoAnulacion: 'X',
      fechaAnulacion: new Date(),
      emisorNit: '12345678',
    });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('UUID_REQUIRED');
  });
});
