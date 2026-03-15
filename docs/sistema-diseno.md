# Sistema de Diseño GlobalConnect

## 🎨 Colores y Tokens

### Colores de Marca
```typescript
const coloresMarca = {
  grisOscuro: '#363D45',    // Color principal de marca
  naranja: '#E96C20',       // Color de acento
  negro: '#000000',
  blanco: '#FFFFFF',
}
```

### Tokens Semánticos (Dark Mode Ready) ✅

Desde la Fase 3 (Marzo 2026), GlobalConnect usa **exclusivamente tokens semánticos** CSS que se adaptan automáticamente a light/dark mode.

| Token CSS | Uso | Light | Dark |
|-----------|-----|-------|------|
| `--foreground` | Texto principal | `#000` | `#fff` |
| `--muted-foreground` | Texto secundario | `#6b7280` | `#9ca3af` |
| `--card` | Fondo de tarjetas | `#fff` | `#1c1c1e` |
| `--muted` | Fondos terciarios | `#f1f5f9` | `#27272a` |
| `--border` | Bordes | `#e2e8f0` | `#3f3f46` |
| `--destructive` | Errores | `#ef4444` | `#ef4444` |

> ⚠️ **NUNCA usar colores hardcoded** como `gray-500`, `bg-white`, o `#6b7280` en componentes.
> Siempre usar: `text-foreground`, `text-muted-foreground`, `bg-card`, `bg-muted`, `border-border`.

## 📐 Especificaciones de Diseño

- **Radio de bordes inputs**: 8px (`rounded-lg`)
- **Radio de bordes tarjetas**: 16px+ (`rounded-2xl`)
- **Espaciado**: Sistema basado en múltiplos de 4px
- **Tipografía**: Sistema escalable con breakpoints responsive
- **Sombras**: Glassmorphism con `backdrop-blur-2xl`

## 🧩 Componentes Disponibles

### TabsSistema
Componente de pestañas basado en Radix Tabs con estilos del sistema.

```tsx
import { TabsSistema, TabsList, TabsTrigger, TabsContent } from '@/components/ui/TabsSistema'

<TabsSistema defaultValue="actuales">
  <TabsList>
    <TabsTrigger value="actuales">Actuales</TabsTrigger>
    <TabsTrigger value="pasados">Pasados</TabsTrigger>
  </TabsList>
  <TabsContent value="actuales">
    {/* Contenido pestaña Actuales */}
  </TabsContent>
  <TabsContent value="pasados">
    {/* Contenido pestaña Pasados */}
  </TabsContent>
</TabsSistema>
```

Props principales: los mismos de Radix `Tabs.Root`, `Tabs.List`, `Tabs.Trigger` y `Tabs.Content`.

### InputSistema
Input con iconos, labels, ARIA y manejo de errores integrado.

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
- `error?: string` - Mensaje de error (auto-genera `aria-describedby`)
- `label?: string` - Etiqueta del campo (auto-genera `htmlFor`)
- `min-h-[44px]` — Touch target WCAG
- Todas las props de `HTMLInputElement`

### SelectSistema
Select nativo con glassmorphism, dark mode y accesibilidad.

```tsx
<SelectSistema
  label="País"
  error={errors.pais?.message}
  required
>
  <option value="">Seleccionar...</option>
  <option value="VE">Venezuela</option>
</SelectSistema>
```

**Props:** Mismas que `InputSistema` + `children` para `<option>`.

### TextareaSistema
Textarea con glassmorphism, dark mode y auto-resize opcional.

```tsx
<TextareaSistema
  label="Notas"
  rows={4}
  placeholder="Escribe aquí..."
  error={errors.notas?.message}
/>
```

**Props:** Mismas que `InputSistema` + `rows?: number`.

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
- Animaciones específicas: `transition-colors`, `transition-opacity` (evitar `transition-all`)
- Lazy loading cuando sea apropiado

### Dark Mode
- **Nunca** usar `gray-*`, `bg-white`, o hexadecimales hardcoded
- **Siempre** usar tokens: `text-foreground`, `text-muted-foreground`, `bg-card`, `bg-muted`
- Charts (Recharts): usar `var(--border)`, `var(--foreground)` en tooltips y ejes

### Componentes Deprecados

| Componente | Reemplazo | Archivo |
|-----------|-----------|--------|
| `BotonGradiente` | `BotonSistema variante="primario"` | `boton-gradiente.tsx` |
| `CampoInputConIcono` | `InputSistema icono={...}` | `campo-input-con-icono.tsx` |
| `TarjetaEstadistica` | `TarjetaSistema` + `BadgeSistema` | `tarjeta-estadistica.tsx` |

> Estos componentes tienen `@deprecated` en su JSDoc. No usarlos en código nuevo.

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

## 🚀 Historial de Evolución

- [x] ~~Implementar tema oscuro~~ — ✅ Completado Fase 3 (Marzo 2026)
- [x] ~~Agregar más variantes~~ — ✅ `SelectSistema`, `TextareaSistema`, `BadgeSistema`
- [x] ~~Crear componentes de navegación~~ — ✅ `HeaderMovil` con títulos dinámicos + botón regreso
- [x] ~~Optimizar animaciones~~ — ✅ Purga de `transition-all`
- [x] ~~Purga global de anti-patterns~~ — ✅ 0 `gray-*`, 0 `bg-white`, 0 hex hardcoded

### Próximos Pasos
- [ ] Eliminar componentes `@deprecated` cuando no tengan consumidores
- [ ] Agregar más variantes de `BotonSistema` (gradient custom)
- [ ] Componente `TablaSistema` con sorting y paginación integrada

---

**Ubicación del código:** `/components/ui/sistema-diseno.tsx`
**Última actualización:** Marzo 2026
