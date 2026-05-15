'use client';

/**
 * Fase 22c-4 · Wizard de creación de RFQ.
 *
 * Step 1: Items.
 * Step 2: Proveedores (multiselect + email externo).
 * Step 3: Detalles (sucursal, lugar de entrega, deadline, validez, comprador).
 *
 * Acciones finales:
 *  - "Guardar borrador" → POST → status DRAFT, redirect a detalle.
 *  - "Enviar a proveedores" → POST + invitations + send → redirect a detalle.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ChevronLeft, ChevronRight, Loader2, Save, Send, Plus, X, Mail, Store, BookmarkPlus } from 'lucide-react';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { useToast } from '@/components/ui/toast';
import { RfqItemsForm, type RfqItemDraft } from '@/components/purchases/RfqItemsForm';
import { TemplateSelector } from '@/components/templates/TemplateSelector';
import { SaveAsTemplateModal } from '@/components/templates/SaveAsTemplateModal';
import type { TemplateItem, TemplateMetadata } from '@/lib/templates/types';

interface SupplierOpt {
  id: string;
  name: string;
  email?: string | null;
}

interface BranchOpt {
  id: string;
  name: string;
}

interface UserOpt {
  id: string;
  name: string | null;
}

interface DetailsState {
  branchId: string;
  deliveryPlace: string;
  responseDeadline: string;
  quoteValidityDays: number;
  buyerId: string;
}

export default function NewRfqPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { toast } = useToast();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [showSaveTpl, setShowSaveTpl] = useState(false);

  const [items, setItems] = useState<RfqItemDraft[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<SupplierOpt[]>([]);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);
  const [externalEmails, setExternalEmails] = useState<string[]>([]);
  const [externalEmailDraft, setExternalEmailDraft] = useState('');

  const [branchOptions, setBranchOptions] = useState<BranchOpt[]>([]);
  const [userOptions, setUserOptions] = useState<UserOpt[]>([]);
  const [companyDefaults, setCompanyDefaults] = useState<{ quoteValidDays: number }>({
    quoteValidDays: 30,
  });

  const [details, setDetails] = useState<DetailsState>({
    branchId: '',
    deliveryPlace: '',
    responseDeadline: '',
    quoteValidityDays: 30,
    buyerId: '',
  });

  // Cargar suppliers, branches, users, company defaults
  useEffect(() => {
    (async () => {
      try {
        const [supRes, branchRes, userRes, settingsRes] = await Promise.all([
          fetch('/api/suppliers'),
          fetch('/api/branches'),
          fetch('/api/users'),
          fetch('/api/settings/company').catch(() => null),
        ]);
        const supData = await supRes.json().catch(() => ({}));
        const branchData = await branchRes.json().catch(() => null);
        const userData = await userRes.json().catch(() => ({}));

        const suppliers: SupplierOpt[] = (supData.suppliers || []).map(
          (s: { id: string; name: string; email?: string | null }) => ({
            id: s.id,
            name: s.name,
            email: s.email,
          }),
        );
        const branchArray = Array.isArray(branchData)
          ? branchData
          : Array.isArray(branchData?.branches)
          ? branchData.branches
          : [];
        const branches: BranchOpt[] = branchArray.map(
          (b: { id: string; name: string }) => ({ id: b.id, name: b.name }),
        );
        const userArray = Array.isArray(userData)
          ? userData
          : Array.isArray(userData?.users)
          ? userData.users
          : [];
        const users: UserOpt[] = userArray.map(
          (u: { id: string; name: string | null }) => ({ id: u.id, name: u.name }),
        );
        setSupplierOptions(suppliers);
        setBranchOptions(branches);
        setUserOptions(users);

        let quoteValidDays = 30;
        if (settingsRes && settingsRes.ok) {
          const s = await settingsRes.json().catch(() => ({}));
          if (s?.quoteValidDays) {
            quoteValidDays = Number(s.quoteValidDays);
          }
        }
        setCompanyDefaults({ quoteValidDays });
        setDetails((d) => ({
          ...d,
          quoteValidityDays: quoteValidDays,
          buyerId: session?.user?.id ?? '',
          branchId: branches.find((b) => b.id === session?.user?.branchId)?.id ?? branches[0]?.id ?? '',
        }));
      } catch (e) {
        console.error(e);
      }
    })();
  }, [session?.user?.id, session?.user?.branchId]);

  /**
   * Fase 22d-5 · Aplicar plantilla a step 1.
   *
   * TemplateItem no carga `productName`/`productSku`; los resolvemos uno
   * por uno contra `/api/products/[id]`. Reemplaza el listado actual.
   */
  const applyTemplate = useCallback(
    async (templateItems: TemplateItem[], metadata: TemplateMetadata | null) => {
      try {
        const resolved: RfqItemDraft[] = [];
        for (const it of templateItems) {
          const res = await fetch(`/api/products/${encodeURIComponent(it.productId)}`);
          if (!res.ok) continue;
          const p = await res.json().catch(() => null);
          if (!p?.id) continue;
          resolved.push({
            productId: p.id,
            productName: p.name ?? '',
            productSku: p.sku ?? '',
            variantId: it.variantId ?? null,
            quantity: Number(it.quantity) > 0 ? Number(it.quantity) : 1,
            unit: it.unit ?? p.unitOfMeasure ?? null,
            specifications: it.specifications ?? null,
            observations: it.observations ?? null,
          });
        }
        if (resolved.length === 0) {
          toast({ tone: 'error', message: 'Ningún producto de la plantilla está disponible.' });
          return;
        }
        setItems(resolved);
        if (metadata) {
          setDetails((d) => ({
            ...d,
            deliveryPlace: metadata.deliveryPlace ?? d.deliveryPlace,
            quoteValidityDays: metadata.quoteValidityDays ?? d.quoteValidityDays,
            branchId: metadata.branchId ?? d.branchId,
          }));
        }
      } catch (err) {
        toast({
          tone: 'error',
          message: err instanceof Error ? err.message : 'No se pudo aplicar la plantilla.',
        });
      }
    },
    [toast],
  );

  const templateItemsPayload: TemplateItem[] = items.map((it) => ({
    productId: it.productId,
    variantId: it.variantId ?? null,
    quantity: it.quantity,
    unit: it.unit ?? null,
    specifications: it.specifications ?? null,
    observations: it.observations ?? null,
  }));
  const templateMetadataPayload: TemplateMetadata = {
    deliveryPlace: details.deliveryPlace || undefined,
    quoteValidityDays: details.quoteValidityDays || undefined,
    branchId: details.branchId || undefined,
  };

  const addExternalEmail = () => {
    const value = externalEmailDraft.trim();
    if (!value) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      toast({ tone: 'error', message: 'Email inválido.' });
      return;
    }
    if (externalEmails.includes(value)) {
      toast({ tone: 'error', message: 'Email ya agregado.' });
      return;
    }
    setExternalEmails([...externalEmails, value]);
    setExternalEmailDraft('');
  };

  const toggleSupplier = (id: string) => {
    setSelectedSupplierIds((curr) =>
      curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id],
    );
  };

  const canGoNext =
    (step === 1 && items.length > 0) ||
    (step === 2 && selectedSupplierIds.length + externalEmails.length > 0) ||
    step === 3;

  const submit = useCallback(
    async (sendNow: boolean) => {
      if (items.length === 0) {
        toast({ tone: 'error', message: 'Agrega al menos un item.' });
        return;
      }
      if (sendNow && selectedSupplierIds.length + externalEmails.length === 0) {
        toast({ tone: 'error', message: 'Agrega al menos un proveedor para enviar.' });
        return;
      }
      setBusy(true);
      try {
        // 1. Crear RFQ en DRAFT
        const payload = {
          branchId: details.branchId || null,
          reason: items.length === 1 ? items[0].productName : `RFQ ${items.length} items`,
          deliveryPlace: details.deliveryPlace || null,
          responseDeadline: details.responseDeadline || null,
          quoteValidityDays: details.quoteValidityDays || null,
          buyerId: details.buyerId || null,
          items: items.map((it) => ({
            productId: it.productId,
            variantId: it.variantId ?? null,
            quantity: it.quantity,
            specifications: it.specifications ?? null,
            unit: it.unit ?? null,
            observations: it.observations ?? null,
          })),
        };
        const res = await fetch('/api/purchases/rfq', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || 'No se pudo crear la RFQ.');
        }
        const rfqId: string = data.id;

        // 2. Agregar invitaciones (suppliers + externalEmails)
        for (const supplierId of selectedSupplierIds) {
          await fetch(`/api/purchases/rfq/${rfqId}/invitations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ supplierId }),
          });
        }
        for (const email of externalEmails) {
          await fetch(`/api/purchases/rfq/${rfqId}/invitations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ externalEmail: email }),
          });
        }

        // 3. Send si se pidió
        if (sendNow) {
          const sendRes = await fetch(`/api/purchases/rfq/${rfqId}/send`, {
            method: 'POST',
          });
          if (!sendRes.ok) {
            const e = await sendRes.json().catch(() => ({}));
            throw new Error(e?.error || 'No se pudo enviar la RFQ.');
          }
        }

        toast({
          tone: 'success',
          message: sendNow ? 'RFQ enviada a proveedores.' : 'Borrador guardado.',
        });
        router.push(`/purchases/rfq/${rfqId}`);
      } catch (err) {
        toast({
          tone: 'error',
          message: err instanceof Error ? err.message : 'Error inesperado.',
        });
      } finally {
        setBusy(false);
      }
    },
    [items, details, selectedSupplierIds, externalEmails, router, toast],
  );

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/dashboard' },
          { label: 'Compras', href: '/purchases' },
          { label: 'RFQ', href: '/purchases/rfq' },
          { label: 'Nueva' },
        ]}
      />

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Nueva RFQ</h1>
        <p className="text-sm text-slate-500 mt-1">
          Cotizá productos a varios proveedores en paralelo.
        </p>
      </div>

      {/* Stepper */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex-1 flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                step >= s ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
              }`}
              aria-current={step === s ? 'step' : undefined}
            >
              {s}
            </div>
            <span
              className={`text-xs font-bold uppercase tracking-widest hidden sm:inline ${
                step >= s ? 'text-slate-800' : 'text-slate-400'
              }`}
            >
              {s === 1 ? 'Items' : s === 2 ? 'Proveedores' : 'Detalles'}
            </span>
            {s < 3 && <div className="flex-1 h-px bg-slate-100 mx-2" />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-800">Items a cotizar</h2>
              <div className="flex flex-wrap gap-2">
                <TemplateSelector
                  type="RFQ"
                  onApply={(tplItems, tplMeta) => {
                    void applyTemplate(tplItems, tplMeta);
                  }}
                  buttonLabel="Usar plantilla"
                />
                <button
                  type="button"
                  onClick={() => setShowSaveTpl(true)}
                  disabled={items.length === 0}
                  aria-label="Guardar como plantilla"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition disabled:opacity-50"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" /> Guardar como plantilla
                </button>
              </div>
            </div>
            <RfqItemsForm items={items} onChange={setItems} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Store className="w-5 h-5 text-blue-600" /> Proveedores registrados
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Seleccioná los proveedores activos a los que querés invitar.
              </p>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-auto">
                {supplierOptions.length === 0 ? (
                  <p className="text-sm text-slate-400 italic col-span-full">
                    No hay proveedores. Cargá uno desde Suppliers.
                  </p>
                ) : (
                  supplierOptions.map((s) => {
                    const checked = selectedSupplierIds.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${
                          checked
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSupplier(s.id)}
                          className="h-4 w-4 rounded text-blue-600"
                          aria-label={`Invitar a ${s.name}`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{s.name}</p>
                          {s.email && (
                            <p className="text-[10px] text-slate-500 truncate">{s.email}</p>
                          )}
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-600" /> Emails externos
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Invitá a proveedores no registrados todavía vía email.
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  type="email"
                  value={externalEmailDraft}
                  onChange={(e) => setExternalEmailDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addExternalEmail();
                    }
                  }}
                  placeholder="proveedor@correo.com"
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100"
                  aria-label="Email externo"
                />
                <button
                  type="button"
                  onClick={addExternalEmail}
                  className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Agregar
                </button>
              </div>
              {externalEmails.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {externalEmails.map((em) => (
                    <span
                      key={em}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg text-sm"
                    >
                      {em}
                      <button
                        type="button"
                        onClick={() =>
                          setExternalEmails(externalEmails.filter((x) => x !== em))
                        }
                        aria-label={`Quitar ${em}`}
                        className="text-rose-500 hover:text-rose-700"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800">Detalles</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">
                  Sucursal *
                </label>
                <select
                  value={details.branchId}
                  onChange={(e) =>
                    setDetails((d) => ({ ...d, branchId: e.target.value }))
                  }
                  className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl outline-none text-sm"
                  aria-label="Sucursal"
                >
                  <option value="">Seleccionar...</option>
                  {branchOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">
                  Lugar de entrega
                </label>
                <input
                  type="text"
                  value={details.deliveryPlace}
                  onChange={(e) =>
                    setDetails((d) => ({ ...d, deliveryPlace: e.target.value }))
                  }
                  placeholder="Bodega principal, sucursal..."
                  className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl outline-none text-sm"
                  aria-label="Lugar de entrega"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">
                  Fecha límite de respuesta
                </label>
                <input
                  type="date"
                  value={details.responseDeadline}
                  onChange={(e) =>
                    setDetails((d) => ({ ...d, responseDeadline: e.target.value }))
                  }
                  className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl outline-none text-sm"
                  aria-label="Fecha límite de respuesta"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">
                  Días validez de cotizaciones
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={details.quoteValidityDays}
                  onChange={(e) =>
                    setDetails((d) => ({
                      ...d,
                      quoteValidityDays: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                  className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl outline-none text-sm"
                  aria-label="Días validez cotización"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Default empresa: {companyDefaults.quoteValidDays} días.
                </p>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">
                  Comprador responsable
                </label>
                <select
                  value={details.buyerId}
                  onChange={(e) =>
                    setDetails((d) => ({ ...d, buyerId: e.target.value }))
                  }
                  className="w-full px-4 py-3 border-2 border-slate-100 rounded-xl outline-none text-sm"
                  aria-label="Comprador"
                >
                  <option value="">Sin asignar</option>
                  {userOptions.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap gap-3 justify-between">
        <div>
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
              disabled={busy}
              className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" /> Atrás
            </button>
          )}
        </div>
        <div className="flex gap-3">
          {step < 3 && (
            <button
              type="button"
              onClick={() => setStep((s) => (s === 1 ? 2 : 3))}
              disabled={!canGoNext || busy}
              className="px-4 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-50"
            >
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === 3 && (
            <>
              <button
                type="button"
                onClick={() => void submit(false)}
                disabled={busy}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar borrador
              </button>
              <button
                type="button"
                onClick={() => void submit(true)}
                disabled={busy || selectedSupplierIds.length + externalEmails.length === 0}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-md disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Enviar a proveedores
              </button>
            </>
          )}
        </div>
      </div>

      {showSaveTpl && (
        <SaveAsTemplateModal
          type="RFQ"
          items={templateItemsPayload}
          metadata={templateMetadataPayload}
          onClose={() => setShowSaveTpl(false)}
        />
      )}
    </div>
  );
}
