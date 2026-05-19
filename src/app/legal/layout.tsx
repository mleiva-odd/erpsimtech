/**
 * Fase 32 · Layout compartido para páginas legales públicas (T&C, Privacy, Soporte).
 *
 * Estas páginas son accesibles SIN autenticación. Se linkean desde el footer
 * del login y desde el wizard de onboarding.
 *
 * Diseño minimalista — tipografía legible para textos largos, max-width
 * razonable, navegación de retorno al login.
 */

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al inicio
          </Link>
          <Link href="/" className="text-sm font-bold text-slate-800 hover:text-blue-700">
            SIMTECH ERP
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <article className="prose prose-slate max-w-none prose-headings:font-bold prose-h1:text-3xl prose-h2:text-xl prose-h2:mt-10 prose-h3:text-lg prose-h3:mt-6 prose-p:text-slate-700 prose-li:text-slate-700 prose-strong:text-slate-900 prose-a:text-blue-600">
          {children}
        </article>
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-4xl mx-auto px-6 py-6 text-center text-xs text-slate-500 space-x-4">
          <Link href="/legal/terms" className="hover:text-slate-700">Términos de Servicio</Link>
          <span>·</span>
          <Link href="/legal/privacy" className="hover:text-slate-700">Política de Privacidad</Link>
          <span>·</span>
          <Link href="/legal/support" className="hover:text-slate-700">Soporte</Link>
        </div>
      </footer>
    </div>
  );
}
