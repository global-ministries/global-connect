"use client"

import { useState } from 'react'
import Image from 'next/image'
import { User } from 'lucide-react'

interface UserAvatarProps {
  photoUrl?: string | null
  nombre?: string
  apellido?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  className?: string
  showFallback?: boolean
}

export function UserAvatar({ 
  photoUrl, 
  nombre = '', 
  apellido = '', 
  size = 'md',
  className = '',
  showFallback = true
}: UserAvatarProps) {
  const [imageError, setImageError] = useState(false)

  // Configuraciones de tamaño
  const sizeConfig = {
    xs: { container: 'w-6 h-6', text: 'text-xs', icon: 'w-3 h-3' },
    sm: { container: 'w-8 h-8', text: 'text-sm', icon: 'w-4 h-4' },
    md: { container: 'w-10 h-10', text: 'text-base', icon: 'w-5 h-5' },
    lg: { container: 'w-12 h-12', text: 'text-lg', icon: 'w-6 h-6' },
    xl: { container: 'w-16 h-16', text: 'text-xl', icon: 'w-8 h-8' },
    '2xl': { container: 'w-20 h-20', text: 'text-2xl', icon: 'w-10 h-10' }
  }

  const config = sizeConfig[size]

  // Generar iniciales
  const getInitials = (nombre: string, apellido: string): string => {
    const firstInitial = nombre.charAt(0).toUpperCase()
    const lastInitial = apellido.charAt(0).toUpperCase()
    return firstInitial + lastInitial || '??'
  }

  // Generar color de fondo basado en el nombre
  const getBackgroundColor = (nombre: string, apellido: string): string => {
    const colors = [
      'bg-red-500',
      'bg-blue-500',
      'bg-green-500',
      'bg-yellow-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-teal-500',
      'bg-orange-500',
      'bg-cyan-500'
    ]
    
    const nameString = (nombre + apellido).toLowerCase()
    const hash = nameString.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc)
    }, 0)
    
    return colors[Math.abs(hash) % colors.length]
  }

  const initials = getInitials(nombre, apellido)
  const bgColor = getBackgroundColor(nombre, apellido)

  // Si hay foto y no hay error, mostrar imagen
  if (photoUrl && !imageError) {
    return (
      <div className={`${config.container} rounded-full overflow-hidden bg-gray-200 flex-shrink-0 ${className}`}>
        <Image
          src={photoUrl}
          alt={`${nombre} ${apellido}`.trim() || 'Foto de perfil'}
          width={parseInt(config.container.split('w-')[1]?.split(' ')[0] || '40') * 4}
          height={parseInt(config.container.split('h-')[1]?.split(' ')[0] || '40') * 4}
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
          priority={size === 'lg' || size === 'xl' || size === '2xl'}
        />
      </div>
    )
  }

  // Si no hay foto o hay error, mostrar fallback
  if (showFallback) {
    // Si hay nombre, mostrar iniciales con color
    if (nombre || apellido) {
      return (
        <div className={`${config.container} rounded-full ${bgColor} flex items-center justify-center text-white font-semibold flex-shrink-0 ${className}`}>
          <span className={config.text}>{initials}</span>
        </div>
      )
    }

    // Si no hay nombre, mostrar icono genérico
    return (
      <div className={`${config.container} rounded-full bg-gray-400 flex items-center justify-center text-white flex-shrink-0 ${className}`}>
        <User className={config.icon} />
      </div>
    )
  }

  // Si showFallback es false y no hay foto, no mostrar nada
  return null
}

// Componente específico para mostrar avatar con información del usuario
interface UserAvatarWithInfoProps extends UserAvatarProps {
  email?: string
  showInfo?: boolean
  infoPosition?: 'right' | 'bottom'
}

export function UserAvatarWithInfo({
  photoUrl,
  nombre = '',
  apellido = '',
  email,
  size = 'md',
  className = '',
  showInfo = true,
  infoPosition = 'right',
  ...props
}: UserAvatarWithInfoProps) {
  const fullName = `${nombre} ${apellido}`.trim()

  if (!showInfo) {
    return (
      <UserAvatar
        photoUrl={photoUrl}
        nombre={nombre}
        apellido={apellido}
        size={size}
        className={className}
        {...props}
      />
    )
  }

  const containerClass = infoPosition === 'right' 
    ? 'flex items-center gap-3' 
    : 'flex flex-col items-center gap-2'

  const textAlignClass = infoPosition === 'right' 
    ? 'text-left' 
    : 'text-center'

  return (
    <div className={`${containerClass} ${className}`}>
      <UserAvatar
        photoUrl={photoUrl}
        nombre={nombre}
        apellido={apellido}
        size={size}
        {...props}
      />
      
      {showInfo && (
        <div className={`flex-1 min-w-0 ${textAlignClass}`}>
          {fullName && (
            <p className="text-sm font-medium text-gray-900 truncate">
              {fullName}
            </p>
          )}
          {email && (
            <p className="text-xs text-gray-500 truncate">
              {email}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Hook para obtener URL de avatar con fallback
export function useAvatarUrl(photoUrl?: string | null): string | null {
  const [imageError, setImageError] = useState(false)
  
  if (photoUrl && !imageError) {
    return photoUrl
  }
  
  return null
}
