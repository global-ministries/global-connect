"use server"

import type { SupabaseClient } from "@supabase/supabase-js"

interface DireccionInput {
  calle?: string
  barrio?: string
  codigo_postal?: string
  referencia?: string
  lat?: number
  lng?: number
  parroquia_id?: string
  pais_id?: string
  estado_id?: string
  municipio_id?: string
}

/**
 * Upsert de dirección reutilizable.
 * - Si hay `currentDireccionId`, actualiza la dirección existente y retorna el mismo ID.
 * - Si no hay ID pero hay datos de calle o barrio, crea una dirección nueva y retorna su ID.
 * - En cualquier otro caso retorna null.
 */
export async function upsertDireccion(
  supabase: SupabaseClient,
  currentDireccionId: string | null | undefined,
  data: DireccionInput
): Promise<string | null> {
  const direccionData = {
    calle: data.calle || null,
    barrio: data.barrio || null,
    codigo_postal: data.codigo_postal || null,
    referencia: data.referencia || null,
    latitud: data.lat ?? null,
    longitud: data.lng ?? null,
    parroquia_id: data.parroquia_id || null,
    pais_id: data.pais_id || null,
    estado_id: data.estado_id || null,
    municipio_id: data.municipio_id || null,
  }

  if (currentDireccionId) {
    const { error } = await supabase
      .from("direcciones")
      .update(direccionData)
      .eq("id", currentDireccionId)
    if (error) throw new Error(`Error actualizando dirección: ${error.message}`)
    return currentDireccionId
  }

  // Solo crear si hay datos mínimos de dirección
  if (!data.calle && !data.barrio) return null

  const { data: newDir, error } = await supabase
    .from("direcciones")
    .insert(direccionData)
    .select("id")
    .single()
  if (error) throw new Error(`Error creando dirección: ${error.message}`)
  return newDir.id
}
