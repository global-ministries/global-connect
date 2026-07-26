export interface UnoAunoPorPeriodoResult {
  readonly personaId: string
  readonly completados: number
  readonly cancelados: number
}

export interface LiderActivo {
  readonly liderId: string
  readonly unoAunoCount: number
}

export interface AlarmaGdvSinUnoAUno {
  readonly gdvsGrupoId: string
  readonly liderId: string
  readonly diasSinUnoAuno: number
}

export interface Clock {
  now(): Date
}
