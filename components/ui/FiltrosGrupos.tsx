"use client"

import { useMemo, useCallback } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"

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
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 w-full">
        {/* Segmento */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">Filtrar por Segmento</label>
          <Select value={filtros.segmentoId ?? ""} onValueChange={(v) => handleChange({ segmentoId: v === "__all__" ? undefined : v })}>
            <SelectTrigger className="bg-white/60 backdrop-blur border-gray-200">
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
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">Filtrar por Temporada</label>
          <Select value={filtros.temporadaId ?? ""} onValueChange={(v) => handleChange({ temporadaId: v === "__all__" ? undefined : v })}>
            <SelectTrigger className="bg-white/60 backdrop-blur border-gray-200">
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
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">Filtrar por Estado</label>
          <Select value={filtros.estado ?? ""} onValueChange={(v) => handleChange({ estado: (v === "__all__" ? undefined : (v as FiltrosGruposState["estado"])) })}>
            <SelectTrigger className="bg-white/60 backdrop-blur border-gray-200">
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
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">Filtrar por Municipio</label>
          <Select value={filtros.municipioId ?? ""} onValueChange={(v) => handleChange({ municipioId: v === "__all__" ? undefined : v, parroquiaId: undefined })}>
            <SelectTrigger className="bg-white/60 backdrop-blur border-gray-200">
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
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">Filtrar por Parroquia</label>
          <Select value={filtros.parroquiaId ?? ""} onValueChange={(v) => handleChange({ parroquiaId: v === "__all__" ? undefined : v })}>
            <SelectTrigger className="bg-white/60 backdrop-blur border-gray-200">
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

      <div className="flex gap-2 sticky bottom-0 bg-background/60 backdrop-blur p-2 rounded-xl sm:static sm:bg-transparent sm:p-0">
        <Button variant="secondary" onClick={limpiar} className="w-full sm:w-auto">Limpiar filtros</Button>
      </div>
    </div>
  )
}
