import { describe, it, expect } from 'vitest';
import { generateDTE, wrapWithCertification } from '../xml-generator';
import type { CertifyInput } from '../types';

const SAMPLE: CertifyInput = {
  type: 'FACT',
  seriePrefix: 'A',
  numero: 123,
  fechaEmision: new Date('2026-05-12T15:30:00.000Z'),
  emisor: {
    nit: '12345678',
    nombre: 'Empresa Demo SA',
    codigoEstablecimiento: '1',
    taxRegime: 'GENERAL',
    direccion: 'Zona 10, Guatemala',
  },
  receptor: { nit: 'CF', nombre: 'Consumidor Final' },
  items: [
    {
      numeroLinea: 1,
      bienOServicio: 'B',
      codigoItem: 'SKU-1',
      descripcion: 'Producto gravado',
      cantidad: 2,
      unidadMedida: 'UNI',
      precioUnitario: 50,
      descuento: 0,
      precio: 100,
      taxRate: 0.12,
      iva: 12,
      total: 112,
      isTaxExempt: false,
    },
    {
      numeroLinea: 2,
      bienOServicio: 'B',
      codigoItem: 'SKU-EX',
      descripcion: 'Producto exento',
      cantidad: 1,
      unidadMedida: 'UNI',
      precioUnitario: 20,
      descuento: 0,
      precio: 20,
      taxRate: 0,
      iva: 0,
      total: 20,
      isTaxExempt: true,
    },
  ],
  totales: { granTotal: 132, totalIva: 12, totalGravado: 100, totalExento: 20 },
  internalId: 'sale-test',
};

describe('generateDTE', () => {
  it('Genera XML que parsea estructura mínima SAT', () => {
    const xml = generateDTE(SAMPLE);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<dte:GTDocumento');
    expect(xml).toContain('<dte:DatosEmision');
    expect(xml).toContain('NITEmisor="12345678"');
    expect(xml).toContain('IDReceptor="CF"');
    expect(xml).toContain('AfiliacionIVA="GEN"');
  });

  it('Incluye Frase de exención si algún item es exento', () => {
    const xml = generateDTE(SAMPLE);
    expect(xml).toContain('TipoFrase="4"'); // frase de exención
  });

  it('Omite Frase de exención si ningún item es exento', () => {
    const xml = generateDTE({
      ...SAMPLE,
      items: SAMPLE.items.filter((i) => !i.isTaxExempt),
    });
    expect(xml).not.toContain('TipoFrase="4"');
  });

  it('GranTotal coincide con totales.granTotal', () => {
    const xml = generateDTE(SAMPLE);
    expect(xml).toContain('<dte:GranTotal>132.00</dte:GranTotal>');
  });

  it('Pequeño Contribuyente refleja AfiliacionIVA="PEQ"', () => {
    const xml = generateDTE({
      ...SAMPLE,
      emisor: { ...SAMPLE.emisor, taxRegime: 'PEQUENO_CONTRIBUYENTE' },
    });
    expect(xml).toContain('AfiliacionIVA="PEQ"');
  });

  it('Escapa caracteres XML peligrosos en descripciones', () => {
    const xml = generateDTE({
      ...SAMPLE,
      receptor: { nit: 'CF', nombre: 'A & B "tester" <evil>' },
    });
    expect(xml).toContain('A &amp; B &quot;tester&quot; &lt;evil&gt;');
    expect(xml).not.toContain('"tester"');
  });

  it('NCRE con documentoReferencia incluye Complemento', () => {
    const xml = generateDTE({
      ...SAMPLE,
      type: 'NCRE',
      documentoReferencia: {
        uuid: 'MOCK-ORIG-UUID',
        serie: 'A',
        numero: 100,
        fechaEmision: new Date('2026-05-10T10:00:00Z'),
        motivo: 'Devolución',
      },
    });
    expect(xml).toContain('<dte:Complementos>');
    expect(xml).toContain('NumeroAutorizacionDocumentoOrigen="MOCK-ORIG-UUID"');
  });

  it('Snapshot mínimo determinístico (FACT GENERAL)', () => {
    const xml = generateDTE(SAMPLE);
    // No es full snapshot — solo verifico fragmentos clave determinísticos.
    expect(xml).toContain('CodigoMoneda="GTQ"');
    expect(xml).toContain('Tipo="FACT"');
    expect(xml.indexOf('<dte:Items>')).toBeGreaterThan(-1);
    expect((xml.match(/<dte:Item /g) ?? []).length).toBe(2);
  });
});

describe('wrapWithCertification', () => {
  it('Inserta bloque <Certificacion> dentro de <DTE>', () => {
    const emisionXml = generateDTE(SAMPLE);
    const wrapped = wrapWithCertification(emisionXml, {
      nitCertificador: '99999999',
      nombreCertificador: 'TEST CERT',
      numeroAutorizacion: 'AUTH-XYZ',
      fechaCertificacion: new Date('2026-05-12T16:00:00.000Z'),
    });
    expect(wrapped).toContain('<dte:Certificacion>');
    expect(wrapped).toContain('AUTH-XYZ');
    // Bloque va ANTES de </dte:DTE>.
    const certIdx = wrapped.indexOf('<dte:Certificacion>');
    const dteCloseIdx = wrapped.indexOf('</dte:DTE>');
    expect(certIdx).toBeLessThan(dteCloseIdx);
  });
});
