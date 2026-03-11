import React, { useId } from 'react'
import { cn } from '@/lib/utils'
import { LucideIcon, ArrowLeft, ChevronDown } from 'lucide-react'
import Link from 'next/link'

// Lazy load DesktopHeader (client component) to keep this file server-compatible
const DesktopHeader = React.lazy(() => import('./desktop-header').then(m => ({ default: m.DesktopHeader })))

// Colores de marca definidos
export const coloresMarca = {
  grisOscuro: '#363D45',
  naranja: '#E96C20',
  negro: '#000000',
  blanco: '#FFFFFF',
  grisClaro: '#F8F9FA',
  grisTexto: '#6B7280',
  grisTextoClaro: '#9CA3AF',
  error: '#EF4444',
  exito: '#10B981',
  advertencia: '#F59E0B',
}

// ─── Input del Sistema ───
/**
 * Input accesible del design system con soporte para iconos, errores y labels.
 *
 * Incluye min-h-[44px] para touch targets (WCAG), aria-describedby para errores,
 * aria-invalid cuando hay error, y asociación automática label+input vía id generado.
 */
interface InputSistemaProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Icono de Lucide que se muestra a la izquierda del input */
  icono?: LucideIcon
  /** Mensaje de error que se muestra debajo del input */
  error?: string
  /** Etiqueta visible del input */
  label?: string
}

export const InputSistema = React.forwardRef<HTMLInputElement, InputSistemaProps>(
  ({ className, type, icono: Icono, error, label, id: idProp, ...props }, ref) => {
    const idGenerado = useId()
    const id = idProp ?? idGenerado
    const idError = `${id}-error`

    return (
      <div className="space-y-2">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <div className="relative">
          {Icono && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Icono className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <input
            id={id}
            type={type}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? idError : undefined}
            className={cn(
              "block w-full min-h-[44px] py-3 px-3 border border-border rounded-xl bg-card/50",
              "focus:ring-2 focus:ring-[var(--brand-primary)]/20 focus:border-[var(--brand-primary)] focus:outline-none",
              "transition-[border-color,box-shadow] duration-200 ease-expo text-foreground placeholder:text-muted-foreground",
              "disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed",
              Icono && "pl-10",
              error && "border-red-300 dark:border-red-500/50 focus:border-red-500 focus:ring-red-500/20",
              className
            )}
            ref={ref}
            {...props}
          />
        </div>
        {error && (
          <p id={idError} role="alert" className="text-red-500 dark:text-red-400 text-sm mt-1">
            {error}
          </p>
        )}
      </div>
    )
  }
)
InputSistema.displayName = "InputSistema"

// ─── Select del Sistema ───
/**
 * Select accesible del design system con estilos glass y dark mode nativo.
 *
 * Wrapper sobre <select> nativo con los mismos patrones de InputSistema:
 * min-h-[44px], focus-ring, aria-describedby para errores.
 */
interface OpcionSelect {
  /** Valor interno de la opción */
  valor: string
  /** Texto visible de la opción */
  etiqueta: string
}

interface SelectSistemaProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> {
  /** Etiqueta visible del select */
  label?: string
  /** Mensaje de error que se muestra debajo del select */
  error?: string
  /** Lista de opciones */
  opciones: OpcionSelect[]
  /** Texto placeholder cuando no hay selección */
  placeholder?: string
  /** Valor seleccionado */
  value?: string
  /** Callback cuando cambia la selección */
  onValueChange?: (valor: string) => void
  /** onChange nativo para react-hook-form Controller */
  onChange?: React.ChangeEventHandler<HTMLSelectElement>
}

export const SelectSistema = React.forwardRef<HTMLSelectElement, SelectSistemaProps>(
  ({ className, label, error, opciones, placeholder, value, onValueChange, onChange, id: idProp, ...props }, ref) => {
    const idGenerado = useId()
    const id = idProp ?? idGenerado
    const idError = `${id}-error`

    const handleChange: React.ChangeEventHandler<HTMLSelectElement> = (e) => {
      onChange?.(e)
      onValueChange?.(e.target.value)
    }

    return (
      <div className="space-y-2">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            id={id}
            ref={ref}
            value={value}
            onChange={handleChange}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? idError : undefined}
            className={cn(
              "block w-full min-h-[44px] py-3 px-3 pr-10 border border-border rounded-xl bg-card/50",
              "focus:ring-2 focus:ring-[var(--brand-primary)]/20 focus:border-[var(--brand-primary)] focus:outline-none",
              "transition-[border-color,box-shadow] duration-200 ease-expo text-foreground",
              "disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed",
              "appearance-none cursor-pointer",
              error && "border-red-300 dark:border-red-500/50 focus:border-red-500 focus:ring-red-500/20",
              !value && "text-muted-foreground",
              className
            )}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {opciones.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
          {/* Icono chevron personalizado */}
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
        {error && (
          <p id={idError} role="alert" className="text-red-500 dark:text-red-400 text-sm mt-1">
            {error}
          </p>
        )}
      </div>
    )
  }
)
SelectSistema.displayName = "SelectSistema"

