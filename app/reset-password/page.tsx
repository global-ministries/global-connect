"use client"

import { Mail, ArrowLeft, CheckCircle } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { supabase } from '@/lib/supabase/client'
import {
  FondoAutenticacion,
  TarjetaSistema,
  InputSistema,
  BotonSistema,
  TituloSistema,
  TextoSistema,
  EnlaceSistema
} from "@/components/ui/sistema-diseno"

export default function PaginaRestablecerContraseña() {
  const [email, setEmail] = useState("")
  const [cargando, setCargando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState("")

  const manejarSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setCargando(true)
    setError("")
    
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset-password`
      })

      if (error) {
        setError(error.message)
      } else {
        setEnviado(true)
      }
    } catch (err) {
      setError("Error al enviar las instrucciones. Inténtalo de nuevo.")
    } finally {
      setCargando(false)
    }
  }

  if (enviado) {
    return (
      <FondoAutenticacion>
        <TarjetaSistema variante="elevated" className="space-y-8 text-center">
          {/* Icono de éxito */}
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </div>

          {/* Mensaje de éxito */}
          <div className="space-y-4">
            <TituloSistema nivel={1} className="text-green-800">
              ¡Correo Enviado!
            </TituloSistema>
            <TextoSistema variante="sutil" tamaño="base">
              Hemos enviado las instrucciones para restablecer tu contraseña a{" "}
              <span className="font-medium text-gray-800">{email}</span>
            </TextoSistema>
            <TextoSistema variante="muted" tamaño="sm">
              Revisa tu bandeja de entrada y sigue las instrucciones del correo.
              Si no lo encuentras, verifica tu carpeta de spam.
            </TextoSistema>
          </div>

          {/* Botón para volver */}
          <Link href="/">
            <BotonSistema variante="primario" tamaño="lg" className="w-full">
              Volver al Login
            </BotonSistema>
          </Link>
        </TarjetaSistema>

        {/* Pie de página */}
        <div className="text-center mt-8">
          <TextoSistema variante="muted" tamaño="sm">
            © 2025 Global Barquisimeto. Todos los derechos reservados.
          </TextoSistema>
        </div>
      </FondoAutenticacion>
    )
  }

  return (
    <FondoAutenticacion>
      <TarjetaSistema variante="elevated" className="space-y-8">
        {/* Encabezado */}
        <div className="text-center space-y-2">
          <TituloSistema nivel={1} className="mb-2">
            Restablecer Contraseña
          </TituloSistema>
          <TextoSistema variante="sutil" tamaño="base">
            Ingresa tu correo electrónico y te enviaremos las instrucciones
          </TextoSistema>
        </div>

        {/* Formulario */}
        <form className="space-y-6" onSubmit={manejarSubmit}>
          {/* Campo Email */}
          <InputSistema
            label="Correo electrónico"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            icono={Mail}
            error={error}
            required
          />

          {/* Botón de Enviar */}
          <BotonSistema
            type="submit"
            variante="primario"
            tamaño="lg"
            cargando={cargando}
            className="w-full"
            disabled={!email}
          >
            {cargando ? "Enviando..." : "Enviar Instrucciones"}
          </BotonSistema>

          {/* Enlace para volver */}
          <div className="text-center">
            <Link href="/">
              <EnlaceSistema variante="default" className="inline-flex items-center gap-2 text-sm" comoSpan>
                <ArrowLeft className="w-4 h-4" />
                Volver al Login
              </EnlaceSistema>
            </Link>
          </div>
        </form>
      </TarjetaSistema>

      {/* Pie de página */}
      <div className="text-center mt-8">
        <TextoSistema variante="muted" tamaño="sm">
          © 2025 Global Barquisimeto. Todos los derechos reservados.
        </TextoSistema>
      </div>
    </FondoAutenticacion>
  )
}