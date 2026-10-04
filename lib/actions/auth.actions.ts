"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { prepararCedula } from "@/lib/utils/cedula";
import { vincularFichaConfirmada } from "@/lib/supabase/vincular-ficha";

const MENSAJE_PENDIENTE_APROBACION = "Tu cuenta está pendiente de aprobación por tu director";

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
    if (vinculo.estado === "pendiente_aprobacion") {
      return { success: true, message: MENSAJE_PENDIENTE_APROBACION };
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
export type VinculoPendiente = {
  id: string;
  ficha_id: string;
  nombre_enmascarado: string;
  cedula_enmascarada: string;
  correo_solicitante: string | null;
  creado_en: string;
};

/**
 * Pending links by cédula the signed-in person may resolve. The RPC filters by
 * the caller's hierarchy and masks the ficha; an empty list hides the card.
 */
export async function listarVinculosPendientes(): Promise<{ ok: boolean; solicitudes: VinculoPendiente[] }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("vinculos_pendientes_listar");
  if (error) return { ok: false, solicitudes: [] };
  return { ok: true, solicitudes: (data ?? []) as VinculoPendiente[] };
}

const MENSAJES_RESOLVER: Record<string, string> = {
  FICHA_YA_VINCULADA: "Esa ficha ya tiene una cuenta. La solicitud quedó rechazada.",
  CUENTA_YA_VINCULADA: "Esa cuenta ya tiene otra ficha. La solicitud quedó rechazada.",
  YA_RESUELTO: "Otra persona ya resolvió esta solicitud.",
};

export async function resolverVinculoPendiente(
  id: string,
  aprobar: boolean
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("vinculo_pendiente_resolver", { p_id: id, p_aprobar: aprobar });
  const resultado = data as { ok?: boolean; codigo?: string } | null;
  if (error || !resultado?.ok) {
    return {
      ok: false,
      message: MENSAJES_RESOLVER[resultado?.codigo ?? ""] ?? "No se pudo resolver la solicitud.",
    };
  }
  return { ok: true };
}
