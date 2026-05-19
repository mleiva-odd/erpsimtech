'use client';

/**
 * Fase 31b · Página /reset-password?token=...
 *
 * Lee el token del query, valida contra la API, y permite ingresar nueva
 * password (con validación cliente que refleja la política del server).
 * Tras éxito, redirige a /login con un flag de "password actualizada".
 */

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Lock, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const PASSWORD_MIN_LENGTH = 12;
const HAS_LOWER = /[a-z]/;
const HAS_UPPER = /[A-Z]/;
const HAS_DIGIT = /[0-9]/;
const HAS_SYMBOL = /[^A-Za-z0-9]/;

function validateClientSide(pw: string): string[] {
  const errors: string[] = [];
  if (pw.length < PASSWORD_MIN_LENGTH)
    errors.push(`Mínimo ${PASSWORD_MIN_LENGTH} caracteres.`);
  if (!HAS_LOWER.test(pw)) errors.push('Una letra minúscula.');
  if (!HAS_UPPER.test(pw)) errors.push('Una letra mayúscula.');
  if (!HAS_DIGIT.test(pw)) errors.push('Un dígito.');
  if (!HAS_SYMBOL.test(pw)) errors.push('Un símbolo (e.g. !@#$%).');
  return errors;
}

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const clientErrors = password ? validateClientSide(password) : [];
  const passwordsMatch = !confirm || password === confirm;
  const canSubmit =
    !!token &&
    !!password &&
    !!confirm &&
    clientErrors.length === 0 &&
    passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          data?.error ??
            'No se pudo restablecer. El link puede haber expirado.',
        );
        setIsLoading(false);
        return;
      }

      setDone(true);
      // Redirige a login después de 2s.
      setTimeout(() => {
        router.push('/login?reset=ok');
      }, 2000);
    } catch {
      setError('Error de red. Verificá tu conexión e intentá de nuevo.');
      setIsLoading(false);
    }
  };

  // Token ausente — link mal formado.
  if (!token) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-amber-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-3">Link incompleto</h1>
        <p className="text-slate-600 mb-6">
          El link no incluye el token necesario. Solicitá uno nuevo desde la
          página de recuperación.
        </p>
        <Link
          href="/forgot-password"
          className="text-blue-600 hover:text-blue-700 hover:underline"
        >
          Solicitar nuevo link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-3">
          Contraseña actualizada
        </h1>
        <p className="text-slate-600 mb-6">
          Tu contraseña fue restablecida. Te llevamos al login...
        </p>
        <Link
          href="/login"
          className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
        >
          Ir al login ahora
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">
        Nueva contraseña
      </h1>
      <p className="text-slate-600 mb-6">
        Elegí una contraseña segura. No la compartas con nadie.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="password" className="text-slate-700">
            Contraseña nueva
          </Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-11 py-5"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
            />
          </div>
          {password && clientErrors.length > 0 && (
            <ul className="text-xs text-amber-700 list-disc pl-5 space-y-0.5">
              {clientErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
          {password && clientErrors.length === 0 && (
            <p className="text-xs text-emerald-700">
              Contraseña cumple la política.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm" className="text-slate-700">
            Confirmar contraseña
          </Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="pl-11 py-5"
              autoComplete="new-password"
              required
            />
          </div>
          {confirm && !passwordsMatch && (
            <p className="text-xs text-red-600">Las contraseñas no coinciden.</p>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
            {error}
          </div>
        )}

        <Button
          type="submit"
          size="lg"
          disabled={!canSubmit || isLoading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Guardando...
            </>
          ) : (
            'Restablecer contraseña'
          )}
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="mb-6">
          <Link href="/login">
            <Button variant="ghost" className="text-slate-600 hover:text-slate-900">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver al login
            </Button>
          </Link>
        </div>

        <Suspense
          fallback={
            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            </div>
          }
        >
          <ResetPasswordInner />
        </Suspense>
      </motion.div>
    </div>
  );
}
