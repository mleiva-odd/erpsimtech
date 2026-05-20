'use client';

/**
 * Fase 22b · Inventory con DataTable + useDataTable.
 *
 * Endpoint `/api/products` ya soporta paginación servidor (`page`, `limit`, `q`,
 * `branchId`, `lowStock`). Activamos paginación servidor a través del hook.
 */

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Package, Plus, Edit2, ShieldAlert, FileSpreadsheet, Printer, Layers } from 'lucide-react';

import { ProductModal } from '@/components/inventory/ProductModal';
import { BundleModal } from '@/components/inventory/BundleModal';
import { CategoryModal } from '@/components/inventory/CategoryModal';
import { ImportExcelModal } from '@/components/inventory/ImportExcelModal';
import { PrintBarcodeModal } from '@/components/inventory/PrintBarcodeModal';
import { useBranchStore } from '@/stores/branchStore';
import { useDataTable } from '@/hooks/useDataTable';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';

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
  const { data: session } = useSession();
  const { selectedBranchId } = useBranchStore();
  const permissions = session?.user?.permissions ?? [];
  const canManageCatalog =
    session?.user?.role === 'SUPER_ADMIN' || permissions.includes('settings:manage');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBundleModalOpen, setIsBundleModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductData | null>(null);

  const table = useDataTable<ProductData>({
    defaultLimit: 25,
    onFetch: async ({ page, limit, search, filters, signal }) => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        q: search,
      });
      if (selectedBranchId) params.set('branchId', selectedBranchId);
      if (filters.lowStock) params.set('lowStock', 'true');
      const res = await fetch(`/api/products?${params}`, { signal });
      if (!res.ok) throw new Error('Error al cargar productos.');
      const json = await res.json();
      return { data: json.products ?? [], total: json.total ?? 0 };
    },
  });

  const handleEdit = (product: ProductData) => {
    if (!canManageCatalog) return;
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
    if (!canManageCatalog) return;
    setSelectedProduct(null);
    setIsModalOpen(true);
  };

  const handleModalSuccess = () => {
    setIsModalOpen(false);
    void table.refetch();
  };

  const lowStockActive = Boolean(table.filters.lowStock);

  const columns: DataTableColumn<ProductData>[] = [
    {
      key: 'sku',
      header: 'SKU',
      mobilePriority: 'meta',
      accessor: (p) => <span className="font-mono text-slate-500 text-xs">{p.sku}</span>,
      exportValue: (p) => p.sku,
    },
    {
      key: 'name',
      header: 'Producto',
      mobilePriority: 'title',
      accessor: (p) => (
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800">{p.name}</span>
          {p.isTaxExempt && <span className="px-1.5 py-0.5 bg-amber-50 text-amber-600 text-[9px] rounded-md uppercase font-bold tracking-widest border border-amber-100">Exento</span>}
          {p.hasVariants && <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[9px] rounded-md uppercase font-bold tracking-widest border border-blue-100">Variantes</span>}
        </div>
      ),
      exportValue: (p) => p.name,
    },
    {
      key: 'category',
      header: 'Categoría',
      mobilePriority: 'meta',
      accessor: (p) => <span className="text-slate-600 font-medium">{p.category.name}</span>,
      exportValue: (p) => p.category.name,
    },
    {
      key: 'price',
      header: 'Precio',
      mobilePriority: 'highlight',
      cellClassName: 'text-right',
      headerClassName: 'text-right',
      accessor: (p) =>
        p.hasVariants ? (
          <div className="font-bold text-blue-600 text-[10px] uppercase tracking-widest bg-blue-50 inline-block px-2.5 py-1 rounded-lg border border-blue-100">
            Variantes
          </div>
        ) : (
          <div className="flex flex-col items-end">
            <span className="font-bold text-slate-900 text-sm">Q{Number(p.price).toFixed(2)}</span>
            {p.wholesalePrice && (
              <span className="text-[10px] text-blue-500 font-bold uppercase tracking-tight">
                Q{Number(p.wholesalePrice).toFixed(2)} Mayoreo
              </span>
            )}
          </div>
        ),
      exportValue: (p) => Number(p.price).toFixed(2),
    },
    {
      key: 'stock',
      header: 'Stock',
      mobilePriority: 'meta',
      cellClassName: 'text-center',
      headerClassName: 'text-center',
      accessor: (p) => {
        const isLowStock = p.stock <= p.minStock;
        return (
          <span
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold ${
              isLowStock
                ? 'bg-rose-50 text-rose-600 border border-rose-100/50'
                : 'bg-emerald-50 text-emerald-600 border border-emerald-100/50'
            }`}
          >
            {isLowStock && <ShieldAlert className="w-3" />}
            {p.stock} <span className="text-[9px] opacity-60">{p.unitOfMeasure}</span>
          </span>
        );
      },
      exportValue: (p) => `${p.stock} ${p.unitOfMeasure}`,
    },
    {
      key: 'actions',
      header: 'Acciones',
      mobilePriority: 'hidden',
      cellClassName: 'text-center',
      headerClassName: 'text-center',
      accessor: (p) => (
        <div className="flex justify-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => handlePrintBarcode(p)}
            aria-label="Etiqueta"
            title="Etiqueta"
            className="p-2 bg-slate-50 text-slate-500 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-all"
          >
            <Printer className="w-4 h-4" />
          </button>
          {canManageCatalog && (
            <button
              onClick={() => handleEdit(p)}
              aria-label="Editar"
              title="Editar"
              className="p-2 bg-slate-50 text-slate-500 hover:bg-blue-600 hover:text-white rounded-xl transition-all"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
      exportValue: () => '',
    },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Inventario' },
        ]}
      />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Package className="w-6 h-6 text-blue-600" />
            Control de Inventario
          </h1>
          <p className="text-[13px] text-slate-500 font-medium mt-1">
            Gestión integral del catálogo de productos y existencias
          </p>
        </div>
        {canManageCatalog && (
          <div className="flex items-center gap-2 flex-wrap">
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
              <Plus className="w-4 h-4" /> Categoría
            </button>
            <button
              onClick={() => {
                setSelectedProduct(null);
                setIsBundleModalOpen(true);
              }}
              className="bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-all flex items-center gap-2 active:scale-95"
            >
              <Layers className="w-4 h-4 text-slate-500" /> Nuevo Combo
            </button>
            <button
              onClick={handleNew}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-xl shadow-blue-500/10 transition-all flex items-center gap-2 active:scale-95"
            >
              <Plus className="w-4 h-4" /> Nuevo Producto
            </button>
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        data={table.data}
        loading={table.loading}
        total={table.pagination.total}
        page={table.pagination.page}
        pageSize={table.pagination.limit}
        onPageChange={table.pagination.onPageChange}
        onPageSizeChange={table.pagination.onLimitChange}
        getRowId={(p) => p.id}
        search={{
          value: table.search.value,
          onChange: table.search.onChange,
          placeholder: 'Buscar por nombre, SKU o código...',
        }}
        filters={[
          {
            key: 'lowStock',
            label: 'Stock bajo',
            type: 'select',
            options: [{ value: 'true', label: 'Solo bajo stock' }],
            value: lowStockActive ? 'true' : '',
            onChange: (v) => table.setFilter('lowStock', v ? true : ''),
          },
        ]}
        empty={
          <EmptyState
            icon={<Package className="w-7 h-7" />}
            title="No hay productos"
            description={
              canManageCatalog
                ? 'Crea tu primer producto para empezar a vender.'
                : 'No hay productos registrados para esta búsqueda.'
            }
          />
        }
      />

      {isModalOpen && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setIsModalOpen(false)}
          onSuccess={handleModalSuccess}
        />
      )}
      {isBundleModalOpen && (
        <BundleModal
          product={selectedProduct}
          onClose={() => setIsBundleModalOpen(false)}
          onSuccess={() => {
            setIsBundleModalOpen(false);
            void table.refetch();
          }}
        />
      )}
      {isCategoryModalOpen && (
        <CategoryModal
          onClose={() => setIsCategoryModalOpen(false)}
          onSuccess={() => setIsCategoryModalOpen(false)}
        />
      )}
      {isImportModalOpen && (
        <ImportExcelModal
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={() => {
            setIsImportModalOpen(false);
            void table.refetch();
          }}
        />
      )}
      {isPrintModalOpen && selectedProduct && (
        <PrintBarcodeModal
          product={selectedProduct}
          onClose={() => setIsPrintModalOpen(false)}
        />
      )}
    </div>
  );
}
