import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import UserCreateForm from "@/components/forms/UserCreateForm";



export default function CreateUserPage() {
  return (
    <div className="space-y-6">
      {/* Botón de regreso */}
      <div>
        <Link 
          href="/dashboard/users"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white/50 hover:bg-orange-50/50 rounded-xl transition-all duration-200 text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a Usuarios
        </Link>
      </div>

      {/* Título y tarjeta */}
      <div className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-3xl p-6 lg:p-8 shadow-2xl">
        <h1 className="text-3xl font-bold text-gray-800">
          Crear Nuevo Usuario
        </h1>
        <p className="text-gray-600 mt-2">
          Ingresa los datos básicos para registrar un nuevo usuario en la comunidad.
        </p>
      </div>

      {/* Formulario de creación */}
      <div className="backdrop-blur-2xl bg-white/50 border border-white/30 rounded-3xl p-6 lg:p-8 shadow-2xl">
        <UserCreateForm />
      </div>
    </div>
  )
}
