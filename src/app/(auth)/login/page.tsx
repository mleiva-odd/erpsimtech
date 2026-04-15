"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Lock, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import Image from "next/image";

function BarChart3Icon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}

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
    } catch (err: unknown) {
      setError("Error interno del servidor");
      setIsLoading(false);
      console.error(err);
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
              className="text-slate-600 hover:text-slate-900"
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
            <div className="mb-8">
              <div className="lg:hidden flex justify-center mb-8">
                  <div className="relative w-16 h-16">
                    <Image src="/logo.png" alt="SimTech Logo" fill sizes="64px" className="object-contain" />
                  </div>
              </div>
              <h1 className="text-4xl mb-3 text-slate-900">Bienvenido</h1>
              <p className="text-lg text-slate-600">
                Inicia sesión en tu cuenta de SIMTECH ERP.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
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
                    className="pl-11 py-6 text-base"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-slate-700">
                    Contraseña
                  </Label>
                  <a
                    href="#"
                    className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </a>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-11 py-6 text-base"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center">
                <input
                  id="remember"
                  type="checkbox"
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                />
                <label htmlFor="remember" className="ml-2 text-sm text-slate-700">
                  Recordar mi sesión
                </label>
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
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6 text-base"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin text-white mr-2" />
                    Autenticando...
                  </>
                ) : (
                  "Iniciar Sesión"
                )}
              </Button>
            </form>

            <div className="mt-8 text-center">
              <p className="text-slate-600">
                ¿No tienes una cuenta?{" "}
                <a href="#" className="text-blue-600 hover:text-blue-700 hover:underline">
                  Solicita acceso
                </a>
              </p>
            </div>

            <div className="mt-12 pt-8 border-t border-slate-200">
              <div className="flex items-center justify-center gap-6 text-sm text-slate-500">
                <a href="#" className="hover:text-slate-700">
                  Términos de Servicio
                </a>
                <span>•</span>
                <a href="#" className="hover:text-slate-700">
                  Privacidad
                </a>
                <span>•</span>
                <a href="#" className="hover:text-slate-700">
                  Soporte
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right Side - Image/Brand */}
      <div className="hidden lg:block lg:w-1/2 relative bg-gradient-to-br from-blue-600 to-blue-800">
        <div className="absolute inset-0">
          <Image
            src="/fondologin.jpeg"
            alt="Business Background"
            fill
            sizes="50vw"
            className="object-cover opacity-20"
            priority
          />
        </div>
        <div className="relative z-10 h-full flex flex-col justify-center px-12 text-white">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
          >
            <div className="mb-6">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-6">
                <BarChart3Icon className="h-8 w-8 text-white" />
              </div>
            </div>
            <h2 className="text-4xl mb-4">
              Gestiona tu negocio desde cualquier lugar
            </h2>
            <p className="text-xl text-blue-100 mb-8 max-w-md">
              Accede a todas tus operaciones, inventario y reportes en tiempo real desde cualquier dispositivo.
            </p>
            <div className="space-y-4">
              {loginFeatures.map((feature, index) => (
                <motion.div
                  key={feature}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.1, duration: 0.6 }}
                  className="flex items-center gap-3"
                >
                  <div className="w-2 h-2 bg-blue-300 rounded-full"></div>
                  <span className="text-blue-50">{feature}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
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
