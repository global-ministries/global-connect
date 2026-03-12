"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { crearSolicitudGrupo } from "@/lib/actions/solicitudes-grupo.actions";

/**
 * Busca usuarios elegibles para agregar a un grupo.
 *
 * @param grupoId - UUID del grupo objetivo
 * @param query - Texto de búsqueda (nombre, apellido, email, teléfono)
 * @returns Lista de usuarios con indicador `ya_es_miembro`
 */
export async function searchUsersForGroup(grupoId: string, query: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data, error } = await supabase.rpc("buscar_usuarios_para_grupo", {
    p_auth_id: user.id,
    p_grupo_id: grupoId,
    p_query: query,
    p_limit: 10
  });
  if (error) throw new Error(error.message);
  return data as Array<{ id: string; nombre: string; apellido: string; email?: string; telefono?: string; ya_es_miembro: boolean }>;
}

/**
 * Agrega un miembro a un grupo. Delega al RPC `crear_solicitud_grupo`
 * que decide si es directo (admin/pastor/DG+) o crea una solicitud pendiente.
 * 
 * ANTES: llamaba directamente a `agregar_miembro_a_grupo` RPC (bypass).
 * AHORA: respeta el flujo de solicitudes según el rol del usuario.
 */
export async function addMemberToGroup(params: { grupoId: string; usuarioId: string; rol: "Líder" | "Colíder" | "Miembro"; }) {
  const result = await crearSolicitudGrupo({
    tipo: "ingreso",
    usuario_id: params.usuarioId,
    grupo_id: params.grupoId,
    rol_solicitado: params.rol,
  });

  if (!result.success) {
    throw new Error(result.error ?? "Error al agregar miembro");
  }

  revalidatePath(`/grupos-vida/${params.grupoId}`);

  // Inform caller whether it was direct or needs approval
  return {
    ok: true,
    modo: result.data?.modo ?? "solicitud",
    message: result.data?.modo === "directo"
      ? "Miembro agregado exitosamente"
      : "Solicitud creada — pendiente de aprobación",
  } as const;
}
