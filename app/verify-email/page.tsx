"use client"

import { Mail } from "lucide-react"

export default function PaginaVerificarEmail() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-gray-50 to-white relative overflow-hidden flex items-center justify-center p-4">
      {/* Orbes flotantes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-32 h-32 bg-gradient-to-br from-orange-300/30 to-orange-400/30 rounded-full blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-32 w-24 h-24 bg-gradient-to-br from-gray-300/25 to-orange-300/25 rounded-full blur-lg animate-bounce" style={{animationDuration: '3s'}}></div>
        <div className="absolute bottom-32 left-32 w-40 h-40 bg-gradient-to-br from-orange-200/20 to-gray-200/20 rounded-full blur-2xl animate-pulse" style={{animationDelay: '1s'}}></div>
        <div className="absolute bottom-20 right-20 w-28 h-28 bg-gradient-to-br from-orange-400/30 to-orange-300/30 rounded-full blur-xl animate-bounce" style={{animationDuration: '4s', animationDelay: '0.5s'}}></div>
      </div>
      {/* Tarjeta de mensaje */}
      <div className="relative z-10 w-full max-w-md">
        <div className="backdrop-blur-2xl bg-white/30 border border-white/50 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center">
          <Mail className="w-16 h-16 text-orange-500 mb-6" />
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-4">¡Casi listo! Revisa tu correo</h1>
          <p className="text-gray-600 text-base sm:text-lg">Hemos enviado un enlace de verificación a tu dirección de correo electrónico. Por favor, haz clic en el enlace para activar tu cuenta.</p>
        </div>
      </div>
    </div>
  )
}
