"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { User, Mail, Lock, CreditCard, Eye, EyeOff } from "lucide-react";
import {
  FondoAutenticacion,
  TarjetaSistema,
  InputSistema,
  BotonSistema,
  TituloSistema,
  TextoSistema,
  EnlaceSistema
} from "@/components/ui/sistema-diseno";

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

export default function SignupPage() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors }, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mostrarContrasena, setMostrarContrasena] = useState(false);
  const [mostrarConfirmarContrasena, setMostrarConfirmarContrasena] = useState(false);

  const watchedFields = watch();

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const formData = new window.FormData();
      formData.append("nombre", data.nombre);
      formData.append("apellido", data.apellido);
      formData.append("email", data.email);
      formData.append("password", data.password);
      formData.append("cedula", data.cedula);

      // @ts-ignore
      const response = await import("@/lib/actions/auth.actions").then(mod => mod.signup(formData));
      if (response?.success) {
        router.push("/verify-email");
      } else {
        setErrorMessage(response?.message || "Error desconocido");
      }
    } catch (err) {
      setErrorMessage("Error al crear la cuenta. Inténtalo de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <FondoAutenticacion>
      <TarjetaSistema variante="elevated" className="space-y-8">
        {/* Encabezado */}
        <div className="text-center space-y-2">
          <TituloSistema nivel={1} className="mb-2">
            Crear Cuenta
          </TituloSistema>
          <TextoSistema variante="sutil" tamaño="base">
            Únete a Global Connect
          </TextoSistema>
        </div>

        {/* Formulario */}
        <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
          {/* Fila de Nombre y Apellido */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <InputSistema
                label="Nombre"
                type="text"
                placeholder="Tu nombre"
                icono={User}
                error={errors.nombre?.message}
                disabled={isLoading}
                {...register("nombre")}
              />
            </div>
            <div>
              <InputSistema
                label="Apellido"
                type="text"
                placeholder="Tu apellido"
                icono={User}
                error={errors.apellido?.message}
                disabled={isLoading}
                {...register("apellido")}
              />
            </div>
          </div>

          {/* Email */}
          <InputSistema
            label="Correo electrónico"
            type="email"
            placeholder="tu@email.com"
            icono={Mail}
            error={errors.email?.message}
            disabled={isLoading}
            {...register("email")}
          />

          {/* Cédula */}
          <InputSistema
            label="Cédula de Identidad"
            type="text"
            placeholder="12345678"
            icono={CreditCard}
            error={errors.cedula?.message}
            disabled={isLoading}
            {...register("cedula")}
          />

          {/* Contraseña */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Contraseña
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type={mostrarContrasena ? "text" : "password"}
                placeholder="Mínimo 8 caracteres"
                className="block w-full py-3 pl-10 pr-12 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all duration-200 text-gray-900 placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-500"
                disabled={isLoading}
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setMostrarContrasena(!mostrarContrasena)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                {mostrarContrasena ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>
            )}
          </div>

          {/* Confirmar Contraseña */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Confirmar Contraseña
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type={mostrarConfirmarContrasena ? "text" : "password"}
                placeholder="Repite tu contraseña"
                className="block w-full py-3 pl-10 pr-12 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all duration-200 text-gray-900 placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-500"
                disabled={isLoading}
                {...register("confirmPassword")}
              />
              <button
                type="button"
                onClick={() => setMostrarConfirmarContrasena(!mostrarConfirmarContrasena)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                {mostrarConfirmarContrasena ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-red-500 text-sm mt-1">{errors.confirmPassword.message}</p>
            )}
          </div>

          {/* Mensaje de error */}
          {errorMessage && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <TextoSistema variante="default" tamaño="sm" className="text-red-700">
                {errorMessage}
              </TextoSistema>
            </div>
          )}

          {/* Botón de Registro */}
          <BotonSistema
            type="submit"
            variante="primario"
            tamaño="lg"
            cargando={isLoading}
            className="w-full"
            disabled={!watchedFields.nombre || !watchedFields.apellido || !watchedFields.email || !watchedFields.cedula || !watchedFields.password || !watchedFields.confirmPassword}
          >
            {isLoading ? "Creando cuenta..." : "Crear Cuenta"}
          </BotonSistema>

          {/* Enlace a Login */}
          <div className="text-center">
            <TextoSistema variante="sutil" tamaño="sm" className="inline">
              ¿Ya tienes cuenta?{" "}
            </TextoSistema>
            <Link href="/">
              <EnlaceSistema variante="marca" className="text-sm" comoSpan>
                Iniciar sesión
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
  );
}
