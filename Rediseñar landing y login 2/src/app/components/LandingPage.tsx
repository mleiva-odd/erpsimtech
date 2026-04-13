import { motion } from "motion/react";
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
import { Button } from "./ui/button";

function CheckIcon({ className }: { className?: string }) {
  return <Check className={className} />;
}

function StarIcon({ className }: { className?: string }) {
  return <Star className={className} />;
}

interface LandingPageProps {
  onNavigateToLogin: () => void;
}

export function LandingPage({ onNavigateToLogin }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1764795849833-6e9d6e399a77?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=2000"
            alt="Modern business"
            className="w-full h-full object-cover"
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
                SimTech Guatemala
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
              Gestiona inventario, ventas, facturación y reportes en tiempo real. Todo en una plataforma moderna y fácil de usar.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.6 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <Button
                size="lg"
                onClick={onNavigateToLogin}
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-lg group"
              >
                Iniciar Sesión
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="bg-white/10 hover:bg-white/20 text-white border-white/30 px-8 py-6 text-lg backdrop-blur-sm"
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
              Herramientas completas para gestionar y hacer crecer tu negocio
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
                  className="relative rounded-2xl overflow-hidden shadow-2xl"
                >
                  <img
                    src={feature.image}
                    alt={feature.title}
                    className="w-full h-[400px] object-cover"
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
              Diseñado para tu industria
            </h2>
            <p className="text-xl text-slate-300 max-w-2xl mx-auto">
              Soluciones específicas para diferentes tipos de negocios
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
              Lo que dicen nuestros clientes
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Negocios de toda Guatemala confían en SimTech
            </p>
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
                <div className="bg-white p-8 rounded-2xl h-full shadow-lg hover:shadow-xl transition-shadow">
                  <div className="flex gap-1 mb-4">
                    {[...Array(5)].map((_, i) => (
                      <StarIcon key={i} className="h-5 w-5 text-yellow-400 fill-yellow-400" />
                    ))}
                  </div>
                  <p className="text-slate-700 mb-6 italic">"{testimonial.quote}"</p>
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
              Planes para cada etapa de tu negocio
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Comienza gratis y escala cuando lo necesites
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
                  className={`p-8 rounded-2xl h-full ${
                    plan.popular
                      ? "bg-blue-600 text-white shadow-2xl scale-105"
                      : "bg-slate-50 text-slate-900 border border-slate-200"
                  }`}
                >
                  <h3 className="text-2xl mb-2">{plan.name}</h3>
                  <div className="mb-6">
                    <span className="text-4xl">{plan.price}</span>
                    {plan.price !== "Contactar" && (
                      <span className={plan.popular ? "text-blue-100" : "text-slate-500"}>
                        /mes
                      </span>
                    )}
                  </div>
                  <p className={`mb-6 ${plan.popular ? "text-blue-100" : "text-slate-600"}`}>
                    {plan.description}
                  </p>
                  <ul className="space-y-3 mb-8">
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
                    onClick={onNavigateToLogin}
                    className={`w-full ${
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
              Preguntas frecuentes
            </h2>
            <p className="text-xl text-slate-600">
              Todo lo que necesitas saber sobre SimTech ERP
            </p>
          </motion.div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <motion.div
                key={faq.question}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05, duration: 0.6 }}
                className="bg-white p-6 rounded-xl border border-slate-200"
              >
                <h3 className="text-lg mb-2 text-slate-900">{faq.question}</h3>
                <p className="text-slate-600">{faq.answer}</p>
              </motion.div>
            ))}
          </div>
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
              Comienza a transformar tu negocio hoy
            </h2>
            <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
              Únete a cientos de negocios que ya confían en nuestro sistema ERP & POS
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                onClick={onNavigateToLogin}
                className="bg-white hover:bg-slate-100 text-blue-600 px-8 py-6 text-lg"
              >
                Iniciar Sesión
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="bg-transparent hover:bg-white/10 text-white border-white/50 px-8 py-6 text-lg"
              >
                Contactar Ventas
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <p className="mb-2">© 2026 SimTech Guatemala. Todos los derechos reservados.</p>
          <p className="text-sm">Sistema ERP & POS para negocios modernos</p>
        </div>
      </footer>
    </div>
  );
}

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
    description: "Procesa ventas en segundos. Optimizado para alto rendimiento incluso en horas pico.",
  },
  {
    icon: TrendingUp,
    title: "Gestión de Inventario",
    description: "Control total de stock, alertas de reorden y seguimiento de productos en múltiples ubicaciones.",
  },
];

const stats = [
  { value: "500+", label: "Negocios Activos" },
  { value: "99.9%", label: "Uptime Garantizado" },
  { value: "24/7", label: "Soporte Técnico" },
];

const detailedFeatures = [
  {
    badge: "Análisis y Reportes",
    title: "Decisiones basadas en datos reales",
    description:
      "Visualiza el desempeño de tu negocio con dashboards intuitivos y reportes personalizables en tiempo real.",
    points: [
      "Dashboards personalizables con KPIs clave",
      "Reportes de ventas, inventario y finanzas",
      "Gráficas interactivas y exportación a Excel/PDF",
      "Alertas automáticas de stock bajo y tendencias",
    ],
    image:
      "https://images.unsplash.com/photo-1763568258367-1c52beb60be7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1200",
  },
  {
    badge: "Gestión de Inventario",
    title: "Control total de tu inventario",
    description:
      "Administra productos, proveedores y bodegas desde una sola plataforma. Optimiza tu stock y reduce pérdidas.",
    points: [
      "Multi-bodega y control de ubicaciones",
      "Seguimiento de lotes y fechas de vencimiento",
      "Órdenes de compra automatizadas",
      "Sincronización en tiempo real entre sucursales",
    ],
    image:
      "https://images.unsplash.com/photo-1740914994657-f1cdffdc418e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1200",
  },
  {
    badge: "Experiencia del Cliente",
    title: "Ventas más rápidas y eficientes",
    description:
      "Procesa transacciones en segundos con una interfaz intuitiva diseñada para el punto de venta.",
    points: [
      "Interfaz táctil optimizada para tablets",
      "Múltiples métodos de pago (efectivo, tarjeta, transferencia)",
      "Facturación electrónica integrada (FEL)",
      "Programa de lealtad y descuentos automáticos",
    ],
    image:
      "https://images.unsplash.com/photo-1561527090-a1a24ce97af4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1200",
  },
];

const industries = [
  {
    icon: ShoppingCart,
    name: "Retail y Tiendas",
    description: "Solución completa para tiendas de ropa, calzado, electrónica y más.",
    features: [
      "Gestión de tallas y colores",
      "Código de barras y etiquetas",
      "Control de temporadas",
    ],
  },
  {
    icon: Utensils,
    name: "Restaurantes y Cafés",
    description: "Sistema POS especializado para el sector de alimentos y bebidas.",
    features: [
      "Menú digital y comandas",
      "Gestión de mesas",
      "Integración con cocina",
    ],
  },
  {
    icon: Store,
    name: "Supermercados",
    description: "Maneja grandes volúmenes de productos y transacciones diarias.",
    features: [
      "Báscula integrada",
      "Promociones y ofertas",
      "Control de perecederos",
    ],
  },
  {
    icon: Warehouse,
    name: "Distribuidoras",
    description: "Control de inventario y logística para distribución mayorista.",
    features: [
      "Gestión de rutas",
      "Vendedores móviles",
      "Preventa y facturación",
    ],
  },
  {
    icon: Scissors,
    name: "Salones de Belleza",
    description: "Agenda de citas y control de servicios personalizados.",
    features: [
      "Calendario de citas",
      "Historial de clientes",
      "Comisiones por servicio",
    ],
  },
  {
    icon: Heart,
    name: "Farmacias",
    description: "Cumplimiento de regulaciones y control de medicamentos.",
    features: [
      "Control de recetas",
      "Registro sanitario",
      "Alertas de vencimiento",
    ],
  },
];

const testimonials = [
  {
    name: "María González",
    role: "Dueña",
    company: "Boutique Elegancia",
    quote:
      "Desde que implementamos SimTech, nuestras ventas aumentaron 35%. El control de inventario nos ha ahorrado miles de quetzales.",
  },
  {
    name: "Carlos Méndez",
    role: "Gerente General",
    company: "Supermercado La Economía",
    quote:
      "El sistema es muy fácil de usar. Nuestros cajeros lo aprendieron en un día y el soporte técnico siempre está disponible.",
  },
  {
    name: "Ana Rodríguez",
    role: "Administradora",
    company: "Farmacia San José",
    quote:
      "Los reportes en tiempo real nos permiten tomar mejores decisiones. La facturación electrónica funciona perfectamente.",
  },
];

const pricingPlans = [
  {
    name: "Básico",
    price: "Q499",
    description: "Perfecto para emprendedores y negocios pequeños",
    features: [
      "1 punto de venta",
      "Hasta 500 productos",
      "Reportes básicos",
      "Facturación electrónica",
      "Soporte por email",
    ],
    cta: "Comenzar Gratis",
    popular: false,
  },
  {
    name: "Profesional",
    price: "Q999",
    description: "Ideal para negocios en crecimiento",
    features: [
      "3 puntos de venta",
      "Productos ilimitados",
      "Reportes avanzados",
      "Multi-bodega",
      "Soporte prioritario 24/7",
      "App móvil incluida",
    ],
    cta: "Empezar Ahora",
    popular: true,
  },
  {
    name: "Empresarial",
    price: "Contactar",
    description: "Para cadenas y grandes empresas",
    features: [
      "Puntos de venta ilimitados",
      "Multi-sucursal",
      "API personalizada",
      "Capacitación on-site",
      "Gerente de cuenta dedicado",
      "Personalización a medida",
    ],
    cta: "Hablar con Ventas",
    popular: false,
  },
];

const faqs = [
  {
    question: "¿Necesito instalar algún software?",
    answer:
      "No, SimTech es 100% en la nube. Solo necesitas un navegador web y conexión a internet. Funciona en computadoras, tablets y smartphones.",
  },
  {
    question: "¿Cómo funciona la facturación electrónica?",
    answer:
      "Estamos certificados por la SAT para facturación electrónica (FEL). El sistema genera y envía automáticamente las facturas a la SAT y a tus clientes por correo.",
  },
  {
    question: "¿Puedo importar mis productos actuales?",
    answer:
      "Sí, ofrecemos migración gratuita de datos. Puedes importar tus productos, clientes y proveedores desde Excel o desde tu sistema actual.",
  },
  {
    question: "¿Qué pasa si no tengo internet?",
    answer:
      "El sistema puede funcionar en modo offline por periodos cortos. Las transacciones se sincronizan automáticamente cuando se recupera la conexión.",
  },
  {
    question: "¿Ofrecen capacitación?",
    answer:
      "Sí, todos los planes incluyen capacitación inicial. Además, tenemos tutoriales en video, documentación completa y soporte técnico en español.",
  },
  {
    question: "¿Puedo cambiar de plan después?",
    answer:
      "Por supuesto. Puedes cambiar de plan en cualquier momento. Si mejoras tu plan, pagas la diferencia proporcionalmente.",
  },
];
