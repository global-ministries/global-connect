"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Crea o vincula un perfil de usuario en la tabla `usuarios`.
 * Busca por email/cedula para vincular perfiles pre-existentes (creados por admin).
 */
async function createUserProfile(
  adminClient: ReturnType<typeof createSupabaseAdminClient>,
  user: { id: string },
  userData: { nombre: string; apellido: string; email: string; cedula?: string },
  isEmailConfirmed: boolean = false
) {
  const { nombre, apellido, email, cedula } = userData;

  // Buscar perfil existente por email o cedula
  const orFilters = [`email.eq.${email}`];
  if (cedula && cedula.trim() !== "") {
    orFilters.push(`cedula.eq.${cedula}`);
  }

  const { data: usuarios, error: errorBusqueda } = await adminClient
    .from("usuarios")
    .select("id")
    .or(orFilters.join(","))
    .limit(1);

  if (errorBusqueda) {
    return { success: false, message: "Ocurrió un error inesperado. Por favor, inténtalo de nuevo." };
  }

  const perfilExistente = usuarios && usuarios.length > 0 ? usuarios[0] : null;

  if (perfilExistente) {
    // Vincular auth_id al perfil existente
    const { error: errorUpdate } = await adminClient
      .from("usuarios")
      .update({ auth_id: user.id })
      .eq("id", perfilExistente.id);

    if (errorUpdate) {
      return { success: false, message: "Ocurrió un error inesperado. Por favor, inténtalo de nuevo." };
    }
  } else {
    // Crear perfil nuevo
    const { error: errorInsert } = await adminClient
      .from("usuarios")
      .insert([
        {
          auth_id: user.id,
          nombre,
          apellido,
          email,
          cedula,
          fecha_nacimiento: "1900-01-01",
          genero: "Otro",
          estado_civil: "Soltero",
        },
      ]);

    if (errorInsert) {
      return { success: false, message: "Ocurrió un error inesperado. Por favor, inténtalo de nuevo." };
    }
  }

  return {
    success: true,
    message: isEmailConfirmed
      ? "¡Registro exitoso! Tu cuenta ha sido creada y verificada automáticamente."
      : "¡Registro exitoso! Por favor, revisa tu bandeja de entrada para verificar tu cuenta.",
  };
}

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "Credenciales inválidas. Por favor, inténtalo de nuevo." };
  }

  redirect("/dashboard");
}

export async function signup(formData: FormData) {
  const nombre = formData.get("nombre") as string;
  const apellido = formData.get("apellido") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const cedula = formData.get("cedula") as string | undefined;

  const supabase = await createSupabaseServerClient();

  // Registrar usuario via Supabase Auth (email de confirmación enviado por Resend/SMTP)
  const { data: signUpData, error: errorSignUp } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { nombre, apellido },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/auth/callback`,
    },
  });

  if (errorSignUp) {
    if (errorSignUp.status === 400) {
      return { success: false, message: "Este correo electrónico ya está registrado." };
    }
    return { success: false, message: "Ocurrió un error inesperado. Por favor, inténtalo de nuevo." };
  }

  const user = signUpData?.user;
  if (!user) {
    return { success: false, message: "Ocurrió un error inesperado. Por favor, inténtalo de nuevo." };
  }

  // Crear/vincular perfil usando admin client (bypass RLS)
  const admin = createSupabaseAdminClient();
  return await createUserProfile(admin, user, { nombre, apellido, email, cedula }, false);
}

export async function logout() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function updatePassword(newPassword: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    return { error: "No se pudo actualizar la contraseña. Inténtalo de nuevo." };
  }
  redirect("/dashboard");
}