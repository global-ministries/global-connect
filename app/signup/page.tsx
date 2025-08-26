"use client";

import React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

// Esquema de validaci�n con zod
const schema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  apellido: z.string().min(1, "El apellido es obligatorio"),
  email: z.string().email("Email inv�lido"),
  password: z.string().min(8, "La contrase�a debe tener al menos 8 caracteres"),
  confirmPassword: z.string().min(8, "Confirma tu contrase�a"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Las contrase�as no coinciden",
  path: ["confirmPassword"],
});

type FormData = z.infer<typeof schema>;

export default function SignupPage() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = (data: FormData) => {
    // Aqu� ir�a la l�gica de registro
    console.log(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 to-blue-300">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center">Crear Cuenta</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nombre</label>
            <input
              type="text"
              {...register("nombre")}
              className="w-full border rounded px-3 py-2"
            />
            {errors.nombre && (
              <p className="text-red-500 text-xs mt-1">{errors.nombre.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Apellido</label>
            <input
              type="text"
              {...register("apellido")}
              className="w-full border rounded px-3 py-2"
            />
            {errors.apellido && (
              <p className="text-red-500 text-xs mt-1">{errors.apellido.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              {...register("email")}
              className="w-full border rounded px-3 py-2"
            />
            {errors.email && (
              <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Contrase�a</label>
            <input
              type="password"
              {...register("password")}
              className="w-full border rounded px-3 py-2"
            />
            {errors.password && (
              <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirmar Contrase�a</label>
            <input
              type="password"
              {...register("confirmPassword")}
              className="w-full border rounded px-3 py-2"
            />
            {errors.confirmPassword && (
              <p className="text-red-500 text-xs mt-1">{errors.confirmPassword.message}</p>
            )}
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
          >
            Crear Cuenta
          </button>
        </form>
        <p className="mt-4 text-center text-sm">
          �Ya tienes una cuenta?{" "}
          <Link href="/" className="text-blue-600 hover:underline">
            Inicia sesi�n
          </Link>
        </p>
      </div>
    </div>
  );
}
