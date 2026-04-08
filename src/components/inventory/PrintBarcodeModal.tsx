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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 print:bg-white print:p-0">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col print:shadow-none print:w-full print:max-w-none">
        {/* Header no se imprime */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-800 text-white rounded-t-2xl print:hidden">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <PrinterIcon className="w-5 h-5" /> Generador de Etiquetas
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
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
             <div className="font-black text-lg text-black">Q{Number(product.price).toFixed(2)}</div>
          </div>
          
          <p className="text-xs text-slate-400 mt-6 print:hidden text-center">
            Ajusta tu impresora a tamaño (60x40mm) o etiquetas estándar en la configuración del navegador.
          </p>
        </div>

        {/* Footer no se imprime */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end items-center bg-slate-50 rounded-b-2xl print:hidden">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-slate-600 hover:bg-white border border-slate-200 rounded-xl font-medium transition-colors">
              Cerrar
            </button>
            <button onClick={handlePrint} className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 text-white rounded-xl font-bold transition-all">
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
