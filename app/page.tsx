"use client"

import { Lock, Mail, Eye, EyeOff } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { login } from "@/lib/actions/auth.actions"
import {
  FondoAutenticacion,
  TarjetaSistema,
  InputSistema,
  BotonSistema,
  TituloSistema,
  TextoSistema,
  EnlaceSistema
} from "@/components/ui/sistema-diseno"

export default function PaginaLogin() {
  const [mostrarContrasena, setMostrarContrasena] = useState(false)
  const [email, setEmail] = useState("")
  const [contrasena, setContrasena] = useState("")
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState("")

  const manejarSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setCargando(true)
    setError("")
    
    try {
      const result = await login(new FormData(e.currentTarget))
      if (result?.error) {
        setError(result.error)
      }
    } catch (err) {
      setError("Error al iniciar sesión. Inténtalo de nuevo.")
    } finally {
      setCargando(false)
    }
  }

  return (
    <FondoAutenticacion>
      <TarjetaSistema variante="elevated" className="space-y-8">
        {/* Encabezado */}
        <div className="text-center space-y-2">
          <TituloSistema nivel={1} className="mb-2">
            Bienvenido
          </TituloSistema>
          <TextoSistema variante="sutil" tamaño="base">
            Accede a tu cuenta de Global Connect
          </TextoSistema>
        </div>

        {/* Formulario de Login */}
        <form className="space-y-6" onSubmit={manejarSubmit}>
          {/* Campo Email */}
          <InputSistema
            label="Correo electrónico"
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            icono={Mail}
            required
          />

          {/* Campo Contraseña */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Contraseña
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-400" />
              </div>
              <input
                name="password"
                type={mostrarContrasena ? "text" : "password"}
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                placeholder="Ingresa tu contraseña"
                className="block w-full py-3 pl-10 pr-12 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all duration-200 text-gray-900 placeholder-gray-400"
                required
              />
              <button
                type="button"
                onClick={() => setMostrarContrasena(!mostrarContrasena)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                {mostrarContrasena ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Mensaje de error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <TextoSistema variante="default" tamaño="sm" className="text-red-700">
                {error}
              </TextoSistema>
            </div>
          )}

          {/* Botón de Login */}
          <BotonSistema
            type="submit"
            variante="primario"
            tamaño="lg"
            cargando={cargando}
            className="w-full"
            disabled={!email || !contrasena}
          >
            {cargando ? "Iniciando sesión..." : "Iniciar sesión"}
          </BotonSistema>

          {/* Enlaces */}
          <div className="space-y-4">
            <div className="text-center">
              <Link href="/reset-password">
                <EnlaceSistema variante="default" className="text-sm">
                  ¿Olvidaste tu contraseña?
                </EnlaceSistema>
              </Link>
            </div>

            <div className="text-center">
              <TextoSistema variante="sutil" tamaño="sm" className="inline">
                ¿No tienes cuenta?{" "}
              </TextoSistema>
              <Link href="/signup">
                <EnlaceSistema variante="marca" className="text-sm">
                  Crear cuenta
                </EnlaceSistema>
              </Link>
            </div>
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