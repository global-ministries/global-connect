import Link from "next/link";
import UserCreateForm from "@/components/forms/UserCreateForm";



export default function CreateUserPage() {
  return (
    <div className="max-w-3xl mx-auto py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Crear Nuevo Usuario</h1>
        <Link href="/dashboard/users">
          <button className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors">
            Volver a la lista
          </button>
        </Link>
      </div>
      <UserCreateForm />
    </div>
  );
}
