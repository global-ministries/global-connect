"use client";
import React, { useEffect, useMemo, useState } from 'react'
import { useDirectorGroupAssignments } from '@/hooks/useDirectorGroupAssignments'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  onClose: () => void
  segmentoId: string
  directorId: string
  directorNombre?: string
}

export const DirectorAssignedGroupsModal: React.FC<Props> = ({ open, onClose, segmentoId, directorId, directorNombre }) => {
  const { grupos, loading, error, refresh } = useDirectorGroupAssignments(segmentoId, directorId)
  const [buscar, setBuscar] = useState('')
  const [filtroTemporada, setFiltroTemporada] = useState('')
  const [filtroActivo, setFiltroActivo] = useState<'todos'|'activos'|'inactivos'>('todos')

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const temporadas = useMemo(() => {
    const set = new Set<string>()
    grupos.forEach(g => { if (g.asignado && g.temporadaNombre) set.add(g.temporadaNombre) })
    return [...set].sort((a,b)=>a.localeCompare(b,'es'))
  }, [grupos])

  const lista = useMemo(() => {
    let l = grupos.filter(g => g.asignado)
    if (filtroTemporada) l = l.filter(g => g.temporadaNombre === filtroTemporada)
    if (filtroActivo !== 'todos') {
      l = l.filter(g => filtroActivo === 'activos' ? g.activo !== false : g.activo === false)
    }
    if (buscar.trim()) {
      const term = norm(buscar)
      l = l.filter(g => {
        const nombre = norm(g.nombre)
        const lideres = (g.lideres||[]).map(x=>norm(x)).join(' ')
        return nombre.includes(term) || lideres.includes(term)
      })
    }
    return l.sort((a,b)=> a.nombre.localeCompare(b.nombre,'es'))
  }, [grupos, buscar, filtroTemporada, filtroActivo])

  if (!open) return null

  const ui = (
    <>
      <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm" />
      <div className="fixed inset-0 z-[310] flex flex-col bg-white dark:bg-neutral-900">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-900/90 backdrop-blur">
          <h2 className="font-semibold text-lg">Grupos de {directorNombre || 'Director'}</h2>
          <div className="flex items-center gap-2">
            <button onClick={()=>refresh()} className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-neutral-600 hover:bg-gray-50 dark:hover:bg-neutral-800">Refrescar</button>
            <button onClick={onClose} className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-neutral-600 hover:bg-gray-50 dark:hover:bg-neutral-800">Cerrar</button>
          </div>
        </div>
        <div className="px-6 py-4 flex flex-col gap-4 overflow-hidden flex-1">
          <div className="flex flex-wrap gap-2 items-end text-xs">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wide text-gray-500">Buscar</label>
              <input value={buscar} onChange={e=>setBuscar(e.target.value)} placeholder="Nombre o líder" className="border border-gray-300 dark:border-neutral-700 rounded px-2 py-1 text-xs bg-white dark:bg-neutral-800" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wide text-gray-500">Temporada</label>
              <select value={filtroTemporada} onChange={e=>setFiltroTemporada(e.target.value)} className="border border-gray-300 dark:border-neutral-700 rounded px-2 py-1 text-xs bg-white dark:bg-neutral-800 min-w-[140px]">
                <option value="">Todas</option>
                {temporadas.map(t=> <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wide text-gray-500">Estado</label>
              <select value={filtroActivo} onChange={e=>setFiltroActivo(e.target.value as any)} className="border border-gray-300 dark:border-neutral-700 rounded px-2 py-1 text-xs bg-white dark:bg-neutral-800">
                <option value="todos">Todos</option>
                <option value="activos">Activos</option>
                <option value="inactivos">Inactivos</option>
              </select>
            </div>
            {(buscar||filtroTemporada||filtroActivo!=='todos') && (
              <button onClick={()=>{setBuscar('');setFiltroTemporada('');setFiltroActivo('todos')}} className="h-7 mt-4 px-2 rounded text-xs bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700">Limpiar</button>
            )}
            <div className="ml-auto text-[11px] text-gray-500">Total: {lista.length}</div>
          </div>
          <div className="flex-1 overflow-auto rounded border border-gray-200 dark:border-neutral-800 divide-y divide-gray-100 dark:divide-neutral-800">
            {loading && <div className="p-4 text-sm">Cargando...</div>}
            {!loading && lista.length === 0 && <div className="p-4 text-sm text-gray-500">Sin grupos asignados.</div>}
            {!loading && lista.map(g => (
              <div key={g.id} className="p-3 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate" title={g.nombre}>{g.nombre}</span>
                  {g.activo === false ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-300 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">Inactivo</span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-300">Activo</span>
                  )}
                  {g.temporadaNombre && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-600/20 dark:text-indigo-300">{g.temporadaNombre}</span>
                  )}
                  {g.directoresCount && g.directoresCount > 1 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-600/20 dark:text-orange-300" title="Total directores asignados">{g.directoresCount} dir</span>
                  )}
                </div>
                <div className="text-[11px] text-gray-600 dark:text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
                  <span>Miembros: {g.miembrosCount ?? 0}</span>
                  <span>Líderes: {g.lideres && g.lideres.length ? g.lideres.join(', ') : '—'}</span>
                  {g.directoresSample && g.directoresSample.length > 0 && (
                    <span className="truncate max-w-[240px]" title={`Otros directores: ${g.directoresSample.join(', ')}`}>Otros dir: {g.directoresSample.join(', ')}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )

  return typeof document !== 'undefined' ? createPortal(ui, document.body) : null
}

function norm(s: string){
  return s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase()
}

export default DirectorAssignedGroupsModal