// ─── Textarea del Sistema ───
/**
 * Textarea accesible del design system con mismos patrones que InputSistema.
 *
 * Soporta rows configurables y auto-resize opcional.
 */
interface TextareaSistemaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Etiqueta visible del textarea */
  label?: string
  /** Mensaje de error que se muestra debajo */
  error?: string
  /** Número de filas visibles (por defecto 3) */
  filas?: number
}

export const TextareaSistema = React.forwardRef<HTMLTextAreaElement, TextareaSistemaProps>(
  ({ className, label, error, filas = 3, id: idProp, ...props }, ref) => {
    const idGenerado = useId()
    const id = idProp ?? idGenerado
    const idError = `${id}-error`

    return (
      <div className="space-y-2">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <textarea
          id={id}
          ref={ref}
          rows={filas}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? idError : undefined}
          className={cn(
            "block w-full min-h-[44px] py-3 px-3 border border-border rounded-xl bg-card/50",
            "focus:ring-2 focus:ring-[var(--brand-primary)]/20 focus:border-[var(--brand-primary)] focus:outline-none",
            "transition-[border-color,box-shadow] duration-200 ease-expo text-foreground placeholder:text-muted-foreground",
            "disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed",
            "resize-y",
            error && "border-red-300 dark:border-red-500/50 focus:border-red-500 focus:ring-red-500/20",
            className
          )}
          {...props}
        />
        {error && (
          <p id={idError} role="alert" className="text-red-500 dark:text-red-400 text-sm mt-1">
            {error}
          </p>
        )}
      </div>
    )
  }
)
TextareaSistema.displayName = "TextareaSistema"

// ─── Botón del Sistema ───
interface BotonSistemaProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: 'primario' | 'secundario' | 'outline' | 'ghost'
  tamaño?: 'sm' | 'md' | 'lg'
  cargando?: boolean
  icono?: LucideIcon
  iconoPosicion?: 'izquierda' | 'derecha'
}

export const BotonSistema = React.forwardRef<HTMLButtonElement, BotonSistemaProps>(
  ({
    className,
    variante = 'primario',
    tamaño = 'md',
    cargando = false,
    icono: Icono,
    iconoPosicion = 'izquierda',
    children,
    disabled,
    ...props
  }, ref) => {
    const baseClasses = "inline-flex items-center justify-center font-medium rounded-xl transition-[background-color,box-shadow,transform] duration-200 ease-expo focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background press-scale touch-manipulation min-h-[44px]"

    const variantes = {
      primario: "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg hover:shadow-xl focus:ring-orange-500",
      secundario: "bg-secondary hover:bg-secondary/80 text-secondary-foreground shadow-lg hover:shadow-xl focus:ring-secondary",
      outline: "border-2 border-border hover:border-border/80 text-foreground hover:bg-accent focus:ring-ring",
      ghost: "text-muted-foreground hover:text-foreground hover:bg-accent focus:ring-ring"
    }

    const tamaños = {
      sm: "px-3 py-2 text-sm gap-2",
      md: "px-4 py-3 text-base gap-2",
      lg: "px-6 py-4 text-lg gap-3"
    }

    return (
      <button
        className={cn(
          baseClasses,
          variantes[variante],
          tamaños[tamaño],
          (disabled || cargando) && "opacity-50 cursor-not-allowed",
          className
        )}
        disabled={disabled || cargando}
        ref={ref}
        {...props}
      >
        {cargando ? (
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        ) : (
          Icono && iconoPosicion === 'izquierda' && <Icono className="h-5 w-5" />
        )}
        {children}
        {!cargando && Icono && iconoPosicion === 'derecha' && <Icono className="h-5 w-5" />}
      </button>
    )
  }
)
BotonSistema.displayName = "BotonSistema"

// ─── Tarjeta Liquid Glass ───
interface TarjetaSistemaProps extends React.HTMLAttributes<HTMLDivElement> {
  variante?: 'default' | 'elevated' | 'outlined'
}

