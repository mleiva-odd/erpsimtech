'use client';

import { useState } from 'react';
import { Building2, User, MapPin, ArrowRight, ArrowLeft, Loader2, CheckCircle2, Store } from 'lucide-react';
import Link from 'next/link';

type Step = 'company' | 'admin' | 'branch' | 'done';

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>('company');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ companyName: string; trialEndsAt: string } | null>(null);

  const [formData, setFormData] = useState({
    companyName: '', companySlug: '', companyEmail: '', companyPhone: '', companyNit: '',
    adminName: '', adminEmail: '', adminPassword: '', adminPasswordConfirm: '',
    branchName: 'Sucursal Central', branchCode: 'SUC-01', branchAddress: '',
  });

  const generateSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const updateField = (field: string, value: string) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'companyName') next.companySlug = generateSlug(value);
      return next;
    });
  };

  const validateStep = (): boolean => {
    setError('');
    if (step === 'company') {
      if (!formData.companyName || !formData.companySlug || !formData.companyEmail) {
        setError('Nombre, slug y email son obligatorios'); return false;
      }
    }
    if (step === 'admin') {
      if (!formData.adminName || !formData.adminEmail || !formData.adminPassword) {
        setError('Todos los campos del administrador son obligatorios'); return false;
      }
      if (formData.adminPassword.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return false; }
      if (formData.adminPassword !== formData.adminPasswordConfirm) { setError('Las contraseñas no coinciden'); return false; }
    }
    return true;
  };

  const nextStep = () => {
    if (!validateStep()) return;
    if (step === 'company') setStep('admin');
    else if (step === 'admin') setStep('branch');
  };

  const prevStep = () => {
    if (step === 'admin') setStep('company');
    else if (step === 'branch') setStep('admin');
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Error al registrar');
        return;
      }
      setResult({ companyName: data.companyName, trialEndsAt: data.trialEndsAt });
      setStep('done');
    } catch (e) {
      setError('Error de conexión');
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    { id: 'company', label: 'Empresa', icon: <Building2 className="w-4 h-4" /> },
    { id: 'admin', label: 'Administrador', icon: <User className="w-4 h-4" /> },
    { id: 'branch', label: 'Sucursal', icon: <MapPin className="w-4 h-4" /> },
  ];

  const currentIdx = steps.findIndex(s => s.id === step);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-white mb-2">
            <Store className="w-8 h-8 text-blue-400" />
            <span className="text-2xl font-bold">SIMTECH</span>
          </div>
          <p className="text-slate-600 text-sm">Registra tu empresa y comienza a vender hoy</p>
        </div>

        {/* Steps Indicator */}
        {step !== 'done' && (
          <div className="flex items-center justify-center gap-3 mb-8">
            {steps.map((s, idx) => (
              <div key={s.id} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  idx < currentIdx ? 'bg-green-500 text-white' :
                  idx === currentIdx ? 'bg-blue-500 text-white scale-110' :
                  'bg-slate-700 text-slate-600'
                }`}>
                  {idx < currentIdx ? '✓' : idx + 1}
                </div>
                <span className={`text-xs hidden sm:block ${idx === currentIdx ? 'text-white font-semibold' : 'text-slate-500'}`}>
                  {s.label}
                </span>
                {idx < steps.length - 1 && (
                  <div className={`w-8 h-0.5 ${idx < currentIdx ? 'bg-green-500' : 'bg-slate-700'}`} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {step === 'done' ? (
            <div className="p-10 text-center">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">¡Registro Exitoso!</h2>
              <p className="text-slate-500 mb-6">
                <strong>{result?.companyName}</strong> ha sido creada. Tu periodo de prueba gratuito vence el{' '}
                <strong>{result?.trialEndsAt ? new Date(result.trialEndsAt).toLocaleDateString('es-GT') : ''}</strong>.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-xl transition"
              >
                Iniciar Sesión <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <>
              <div className="px-8 py-6 border-b border-slate-100 bg-slate-50">
                <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                  {steps[currentIdx]?.icon}
                  {step === 'company' && 'Datos de la Empresa'}
                  {step === 'admin' && 'Cuenta de Administrador'}
                  {step === 'branch' && 'Primera Sucursal'}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {step === 'company' && 'Información fiscal y de contacto'}
                  {step === 'admin' && 'Credenciales para acceder al sistema'}
                  {step === 'branch' && 'Configuración de tu punto de venta principal'}
                </p>
              </div>

              <div className="p-8 space-y-4">
                {/* Step: Company */}
                {step === 'company' && (
                  <>
                    <Field label="Nombre Comercial *" value={formData.companyName} onChange={v => updateField('companyName', v)} placeholder="Distribuidora XYZ" />
                    <Field label="Identificador (URL)" value={formData.companySlug} onChange={v => updateField('companySlug', v)} placeholder="distribuidora-xyz" mono />
                    <Field label="Email de Contacto *" type="email" value={formData.companyEmail} onChange={v => updateField('companyEmail', v)} placeholder="info@empresa.com" />
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="NIT" value={formData.companyNit} onChange={v => updateField('companyNit', v)} placeholder="12345678-9" />
                      <Field label="Teléfono" value={formData.companyPhone} onChange={v => updateField('companyPhone', v)} placeholder="5555-0000" />
                    </div>
                  </>
                )}

                {/* Step: Admin */}
                {step === 'admin' && (
                  <>
                    <Field label="Nombre Completo *" value={formData.adminName} onChange={v => updateField('adminName', v)} placeholder="Juan Pérez" />
                    <Field label="Correo Electrónico *" type="email" value={formData.adminEmail} onChange={v => updateField('adminEmail', v)} placeholder="admin@empresa.com" />
                    <Field label="Contraseña *" type="password" value={formData.adminPassword} onChange={v => updateField('adminPassword', v)} placeholder="Mínimo 6 caracteres" />
                    <Field label="Confirmar Contraseña *" type="password" value={formData.adminPasswordConfirm} onChange={v => updateField('adminPasswordConfirm', v)} placeholder="Repetir contraseña" />
                  </>
                )}

                {/* Step: Branch */}
                {step === 'branch' && (
                  <>
                    <Field label="Nombre de Sucursal *" value={formData.branchName} onChange={v => updateField('branchName', v)} placeholder="Sucursal Central" />
                    <Field label="Código *" value={formData.branchCode} onChange={v => updateField('branchCode', v)} placeholder="SUC-01" />
                    <Field label="Dirección (opcional)" value={formData.branchAddress} onChange={v => updateField('branchAddress', v)} placeholder="Zona 1, Ciudad de Guatemala" />
                  </>
                )}

                {error && (
                  <div className="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-lg border border-red-200">{error}</div>
                )}
              </div>

              {/* Actions */}
              <div className="px-8 pb-8 flex gap-3">
                {step !== 'company' && (
                  <button onClick={prevStep} className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition">
                    <ArrowLeft className="w-4 h-4" /> Atrás
                  </button>
                )}
                <button
                  onClick={step === 'branch' ? handleSubmit : nextStep}
                  disabled={isSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold transition disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Creando empresa...</>
                  ) : step === 'branch' ? (
                    <><CheckCircle2 className="w-5 h-5" /> Crear Empresa</>
                  ) : (
                    <>Siguiente <ArrowRight className="w-5 h-5" /></>
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Login link */}
        {step !== 'done' && (
          <p className="text-center mt-6 text-slate-600 text-sm">
            ¿Ya tienes cuenta? <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium">Iniciar sesión</Link>
          </p>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', mono }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-100 outline-none transition ${mono ? 'font-mono text-sm' : ''}`}
      />
    </div>
  );
}
