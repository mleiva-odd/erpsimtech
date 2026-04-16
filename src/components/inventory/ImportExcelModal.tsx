'use client';

import { useState } from 'react';
import { X, UploadCloud, Download, FileSpreadsheet, AlertCircle, Loader2 } from 'lucide-react';
import Papa from 'papaparse';
import { useToast } from '@/components/ui/toast';

interface ImportExcelModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportExcelModal({ onClose, onSuccess }: ImportExcelModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleDownloadTemplate = () => {
    const headers = "name,variantName,sku,barcode,categoryName,price,wholesalePrice,cost,stock,minStock,unitOfMeasure,isTaxExempt\n" + 
                    "Silla Ergonómica Normal,,SILLA-001,894912,Muebles,800.00,750.00,500.00,10,3,UNIT,FALSE\n" +
                    "Camisa Polo Matriz,Talla S,POLOM-S,894913,Ropa,150.00,100.00,50.00,50,10,UNIT,FALSE\n" +
                    "Camisa Polo Matriz,Talla M,POLOM-M,894914,Ropa,150.00,100.00,50.00,30,10,UNIT,FALSE";
    const blob = new Blob([headers], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute("download", "Plantilla_Migracion_SIMTECH.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const processImport = () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        if (results.errors.length > 0) {
          setError('El archivo tiene errores de formato en algunas filas.');
          setLoading(false);
          return;
        }

        try {
          const res = await fetch('/api/products/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ products: results.data })
          });

          const data = await res.json();
          if (res.ok) {
            toast({ tone: 'success', message: `Migración completada. ${data.inserted} productos procesados.` });
            onSuccess();
          } else {
            setError(data.error || 'Error subiendo los productos.');
          }
        } catch (e) {
          setError('Corte de conexión detectado.');
        } finally {
          setLoading(false);
        }
      },
      error: () => {
        setError('No se pudo leer el archivo Excel/CSV.');
        setLoading(false);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border border-slate-100 animate-in fade-in zoom-in duration-300">
        {/* Header */}
        <div className="px-8 pt-8 pb-4 flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Migración Masiva</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Importación de Inventario vía Excel / CSV</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-8 py-4 flex flex-col gap-6">
          <div className="bg-blue-50/50 border border-blue-100 p-6 rounded-2xl flex items-start gap-4">
            <div className="w-10 h-10 bg-blue-100 translate-y-1 rounded-xl flex items-center justify-center shrink-0">
               <Download className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-sm text-slate-600">
              <p className="font-bold text-slate-800 mb-1 uppercase tracking-wider text-[11px]">Paso 1: Configura tu plantilla</p>
              <p className="leading-relaxed">Descarga nuestra plantilla máster, llénala manteniendo las columnas intactas y guárdala como <b>.CSV</b>.</p>
              <button onClick={handleDownloadTemplate} className="mt-3 flex items-center gap-2 text-blue-600 font-bold hover:text-blue-700 transition-colors uppercase text-[10px] tracking-widest">
                Bajar Plantilla Maestra
              </button>
            </div>
          </div>

          <div className="border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-white hover:border-blue-400 hover:shadow-xl hover:shadow-blue-500/5 transition-all p-8 rounded-[2rem] flex flex-col items-center justify-center text-center group cursor-pointer relative overflow-hidden">
            <input type="file" accept=".csv" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
            <div className="w-16 h-16 bg-white shadow-sm border border-slate-100 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <UploadCloud className="w-8 h-8 text-blue-600" />
            </div>
            {file ? (
              <div>
                <p className="font-bold text-slate-900 text-lg tracking-tight">{file.name}</p>
                <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mt-1">{(file.size / 1024).toFixed(1)} KB - Listo para inyectar</p>
              </div>
            ) : (
              <div>
                <p className="font-bold text-slate-800 text-lg mb-1 tracking-tight">Seleccionar Archivo CSV</p>
                <p className="text-xs font-medium text-slate-400">O arrastra el documento aquí</p>
              </div>
            )}
          </div>

          {error && <div className="text-rose-600 text-[11px] font-bold uppercase tracking-wider bg-rose-50 p-4 rounded-2xl border border-rose-100 text-center animate-shake">{error}</div>}
        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex justify-end gap-4 rounded-b-[2rem]">
          <button 
            type="button" 
            onClick={onClose} 
            disabled={loading} 
            className="px-6 py-3 text-slate-500 font-bold rounded-2xl hover:bg-slate-100 transition-all text-sm"
          >
            Cancelar
          </button>
          <button 
            onClick={processImport} 
            disabled={!file || loading} 
            className="flex items-center gap-2.5 px-10 py-3.5 bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-500/20 text-white rounded-2xl font-bold transition-all active:scale-95 disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed text-sm"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />} 
            Inyectar Datos
          </button>
        </div>
      </div>
    </div>
  );
}
