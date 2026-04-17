'use client';

import { useEffect, useState } from 'react';
import { Package, Search, Plus, Edit2, ShieldAlert, FileSpreadsheet, Printer, Layers } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

import { ProductModal } from '@/components/inventory/ProductModal';
import { BundleModal } from '@/components/inventory/BundleModal';
import { CategoryModal } from '@/components/inventory/CategoryModal';
import { ImportExcelModal } from '@/components/inventory/ImportExcelModal';
import { PrintBarcodeModal } from '@/components/inventory/PrintBarcodeModal';
import { useBranchStore } from '@/stores/branchStore';

interface ProductData {
  id: string;
  sku: string;
  name: string;
  price: string;
  wholesalePrice: string | null;
  cost: string;
  stock: number;
  minStock: number;
  barcode: string | null;
  categoryId: string;
  category: { name: string };
  unitOfMeasure: string;
  isTaxExempt: boolean;
  isBundle?: boolean;
  hasVariants?: boolean;
}

export default function InventoryPage() {
  const [products, setProducts] = useState<ProductData[]>([]);
  const [query, setQuery] = useState('');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBundleModalOpen, setIsBundleModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductData | null>(null);

  const debouncedQuery = useDebounce(query, 500);
  const { selectedBranchId } = useBranchStore();

  useEffect(() => {
    let active = true;

    async function loadProducts() {
      setLoading(true);
      const branchQuery = selectedBranchId ? `&branchId=${selectedBranchId}` : '';
      const lowStockQuery = showLowStockOnly ? '&lowStock=true' : '';

      try {
        const res = await fetch(`/api/products?q=${encodeURIComponent(debouncedQuery)}&limit=50${branchQuery}${lowStockQuery}`);
        const data = await res.json();

        if (active) {
          setProducts(data.products || []);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadProducts();

    return () => {
      active = false;
    };
  }, [debouncedQuery, selectedBranchId, showLowStockOnly]);

  const refreshProducts = async () => {
    setLoading(true);
    try {
      const branchQuery = selectedBranchId ? `&branchId=${selectedBranchId}` : '';
      const lowStockQuery = showLowStockOnly ? '&lowStock=true' : '';
      const res = await fetch(`/api/products?q=${encodeURIComponent(debouncedQuery)}&limit=50${branchQuery}${lowStockQuery}`);
      const data = await res.json();
      setProducts(data.products || []);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (product: ProductData) => {
    setSelectedProduct(product);
    if (product.isBundle) {
       setIsBundleModalOpen(true);
    } else {
       setIsModalOpen(true);
    }
  };

  const handlePrintBarcode = (product: ProductData) => {
    setSelectedProduct(product);
    setIsPrintModalOpen(true);
  };

  const handleNew = () => {
    setSelectedProduct(null);
    setIsModalOpen(true);
  };

  const handleModalSuccess = () => {
    setIsModalOpen(false);
    void refreshProducts();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Package className="w-6 h-6 text-blue-600" />
            Control de Inventario
          </h1>
          <p className="text-[13px] text-slate-500 font-medium mt-1">Gestión integral del catálogo de productos y existencias</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsImportModalOpen(true)}
            className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100 px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-all flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Carga Masiva
          </button>
          <button 
            onClick={() => setIsCategoryModalOpen(true)}
            className="bg-white border text-slate-600 border-slate-200 hover:bg-slate-50 px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Categoría
          </button>
          <button onClick={() => { setSelectedProduct(null); setIsBundleModalOpen(true); }} className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-all flex items-center gap-2 active:scale-95">
            <Layers className="w-4 h-4 text-slate-400" />
            Nuevo Combo
          </button>
          <button onClick={handleNew} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-xl shadow-blue-500/10 transition-all flex items-center gap-2 active:scale-95">
            <Plus className="w-4 h-4" />
            Nuevo Producto
          </button>
        </div>
      </div>

      {/* Controles de Búsqueda */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm mb-6 flex gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por Nombre comercial, SKU o Código..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 border-2 border-slate-50 bg-slate-50/50 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-50 focus:border-blue-500 focus:bg-white transition-all text-sm font-semibold"
          />
        </div>
        <button
          onClick={() => setShowLowStockOnly((current) => !current)}
          className={`shrink-0 rounded-2xl px-4 py-3 text-sm font-bold transition ${showLowStockOnly ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/20' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
        >
          {showLowStockOnly ? 'Mostrando Bajo Stock' : 'Solo Bajo Stock'}
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-[10px] text-slate-500 bg-slate-50 uppercase tracking-widest sticky top-0 border-b border-slate-100 z-10">
              <tr>
                <th className="px-6 py-5 font-bold">SKU</th>
                <th className="px-6 py-5 font-bold">Producto</th>
                <th className="px-6 py-5 font-bold">Categoría</th>
                <th className="px-6 py-5 font-bold text-right">Precio</th>
                <th className="px-6 py-5 font-bold text-center">Stock</th>
                <th className="px-6 py-5 font-bold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-600">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Cargando Directorio de Inventario...
                  </td>
                </tr>
              ) : products.length > 0 ? (
                products.map((product) => {
                  const isLowStock = product.stock <= product.minStock;
                  return (
                    <tr key={product.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-5 font-mono text-slate-400 text-xs">{product.sku}</td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                           <span className="font-bold text-slate-800">{product.name}</span>
                           {product.isTaxExempt && <span className="px-1.5 py-0.5 bg-amber-50 text-amber-600 text-[9px] rounded-md uppercase font-bold tracking-widest border border-amber-100">Exento</span>}
                           {product.hasVariants && <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[9px] rounded-md uppercase font-bold tracking-widest border border-blue-100">Varientable</span>}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-slate-600 font-medium">{product.category.name}</td>
                      <td className="px-6 py-5 text-right">
                         {product.hasVariants ? (
                             <div className="font-bold text-blue-600 text-[10px] uppercase tracking-widest bg-blue-50 inline-block px-2.5 py-1 rounded-lg border border-blue-100">Variantes</div>
                         ) : (
                             <div className="flex flex-col items-end">
                                <span className="font-bold text-slate-900 text-sm">Q{Number(product.price).toFixed(2)}</span>
                                {product.wholesalePrice && <span className="text-[10px] text-blue-500 font-bold uppercase tracking-tight">Q{Number(product.wholesalePrice).toFixed(2)} Mayoreo</span>}
                             </div>
                         )}
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold ${
                          isLowStock 
                            ? 'bg-rose-50 text-rose-600 border border-rose-100/50' 
                            : 'bg-emerald-50 text-emerald-600 border border-emerald-100/50'
                        }`}>
                          {isLowStock && <ShieldAlert className="w-3 px-0" />}
                          {product.stock} <span className="text-[9px] opacity-60">{product.unitOfMeasure}</span>
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                           <button onClick={() => handlePrintBarcode(product)} title="Etiqueta" className="p-3 bg-slate-50 text-slate-400 hover:bg-slate-900 hover:text-white rounded-2xl transition-all shadow-sm hover:shadow-xl hover:shadow-slate-900/10 active:scale-90">
                             <Printer className="w-4 h-4" />
                           </button>
                           <button onClick={() => handleEdit(product)} title="Configuración" className="p-3 bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white rounded-2xl transition-all shadow-sm hover:shadow-xl hover:shadow-blue-500/10 active:scale-90">
                             <Edit2 className="w-4 h-4" />
                           </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-600">
                    No se encontraron productos en el directorio.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Modal Productos */}
      {isModalOpen && (
        <ProductModal 
          product={selectedProduct} 
          onClose={() => setIsModalOpen(false)} 
          onSuccess={handleModalSuccess} 
        />
      )}

      {/* Modal De Combos */}
      {isBundleModalOpen && (
        <BundleModal
          product={selectedProduct}
          onClose={() => setIsBundleModalOpen(false)}
          onSuccess={() => {
            setIsBundleModalOpen(false);
            void refreshProducts();
          }}
        />
      )}

      {/* Modal Categorías */}
      {isCategoryModalOpen && (
        <CategoryModal
          onClose={() => setIsCategoryModalOpen(false)}
          onSuccess={() => setIsCategoryModalOpen(false)}
        />
      )}

      {/* Modal Excel/CSV Import */}
      {isImportModalOpen && (
        <ImportExcelModal
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={() => {
            setIsImportModalOpen(false);
            void refreshProducts();
          }}
        />
      )}

      {/* Modal Impresión Código de Barras */}
      {isPrintModalOpen && selectedProduct && (
        <PrintBarcodeModal
          product={selectedProduct}
          onClose={() => setIsPrintModalOpen(false)}
        />
      )}
    </div>
  );
}
