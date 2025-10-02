"use client"

import { CheckCircle } from "lucide-react"
import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from '@/lib/supabase/client'
import {
  FondoAutenticacion,
  TarjetaSistema,
  InputSistema,
  BotonSistema,
  TituloSistema,
  TextoSistema,
} from "@/components/ui/sistema-diseno"

export default function ResetPasswordForm() {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState("")
  const [exito, setExito] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // Verificar si hay token en la URL
    const accessToken = searchParams?.get('access_token')
    const refreshToken = searchParams?.get('refresh_token')

    if (accessToken && refreshToken) {
      // Establecer la sesión
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      }).then(() => {
        // Limpiar los tokens de la URL por seguridad
        const url = new URL(window.location.href)
        url.searchParams.delete('access_token')
        url.searchParams.delete('refresh_token')
        window.history.replaceState({}, '', url.pathname + url.hash)
      })
    }
  }, [searchParams])

  const manejarSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setCargando(true)
    setError("")

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden")
      setCargando(false)
      return
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres")
      setCargando(false)
      return
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      })

      if (error) {
        setError(error.message)
      } else {
        setExito(true)
        setTimeout(() => {
          router.push('/dashboard')
        }, 2000)
      }
    } catch (err) {
      setError("Error al actualizar la contraseña")
    } finally {
      setCargando(false)
    }
  }

  if (exito) {
    return (
      <FondoAutenticacion>
        <TarjetaSistema variante="elevated" className="space-y-8 text-center">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </div>
          <div className="space-y-4">
            <TituloSistema nivel={1} className="text-green-800">
              ¡Contraseña Actualizada!
            </TituloSistema>
            <TextoSistema variante="sutil" tamaño="base">
              Tu contraseña ha sido cambiada exitosamente.
            </TextoSistema>
            <TextoSistema variante="muted" tamaño="sm">
              Serás redirigido al dashboard en unos segundos...
            </TextoSistema>
          </div>
        </TarjetaSistema>
      </FondoAutenticacion>
    )
  }

  return (
    <FondoAutenticacion>
      <TarjetaSistema variante="elevated" className="space-y-8">
        <div className="text-center space-y-2">
          <TituloSistema nivel={1} className="mb-2">
            Nueva Contraseña
          </TituloSistema>
          <TextoSistema variante="sutil" tamaño="base">
            Ingresa tu nueva contraseña
          </TextoSistema>
        </div>

        <form className="space-y-6" onSubmit={manejarSubmit}>
          <InputSistema
            label="Nueva Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Tu nueva contraseña"
            error={error}
            required
          />

          <InputSistema
            label="Confirmar Contraseña"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirma tu nueva contraseña"
            required
          />

          <BotonSistema
            type="submit"
            variante="primario"
            tamaño="lg"
            cargando={cargando}
            className="w-full"
            disabled={!password || !confirmPassword}
          >
            {cargando ? "Actualizando..." : "Actualizar Contraseña"}
          </BotonSistema>
        </form>
      </TarjetaSistema>
    </FondoAutenticacion>
  )
}
