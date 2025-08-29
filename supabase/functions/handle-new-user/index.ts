// Supabase Edge Function: handle-new-user
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Tipado para el payload recibido del Auth Hook
type AuthHookPayload = {
  record: {
    id: string;
    email: string;
    user_metadata: {
      nombre?: string;
      apellido?: string;
      cedula?: string;
    };
  };
};

serve(async (req) => {
  try {
    // 1. Parsear el payload recibido del Auth Hook
    const payload = (await req.json()) as AuthHookPayload;
    const { id: auth_id, email, user_metadata } = payload.record;
    const { nombre = "", apellido = "", cedula = "" } = user_metadata || {};

    // 2. Crear el cliente de Supabase Admin con permisos elevados
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 3. Buscar usuario preexistente por email o cÃ©dula (si la cÃ©dula no estÃ¡ vacÃ­a)
    let query = supabase
      .from("usuarios")
      .select("id")
      .or(
        [
          `email.eq.${email}`,
          cedula && cedula.trim() !== ""
            ? `cedula.eq.${cedula}`
            : undefined,
        ]
          .filter(Boolean)
          .join(",")
      )
      .limit(1);

    const { data: usuarios, error: searchError } = await query;

    if (searchError) {
      throw new Error("Error buscando usuario existente: " + searchError.message);
    }

    if (usuarios && usuarios.length > 0) {
      // 5. Si existe, actualizar el auth_id
      const usuarioId = usuarios[0].id;
      const { error: updateError } = await supabase
        .from("usuarios")
        .update({ auth_id })
        .eq("id", usuarioId);

      if (updateError) {
        throw new Error("Error actualizando usuario existente: " + updateError.message);
      }

      return new Response(
        JSON.stringify({
          status: "success",
          message: "Usuario vinculado con perfil existente.",
          usuario_id: usuarioId,
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      );
    } else {
      // 6. Si no existe, crear nuevo usuario con valores por defecto
      const { error: insertError } = await supabase.from("usuarios").insert([
        {
          auth_id,
          nombre,
          apellido,
          email,
          cedula,
          fecha_nacimiento: "1900-01-01",
          genero: "Otro",
          estado_civil: "Soltero",
        },
      ]);

      if (insertError) {
        throw new Error("Error creando nuevo usuario: " + insertError.message);
      }

      return new Response(
        JSON.stringify({
          status: "success",
          message: "Nuevo usuario creado exitosamente.",
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      );
    }
  } catch (err: any) {
    // 7. Manejo de errores
    return new Response(
      JSON.stringify({
        status: "error",
        message: err?.message || "Error interno en la funciÃ³n handle-new-user.",
      }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
});
