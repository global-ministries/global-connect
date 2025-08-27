import { redirect } from "next/navigation";
import Image from "next/image";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function WelcomePage() {
  const supabase = createServerSupabaseClient();

  // 1. Obtener usuario autenticado
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/");
  }

  // 2. Consultar perfil en la tabla usuarios
  const { data: perfil, error } = await supabase
    .from("usuarios")
    .select("id, fecha_registro")
    .eq("id", user.id)
    .single();

  // 3. Si no hay perfil, redirigir al login
  if (error || !perfil) {
    redirect("/");
  }

  // 4. Comprobar si la fecha de registro es muy reciente (primer login)
  const fechaRegistro = new Date(perfil.fecha_registro);
  const ahora = new Date();
  const cincoMin = 5 * 60 * 1000;
  if (ahora.getTime() - fechaRegistro.getTime() < cincoMin) {
    redirect(`/dashboard/users/${user.id}/edit`);
  } else {
    redirect("/dashboard");
  }

  // 5. Pantalla de carga mientras se ejecuta la lógica
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <Image src="/logo.png" alt="Global Connect" width={120} height={120} className="mb-6" />
      <p className="text-lg text-gray-700 font-semibold">Verificando tu cuenta, un momento...</p>
    </div>
);
}