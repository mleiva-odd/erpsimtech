'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Building2,
  User,
  MapPin,
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Store,
  FileText,
  Receipt,
  ListChecks,
  Upload,
  Trash2,
  Plus,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';

// ───────────────────────────────────────────────────────────────────────────
// Fase 27 · Wizard Onboarding production-ready.
//
// 6 steps:
//   1. company     · Datos de empresa + tipo de negocio + logo
//   2. taxRegime   · Régimen tributario (General / Pequeño Contribuyente)
//   3. admin       · Cuenta del administrador
//   4. branches    · Sucursal principal + adicionales (hasta 2 en trial)
//   5. fel         · Config FEL opcional (puede saltarse)
//   6. summary     · Revisar y confirmar
//
// Persistencia: localStorage con key `simtech.onboarding.draft`. Se guarda
// en cada cambio de step. Se limpia al éxito. Las contraseñas NUNCA se
// persisten (campos sensibles excluidos del snapshot).
// ───────────────────────────────────────────────────────────────────────────

type Step = 'company' | 'taxRegime' | 'admin' | 'branches' | 'fel' | 'summary' | 'done';

type BusinessType = 'COMMERCE' | 'SERVICES' | 'RESTAURANT' | 'INDUSTRY';
type TaxRegime = 'GENERAL' | 'PEQUENO_CONTRIBUYENTE';
type ExtraUserRole = 'Vendedor' | 'Cajero' | 'Contador' | 'Gerente';
type FelProvider = 'MOCK' | 'INFILE' | 'DIGIFACT';

const BUSINESS_TYPE_LABELS: Record<BusinessType, { name: string; desc: string }> = {
  COMMERCE: {
    name: 'Comercio (venta de productos)',
    desc: 'Tiendas, distribuidoras, mayoristas. Plan estándar GT.',
  },
  SERVICES: {
    name: 'Servicios profesionales',
    desc: 'Consultoras, abogados, agencias. Sin inventario.',
  },
  RESTAURANT: {
    name: 'Restaurante / Café',
    desc: 'Restaurantes, cafés, food trucks. Incluye insumos y propinas.',
  },
  INDUSTRY: {
    name: 'Industria / Manufactura',
    desc: 'Fábricas con materias primas y productos en proceso.',
  },
};

const TAX_REGIME_INFO: Record<TaxRegime, { name: string; desc: string; rate: string }> = {
  GENERAL: {
    name: 'Régimen General',
    desc: 'IVA 12% en cada venta. Permite acreditar crédito fiscal en compras. Apto para la mayoría de comercios formalizados.',
    rate: '12% IVA',
  },
  PEQUENO_CONTRIBUYENTE: {
    name: 'Pequeño Contribuyente',
    desc: 'Tasa única 5% sobre ventas. Sin crédito fiscal. Para ingresos brutos hasta Q150,000/año. Régimen simplificado SAT.',
    rate: '5% sobre ventas',
  },
};

interface ExtraBranch {
  name: string;
  code: string;
  address: string;
}

interface ExtraUser {
  name: string;
  email: string;
  password: string;
  branchCode: string; // '' = principal
  role: ExtraUserRole;
}

interface DraftState {
  step: Step;
  companyName: string;
  companySlug: string;
  companyEmail: string;
  companyPhone: string;
  companyNit: string;
  businessType: BusinessType;
  logoUrl: string;
  taxRegime: TaxRegime | '';
  adminName: string;
  adminEmail: string;
  branchName: string;
  branchCode: string;
  branchAddress: string;
  extraBranches: ExtraBranch[];
  extraUsers: Omit<ExtraUser, 'password'>[]; // password NUNCA se persiste
  felEnabled: boolean;
  felProvider: FelProvider;
  felApiUser: string;
  felCertificateUrl: string;
}

const TRIAL_MAX_BRANCHES = 2;
const TRIAL_MAX_USERS_PER_BRANCH = 3;
const DRAFT_KEY = 'simtech.onboarding.draft';

const DEFAULT_DRAFT: DraftState = {
  step: 'company',
  companyName: '',
  companySlug: '',
  companyEmail: '',
  companyPhone: '',
  companyNit: '',
  businessType: 'COMMERCE',
  logoUrl: '',
  taxRegime: '',
  adminName: '',
  adminEmail: '',
  branchName: 'Sucursal Central',
  branchCode: 'SUC-01',
  branchAddress: '',
  extraBranches: [],
  extraUsers: [],
  felEnabled: false,
  felProvider: 'MOCK',
  felApiUser: '',
  felCertificateUrl: '',
};

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function validatePasswordStrong(pwd: string): string | null {
  if (pwd.length < 12) return 'La contraseña debe tener al menos 12 caracteres';
  if (!/[a-z]/.test(pwd)) return 'Debe incluir al menos una minúscula';
  if (!/[A-Z]/.test(pwd)) return 'Debe incluir al menos una mayúscula';
  if (!/[0-9]/.test(pwd)) return 'Debe incluir al menos un dígito';
  if (!/[^A-Za-z0-9]/.test(pwd)) return 'Debe incluir al menos un símbolo';
  return null;
}

