/**
 * Generador de XML DTE según spec SAT Guatemala.
 *
 * Referencia: https://portal.sat.gob.gt/portal/factura-electronica/
 *
 * Estructura mínima:
 *   <GTDocumento>
 *     <SAT>
 *       <DTE>
 *         <DatosEmision>
 *           <DatosGenerales>
 *           <Emisor>
 *           <Receptor>
 *           <Frases>           (régimen + exenciones)
 *           <Items>
 *             <Item>
 *               <Impuestos>
 *           <Totales>
 *         <Certificacion>      (rellenado por el provider/SAT)
 *
 * Este generador construye el XML SIN certificación — los providers (Mock,
 * Infile, Digifact) son quienes envuelven el `<DatosEmision>` con el bloque
 * `<Certificacion>` después de validar. Para Mock, el provider mismo construye
 * un bloque `<Certificacion>` fake determinístico.
 */

import type { CertifyInput, FelEmisor, FelReceptor, FelItem } from './types';

/** Escapa los 5 caracteres XML problemáticos. */
function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmtNumber(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function fmtDate(d: Date): string {
  // ISO sin milisegundos ni Z (SAT usa formato local con offset; acá uso UTC
  // simplificado — el provider real ajusta).
  return d.toISOString().replace(/\.\d{3}Z$/, '');
}

function regimeToAffiliation(regime: 'GENERAL' | 'PEQUENO_CONTRIBUYENTE'): string {
  return regime === 'GENERAL' ? 'GEN' : 'PEQ';
}

function buildEmisor(emisor: FelEmisor): string {
  return [
    `<dte:Emisor`,
    ` AfiliacionIVA="${regimeToAffiliation(emisor.taxRegime)}"`,
    ` CodigoEstablecimiento="${escapeXml(emisor.codigoEstablecimiento)}"`,
    ` NITEmisor="${escapeXml(emisor.nit)}"`,
    ` NombreEmisor="${escapeXml(emisor.nombre)}"`,
    emisor.nombreComercial ? ` NombreComercial="${escapeXml(emisor.nombreComercial)}"` : '',
    `>`,
    emisor.direccion
      ? `<dte:DireccionEmisor><dte:Direccion>${escapeXml(emisor.direccion)}</dte:Direccion></dte:DireccionEmisor>`
      : '',
    `</dte:Emisor>`,
  ].join('');
}

function buildReceptor(receptor: FelReceptor): string {
  return [
    `<dte:Receptor`,
    ` IDReceptor="${escapeXml(receptor.nit)}"`,
    ` NombreReceptor="${escapeXml(receptor.nombre)}"`,
    `>`,
    receptor.direccion
      ? `<dte:DireccionReceptor><dte:Direccion>${escapeXml(receptor.direccion)}</dte:Direccion></dte:DireccionReceptor>`
      : '',
    `</dte:Receptor>`,
  ].join('');
}

function buildFrases(emisor: FelEmisor, anyExempt: boolean): string {
  // Frase tipo 1 = régimen del emisor (escenario 1 General, escenario 2 Pequeño).
  const escenario = emisor.taxRegime === 'GENERAL' ? 1 : 2;
  let xml = `<dte:Frases><dte:Frase TipoFrase="1" CodigoEscenario="${escenario}"/>`;
  if (anyExempt) {
    // Frase tipo 4 código 1 = exención IVA por producto.
    xml += `<dte:Frase TipoFrase="4" CodigoEscenario="1"/>`;
  }
  xml += `</dte:Frases>`;
  return xml;
}

function buildItem(item: FelItem): string {
  // Impuesto IVA. Si exento, NombreCorto IVA con MontoImpuesto=0.
  const impuesto = `
    <dte:Impuestos>
      <dte:Impuesto>
        <dte:NombreCorto>IVA</dte:NombreCorto>
        <dte:CodigoUnidadGravable>${item.isTaxExempt ? 2 : 1}</dte:CodigoUnidadGravable>
        <dte:MontoGravable>${fmtNumber(item.precio)}</dte:MontoGravable>
        <dte:MontoImpuesto>${fmtNumber(item.iva)}</dte:MontoImpuesto>
      </dte:Impuesto>
    </dte:Impuestos>`;
  return [
    `<dte:Item NumeroLinea="${item.numeroLinea}" BienOServicio="${item.bienOServicio}">`,
    `<dte:Cantidad>${fmtNumber(item.cantidad, 3)}</dte:Cantidad>`,
    item.unidadMedida ? `<dte:UnidadMedida>${escapeXml(item.unidadMedida)}</dte:UnidadMedida>` : '',
    `<dte:Descripcion>${escapeXml(item.descripcion)}</dte:Descripcion>`,
    `<dte:PrecioUnitario>${fmtNumber(item.precioUnitario)}</dte:PrecioUnitario>`,
    `<dte:Precio>${fmtNumber(item.cantidad * item.precioUnitario)}</dte:Precio>`,
    `<dte:Descuento>${fmtNumber(item.descuento)}</dte:Descuento>`,
    impuesto,
    `<dte:Total>${fmtNumber(item.total)}</dte:Total>`,
    `</dte:Item>`,
  ].join('');
}

function buildReferencia(ref: NonNullable<CertifyInput['documentoReferencia']>): string {
  return [
    `<dte:Complementos>`,
    `<dte:Complemento IDComplemento="ReferenciasNota" NombreComplemento="ReferenciasNota">`,
    `<cno:ReferenciasNota`,
    ` xmlns:cno="http://www.sat.gob.gt/face2/ComplementoReferenciaNota/0.1.0"`,
    ` NumeroAutorizacionDocumentoOrigen="${escapeXml(ref.uuid)}"`,
    ` SerieDocumentoOrigen="${escapeXml(ref.serie)}"`,
    ` NumeroDocumentoOrigen="${ref.numero}"`,
    ` FechaEmisionDocumentoOrigen="${fmtDate(ref.fechaEmision)}"`,
    ` MotivoAjuste="${escapeXml(ref.motivo)}"`,
    `/>`,
    `</dte:Complemento>`,
    `</dte:Complementos>`,
  ].join('');
}

/**
 * Construye el XML sin el bloque `<Certificacion>`. El provider lo envuelve
 * antes de retornar.
 */
export function generateDTE(input: CertifyInput): string {
  const { type, seriePrefix, numero, fechaEmision, emisor, receptor, items, totales } = input;
  const anyExempt = items.some((i) => i.isTaxExempt);
  const tipoDte = type; // FACT | NCRE | NDEB

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<dte:GTDocumento xmlns:dte="http://www.sat.gob.gt/dte/fel/0.2.0" Version="0.1">`,
    `<dte:SAT ClaseDocumento="dte">`,
    `<dte:DTE ID="DatosCertificados">`,
    `<dte:DatosEmision ID="DatosEmision">`,

    // Datos Generales
    `<dte:DatosGenerales`,
    ` CodigoMoneda="GTQ"`,
    ` FechaHoraEmision="${fmtDate(fechaEmision)}"`,
    ` Tipo="${tipoDte}"`,
    `/>`,

    buildEmisor(emisor),
    buildReceptor(receptor),
    buildFrases(emisor, anyExempt),

    // Items
    `<dte:Items>`,
    items.map(buildItem).join(''),
    `</dte:Items>`,

    // Totales
    `<dte:Totales>`,
    `<dte:TotalImpuestos>`,
    `<dte:TotalImpuesto NombreCorto="IVA" TotalMontoImpuesto="${fmtNumber(totales.totalIva)}"/>`,
    `</dte:TotalImpuestos>`,
    `<dte:GranTotal>${fmtNumber(totales.granTotal)}</dte:GranTotal>`,
    `</dte:Totales>`,

    // Complemento de referencia para NCRE/NDEB
    input.documentoReferencia ? buildReferencia(input.documentoReferencia) : '',

    // Serie/correlativo interno como atributo descriptivo (no estándar SAT;
    // SAT solo numera al certificar, pero el provider real espera que el
    // emisor mande su correlativo interno). Lo dejamos como elemento custom.
    `<dte:Adenda>`,
    `<simtech:CorrelativoInterno`,
    ` xmlns:simtech="https://simtech.app/fel/0.1"`,
    ` Serie="${escapeXml(seriePrefix)}"`,
    ` Numero="${numero}"`,
    `/>`,
    `</dte:Adenda>`,

    `</dte:DatosEmision>`,
    `</dte:DTE>`,
    `</dte:SAT>`,
    `</dte:GTDocumento>`,
  ].join('');

  return xml;
}

/**
 * Envuelve el XML de emisión en un `<dte:Certificacion>` (usado por
 * MockProvider). En providers reales este bloque viene firmado por el
 * certificador y NO se genera localmente.
 */
export function wrapWithCertification(
  xmlEmision: string,
  cert: {
    nitCertificador: string;
    nombreCertificador: string;
    numeroAutorizacion: string;
    fechaCertificacion: Date;
  },
): string {
  const certBlock = [
    `<dte:Certificacion>`,
    `<dte:NITCertificador>${escapeXml(cert.nitCertificador)}</dte:NITCertificador>`,
    `<dte:NombreCertificador>${escapeXml(cert.nombreCertificador)}</dte:NombreCertificador>`,
    `<dte:NumeroAutorizacion`,
    ` Numero="${escapeXml(cert.numeroAutorizacion)}"`,
    ` Serie="MOCK"`,
    `>${escapeXml(cert.numeroAutorizacion)}</dte:NumeroAutorizacion>`,
    `<dte:FechaHoraCertificacion>${fmtDate(cert.fechaCertificacion)}</dte:FechaHoraCertificacion>`,
    `</dte:Certificacion>`,
  ].join('');

  // Insertamos el bloque de certificación dentro de <dte:DTE> justo después
  // de </dte:DatosEmision>.
  return xmlEmision.replace('</dte:DTE>', `${certBlock}</dte:DTE>`);
}
