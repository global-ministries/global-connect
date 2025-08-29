"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = createSupabaseServerClient(); // Usa la función personalizada

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

  // 1. Crear usuario en auth usando el cliente de sesión normal
  const supabase = createSupabaseServerClient();
  const { data: signUpData, error: errorSignUp } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        nombre,
        apellido,
      },
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

  // 2. Usar el cliente admin para la lógica de perfiles (RLS bypass)
  const admin = createSupabaseAdminClient();
  let perfilExistente = null;
  {
    const orFilters = [`email.eq.${email}`];
    if (cedula && cedula.trim() !== "") {
      orFilters.push(`cedula.eq.${cedula}`);
    }
    const { data: usuarios, error: errorBusqueda } = await admin
      .from("usuarios")
      .select("id")
      .or(orFilters.join(","))
      .limit(1);

    if (errorBusqueda) {
      return { success: false, message: "Ocurrió un error inesperado. Por favor, inténtalo de nuevo." };
    }
    if (usuarios && usuarios.length > 0) {
      perfilExistente = usuarios[0];
    }
  }

  // 3. Vincular perfil existente o crear uno nuevo usando el cliente admin
  if (perfilExistente) {
    const { error: errorUpdate } = await admin
      .from("usuarios")
      .update({ auth_id: user.id })
      .eq("id", perfilExistente.id);

    if (errorUpdate) {
      return { success: false, message: "Ocurrió un error inesperado. Por favor, inténtalo de nuevo." };
    }
  } else {
    const { error: errorInsert } = await admin
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
    message: "¡Registro exitoso! Por favor, revisa tu bandeja de entrada para verificar tu cuenta.",
  };
}