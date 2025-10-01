"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Función auxiliar para crear perfil de usuario
async function createUserProfile(
  adminClient: any, 
  user: any, 
  userData: { nombre: string; apellido: string; email: string; cedula?: string }, 
  isEmailConfirmed: boolean = false
) {
  const { nombre, apellido, email, cedula } = userData;
  
  let perfilExistente = null;
  {
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
    if (usuarios && usuarios.length > 0) {
      perfilExistente = usuarios[0];
    }
  }

  // Vincular perfil existente o crear uno nuevo
  if (perfilExistente) {
    const { error: errorUpdate } = await adminClient
      .from("usuarios")
      .update({ auth_id: user.id })
      .eq("id", perfilExistente.id);

    if (errorUpdate) {
      return { success: false, message: "Ocurrió un error inesperado. Por favor, inténtalo de nuevo." };
    }
  } else {
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
  // Para desarrollo: usar signUp sin confirmación de email
  // Para producción: configurar SMTP en Supabase Dashboard
  const { data: signUpData, error: errorSignUp } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        nombre,
        apellido,
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`,
    },
  });

  // Debug logging
  console.log('SignUp result:', { 
    user: signUpData?.user?.id, 
    email: signUpData?.user?.email,
    emailConfirmedAt: signUpData?.user?.email_confirmed_at,
    error: errorSignUp 
  });

  if (errorSignUp) {
    console.error('SignUp error:', errorSignUp);
    if (errorSignUp.status === 400) {
      return { success: false, message: "Este correo electrónico ya está registrado." };
    }
    
    // Mecanismo de fallback para errores de email (desarrollo y producción)
    if (errorSignUp.message?.includes('Error sending confirmation email') || 
        errorSignUp.code === 'unexpected_failure' ||
        errorSignUp.message?.includes('rate_limit')) {
      
      console.warn('Email confirmation failed, creating user with admin client as fallback...');
      
      // Usar cliente admin para crear usuario directamente con email verificado
      const admin = createSupabaseAdminClient();
      
      try {
        // Crear usuario directamente en auth con email verificado
        const { data: adminUser, error: adminError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true, // Marcar email como confirmado
          user_metadata: {
            nombre,
            apellido,
          }
        });

        if (adminError) {
          console.error('Admin user creation failed:', adminError);
          return { success: false, message: "Ocurrió un error inesperado. Por favor, inténtalo de nuevo." };
        }

        // Usar el usuario creado por admin para continuar el flujo
        const user = adminUser.user;
        if (!user) {
          return { success: false, message: "Ocurrió un error inesperado. Por favor, inténtalo de nuevo." };
        }

        // Continuar con la lógica de perfil usando el usuario admin
        return await createUserProfile(admin, user, { nombre, apellido, email, cedula }, true);
        
      } catch (fallbackError) {
        console.error('Fallback user creation failed:', fallbackError);
        return { success: false, message: "Ocurrió un error inesperado. Por favor, inténtalo de nuevo." };
      }
    } else {
      return { success: false, message: "Ocurrió un error inesperado. Por favor, inténtalo de nuevo." };
    }
  }

  const user = signUpData?.user;
  if (!user) {
    return { success: false, message: "Ocurrió un error inesperado. Por favor, inténtalo de nuevo." };
  }

  // Usar el cliente admin para la lógica de perfiles (RLS bypass)
  const admin = createSupabaseAdminClient();
  return await createUserProfile(admin, user, { nombre, apellido, email, cedula }, false);
}

export async function logout() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/')
}