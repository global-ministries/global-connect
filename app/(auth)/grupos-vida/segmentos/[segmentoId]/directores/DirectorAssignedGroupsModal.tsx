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
  const [filtroActivo, setFiltroActivo] = useState<'todos' | 'activos' | 'inactivos'>('todos')

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const temporadas = useMemo(() => {
    const set = new Set<string>()
    grupos.forEach(g => { if (g.asignado && g.temporadaNombre) set.add(g.temporadaNombre) })
    return [...set].sort((a, b) => a.localeCompare(b, 'es'))
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
        const lideres = (g.lideres || []).map(x => norm(x)).join(' ')
        return nombre.includes(term) || lideres.includes(term)
      })
    }
    return l.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [grupos, buscar, filtroTemporada, filtroActivo])

  if (!open) return null

  const ui = (
    <>
      <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[310] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
        <div className="bg-card rounded-t-2xl sm:rounded-3xl shadow-2xl w-full sm:max-w-4xl max-h-[92vh] sm:max-h-[90vh] flex flex-col pointer-events-auto overflow-hidden border border-border">
          {/* Header */}
          <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-border bg-gradient-to-br from-accent to-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center text-white flex-shrink-0">
                  <Users className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <TituloSistema nivel={3} className="mb-0 text-base sm:text-lg">Grupos Asignados</TituloSistema>
                  <TextoSistema variante="sutil" className="text-xs truncate">{directorNombre || 'Director'}</TextoSistema>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button variant="outline" size="sm" onClick={() => refresh()}>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Refrescar
                </Button>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-accent transition-colors">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
            </div>
          </div>

          {/* Filtros */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 bg-muted border-b border-border">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 sm:gap-3 items-end">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">Buscar</label>
                <input
                  value={buscar}
                  onChange={e => setBuscar(e.target.value)}
                  placeholder="Nombre o líder"
                  className="border border-border rounded-lg px-3 py-2.5 sm:py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-orange-400/40"
                />
              </div>
              <div className="grid grid-cols-2 sm:flex gap-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">Temporada</label>
                  <select
                    value={filtroTemporada}
                    onChange={e => setFiltroTemporada(e.target.value)}
                    className="border border-border rounded-lg px-3 py-2.5 sm:py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-orange-400/40"
                  >
                    <option value="">Todas</option>
                    {temporadas.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">Estado</label>
                  <select
                    value={filtroActivo}
                    onChange={e => setFiltroActivo(e.target.value as any)}
                    className="border border-border rounded-lg px-3 py-2.5 sm:py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-orange-400/40"
                  >
                    <option value="todos">Todos</option>
                    <option value="activos">Activos</option>
                    <option value="inactivos">Inactivos</option>
                  </select>
                </div>
              </div>
              {(buscar || filtroTemporada || filtroActivo !== 'todos') && (
                <Button variant="outline" size="sm" className="self-end" onClick={() => { setBuscar(''); setFiltroTemporada(''); setFiltroActivo('todos') }}>
                  Limpiar
                </Button>
              )}
            </div>
            <div className="flex justify-end mt-2">
              <BadgeSistema variante="info" className="text-xs">Total: {lista.length}</BadgeSistema>
            </div>
          </div>

          {/* Lista de grupos */}
          <div className="flex-1 overflow-auto px-4 sm:px-6 py-3 sm:py-4">
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
              <div className="space-y-0 sm:space-y-3">
                {lista.map(g => (
                  <div key={g.id} className="py-3 sm:p-4 border-b sm:border sm:rounded-xl sm:bg-card/50 sm:hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-foreground text-sm sm:text-base truncate" title={g.nombre}>{g.nombre}</h4>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-2 flex-wrap flex-shrink-0">
                        {g.activo === false ? (
                          <BadgeSistema variante="default" tamaño="sm">Inactivo</BadgeSistema>
                        ) : (
                          <BadgeSistema variante="success" tamaño="sm">Activo</BadgeSistema>
                        )}
                        {g.temporadaNombre && (
                          <BadgeSistema variante="info" tamaño="sm">{g.temporadaNombre}</BadgeSistema>
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] sm:text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {g.miembrosCount ?? 0}
                      </span>
                      <span>
                        <strong>Líd:</strong> {g.lideres && g.lideres.length ? g.lideres.join(', ') : '—'}
                      </span>
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

function norm(s: string) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export default DirectorAssignedGroupsModal
