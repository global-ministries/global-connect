"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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

export async function addMemberToGroup(params: { grupoId: string; usuarioId: string; rol: "Líder" | "Colíder" | "Miembro"; }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { error } = await supabase.rpc("agregar_miembro_a_grupo", {
    p_auth_id: user.id,
    p_grupo_id: params.grupoId,
    p_usuario_id: params.usuarioId,
    p_rol: params.rol
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/dashboard/grupos/${params.grupoId}`);
  return { ok: true } as const;
}
