"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Store, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (res?.error) {
        setError("Credenciales incorrectas. Verifica y vuelve a intentar.");
        setIsLoading(false);
      } else {
        router.push("/apps");
      }
    } catch (err) {
      setError("Error interno del servidor");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-white relative overflow-hidden">
      {/* Left Panel: Branding & Decorative */}
      <div className="hidden lg:flex w-1/2 bg-slate-900 relative flex-col justify-between p-12 overflow-hidden border-r border-slate-800">
        {/* Glowing Orbs */}
        <div className="absolute top-[-15%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/20 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-cyan-400/10 blur-[100px]"></div>
        
        {/* Header */}
        <div className="relative z-10 flex items-center gap-4 animate-in fade-in slide-in-from-left-4 duration-700">
           <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 border border-white/10">
             <Store className="w-6 h-6 text-white" />
           </div>
           <span className="text-2xl font-black text-white tracking-widest">SIMTECH</span>
        </div>

        {/* Hero Text */}
        <div className="relative z-10 max-w-lg mb-20 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150 fill-mode-both">
          <h1 className="text-[3.25rem] font-black text-white leading-[1.1] mb-6 tracking-tight">
            El corazón de tu<br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
              operación comercial.
            </span>
          </h1>
          <p className="text-lg text-slate-400 font-medium leading-relaxed">
            Gestiona ventas, controla el inventario matriz y audita tu personal de mostrador desde una única plataforma inteligente.
          </p>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-slate-600 text-sm font-bold tracking-wider uppercase animate-in fade-in duration-1000 delay-300 fill-mode-both">
          © {new Date().getFullYear()} SIMTECH ERP. Todos los derechos reservados.
        </div>
      </div>

      {/* Right Panel: Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 sm:p-12 md:p-20 relative">
        {/* Mobile Header (Hidden on Desktop) */}
        <div className="lg:hidden flex flex-col items-center mb-12 animate-in fade-in zoom-in-95 duration-500">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/20 mb-5 transform -rotate-3 border border-blue-400/30">
            <Store className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">SIMTECH</h1>
          <p className="text-[11px] font-black tracking-[0.2em] text-slate-400 mt-1 uppercase">Punto de Venta</p>
        </div>

        <div className="w-full max-w-sm xl:max-w-md animate-in fade-in slide-in-from-right-8 duration-700 delay-100 fill-mode-both">
          <div className="mb-10 lg:mb-12">
            <h2 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">Bienvenido</h2>
            <p className="text-slate-500 text-base font-medium mt-2">Ingresa tus credenciales maestras.</p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 ml-1">Correo Electrónico</label>
              <div className="relative group">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-200 text-slate-900 font-bold rounded-2xl px-5 py-4 focus:outline-none focus:border-blue-600 focus:bg-white transition-all placeholder-slate-400"
                  placeholder="admin@simtech.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="text-sm font-bold text-slate-700">Contraseña</label>
                <a href="#" className="text-[13px] font-bold text-blue-600 hover:text-blue-800 transition-colors">¿Olvidaste tu clave?</a>
              </div>
              <div className="relative group">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-200 text-slate-900 font-bold rounded-2xl px-5 py-4 focus:outline-none focus:border-blue-600 focus:bg-white transition-all placeholder-slate-400"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="p-4 mt-2 bg-red-50 text-red-600 font-bold text-sm rounded-xl border border-red-100 flex items-center gap-3 animate-in shake duration-300">
                <div className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse"></div>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-slate-900 hover:bg-black text-white font-bold text-[17px] rounded-2xl py-4.5 mt-8 shadow-xl shadow-slate-900/10 transition-all active:scale-[0.98] disabled:opacity-70 disabled:scale-100 flex items-center justify-center gap-3 relative overflow-hidden group"
              style={{ paddingBottom: '1.25rem', paddingTop: '1.25rem' }}
            >
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
              
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                  Conectando...
                </>
              ) : (
                "Ingresar al Sistema"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
