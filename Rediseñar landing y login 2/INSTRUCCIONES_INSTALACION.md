# Instrucciones de Instalación - SimTech ERP Landing + Login

## Requisitos Previos
- Node.js 18 o superior
- pnpm, npm o yarn

## Dependencias Necesarias

```bash
# Instalar dependencias principales
pnpm add motion lucide-react

# Si no tienes Tailwind CSS v4
pnpm add -D tailwindcss@4.1.12 @tailwindcss/vite

# Componentes UI (si no los tienes)
pnpm add @radix-ui/react-label @radix-ui/react-slot
pnpm add class-variance-authority clsx tailwind-merge
```

## Archivos a Copiar

### 1. Componentes Principales
- `src/app/App.tsx` - Archivo principal con navegación
- `src/app/components/LandingPage.tsx` - Landing page
- `src/app/components/LoginPage.tsx` - Página de login

### 2. Componentes UI (si no los tienes)
- `src/app/components/ui/button.tsx`
- `src/app/components/ui/input.tsx`
- `src/app/components/ui/label.tsx`

### 3. Utilidades
- `src/lib/utils.ts` (si existe, para cn() helper)

## Configuración de Tailwind CSS v4

Si usas Tailwind v4, asegúrate de tener en `vite.config.ts`:

```typescript
import tailwindcss from '@tailwindcss/vite';

export default {
  plugins: [
    react(),
    tailwindcss()
  ]
}
```

## Integración con tu Sistema Actual

### Conectar con tu API de autenticación:

En `LoginPage.tsx`, reemplaza la función `handleSubmit`:

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  try {
    // Aquí va tu lógica de autenticación
    const response = await fetch('https://app.simtechgt.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Redirigir al dashboard
      window.location.href = '/dashboard';
    }
  } catch (error) {
    console.error('Error de autenticación:', error);
  }
};
```

### Personalización de Colores

Los colores principales están en clases de Tailwind:
- Azul primario: `blue-600`, `blue-700`
- Texto: `slate-900`, `slate-600`
- Fondos: `slate-50`, `slate-900`

Puedes cambiarlos en `src/styles/theme.css` o crear un `tailwind.config.js`.

### Rutas y Navegación

Si usas React Router, reemplaza el `useState` en `App.tsx`:

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
```

## Imágenes

Las imágenes actuales son de Unsplash. Para producción, reemplázalas con:
- Tu logo corporativo
- Fotos de tu sistema POS/ERP en uso
- Capturas de pantalla reales de tu dashboard

URLs actuales a reemplazar:
- Hero: `https://images.unsplash.com/photo-1764795849833-...`
- Login: `https://images.unsplash.com/photo-1750262701487-...`

## Textos y Contenido

Personaliza en cada archivo:
- **LandingPage.tsx**: Cambiar features, stats, textos del hero
- **LoginPage.tsx**: Ajustar enlaces de soporte, términos, privacidad

## Deployment

1. Build del proyecto:
```bash
pnpm build
```

2. Los archivos estáticos estarán en `dist/`

3. Subir a tu servidor o hosting (Vercel, Netlify, tu servidor)

## Soporte

Para más información sobre:
- Tailwind CSS v4: https://tailwindcss.com
- Motion (Framer Motion): https://motion.dev
- Lucide Icons: https://lucide.dev
