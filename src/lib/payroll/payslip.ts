/**
 * Generador de boleta de pago (payslip) en PDF · Fase 18.
 *
 * Usa `jspdf` + `jspdf-autotable` (ya disponibles del Fase 14/16).
 * Layout estándar GT:
 *   - Header: empresa, NIT, dirección, período.
 *   - Empleado: nombre, DPI, NIT, cargo, fecha contratación.
 *   - Ingresos: sueldo, bonificación, horas extras, comisiones.
 *   - Deducciones: IGSS, ISR, préstamo, otros.
 *   - Totales: bruto, deducciones, NETO.
 *   - Firmas: empleado / empresa.
 *
 * Retorna `Buffer` con el PDF.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { pdfFormatFromDataUrl } from '@/lib/branding/logo';

export interface PayslipInput {
  company: {
    name: string;
    nit?: string | null;
    address?: string | null;
    /**
     * Logo de la empresa en Data URL (pre-procesado por el caller via
     * `fetchLogoAsDataUrl`). Si null/undefined, no se muestra logo.
     */
    logoDataUrl?: string | null;
  };
  payroll: {
    name: string;
    startDate: Date;
    endDate: Date;
    payrollType: string;
  };
  employee: {
    firstName: string;
    lastName: string;
    documentId?: string | null;
    nit?: string | null;
    position?: string | null;
    hireDate: Date;
  };
  item: {
    baseSalary: number;
    bonusIncentive: number;
    overtimeRegularAmount: number;
    overtimeNightAmount: number;
    overtimeHolidayAmount: number;
    seventhDayAmount: number;
    commissions: number;
    otherBonuses: number;
    totalGross: number;
    igssLaboral: number;
    isr: number;
    loanDeduction: number;
    otherDeductions: number;
    totalDeductions: number;
    netSalary: number;
  };
}

function fmt(n: number): string {
  return `Q ${n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function generatePayslipPdf(input: PayslipInput): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const m = 15;

  // Fase 29 · Logo en esquina superior izquierda.
  let headerLeftOffset = m;
  const LOGO_W = 25;
  const LOGO_H = 18;
  if (input.company.logoDataUrl) {
    try {
      const format = pdfFormatFromDataUrl(input.company.logoDataUrl);
      doc.addImage(input.company.logoDataUrl, format, m, m, LOGO_W, LOGO_H);
      headerLeftOffset = m + LOGO_W + 4;
    } catch {
      // Falla silenciosa si el logo es inválido.
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(input.company.name, headerLeftOffset, m + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  if (input.company.nit) doc.text(`NIT: ${input.company.nit}`, headerLeftOffset, m + 12);
  if (input.company.address) doc.text(input.company.address, headerLeftOffset, m + 17);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('BOLETA DE PAGO', 210 / 2, m + 30, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `Período: ${dateStr(input.payroll.startDate)} al ${dateStr(input.payroll.endDate)}  ·  Tipo: ${input.payroll.payrollType}`,
    210 / 2,
    m + 36,
    { align: 'center' },
  );

  // Employee block.
  let y = m + 46;
  doc.setFont('helvetica', 'bold');
  doc.text('Empleado:', m, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${input.employee.firstName} ${input.employee.lastName}`, m + 28, y);
  y += 5;
  if (input.employee.documentId) {
    doc.text(`DPI: ${input.employee.documentId}`, m, y);
    y += 5;
  }
  if (input.employee.nit) {
    doc.text(`NIT: ${input.employee.nit}`, m, y);
    y += 5;
  }
  if (input.employee.position) {
    doc.text(`Cargo: ${input.employee.position}`, m, y);
    y += 5;
  }
  doc.text(`Fecha contratación: ${dateStr(input.employee.hireDate)}`, m, y);
  y += 7;

  // Ingresos
  const ingresosAll: Array<[string, number]> = [
    ['Sueldo ordinario', input.item.baseSalary],
    ['Bonificación incentivo', input.item.bonusIncentive],
    ['Horas extras diurnas', input.item.overtimeRegularAmount],
    ['Horas extras nocturnas', input.item.overtimeNightAmount],
    ['Horas extras feriado', input.item.overtimeHolidayAmount],
    ['Séptimo día', input.item.seventhDayAmount],
    ['Comisiones', input.item.commissions],
    ['Otros bonos', input.item.otherBonuses],
  ];
  const ingresos = ingresosAll.filter((row) => row[1] > 0);

  autoTable(doc, {
    startY: y,
    head: [['Ingresos', 'Monto']],
    body: ingresos.map((row) => [row[0], fmt(row[1])]),
    foot: [['Total bruto', fmt(input.item.totalGross)]],
    headStyles: { fillColor: [60, 60, 60] },
    footStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: 'bold' },
    styles: { fontSize: 9 },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: m, right: m },
  });

  const lastY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y + 50;
  const y2 = lastY + 5;

  const deduccionesAll: Array<[string, number]> = [
    ['IGSS laboral (4.83%)', input.item.igssLaboral],
    ['ISR retención', input.item.isr],
    ['Préstamo', input.item.loanDeduction],
    ['Otras deducciones', input.item.otherDeductions],
  ];
  const deducciones = deduccionesAll.filter((row) => row[1] > 0);

  autoTable(doc, {
    startY: y2,
    head: [['Deducciones', 'Monto']],
    body: deducciones.map((row) => [row[0], fmt(row[1])]),
    foot: [['Total deducciones', fmt(input.item.totalDeductions)]],
    headStyles: { fillColor: [60, 60, 60] },
    footStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: 'bold' },
    styles: { fontSize: 9 },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: m, right: m },
  });

  const lastY2 = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y2 + 30;
  const y3 = lastY2 + 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`NETO A PAGAR: ${fmt(input.item.netSalary)}`, 210 - m, y3, {
    align: 'right',
  });

  // Firmas
  const ySig = y3 + 30;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.line(m, ySig, m + 70, ySig);
  doc.text('Recibí conforme — Empleado', m, ySig + 5);
  doc.line(210 - m - 70, ySig, 210 - m, ySig);
  doc.text('Empresa', 210 - m - 70, ySig + 5);

  const ab = doc.output('arraybuffer');
  return Buffer.from(ab);
}
