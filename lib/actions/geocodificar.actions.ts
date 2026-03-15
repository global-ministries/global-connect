"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { extraerRelacion } from "@/lib/supabase/helpers";

/**
 * Resultado de la geocodificación masiva de direcciones sin coordenadas.
 */
interface ResultadoGeocoding {
  success: boolean;
  error?: string;
  totalProcesadas: number;
  totalGeocodificadas: number;
  totalFallidas: number;
  detalles: {
    id: string;
    direccionCompleta: string;
    status: "geocodificada" | "sin_resultado" | "error";
    latitud?: number;
    longitud?: number;
    errorMsg?: string;
  }[];
}

/**
 * Respuesta de Nominatim OSM
 */
interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

/**
 * Construye una query de búsqueda para Nominatim.
 * Combina los campos de dirección disponibles de forma progresiva.
 */
function construirQueryNominatim(dir: {
  calle: string;
  barrio: string | null;
  referencia: string | null;
  parroquia: string | null;
  municipio: string | null;
  estado: string | null;
}): string[] {
  const partes = [dir.calle];
  if (dir.barrio) partes.push(dir.barrio);
  if (dir.parroquia) partes.push(dir.parroquia);
  if (dir.municipio) partes.push(dir.municipio);
  if (dir.estado) partes.push(dir.estado);
  partes.push("Venezuela");

  // Generamos variaciones de más a menos específica
  // 1. Query completa
  // 2. Sin barrio (a veces los barrios confunden a Nominatim)
  // 3. Solo municipio + estado
  const queries: string[] = [partes.join(", ")];

  // Query sin barrio
  const sinBarrio = [dir.calle];
  if (dir.parroquia) sinBarrio.push(dir.parroquia);
  if (dir.municipio) sinBarrio.push(dir.municipio);
  if (dir.estado) sinBarrio.push(dir.estado);
  sinBarrio.push("Venezuela");
  const q2 = sinBarrio.join(", ");
  if (q2 !== queries[0]) queries.push(q2);

  // Fallback: municipio + estado
  if (dir.municipio && dir.estado) {
    queries.push(`${dir.municipio}, ${dir.estado}, Venezuela`);
  }

  return queries;
}

/**
 * Consulta Nominatim OSM API con rate limiting.
 * Prueba múltiples variaciones de la query.
 */
async function geocodificarConNominatim(
  queries: string[]
): Promise<{ lat: number; lon: number } | null> {
  for (const query of queries) {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "ve");

    try {
      const response = await fetch(url.toString(), {
        headers: {
          "User-Agent": "GlobalConnect/1.0 (admin@globalconnect.app)",
          Accept: "application/json",
        },
      });

      if (!response.ok) continue;

      const results: NominatimResult[] = await response.json();
      if (results.length > 0) {
        return {
          lat: parseFloat(results[0].lat),
          lon: parseFloat(results[0].lon),
        };
      }
    } catch {
      // Si falla una query, intentamos la siguiente
      continue;
    }
  }

  return null;
}

/**
 * Pausa entre requests para respetar el rate limit de Nominatim.
 * Nominatim: máximo 1 request por segundo.
 */
function esperarRateLimit(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1100));
}

/**
 * Geocodifica masivamente las direcciones sin coordenadas.
 * Solo admin puede ejecutar esta acción.
 * Rate limit: 1 request cada 1.1 segundos (Nominatim OSM).
 */
