"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// ─── Types ───────────────────────────────────────────────────────────

interface ResultadoAccion<T = void> {
  success: boolean;
  error?: string;
  data?: T;
}

/** Configuración del módulo de grupos de vida */
export interface ConfiguracionGruposVida {
  id: string;
  campus_id: string | null;
  dias_expiracion_solicitud: number;
  max_miembros_por_grupo: number | null;
  permitir_lider_en_otro_grupo: boolean;
  requiere_aprobacion_grupo_planificacion: boolean;
  notificar_lider_ingreso: boolean;
  creado_en: string;
  actualizado_en: string;
}

// ─── Schemas ─────────────────────────────────────────────────────────

const actualizarConfigSchema = z.object({
  dias_expiracion_solicitud: z
    .number()
    .refine((v) => [5, 7, 14, 30].includes(v), "Debe ser 5, 7, 14 o 30 días")
    .optional(),
  max_miembros_por_grupo: z.number().min(2).max(200).nullable().optional(),
  permitir_lider_en_otro_grupo: z.boolean().optional(),
  requiere_aprobacion_grupo_planificacion: z.boolean().optional(),
  notificar_lider_ingreso: z.boolean().optional(),
});

// ─── Actions ─────────────────────────────────────────────────────────

/**
 * Obtiene la configuración del módulo de grupos de vida.
 * Toma la configuración global (campus_id = null) o la específica del campus.
 */
export async function obtenerConfiguracionGrupos(
  campusId?: string
): Promise<ResultadoAccion<ConfiguracionGruposVida>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  // Buscar configuración del campus específico, luego fallback a global
  let query = supabase
    .from("configuracion_grupos_vida")
    .select("*");

  if (campusId) {
    query = query.or(`campus_id.eq.${campusId},campus_id.is.null`);
  } else {
    query = query.is("campus_id", null);
  }

  const { data, error } = await query.order("campus_id", { ascending: false }).limit(1).single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as ConfiguracionGruposVida };
}

/**
 * Actualiza la configuración del módulo de grupos de vida.
 * Solo superadmin puede modificar (enforced por RLS).
 */
export async function actualizarConfiguracionGrupos(
  configId: string,
  input: z.infer<typeof actualizarConfigSchema>
): Promise<ResultadoAccion<ConfiguracionGruposVida>> {
  if (!z.string().uuid().safeParse(configId).success) {
    return { success: false, error: "ID de configuración inválido" };
  }

  const parsed = actualizarConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No autenticado" };

  const { data, error } = await supabase
    .from("configuracion_grupos_vida")
    .update({
      ...parsed.data,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", configId)
    .select()
    .single();

  if (error) {
    if (error.code === "42501") {
      return { success: false, error: "No tienes permisos para modificar la configuración" };
    }
    return { success: false, error: error.message };
  }

  revalidatePath("/grupos-vida/configuracion");
  return { success: true, data: data as ConfiguracionGruposVida };
}
