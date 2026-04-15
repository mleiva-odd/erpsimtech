"use client";

import { motion } from "framer-motion";
import {
  BarChart3,
  Shield,
  Zap,
  TrendingUp,
  ArrowRight,
  Check,
  Star,
  ShoppingCart,
  Utensils,
  Store,
  Warehouse,
  Scissors,
  Heart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import Link from 'next/link';
import Image from 'next/image';

function CheckIcon({ className }: { className?: string }) {
  return <Check className={className} />;
}

function StarIcon({ className }: { className?: string }) {
  return <Star className={className} />;
}

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0">
          <Image
            src="/fondolanding.jpeg"
            alt="SimTech Background"
            fill
            sizes="100vw"
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
              className="mb-6"
            >
              <span className="text-blue-400 tracking-wider uppercase text-sm">
                SIMTECH Guatemala
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="text-6xl lg:text-7xl mb-6 text-white"
            >
              Sistema ERP & POS
              <span className="block text-blue-400 mt-2">Para Tu Negocio</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.8 }}
              className="text-xl text-slate-300 mb-8 max-w-2xl"
            >
              Gestiona inventario, ventas, facturación y reportes en tiempo real. Todo en una plataforma moderna y fácil de usar en la nube.
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
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-lg group w-full sm:w-auto"
                >
                  Iniciar Sesión
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                className="bg-white/10 hover:bg-white/20 text-white border-white/30 px-8 py-6 text-lg backdrop-blur-sm w-full sm:w-auto"
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
            <h2 className="text-4xl lg:text-5xl mb-4 text-slate-900">
              Todo lo que necesitas en un solo lugar
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
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
                <div className="bg-white p-8 rounded-2xl h-full border border-slate-200 transition-shadow hover:shadow-xl">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <feature.icon className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-xl mb-3 text-slate-900">{feature.title}</h3>
                  <p className="text-slate-600">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-24 bg-slate-900 text-white">
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
                <div className="text-5xl lg:text-6xl text-blue-400 mb-2">{stat.value}</div>
                <div className="text-xl text-slate-300">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Detailed Features Section */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          {detailedFeatures.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className={`grid lg:grid-cols-2 gap-12 items-center mb-24 last:mb-0 ${
                index % 2 === 1 ? "lg:flex-row-reverse" : ""
              }`}
            >
              <div className={index % 2 === 1 ? "lg:order-2" : ""}>
                <div className="mb-4">
                  <span className="inline-block px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm">
                    {feature.badge}
                  </span>
                </div>
                <h3 className="text-3xl lg:text-4xl mb-4 text-slate-900">
                  {feature.title}
                </h3>
                <p className="text-lg text-slate-600 mb-6">{feature.description}</p>
                <ul className="space-y-3">
                  {feature.points.map((point) => (
                    <li key={point} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <CheckIcon className="h-4 w-4 text-blue-600" />
                      </div>
                      <span className="text-slate-700">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={index % 2 === 1 ? "lg:order-1" : ""}>
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  transition={{ duration: 0.3 }}
                  className="relative rounded-2xl overflow-hidden shadow-2xl aspect-[4/3] lg:aspect-auto lg:h-[400px]"
                >
                  <Image
                    src={feature.image}
                    alt={feature.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/20 to-transparent"></div>
                </motion.div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Industries Section */}
      <section className="py-24 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl mb-4">
              Soluciones para cada sector
            </h2>
            <p className="text-xl text-slate-300 max-w-2xl mx-auto">
              Diseñado para adaptarse a las necesidades específicas de tu negocio.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {industries.map((industry, index) => (
              <motion.div
                key={industry.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.6 }}
                className="group"
              >
                <div className="bg-slate-800 p-8 rounded-2xl h-full border border-slate-700 hover:border-blue-500 transition-all">
                  <div className="w-12 h-12 rounded-lg bg-blue-600/20 flex items-center justify-center mb-6 group-hover:bg-blue-600/30 transition-colors">
                    <industry.icon className="h-6 w-6 text-blue-400" />
                  </div>
                  <h3 className="text-xl mb-3">{industry.name}</h3>
                  <p className="text-slate-400 mb-4">{industry.description}</p>
                  <ul className="space-y-2">
                    {industry.features.map((feat) => (
                      <li key={feat} className="text-sm text-slate-300 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                        {feat}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl mb-4 text-slate-900">
              Lo que dicen de nosotros
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={testimonial.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.6 }}
              >
                <div className="bg-white p-8 rounded-2xl h-full shadow-lg hover:shadow-xl transition-shadow border border-slate-200">
                  <div className="flex gap-1 mb-4">
                    {[...Array(5)].map((_, i) => (
                      <StarIcon key={i} className="h-5 w-5 text-yellow-400 fill-yellow-400" />
                    ))}
                  </div>
                  <p className="text-lg text-slate-700 mb-8 italic font-medium leading-relaxed">&quot;{testimonial.quote}&quot;</p>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white">
                      {testimonial.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-slate-900">{testimonial.name}</div>
                      <div className="text-sm text-slate-500">{testimonial.role}</div>
                      <div className="text-sm text-slate-500">{testimonial.company}</div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl mb-4 text-slate-900">
              Inversión Inteligente
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Planes flexibles que se adaptan a tu ritmo de crecimiento.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {pricingPlans.map((plan, index) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.6 }}
                className="relative"
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                    <span className="bg-blue-600 text-white px-4 py-1 rounded-full text-sm">
                      Más Popular
                    </span>
                  </div>
                )}
                <div
                  className={`p-8 rounded-2xl h-full flex flex-col ${
                    plan.popular
                      ? "bg-blue-600 text-white shadow-2xl scale-105"
                      : "bg-slate-50 text-slate-900 border border-slate-200"
                  }`}
                >
                  <h3 className="text-2xl mb-2">{plan.name}</h3>
                  <div className="mb-6">
                    <span className="text-4xl">{plan.price}</span>
                  </div>
                  <p className={`mb-6 ${plan.popular ? "text-blue-100" : "text-slate-600"}`}>
                    {plan.description}
                  </p>
                  <ul className="space-y-3 mb-8 flex-grow">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <CheckIcon
                          className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                            plan.popular ? "text-blue-200" : "text-blue-600"
                          }`}
                        />
                        <span className={plan.popular ? "text-blue-50" : "text-slate-700"}>
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    size="lg"
                    className={`w-full mt-4 ${
                      plan.popular
                        ? "bg-white hover:bg-blue-50 text-blue-600"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                  >
                    {plan.cta}
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl mb-4 text-slate-900">
              Preguntas Frecuentes
            </h2>
          </motion.div>

          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="mb-4 bg-white px-6 rounded-xl border border-slate-200 decoration-transparent">
                <AccordionTrigger className="text-lg text-slate-900 hover:no-underline">{faq.question}</AccordionTrigger>
                <AccordionContent className="text-base text-slate-600 pb-6">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-br from-blue-600 to-blue-700 text-white">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-4xl lg:text-5xl mb-6">
              Transforma tu operación hoy mismo
            </h2>
            <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
              Únete a cientos de negocios que ya confían en SIMTECH para su gestión diaria en Guatemala.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/login">
                <Button
                  size="lg"
                  className="bg-white hover:bg-slate-100 text-blue-600 px-8 py-6 text-lg w-full sm:w-auto"
                >
                  Probar Gratis
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                className="bg-transparent hover:bg-white/10 text-white border-white/50 px-8 py-6 text-lg w-full sm:w-auto"
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
          <p className="mb-2">© {new Date().getFullYear()} SIMTECH Guatemala. Todos los derechos reservados.</p>
          <p className="text-sm">Sistema ERP & POS para negocios modernos y escalables.</p>
        </div>
      </footer>
    </div>
  );
}

const stats = [
  { value: "6+", label: "Años de Experiencia" },
  { value: "99.9%", label: "Uptime Garantizado" },
  { value: "24/7", label: "Soporte Técnico" },
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
    title: "Rápido y Eficiente",
    description: "Procesa ventas en segundos. Optimizado para alto rendimiento incluso si falla el internet.",
  },
  {
    icon: TrendingUp,
    title: "Gestión de Inventario",
    description: "Control total de stock, alertas por inventario bajo y seguimiento de productos.",
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
    image: "/analysis.jpg",
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
    image: "/inventory.jpg",
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
    image: "/pos.jpg",
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
      "Con SIMTECH el control de mi inventario es exacto. Ya no pierdo tiempo en conteos manuales cada semana.",
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
    description: "Perfecto para emprendedores y negocios pequeños",
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
      "No, SIMTECH funciona directamente desde tu navegador. Solo necesitas internet para la configuración inicial, pero permite seguir vendiendo offline si es necesario.",
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
