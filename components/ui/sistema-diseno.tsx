import React from 'react'
import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

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

// Componente de Input moderno y coherente
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icono?: LucideIcon
  error?: string
  label?: string
}

export const InputSistema = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, icono: Icono, error, label, ...props }, ref) => {
    return (
      <div className="space-y-2">
        {label && (
          <label className="block text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <div className="relative">
          {Icono && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Icono className="h-5 w-5 text-gray-400" />
            </div>
          )}
          <input
            type={type}
            className={cn(
              "block w-full py-3 px-3 border border-gray-200 rounded-lg bg-white",
              "focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500",
              "transition-all duration-200 text-gray-900 placeholder-gray-400",
              "disabled:bg-gray-50 disabled:text-gray-500",
              Icono && "pl-10",
              error && "border-red-300 focus:border-red-500 focus:ring-red-500/20",
              className
            )}
            ref={ref}
            {...props}
          />
        </div>
        {error && (
          <p className="text-red-500 text-sm mt-1">{error}</p>
        )}
      </div>
    )
  }
)
InputSistema.displayName = "InputSistema"

// Botón principal del sistema
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
    const baseClasses = "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2"
    
    const variantes = {
      primario: "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg hover:shadow-xl focus:ring-orange-500",
      secundario: "bg-gray-600 hover:bg-gray-700 text-white shadow-lg hover:shadow-xl focus:ring-gray-500",
      outline: "border-2 border-gray-300 hover:border-gray-400 text-gray-700 hover:bg-gray-50 focus:ring-gray-500",
      ghost: "text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:ring-gray-500"
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

// Tarjeta del sistema con glassmorphism
interface TarjetaSistemaProps extends React.HTMLAttributes<HTMLDivElement> {
  variante?: 'default' | 'elevated' | 'outlined'
}

export const TarjetaSistema = React.forwardRef<HTMLDivElement, TarjetaSistemaProps>(
  ({ className, variante = 'default', ...props }, ref) => {
    const variantes = {
      default: "backdrop-blur-2xl bg-white/80 border border-white/50 shadow-xl",
      elevated: "backdrop-blur-2xl bg-white/90 border border-white/60 shadow-2xl",
      outlined: "bg-white border border-gray-200 shadow-lg"
    }

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-2xl p-6",
          variantes[variante],
          className
        )}
        {...props}
      />
    )
  }
)
TarjetaSistema.displayName = "TarjetaSistema"

// Fondo con orbes para páginas de autenticación
export const FondoAutenticacion = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-gray-50 to-white relative overflow-hidden flex items-center justify-center p-4">
      {/* Orbes flotantes optimizados */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-32 h-32 bg-gradient-to-br from-orange-300/20 to-orange-400/20 rounded-full blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-32 w-24 h-24 bg-gradient-to-br from-gray-300/15 to-orange-300/15 rounded-full blur-lg animate-bounce" style={{animationDuration: '3s'}}></div>
        <div className="absolute bottom-32 left-32 w-40 h-40 bg-gradient-to-br from-orange-200/10 to-gray-200/10 rounded-full blur-2xl animate-pulse" style={{animationDelay: '1s'}}></div>
        <div className="absolute bottom-20 right-20 w-28 h-28 bg-gradient-to-br from-orange-400/20 to-orange-300/20 rounded-full blur-xl animate-bounce" style={{animationDuration: '4s', animationDelay: '0.5s'}}></div>
      </div>
      
      <div className="relative z-10 w-full max-w-md">
        {children}
      </div>
    </div>
  )
}

// Enlace del sistema
interface EnlaceSistemaProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  variante?: 'default' | 'marca' | 'sutil'
}

export const EnlaceSistema = React.forwardRef<HTMLAnchorElement, EnlaceSistemaProps>(
  ({ className, variante = 'default', ...props }, ref) => {
    const variantes = {
      default: "text-gray-600 hover:text-gray-900 transition-colors duration-200",
      marca: "text-orange-600 hover:text-orange-800 font-medium transition-colors duration-200",
      sutil: "text-gray-500 hover:text-gray-700 text-sm transition-colors duration-200"
    }

    return (
      <a
        ref={ref}
        className={cn(variantes[variante], className)}
        {...props}
      />
    )
  }
)
EnlaceSistema.displayName = "EnlaceSistema"

// Título del sistema
interface TituloSistemaProps extends React.HTMLAttributes<HTMLHeadingElement> {
  nivel?: 1 | 2 | 3 | 4
  variante?: 'default' | 'sutil'
}

export const TituloSistema = React.forwardRef<HTMLHeadingElement, TituloSistemaProps>(
  ({ className, nivel = 1, variante = 'default', children, ...props }, ref) => {
    const Component = `h${nivel}` as keyof JSX.IntrinsicElements
    
    const estilos = {
      1: "text-2xl sm:text-3xl font-bold",
      2: "text-xl sm:text-2xl font-semibold",
      3: "text-lg sm:text-xl font-semibold",
      4: "text-base sm:text-lg font-medium"
    }
    
    const variantes = {
      default: "text-gray-800",
      sutil: "text-gray-600"
    }

    return React.createElement(
      Component,
      {
        ref,
        className: cn(estilos[nivel], variantes[variante], className),
        ...props
      },
      children
    )
  }
)
TituloSistema.displayName = "TituloSistema"

// Texto del sistema
interface TextoSistemaProps extends React.HTMLAttributes<HTMLParagraphElement> {
  variante?: 'default' | 'sutil' | 'muted'
  tamaño?: 'sm' | 'base' | 'lg'
}

export const TextoSistema = React.forwardRef<HTMLParagraphElement, TextoSistemaProps>(
  ({ className, variante = 'default', tamaño = 'base', ...props }, ref) => {
    const variantes = {
      default: "text-gray-700",
      sutil: "text-gray-600", 
      muted: "text-gray-500"
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
