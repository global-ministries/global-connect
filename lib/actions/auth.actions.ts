"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { prepararCedula } from "@/lib/utils/cedula";
import { vincularFichaConfirmada } from "@/lib/supabase/vincular-ficha";

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

  // Registrar usuario via Supabase Auth (email de confirmación enviado por Resend/SMTP).
  // La ficha NO se vincula aquí: se vincula al confirmar el correo
  // (/auth/callback o /auth/confirm), con el correo ya verificado. Los datos
  // del formulario viajan en user_metadata para crear la ficha en ese momento.
  const { data: signUpData, error: errorSignUp } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { nombre, apellido, cedula: prepararCedula(cedula) },
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

  // Sólo si el proyecto confirma el correo automáticamente se vincula ya.
  if (user.email_confirmed_at) {
    const vinculo = await vincularFichaConfirmada(createSupabaseAdminClient(), user);
    if (vinculo.estado === "error") {
      return { success: false, message: "Ocurrió un error inesperado. Por favor, inténtalo de nuevo." };
    }
    return {
      success: true,
      message: "¡Registro exitoso! Tu cuenta ha sido creada y verificada automáticamente.",
    };
  }

  return {
    success: true,
    message: "¡Registro exitoso! Por favor, revisa tu bandeja de entrada para verificar tu cuenta.",
  };
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