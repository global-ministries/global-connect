/**
 * W12 — Metrics types for pastoral tracking.
 *
 * Return types for the 4 pure metric functions (D19, D27).
 */

// ── uno_auno_por_periodo ───────────────────────────────────────────────────

export interface UnoAunoPorPeriodoResult {
  readonly personaId: string
  readonly completados: number
  readonly cancelados: number
}

// ── lideres_activos_por_ventana ───────────────────────────────────────────

export interface LiderActivo {
  readonly liderId: string
  readonly unoAunoCount: number
  readonly triadaCount: number
}

// ── triadas_por_tipo ───────────────────────────────────────────────────────

export interface TriadaPorTipoResult {
  readonly tipo: string
  readonly count: number
}

// ── alarma_gdv_sin_uno_auno_en_90_dias ────────────────────────────────────

export interface AlarmaGdvSinUnoAUno {
  readonly gdvsGrupoId: string
  readonly liderId: string
  readonly diasSinUnoAuno: number
}

// ── Clock for testability ───────────────────────────────────────────────────

export interface Clock {
  now(): Date
}
