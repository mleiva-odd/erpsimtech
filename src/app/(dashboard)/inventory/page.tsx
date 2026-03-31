'use client';

import { useEffect, useState } from 'react';
import { Package, Search, Plus, Edit2, ShieldAlert } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

import { ProductModal } from '@/components/inventory/ProductModal';
import { CategoryModal } from '@/components/inventory/CategoryModal';

interface ProductData {
  id: string;
  sku: string;
  name: string;
  price: string;
  cost: string;
  stock: number;
  minStock: number;
  barcode: string | null;
  categoryId: string;
  category: { name: string };
}

export default function InventoryPage() {
  const [products, setProducts] = useState<ProductData[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductData | null>(null);

  const debouncedQuery = useDebounce(query, 500);

  const fetchProducts = () => {
    setLoading(true);
    fetch(`/api/products?q=${encodeURIComponent(debouncedQuery)}&limit=50`)
      .then((res) => res.json())
      .then((data) => {
        setProducts(data.products || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchProducts();
  }, [debouncedQuery]);

  const handleEdit = (product: ProductData) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleNew = () => {
    setSelectedProduct(null);
    setIsModalOpen(true);
  };

  const handleModalSuccess = () => {
    setIsModalOpen(false);
    fetchProducts();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto h-full flex flex-col">
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Package className="w-6 h-6 text-blue-600" />
            Control de Inventario
          </h1>
          <p className="text-sm text-slate-500 mt-1">Administra tu catálogo y monitorea el stock de productos</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsCategoryModalOpen(true)}
            className="bg-white border text-slate-600 border-slate-200 hover:bg-slate-50 px-5 py-2.5 rounded-xl font-medium shadow-sm transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Nueva Categoría
          </button>
          <button onClick={handleNew} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm transition-colors flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Nuevo Producto
          </button>
        </div>
      </div>

      {/* Controles de Búsqueda */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-6 flex gap-4">
        <div className="relative flex-1">
          <Search className="w-5 h-5 text-slate-600 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por Nombre, SKU o Código de Barras..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-slate-500 bg-slate-50 uppercase sticky top-0 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">SKU</th>
                <th className="px-6 py-4 font-semibold">Producto</th>
                <th className="px-6 py-4 font-semibold">Categoría</th>
                <th className="px-6 py-4 font-semibold text-right">Precio</th>
                <th className="px-6 py-4 font-semibold text-center">Stock</th>
                <th className="px-6 py-4 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-600">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Cargando inventario...
                  </td>
                </tr>
              ) : products.length > 0 ? (
                products.map((product) => {
                  const isLowStock = product.stock <= product.minStock;
                  return (
                    <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-slate-500">{product.sku}</td>
                      <td className="px-6 py-4 font-medium text-slate-800">{product.name}</td>
                      <td className="px-6 py-4 text-slate-500">{product.category.name}</td>
                      <td className="px-6 py-4 text-right font-medium">Q{Number(product.price).toFixed(2)}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                          isLowStock 
                            ? 'bg-red-50 text-red-700 border border-red-200' 
                            : 'bg-green-50 text-green-700 border border-green-200'
                        }`}>
                          {isLowStock && <ShieldAlert className="w-3.5 h-3.5" />}
                          {product.stock}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button onClick={() => handleEdit(product)} className="text-slate-600 hover:text-blue-600 transition-colors p-2 rounded-lg hover:bg-blue-50">
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-600">
                    No se encontraron productos en el catálogo.
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

      {/* Modal Categorías */}
      {isCategoryModalOpen && (
        <CategoryModal
          onClose={() => setIsCategoryModalOpen(false)}
          onSuccess={() => setIsCategoryModalOpen(false)}
        />
      )}
    </div>
  );
}
