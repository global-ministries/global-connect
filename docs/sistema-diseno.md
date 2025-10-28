# Sistema de Diseño GlobalConnect

## 🎨 Colores de Marca

```typescript
const coloresMarca = {
  grisOscuro: '#363D45',    // Color principal de marca
  naranja: '#E96C20',       // Color de acento
  negro: '#000000',
  blanco: '#FFFFFF',
  grisClaro: '#F8F9FA',
  grisTexto: '#6B7280',
  grisTextoClaro: '#9CA3AF',
  error: '#EF4444',
  exito: '#10B981',
  advertencia: '#F59E0B',
}
```

## 📐 Especificaciones de Diseño

- **Radio de bordes inputs**: 8px (`rounded-lg`)
- **Radio de bordes tarjetas**: 16px+ (`rounded-2xl`)
- **Espaciado**: Sistema basado en múltiplos de 4px
- **Tipografía**: Sistema escalable con breakpoints responsive
- **Sombras**: Glassmorphism con `backdrop-blur-2xl`

## 🧩 Componentes Disponibles

### InputSistema
Input con iconos, labels y manejo de errores integrado.

```tsx
<InputSistema
  label="Correo electrónico"
  type="email"
  placeholder="tu@email.com"
  icono={Mail}
  error={errors.email?.message}
  required
/>
```

**Props:**
- `icono?: LucideIcon` - Icono a mostrar (izquierda)
- `error?: string` - Mensaje de error
- `label?: string` - Etiqueta del campo
- Todas las props de `HTMLInputElement`

### BotonSistema
Botón con múltiples variantes y estados de carga.

```tsx
<BotonSistema
  variante="primario"
  tamaño="lg"
  cargando={isLoading}
  icono={Save}
  iconoPosicion="izquierda"
>
  Guardar
</BotonSistema>
```

**Variantes:**
- `primario` - Gradiente naranja (acción principal)
- `secundario` - Gris sólido
- `outline` - Borde con fondo transparente
- `ghost` - Solo texto, fondo en hover

**Tamaños:**
- `sm` - Pequeño (px-3 py-2)
- `md` - Mediano (px-4 py-3) - Default
- `lg` - Grande (px-6 py-4)

### TarjetaSistema
Tarjeta con glassmorphism y múltiples variantes.

```tsx
<TarjetaSistema variante="elevated" className="space-y-4">
  <TituloSistema nivel={2}>Título</TituloSistema>
  <TextoSistema>Contenido de la tarjeta</TextoSistema>
</TarjetaSistema>
```

**Variantes:**
- `default` - Glassmorphism estándar
- `elevated` - Más elevación y opacidad
- `outlined` - Fondo sólido con borde

### FondoAutenticacion
Fondo con orbes flotantes para páginas de autenticación.

```tsx
<FondoAutenticacion>
  <TarjetaSistema>
    {/* Contenido del formulario */}
  </TarjetaSistema>
</FondoAutenticacion>
```

### ContenedorPrincipal
Contenedor para páginas del dashboard con encabezado opcional.

```tsx
<ContenedorPrincipal
  titulo="Usuarios"
  descripcion="Gestiona los usuarios del sistema"
  accionPrincipal={
    <BotonSistema variante="primario">
      Nuevo Usuario
    </BotonSistema>
  }
>
  {/* Contenido de la página */}
</ContenedorPrincipal>
```

### Componentes de Tipografía

#### TituloSistema
```tsx
<TituloSistema nivel={1} variante="default">
  Título Principal
</TituloSistema>
```

**Niveles:** 1, 2, 3, 4
**Variantes:** `default`, `sutil`

#### TextoSistema
```tsx
<TextoSistema variante="sutil" tamaño="sm">
  Texto descriptivo
</TextoSistema>
```

**Variantes:** `default`, `sutil`, `muted`
**Tamaños:** `sm`, `base`, `lg`

#### EnlaceSistema
```tsx
<EnlaceSistema variante="marca">
  Enlace destacado
</EnlaceSistema>
```

**Variantes:** `default`, `marca`, `sutil`

### Componentes Utilitarios

#### BadgeSistema
```tsx
<BadgeSistema variante="success" tamaño="sm">
  Activo
</BadgeSistema>
```

**Variantes:** `default`, `success`, `warning`, `error`, `info`

#### SeparadorSistema
```tsx
<SeparadorSistema />
```

#### SkeletonSistema
```tsx
<SkeletonSistema ancho="200px" alto="20px" redondo />
```

## Responsive Design

### Breakpoints
- **sm**: 640px+
- **md**: 768px+
- **lg**: 1024px+
- **xl**: 1280px+

### Patrones Móviles
- Grid adaptativo: `grid-cols-1 sm:grid-cols-2`
- Espaciado escalable: `p-4 sm:p-6 lg:p-8`
- Tipografía responsive: `text-sm sm:text-base`
- Flex direccional: `flex-col sm:flex-row`

## Mejores Prácticas

### Estados de UI
- **Siempre** manejar estados de carga
- **Siempre** mostrar errores visualmente
- **Siempre** deshabilitar botones durante acciones
- **Siempre** validar formularios en tiempo real

### Accesibilidad
- Labels descriptivos en inputs
- Contraste adecuado en todos los elementos
- Estados de focus visibles
- Textos alternativos en iconos

