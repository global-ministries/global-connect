"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getUserWithRoles } from "@/lib/getUserWithRoles";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { modoCierreSchema } from "@/lib/types/asistencia-avanzada.types";
import type { ConfiguracionGruposVida } from "@/lib/types/configuracion-grupos-vida.types";

type Res<T = void> = { success: boolean; error?: string; data?: T };

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
  creacion_grupos_habilitada: z.boolean().optional(),
  // Campos de asistencia avanzada (Fase 3)
  modo_cierre_asistencia: modoCierreSchema.optional(),
  dia_cierre_semanal: z.number().int().min(0).max(6).optional(),
  hora_cierre: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  visitantes_habilitados: z.boolean().optional(),
  puntos_oracion_compartidos: z.boolean().optional(),
  umbral_atencion: z.number().int().min(1).max(12).optional(),
  umbral_riesgo: z.number().int().min(1).max(24).optional(),
  umbral_critico: z.number().int().min(1).max(52).optional(),
  correo_semanal_habilitado: z.boolean().optional(),
  dia_envio_correo: z.number().int().min(0).max(6).optional(),
  hora_envio_correo: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

// ─── Actions ─────────────────────────────────────────────────────────

/**
 * Obtiene la configuración del módulo de grupos de vida.
 * Toma la configuración global (campus_id = null) o la específica del campus.
 */
export async function obtenerConfiguracionGrupos(
  campusId?: string
): Promise<Res<ConfiguracionGruposVida>> {
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

  const { data, error } = await query.order("campus_id", { ascending: false }).limit(1).maybeSingle();

  if (error) return { success: false, error: error.message };

  // Si no existe configuración, crear una por defecto
  if (!data) {
    const { data: newConfig, error: insertError } = await supabase
      .from("configuracion_grupos_vida")
      .insert({ campus_id: campusId ?? null })
      .select()
      .single();
    if (insertError) return { success: false, error: insertError.message };
    return { success: true, data: newConfig as ConfiguracionGruposVida };
  }

  return { success: true, data: data as ConfiguracionGruposVida };
}

/**
 * Actualiza la configuración del módulo de grupos de vida.
 * Solo superadmin puede modificar (enforced por RLS).
 */
export async function actualizarConfiguracionGrupos(
  configId: string,
  input: z.infer<typeof actualizarConfigSchema>
): Promise<Res<ConfiguracionGruposVida>> {
  if (!z.string().uuid().safeParse(configId).success) {
    return { success: false, error: "ID de configuración inválido" };
  }

  const parsed = actualizarConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createSupabaseServerClient();
  const userData = await getUserWithRoles(supabase);
  if (!userData) return { success: false, error: "No autenticado" };

  // Solo admin o pastor pueden modificar la configuración
  const esSuperadmin = userData.roles.some(r => ["admin", "pastor"].includes(r));
  if (!esSuperadmin) {
    return { success: false, error: "No tienes permisos para modificar la configuración" };
  }

  // Usar admin client para bypass de RLS (ya validamos rol arriba)
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
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

  if (!data) {
    return { success: false, error: "No tienes permisos para modificar la configuración" };
  }

  revalidatePath("/grupos-vida/configuracion");
  revalidatePath("/grupos-vida");
  return { success: true, data: data as ConfiguracionGruposVida };
}
