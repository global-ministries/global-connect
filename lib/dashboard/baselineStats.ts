import { getTotalUsuarios } from './getTotalUsuarios'
import { getTotalGruposActivos } from './getTotalGruposActivos'
import { getTotalUsuariosSinGrupo } from './getTotalUsuariosSinGrupo'
import { getDistribucionSegmentos, SegmentoDistribucionItem } from './getDistribucionSegmentos'

export interface BaselineStats {
  totalUsuarios: number | null
  totalGruposActivos: number | null
  totalUsuariosSinGrupo: number | null
  distribucionSegmentos: SegmentoDistribucionItem[] | null
  totalGruposDistribucion: number | null
}

export async function obtenerBaselineStats(): Promise<BaselineStats> {
  const [totalUsuarios, totalGruposActivos, totalUsuariosSinGrupo, distribucionSegmentos] = await Promise.all([
    getTotalUsuarios(),
    getTotalGruposActivos(),
    getTotalUsuariosSinGrupo(),
    getDistribucionSegmentos(),
  ])
  const totalGruposDistribucion = (distribucionSegmentos || []).reduce((acc, s) => acc + s.grupos, 0)
  return { totalUsuarios, totalGruposActivos, totalUsuariosSinGrupo, distribucionSegmentos, totalGruposDistribucion }
}
