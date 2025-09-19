"use client"

import { useMemo, useCallback } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BotonSistema } from "@/components/ui/sistema-diseno"

type Segmento = { id: string; nombre: string }
type Temporada = { id: string; nombre: string }
type Municipio = { id: string; nombre: string }
type Parroquia = { id: string; nombre: string; municipio_id: string }

export type FiltrosGruposState = {
  segmentoId?: string
  temporadaId?: string
  estado?: "activo" | "inactivo"
  municipioId?: string
  parroquiaId?: string
}

type Props = {
  filtros: FiltrosGruposState
  onFiltrosChange: (f: FiltrosGruposState) => void
  segmentos: Segmento[]
  temporadas: Temporada[]
  municipios?: Municipio[]
  parroquias?: Parroquia[]
}

export default function FiltrosGrupos({ filtros, onFiltrosChange, segmentos, temporadas, municipios = [], parroquias = [] }: Props) {
  const handleChange = useCallback(
    (patch: Partial<FiltrosGruposState>) => {
      onFiltrosChange({ ...filtros, ...patch })
    },
    [filtros, onFiltrosChange]
  )

  const limpiar = useCallback(() => {
    onFiltrosChange({})
  }, [onFiltrosChange])

  const segmentoLabel = useMemo(() => segmentos.find(s => s.id === filtros.segmentoId)?.nombre ?? "Todos", [segmentos, filtros.segmentoId])
  const temporadaLabel = useMemo(() => temporadas.find(t => t.id === filtros.temporadaId)?.nombre ?? "Todas", [temporadas, filtros.temporadaId])
  const parroquiasFiltradas = useMemo(() => {
    if (!filtros.municipioId) return parroquias
    return parroquias.filter(p => p.municipio_id === filtros.municipioId)
  }, [parroquias, filtros.municipioId])

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="space-y-4">
        {/* Segmento */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Filtrar por Segmento</label>
          <Select value={filtros.segmentoId ?? ""} onValueChange={(v) => handleChange({ segmentoId: v === "__all__" ? undefined : v })}>
            <SelectTrigger className="h-11 bg-white border-gray-200 focus:border-orange-500 focus:ring-orange-500/20">
              <SelectValue placeholder="Todos los segmentos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {segmentos.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Temporada */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Filtrar por Temporada</label>
          <Select value={filtros.temporadaId ?? ""} onValueChange={(v) => handleChange({ temporadaId: v === "__all__" ? undefined : v })}>
            <SelectTrigger className="h-11 bg-white border-gray-200 focus:border-orange-500 focus:ring-orange-500/20">
              <SelectValue placeholder="Todas las temporadas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {temporadas.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Estado */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Filtrar por Estado</label>
          <Select value={filtros.estado ?? ""} onValueChange={(v) => handleChange({ estado: (v === "__all__" ? undefined : (v as FiltrosGruposState["estado"])) })}>
            <SelectTrigger className="h-11 bg-white border-gray-200 focus:border-orange-500 focus:ring-orange-500/20">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              <SelectItem value="activo">Activo</SelectItem>
              <SelectItem value="inactivo">Inactivo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Municipio */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Filtrar por Municipio</label>
          <Select value={filtros.municipioId ?? ""} onValueChange={(v) => handleChange({ municipioId: v === "__all__" ? undefined : v, parroquiaId: undefined })}>
            <SelectTrigger className="h-11 bg-white border-gray-200 focus:border-orange-500 focus:ring-orange-500/20">
              <SelectValue placeholder="Todos los municipios" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {municipios.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Parroquia */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Filtrar por Parroquia</label>
          <Select value={filtros.parroquiaId ?? ""} onValueChange={(v) => handleChange({ parroquiaId: v === "__all__" ? undefined : v })}>
            <SelectTrigger className="h-11 bg-white border-gray-200 focus:border-orange-500 focus:ring-orange-500/20">
              <SelectValue placeholder="Todas las parroquias" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {parroquiasFiltradas.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t border-gray-200">
        <BotonSistema variante="outline" onClick={limpiar} className="flex-1">
          Limpiar filtros
        </BotonSistema>
      </div>
    </div>
  )
}