export const TarjetaSistema = React.forwardRef<HTMLDivElement, TarjetaSistemaProps>(
  ({ className, variante = 'default', ...props }, ref) => {
    const variantes = {
      default: "glass-panel",
      elevated: "glass-panel-elevated",
      outlined: "bg-card border border-border shadow-lg"
    }

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-2xl p-6 transition-shadow duration-300",
          variantes[variante],
          className
        )}
        {...props}
      />
    )
  }
)
TarjetaSistema.displayName = "TarjetaSistema"

// ─── Fondo Autenticación ───
export const FondoAutenticacion = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--surface-primary)] via-[var(--surface-secondary)] to-[var(--surface-primary)] relative overflow-hidden">
      {/* Orbes flotantes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-32 h-32 bg-gradient-to-br from-orange-300/20 to-orange-400/20 rounded-full blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-32 w-24 h-24 bg-gradient-to-br from-orange-200/10 to-orange-300/10 rounded-full blur-lg animate-bounce" style={{ animationDuration: '3s' }}></div>
        <div className="absolute bottom-32 left-32 w-40 h-40 bg-gradient-to-br from-orange-200/10 to-orange-100/10 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute bottom-20 right-20 w-28 h-28 bg-gradient-to-br from-orange-400/15 to-orange-300/15 rounded-full blur-xl animate-bounce" style={{ animationDuration: '4s', animationDelay: '0.5s' }}></div>
      </div>

      {/* Contenedor responsive */}
      <div className="relative z-10 flex items-center justify-center min-h-screen p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md sm:max-w-lg">
          {children}
        </div>
      </div>
    </div>
  )
}

// ─── Enlace del Sistema ───
interface EnlaceSistemaProps extends React.HTMLAttributes<HTMLElement> {
  variante?: 'default' | 'marca' | 'sutil'
  comoSpan?: boolean
  href?: string
}

export const EnlaceSistema = React.forwardRef<HTMLElement, EnlaceSistemaProps>(
  ({ className, variante = 'default', comoSpan = false, href, ...props }, ref) => {
    const variantes = {
      default: "text-muted-foreground hover:text-foreground transition-colors duration-200",
      marca: "text-[var(--brand-primary)] hover:text-[var(--brand-primary)]/80 font-medium transition-colors duration-200",
      sutil: "text-muted-foreground hover:text-foreground text-sm transition-colors duration-200"
    }

    const clases = cn(variantes[variante], className)

    if (comoSpan) {
      return (
        <span
          ref={ref as React.Ref<HTMLSpanElement>}
          className={clases}
          {...props}
        />
      )
    }

    return (
      <a
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={href}
        className={clases}
        {...props}
      />
    )
  }
)
EnlaceSistema.displayName = "EnlaceSistema"

// ─── Título del Sistema ───
interface TituloSistemaProps extends React.HTMLAttributes<HTMLHeadingElement> {
  nivel?: 1 | 2 | 3 | 4
  variante?: 'default' | 'sutil'
}

export const TituloSistema = React.forwardRef<HTMLHeadingElement, TituloSistemaProps>(
  ({ className, nivel = 1, variante = 'default', children, ...props }, ref) => {
    const estilos = {
      1: "text-xl sm:text-2xl font-semibold tracking-tight",
      2: "text-lg sm:text-xl font-semibold tracking-tight",
      3: "text-base sm:text-lg font-semibold",
      4: "text-sm sm:text-base font-medium"
    }

    const variantes = {
      default: "text-foreground",
      sutil: "text-muted-foreground"
    }

    const clases = cn(estilos[nivel], variantes[variante], className)

    if (nivel === 1) {
      return <h1 ref={ref} className={clases} {...props}>{children}</h1>
    } else if (nivel === 2) {
      return <h2 ref={ref} className={clases} {...props}>{children}</h2>
    } else if (nivel === 3) {
      return <h3 ref={ref} className={clases} {...props}>{children}</h3>
    } else {
      return <h4 ref={ref} className={clases} {...props}>{children}</h4>
    }
  }
)
TituloSistema.displayName = "TituloSistema"

// ─── Texto del Sistema ───
interface TextoSistemaProps extends React.HTMLAttributes<HTMLParagraphElement> {
  variante?: 'default' | 'sutil' | 'muted'
  tamaño?: 'sm' | 'base' | 'lg'
}

export const TextoSistema = React.forwardRef<HTMLParagraphElement, TextoSistemaProps>(
  ({ className, variante = 'default', tamaño = 'base', ...props }, ref) => {
    const variantes = {
      default: "text-foreground",
      sutil: "text-muted-foreground",
      muted: "text-muted-foreground/80"
    }

    const tamaños = {
      sm: "text-sm",
      base: "text-base",
      lg: "text-lg"
    }

    return (
      <p
        ref={ref}
        className={cn(variantes[variante], tamaños[tamaño], className)}
        {...props}
      />
    )
  }
)
TextoSistema.displayName = "TextoSistema"

