'use client';

import { X, Printer as PrinterIcon } from 'lucide-react';
import Barcode from 'react-barcode';

interface ProductData {
  name: string;
  sku: string;
  barcode: string | null;
  price: string | number;
}

interface PrintBarcodeModalProps {
  product: ProductData;
  onClose: () => void;
}

export function PrintBarcodeModal({ product, onClose }: PrintBarcodeModalProps) {
  const barcodeValue = product.barcode || product.sku;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 print:bg-white print:p-0">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md flex flex-col border border-slate-100 print:shadow-none print:w-full print:max-w-none animate-in fade-in zoom-in duration-300">
        {/* Header no se imprime */}
        <div className="px-8 pt-8 pb-4 flex justify-between items-start print:hidden">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Etiquetas</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Generador de Códigos de Barras</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Zona de Impresión */}
        <div className="p-8 flex flex-col items-center print:p-0 print:items-start" id="printable-barcode">
          <div className="text-center w-[60mm] print:w-[60mm] print:h-[40mm] flex flex-col items-center justify-center overflow-hidden bg-white border-2 border-dashed border-slate-200 print:border-none p-2 rounded-xl">
             <div className="font-bold text-sm text-black uppercase truncate w-full text-center mb-1 leading-tight">{product.name}</div>
             <div className="w-full flex justify-center scale-75 origin-top mb-1">
               <Barcode value={barcodeValue} width={2} height={40} fontSize={12} margin={0} displayValue={true} />
             </div>
             <div className="font-bold text-lg text-black">Q{Number(product.price).toFixed(2)}</div>
          </div>
          
          <p className="text-xs text-slate-400 mt-6 print:hidden text-center">
            Ajusta tu impresora a tamaño (60x40mm) o etiquetas estándar en la configuración del navegador.
          </p>
        </div>

        {/* Footer no se imprime */}
        <div className="px-8 py-6 border-t border-slate-100 flex gap-4 justify-end items-center bg-slate-50/50 rounded-b-[2rem] print:hidden">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-6 py-3 text-slate-500 font-bold rounded-2xl hover:bg-slate-100 transition-all text-sm"
            >
              Cerrar
            </button>
            <button 
              onClick={handlePrint} 
              className="flex items-center gap-2.5 px-10 py-3.5 bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-500/20 text-white rounded-2xl font-bold transition-all active:scale-95 text-sm"
            >
              <PrinterIcon className="w-4 h-4" /> 
              Imprimir Ahora
            </button>
        </div>
      </div>
      
      {/* Estilos específicos de impresión */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-barcode, #printable-barcode * {
            visibility: visible;
          }
          #printable-barcode {
            position: absolute;
            left: 0;
            top: 0;
            margin: 0;
            padding: 0;
          }
          @page {
            size: 60mm 40mm; /* Tamaño estándar de etiquetas POS */
            margin: 0mm;
          }
        }
      `}} />
    </div>
  );
}
