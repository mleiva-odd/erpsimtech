'use client';

import { useState } from 'react';
import { X, Save, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface BankFormData {
  name: string;
  type: string;
  accountNumber: string;
  currency: string;
  isActive: boolean;
}

interface EditableBank {
  id: string;
  name: string;
  type: string;
  accountNumber?: string | null;
  currency: string;
  isActive: boolean;
}

interface BankModalProps {
  onClose: () => void;
  onSaved: () => void;
  bank?: EditableBank | null;
}

export function BankModal({ onClose, onSaved, bank }: BankModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState<BankFormData>({
    name: bank?.name || '',
    type: bank?.type || 'BANK_ACCOUNT',
    accountNumber: bank?.accountNumber || '',
    currency: bank?.currency || 'GTQ',
    isActive: bank ? bank.isActive : true
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const isEdit = !!bank;
      const url = isEdit ? `/api/accounting/banks/${bank.id}` : '/api/accounting/banks';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al guardar el banco');
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el banco');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-white">
              {bank ? 'Editar Cuenta' : 'Nueva Cuenta Financiera'}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Configura los detalles de la cuenta o caja.
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm">
              {error}
            </div>
          )}

          <form id="bank-form" onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-slate-300">Nombre de la Cuenta *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ej. Banrural Monetaria, Caja Fuerte General"
                className="bg-slate-800/50 border-slate-700 text-white"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type" className="text-slate-300">Tipo de Cuenta *</Label>
              <select
                id="type"
                value={formData.type}
                onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                className="flex w-full rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                required
              >
                <option value="BANK_ACCOUNT">Cuenta Bancaria</option>
                <option value="CASH_BOX">Caja Física (Efectivo)</option>
                <option value="CREDIT_CARD">Tarjeta de Crédito Corporativa</option>
                <option value="DIGITAL_WALLET">Billetera Digital</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accountNumber" className="text-slate-300">Número de Cuenta (Opcional)</Label>
              <Input
                id="accountNumber"
                value={formData.accountNumber}
                onChange={(e) => setFormData(prev => ({ ...prev, accountNumber: e.target.value }))}
                placeholder="Ej. 3450001235"
                className="bg-slate-800/50 border-slate-700 text-white"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="currency" className="text-slate-300">Moneda *</Label>
              <select
                id="currency"
                value={formData.currency}
                onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value }))}
                className="flex w-full rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                required
              >
                <option value="GTQ">Quetzales (GTQ)</option>
                <option value="USD">Dólares (USD)</option>
              </select>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900 bg-slate-800"
              />
              <Label htmlFor="isActive" className="text-slate-300 font-medium cursor-pointer">
                Cuenta Activa (Disponible para movimientos)
              </Label>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-800 flex gap-3 justify-end bg-slate-900/50 rounded-b-2xl">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="text-slate-400 hover:text-white"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="bank-form"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {bank ? 'Guardar Cambios' : 'Crear Cuenta'}
          </Button>
        </div>
      </div>
    </div>
  );
}
