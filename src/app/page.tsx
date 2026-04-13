"use client";

import { motion } from "framer-motion";
import { 
  BarChart3, 
  Shield, 
  Zap, 
  TrendingUp, 
  ArrowRight,
  Check,
  ChevronDown,
  Star,
  ShoppingCart,
  Utensils,
  Store,
  Warehouse,
  Scissors,
  Heart,
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@/components/ui/accordion";
import Link from 'next/link';
import Image from 'next/image';

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative min-vh-100 flex items-center overflow-hidden h-screen">
        {/* Background Image - ORIGINAL USER IMAGE */}
        <div className="absolute inset-0">
          <Image
            src="/fondolanding.jpeg"
            alt="SimTech Background"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-slate-900/40"></div>
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
              className="mb-8"
            >
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
              <span className="block text-blue-400 mt-2">Para Tu Negocio</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.8 }}
              className="text-xl text-slate-200 mb-10 max-w-2xl font-medium leading-relaxed"
            >
              Gestiona inventario, ventas, facturación y reportes en tiempo real. Todo en una plataforma moderna y fácil de usar en la nube.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.6 }}
              className="flex flex-col sm:flex-row gap-5"
            >
              <Link href="/login">
                <Button
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-7 text-lg group rounded-2xl w-full sm:w-auto font-bold shadow-xl shadow-blue-600/20"
                >
                  Iniciar Sesión
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                className="bg-white/10 hover:bg-white/20 text-white border-white/30 px-10 py-7 text-lg backdrop-blur-sm rounded-2xl w-full sm:w-auto font-bold"
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

      {/* Stats Section - VERACIOUS DATA */}
      <section className="py-24 bg-slate-900 text-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
            <div className="grid md:grid-cols-3 gap-12">
                {stats.map((stat, index) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, scale: 0.8 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.1, duration: 0.6 }}
                    >
                        <div className="text-5xl lg:text-6xl font-bold text-blue-400 mb-2">{stat.value}</div>
                        <div className="text-xl text-slate-300 font-bold uppercase tracking-wider">{stat.label}</div>
                    </motion.div>
                ))}
            </div>
        </div>
      </section>

      {/* Brief Features Overview */}
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
              Todo lo que necesitas en un solo lugar
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto font-medium">
              Herramientas completas para gestionar y hacer crecer tu negocio.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
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
                <div className="bg-white p-8 rounded-3xl h-full border border-slate-200 transition-shadow hover:shadow-2xl">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg shadow-blue-500/20">
                    <feature.icon className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-slate-900">{feature.title}</h3>
                  <p className="text-slate-600 leading-relaxed font-medium">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Detailed Features with Images */}
      {detailedFeatures.map((feature, index) => (
        <section key={feature.title} className={`py-24 ${index % 2 === 1 ? 'bg-slate-50' : 'bg-white'}`}>
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className={`flex flex-col ${index % 2 === 1 ? 'lg:flex-row-reverse' : 'lg:flex-row'} items-center gap-16`}>
              <motion.div 
                initial={{ opacity: 0, x: index % 2 === 1 ? 50 : -50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="flex-1"
              >
                <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 mb-6 px-4 py-1 text-sm rounded-full">
                  {feature.badge}
                </Badge>
                <h2 className="text-4xl lg:text-5xl font-bold mb-6 text-slate-900 tracking-tight leading-tight">
                  {feature.title}
                </h2>
                <p className="text-xl text-slate-600 mb-8 leading-relaxed font-medium">
                  {feature.description}
                </p>
                <div className="space-y-4">
                  {feature.points.map((point) => (
                    <div key={point} className="flex items-start gap-3">
                      <div className="mt-1 flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                        <Check className="h-4 w-4 text-blue-600" />
                      </div>
                      <span className="text-slate-700 font-medium">{point}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="flex-1 relative w-full aspect-video rounded-3xl overflow-hidden shadow-2xl border border-slate-200"
              >
                <Image 
                    src={feature.image} 
                    alt={feature.title} 
                    fill 
                    className="object-cover" 
                    priority={index === 0}
                />
              </motion.div>
            </div>
          </div>
        </section>
      ))}

      {/* Industries Section */}
      <section className="py-24 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-bold mb-4 text-slate-900">Soluciones para cada sector</h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto font-medium">Diseñado para adaptarse a las necesidades específicas de tu negocio.</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {industries.map((industry, index) => (
              <motion.div
                key={industry.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                className="bg-slate-50 p-8 rounded-3xl border border-slate-200 hover:border-blue-200 hover:bg-blue-50/30 transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 transition-transform">
                  <industry.icon className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="text-2xl font-bold mb-3 text-slate-900">{industry.name}</h3>
                <p className="text-slate-600 mb-6 font-medium">{industry.description}</p>
                <div className="space-y-2">
                  {industry.features.map(f => (
                    <div key={f} className="flex items-center gap-2 text-sm text-slate-500 font-bold">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                        {f}
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16 font-bold uppercase tracking-widest text-blue-600 text-sm">Lo que dicen de nosotros</div>
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm"
              >
                <div className="flex gap-1 mb-6">
                  {[...Array(5)].map((_, i) => <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />)}
                </div>
                <p className="text-lg text-slate-700 mb-8 italic font-medium leading-relaxed">"{t.quote}"</p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                    {t.name[0]}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">{t.name}</div>
                    <div className="text-sm text-slate-500">{t.role}, {t.company}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section - CONSULTANT APPROACH */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold mb-4 text-slate-900">Inversión Inteligente</h2>
            <p className="text-xl text-slate-600 font-medium">Planes flexibles que se adaptan a tu ritmo de crecimiento.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {pricingPlans.map((plan, i) => (
              <Card 
                key={plan.name} 
                className={`rounded-[2rem] border-2 transition-all p-4 ${plan.popular ? 'border-blue-500 shadow-2xl scale-105 z-10' : 'border-slate-100 shadow-lg'}`}
              >
                <CardHeader className="text-center pb-8 border-b border-slate-50">
                  <CardTitle className="text-2xl font-bold mb-4">{plan.name}</CardTitle>
                  <div className="text-5xl font-bold text-slate-900 mb-2">{plan.price}</div>
                  <CardDescription className="font-medium">{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-8 space-y-4">
                  {plan.features.map(f => (
                    <div key={f} className="flex gap-3 items-center font-medium text-slate-600">
                      <Check className="h-5 w-5 text-blue-500 flex-shrink-0" />
                      {f}
                    </div>
                  ))}
                  <Button 
                    className={`w-full h-14 rounded-2xl text-lg font-bold mt-8 ${plan.popular ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-100 text-slate-900 hover:bg-slate-200'}`}
                  >
                    {plan.cta}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQs Section */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900">Preguntas Frecuentes</h2>
          </div>
          <Accordion type="single" collapsible className="w-full space-y-4">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="bg-white px-8 rounded-2xl border border-slate-200">
                <AccordionTrigger className="text-left py-6 text-lg font-bold hover:no-underline">{faq.question}</AccordionTrigger>
                <AccordionContent className="pb-6 text-slate-600 leading-relaxed font-medium">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
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
            <h2 className="text-4xl lg:text-5xl font-bold mb-6 tracking-tight">
              Transforma tu operación hoy mismo
            </h2>
            <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto font-medium leading-relaxed">
              Únete a cientos de negocios que ya confían en SimTech para su gestión diaria en Guatemala.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/login">
                <Button
                  size="lg"
                  className="bg-white hover:bg-slate-100 text-blue-700 px-10 py-7 text-xl font-bold rounded-2xl shadow-2xl"
                >
                  Probar Gratis
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                className="bg-transparent hover:bg-white/10 text-white border-white/40 px-10 py-7 text-xl font-bold rounded-2xl"
              >
                Contactar Ventas
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-16 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <div className="mb-8 flex justify-center">
             <div className="relative w-16 h-16">
                  <Image src="/logo.png" alt="SimTech Logo" fill className="object-contain" />
              </div>
          </div>
          <p className="mb-2 font-bold tracking-widest text-xs uppercase text-slate-300">© {new Date().getFullYear()} SimTech Guatemala. Todos los derechos reservados.</p>
          <p className="text-sm font-medium text-slate-500">Sistema ERP & POS para negocios modernos y escalables.</p>
        </div>
      </footer>
    </div>
  );
}

const stats = [
  { value: "SaaS", label: "Gestión Eficiente" },
  { value: "99.9%", label: "Uptime Garantizado" },
  { value: "Guate", label: "Soporte Técnico Local" },
];

const features = [
  {
    icon: BarChart3,
    title: "Reportes en Tiempo Real",
    description: "Visualiza el desempeño de tu negocio con reportes y gráficas actualizadas al instante.",
  },
  {
    icon: Shield,
    title: "Seguro y Confiable",
    description: "Protección de datos con cifrado de nivel empresarial y respaldos automáticos.",
  },
  {
    icon: Zap,
    title: "Rápido y Offline",
    description: "Sigue vendiendo incluso si falla el internet. El sistema se sincroniza automáticamente.",
  },
  {
    icon: TrendingUp,
    title: "Gestión de Inventario",
    description: "Control total de stock, alertas de reorden y seguimiento de productos.",
  },
];

const detailedFeatures = [
  {
    badge: "Análisis y Reportes",
    title: "Decisiones basadas en datos reales",
    description:
      "Visualiza el desempeño de tu negocio con dashboards intuitivos y reportes personalizables en tiempo real.",
    points: [
      "Dashboards con KPIs de ventas y utilidad",
      "Reportes de rotación de productos e inventario",
      "Gráficas interactivas y exportación de datos",
      "Alertas automáticas de stock bajo y tendencias",
    ],
    image: "/analysis.png",
  },
  {
    badge: "Gestión de Inventario",
    title: "Control total de tu inventario",
    description:
      "Administra productos, variantes y bodegas desde una sola plataforma. Optimiza tu stock y reduce pérdidas.",
    points: [
      "Gestión de variantes (tallas, colores, etc.)",
      "Kits de productos y combos configurables",
      "Traslados entre sucursales y bodegas",
      "Ajustes de stock con bitácora de auditoría",
    ],
    image: "/inventory.png",
  },
  {
    badge: "Experiencia del Cliente",
    title: "Ventas más rápidas y eficientes",
    description:
      "Procesa transacciones en segundos con una interfaz intuitiva diseñada para agilizar el punto de venta.",
    points: [
      "Interfaz táctil optimizada para cualquier dispositivo",
      "Múltiples métodos de pago integrados",
      "Facturación Electrónica Integrada",
      "Cotizaciones y seguimiento de clientes",
    ],
    image: "/pos.png",
  },
];

const industries = [
  {
    icon: ShoppingCart,
    name: "Retail y Tiendas",
    description: "Solución completa para tiendas de ropa, calzado, electrónica y más.",
    features: [
      "Gestión de variantes",
      "Código de barras",
      "Control de existencias",
    ],
  },
  {
    icon: Utensils,
    name: "Restaurantes y Cafés",
    description: "Agiliza la toma de pedidos y el control de tu cocina o barra.",
    features: [
      "Menú digital",
      "Comandas rápidas",
      "Control de mesas",
    ],
  },
  {
    icon: Store,
    name: "Supermercados",
    description: "Maneja grandes volúmenes de productos y ventas diarias.",
    features: [
      "Caja rápida",
      "Múltiples métodos de pago",
      "Alertas de stock",
    ],
  },
  {
    icon: Warehouse,
    name: "Distribuidoras",
    description: "Control de inventario y logística para distribución mayorista.",
    features: [
      "Traslados masivos",
      "Gestión de lotes",
      "Reportes de bodega",
    ],
  },
  {
    icon: Scissors,
    name: "Salones de Belleza",
    description: "Control de servicios y gestión de productos especializados.",
    features: [
      "Servicios por empleado",
      "Control de insumos",
      "Ficha de cliente",
    ],
  },
  {
    icon: Heart,
    name: "Farmacias",
    description: "Cumplimiento de control de stock y vencimiento de productos.",
    features: [
      "Control de vencimientos",
      "Sustitutos de productos",
      "Gestión de proveedores",
    ],
  },
];

const testimonials = [
  {
    name: "María González",
    role: "Administradora",
    company: "Boutique Elegancia",
    quote:
      "Con SimTech el control de mi inventario es exacto. Ya no pierdo tiempo en conteos manuales cada semana.",
  },
  {
    name: "Carlos Méndez",
    role: "Dueño",
    company: "Librería Central",
    quote:
      "La facturación electrónica es sumamente fácil y los reportes de ventas me llegan al celular cada noche.",
  },
  {
    name: "Ana Rodríguez",
    role: "Gerente",
    company: "Farmacia San José",
    quote:
      "El sistema es muy intuitivo. Mis vendedores lo aprendieron a usar en cuestión de minutos sin complicaciones.",
  },
];

const pricingPlans = [
  {
    name: "Básico",
    price: "Consultar",
    description: "Perfecto para negocios locales que inician su digitalización",
    features: [
      "1 Punto de Venta",
      "Gestión de Inventario",
      "Facturación Electrónica",
      "Reportes Básicos",
      "Soporte Local",
    ],
    cta: "Solicitar Cotización",
    popular: false,
  },
  {
    name: "Profesional",
    price: "Consultar",
    description: "Ideal para negocios en crecimiento y multi-bodega",
    features: [
      "Puntos de Venta Ilimitados",
      "Multi-bodega y Traslados",
      "Reportes Avanzados",
      "Modo Offline",
      "Soporte Prioritario",
      "App Web Responsiva",
    ],
    cta: "Solicitar Cotización",
    popular: true,
  },
  {
    name: "Empresarial",
    price: "Consultar",
    description: "Para cadenas de tiendas y operaciones complejas",
    features: [
      "Multi-sucursal Global",
      "API de Integración",
      "Módulo de Auditoría",
      "Capacitación Personalizada",
      "Gerente de Cuenta",
      "Soporte 24/7",
    ],
    cta: "Hablar con Ventas",
    popular: false,
  },
];

const faqs = [
  {
    question: "¿Necesito instalar algún programa?",
    answer:
      "No, SimTech funciona directamente desde tu navegador. Solo necesitas internet para la configuración inicial, pero permite seguir vendiendo offline si es necesario.",
  },
  {
    question: "¿Cómo funciona la facturación electrónica?",
    answer:
      "El sistema genera facturas electrónicas de forma automática e integrada conforme a las normativas vigentes, enviándolas directamente a tus clientes.",
  },
  {
    question: "¿Puedo importar mis productos?",
    answer:
      "Sí, puedes cargar masivamente tus catálogos de productos desde archivos Excel para que la puesta en marcha sea cuestión de minutos.",
  },
  {
    question: "¿Funciona en tablets o celulares?",
    answer:
      "Totalmente. El sistema cuenta con una interfaz responsiva optimizada para que puedas vender y revisar tus reportes desde cualquier dispositivo móvil.",
  },
  {
    question: "¿El soporte es en español?",
    answer:
      "Sí, nuestro equipo de soporte técnico es local y está listo para atenderte en español a través de múltiples canales de comunicación.",
  },
  {
    question: "¿Puedo gestionar varias bodegas?",
    answer:
      "Correcto. Los planes Profesional y Empresarial permiten el control de múltiples bodegas y la realización de traslados de stock entre sucursales.",
  },
];
