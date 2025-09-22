"use client"

import { BotonSistema } from "@/components/ui/sistema-diseno"

export function ClearAuthCookies() {
  const limpiarCookies = () => {
    // Limpiar todas las cookies relacionadas con Supabase
    const cookiesToClear = [
      'sb-access-token',
      'sb-refresh-token', 
      'supabase-auth-token',
      'sb-localhost-auth-token',
      'sb-127.0.0.1-auth-token'
    ]

    // Limpiar cookies específicas
    cookiesToClear.forEach(cookieName => {
      document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
      document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=localhost;`
      document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=127.0.0.1;`
    })

    // Limpiar todas las cookies que empiecen con 'sb-'
    document.cookie.split(';').forEach(cookie => {
      const cookieName = cookie.split('=')[0].trim()
      if (cookieName.startsWith('sb-') || cookieName.includes('supabase')) {
        document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
        document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=localhost;`
        document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=127.0.0.1;`
      }
    })

    // Limpiar localStorage también
    Object.keys(localStorage).forEach(key => {
      if (key.includes('supabase') || key.includes('sb-')) {
        localStorage.removeItem(key)
      }
    })

    // Limpiar sessionStorage
    Object.keys(sessionStorage).forEach(key => {
      if (key.includes('supabase') || key.includes('sb-')) {
        sessionStorage.removeItem(key)
      }
    })

    alert('Cookies de autenticación limpiadas. Recarga la página.')
    window.location.reload()
  }

  return (
    <BotonSistema
      variante="outline"
      tamaño="sm"
      onClick={limpiarCookies}
      className="text-xs"
    >
      Limpiar Cookies de Auth
    </BotonSistema>
  )
}
