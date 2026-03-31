'use client';

import { useState, useEffect } from 'react';
import { Package, Search, Tag, Loader2, Image as ImageIcon } from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';

interface Category {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  price: string;
  stock: number;
  minStock: number;
  categoryId: string;
}

export function ProductGrid() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const addItem = useCartStore((s) => s.addItem);

  // Cargar Categorías
  useEffect(() => {
    fetch('/api/categories')
      .then(res => res.json())
      .then(data => {
        setCategories(data || []);
      })
      .catch(err => console.error("Error cargando categorías:", err));
  }, []);

  // Cargar Productos (Filtro por Categoría)
  useEffect(() => {
    setLoading(true);
    let url = '/api/products?limit=100'; // Obtener un buen bloque de productos
    fetch(url)
      .then(res => res.json())
      .then(data => {
        setProducts(data.products || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error cargando productos:", err);
        setLoading(false);
      });
  }, []);

  const filteredProducts = activeCategory === 'all' 
    ? products 
    : products.filter(p => p.categoryId === activeCategory);

  const handleProductClick = (product: Product) => {
    // Si no hay stock, podría mostrar alerta, pero el POS físico a veces permite negativos.
    // Solo lo añadimos al carrito.
    addItem({
      id: product.id,
      name: product.name,
      sku: product.sku,
      price: Number(product.price),
      stock: product.stock
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-inner w-full">
      {/* Selector de Categorías Horizontal */}
      <div className="bg-white border-b border-slate-200 overflow-x-auto custom-scrollbar flex shrink-0 p-2 gap-2">
        <button
          onClick={() => setActiveCategory('all')}
          className={`shrink-0 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeCategory === 'all'
              ? 'bg-slate-900 text-white shadow-md'
              : 'bg-slate-50 text-slate-600 hover:bg-slate-200'
          }`}
        >
          ⭐️ Todos
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`shrink-0 px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              activeCategory === cat.id
                ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-200 border border-transparent hover:border-slate-300'
            }`}
          >
            <Tag className="w-4 h-4" />
            {cat.name}
          </button>
        ))}
      </div>

      {/* Grid de Productos Interactivo */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
            <p className="font-medium animate-pulse">Cargando catálogo visual...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600">
            <Package className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-medium text-lg text-slate-500">No hay productos en esta categoría</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 content-start">
            {filteredProducts.map((product) => {
              const outOfStock = product.stock <= 0;
              return (
                <button
                  key={product.id}
                  onClick={() => handleProductClick(product)}
                  className="group relative flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-lg hover:border-blue-300 transition-all active:scale-95 text-left h-44 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {/* Foto Mock */}
                  <div className="h-24 bg-slate-100 flex items-center justify-center border-b border-slate-100 relative overflow-hidden group-hover:bg-blue-50 transition-colors">
                    <ImageIcon className="w-8 h-8 text-slate-300 group-hover:text-blue-200 transition-colors" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent" />
                  </div>
                  
                  {/* Titulo y Precio */}
                  <div className="p-3 flex flex-col flex-1">
                    <span className="text-xs font-bold text-slate-800 line-clamp-2 leading-tight flex-1">
                      {product.name}
                    </span>
                    <div className="flex justify-between items-end mt-1">
                      <span className="text-blue-700 font-black text-sm">
                        Q{Number(product.price).toFixed(2)}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${outOfStock ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
                        {product.stock} un.
                      </span>
                    </div>
                  </div>
                  
                  {/* Efecto Click Overlay */}
                  <div className="absolute inset-0 bg-black/0 group-active:bg-black/5 transition-colors pointer-events-none" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
