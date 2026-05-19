'use client';

/**
 * Fase 31b · Página /forgot-password.
 *
 * Form simple de email. Siempre muestra mensaje neutro post-submit
 * para no filtrar si el email existe.
 */

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (res.status === 429) {
        setError(
          'Demasiadas solicitudes. Esperá unos minutos antes de volver a intentar.',
        );
        setIsLoading(false);
        return;
      }

      // 200 — tanto si el email existe como si no.
      setSubmitted(true);
    } catch {
      setError('Error de red. Verificá tu conexión e intentá de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

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

        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
          {submitted ? (
            <div className="text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-3">
                Revisá tu correo
              </h1>
              <p className="text-slate-600 mb-6">
                Si la cuenta existe, te enviamos un link para restablecer tu
                contraseña. El link expira en unos minutos.
              </p>
              <p className="text-sm text-slate-500">
                ¿No te llegó? Revisá la carpeta de spam o solicitalo nuevamente
                en unos minutos.
              </p>
              <div className="mt-8 pt-6 border-t border-slate-200">
                <Link
                  href="/login"
                  className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Volver a iniciar sesión
                </Link>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">
                ¿Olvidaste tu contraseña?
              </h1>
              <p className="text-slate-600 mb-6">
                Ingresá tu correo electrónico y te enviaremos un link para
                restablecer tu contraseña.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-700">
                    Correo electrónico
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="tu@empresa.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-11 py-5"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  disabled={isLoading || !email}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Enviando...
                    </>
                  ) : (
                    'Enviar link de reseteo'
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
