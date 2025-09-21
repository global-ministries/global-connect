"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createSupabaseServerClient(); // Await la función async

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
  const supabase = await createSupabaseServerClient();
  let { data: signUpData, error: errorSignUp } = await supabase.auth.signUp({
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
    console.error("[signup] auth.signUp error:", errorSignUp);

    // Fallback temporal en producción para evitar el rate limit de correos o fallos de envío
    if ((errorSignUp.code === 'over_email_send_rate_limit' || errorSignUp.code === 'unexpected_failure')) {
      console.warn(`[signup] Fallo en envío de correo (${errorSignUp.code}). Creando usuario con admin API (fallback temporal).`);
      const admin = createSupabaseAdminClient();
      const { data: adminSignUpData, error: adminError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirma el email
        user_metadata: { nombre, apellido },
      });

      if (adminError) {
        console.error('[signup] Admin createUser error:', adminError);
        return { success: false, message: "Ocurrió un error inesperado (admin fallback)." };
      }
      // Sobrescribir los datos de signUp con los del admin para continuar el flujo
      signUpData = { ...adminSignUpData, session: null };
    } else {
      if (errorSignUp.status === 400) {
        return { success: false, message: "Este correo electrónico ya está registrado." };
      }
      return { success: false, message: "Ocurrió un error inesperado. Por favor, inténtalo de nuevo." };
    }
  }

  const user = signUpData?.user;
  if (!user) {
    console.error("[signup] No user object returned from signUp");
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
      console.error("[signup] Profile search error:", errorBusqueda);
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
      console.error("[signup] Profile update error:", errorUpdate);
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
      console.error("[signup] Profile insert error:", errorInsert);
      return { success: false, message: "Ocurrió un error inesperado. Por favor, inténtalo de nuevo." };
    }
  }

  return {
    success: true,
    message: "¡Registro exitoso! Por favor, revisa tu bandeja de entrada para verificar tu cuenta.",
  };
}

export async function logout() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/')
}