"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Lock, Mail, Loader2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import Image from "next/image";

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
    <div className="min-h-screen bg-slate-50 flex">
      {/* Left Side - Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col">
        {/* Header */}
        <div className="p-6">
          <Link href="/">
            <Button
              variant="ghost"
              className="text-slate-600 hover:text-slate-900 rounded-xl"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver al inicio
            </Button>
          </Link>
        </div>

        {/* Login Form */}
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="w-full max-w-md"
          >
            <div className="mb-10 text-center lg:text-left">
               <div className="lg:hidden flex justify-center mb-8">
                  <div className="relative w-16 h-16">
                    <Image src="/logo.png" alt="SimTech Logo" fill className="object-contain" />
                  </div>
               </div>
              <h1 className="text-4xl font-bold mb-3 text-slate-900 tracking-tight">Bienvenido</h1>
              <p className="text-lg text-slate-600 font-medium">
                Inicia sesión en tu cuenta de SimTech ERP.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-700 font-bold ml-1 uppercase text-[11px] tracking-widest">
                  Correo electrónico
                </Label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="tu@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-12 py-7 text-base rounded-2xl border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 transition-all font-medium"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between ml-1">
                  <Label htmlFor="password" className="text-slate-700 font-bold uppercase text-[11px] tracking-widest">
                    Contraseña
                  </Label>
                  <a
                    href="#"
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-700 uppercase tracking-wider"
                  >
                    ¿Olvidaste tu clave?
                  </a>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-12 py-7 text-base rounded-2xl border-slate-200 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 transition-all font-medium"
                    required
                  />
                </div>
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-4 bg-red-50 text-red-600 font-bold text-sm rounded-xl border border-red-100 flex items-center gap-3"
                >
                  <div className="w-2 h-2 rounded-full bg-red-500 shrink-0"></div>
                  {error}
                </motion.div>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={isLoading}
                className="w-full bg-slate-900 hover:bg-black text-white py-8 text-lg font-bold rounded-2xl shadow-xl shadow-slate-900/10 transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-3"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin text-white" />
                    Autenticando...
                  </>
                ) : (
                  "Entrar al Sistema"
                )}
              </Button>
            </form>

            <div className="mt-12 pt-8 border-t border-slate-200">
              <div className="flex items-center justify-center gap-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                <a href="#" className="hover:text-slate-700">Términos</a>
                <span>•</span>
                <a href="#" className="hover:text-slate-700">Privacidad</a>
                <span>•</span>
                <a href="#" className="hover:text-slate-700">Soporte</a>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right Side - Image/Brand */}
      <div className="hidden lg:block lg:w-1/2 relative bg-slate-900">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1750262701487-4ca222c89ef4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1200"
            alt="Business"
            fill
            className="object-cover opacity-20"
          />
        </div>
        <div className="relative z-10 h-full flex flex-col justify-center px-16 text-white bg-gradient-to-br from-blue-900/40 to-transparent">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
          >
            <div className="mb-10">
              <div className="relative w-20 h-20 bg-white rounded-3xl flex items-center justify-center mb-8 p-4 shadow-2xl">
                 <Image src="/logo.png" alt="SimTech Logo" fill className="object-contain p-3" />
              </div>
            </div>
            <h2 className="text-5xl font-bold mb-6 tracking-tight leading-tight">
              Gestiona tu negocio<br/>desde cualquier lugar
            </h2>
            <p className="text-xl text-blue-100 mb-10 max-w-md font-medium leading-relaxed">
              Acceso seguro a tus operaciones, inventario y reportes en tiempo real desde cualquier dispositivo.
            </p>
            <div className="space-y-5">
              {loginFeatures.map((feature, index) => (
                <motion.div
                  key={feature}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.1, duration: 0.6 }}
                  className="flex items-center gap-4"
                >
                  <div className="w-2.5 h-2.5 bg-blue-400 rounded-full shadow-lg shadow-blue-400/40"></div>
                  <span className="text-blue-50 font-bold tracking-wide uppercase text-xs">{feature}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
          
          <div className="absolute bottom-12 left-16 text-slate-500 font-bold text-[10px] tracking-[0.3em] uppercase">
            © {new Date().getFullYear()} SIMTECH ERP. Guatemala.
          </div>
        </div>
      </div>
    </div>
  );
}

const loginFeatures = [
  "Sincronización en Tiempo Real",
  "Seguridad de Nivel Empresarial",
  "Acceso desde Cualquier Dispositivo",
  "Soporte Técnico en Guatemala",
];
