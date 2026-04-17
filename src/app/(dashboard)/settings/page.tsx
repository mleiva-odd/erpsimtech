'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Save, Building2, Receipt, DollarSign } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

type SettingsFormData = {
  storeName: string;
  address: string;
  phone: string;
  nit: string;
  receiptMsg: string;
  felEnabled: boolean;
  felProvider: string;
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
};

type PaymentMethodSettingKey = 'acceptsCash' | 'acceptsCard' | 'acceptsTransfer' | 'acceptsCredit';

const PAYMENT_METHOD_OPTIONS: Array<{ key: PaymentMethodSettingKey; label: string; desc: string }> = [
  { key: 'acceptsCash', label: 'Efectivo', desc: 'Billetes y monedas' },
  { key: 'acceptsCard', label: 'Tarjeta', desc: 'Débito y crédito (terminal externa)' },
  { key: 'acceptsTransfer', label: 'Transferencia', desc: 'Transferencia bancaria' },
  { key: 'acceptsCredit', label: 'Fiado (Crédito)', desc: 'Clientes con límite de crédito aprobado' },
];

export default function SettingsPage() {
  const { data: session } = useSession();
  const [formData, setFormData] = useState<SettingsFormData>({
    storeName: '', address: '', phone: '', nit: '', receiptMsg: '',
    // FEL
    felEnabled: false, felProvider: 'NONE' as string,
    felNitEmisor: '', felApiUser: '', felApiKey: '',
    // Payment methods
    acceptsCash: true, acceptsCard: true, acceptsTransfer: true, acceptsCredit: false,
    // Tax
    taxRate: 0.12, taxIncluded: true,
    // Currency
    currency: 'GTQ', currencySymbol: 'Q',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'fel' | 'payments'>('general');
  const { toast } = useToast();

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        if (!data.error) {
          setFormData({
            storeName: data.storeName || '',
            address: data.address || '',
            phone: data.phone || '',
            nit: data.nit || '',
            receiptMsg: data.receiptMsg || '',
            felEnabled: data.felEnabled || false,
            felProvider: data.felProvider || 'NONE',
            felNitEmisor: data.felNitEmisor || '',
            felApiUser: data.felApiUser || '',
            felApiKey: data.felApiKey || '',
            acceptsCash: data.acceptsCash ?? true,
            acceptsCard: data.acceptsCard ?? true,
            acceptsTransfer: data.acceptsTransfer ?? true,
            acceptsCredit: data.acceptsCredit ?? false,
            taxRate: Number(data.taxRate) || 0.12,
            taxIncluded: data.taxIncluded ?? true,
            currency: data.currency || 'GTQ',
            currencySymbol: data.currencySymbol || 'Q',
          });
        }
        setIsLoading(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        toast({ tone: 'success', message: 'Configuración guardada exitosamente.' });
      } else {
        toast({ tone: 'error', message: 'Error al guardar.' });
      }
    } catch (error) {
      console.error(error);
      toast({ tone: 'error', message: 'Error de conexión al guardar.' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;

  if (session?.user?.role !== 'ADMIN' && session?.user?.role !== 'SUPER_ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-red-50 text-red-600 rounded-2xl m-8">
        <h2 className="font-bold text-xl mb-2">Acceso Denegado</h2>
        <p>Solo el Administrador puede editar la configuración.</p>
      </div>
    );
  }

  const tabs = [
    { id: 'general' as const, label: 'Negocio', icon: <Building2 className="w-4 h-4" /> },
    { id: 'fel' as const, label: 'Facturación (FEL)', icon: <Receipt className="w-4 h-4" /> },
    { id: 'payments' as const, label: 'Pagos e Impuestos', icon: <DollarSign className="w-4 h-4" /> },
  ];

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Configuración del Negocio</h1>
        <p className="text-sm text-slate-500">Datos fiscales, facturación electrónica y métodos de pago</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
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
        {/* General Tab */}
        {activeTab === 'general' && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Comercial *</label>
              <input required type="text" value={formData.storeName} onChange={e => setFormData({...formData, storeName: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">NIT</label>
                <input type="text" value={formData.nit} onChange={e => setFormData({...formData, nit: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                <input type="text" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Dirección</label>
              <input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Moneda</label>
                <select value={formData.currency} onChange={e => setFormData({...formData, currency: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none">
                  <option value="GTQ">Quetzal (GTQ)</option>
                  <option value="USD">Dólar (USD)</option>
                  <option value="HNL">Lempira (HNL)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Símbolo</label>
                <input type="text" value={formData.currencySymbol} onChange={e => setFormData({...formData, currencySymbol: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none" maxLength={3} />
              </div>
            </div>
            <div className="pt-4 border-t border-slate-100">
              <label className="block text-sm font-medium text-slate-700 mb-1">Mensaje de Despedida (Pie de Ticket)</label>
              <textarea value={formData.receiptMsg} onChange={e => setFormData({...formData, receiptMsg: e.target.value})} rows={2} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none" />
            </div>
          </>
        )}

        {/* FEL Tab */}
        {activeTab === 'fel' && (
          <>
            <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer">
              <input type="checkbox" checked={formData.felEnabled} onChange={e => setFormData({...formData, felEnabled: e.target.checked})} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-5 h-5" />
              <div>
                <span className="font-medium text-slate-800">Activar Facturación Electrónica (FEL)</span>
                <p className="text-xs text-slate-500 mt-0.5">Emitir DTE&apos;s a través de un certificador autorizado</p>
              </div>
            </label>

            {formData.felEnabled && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Certificador</label>
                  <select value={formData.felProvider} onChange={e => setFormData({...formData, felProvider: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none">
                    <option value="NONE">Seleccionar...</option>
                    <option value="INFILE">INFILE</option>
                    <option value="DIGIFACT">DIGIFACT</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">NIT Emisor</label>
                  <input type="text" value={formData.felNitEmisor} onChange={e => setFormData({...formData, felNitEmisor: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none" placeholder="12345678" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">API User</label>
                    <input type="text" value={formData.felApiUser} onChange={e => setFormData({...formData, felApiUser: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">API Key</label>
                    <input type="password" value={formData.felApiKey} onChange={e => setFormData({...formData, felApiKey: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none" />
                  </div>
                </div>
                <p className="text-xs text-amber-600 bg-amber-50 p-3 rounded-lg">
                  ⚠️ Las credenciales se almacenan de forma segura. Contacta a tu certificador para obtener las credenciales de producción.
                </p>
              </>
            )}
          </>
        )}

        {/* Payments Tab */}
        {activeTab === 'payments' && (
          <>
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-3">Métodos de pago aceptados</p>
              <div className="space-y-2">
                {PAYMENT_METHOD_OPTIONS.map((m) => (
                  <label key={m.key} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition">
                    <input
                      type="checkbox"
                      checked={formData[m.key]}
                      onChange={e => setFormData({...formData, [m.key]: e.target.checked})}
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

            <div className="pt-4 border-t border-slate-100">
              <p className="text-sm font-semibold text-slate-700 mb-3">Impuestos</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tasa de IVA</label>
                  <div className="relative">
                    <input type="number" step="0.01" min="0" max="1" value={formData.taxRate} onChange={e => setFormData({...formData, taxRate: Number(e.target.value)})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none pr-8" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 text-sm">{(formData.taxRate * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer pb-2">
                    <input type="checkbox" checked={formData.taxIncluded} onChange={e => setFormData({...formData, taxIncluded: e.target.checked})} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    IVA incluido en precio
                  </label>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="pt-4 flex justify-end border-t border-slate-100">
          <button type="submit" disabled={isSaving} className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium transition active:scale-95 disabled:opacity-50">
            {isSaving ? 'Guardando...' : <><Save className="w-5 h-5"/> Guardar Ajustes</>}
          </button>
        </div>
      </form>
    </div>
  );
}
