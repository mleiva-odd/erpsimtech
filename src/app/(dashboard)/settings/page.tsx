'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
  Save, Building2, Receipt, DollarSign, Package, HandCoins,
  ShoppingCart, Wallet, Calculator, Coins, Info, Lock,
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { IntArrayInput } from '@/components/forms/IntArrayInput';

type SettingsFormData = {
  storeName: string;
  address: string;
  phone: string;
  nit: string;
  receiptMsg: string;
  felEnabled: boolean;
  felProvider: 'NONE' | 'MOCK' | 'INFILE' | 'DIGIFACT';
  felNitEmisor: string;
  felApiUser: string;
  felApiKey: string;
  acceptsCash: boolean;
  acceptsCard: boolean;
  acceptsTransfer: boolean;
  acceptsCredit: boolean;
  taxRate: number;
  taxIncluded: boolean;
  currency: string;
  currencySymbol: string;
  taxRegime: 'GENERAL' | 'PEQUENO_CONTRIBUYENTE' | '';
};

type CompanyFormData = {
  taxRegime: 'GENERAL' | 'PEQUENO_CONTRIBUYENTE' | null;
  taxRegimeLocked: boolean;
  costMethod: 'WAC' | 'FIFO';
  agingBucketDays: number[];
  allowQuotes: boolean;
  allowOrders: boolean;
  quoteValidDays: number;
  commissionEnabled: boolean;
  purchaseApprovalThreshold: number;
};

type PaymentMethodSettingKey = 'acceptsCash' | 'acceptsCard' | 'acceptsTransfer' | 'acceptsCredit';

type TabId =
  | 'general'
  | 'fiscal'
  | 'inventory'
  | 'ar'
  | 'sales'
  | 'commissions'
  | 'purchases'
  | 'fel'
  | 'payments'
  | 'currency';

