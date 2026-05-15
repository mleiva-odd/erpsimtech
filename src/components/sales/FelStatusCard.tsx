'use client';

/**
 * FelStatusCard · Fase 22c-2
 *
 * Card con el estado FEL (Factura Electrónica en Línea) de una venta. Resume:
 *   - Estado del DTE (PENDING / CERTIFIED / REJECTED / CANCELLED / "Sin certificar").
 *   - Metadatos del DTE (UUID, autorización, fecha de certificación, serial, provider).
 *   - Acciones contextuales según estado (Certificar / Descargar XML / Descargar PDF /
 *     Anular FEL).
 *   - Detalle expandible con el response raw del provider.
 *
 * Es client-only (usa `useState`, `useToast`). El parent es responsable de
 * hacer refetch de la venta cuando se invoca `onChanged()` y de pasar el
 * `TaxDocumentLite` resultante del GET `/api/sales/[id]`.
 */

import type { ComponentType, ReactNode, SVGProps } from 'react';
import { useState, useTransition } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  FileCheck2,
  FileX2,
  Download,
  Loader2,
  ChevronDown,
  ChevronUp,
  Clock,
  X,
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';

export interface TaxDocumentLite {
  id: string;
  type: string;
  numeroDisplay: string;
  status: string;
  dteUuid: string | null;
  autorizacion: string | null;
  fechaCertificacion: string | null;
  emisorNit: string;
  receptorNit: string;
  receptorNombre: string;
  taxRegime: string;
  provider: string;
  xmlFirmado: string | null;
  cancelledById: string | null;
  providerResponseJson?: unknown;
  createdAt?: string;
  updatedAt?: string;
}

export interface FelStatusCardProps {
  saleId: string;
  /** Estado de la venta — solo COMPLETED puede certificar. */
  saleStatus: string;
  /** TaxDocument actual de la venta. `null` significa "sin certificar". */
  taxDocument: TaxDocumentLite | null;
  /** Callback invocado tras certificar o anular para que el parent refetchee. */
  onChanged: () => Promise<void> | void;
  /** Si el usuario actual tiene permiso para certificar/anular. Default: true. */
  canManage?: boolean;
}

type Tone = 'gray' | 'green' | 'red' | 'darkred' | 'amber';

const TONE_STYLES: Record<Tone, { bg: string; text: string; border: string; icon: string }> = {
  gray: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', icon: 'text-slate-500' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200', icon: 'text-amber-600' },
  green: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200', icon: 'text-emerald-600' },
  red: { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-200', icon: 'text-rose-600' },
  darkred: { bg: 'bg-rose-200', text: 'text-rose-900', border: 'border-rose-300', icon: 'text-rose-700' },
};

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string; size?: number | string }>;

interface StatusMeta {
  tone: Tone;
  label: string;
  Icon: IconComponent;
}