const STEPS: { id: Exclude<Step, 'done'>; label: string; icon: ReactNode }[] = [
  { id: 'company', label: 'Empresa', icon: <Building2 className="w-4 h-4" /> },
  { id: 'taxRegime', label: 'Régimen', icon: <Receipt className="w-4 h-4" /> },
  { id: 'admin', label: 'Admin', icon: <User className="w-4 h-4" /> },
  { id: 'branches', label: 'Sucursales', icon: <MapPin className="w-4 h-4" /> },
  { id: 'fel', label: 'FEL', icon: <FileText className="w-4 h-4" /> },
  { id: 'summary', label: 'Revisar', icon: <ListChecks className="w-4 h-4" /> },
];

export default function OnboardingPage() {
  const [draft, setDraft] = useState<DraftState>(DEFAULT_DRAFT);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  // Map<email, password> — passwords de extraUsers en memoria (no se persisten).
  const [extraPasswords, setExtraPasswords] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    companyName: string;
    trialEndsAt: string;
    branches: number;
    extraUsers: number;
    felConfigured: boolean;
  } | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore draft on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<DraftState>;
        // Solo restauramos si hay algún campo significativo.
        if (parsed.companyName || parsed.adminEmail) {
          // Si el draft viejo tiene step='done' (no debería, lo limpiamos
          // al éxito), arrancamos en 'company' para evitar pantalla rota.
          const safeStep: Step = parsed.step && parsed.step !== 'done' ? parsed.step : 'company';
          setDraft({ ...DEFAULT_DRAFT, ...parsed, step: safeStep });
          setShowResumeBanner(true);
        }
      }
    } catch {
      // localStorage roto o JSON inválido → ignorar.
    } finally {
      setDraftLoaded(true);
    }
  }, []);

  // Persist on every change (except done step).
  useEffect(() => {
    if (!draftLoaded) return;
    if (draft.step === 'done') return;
    try {
      // Snapshot SIN passwords. extraUsers vienen sin password en el state.
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Quota exceeded o storage deshabilitado.
    }
  }, [draft, draftLoaded]);

  const updateDraft = <K extends keyof DraftState>(field: K, value: DraftState[K]) => {
    setDraft((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'companyName' && typeof value === 'string') {
        next.companySlug = generateSlug(value);
      }
      return next;
    });
  };

  const setStep = (step: Step) => {
    setError('');
    setDraft((prev) => ({ ...prev, step }));
  };

  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  };

  const handleResetDraft = () => {
    clearDraft();
    setDraft(DEFAULT_DRAFT);
    setAdminPassword('');
    setAdminPasswordConfirm('');
    setExtraPasswords({});
    setShowResumeBanner(false);
    setError('');
  };

  const validateStep = (): boolean => {
    setError('');
    if (draft.step === 'company') {
      if (!draft.companyName.trim() || !draft.companySlug.trim() || !draft.companyEmail.trim()) {
        setError('Nombre, identificador y email son obligatorios');
        return false;
      }
      if (!/^[a-z0-9-]+$/.test(draft.companySlug)) {
        setError('El identificador solo permite letras minúsculas, números y guiones');
        return false;
      }
    }
    if (draft.step === 'taxRegime') {
      if (!draft.taxRegime) {
        setError('Seleccioná el régimen tributario (podés cambiarlo después solo desde soporte)');
        return false;
      }
    }
    if (draft.step === 'admin') {
      if (!draft.adminName.trim() || !draft.adminEmail.trim()) {
        setError('Nombre y email son obligatorios');
        return false;
      }
      const pwdErr = validatePasswordStrong(adminPassword);
      if (pwdErr) {
        setError(pwdErr);
        return false;
      }
      if (adminPassword !== adminPasswordConfirm) {
        setError('Las contraseñas no coinciden');
        return false;
      }
    }
    if (draft.step === 'branches') {
      if (!draft.branchName.trim() || !draft.branchCode.trim()) {
        setError('La sucursal principal requiere nombre y código');
        return false;
      }
      const allCodes = [draft.branchCode, ...draft.extraBranches.map((b) => b.code)].map((c) =>
        c.toLowerCase().trim(),
      );
      if (new Set(allCodes).size !== allCodes.length) {
        setError('Hay códigos de sucursal duplicados');
        return false;
      }
      for (const b of draft.extraBranches) {
        if (!b.name.trim() || !b.code.trim()) {
          setError('Todas las sucursales adicionales requieren nombre y código');
          return false;
        }
      }
      // Validar usuarios extra acá también (formulario está dentro del mismo step).
      const allEmails = [draft.adminEmail, ...draft.extraUsers.map((u) => u.email)].map((e) =>
        e.toLowerCase().trim(),
      );
      if (new Set(allEmails).size !== allEmails.length) {
        setError('Hay correos repetidos entre el admin y los usuarios adicionales');
        return false;
      }
      for (const u of draft.extraUsers) {
        if (!u.name.trim() || !u.email.trim()) {
          setError('Todos los usuarios adicionales requieren nombre y email');
          return false;
        }
        const pwd = extraPasswords[u.email] ?? '';
        const pwdErr = validatePasswordStrong(pwd);
        if (pwdErr) {
          setError(`Contraseña de "${u.email}": ${pwdErr}`);
          return false;
        }
      }
      // Validar quotas
      const usersPerBranch = new Map<string, number>();
      usersPerBranch.set(draft.branchCode, 1); // admin
      for (const u of draft.extraUsers) {
        const target = u.branchCode || draft.branchCode;
        usersPerBranch.set(target, (usersPerBranch.get(target) ?? 0) + 1);
      }
      for (const [code, count] of usersPerBranch.entries()) {
        if (count > TRIAL_MAX_USERS_PER_BRANCH) {
          setError(
            `Plan trial: máximo ${TRIAL_MAX_USERS_PER_BRANCH} usuarios por sucursal (sucursal "${code}" tiene ${count}).`,
          );
          return false;
        }
      }
    }
    if (draft.step === 'fel' && draft.felEnabled && draft.felProvider !== 'MOCK') {
      if (!draft.felApiUser.trim()) {
        setError('El proveedor FEL requiere usuario API');
        return false;
      }
    }
    return true;
  };

  const nextStep = () => {
    if (!validateStep()) return;
    const idx = STEPS.findIndex((s) => s.id === draft.step);
    if (idx >= 0 && idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1].id);
    }
  };

  const prevStep = () => {
    setError('');
    const idx = STEPS.findIndex((s) => s.id === draft.step);
    if (idx > 0) setStep(STEPS[idx - 1].id);
  };

  // ── Logo upload ──
  const handleLogoUpload = async (file: File) => {
    if (!file) return;
    const allowed = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!allowed.has(file.type)) {
      setError('Formato inválido. Subí PNG, JPG o WebP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('El logo no puede pesar más de 2 MB');
      return;
    }
    setError('');
    setIsUploadingLogo(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const data: { url?: string; error?: string } = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || 'No se pudo subir el logo');
      } else {
        updateDraft('logoUrl', data.url);
      }
    } catch {
      setError('Error de red al subir el logo');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  // ── Extra branches / users ──
  const addExtraBranch = () => {
    if (1 + draft.extraBranches.length >= TRIAL_MAX_BRANCHES) {
      setError(`Plan trial: máximo ${TRIAL_MAX_BRANCHES} sucursales`);
      return;
    }
    setDraft((prev) => ({
      ...prev,
      extraBranches: [
        ...prev.extraBranches,
        { name: '', code: `SUC-${(prev.extraBranches.length + 2).toString().padStart(2, '0')}`, address: '' },
      ],
    }));
  };

  const updateExtraBranch = (idx: number, field: keyof ExtraBranch, value: string) => {
    setDraft((prev) => ({
      ...prev,
      extraBranches: prev.extraBranches.map((b, i) => (i === idx ? { ...b, [field]: value } : b)),
    }));
  };

  const removeExtraBranch = (idx: number) => {
    setDraft((prev) => ({
      ...prev,
      extraBranches: prev.extraBranches.filter((_, i) => i !== idx),
    }));
  };

  const addExtraUser = () => {
    setDraft((prev) => ({
      ...prev,
      extraUsers: [
        ...prev.extraUsers,
        { name: '', email: '', branchCode: '', role: 'Vendedor' },
      ],
    }));
  };

  const updateExtraUser = (
    idx: number,
    field: 'name' | 'email' | 'branchCode' | 'role' | 'password',
    value: string,
  ) => {
    if (field === 'password') {
      // En state aparte (sin persistencia).
      const email = draft.extraUsers[idx]?.email ?? '';
      setExtraPasswords((prev) => ({ ...prev, [email]: value }));
      return;
    }
    setDraft((prev) => {
      const oldEmail = prev.extraUsers[idx]?.email;
      const updated = prev.extraUsers.map((u, i) => {
        if (i !== idx) return u;
        if (field === 'role') {
          return { ...u, role: value as ExtraUserRole };
        }
        return { ...u, [field]: value };
      });
      // Si cambió el email, re-key del map de passwords.
      if (field === 'email' && oldEmail && oldEmail !== value) {
        setExtraPasswords((prevMap) => {
          const next = { ...prevMap };
          if (oldEmail in next) {
            next[value] = next[oldEmail];
            delete next[oldEmail];
          }
          return next;
        });
      }
      return { ...prev, extraUsers: updated };
    });
  };

  const removeExtraUser = (idx: number) => {
    const email = draft.extraUsers[idx]?.email;
    setDraft((prev) => ({
      ...prev,
      extraUsers: prev.extraUsers.filter((_, i) => i !== idx),
    }));
    if (email) {
      setExtraPasswords((prev) => {
        const next = { ...prev };
        delete next[email];
        return next;
      });
    }
  };

  // ── Submit ──
  const handleSubmit = async () => {
    if (!validateStep()) return;
    setIsSubmitting(true);
    setError('');

    try {
      const payload: Record<string, unknown> = {
        companyName: draft.companyName,
        companySlug: draft.companySlug,
        companyEmail: draft.companyEmail,
        companyPhone: draft.companyPhone || undefined,
        companyNit: draft.companyNit || undefined,
        taxRegime: draft.taxRegime || null,
        businessType: draft.businessType,
        adminName: draft.adminName,
        adminEmail: draft.adminEmail,
        adminPassword,
        branchName: draft.branchName,
        branchCode: draft.branchCode,
        branchAddress: draft.branchAddress || undefined,
        extraBranches: draft.extraBranches.map((b) => ({
          name: b.name,
          code: b.code,
          address: b.address || undefined,
        })),
        extraUsers: draft.extraUsers.map((u) => ({
          name: u.name,
          email: u.email,
          password: extraPasswords[u.email] ?? '',
          branchCode: u.branchCode || undefined,
          role: u.role,
        })),
      };
      if (draft.logoUrl) payload.logoUrl = draft.logoUrl;
      if (draft.felEnabled) {
        payload.felConfig = {
          enabled: true,
          provider: draft.felProvider,
          apiUser: draft.felApiUser || undefined,
          // apiKey se ingresa al final y no se persiste — la pedimos directo al submit.
          apiKey: (document.getElementById('felApiKey') as HTMLInputElement | null)?.value || undefined,
          certificateUrl: draft.felCertificateUrl || undefined,
        };
      }

      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Error al registrar');
        return;
      }
      setResult({
        companyName: data.companyName,
        trialEndsAt: data.trialEndsAt,
        branches: data.branches ?? 1,
        extraUsers: data.extraUsers ?? 0,
        felConfigured: Boolean(data.felConfigured),
      });
      clearDraft();
      setStep('done');
    } catch {
      setError('Error de conexión');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentIdx = STEPS.findIndex((s) => s.id === draft.step);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-white mb-2">
            <Store className="w-8 h-8 text-blue-400" />
            <span className="text-2xl font-bold">SIMTECH</span>
          </div>
          <p className="text-slate-300 text-sm">
            Wizard de onboarding · Prueba gratis de 30 días
          </p>
        </div>

        {/* Resume banner */}
        {showResumeBanner && draft.step !== 'done' && (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between gap-3 px-4 py-3 bg-amber-100 border border-amber-300 rounded-xl text-amber-900 text-sm"
          >
            <span>
              Recuperamos el borrador anterior — las contraseñas no se guardan, las tenés que volver a ingresar.
            </span>
            <button
              type="button"
              onClick={handleResetDraft}
              className="text-amber-900 underline font-medium"
              aria-label="Descartar borrador y empezar de cero"
            >
              Empezar de cero
            </button>
          </div>
        )}

        {/* Steps Indicator */}
        {draft.step !== 'done' && (
          <ol
            className="flex items-center justify-center gap-2 sm:gap-3 mb-8 flex-wrap"
            aria-label="Progreso del onboarding"
          >
            {STEPS.map((s, idx) => (
              <li key={s.id} className="flex items-center gap-2">
                <div
                  aria-current={idx === currentIdx ? 'step' : undefined}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    idx < currentIdx
                      ? 'bg-green-500 text-white'
                      : idx === currentIdx
                      ? 'bg-blue-500 text-white scale-110'
                      : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  {idx < currentIdx ? '✓' : idx + 1}
                </div>
                <span
                  className={`text-xs hidden sm:block ${
                    idx === currentIdx ? 'text-white font-semibold' : 'text-slate-400'
                  }`}
                >
                  {s.label}
                </span>
                {idx < STEPS.length - 1 && (
                  <div
                    className={`w-6 h-0.5 ${
                      idx < currentIdx ? 'bg-green-500' : 'bg-slate-700'
                    }`}
                  />
                )}
              </li>
            ))}
          </ol>
        )}

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {draft.step === 'done' && result ? (
            <DoneScreen result={result} />
          ) : (
            <>
              <header className="px-8 py-6 border-b border-slate-100 bg-slate-50">
                <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                  {STEPS[currentIdx]?.icon}
                  {STEP_TITLES[draft.step as Exclude<Step, 'done'>]}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {STEP_SUBTITLES[draft.step as Exclude<Step, 'done'>]}
                </p>
              </header>

              <div className="p-8 space-y-4">
                {/* Step 1: Company */}
                {draft.step === 'company' && (
                  <>
                    <Field
                      label="Nombre Comercial *"
                      value={draft.companyName}
                      onChange={(v) => updateDraft('companyName', v)}
                      placeholder="Distribuidora XYZ"
                      ariaRequired
                    />
                    <Field
                      label="Identificador (URL)"
                      value={draft.companySlug}
                      onChange={(v) => updateDraft('companySlug', v)}
                      placeholder="distribuidora-xyz"
                      mono
                    />
                    <Field
                      label="Email de Contacto *"
                      type="email"
                      value={draft.companyEmail}
                      onChange={(v) => updateDraft('companyEmail', v)}
                      placeholder="info@empresa.com"
                      ariaRequired
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <Field
                        label="NIT (opcional en trial)"
                        value={draft.companyNit}
                        onChange={(v) => updateDraft('companyNit', v)}
                        placeholder="12345678-9"
                      />
                      <Field
                        label="Teléfono"
                        value={draft.companyPhone}
                        onChange={(v) => updateDraft('companyPhone', v)}
                        placeholder="5555-0000"
                      />
                    </div>

                    {/* Business type */}
                    <div>
                      <label
                        htmlFor="businessType"
                        className="block text-sm font-medium text-slate-700 mb-1"
                      >
                        Tipo de negocio *
                      </label>
                      <select
                        id="businessType"
                        value={draft.businessType}
                        onChange={(e) =>
                          updateDraft('businessType', e.target.value as BusinessType)
                        }
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none transition bg-white"
                        aria-describedby="businessTypeHelp"
                      >
                        {(Object.keys(BUSINESS_TYPE_LABELS) as BusinessType[]).map((t) => (
                          <option key={t} value={t}>
                            {BUSINESS_TYPE_LABELS[t].name}
                          </option>
                        ))}
                      </select>
                      <p id="businessTypeHelp" className="text-xs text-slate-500 mt-1.5">
                        {BUSINESS_TYPE_LABELS[draft.businessType].desc} Esto define el plan de
                        cuentas inicial. Podés ajustarlo después desde Contabilidad.
                      </p>
                    </div>

                    {/* Logo */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Logo de la empresa (opcional)
                      </label>
                      <div className="flex items-center gap-3">
                        {draft.logoUrl ? (
                          <img
                            src={draft.logoUrl}
                            alt="Logo cargado"
                            className="w-16 h-16 object-contain rounded-lg border border-slate-200 bg-white"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                            <Upload className="w-5 h-5" />
                          </div>
                        )}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleLogoUpload(f);
                          }}
                          className="hidden"
                          aria-label="Seleccionar archivo de logo"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploadingLogo}
                          className="px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50 transition disabled:opacity-50 flex items-center gap-2"
                        >
                          {isUploadingLogo ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" /> Subiendo...
                            </>
                          ) : draft.logoUrl ? (
                            'Cambiar logo'
                          ) : (
                            'Subir logo'
                          )}
                        </button>
                        {draft.logoUrl && (
                          <button
                            type="button"
                            onClick={() => updateDraft('logoUrl', '')}
                            className="text-red-600 hover:text-red-700 text-sm"
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1.5">
                        PNG / JPG / WebP. Máx 2 MB. Se mostrará en facturas y recibos.
                      </p>
                    </div>
                  </>
                )}

                {/* Step 2: Tax regime */}
                {draft.step === 'taxRegime' && (
                  <div role="radiogroup" aria-label="Régimen tributario" className="space-y-3">
                    {(Object.keys(TAX_REGIME_INFO) as TaxRegime[]).map((tr) => {
                      const info = TAX_REGIME_INFO[tr];
                      const selected = draft.taxRegime === tr;
                      return (
                        <button
                          key={tr}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => updateDraft('taxRegime', tr)}
                          className={`w-full text-left p-4 rounded-xl border-2 transition ${
                            selected
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="font-bold text-slate-800">{info.name}</h3>
                              <p className="text-sm text-slate-600 mt-1">{info.desc}</p>
                            </div>
                            <span
                              className={`text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap ${
                                selected
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {info.rate}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
                      <strong>Importante:</strong> el régimen tributario lo regula SAT. Una vez
                      seteado, NO se permite cambio desde la app — solo soporte puede ajustarlo.
                    </div>
                  </div>
                )}

                {/* Step 3: Admin */}
                {draft.step === 'admin' && (
                  <>
                    <Field
                      label="Nombre Completo *"
                      value={draft.adminName}
                      onChange={(v) => updateDraft('adminName', v)}
                      placeholder="Juan Pérez"
                      ariaRequired
                    />
                    <Field
                      label="Correo Electrónico *"
                      type="email"
                      value={draft.adminEmail}
                      onChange={(v) => updateDraft('adminEmail', v)}
                      placeholder="admin@empresa.com"
                      ariaRequired
                    />
                    <Field
                      label="Contraseña *"
                      type="password"
                      value={adminPassword}
                      onChange={setAdminPassword}
                      placeholder="Min 12 chars · mayúscula · minúscula · dígito · símbolo"
                      ariaRequired
                    />
                    <Field
                      label="Confirmar Contraseña *"
                      type="password"
                      value={adminPasswordConfirm}
                      onChange={setAdminPasswordConfirm}
                      placeholder="Repetir contraseña"
                      ariaRequired
                    />
                    <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600">
                      Este usuario tendrá el rol <strong>Administrador</strong> con acceso total a
                      la empresa. Por seguridad la contraseña no se guarda en el borrador — si
                      cerrás el navegador la vas a tener que reingresar.
                    </div>
                  </>
                )}

                {/* Step 4: Branches + extra users */}
                {draft.step === 'branches' && (
                  <>
                    <section aria-labelledby="mainBranchTitle">
                      <h3
                        id="mainBranchTitle"
                        className="font-semibold text-slate-800 mb-2 flex items-center gap-2"
                      >
                        <MapPin className="w-4 h-4 text-blue-600" /> Sucursal principal
                      </h3>
                      <Field
                        label="Nombre *"
                        value={draft.branchName}
                        onChange={(v) => updateDraft('branchName', v)}
                        placeholder="Sucursal Central"
                        ariaRequired
                      />
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <Field
                          label="Código *"
                          value={draft.branchCode}
                          onChange={(v) => updateDraft('branchCode', v)}
                          placeholder="SUC-01"
                          mono
                          ariaRequired
                        />
                        <Field
                          label="Dirección"
                          value={draft.branchAddress}
                          onChange={(v) => updateDraft('branchAddress', v)}
                          placeholder="Zona 1, Guatemala"
                        />
                      </div>
                    </section>

                    {/* Extra branches */}
                    <section aria-labelledby="extraBranchesTitle" className="pt-4 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <h3 id="extraBranchesTitle" className="font-semibold text-slate-800">
                          Sucursales adicionales
                          <span className="text-xs font-normal text-slate-500 ml-2">
                            (máx {TRIAL_MAX_BRANCHES} en total · trial)
                          </span>
                        </h3>
                        <button
                          type="button"
                          onClick={addExtraBranch}
                          disabled={1 + draft.extraBranches.length >= TRIAL_MAX_BRANCHES}
                          className="flex items-center gap-1 text-sm px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Plus className="w-4 h-4" /> Agregar
                        </button>
                      </div>
                      {draft.extraBranches.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">
                          No agregaste sucursales adicionales.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {draft.extraBranches.map((b, idx) => (
                            <li
                              key={idx}
                              className="grid grid-cols-12 gap-2 items-end p-3 bg-slate-50 rounded-lg"
                            >
                              <div className="col-span-4">
                                <CompactField
                                  label="Nombre"
                                  value={b.name}
                                  onChange={(v) => updateExtraBranch(idx, 'name', v)}
                                />
                              </div>
                              <div className="col-span-3">
                                <CompactField
                                  label="Código"
                                  value={b.code}
                                  onChange={(v) => updateExtraBranch(idx, 'code', v)}
                                  mono
                                />
                              </div>
                              <div className="col-span-4">
                                <CompactField
                                  label="Dirección"
                                  value={b.address}
                                  onChange={(v) => updateExtraBranch(idx, 'address', v)}
                                />
                              </div>
                              <div className="col-span-1 text-right">
                                <button
                                  type="button"
                                  onClick={() => removeExtraBranch(idx)}
                                  aria-label={`Quitar sucursal ${idx + 1}`}
                                  className="text-red-600 hover:text-red-700 p-1"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    {/* Extra users */}
                    <section aria-labelledby="extraUsersTitle" className="pt-4 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <h3 id="extraUsersTitle" className="font-semibold text-slate-800">
                          Usuarios adicionales
                          <span className="text-xs font-normal text-slate-500 ml-2">
                            (máx {TRIAL_MAX_USERS_PER_BRANCH} por sucursal · trial)
                          </span>
                        </h3>
                        <button
                          type="button"
                          onClick={addExtraUser}
                          className="flex items-center gap-1 text-sm px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
                        >
                          <Plus className="w-4 h-4" /> Agregar
                        </button>
                      </div>
                      {draft.extraUsers.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">
                          Solo se creará al administrador. Podés agregar vendedores, cajeros o
                          contadores acá o después en /users.
                        </p>
                      ) : (
                        <ul className="space-y-3">
                          {draft.extraUsers.map((u, idx) => (
                            <li key={idx} className="p-3 bg-slate-50 rounded-lg space-y-2">
                              <div className="grid grid-cols-12 gap-2 items-end">
                                <div className="col-span-4">
                                  <CompactField
                                    label="Nombre"
                                    value={u.name}
                                    onChange={(v) => updateExtraUser(idx, 'name', v)}
                                  />
                                </div>
                                <div className="col-span-4">
                                  <CompactField
                                    label="Email"
                                    value={u.email}
                                    onChange={(v) => updateExtraUser(idx, 'email', v)}
                                    type="email"
                                  />
                                </div>
                                <div className="col-span-3">
                                  <label className="block text-[10px] font-medium text-slate-500 uppercase mb-1">
                                    Rol
                                  </label>
                                  <select
                                    value={u.role}
                                    onChange={(e) =>
                                      updateExtraUser(idx, 'role', e.target.value)
                                    }
                                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
                                    aria-label={`Rol del usuario ${idx + 1}`}
                                  >
                                    <option value="Vendedor">Vendedor</option>
                                    <option value="Cajero">Cajero</option>
                                    <option value="Contador">Contador</option>
                                    <option value="Gerente">Gerente</option>
                                  </select>
                                </div>
                                <div className="col-span-1 text-right">
                                  <button
                                    type="button"
                                    onClick={() => removeExtraUser(idx)}
                                    aria-label={`Quitar usuario ${idx + 1}`}
                                    className="text-red-600 hover:text-red-700 p-1"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                              <div className="grid grid-cols-12 gap-2 items-end">
                                <div className="col-span-7">
                                  <CompactField
                                    label="Contraseña (no se guarda en borrador)"
                                    value={extraPasswords[u.email] ?? ''}
                                    onChange={(v) => updateExtraUser(idx, 'password', v)}
                                    type="password"
                                  />
                                </div>
                                <div className="col-span-5">
                                  <label className="block text-[10px] font-medium text-slate-500 uppercase mb-1">
                                    Sucursal
                                  </label>
                                  <select
                                    value={u.branchCode}
                                    onChange={(e) =>
                                      updateExtraUser(idx, 'branchCode', e.target.value)
                                    }
                                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
                                    aria-label={`Sucursal del usuario ${idx + 1}`}
                                  >
                                    <option value="">Principal ({draft.branchCode})</option>
                                    {draft.extraBranches.map((b, i) => (
                                      <option key={i} value={b.code}>
                                        {b.name || b.code} ({b.code})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </>
                )}

                {/* Step 5: FEL */}
                {draft.step === 'fel' && (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                      <Sparkles className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                      <div className="text-sm text-blue-900">
                        <strong>Configurá FEL ahora o más tarde.</strong> Si lo saltás, la
                        empresa queda con un proveedor MOCK y las facturas serán demo. Podés
                        configurar el proveedor real (Infile / Digifact) cuando tengas la
                        autorización SAT.
                      </div>
                    </div>

                    <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={draft.felEnabled}
                        onChange={(e) => updateDraft('felEnabled', e.target.checked)}
                        className="w-4 h-4"
                        aria-describedby="felToggleHelp"
                      />
                      <div>
                        <div className="font-semibold text-slate-800">
                          Configurar FEL en el wizard
                        </div>
                        <div id="felToggleHelp" className="text-xs text-slate-500">
                          Si lo dejás apagado, la empresa empieza sin FEL (modo demo).
                        </div>
                      </div>
                    </label>

                    {draft.felEnabled && (
                      <div className="space-y-3 pl-2 border-l-2 border-blue-200">
                        <div>
                          <label
                            htmlFor="felProvider"
                            className="block text-sm font-medium text-slate-700 mb-1"
                          >
                            Proveedor *
                          </label>
                          <select
                            id="felProvider"
                            value={draft.felProvider}
                            onChange={(e) =>
                              updateDraft('felProvider', e.target.value as FelProvider)
                            }
                            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-white"
                          >
                            <option value="MOCK">MOCK (sandbox / demo)</option>
                            <option value="INFILE">Infile</option>
                            <option value="DIGIFACT">Digifact</option>
                          </select>
                        </div>
                        {draft.felProvider !== 'MOCK' && (
                          <>
                            <Field
                              label="Usuario API *"
                              value={draft.felApiUser}
                              onChange={(v) => updateDraft('felApiUser', v)}
                              placeholder="usuario@certificador"
                              ariaRequired
                            />
                            <div>
                              <label
                                htmlFor="felApiKey"
                                className="block text-sm font-medium text-slate-700 mb-1"
                              >
                                API Key *
                              </label>
                              <input
                                id="felApiKey"
                                type="password"
                                placeholder="••••••••••••"
                                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none transition font-mono text-sm"
                                aria-required="true"
                                autoComplete="off"
                              />
                              <p className="text-xs text-slate-500 mt-1">
                                Por seguridad la API key NO se guarda en el borrador — se envía
                                directo al servidor al confirmar.
                              </p>
                            </div>
                            <Field
                              label="URL del certificado (opcional)"
                              value={draft.felCertificateUrl}
                              onChange={(v) => updateDraft('felCertificateUrl', v)}
                              placeholder="https://..."
                            />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 6: Summary */}
                {draft.step === 'summary' && (
                  <SummaryView
                    draft={draft}
                    extraUsersCount={draft.extraUsers.length}
                    hasFel={draft.felEnabled}
                  />
                )}

                {error && (
                  <div
                    role="alert"
                    className="bg-red-50 text-red-700 text-sm px-4 py-2 rounded-lg border border-red-200"
                  >
                    {error}
                  </div>
                )}
              </div>

              {/* Footer actions */}
              <div className="px-8 pb-8 flex gap-3">
                {currentIdx > 0 && (
                  <button
                    onClick={prevStep}
                    type="button"
                    className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition"
                  >
                    <ArrowLeft className="w-4 h-4" /> Atrás
                  </button>
                )}
                <button
                  onClick={draft.step === 'summary' ? handleSubmit : nextStep}
                  disabled={isSubmitting}
                  type="button"
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold transition disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" /> Creando empresa...
                    </>
                  ) : draft.step === 'summary' ? (
                    <>
                      <CheckCircle2 className="w-5 h-5" /> Crear empresa
                    </>
                  ) : (
                    <>
                      Siguiente <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer link */}
        {draft.step !== 'done' && (
          <p className="text-center mt-6 text-slate-300 text-sm">
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="text-blue-300 hover:text-blue-200 font-medium">
              Iniciar sesión
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

const STEP_TITLES: Record<Exclude<Step, 'done'>, string> = {
  company: 'Datos de la Empresa',
  taxRegime: 'Régimen Tributario',
  admin: 'Cuenta de Administrador',
  branches: 'Sucursales y Usuarios',
  fel: 'Facturación Electrónica (FEL)',
  summary: 'Revisar y Confirmar',
};

const STEP_SUBTITLES: Record<Exclude<Step, 'done'>, string> = {
  company: 'Información fiscal, de contacto y rubro del negocio',
  taxRegime: 'Elegí cómo facturás ante SAT',
  admin: 'Credenciales del usuario con acceso total',
  branches: 'Sucursal principal + sucursales y usuarios adicionales',
  fel: 'Conectá tu proveedor de facturación electrónica o salteá este paso',
  summary: 'Confirmá los datos antes de crear la empresa',
};

// ── Subcomponents ──

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  mono,
  ariaRequired,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
  ariaRequired?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-required={ariaRequired ? 'true' : undefined}
        className={`w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none transition ${
          mono ? 'font-mono text-sm' : ''
        }`}
      />
    </div>
  );
}

function CompactField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-slate-500 uppercase mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 outline-none ${
          mono ? 'font-mono' : ''
        }`}
      />
    </div>
  );
}

function SummaryView({
  draft,
  extraUsersCount,
  hasFel,
}: {
  draft: DraftState;
  extraUsersCount: number;
  hasFel: boolean;
}) {
  return (
    <dl className="space-y-4 text-sm">
      <SummaryRow label="Empresa" value={draft.companyName} />
      <SummaryRow label="Slug (URL)" value={draft.companySlug} mono />
      <SummaryRow label="Email" value={draft.companyEmail} />
      <SummaryRow
        label="NIT"
        value={draft.companyNit || <span className="italic text-slate-400">no especificado</span>}
      />
      <SummaryRow label="Tipo de negocio" value={BUSINESS_TYPE_LABELS[draft.businessType].name} />
      <SummaryRow
        label="Régimen tributario"
        value={
          draft.taxRegime
            ? TAX_REGIME_INFO[draft.taxRegime].name
            : <span className="italic text-slate-400">no especificado</span>
        }
      />
      <SummaryRow
        label="Logo"
        value={
          draft.logoUrl ? (
            <img
              src={draft.logoUrl}
              alt="Logo"
              className="w-10 h-10 object-contain rounded border border-slate-200 bg-white inline-block"
            />
          ) : (
            <span className="italic text-slate-400">sin logo</span>
          )
        }
      />
      <div className="pt-2 border-t border-slate-100">
        <SummaryRow label="Administrador" value={`${draft.adminName} (${draft.adminEmail})`} />
      </div>
      <div className="pt-2 border-t border-slate-100">
        <SummaryRow
          label={`Sucursales (${1 + draft.extraBranches.length})`}
          value={
            <ul className="text-slate-700 space-y-0.5">
              <li>
                <strong>{draft.branchCode}</strong> · {draft.branchName} (principal)
              </li>
              {draft.extraBranches.map((b, i) => (
                <li key={i}>
                  <strong>{b.code}</strong> · {b.name}
                </li>
              ))}
            </ul>
          }
        />
      </div>
      <div className="pt-2 border-t border-slate-100">
        <SummaryRow
          label={`Usuarios extra (${extraUsersCount})`}
          value={
            extraUsersCount === 0 ? (
              <span className="italic text-slate-400">solo administrador</span>
            ) : (
              <ul className="text-slate-700 space-y-0.5">
                {draft.extraUsers.map((u, i) => (
                  <li key={i}>
                    {u.email} ({u.role}, sucursal {u.branchCode || draft.branchCode})
                  </li>
                ))}
              </ul>
            )
          }
        />
      </div>
      <div className="pt-2 border-t border-slate-100">
        <SummaryRow
          label="FEL"
          value={
            hasFel ? (
              <span className="text-green-700 font-medium">
                Configurado · {draft.felProvider}
              </span>
            ) : (
              <span className="text-amber-700 inline-flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Sin configurar (modo demo)
              </span>
            )
          }
        />
      </div>
    </dl>
  );
}

function SummaryRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <dt className="text-xs uppercase font-semibold text-slate-500">{label}</dt>
      <dd className={`col-span-2 text-slate-800 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

function DoneScreen({
  result,
}: {
  result: {
    companyName: string;
    trialEndsAt: string;
    branches: number;
    extraUsers: number;
    felConfigured: boolean;
  };
}) {
  return (
    <div className="p-10 text-center">
      <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
        <CheckCircle2 className="w-8 h-8" aria-hidden="true" />
      </div>
      <h2 className="text-2xl font-bold text-slate-800 mb-2">¡Empresa creada!</h2>
      <p className="text-slate-500 mb-6">
        <strong>{result.companyName}</strong> está lista. Tu trial vence el{' '}
        <strong>
          {result.trialEndsAt
            ? new Date(result.trialEndsAt).toLocaleDateString('es-GT')
            : ''}
        </strong>
        .
      </p>

      {/* Resumen rápido */}
      <div className="grid grid-cols-3 gap-3 max-w-md mx-auto mb-8 text-sm">
        <div className="p-3 bg-slate-50 rounded-lg">
          <div className="text-2xl font-bold text-slate-800">{result.branches}</div>
          <div className="text-xs text-slate-500">sucursal{result.branches !== 1 ? 'es' : ''}</div>
        </div>
        <div className="p-3 bg-slate-50 rounded-lg">
          <div className="text-2xl font-bold text-slate-800">{1 + result.extraUsers}</div>
          <div className="text-xs text-slate-500">
            usuario{result.extraUsers !== 0 ? 's' : ''}
          </div>
        </div>
        <div className="p-3 bg-slate-50 rounded-lg">
          <div
            className={`text-lg font-bold ${
              result.felConfigured ? 'text-green-600' : 'text-amber-600'
            }`}
          >
            {result.felConfigured ? 'OK' : '⚠'}
          </div>
          <div className="text-xs text-slate-500">FEL</div>
        </div>
      </div>

      {/* Checklist próximos pasos */}
      <div className="text-left max-w-md mx-auto mb-8 space-y-2">
        <h3 className="font-bold text-slate-800 mb-2 text-sm uppercase">Próximos pasos</h3>
        <ChecklistItem done label="Empresa creada con plan trial 30 días" />
        <ChecklistItem
          label="Agregá tu primer producto en"
          link={{ href: '/inventory', text: '/inventory' }}
        />
        <ChecklistItem
          label="Configurá métodos de pago en"
          link={{ href: '/settings', text: '/settings' }}
        />
        {!result.felConfigured && (
          <ChecklistItem
            label="Registrá tu autorización SAT y agregá la serie real (modo demo activo)"
            warn
          />
        )}
        <ChecklistItem
          label="Personalizá colores y branding en"
          link={{ href: '/settings', text: '/settings' }}
        />
      </div>

      <Link
        href="/login"
        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-xl transition"
      >
        Iniciar sesión <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

function ChecklistItem({
  label,
  done,
  warn,
  link,
}: {
  label: string;
  done?: boolean;
  warn?: boolean;
  link?: { href: string; text: string };
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span
        className={`mt-0.5 w-4 h-4 rounded-full inline-flex items-center justify-center text-[10px] shrink-0 ${
          done
            ? 'bg-green-500 text-white'
            : warn
            ? 'bg-amber-100 text-amber-700 border border-amber-300'
            : 'bg-slate-100 text-slate-400 border border-slate-300'
        }`}
        aria-hidden="true"
      >
        {done ? '✓' : warn ? '!' : ''}
      </span>
      <span className={`${done ? 'text-slate-500 line-through' : 'text-slate-700'}`}>
        {label}{' '}
        {link && (
          <Link href={link.href} className="text-blue-600 font-mono hover:underline">
            {link.text}
          </Link>
        )}
      </span>
    </div>
  );
}
