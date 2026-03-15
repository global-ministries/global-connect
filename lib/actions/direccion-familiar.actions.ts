"use server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

/** Etiqueta legible para cada tipo de relación. */
const RELACION_LABELS: Record<string, string> = {
  conyuge: "Cónyuge",
  padre: "Padre/Madre",
  hijo: "Hijo/a",
  tutor: "Tutor",
  hermano: "Hermano/a",
  otro_familiar: "Familiar",
}

/** Estructura de una sugerencia de dirección familiar. */
export interface SugerenciaDireccionFamiliar {
  familiar_id: string
  familiar_nombre: string
  relacion: string
  relacion_label: string
  direccion: {
    calle: string
    barrio: string | null
    codigo_postal: string | null
    referencia: string | null
    lat: number | null
    lng: number | null
    parroquia_id: string | null
    direccion_id: string
  }
}

/**
 * Busca familiares registrados del usuario que tengan dirección válida.
 *
 * Retorna sugerencias de dirección de cónyuge, padres e hijos para
 * rellenar automáticamente el formulario de perfil.
 */
export async function obtenerSugerenciasDireccionFamiliar(
  usuarioId: string
): Promise<{ sugerencias: SugerenciaDireccionFamiliar[] }> {
  try {
    const supabase = await createSupabaseServerClient()

    // Buscar relaciones del usuario (ambas direcciones de la relación)
    const { data: relaciones, error: relError } = await supabase
      .from("relaciones_usuarios")
      .select("usuario1_id, usuario2_id, tipo_relacion")
      .or(`usuario1_id.eq.${usuarioId},usuario2_id.eq.${usuarioId}`)

    if (relError || !relaciones?.length) {
      return { sugerencias: [] }
    }

    // Identificar IDs de familiares y su tipo de relación
    const familiares = relaciones.map((r) => ({
      familiar_id: r.usuario1_id === usuarioId ? r.usuario2_id : r.usuario1_id,
      relacion: r.tipo_relacion,
    }))

    // Buscar datos de cada familiar con su dirección
    const familiarIds = familiares.map((f) => f.familiar_id)
    const { data: usuarios, error: usrError } = await supabase
      .from("usuarios")
      .select("id, nombre, apellido, direccion_id")
      .in("id", familiarIds)

    if (usrError || !usuarios?.length) {
      return { sugerencias: [] }
    }

    // Filtrar los que tienen dirección
    const conDireccion = usuarios.filter((u) => u.direccion_id)
    if (!conDireccion.length) {
      return { sugerencias: [] }
    }

    // Cargar las direcciones
    const direccionIds = conDireccion.map((u) => u.direccion_id as string)
    const { data: direcciones, error: dirError } = await supabase
      .from("direcciones")
      .select("id, calle, barrio, codigo_postal, referencia, latitud, longitud, parroquia_id")
      .in("id", direccionIds)

    if (dirError || !direcciones?.length) {
      return { sugerencias: [] }
    }

    // Armar sugerencias
    const dirMap = new Map(direcciones.map((d) => [d.id, d]))
    const sugerencias: SugerenciaDireccionFamiliar[] = conDireccion
      .map((u) => {
        const dir = dirMap.get(u.direccion_id!)
        if (!dir || !dir.calle) return null

        const relInfo = familiares.find((f) => f.familiar_id === u.id)
        const relacion = relInfo?.relacion ?? "otro_familiar"

        return {
          familiar_id: u.id,
          familiar_nombre: `${u.nombre} ${u.apellido}`.trim(),
          relacion,
          relacion_label: RELACION_LABELS[relacion] ?? "Familiar",
          direccion: {
            calle: dir.calle,
            barrio: dir.barrio,
            codigo_postal: dir.codigo_postal,
            referencia: dir.referencia,
            lat: dir.latitud,
            lng: dir.longitud,
            parroquia_id: dir.parroquia_id,
            direccion_id: dir.id,
          },
        }
      })
      .filter(Boolean) as SugerenciaDireccionFamiliar[]

    return { sugerencias }
  } catch {
    return { sugerencias: [] }
  }
}