// ─── Contenedor Principal ───
interface ContenedorPrincipalProps extends React.HTMLAttributes<HTMLDivElement> {
  titulo?: string
  descripcion?: string
  accionPrincipal?: React.ReactNode
}

export const ContenedorPrincipal = React.forwardRef<HTMLDivElement, ContenedorPrincipalProps>(
  ({ className, titulo, descripcion, accionPrincipal, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "min-h-full bg-[var(--surface-primary)] p-4 sm:p-6 lg:p-8",
          className
        )}
        {...props}
      >
        {(titulo || descripcion || accionPrincipal) && (
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                {titulo && (
                  <TituloSistema nivel={1}>
                    {titulo}
                  </TituloSistema>
                )}
                {descripcion && (
                  <TextoSistema variante="sutil" tamaño="base">
                    {descripcion}
                  </TextoSistema>
                )}
              </div>
              {accionPrincipal && (
                <div className="flex-shrink-0">
                  {accionPrincipal}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-6">
          {children}
        </div>
      </div>
    )
  }
)
ContenedorPrincipal.displayName = "ContenedorPrincipal"

// ─── Contenedor Dashboard ───
interface ContenedorDashboardProps extends React.HTMLAttributes<HTMLDivElement> {
  titulo?: string
  /** @deprecated No longer rendered in desktop header */
  descripcion?: string
  /** @deprecated No longer rendered in desktop header */
  subtitulo?: string
  accionPrincipal?: React.ReactNode
  breadcrumbs?: React.ReactNode
  botonRegreso?: {
    href: string
    texto: string
  }
}

export const ContenedorDashboard = React.forwardRef<HTMLDivElement, ContenedorDashboardProps>(
  ({ className, titulo, descripcion: _d, subtitulo: _s, accionPrincipal, breadcrumbs, botonRegreso, children, ...props }, ref) => {

    return (
      <div
        ref={ref}
        className={cn(
          "flex-1 bg-[var(--surface-primary)]",
          className
        )}
        {...props}
      >
        {/* Desktop header — client component with scroll-shrink + user profile */}
        <React.Suspense fallback={
          <div className="hidden md:block sticky top-0 z-10 glass-panel border-b border-[var(--glass-border)] px-6 lg:px-12 py-3">
            <div className="h-7" />
          </div>
        }>
          <DesktopHeader
            titulo={titulo}
            accionPrincipal={accionPrincipal}
            breadcrumbs={breadcrumbs}
            botonRegreso={botonRegreso}
          />
        </React.Suspense>

        {/* Contenido scrolleable */}
        <div className="p-4 sm:p-6 lg:px-12 lg:py-8">
          <div className="space-y-6">
            {children}
          </div>
        </div>
      </div>
    )
  }
)
ContenedorDashboard.displayName = "ContenedorDashboard"

// ─── Badge del Sistema ───
interface BadgeSistemaProps extends React.HTMLAttributes<HTMLSpanElement> {
  variante?: 'default' | 'success' | 'warning' | 'error' | 'info'
  tamaño?: 'sm' | 'md' | 'lg'
}

export const BadgeSistema = React.forwardRef<HTMLSpanElement, BadgeSistemaProps>(
  ({ className, variante = 'default', tamaño = 'md', ...props }, ref) => {
    const variantes = {
      default: "bg-muted text-muted-foreground border-border",
      success: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
      warning: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
      error: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
      info: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
    }

    const tamaños = {
      sm: "px-2 py-1 text-xs",
      md: "px-3 py-1 text-sm",
      lg: "px-4 py-2 text-base"
    }

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center font-medium rounded-full border",
          variantes[variante],
          tamaños[tamaño],
          className
        )}
        {...props}
      />
    )
  }
)
BadgeSistema.displayName = "BadgeSistema"

// ─── Separador ───
export const SeparadorSistema = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("shrink-0 bg-border h-[1px] w-full", className)}
    {...props}
  />
))
SeparadorSistema.displayName = "SeparadorSistema"

// ─── Skeleton ───
interface SkeletonSistemaProps extends React.HTMLAttributes<HTMLDivElement> {
  ancho?: string
  alto?: string
  redondo?: boolean
}

export const SkeletonSistema = React.forwardRef<HTMLDivElement, SkeletonSistemaProps>(
  ({ className, ancho = "100%", alto = "1rem", redondo = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "animate-pulse bg-muted",
          redondo ? "rounded-full" : "rounded-md",
          className
        )}
        style={{ width: ancho, height: alto }}
        {...props}
      />
    )
  }
)
SkeletonSistema.displayName = "SkeletonSistema"