const PAYMENT_METHOD_OPTIONS: Array<{ key: PaymentMethodSettingKey; label: string; desc: string }> = [
  { key: 'acceptsCash', label: 'Efectivo', desc: 'Billetes y monedas' },
  { key: 'acceptsCard', label: 'Tarjeta', desc: 'Débito y crédito (terminal externa)' },
  { key: 'acceptsTransfer', label: 'Transferencia', desc: 'Transferencia bancaria' },
  { key: 'acceptsCredit', label: 'Fiado (Crédito)', desc: 'Clientes con límite de crédito aprobado' },
];

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const [formData, setFormData] = useState<SettingsFormData>({
    storeName: '', address: '', phone: '', nit: '', receiptMsg: '',
    felEnabled: false, felProvider: 'NONE',
    felNitEmisor: '', felApiUser: '', felApiKey: '',
    acceptsCash: true, acceptsCard: true, acceptsTransfer: true, acceptsCredit: false,
    taxRate: 0.12, taxIncluded: true,
    currency: 'GTQ', currencySymbol: 'Q',
    taxRegime: '',
  });
  const [companyData, setCompanyData] = useState<CompanyFormData>({
    taxRegime: null,
    taxRegimeLocked: false,
    costMethod: 'WAC',
    agingBucketDays: [30, 60, 90],
    allowQuotes: true,
    allowOrders: true,
    quoteValidDays: 30,
    commissionEnabled: false,
    purchaseApprovalThreshold: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const { toast } = useToast();
  const canAccess =
    session?.user?.role === 'SUPER_ADMIN' || session?.user?.permissions?.includes('settings:manage');

  useEffect(() => {
    if (status === 'loading') return;
    if (!canAccess) {
      setIsLoading(false);
      setLoadError(null);
      return;
    }
    setIsLoading(true);
    Promise.all([fetch('/api/settings'), fetch('/api/settings/company')])
      .then(async ([r1, r2]) => ({
        settings: r1.ok ? await r1.json() : null,
        company: r2.ok ? await r2.json() : null,
      }))
      .then(({ settings, company }) => {
        if (settings && !settings.error) {
          setFormData((prev) => ({
            ...prev,
            storeName: settings.storeName || '',
            address: settings.address || '',
            phone: settings.phone || '',
            nit: settings.nit || '',
            receiptMsg: settings.receiptMsg || '',
            felEnabled: settings.felEnabled || false,
            felProvider: (settings.felProvider as SettingsFormData['felProvider']) || 'NONE',
            felNitEmisor: settings.felNitEmisor || '',
            felApiUser: settings.felApiUser || '',
            felApiKey: settings.felApiKey || '',
            acceptsCash: settings.acceptsCash ?? true,
            acceptsCard: settings.acceptsCard ?? true,
            acceptsTransfer: settings.acceptsTransfer ?? true,
            acceptsCredit: settings.acceptsCredit ?? false,
            taxRate: Number(settings.taxRate) || 0.12,
            taxIncluded: settings.taxIncluded ?? true,
            currency: settings.currency || 'GTQ',
            currencySymbol: settings.currencySymbol || 'Q',
            taxRegime: (settings.taxRegime as SettingsFormData['taxRegime']) || '',
          }));
        }
        if (company && !company.error) {
          setCompanyData({
            taxRegime: company.taxRegime ?? null,
            taxRegimeLocked: Boolean(company.taxRegimeLocked),
            costMethod: (company.costMethod as 'WAC' | 'FIFO') || 'WAC',
            agingBucketDays:
              Array.isArray(company.agingBucketDays) && company.agingBucketDays.length > 0
                ? company.agingBucketDays
                : [30, 60, 90],
            allowQuotes: company.allowQuotes ?? true,
            allowOrders: company.allowOrders ?? true,
            quoteValidDays: company.quoteValidDays ?? 30,
            commissionEnabled: company.commissionEnabled ?? false,
            purchaseApprovalThreshold: Number(company.purchaseApprovalThreshold ?? 0),
          });
        }
        setLoadError(null);
        setIsLoading(false);
      })
      .catch(() => {
        setLoadError('No fue posible cargar la configuración.');
        setIsLoading(false);
      });
  }, [canAccess, status]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const settingsBody = {
        ...formData,
        // taxRegime también se manda al settings PUT (que aplica regla LOCK).
        taxRegime: formData.taxRegime || undefined,
      };

      // Company-level fields → PATCH /api/settings/company
      const companyBody: Record<string, unknown> = {
        costMethod: companyData.costMethod,
        agingBucketDays: companyData.agingBucketDays,
        allowQuotes: companyData.allowQuotes,
        allowOrders: companyData.allowOrders,
        quoteValidDays: companyData.quoteValidDays,
        commissionEnabled: companyData.commissionEnabled,
        purchaseApprovalThreshold: companyData.purchaseApprovalThreshold,
      };
      if (!companyData.taxRegimeLocked && formData.taxRegime) {
        companyBody.taxRegime = formData.taxRegime;
      }

      const [r1, r2] = await Promise.all([
        fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settingsBody),
        }),
        fetch('/api/settings/company', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(companyBody),
        }),
      ]);

      if (!r1.ok || !r2.ok) {
        const errPayload = await (r1.ok ? r2 : r1).json().catch(() => ({}));
        toast({ tone: 'error', message: errPayload.error || 'Error al guardar.' });
      } else {
        toast({ tone: 'success', message: 'Configuración guardada exitosamente.' });
        // Refrescar lock status si recién se seteó taxRegime
        if (!companyData.taxRegimeLocked && formData.taxRegime) {
          setCompanyData((c) => ({
            ...c,
            taxRegime: formData.taxRegime as 'GENERAL' | 'PEQUENO_CONTRIBUYENTE',
            taxRegimeLocked: true,
          }));
        }
      }
    } catch (error) {
      console.error(error);
      toast({ tone: 'error', message: 'Error de conexión al guardar.' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-red-50 text-red-600 rounded-2xl m-8">
        <h2 className="font-bold text-xl mb-2">Acceso Denegado</h2>
        <p>Solo el Administrador puede editar la configuración.</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-red-50 text-red-600 rounded-2xl m-8">
        <h2 className="font-bold text-xl mb-2">Error cargando configuración</h2>
        <p>{loadError}</p>
      </div>
    );
  }

  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: 'general', label: 'Negocio', icon: <Building2 className="w-4 h-4" /> },
    { id: 'fiscal', label: 'Tributario', icon: <Receipt className="w-4 h-4" /> },
    { id: 'inventory', label: 'Inventario', icon: <Package className="w-4 h-4" /> },
    { id: 'ar', label: 'Cuentas por Cobrar', icon: <HandCoins className="w-4 h-4" /> },
    { id: 'sales', label: 'Ventas', icon: <ShoppingCart className="w-4 h-4" /> },
    { id: 'commissions', label: 'Comisiones', icon: <Wallet className="w-4 h-4" /> },
    { id: 'purchases', label: 'Compras', icon: <Calculator className="w-4 h-4" /> },
    { id: 'fel', label: 'FEL', icon: <Receipt className="w-4 h-4" /> },
    { id: 'payments', label: 'Pagos', icon: <DollarSign className="w-4 h-4" /> },
    { id: 'currency', label: 'Moneda', icon: <Coins className="w-4 h-4" /> },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Configuración del Negocio</h1>
        <p className="text-sm text-slate-500">Datos fiscales, operativos y métodos de pago</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex shrink-0 items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-5">
        {/* GENERAL */}
        {activeTab === 'general' && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Comercial *</label>
              <input
                required type="text" value={formData.storeName}
                onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">NIT</label>
                <input
                  type="text" value={formData.nit}
                  onChange={(e) => setFormData({ ...formData, nit: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                <input
                  type="text" value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Dirección</label>
              <input
                type="text" value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>
            <div className="pt-4 border-t border-slate-100">
              <label className="block text-sm font-medium text-slate-700 mb-1">Mensaje de Despedida (Pie de Ticket)</label>
              <textarea
                value={formData.receiptMsg}
                onChange={(e) => setFormData({ ...formData, receiptMsg: e.target.value })}
                rows={2}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>
          </>
        )}

        {/* FISCAL · taxRegime */}
        {activeTab === 'fiscal' && (
          <>
            <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                El régimen tributario lo asigna la SAT y NO se puede modificar una vez configurado en la
                aplicación. Confirmá con tu contador antes de guardar.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                Régimen Tributario *
                {companyData.taxRegimeLocked && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Lock className="w-3 h-3" /> Bloqueado
                  </span>
                )}
              </label>
              <select
                value={formData.taxRegime || companyData.taxRegime || ''}
                disabled={companyData.taxRegimeLocked}
                onChange={(e) =>
                  setFormData({ ...formData, taxRegime: e.target.value as SettingsFormData['taxRegime'] })
                }
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed"
              >
                <option value="">Seleccionar régimen...</option>
                <option value="GENERAL">Régimen General (IVA 12%)</option>
                <option value="PEQUENO_CONTRIBUYENTE">Pequeño Contribuyente (IVA 5%)</option>
              </select>
              {companyData.taxRegimeLocked && (
                <p className="text-xs text-slate-400 mt-1">
                  Para cambiarlo contactá a soporte.
                </p>
              )}
            </div>
          </>
        )}

        {/* INVENTORY · costMethod */}
        {activeTab === 'inventory' && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Método de costeo de inventario</label>
              <select
                value={companyData.costMethod}
                onChange={(e) =>
                  setCompanyData({ ...companyData, costMethod: e.target.value as 'WAC' | 'FIFO' })
                }
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none"
              >
                <option value="WAC">Promedio Ponderado (WAC)</option>
                <option value="FIFO">FIFO (Primero en entrar, primero en salir)</option>
              </select>
              <p className="text-xs text-slate-400 mt-1 flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 shrink-0" />
                Industrias de perecederos (alimentos, farmacia, lácteos) suelen requerir FIFO para trazabilidad SAT.
              </p>
            </div>
          </>
        )}

        {/* AR · agingBucketDays */}
        {activeTab === 'ar' && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Buckets de aging (días)</label>
              <IntArrayInput
                value={companyData.agingBucketDays}
                onChange={(next) => setCompanyData({ ...companyData, agingBucketDays: next })}
                min={1}
                max={365}
                ariaLabel="Umbrales aging en días"
              />
            </div>
          </>
        )}

        {/* SALES · allowQuotes, allowOrders, quoteValidDays */}
        {activeTab === 'sales' && (
          <>
            <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={companyData.allowQuotes}
                onChange={(e) => setCompanyData({ ...companyData, allowQuotes: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-5 h-5"
              />
              <div>
                <span className="font-medium text-slate-800">Permitir cotizaciones</span>
                <p className="text-xs text-slate-500">Habilitá el flujo QUOTE en el POS y ventas enterprise.</p>
              </div>
            </label>
            <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={companyData.allowOrders}
                onChange={(e) => setCompanyData({ ...companyData, allowOrders: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-5 h-5"
              />
              <div>
                <span className="font-medium text-slate-800">Permitir pedidos (ORDER)</span>
                <p className="text-xs text-slate-500">Workflow QUOTE → ORDER → DELIVERED → INVOICED.</p>
              </div>
            </label>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Días de vigencia por cotización</label>
              <input
                type="number" min={1} max={365}
                value={companyData.quoteValidDays}
                onChange={(e) =>
                  setCompanyData({ ...companyData, quoteValidDays: Math.max(1, Number(e.target.value) || 30) })
                }
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>
          </>
        )}

        {/* COMMISSIONS */}
        {activeTab === 'commissions' && (
          <>
            <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={companyData.commissionEnabled}
                onChange={(e) =>
                  setCompanyData({ ...companyData, commissionEnabled: e.target.checked })
                }
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-5 h-5"
              />
              <div>
                <span className="font-medium text-slate-800">Calcular comisiones por venta</span>
                <p className="text-xs text-slate-500">
                  Activa el cálculo de comisiones para vendedores/empleados configurados.
                </p>
              </div>
            </label>
          </>
        )}

        {/* PURCHASES · purchaseApprovalThreshold */}
        {activeTab === 'purchases' && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Umbral de aprobación de órdenes de compra (Q)
              </label>
              <input
                type="number" min={0} step={0.01}
                value={companyData.purchaseApprovalThreshold}
                onChange={(e) =>
                  setCompanyData({
                    ...companyData,
                    purchaseApprovalThreshold: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none"
              />
              <p className="text-xs text-slate-400 mt-1">
                Compras por encima de este monto requerirán aprobación. Setealo en 0 para que todas las
                compras pasen por workflow de aprobación; o en un valor alto para desactivarlo.
              </p>
            </div>
          </>
        )}

        {/* FEL */}
        {activeTab === 'fel' && (
          <>
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-600">
                <p className="font-bold">
                  Régimen actual:{' '}
                  {companyData.taxRegime
                    ? companyData.taxRegime === 'GENERAL'
                      ? 'General (IVA 12%)'
                      : 'Pequeño Contribuyente (IVA 5%)'
                    : 'No configurado'}
                </p>
                <p>Define el porcentaje de IVA que se aplicará al certificar DTEs.</p>
              </div>
            </div>
            <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer">
              <input
                type="checkbox" checked={formData.felEnabled}
                onChange={(e) => setFormData({ ...formData, felEnabled: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-5 h-5"
              />
              <div>
                <span className="font-medium text-slate-800">Activar Facturación Electrónica (FEL)</span>
                <p className="text-xs text-slate-500 mt-0.5">
                  Emitir DTE&apos;s a través de un certificador autorizado.
                </p>
              </div>
            </label>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Certificador</label>
              <select
                value={formData.felProvider}
                onChange={(e) =>
                  setFormData({ ...formData, felProvider: e.target.value as SettingsFormData['felProvider'] })
                }
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none"
              >
                <option value="NONE">Ninguno</option>
                <option value="MOCK">MOCK (pruebas internas)</option>
                <option value="INFILE">INFILE</option>
                <option value="DIGIFACT">DIGIFACT</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">NIT Emisor</label>
              <input
                type="text" value={formData.felNitEmisor}
                onChange={(e) => setFormData({ ...formData, felNitEmisor: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none"
                placeholder="12345678"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">API User</label>
                <input
                  type="text" value={formData.felApiUser}
                  onChange={(e) => setFormData({ ...formData, felApiUser: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">API Key</label>
                <input
                  type="password" value={formData.felApiKey}
                  onChange={(e) => setFormData({ ...formData, felApiKey: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-lg">
              Las credenciales se almacenan de forma cifrada. Contactá a tu certificador para obtener
              las credenciales de producción.
            </p>
          </>
        )}

        {/* PAYMENTS */}
        {activeTab === 'payments' && (
          <>
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-3">Métodos de pago aceptados</p>
              <div className="space-y-2">
                {PAYMENT_METHOD_OPTIONS.map((m) => (
                  <label
                    key={m.key}
                    className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition"
                  >
                    <input
                      type="checkbox" checked={formData[m.key]}
                      onChange={(e) => setFormData({ ...formData, [m.key]: e.target.checked })}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-5 h-5"
                    />
                    <div>
                      <span className="font-medium text-slate-800 text-sm">{m.label}</span>
                      <p className="text-xs text-slate-500">{m.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {/* CURRENCY */}
        {activeTab === 'currency' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Moneda funcional</label>
                <input
                  type="text" value={formData.currency} readOnly
                  className="w-full px-4 py-2 border rounded-lg bg-slate-50 text-slate-500 cursor-not-allowed"
                />
                <p className="text-xs text-slate-400 mt-1">
                  GTQ por ley GT. Multi-moneda extendida disponible en Fase 22b.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Símbolo</label>
                <input
                  type="text" value={formData.currencySymbol} readOnly
                  className="w-full px-4 py-2 border rounded-lg bg-slate-50 text-slate-500 cursor-not-allowed"
                  maxLength={3}
                />
              </div>
            </div>
            <a
              href="/accounting/banks"
              className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-bold"
            >
              Capturar tipos de cambio manuales →
            </a>
          </>
        )}

        <div className="pt-4 flex justify-end border-t border-slate-100">
          <button
            type="submit" disabled={isSaving}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium transition active:scale-95 disabled:opacity-50"
          >
            {isSaving ? 'Guardando...' : (<><Save className="w-5 h-5" /> Guardar Ajustes</>)}
          </button>
        </div>
      </form>
    </div>
  );
}