export async function geocodificarDireccionesMasivo(
  limite: number = 50
): Promise<ResultadoGeocoding> {
  const supabase = await createSupabaseServerClient();

  // 1. Auth + permisos (solo admin)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return {
      success: false,
      error: "Usuario no autenticado",
      totalProcesadas: 0,
      totalGeocodificadas: 0,
      totalFallidas: 0,
      detalles: [],
    };
  }

  const { data: esAdmin } = await supabase.rpc("es_superadmin", {
    p_auth_uid: user.id,
  });
  if (!esAdmin) {
    return {
      success: false,
      error: "Solo administradores pueden ejecutar la geocodificación masiva",
      totalProcesadas: 0,
      totalGeocodificadas: 0,
      totalFallidas: 0,
      detalles: [],
    };
  }

  // 2. Obtener direcciones sin coordenadas
  const { data: direcciones, error: queryError } = await supabase
    .from("direcciones")
    .select(
      `
      id,
      calle,
      barrio,
      referencia,
      parroquias!direcciones_parroquia_id_fkey (
        nombre,
        municipios!parroquias_municipio_id_fkey (
          nombre,
          estados!municipios_estado_id_fkey (
            nombre
          )
        )
      )
    `
    )
    .or("latitud.is.null,longitud.is.null")
    .limit(limite);

  if (queryError) {
    return {
      success: false,
      error: `Error al obtener direcciones: ${queryError.message}`,
      totalProcesadas: 0,
      totalGeocodificadas: 0,
      totalFallidas: 0,
      detalles: [],
    };
  }

  if (!direcciones || direcciones.length === 0) {
    return {
      success: true,
      totalProcesadas: 0,
      totalGeocodificadas: 0,
      totalFallidas: 0,
      detalles: [],
    };
  }

  // 3. Geocodificar cada dirección con rate limiting
  const detalles: ResultadoGeocoding["detalles"] = [];
  let totalGeocodificadas = 0;
  let totalFallidas = 0;

  for (const dir of direcciones) {
    // Extraer datos de la relación anidada
    const parroquiaData = extraerRelacion<{
      nombre: string;
      municipios: {
        nombre: string;
        estados: { nombre: string };
      };
    }>(dir.parroquias);

    const datosDir = {
      calle: dir.calle,
      barrio: dir.barrio,
      referencia: dir.referencia,
      parroquia: parroquiaData?.nombre ?? null,
      municipio: parroquiaData?.municipios?.nombre ?? null,
      estado: parroquiaData?.municipios?.estados?.nombre ?? null,
    };

    const queries = construirQueryNominatim(datosDir);
    const direccionCompleta = queries[0];

    try {
      const resultado = await geocodificarConNominatim(queries);

      if (resultado) {
        // Actualizar en DB
        const { error: updateError } = await supabase
          .from("direcciones")
          .update({
            latitud: resultado.lat,
            longitud: resultado.lon,
          })
          .eq("id", dir.id);

        if (updateError) {
          detalles.push({
            id: dir.id,
            direccionCompleta,
            status: "error",
            errorMsg: `Error al guardar: ${updateError.message}`,
          });
          totalFallidas++;
        } else {
          detalles.push({
            id: dir.id,
            direccionCompleta,
            status: "geocodificada",
            latitud: resultado.lat,
            longitud: resultado.lon,
          });
          totalGeocodificadas++;
        }
      } else {
        detalles.push({
          id: dir.id,
          direccionCompleta,
          status: "sin_resultado",
        });
        totalFallidas++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      detalles.push({
        id: dir.id,
        direccionCompleta,
        status: "error",
        errorMsg: msg,
      });
      totalFallidas++;
    }

    // Rate limit entre cada request
    await esperarRateLimit();
  }

  return {
    success: true,
    totalProcesadas: direcciones.length,
    totalGeocodificadas,
    totalFallidas,
    detalles,
  };
}

/**
 * Obtiene estadísticas de geocodificación para mostrar en el dashboard/config.
 */
export async function obtenerEstadisticasGeocoding(): Promise<{
  success: boolean;
  error?: string;
  total: number;
  conCoordenadas: number;
  sinCoordenadas: number;
  porcentaje: number;
}> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return {
      success: false,
      error: "Usuario no autenticado",
      total: 0,
      conCoordenadas: 0,
      sinCoordenadas: 0,
      porcentaje: 0,
    };
  }

  // Contar totales con dos queries simples
  const { count: total } = await supabase
    .from("direcciones")
    .select("*", { count: "exact", head: true });

  const { count: sinCoordenadas } = await supabase
    .from("direcciones")
    .select("*", { count: "exact", head: true })
    .or("latitud.is.null,longitud.is.null");

  const totalNum = total ?? 0;
  const sinNum = sinCoordenadas ?? 0;
  const conNum = totalNum - sinNum;
  const porcentaje = totalNum > 0 ? Math.round((conNum / totalNum) * 100) : 0;

  return {
    success: true,
    total: totalNum,
    conCoordenadas: conNum,
    sinCoordenadas: sinNum,
    porcentaje,
  };
}
