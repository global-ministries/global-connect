"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { BotonGradiente } from "@/components/ui/boton-gradiente";

// Reutiliza el fondo y la tarjeta principal igual que en /app/page.tsx
function FondoGlobalConnect({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-gray-50 to-white relative overflow-hidden flex items-center justify-center p-4">
      {/* Orbes flotantes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-32 h-32 bg-gradient-to-br from-orange-300/30 to-orange-400/30 rounded-full blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-32 w-24 h-24 bg-gradient-to-br from-gray-300/25 to-orange-300/25 rounded-full blur-lg animate-bounce" style={{animationDuration: '3s'}}></div>
        <div className="absolute bottom-32 left-32 w-40 h-40 bg-gradient-to-br from-orange-200/20 to-gray-200/20 rounded-full blur-2xl animate-pulse" style={{animationDelay: '1s'}}></div>
        <div className="absolute bottom-20 right-20 w-28 h-28 bg-gradient-to-br from-orange-400/30 to-orange-300/30 rounded-full blur-xl animate-bounce" style={{animationDuration: '4s', animationDelay: '0.5s'}}></div>
      </div>
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  );
}

const schema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  apellido: z.string().min(1, "El apellido es obligatorio"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  confirmPassword: z.string().min(8, "Confirma tu contraseña"),
  cedula: z.string().min(5, "La cédula es obligatoria"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

type FormData = z.infer<typeof schema>;
type FormMessage = { type: "success" | "error"; text: string };

export default function SignupPage() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const [isLoading, setIsLoading] = useState(false);
  const [formMessage, setFormMessage] = useState<FormMessage | null>(null);

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    setFormMessage(null);

    const formData = new window.FormData();
    formData.append("nombre", data.nombre);
    formData.append("apellido", data.apellido);
    formData.append("email", data.email);
    formData.append("password", data.password);
    formData.append("cedula", data.cedula);

    // @ts-ignore
    const response = await import("@/lib/actions/auth.actions").then(mod => mod.signup(formData));
    if (response?.success) {
      setFormMessage({ type: "success", text: response.message });
    } else {
      setFormMessage({ type: "error", text: response?.message || "Error desconocido" });
    }
    setIsLoading(false);
  };

  return (
    <FondoGlobalConnect>
      <div className="backdrop-blur-2xl bg-white/30 border border-white/50 rounded-3xl p-6 sm:p-8 shadow-2xl">
        {/* Logo de Global Connect */}
        <div className="flex justify-center mb-6">
          <img 
            src="/logo.png" 
            alt="Global Connect" 
            className="h-14 w-auto sm:h-16 sm:w-auto max-w-[220px] sm:max-w-[280px]"
          />
        </div>

        {/* Título y subtítulo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Crear Cuenta</h1>
          <p className="text-gray-600 text-sm sm:text-base">Regístrate para acceder a tu comunidad</p>
        </div>

        {/* Formulario */}
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <label className="block text-sm font-medium mb-1">Nombre</label>
            <Input
              type="text"
              {...register("nombre")}
              className="block w-full pl-3 pr-3 py-3 border border-white/30 rounded-xl bg-white/50 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              disabled={isLoading}
            />
            {errors.nombre && (
              <p className="text-red-500 text-xs mt-1">{errors.nombre.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Apellido</label>
            <Input
              type="text"
              {...register("apellido")}
              className="block w-full pl-3 pr-3 py-3 border border-white/30 rounded-xl bg-white/50 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              disabled={isLoading}
            />
            {errors.apellido && (
              <p className="text-red-500 text-xs mt-1">{errors.apellido.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <Input
              type="email"
              {...register("email")}
              className="block w-full pl-3 pr-3 py-3 border border-white/30 rounded-xl bg-white/50 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              disabled={isLoading}
            />
            {errors.email && (
              <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Cédula de Identidad</label>
            <Input
              type="text"
              {...register("cedula")}
              className="block w-full pl-3 pr-3 py-3 border border-white/30 rounded-xl bg-white/50 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              disabled={isLoading}
            />
            {errors.cedula && (
              <p className="text-red-500 text-xs mt-1">{errors.cedula.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Contraseña</label>
            <Input
              type="password"
              {...register("password")}
              className="block w-full pl-3 pr-3 py-3 border border-white/30 rounded-xl bg-white/50 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              disabled={isLoading}
            />
            {errors.password && (
              <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirmar Contraseña</label>
            <Input
              type="password"
              {...register("confirmPassword")}
              className="block w-full pl-3 pr-3 py-3 border border-white/30 rounded-xl bg-white/50 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              disabled={isLoading}
            />
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

          <BotonGradiente
            tipo="submit"
            deshabilitado={isLoading}
            claseAdicional={`flex items-center justify-center ${isLoading ? "opacity-70 cursor-not-allowed" : ""}`}
          >
            {isLoading ? (
              <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : null}
            Crear Cuenta
          </BotonGradiente>

          <div className="text-center mt-4">
            <Link href="/" className="text-orange-600 hover:underline text-sm">
              ¿Ya tienes una cuenta? Inicia sesión
            </Link>
          </div>
        </form>

        {/* Pie de página */}
        <div className="text-center mt-6 sm:mt-8">
          <p className="text-gray-500 text-xs sm:text-sm">© 2025 Global Connect. Todos los derechos reservados.</p>
        </div>
      </div>
    </FondoGlobalConnect>
  );
}