function statusMeta(status: string | null | undefined): StatusMeta {
  switch (status) {
    case 'CERTIFIED':
      return { tone: 'green', label: 'Certificado', Icon: ShieldCheck };
    case 'PENDING':
      return { tone: 'amber', label: 'Pendiente', Icon: Clock };
    case 'REJECTED':
      return { tone: 'red', label: 'Rechazado', Icon: ShieldAlert };
    case 'CANCELLED':
      return { tone: 'darkred', label: 'Anulado', Icon: FileX2 };
    default:
      return { tone: 'gray', label: 'Sin certificar', Icon: ShieldQuestion };
  }
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  const { tone, label, Icon } = statusMeta(status);
  const styles = TONE_STYLES[tone];
  return (
    <span
      role="status"
      aria-label={`Estado FEL: ${label}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${styles.bg} ${styles.text} ${styles.border}`}
    >
      <Icon className={`h-3.5 w-3.5 ${styles.icon}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: es });
  } catch {
    return iso;
  }
}

function tryStringifyResponse(raw: unknown): string | null {
  if (raw == null) return null;
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return null;
  }
}

export function FelStatusCard({
  saleId,
  saleStatus,
  taxDocument,
  onChanged,
  canManage = true,
}: FelStatusCardProps) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [certifying, setCertifying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Estado del modal de anulación FEL.
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelMotivo, setCancelMotivo] = useState('');
  const [cancelTyping, setCancelTyping] = useState('');

  const isCompleted = saleStatus === 'COMPLETED';
  const canCertify =
    canManage &&
    isCompleted &&
    (!taxDocument || taxDocument.status === 'REJECTED');
  const canDownload = taxDocument?.status === 'CERTIFIED' || taxDocument?.status === 'CANCELLED';
  const canCancelFel =
    canManage &&
    taxDocument?.status === 'CERTIFIED' &&
    !taxDocument.cancelledById;

  const refetch = () => {
    startTransition(() => {
      void onChanged();
    });
  };

  const handleCertify = async () => {
    setErrorMessage(null);
    setCertifying(true);
    try {
      const res = await fetch(`/api/sales/${saleId}/certify`, { method: 'POST' });
      const data: { error?: string; taxDocument?: { numeroDisplay?: string }; alreadyCertified?: boolean } =
        await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || `Error certificando FEL (HTTP ${res.status}).`;
        setErrorMessage(msg);
        toast({ tone: 'error', message: msg });
        return;
      }
      if (data.alreadyCertified) {
        toast({ tone: 'info', message: 'La factura ya estaba certificada.' });
      } else {
        toast({
          tone: 'success',
          message: `Factura certificada · ${data.taxDocument?.numeroDisplay ?? ''}`.trim(),
        });
      }
      refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de red al certificar.';
      setErrorMessage(msg);
      toast({ tone: 'error', message: msg });
    } finally {
      setCertifying(false);
    }
  };

  const openCancelModal = () => {
    setCancelMotivo('');
    setCancelTyping('');
    setShowCancelModal(true);
  };

  const closeCancelModal = () => {
    if (cancelling) return;
    setShowCancelModal(false);
  };

  const handleCancelFel = async () => {
    if (!taxDocument) return;
    if (cancelTyping !== 'ANULAR') {
      toast({ tone: 'warning', message: 'Escribí ANULAR para confirmar.' });
      return;
    }
    if (cancelMotivo.trim().length < 3) {
      toast({ tone: 'warning', message: 'Motivo requerido (mín. 3 caracteres).' });
      return;
    }

    setErrorMessage(null);
    setCancelling(true);
    try {
      const res = await fetch(`/api/sales/${saleId}/fel-cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: cancelMotivo.trim() }),
      });
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || `Error anulando DTE (HTTP ${res.status}).`;
        setErrorMessage(msg);
        toast({ tone: 'error', message: msg });
        return;
      }
      toast({ tone: 'success', message: 'DTE anulado. NCRE emitida correctamente.' });
      setShowCancelModal(false);
      refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de red al anular.';
      setErrorMessage(msg);
      toast({ tone: 'error', message: msg });
    } finally {
      setCancelling(false);
    }
  };

  const responseRaw = tryStringifyResponse(taxDocument?.providerResponseJson);

  return (
    <section
      aria-labelledby="fel-section-title"
      className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6"
    >
      <header className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h2
            id="fel-section-title"
            className="font-bold text-slate-800 flex items-center gap-2"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600" aria-hidden="true" />
            Factura Electrónica (FEL)
          </h2>
          <StatusBadge status={taxDocument?.status} />
        </div>

        <div className="flex flex-wrap gap-2">
          {canCertify && (
            <button
              type="button"
              onClick={handleCertify}
              disabled={certifying || pending}
              aria-label="Certificar factura electrónica ahora"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition shadow-md shadow-emerald-600/20 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2"
            >
              {certifying ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              )}
              {taxDocument?.status === 'REJECTED' ? 'Reintentar certificación' : 'Certificar ahora'}
            </button>
          )}

          {canDownload && (
            <>
              <a
                href={`/api/sales/${saleId}/fel-xml`}
                aria-label="Descargar XML del DTE"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2"
              >
                <Download className="h-4 w-4" aria-hidden="true" /> XML
              </a>
              <a
                href={`/api/sales/${saleId}/fel-pdf`}
                target="_blank"
                rel="noreferrer"
                aria-label="Descargar PDF del DTE"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2"
              >
                <Download className="h-4 w-4" aria-hidden="true" /> PDF
              </a>
            </>
          )}

          {canCancelFel && (
            <button
              type="button"
              onClick={openCancelModal}
              disabled={cancelling || pending}
              aria-label="Anular factura electrónica"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-100 transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-rose-300 focus:ring-offset-2"
            >
              {cancelling ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileX2 className="h-4 w-4" aria-hidden="true" />
              )}
              Anular FEL
            </button>
          )}
        </div>
      </header>

      {errorMessage && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {errorMessage}
        </div>
      )}

      {!taxDocument && (
        <p className="text-sm text-slate-500">
          {isCompleted
            ? 'Esta venta aún no tiene DTE certificado. Generá la factura electrónica para SAT.'
            : 'La venta debe estar en estado COMPLETED para poder certificar el DTE.'}
        </p>
      )}

      {taxDocument && (
        <>
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <InfoTile
              icon={<FileCheck2 className="h-4 w-4" />}
              label="Tipo · Número"
              value={`${taxDocument.type} · ${taxDocument.numeroDisplay}`}
              sub={`Provider: ${taxDocument.provider}`}
            />
            <InfoTile
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Régimen"
              value={taxDocument.taxRegime}
              sub={taxDocument.emisorNit ? `NIT emisor: ${taxDocument.emisorNit}` : ''}
            />
            <InfoTile
              icon={<Clock className="h-4 w-4" />}
              label="Fecha certificación"
              value={formatDate(taxDocument.fechaCertificacion)}
              sub={taxDocument.autorizacion ? `Aut.: ${taxDocument.autorizacion}` : ''}
            />
            <InfoTile
              icon={<FileCheck2 className="h-4 w-4" />}
              label="UUID"
              value={taxDocument.dteUuid ?? '-'}
              sub={
                taxDocument.cancelledById
                  ? 'Documento anulado por NCRE'
                  : `Receptor: ${taxDocument.receptorNombre}`
              }
              mono
            />
          </dl>

          {taxDocument.status === 'CANCELLED' && (
            <p
              role="alert"
              className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700"
            >
              Este DTE fue anulado mediante NCRE. El XML/PDF queda disponible solo como respaldo
              histórico.
            </p>
          )}

          {taxDocument.status === 'REJECTED' && (
            <p
              role="alert"
              className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700"
            >
              El provider rechazó la certificación. Revisá los datos del receptor y reintentá.
            </p>
          )}

          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowDetail((v) => !v)}
              aria-expanded={showDetail}
              aria-controls="fel-detail-panel"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 transition focus:outline-none focus:ring-2 focus:ring-slate-300 rounded"
            >
              {showDetail ? (
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              )}
              {showDetail ? 'Ocultar detalle técnico' : 'Ver detalle técnico'}
            </button>

            {showDetail && (
              <div
                id="fel-detail-panel"
                className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3"
              >
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">
                    Última actualización
                  </p>
                  <p className="text-xs font-mono text-slate-700 break-all">
                    {formatDate(taxDocument.updatedAt ?? taxDocument.fechaCertificacion)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">
                    Receptor
                  </p>
                  <p className="text-xs font-mono text-slate-700 break-all">
                    {taxDocument.receptorNit} · {taxDocument.receptorNombre}
                  </p>
                </div>
                {responseRaw && (
                  <div className="rounded-xl border border-slate-200 bg-slate-950 p-3 text-slate-100 lg:col-span-2 max-h-64 overflow-auto">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">
                      Respuesta del provider
                    </p>
                    <pre className="text-[11px] font-mono whitespace-pre-wrap break-all">
                      {responseRaw}
                    </pre>
                  </div>
                )}
                {taxDocument.xmlFirmado && (
                  <div className="rounded-xl border border-slate-200 bg-slate-950 p-3 text-slate-100 lg:col-span-2 max-h-64 overflow-auto">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">
                      XML firmado (preview)
                    </p>
                    <pre className="text-[11px] font-mono whitespace-pre-wrap break-all">
                      {taxDocument.xmlFirmado.slice(0, 4000)}
                      {taxDocument.xmlFirmado.length > 4000 ? '\n\n…[truncado]' : ''}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {showCancelModal && taxDocument && (
        <CancelFelModal
          taxDocument={taxDocument}
          motivo={cancelMotivo}
          onMotivoChange={setCancelMotivo}
          typingValue={cancelTyping}
          onTypingChange={setCancelTyping}
          submitting={cancelling}
          onConfirm={handleCancelFel}
          onClose={closeCancelModal}
        />
      )}
    </section>
  );
}

interface CancelFelModalProps {
  taxDocument: TaxDocumentLite;
  motivo: string;
  onMotivoChange: (value: string) => void;
  typingValue: string;
  onTypingChange: (value: string) => void;
  submitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

function CancelFelModal({
  taxDocument,
  motivo,
  onMotivoChange,
  typingValue,
  onTypingChange,
  submitting,
  onConfirm,
  onClose,
}: CancelFelModalProps) {
  const typingOk = typingValue === 'ANULAR';
  const motivoOk = motivo.trim().length >= 3;
  const disabled = submitting || !typingOk || !motivoOk;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fel-cancel-title"
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
    >
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-rose-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
              <FileX2 className="w-5 h-5 text-rose-600" aria-hidden="true" />
            </div>
            <div>
              <h3 id="fel-cancel-title" className="font-bold text-slate-800 text-lg">
                Anular DTE
              </h3>
              <p className="text-xs text-rose-600 font-medium">{taxDocument.numeroDisplay}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cerrar diálogo"
            className="p-2 hover:bg-rose-100 rounded-xl text-slate-400 hover:text-rose-600 transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">
            Se emitirá una Nota de Crédito (NCRE) asociada al DTE original y se marcará el DTE como
            anulado en SAT.
          </p>
          <div>
            <label
              htmlFor="fel-cancel-motivo"
              className="block text-xs font-bold text-slate-500 uppercase mb-1"
            >
              Motivo de anulación <span className="text-rose-600">*</span>
            </label>
            <textarea
              id="fel-cancel-motivo"
              value={motivo}
              onChange={(e) => onMotivoChange(e.target.value)}
              rows={3}
              placeholder="Error de captura, devolución total, datos incorrectos..."
              aria-required="true"
              aria-invalid={!motivoOk}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none resize-none"
            />
            <p className="mt-1 text-[11px] text-slate-400">Mínimo 3 caracteres.</p>
          </div>
          <div>
            <label
              htmlFor="fel-cancel-typing"
              className="block text-xs font-bold text-slate-500 uppercase mb-1"
            >
              Escribí <span className="font-mono text-rose-600">ANULAR</span> para confirmar
            </label>
            <input
              id="fel-cancel-typing"
              type="text"
              autoComplete="off"
              value={typingValue}
              onChange={(e) => onTypingChange(e.target.value)}
              aria-label="Escribí ANULAR para confirmar"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none"
            />
          </div>
        </div>
        <div className="px-6 py-5 border-t border-slate-100 bg-slate-50 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-3 rounded-2xl text-slate-500 font-bold hover:bg-slate-200 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={disabled}
            className="flex-[1.4] py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
            ) : (
              <FileX2 className="w-4 h-4" aria-hidden="true" />
            )}
            Confirmar Anulación
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoTile({
  icon,
  label,
  value,
  sub,
  mono,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <div className="flex items-center gap-2 text-slate-400 mb-1">
        <span aria-hidden="true">{icon}</span>
        <dt className="text-[10px] font-bold uppercase tracking-wider">{label}</dt>
      </div>
      <dd
        className={`text-sm font-bold text-slate-800 break-all ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </dd>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5 break-all">{sub}</p>}
    </div>
  );
}