### Performance
- Componentes optimizados con `React.forwardRef`
- Animaciones suaves con `transition-all duration-200`
- Lazy loading cuando sea apropiado

## 🔄 Uso en Nuevas Páginas

1. **Importar componentes necesarios:**
```tsx
import {
  ContenedorPrincipal,
  TarjetaSistema,
  BotonSistema,
  InputSistema,
  // ... otros componentes
} from "@/components/ui/sistema-diseno"
```

2. **Estructura básica de página:**
```tsx
export default function NuevaPagina() {
  return (
    <ContenedorPrincipal
      titulo="Título de la Página"
      descripcion="Descripción opcional"
    >
      <TarjetaSistema>
        {/* Contenido */}
      </TarjetaSistema>
    </ContenedorPrincipal>
  )
}
```

3. **Formularios:**
```tsx
<form onSubmit={handleSubmit}>
  <InputSistema
    label="Campo"
    type="text"
    icono={IconoRelevante}
    error={errors.campo?.message}
  />
  
  <BotonSistema
    type="submit"
    variante="primario"
    cargando={isLoading}
    className="w-full"
  >
    Enviar
  </BotonSistema>
</form>
```

## 🔔 Notificaciones (Toasts)

- **Librería oficial**: `sonner`.
- **Toaster global**: renderizado una sola vez en `app/layout.tsx` usando `components/ui/sonner.tsx`.
- **Hook estándar**: usar siempre `useNotificaciones()` en lugar de importar `toast` directamente.

Ejemplo de uso:

```tsx
"use client"
import { useNotificaciones } from '@/hooks/use-notificaciones'

export function EjemploAccion() {
  const toast = useNotificaciones()
  const onClick = async () => {
    try {
      // ... acción
      toast.success('Datos guardados correctamente.')
    } catch (e: any) {
      toast.error(e?.message || 'No se pudieron guardar los cambios. Inténtalo de nuevo.')
    }
  }
  return <button onClick={onClick}>Guardar</button>
}
```

Configuración del Toaster en `app/layout.tsx`:

```tsx
import { Toaster } from '@/components/ui/sonner'

// Dentro del <body>
<Toaster position="top-right" richColors closeButton />
```

## Estados de Carga y Feedback al Usuario

- **Navegación Global (Top Loader)**
  - Librería: `nextjs-toploader`.
  - Integración: en `app/layout.tsx` se incluye `NextTopLoader` con color de marca `#E96C20`.
  - Efecto: muestra una barra superior de progreso al navegar entre rutas.

```tsx
import NextTopLoader from 'nextjs-toploader'

<NextTopLoader
  color="#E96C20"
  initialPosition={0.08}
  crawlSpeed={200}
  height={3}
  crawl
  showSpinner={false}
  easing="ease"
  speed={200}
/>
```

- **Acciones de Botones (Feedback inmediato)**
  - Usar `BotonSistema` con la prop `cargando` y `disabled` durante mutaciones.
  - Patrón recomendado:

```tsx
const [isLoading, setIsLoading] = useState(false)
const onAction = async () => {
  setIsLoading(true)
  try {
    await api()
    toast.success('Listo')
  } catch (e:any) {
    toast.error(e?.message || 'Error')
  } finally {
    setIsLoading(false)
  }
}

<BotonSistema onClick={onAction} cargando={isLoading} disabled={isLoading}>
  Guardar Cambios
</BotonSistema>
```

- **Carga de Páginas (Skeletons)**
  - Usar archivos `loading.tsx` por ruta del App Router.
  - Construir skeletons con `SkeletonSistema` replicando la estructura general.

```tsx
// app/dashboard/grupos/loading.tsx
import { ContenedorDashboard, TarjetaSistema, SkeletonSistema } from '@/components/ui/sistema-diseno'

export default function LoadingGrupos() {
  return (
    <ContenedorDashboard titulo="Grupos" descripcion="Cargando información...">
      <div className="hidden md:grid md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <TarjetaSistema key={i} className="p-6">
            <div className="flex items-center gap-4">
              <SkeletonSistema ancho="48px" alto="48px" redondo />
              <div className="space-y-2 flex-1">
                <SkeletonSistema ancho="100px" alto="18px" />
                <SkeletonSistema ancho="140px" alto="14px" />
              </div>
            </div>
          </TarjetaSistema>
        ))}
      </div>
      <TarjetaSistema className="p-6">
        <div className="space-y-4">
          <SkeletonSistema ancho="180px" alto="20px" />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 border border-gray-100 rounded-lg">
              <SkeletonSistema ancho="64px" alto="40px" />
              <div className="flex-1 grid grid-cols-4 gap-4">
                <SkeletonSistema ancho="100%" alto="16px" />
                <SkeletonSistema ancho="80%" alto="16px" />
                <SkeletonSistema ancho="60%" alto="16px" />
                <SkeletonSistema ancho="40%" alto="16px" />
              </div>
              <SkeletonSistema ancho="100px" alto="32px" />
            </div>
          ))}
        </div>
      </TarjetaSistema>
    </ContenedorDashboard>
  )
}
```

## 🚀 Próximos Pasos

- [ ] Implementar tema oscuro
- [ ] Agregar más variantes de componentes
- [ ] Crear componentes de navegación
- [ ] Optimizar animaciones
- [ ] Agregar más utilidades de layout

---

**Ubicación del código:** `/components/ui/sistema-diseno.tsx`
**Última actualización:** Septiembre 2025
