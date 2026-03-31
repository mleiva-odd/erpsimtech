'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Printer, RefreshCw, BarChart3, TrendingUp, AlertCircle, Download, FileText, Lock } from 'lucide-react';
import { TicketModal } from '@/components/pos/TicketModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Payment {
  method: string;
  amount: number;
  reference: string | null;
}

interface Sale {
  id: string;
  total: number;
  discount: number;
  status: string;
  createdAt: string;
  user: { name: string };
  customer: { name: string } | null;
  branch?: { name: string } | null;
  payments: Payment[];
  items: any[];
}

export default function ReportsPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [register, setRegister] = useState<any>(null);
  
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [closingBalanceInput, setClosingBalanceInput] = useState('');
  const [isSubmittingClose, setIsSubmittingClose] = useState(false);

  const fetchSalesAndRegister = async () => {
    setIsLoading(true);
    try {
      const [resSales, resReg] = await Promise.all([
        fetch('/api/sales?limit=50'),
        fetch('/api/cash-register')
      ]);
      const dataSales = await resSales.json();
      const dataReg = await resReg.json();
      setSales(Array.isArray(dataSales) ? dataSales : []);
      if (dataReg.status === 'OPEN') setRegister(dataReg);
      else setRegister(null);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSalesAndRegister();
  }, []);

  const handleOpenCloseModal = () => {
    if (!register) return;
    setClosingBalanceInput('');
    setIsClosingModalOpen(true);
  };

  const handleConfirmClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!register || !closingBalanceInput) return;
    
    setIsSubmittingClose(true);
    try {
      const res = await fetch('/api/cash-register', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closingBalance: parseFloat(closingBalanceInput) })
      });
      if (res.ok) {
        setIsClosingModalOpen(false);
        fetchSalesAndRegister();
      } else {
         alert('Hubo un error al cerrar la caja.');
      }
    } catch(e) { console.error(e) } finally {
      setIsSubmittingClose(false);
    }
  };

  // --- CSV Export ---
  const exportCSV = () => {
    if (sales.length === 0) return;

    const headers = ['Ticket', 'Fecha', 'Cliente', 'Sucursal', 'Método de Pago', 'Atendido por', 'Descuento %', 'Total (Q)'];
    const rows = sales.map(sale => [
      sale.id.split('-')[0].toUpperCase(),
      format(new Date(sale.createdAt), "dd/MM/yyyy HH:mm"),
      sale.customer?.name || 'Consumidor Final',
      sale.branch?.name || '-',
      (sale.payments || []).map(p => `${p.method}:Q${Number(p.amount).toFixed(2)}`).join(' + '),
      sale.user?.name || 'Sistema',
      Number(sale.discount).toString(),
      Number(sale.total).toFixed(2),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_ventas_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- PDF Export ---
  const exportPDF = () => {
    if (sales.length === 0) return;
    const doc = new jsPDF();
    doc.text("Reporte de Ventas", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 21);

    const tableColumn = ["Ticket", "Fecha", "Cliente", "Método", "Total (Q)"];
    const tableRows: any[] = [];

    sales.forEach(sale => {
      const ticket = sale.id.split('-')[0].toUpperCase();
      const dateStr = format(new Date(sale.createdAt), "dd/MM/yyyy");
      const client = sale.customer?.name || "Consumidor Final";
      const meth = (sale.payments || []).map(p => p.method).join(',');
      const total = Number(sale.total).toFixed(2);
      tableRows.push([ticket, dateStr, client, meth, total]);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 25,
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
    });
    doc.save(`reporte_ventas_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
  };

  const totalSalesVolume = sales.reduce((acc, sale) => acc + Number(sale.total), 0);
  const totalDiscounts = sales.reduce((acc, sale) => acc + (Number(sale.discount) > 0 ? (Number(sale.total) / (1 - Number(sale.discount) / 100)) * (Number(sale.discount) / 100) : 0), 0);

  // Aggregate payment methods
  const paymentSummary = sales.reduce((acc, sale) => {
    (sale.payments || []).forEach(p => {
      acc[p.method] = (acc[p.method] || 0) + Number(p.amount);
    });
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reportes y Configuración de Caja</h1>
          <p className="text-sm text-slate-500">Historial reciente de transacciones y cierres operativos</p>
        </div>
        <div className="flex gap-2">
          {register && (
            <button
              onClick={handleOpenCloseModal}
              className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition font-medium text-sm shadow-sm"
            >
              Cerrar Turno de Caja
            </button>
          )}
          <button
            onClick={exportPDF}
            disabled={sales.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium text-sm shadow-sm disabled:opacity-50"
          >
            <FileText className="w-4 h-4" /> PDF
          </button>
          <button
            onClick={exportCSV}
            disabled={sales.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium text-sm shadow-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
          <button
            onClick={fetchSalesAndRegister}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition font-medium text-sm shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-green-100 text-green-600 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Volumen Ventas</p>
            <p className="text-2xl font-bold text-slate-800">Q{totalSalesVolume.toFixed(2)}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Transacciones</p>
            <p className="text-2xl font-bold text-slate-800">{sales.length}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Descuentos</p>
            <p className="text-2xl font-bold text-slate-800">Q{totalDiscounts.toFixed(2)}</p>
          </div>
        </div>

        {/* Payment breakdown */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <p className="text-sm font-medium text-slate-500 mb-2">Por método de pago</p>
          {Object.entries(paymentSummary).length > 0 ? (
            <div className="space-y-1">
              {Object.entries(paymentSummary).map(([method, amount]) => (
                <div key={method} className="flex justify-between text-xs">
                  <span className="text-slate-500">{method}</span>
                  <span className="font-bold text-slate-700">Q{amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-600">Sin datos</p>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-100">
                <th className="px-6 py-4 font-medium">Ticket / Fecha</th>
                <th className="px-6 py-4 font-medium">Cliente</th>
                <th className="px-6 py-4 font-medium">Sucursal</th>
                <th className="px-6 py-4 font-medium">Método</th>
                <th className="px-6 py-4 font-medium">Atendido por</th>
                <th className="px-6 py-4 font-medium text-right">Monto (Q)</th>
                <th className="px-6 py-4 font-medium text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-600 text-sm">
                    Cargando historial de ventas...
                  </td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-600 text-sm">
                    No hay transacciones registradas.
                  </td>
                </tr>
              ) : (
                sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4">
                      <div className="font-mono text-xs text-slate-600 mb-1">{sale.id.split('-')[0].toUpperCase()}</div>
                      <div className="text-sm font-medium text-slate-800">
                        {format(new Date(sale.createdAt), "dd MMM, HH:mm", { locale: es })}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {sale.customer ? sale.customer.name : <span className="text-slate-600 italic">Consumidor Final</span>}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {sale.branch?.name || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(sale.payments || []).map((p, idx) => (
                          <span key={idx} className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            p.method === 'CASH' ? 'bg-green-100 text-green-700' :
                            p.method === 'CARD' ? 'bg-blue-100 text-blue-700' :
                            'bg-purple-100 text-purple-700'
                          }`}>
                            {p.method}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {sale.user?.name || 'Sistema'}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-slate-800">
                      Q{Number(sale.total).toFixed(2)}
                      {Number(sale.discount) > 0 && (
                         <div className="text-[10px] text-green-600 font-normal">-{Number(sale.discount)}% desc.</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => setSelectedSaleId(sale.id)}
                        className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-blue-600 transition"
                        title="Imprimir Copia de Ticket"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedSaleId && (
        <TicketModal saleId={selectedSaleId} onClose={() => setSelectedSaleId(null)} />
      )}

      {/* Modal Moderno de Cierre de Caja */}
      {isClosingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col overflow-hidden animate-in fade-in duration-200">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50">
              <div className="w-10 h-10 bg-slate-800 text-white rounded-full flex items-center justify-center shrink-0 shadow-inner">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 leading-tight">Cerrar Turno</h2>
                <p className="text-xs text-slate-600 font-medium">Arqueo Final de Gaveta</p>
              </div>
            </div>

            <form onSubmit={handleConfirmClose} className="p-6">
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Efectivo Total Contado
              </label>
              <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                Ingresa el monto exacto de billetes y monedas que estás dejando en la caja antes de bloquear el sistema.
              </p>
              <div className="relative mb-6">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-lg">Q</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  autoFocus
                  value={closingBalanceInput}
                  onChange={(e) => setClosingBalanceInput(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:border-slate-800 focus:ring-1 focus:ring-slate-800 outline-none text-xl transition-colors font-black text-slate-900"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsClosingModalOpen(false)}
                  className="flex-1 py-3 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingClose || !closingBalanceInput}
                  className="flex-1 py-3 text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
                >
                  {isSubmittingClose ? (
                    <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  ) : null}
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
