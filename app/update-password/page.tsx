"use client"

import { Globe, Eye, EyeOff, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

// Esquema de validación Zod
const schema = z.object({
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  confirmPassword: z.string().min(8, "Confirma tu contraseña"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
})

type FormData = z.infer<typeof schema>

export default function PaginaActualizarContraseña() {
  const [mostrarContraseña, setMostrarContraseña] = useState(false)
  const [mostrarConfirmarContraseña, setMostrarConfirmarContraseña] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [formMessage, setFormMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setIsLoading(true)
    setFormMessage(null)
    // @ts-ignore
    const response = await import("@/lib/actions/auth.actions").then(mod => mod.updatePassword(data.password))
    if (response?.error) {
      setFormMessage({ type: "error", text: response.error })
    }
    setIsLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-gray-50 to-white relative overflow-hidden flex items-center justify-center p-4">
      {/* Orbes flotantes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-32 h-32 bg-gradient-to-br from-orange-300/30 to-orange-400/30 rounded-full blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-32 w-24 h-24 bg-gradient-to-br from-gray-300/25 to-orange-300/25 rounded-full blur-lg animate-bounce" style={{animationDuration: '3s'}}></div>
        <div className="absolute bottom-32 left-32 w-40 h-40 bg-gradient-to-br from-orange-200/20 to-gray-200/20 rounded-full blur-2xl animate-pulse" style={{animationDelay: '1s'}}></div>
        <div className="absolute bottom-20 right-20 w-28 h-28 bg-gradient-to-br from-orange-400/30 to-orange-300/30 rounded-full blur-xl animate-bounce" style={{animationDuration: '4s', animationDelay: '0.5s'}}></div>
      </div>
      
      {/* Contenido */}
      <div className="relative z-10 w-full max-w-md">
        {/* Tarjeta Principal */}
        <div className="backdrop-blur-2xl bg-white/30 border border-white/50 rounded-3xl p-6 sm:p-8 shadow-2xl">
          {/* Logo de Global Connect */}
          <div className="flex justify-center mb-6">
            <img 
              src="/logo.png" 
              alt="Global Connect" 
              className="h-14 w-auto sm:h-16 sm:w-auto max-w-[220px] sm:max-w-[280px]"
            />
          </div>

          {/* Title and Subtitle */}
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Nueva Contraseña</h1>
            <p className="text-gray-600 text-sm sm:text-base">Crea una contraseña segura para tu cuenta</p>
          </div>

          {/* Formulario */}
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            {/* Campo Nueva Contraseña */}
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">Nueva Contraseña</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Globe className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  type={mostrarContraseña ? "text" : "password"}
                  {...register("password")}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-12 py-3 border border-white/30 rounded-xl bg-white/50 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setMostrarContraseña(!mostrarContraseña)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {mostrarContraseña ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
              )}
            </div>

            {/* Campo Confirmar Contraseña */}
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">Confirmar Contraseña</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Globe className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="confirmPassword"
                  type={mostrarConfirmarContraseña ? "text" : "password"}
                  {...register("confirmPassword")}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-12 py-3 border border-white/30 rounded-xl bg-white/50 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setMostrarConfirmarContraseña(!mostrarConfirmarContraseña)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {mostrarConfirmarContraseña ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-red-500 text-xs mt-1">{errors.confirmPassword.message}</p>
              )}
            </div>

            {/* Mensaje del formulario */}
            {formMessage && (
              <div className={`text-sm font-medium mb-2 text-center ${formMessage.type === "error" ? "text-red-600" : "text-green-600"}`}>
                {formMessage.text}
              </div>
            )}

            {/* Botón de Actualizar */}
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center"
              disabled={isLoading}
            >
              {isLoading && (
                <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              )}
              Actualizar Contraseña
            </button>

            {/* Back to Login Link */}
            <div className="text-center">
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-800 text-sm transition-colors duration-200"
              >
                <ArrowLeft className="w-4 h-4" />
                Volver al Login
              </Link>
            </div>
          </form>
        </div>

        {/* Pie de página */}
        <div className="text-center mt-6 sm:mt-8">
          <p className="text-gray-500 text-xs sm:text-sm">© 2025 Global Connect. Todos los derechos reservados.</p>
        </div>
      </div>
    </div>
  )
}