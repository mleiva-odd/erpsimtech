'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { X, Save, Trash2, Loader2, Plus, GripVertical, ImagePlus } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

interface Category {
  id: string;
  name: string;
}

interface ProductVariantForm {
  id?: string;
  name: string;
  sku: string;
  barcode?: string;
  price: number | string;
  cost: number | string;
  stock: number | string;
  stocks?: Array<{ quantity: number }>;
}

interface EditableProduct {
  id: string;
  name: string;
  sku: string;
  barcode?: string | null;
  description?: string | null;
  categoryId: string;
  unitOfMeasure?: string;
  isTaxExempt?: boolean;
  price: number | string;
  wholesalePrice?: number | string | null;
  cost: number | string;
  stock?: number;
  minStock?: number;
  imageUrl?: string | null;
  hasVariants?: boolean;
  variants?: ProductVariantForm[];
}

interface ProductModalProps {
  product: EditableProduct | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function ProductModal({ product, onClose, onSuccess }: ProductModalProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [hasVariants, setHasVariants] = useState(product?.hasVariants || false);
  const [variants, setVariants] = useState<ProductVariantForm[]>(
    product?.variants?.map((v) => ({
      ...v,
      stock: v.stocks && v.stocks.length > 0 ? v.stocks[0].quantity : 0
    })) || []
  );

  const [formData, setFormData] = useState({
    name: product?.name || '',
    sku: product?.sku || '',
    barcode: product?.barcode || '',
    description: product?.description || '',
    categoryId: product?.categoryId || '',
    unitOfMeasure: product?.unitOfMeasure || 'UNIT',
    isTaxExempt: product?.isTaxExempt || false,
    // Base standard values (ignored dynamically if hasVariants is true)
    price: product?.price || 0,
    wholesalePrice: product?.wholesalePrice || '',
    cost: product?.cost || 0,
    stock: product?.stock || 0,
    minStock: product?.minStock || 5,
    imageUrl: product?.imageUrl || '',
  });

  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    const form = new FormData();
    form.append('file', file);
    
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (res.ok) setFormData({ ...formData, imageUrl: data.url });
      else toast({ tone: 'error', message: data.error || 'Error subiendo la foto' });
    } catch {
      toast({ tone: 'error', message: 'Error de conexión de red' });
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    fetch('/api/categories')
      .then(res => res.json())
      .then(data => {
        setCategories(data);
        if (!product && data.length > 0) {
          setFormData(f => ({ ...f, categoryId: data[0].id }));
        }
      });
  }, [product]);

  const addVariantRow = () => {
    setVariants([...variants, { name: '', sku: `${formData.sku}-V${variants.length+1}`, barcode: '', price: formData.price, cost: formData.cost, stock: 0 }]);
  };

  const removeVariant = (index: number) => {
    setVariants(variants.filter((_, i) => i !== index));
  };

  const updateVariant = (index: number, field: keyof ProductVariantForm, value: string | number) => {
    const newVariants = [...variants];
    newVariants[index] = { ...newVariants[index], [field]: value };
    setVariants(newVariants);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasVariants && variants.length === 0) {
      toast({ tone: 'error', message: 'Si activas las variantes, debes agregar al menos una (Ej: Talla M).' });
      return;
    }

    setIsLoading(true);

    const payload = {
      ...formData,
      hasVariants,
      variants: hasVariants ? variants : []
    };

    const url = product ? `/api/products/${product.id}` : '/api/products';
    const method = product ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        onSuccess();
      } else {
        const data = await res.json();
        toast({ tone: 'error', message: data.error || 'Error al guardar el formato estructural del producto.' });
      }
    } catch {
      toast({ tone: 'error', message: 'Error de conexión estelar' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] border border-slate-100 animate-in fade-in zoom-in duration-300">
        <div className="px-8 pt-8 pb-4 flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              {product ? 'Editar Producto' : 'Nuevo Producto'}
            </h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Gestión de Catálogo y Matriz de Variantes</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-8 py-4 space-y-8 custom-scrollbar">
          
          {/* BASE INFO */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-6">
             <div className="col-span-2">
               <h3 className="font-bold text-slate-800 mb-4 border-b pb-2">Información Principal</h3>
             </div>
             
             <div className="col-span-2 flex flex-col md:flex-row gap-6 mb-2">
               <div className="w-full md:w-32 h-32 flex-shrink-0 bg-white border-2 border-dashed border-slate-300 rounded-xl relative overflow-hidden flex flex-col justify-center items-center group cursor-pointer hover:border-blue-500 transition-colors">
                 {formData.imageUrl ? (
                   <Image src={formData.imageUrl} className="object-cover" alt="Producto" fill unoptimized />
                 ) : (
                   <div className="text-center p-2 text-slate-400">
                     {isUploading ? <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500" /> : <ImagePlus className="w-8 h-8 mx-auto mb-1 text-slate-300 group-hover:text-blue-500 transition-colors" />}
                     <span className="text-[10px] uppercase font-bold tracking-wider group-hover:text-blue-600 transition-colors">Añadir Foto</span>
                   </div>
                 )}
                 <input type="file" disabled={isUploading} onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" />
               </div>
               
               <div className="flex-1 space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Nombre Comercial *</label>
                    <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ej: Taladro Dewalt 20V Max" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Cód. Familia (SKU Base) *</label>
                    <input required type="text" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono uppercase" placeholder="DW-20V-01"/>
                  </div>
               </div>
             </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Código de Barras Universal</label>
              <input type="text" value={formData.barcode} onChange={e => setFormData({...formData, barcode: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Categoría *</label>
              <select required value={formData.categoryId} onChange={e => setFormData({...formData, categoryId: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                <option value="" disabled>Seleccione una jerarquía</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Unidad de Medida *</label>
              <select required value={formData.unitOfMeasure} onChange={e => setFormData({...formData, unitOfMeasure: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                <option value="UNIT">Por Unidad</option>
                <option value="KG">Kilogramos</option>
                <option value="LB">Libras</option>
                <option value="LITER">Litros</option>
                <option value="GALLON">Galón</option>
                <option value="BOX">Cajas / Fardos</option>
              </select>
            </div>
            
            <div className="col-span-2 mt-2">
               <label className="flex items-center gap-3 p-3 border border-orange-200 bg-orange-50 rounded-lg cursor-pointer hover:bg-orange-100 transition">
                 <input type="checkbox" checked={formData.isTaxExempt} onChange={e => setFormData({...formData, isTaxExempt: e.target.checked})} className="w-5 h-5 text-orange-600 rounded focus:ring-orange-500 cursor-pointer" />
                 <span className="text-sm font-bold text-orange-900">Aplicar Exención Fiscal (Sujeto No Paga Impuestos locales)</span>
               </label>
            </div>
          </div>

          {/* DYNAMIC VARIANT TOGGLER */}
          <div className={`p-5 rounded-xl border ${hasVariants ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 shadow-sm'} transition-colors duration-300`}>
             <div className="flex items-center justify-between">
                <div>
                   <h3 className="font-bold text-slate-800 text-lg">Activar Multi-Variante (Matriz)</h3>
                   <p className="text-sm text-slate-500">Útil para Ropa (Tallas/Colores) o Múltiples Tamaños sin ensuciar el catálogo.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={hasVariants} onChange={(e) => setHasVariants(e.target.checked)} />
                  <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
             </div>

             {/* STANDARD FIELDS (HIDDEN IF VARIANTS ENABLED) */}
             {!hasVariants && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6 animate-fade-in">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Precio Vnta (Q)</label>
                    <input required type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: Number(e.target.value)})} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Costo (Q)</label>
                    <input required type="number" step="0.01" value={formData.cost} onChange={e => setFormData({...formData, cost: Number(e.target.value)})} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Stock Físico</label>
                    <input required type="number" value={formData.stock} onChange={e => setFormData({...formData, stock: Number(e.target.value)})} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Alerta Mínima</label>
                    <input required type="number" value={formData.minStock} onChange={e => setFormData({...formData, minStock: Number(e.target.value)})} className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="col-span-4">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Precio Especial de Mayoreo / Distribuidor (Opcional)</label>
                    <input type="number" step="0.01" value={formData.wholesalePrice} onChange={e => setFormData({...formData, wholesalePrice: e.target.value})} className="w-full px-3 py-2 border border-blue-200 bg-blue-50/50 rounded focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
             )}

             {/* VARIANTS BUILDER */}
             {hasVariants && (
               <div className="mt-6 animate-fade-in">
                  <div className="space-y-3">
                    {variants.map((v, i) => (
                      <div key={i} className="flex flex-wrap md:flex-nowrap gap-2 items-center bg-white p-3 rounded-xl border border-indigo-100 shadow-sm relative group">
                        <GripVertical className="w-4 h-4 text-slate-300 hidden md:block cursor-move" />
                        
                        <div className="flex-1 min-w-[120px]">
                          <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block mb-1">Opción</label>
                          <input type="text" placeholder="Ej: Rojo Talla M" required value={v.name} onChange={(e) => updateVariant(i, 'name', e.target.value)} className="w-full border-b focus:border-indigo-500 outline-none pb-1 font-bold text-slate-800 text-sm" />
                        </div>

                        <div className="w-24">
                          <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block mb-1">Sub-SKU</label>
                          <input type="text" required value={v.sku} onChange={(e) => updateVariant(i, 'sku', e.target.value)} className="w-full border-b focus:border-indigo-500 outline-none pb-1 font-mono text-xs text-slate-600" />
                        </div>

                        <div className="w-20">
                          <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block mb-1">Precio</label>
                          <input type="number" step="0.01" required value={v.price} onChange={(e) => updateVariant(i, 'price', e.target.value)} className="w-full border-b focus:border-indigo-500 outline-none pb-1 font-bold text-emerald-600 text-sm" />
                        </div>
                        
                        <div className="w-20">
                          <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block mb-1">Costo</label>
                          <input type="number" step="0.01" required value={v.cost} onChange={(e) => updateVariant(i, 'cost', e.target.value)} className="w-full border-b focus:border-indigo-500 outline-none pb-1 text-slate-600 text-sm" />
                        </div>

                        <div className="w-20">
                          <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block mb-1">Stock</label>
                          <input type="number" required value={v.stock} onChange={(e) => updateVariant(i, 'stock', e.target.value)} className="w-full border-b focus:border-indigo-500 outline-none pb-1 font-bold text-blue-600 text-sm text-center" />
                        </div>

                        <button type="button" onClick={() => removeVariant(i)} className="md:opacity-0 group-hover:opacity-100 transition-opacity p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  
                  <button type="button" onClick={addVariantRow} className="mt-4 flex items-center gap-2 text-indigo-600 font-bold bg-indigo-50 hover:bg-indigo-100 px-4 py-2.5 rounded-xl transition text-sm w-full justify-center border border-dashed border-indigo-300">
                    <Plus className="w-4 h-4" /> Agregar Nueva Medida / Color
                  </button>
               </div>
             )}
          </div>
        </form>

        <div className="px-8 py-6 border-t border-slate-100 flex gap-4 justify-end items-center bg-slate-50/50">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-6 py-3 text-slate-500 hover:text-slate-700 font-bold rounded-2xl transition-all text-sm"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSubmit} 
              disabled={isLoading} 
              className="flex items-center gap-2.5 px-10 py-3.5 bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-500/20 text-white rounded-2xl font-bold transition-all active:scale-95 disabled:opacity-50 text-sm"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} 
              {product ? 'Guardar Cambios' : 'Registrar Producto'}
            </button>
        </div>
      </div>
    </div>
  );
}
