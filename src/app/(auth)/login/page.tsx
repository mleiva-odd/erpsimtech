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
      <div className="hidden lg:flex w-1/2 bg-[#020617] relative flex-col justify-between p-16 overflow-hidden border-r border-slate-800">
        {/* Glowing Orbs - Improved Gradient */}
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-blue-600/10 blur-[130px]"></div>
        <div className="absolute bottom-[-5%] right-[-5%] w-[45%] h-[45%] rounded-full bg-cyan-400/10 blur-[110px]"></div>
        <div className="absolute top-[30%] right-[10%] w-[30%] h-[30%] rounded-full bg-indigo-500/5 blur-[90px]"></div>
        
        {/* Header - More breathespace */}
        <div className="relative z-10 flex items-center gap-4 animate-in fade-in slide-in-from-left-4 duration-700">
           <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/20 border border-white/10">
             <Store className="w-7 h-7 text-white" />
           </div>
           <span className="text-2xl font-bold text-white tracking-[0.2em]">SIMTECH</span>
        </div>

        {/* Hero Text - Centered better vertically within its space */}
        <div className="relative z-10 max-w-lg mb-20 mt-auto animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150 fill-mode-both">
          <h1 className="text-[3.5rem] font-bold text-white leading-[1.05] mb-6 tracking-tight">
            El corazón de tu<br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
              operación comercial.
            </span>
          </h1>
          <p className="text-xl text-slate-400 font-medium leading-relaxed max-w-md">
            Gestiona ventas, controla el inventario matriz y audita tu personal de mostrador desde una única plataforma inteligente.
          </p>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-slate-500 text-[10px] font-bold tracking-[0.25em] uppercase mt-auto animate-in fade-in duration-1000 delay-300 fill-mode-both">
          © {new Date().getFullYear()} SIMTECH ERP. TODOS LOS DERECHOS RESERVADOS.
        </div>
      </div>

      {/* Right Panel: Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 sm:p-16 lg:p-24 relative bg-slate-50/30">
        {/* Mobile Header (Hidden on Desktop) */}
        <div className="lg:hidden flex flex-col items-center mb-12 animate-in fade-in zoom-in-95 duration-500">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/20 mb-5 transform -rotate-3 border border-blue-400/30">
            <Store className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">SIMTECH</h1>
          <p className="text-[11px] font-bold tracking-[0.2em] text-slate-400 mt-1 uppercase">Punto de Venta</p>
        </div>

        <div className="w-full max-w-sm xl:max-w-md animate-in fade-in slide-in-from-right-8 duration-700 delay-100 fill-mode-both">
          <div className="mb-12">
            <h2 className="text-4xl font-bold text-slate-900 tracking-tight mb-3">Bienvenido</h2>
            <p className="text-slate-500 text-lg font-medium">Ingresa tus credenciales maestras.</p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2.5">
              <label className="text-[13px] font-bold text-slate-700 ml-1 uppercase tracking-wider">Correo Electrónico</label>
              <div className="relative group">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white border-[3px] border-slate-100 text-slate-900 font-bold rounded-2xl px-6 py-4.5 focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100 transition-all placeholder-slate-300"
                  placeholder="name@company.com"
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex justify-between items-center ml-1">
                <label className="text-[13px] font-bold text-slate-700 uppercase tracking-wider">Contraseña</label>
                <a href="#" className="text-[13px] font-bold text-blue-600 hover:text-blue-800 transition-colors">¿Olvidaste tu clave?</a>
              </div>
              <div className="relative group">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white border-[3px] border-slate-100 text-slate-900 font-bold rounded-2xl px-6 py-4.5 focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100 transition-all placeholder-slate-300"
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
              className="w-full bg-slate-900 hover:bg-black text-white font-bold text-[18px] rounded-2xl py-5 mt-8 shadow-2xl shadow-slate-900/20 transition-all active:scale-[0.98] disabled:opacity-70 disabled:scale-100 flex items-center justify-center gap-3 relative overflow-hidden group tracking-wide"
            >
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
              
              {isLoading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
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
