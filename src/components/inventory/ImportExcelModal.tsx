'use client';

import { useState } from 'react';
import { X, UploadCloud, Download, FileSpreadsheet, AlertCircle, Loader2 } from 'lucide-react';
import Papa from 'papaparse';

interface ImportExcelModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportExcelModal({ onClose, onSuccess }: ImportExcelModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownloadTemplate = () => {
    const headers = "name,sku,barcode,categoryName,price,wholesalePrice,cost,stock,minStock,unitOfMeasure,isTaxExempt\n" + 
                    "Silla Ergonómica,SILLA-001,894912,Muebles,800.00,750.00,500.00,10,3,UNIT,FALSE";
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
            alert(`¡Éxito! Migración completada. ${data.inserted} productos procesados.`);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col scale-100 transition-transform">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-blue-600">
          <h2 className="font-bold text-lg text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-200" /> 
            Migración Masiva (Excel / CSV)
          </h2>
          <button onClick={onClose} className="text-blue-100 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-8 flex flex-col gap-6">
          <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-sm text-slate-600">
              <p className="font-bold text-slate-800 mb-1">Paso 1: Configura tus columnas de Excel</p>
              Instrucciones: Descarga nuestra plantilla máster. Llénala manteniendo los nombres de las columnas intactos en la fila 1 y luego guárdala como un archivo <b>.CSV (Delimitado por comas)</b>.
              <button onClick={handleDownloadTemplate} className="mt-3 flex items-center gap-2 text-blue-600 font-bold hover:underline">
                <Download className="w-4 h-4" /> Bajar Plantilla Maestra
              </button>
            </div>
          </div>

          <div className="border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 transition-colors p-8 rounded-2xl flex flex-col items-center justify-center text-center group cursor-pointer relative">
            <input type="file" accept=".csv" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            <div className="w-14 h-14 bg-white shadow-sm border border-slate-200 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <UploadCloud className="w-7 h-7 text-blue-500" />
            </div>
            {file ? (
              <div>
                <p className="font-bold text-slate-800 text-lg">{file.name}</p>
                <p className="text-sm text-slate-500">{(file.size / 1024).toFixed(1)} KB - Listo para inyectar</p>
              </div>
            ) : (
              <div>
                <p className="font-bold text-slate-700 text-lg mb-1">Arrastra tu Archivo CSV aquí</p>
                <p className="text-sm text-slate-500">O haz clic para explorar tus documentos</p>
              </div>
            )}
          </div>

          {error && <div className="text-red-600 text-sm font-bold bg-red-50 p-3 rounded-xl border border-red-100 text-center">{error}</div>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={loading} className="px-5 py-2.5 text-slate-600 hover:bg-white border border-slate-200 shadow-sm rounded-xl font-medium transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={processImport} disabled={!file || loading} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/20 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:grayscale">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />} 
            Inyectar Datos
          </button>
        </div>
      </div>
    </div>
  );
}
