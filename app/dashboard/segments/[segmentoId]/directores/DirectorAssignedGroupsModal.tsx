"use client";
import React, { useEffect, useMemo, useState } from 'react'
import { useDirectorGroupAssignments } from '@/hooks/useDirectorGroupAssignments'
import { createPortal } from 'react-dom'
import { TituloSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { X, RefreshCw, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
      <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[310] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col pointer-events-auto overflow-hidden border border-gray-200">
          {/* Header */}
          <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-br from-orange-50 to-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center text-white">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <TituloSistema nivel={3} className="mb-0">Grupos Asignados</TituloSistema>
                  <TextoSistema variante="sutil" className="text-xs">{directorNombre || 'Director'}</TextoSistema>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={()=>refresh()}>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Refrescar
                </Button>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>
          </div>

          {/* Filtros */}
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1.5 flex-1 min-w-[180px]">
                <label className="text-[10px] uppercase tracking-wide font-medium text-gray-600">Buscar</label>
                <input 
                  value={buscar} 
                  onChange={e=>setBuscar(e.target.value)} 
                  placeholder="Nombre o líder" 
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400/40"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wide font-medium text-gray-600">Temporada</label>
                <select 
                  value={filtroTemporada} 
                  onChange={e=>setFiltroTemporada(e.target.value)} 
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400/40 min-w-[140px]"
                >
                  <option value="">Todas</option>
                  {temporadas.map(t=> <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wide font-medium text-gray-600">Estado</label>
                <select 
                  value={filtroActivo} 
                  onChange={e=>setFiltroActivo(e.target.value as any)} 
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400/40"
                >
                  <option value="todos">Todos</option>
                  <option value="activos">Activos</option>
                  <option value="inactivos">Inactivos</option>
                </select>
              </div>
              {(buscar||filtroTemporada||filtroActivo!=='todos') && (
                <Button variant="outline" size="sm" onClick={()=>{setBuscar('');setFiltroTemporada('');setFiltroActivo('todos')}}>
                  Limpiar
                </Button>
              )}
              <div className="ml-auto self-center">
                <BadgeSistema variante="info" className="text-xs">Total: {lista.length}</BadgeSistema>
              </div>
            </div>
          </div>

          {/* Lista de grupos */}
          <div className="flex-1 overflow-auto px-6 py-4">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <TextoSistema variante="sutil">Cargando grupos...</TextoSistema>
              </div>
            )}
            {!loading && lista.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <TextoSistema variante="sutil">Sin grupos asignados.</TextoSistema>
              </div>
            )}
            {!loading && lista.length > 0 && (
              <div className="space-y-3">
                {lista.map(g => (
                  <div key={g.id} className="bg-white/50 border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-800 text-base truncate" title={g.nombre}>{g.nombre}</h4>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {g.activo === false ? (
                          <BadgeSistema variante="default">Inactivo</BadgeSistema>
                        ) : (
                          <BadgeSistema variante="success">Activo</BadgeSistema>
                        )}
                        {g.temporadaNombre && (
                          <BadgeSistema variante="info">{g.temporadaNombre}</BadgeSistema>
                        )}
                        {g.directoresCount && g.directoresCount > 1 && (
                          <BadgeSistema variante="warning" title="Total directores asignados">{g.directoresCount} dir</BadgeSistema>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        <strong>Miembros:</strong> {g.miembrosCount ?? 0}
                      </span>
                      <span>
                        <strong>Líderes:</strong> {g.lideres && g.lideres.length ? g.lideres.join(', ') : '—'}
                      </span>
                      {g.directoresSample && g.directoresSample.length > 0 && (
                        <span className="truncate max-w-[280px]" title={`Otros directores: ${g.directoresSample.join(', ')}`}>
                          <strong>Otros dir:</strong> {g.directoresSample.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
