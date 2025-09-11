"use client"

import { Globe, Mail, Eye, EyeOff } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { login } from "@/lib/actions/auth.actions"

export default function PaginaLogin() {
  const [mostrarContrasena, setMostrarContrasena] = useState(false)
  const [email, setEmail] = useState("")
  const [contrasena, setContrasena] = useState("")

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
        {/* Tarjeta Principal de Login */}
        <div className="backdrop-blur-2xl bg-white/30 border border-white/50 rounded-3xl p-6 sm:p-8 shadow-2xl">

          {/* Title and Subtitle */}
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Bienvenido</h1>
            <p className="text-gray-600 text-sm sm:text-base">Accede a tu cuenta</p>
          </div>

          {/* Formulario de Login */}
          <form
            className="space-y-6"
            onSubmit={async (e) => {
              e.preventDefault();
              const result = await login(new FormData(e.currentTarget));
              // Manejar el resultado aqu�, por ejemplo mostrar errores
              if (result?.error) {
                alert(result.error);
              }
            }}
          >
            {/* Campo Email */}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="block w-full pl-10 pr-3 py-3 border border-white/30 rounded-xl bg-white/50 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Campo Contraseña */}
            <div className="space-y-2">
              <label htmlFor="contrasena" className="block text-sm font-medium text-gray-700">Contraseña</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Globe className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="contrasena"
                  name="password"
                  type={mostrarContrasena ? "text" : "password"}
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  placeholder="*****"
                  className="block w-full pl-10 pr-12 py-3 border border-white/30 rounded-xl bg-white/50 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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

            {/* Botón de Login */}
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              Ingresar
            </button>

            {/* Forgot Password Link */}
            <div className="text-center">
              <Link
                href="/reset-password"
                className="text-gray-600 hover:text-gray-800 text-sm transition-colors duration-200"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
          </form>
        </div>

        {/* Pie de página */}
        <div className="text-center mt-6 sm:mt-8">
          <p className="text-gray-500 text-xs sm:text-sm">© 2025 Global Barquisimeto. Todos los derechos reservados.</p>
        </div>
      </div>
    </div>
  )
}