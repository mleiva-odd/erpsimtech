/**
 * Generador de PDF de Representación Impresa del DTE (FEL · GT) · Fase 22c-2.
 *
 * Usa `jspdf` + `jspdf-autotable` (ya disponibles en el proyecto desde Fase 14).
 * El PDF es una "representación gráfica del DTE" — SAT acepta cualquier formato
 * razonable mientras incluya: número de autorización, UUID, fecha de certificación,
 * NIT emisor/receptor, detalle de ítems, IVA y totales.
 *
 * El XML firmado sigue siendo el documento legal; el PDF es solo cortesía para
 * el cliente final.
 *
 * Retorna un `Buffer` con el PDF binario, listo para enviar como
 * `application/pdf`.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { pdfFormatFromDataUrl } from '@/lib/branding/logo';

export interface FelPdfItem {
  description: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
}

export interface FelPdfInput {
  /** Tipo de DTE en formato legible para el encabezado (ej "FACTURA ELECTRÓNICA"). */
  documentTypeLabel: string;
  /** Número de DTE para mostrar al cliente (ej "A-000123"). */
  numeroDisplay: string;
  /** UUID asignado por SAT/provider. */
  dteUuid: string | null;
  autorizacion: string | null;
  fechaCertificacion: Date | null;
  /** Estado del DTE — si es CANCELLED se marca como ANULADO grande sobre el PDF. */
  status: 'PENDING' | 'CERTIFIED' | 'REJECTED' | 'CANCELLED' | string;
  /** Régimen fiscal del emisor (etiqueta legible). */
  taxRegimeLabel: string;
  /** Nombre del provider certificador (Mock/Infile/Digifact). */
  providerName: string;
  emisor: {
    nit: string;
    nombre: string;
    direccion?: string | null;
    nombreComercial?: string | null;
    /**
     * Logo de la empresa en formato Data URL (data:image/png;base64,...).
     * Pre-procesado por el caller via `fetchLogoAsDataUrl` para no hacer
     * async esta función. Opcional — si no se pasa, el PDF se renderea sin logo.
     */
    logoDataUrl?: string | null;
  };
  receptor: {
    nit: string;
    nombre: string;
    direccion?: string | null;
  };
  items: FelPdfItem[];
  totals: {
    subtotal: number;
    tax: number;
    total: number;
    currency: string;
  };
}

function fmt(n: number): string {
  return n.toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function dateStr(d: Date | null): string {
  if (!d) return '-';
  return d.toLocaleString('es-GT', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function generateFelPdf(input: FelPdfInput): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const pageWidth = 215.9; // Letter en mm
  const m = 15;

  // Fase 29 · Logo en esquina superior izquierda (si está disponible).
  // El nombre del emisor se desplaza a la derecha del logo cuando existe.
  let headerLeftOffset = m; // posición x del texto "nombre emisor"
  const LOGO_W = 25; // mm
  const LOGO_H = 18;
  if (input.emisor.logoDataUrl) {
    try {
      const format = pdfFormatFromDataUrl(input.emisor.logoDataUrl);
      doc.addImage(input.emisor.logoDataUrl, format, m, m, LOGO_W, LOGO_H);
      headerLeftOffset = m + LOGO_W + 4;
    } catch {
      // Si addImage falla por formato inválido, seguimos sin logo.
    }
  }

  // Header — Emisor
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(input.emisor.nombre, headerLeftOffset, m + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let y = m + 11;
  if (input.emisor.nombreComercial) {
    doc.text(input.emisor.nombreComercial, headerLeftOffset, y);
    y += 4;
  }
  doc.text(`NIT: ${input.emisor.nit}`, headerLeftOffset, y);
  y += 4;
  if (input.emisor.direccion) {
    doc.text(input.emisor.direccion, headerLeftOffset, y, { maxWidth: 110 });
    y += 4;
  }
  doc.text(`Régimen: ${input.taxRegimeLabel}`, headerLeftOffset, y);
  y += 4;
  doc.text(`Certificador: ${input.providerName}`, headerLeftOffset, y);

  // Title block (right side)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(input.documentTypeLabel.toUpperCase(), pageWidth - m, m + 6, { align: 'right' });
  doc.setFontSize(13);
  doc.text(input.numeroDisplay, pageWidth - m, m + 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Fecha cert.: ${dateStr(input.fechaCertificacion)}`, pageWidth - m, m + 17, { align: 'right' });
  doc.text(`Autorización: ${input.autorizacion ?? '-'}`, pageWidth - m, m + 21, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.text('UUID:', pageWidth - m - 70, m + 26);
  doc.setFont('helvetica', 'normal');
  doc.text(input.dteUuid ?? '-', pageWidth - m, m + 26, { align: 'right' });

  // Receptor block
  const receptorY = Math.max(y, m + 30) + 8;
  doc.setDrawColor(200);
  doc.line(m, receptorY - 4, pageWidth - m, receptorY - 4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('RECEPTOR', m, receptorY);
  doc.setFont('helvetica', 'normal');
  doc.text(`Nombre: ${input.receptor.nombre}`, m, receptorY + 5);
  doc.text(`NIT: ${input.receptor.nit}`, m, receptorY + 10);
  if (input.receptor.direccion) {
    doc.text(`Dirección: ${input.receptor.direccion}`, m, receptorY + 15, { maxWidth: 180 });
  }

  // Items table
  const itemsStartY = receptorY + 22;
  autoTable(doc, {
    startY: itemsStartY,
    head: [['Código', 'Descripción', 'Cant.', 'P.Unit', 'Desc.', 'Subtotal', 'IVA', 'Total']],
    body: input.items.map((it) => [
      it.sku,
      it.description,
      String(it.quantity),
      fmt(it.unitPrice),
      fmt(it.discount),
      fmt(it.subtotal),
      fmt(it.tax),
      fmt(it.total),
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 'auto' },
      2: { halign: 'right', cellWidth: 14 },
      3: { halign: 'right', cellWidth: 18 },
      4: { halign: 'right', cellWidth: 16 },
      5: { halign: 'right', cellWidth: 22 },
      6: { halign: 'right', cellWidth: 18 },
      7: { halign: 'right', cellWidth: 22 },
    },
    margin: { left: m, right: m },
  });

  // Totals
  const afterTable = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  const totalsY = (afterTable?.finalY ?? itemsStartY + 10) + 6;
  const cur = input.totals.currency || 'GTQ';

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Subtotal', pageWidth - m - 50, totalsY);
  doc.text(`${cur} ${fmt(input.totals.subtotal)}`, pageWidth - m, totalsY, { align: 'right' });

  doc.text('IVA', pageWidth - m - 50, totalsY + 5);
  doc.text(`${cur} ${fmt(input.totals.tax)}`, pageWidth - m, totalsY + 5, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TOTAL', pageWidth - m - 50, totalsY + 12);
  doc.text(`${cur} ${fmt(input.totals.total)}`, pageWidth - m, totalsY + 12, { align: 'right' });

  // Footer legal
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text(
    'Representación gráfica del DTE. El documento legal es el XML firmado disponible en el portal SAT.',
    pageWidth / 2,
    280,
    { align: 'center' },
  );

  // Cancelled watermark
  if (input.status === 'CANCELLED') {
    doc.setTextColor(220, 38, 38);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(60);
    // Rotación manual con `angle` no es nativa en jspdf clásico; usamos texto plano grande.
    doc.text('ANULADO', pageWidth / 2, 150, { align: 'center' });
    doc.setTextColor(0);
  }

  const ab = doc.output('arraybuffer');
  return Buffer.from(ab);
}
