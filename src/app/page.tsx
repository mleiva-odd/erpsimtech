"use client";

import { motion } from "framer-motion";
import { 
  BarChart3, 
  Shield, 
  Zap, 
  TrendingUp, 
  ArrowRight, 
  Truck, 
  ClipboardCheck, 
  Database 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from 'next/link';
import Image from 'next/image';

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1764795849833-6e9d6e399a77?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=2000"
            alt="Modern business"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/95 via-slate-900/85 to-slate-900/50"></div>
        </div>

        {/* Content */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-8 py-20">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-3xl"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="mb-6 flex items-center gap-4"
            >
              <div className="relative w-12 h-12 bg-white rounded-xl p-2 shadow-xl">
                 <Image src="/logo.png" alt="SimTech Logo" fill className="object-contain p-1" />
              </div>
              <span className="text-blue-400 tracking-wider uppercase text-sm font-bold">
                SimTech Guatemala
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="text-6xl lg:text-7xl font-bold mb-6 text-white tracking-tight"
            >
              Sistema ERP & POS
              <span className="block text-blue-400 mt-2">Inteligente</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.8 }}
              className="text-xl text-slate-300 mb-8 max-w-2xl font-medium"
            >
              Control total de tu negocio. Desde la integridad del inventario matriz hasta la rentabilidad detallada de cada sucursal.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.6 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <Link href="/login">
                <Button
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-7 text-lg group rounded-2xl w-full sm:w-auto"
                >
                  Ingresar al Sistema
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                className="bg-white/10 hover:bg-white/20 text-white border-white/30 px-8 py-7 text-lg backdrop-blur-sm rounded-2xl w-full sm:w-auto"
              >
                Solicitar Demo
              </Button>
            </motion.div>
          </motion.div>
        </div>

        {/* Scroll Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.8 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
        >
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center pt-2"
          >
            <div className="w-1 h-2 bg-white/60 rounded-full"></div>
          </motion.div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-bold mb-4 text-slate-900 tracking-tight">
              Diseñado para el Crecimiento Multi-Sucursal
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Tecnología de vanguardia para emprendedores que buscan control absoluto y escalabilidad real.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.6 }}
                whileHover={{ y: -8 }}
                className="group"
              >
                <div className="bg-white p-8 rounded-3xl h-full border border-slate-200 transition-shadow hover:shadow-2xl hover:border-blue-100">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg shadow-blue-500/20">
                    <feature.icon className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold mb-3 text-slate-900">{feature.title}</h3>
                  <p className="text-slate-600 leading-relaxed font-medium">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-24 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-30"></div>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-12">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.6 }}
                className="text-center"
              >
                <div className="text-5xl lg:text-7xl font-bold text-blue-400 mb-2">{stat.value}</div>
                <div className="text-xl text-slate-400 font-bold tracking-wider uppercase">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-br from-blue-600 to-blue-800 text-white">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-4xl lg:text-6xl font-bold mb-6 tracking-tight">
              Transforma tu operación hoy mismo
            </h2>
            <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto font-medium">
              Únete a la nueva era de gestión comercial en Guatemala con SimTech.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/login">
                <Button
                  size="lg"
                  className="bg-white hover:bg-slate-100 text-blue-700 px-10 py-7 text-xl font-bold rounded-2xl shadow-2xl"
                >
                  Probar Ahora
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                className="bg-transparent hover:bg-white/10 text-white border-white/40 px-10 py-7 text-xl font-bold rounded-2xl"
              >
                Hablar con un Experto
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-500 py-16 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <div className="mb-8 flex justify-center">
             <div className="relative w-12 h-12 grayscale opacity-50">
                 <Image src="/logo.png" alt="SimTech Logo" fill className="object-contain" />
              </div>
          </div>
          <p className="mb-2 font-bold tracking-widest text-xs uppercase">© 2026 SimTech Guatemala. Todos los derechos reservados.</p>
          <p className="text-sm font-medium">El estándar de oro en ERP & POS para negocios multi-sucursal.</p>
        </div>
      </footer>
    </div>
  );
}

const features = [
  {
    icon: BarChart3,
    title: "Inteligencia de Negocio",
    description: "Reportes de utilidad bruta y márgenes históricos. Conoce la rentabilidad real de cada producto vendido.",
  },
  {
    icon: Truck,
    title: "Logística Multi-Sucursal",
    description: "Traslados con guías de remisión y validación de recepción local. Control total de stock en tránsito.",
  },
  {
    icon: ClipboardCheck,
    title: "Auditoría de Inventario",
    description: "Ajustes de stock con bitácora obligatoria. Detecta mermas y asegura la integridad de tus almacenes.",
  },
  {
    icon: Shield,
    title: "Seguridad Bancaria",
    description: "Protección IDOR y cifrado de datos. Acceso restringido por roles y sucursales.",
  },
  {
    icon: Zap,
    title: "Alto Rendimiento",
    description: "Optimizado con índices avanzados para procesar miles de ventas sin latencia. Rápido en cualquier sucursal.",
  },
  {
    icon: Database,
    title: "Cartera de Clientes",
    description: "Gestión completa de cuentas por cobrar, límites de crédito y abonos integrados al arqueo de caja.",
  },
];

const stats = [
  { value: "500+", label: "Negocios" },
  { value: "99.9%", label: "Uptime" },
  { value: "24/7", label: "Soporte" },
];
