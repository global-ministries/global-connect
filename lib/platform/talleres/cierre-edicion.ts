/**
 * Cierre de edición (odd/tasks/talleres-cierre-de-edicion.md T2) — typed
 * parsers for the two jsonb answers the close flow consumes, per the
 * feature's "Contrato entre la base y la app":
 *
 *   talleres_previsualizar_cierre(p_edicion_id) →
 *     { clases_sin_dictar, reportes_sin_enviar, clases_minimas|null,
 *       filas: [{ inscripcion_id, persona_nombre, companero_nombre|null,
 *                 grupo_nombre|null, clases_presente, clases_total, minimo,
 *                 resultado }] }
 *   talleres_cerrar_edicion(p_edicion_id) →
 *     { ok, completados, no_completados, abandonos, certificados_emitidos,
 *       clases_cerradas, clases_canceladas, grupos_completados,
 *       reportes_cerrados, reportes_sin_enviar }
 *
 * The generated types only say `Json`, so nothing here is cast blindly: a
 * payload that drifts from the contract parses to `null` and the caller
 * decides how to degrade (the preview refuses to render guessed numbers; a
 * successful close still reports success without its summary). Pure module
 * — safe to import from server actions and, type-only, from client code.
 */

export type ResultadoCierre = 'completado' | 'no_completado' | 'abandono'

const RESULTADOS: readonly ResultadoCierre[] = ['completado', 'no_completado', 'abandono']

export interface FilaVistaPreviaCierre {
  readonly inscripcionId: string
  readonly personaNombre: string
  readonly companeroNombre: string | null
  readonly grupoNombre: string | null
  /** Clases dictadas (en_curso or cerrada) of the inscrito's grupo they attended. */
  readonly clasesPresente: number
  /** Clases dictadas of the inscrito's grupo. */
  readonly clasesTotal: number
  /** The effective minimum for this row (already clamped by the database). */
  readonly minimo: number
  readonly resultado: ResultadoCierre
}

export interface VistaPreviaCierre {
  /** Programadas (never dictadas) clases the close will cancel. */
  readonly clasesSinDictar: number
  /** Reportes never sent; the close leaves them open. */
  readonly reportesSinEnviar: number
  /** The taller's configured minimum; null means every clase dictada. */
  readonly clasesMinimas: number | null
  readonly filas: readonly FilaVistaPreviaCierre[]
}

export interface ResumenCierre {
  readonly completados: number
  readonly noCompletados: number
  readonly abandonos: number
  readonly certificadosEmitidos: number
  readonly clasesCerradas: number
  readonly clasesCanceladas: number
  readonly gruposCompletados: number
  readonly reportesCerrados: number
  readonly reportesSinEnviar: number
}

function esObjeto(valor: unknown): valor is Readonly<Record<string, unknown>> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

/** A count: a non-negative integer JSON number, never a numeric string. */
function conteo(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0 ? valor : null
}

function textoOpcional(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim().length > 0 ? valor : null
}

function esResultado(valor: unknown): valor is ResultadoCierre {
  return typeof valor === 'string' && (RESULTADOS as readonly string[]).includes(valor)
}

function parseFila(raw: unknown): FilaVistaPreviaCierre | null {
  if (!esObjeto(raw)) return null
  const inscripcionId = textoOpcional(raw.inscripcion_id)
  const clasesPresente = conteo(raw.clases_presente)
  const clasesTotal = conteo(raw.clases_total)
  const minimo = conteo(raw.minimo)
  if (inscripcionId === null || clasesPresente === null || clasesTotal === null || minimo === null) return null
  if (!esResultado(raw.resultado)) return null
  return {
    inscripcionId,
    // Same rule as the inscripciones loaders: a name the viewer cannot
    // resolve degrades to '—', it never drops the row.
    personaNombre: textoOpcional(raw.persona_nombre) ?? '—',
    companeroNombre: textoOpcional(raw.companero_nombre),
    grupoNombre: textoOpcional(raw.grupo_nombre),
    clasesPresente,
    clasesTotal,
    minimo,
    resultado: raw.resultado,
  }
}

export function parseVistaPreviaCierre(raw: unknown): VistaPreviaCierre | null {
  if (!esObjeto(raw)) return null
  const clasesSinDictar = conteo(raw.clases_sin_dictar)
  const reportesSinEnviar = conteo(raw.reportes_sin_enviar)
  if (clasesSinDictar === null || reportesSinEnviar === null) return null

  let clasesMinimas: number | null = null
  if (raw.clases_minimas !== null && raw.clases_minimas !== undefined) {
    clasesMinimas = conteo(raw.clases_minimas)
    if (clasesMinimas === null) return null
  }

  if (!Array.isArray(raw.filas)) return null
  const filas: FilaVistaPreviaCierre[] = []
  for (const filaRaw of raw.filas) {
    const fila = parseFila(filaRaw)
    // One malformed row means the contract drifted: show nothing rather
    // than a preview that silently omits someone.
    if (fila === null) return null
    filas.push(fila)
  }

  return { clasesSinDictar, reportesSinEnviar, clasesMinimas, filas }
}

export function parseResumenCierre(raw: unknown): ResumenCierre | null {
  if (!esObjeto(raw)) return null
  const resumen = {
    completados: conteo(raw.completados),
    noCompletados: conteo(raw.no_completados),
    abandonos: conteo(raw.abandonos),
    certificadosEmitidos: conteo(raw.certificados_emitidos),
    clasesCerradas: conteo(raw.clases_cerradas),
    clasesCanceladas: conteo(raw.clases_canceladas),
    gruposCompletados: conteo(raw.grupos_completados),
    reportesCerrados: conteo(raw.reportes_cerrados),
    reportesSinEnviar: conteo(raw.reportes_sin_enviar),
  }
  if (
    resumen.completados === null ||
    resumen.noCompletados === null ||
    resumen.abandonos === null ||
    resumen.certificadosEmitidos === null ||
    resumen.clasesCerradas === null ||
    resumen.clasesCanceladas === null ||
    resumen.gruposCompletados === null ||
    resumen.reportesCerrados === null ||
    resumen.reportesSinEnviar === null
  ) {
    return null
  }
  return {
    completados: resumen.completados,
    noCompletados: resumen.noCompletados,
    abandonos: resumen.abandonos,
    certificadosEmitidos: resumen.certificadosEmitidos,
    clasesCerradas: resumen.clasesCerradas,
    clasesCanceladas: resumen.clasesCanceladas,
    gruposCompletados: resumen.gruposCompletados,
    reportesCerrados: resumen.reportesCerrados,
    reportesSinEnviar: resumen.reportesSinEnviar,
  }
}

/** Rows per resultado, with a zero for every resultado that has none. */
export function contarPorResultado(
  filas: readonly FilaVistaPreviaCierre[],
): Readonly<Record<ResultadoCierre, number>> {
  const conteos: Record<ResultadoCierre, number> = { completado: 0, no_completado: 0, abandono: 0 }
  for (const fila of filas) conteos[fila.resultado] += 1
  return conteos
}
