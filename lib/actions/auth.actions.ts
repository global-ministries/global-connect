"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = createServerSupabaseClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error(error);
    return { error: "Credenciales inválidas. Por favor, inténtalo de nuevo." };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(formData: FormData) {
  const nombre = formData.get("nombre") as string;
  const apellido = formData.get("apellido") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const cedula = formData.get("cedula") as string | undefined;

  const supabase = createServerSupabaseClient();

  // 1. Buscar perfil preexistente por email o cédula
  let perfilExistente = null;
  {
    const orFilters = [`email.eq.${email}`];
    if (cedula && cedula.trim() !== "") {
      orFilters.push(`cedula.eq.${cedula}`);
    }
    const { data: usuarios, error: errorBusqueda } = await supabase
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

  // 2. Crear usuario en auth
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

  // 3. Vincular perfil existente o crear uno nuevo
  if (perfilExistente) {
    const { error: errorUpdate } = await supabase
      .from("usuarios")
      .update({ auth_id: user.id })
      .eq("id", perfilExistente.id);

    if (errorUpdate) {
      return { success: false, message: "Ocurrió un error inesperado. Por favor, inténtalo de nuevo." };
    }
  } else {
    const { error: errorInsert } = await supabase
      .from("usuarios")
      .insert({
        auth_id: user.id,
        nombre,
        apellido,
        email,
        cedula,
        fecha_nacimiento: "1900-01-01",
        genero: "Otro",
        estado_civil: "Soltero",
      });

    if (errorInsert) {
      return { success: false, message: "Ocurrió un error inesperado. Por favor, inténtalo de nuevo." };
    }
  }

  return {
    success: true,
    message: "¡Registro exitoso! Por favor, revisa tu bandeja de entrada para verificar tu cuenta.",
  };
}
