import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDirectorGroupAssignments } from '@/hooks/useDirectorGroupAssignments'
import { useToast } from '@/hooks/use-toast'
import { TituloSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { X, Save, Users, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DirectorGroupsModalProps {
  open: boolean
  onClose: () => void
  segmentoId: string
  directorId: string
  directorNombre?: string
}

// UI mínima basada en tu sistema (asumiendo tailwind + componentes shadcn-like ya usados en el proyecto)
export const DirectorGroupsModal: React.FC<DirectorGroupsModalProps> = ({ open, onClose, segmentoId, directorId, directorNombre }) => {
  const { toast } = useToast()
  const { grupos, loading, error, actualizar, detectarOtrosDirectores, refresh } = useDirectorGroupAssignments(segmentoId, directorId)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [cargandoGuardar, setCargandoGuardar] = useState(false)
  const [modo, setModo] = useState<'merge'|'replace'>('merge') // merge = cambios puntuales, replace = reemplazar todo
  const [confirmData, setConfirmData] = useState<{ grupoId: string; nombres: string[] } | null>(null)
  const [confirmReplace, setConfirmReplace] = useState<{ quitar: number; agregar: number } | null>(null)
  const [filtroActivo, setFiltroActivo] = useState<'todos'|'activos'|'inactivos'>('todos')
  const [filtroTemporada, setFiltroTemporada] = useState<string>('')
  const [buscarLider, setBuscarLider] = useState<string>('')

  // Bloquear scroll fondo cuando está abierto
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [open])

  // Sincroniza selección inicial (grupos ya asignados)
  useEffect(() => {
    if (!open) return
    const s = new Set(grupos.filter(g => g.asignado).map(g => g.id))
    setSeleccion(s)
  }, [open, grupos])

  const toggleGrupo = async (grupoId: string, currentlySelected: boolean, directoresCount: number, sample: string[]) => {
    if (!currentlySelected) {
      // Se intenta agregar. Si ya hay otros directores, pedir confirmación.
      if (directoresCount > 0) {
        // Si en sample no están todos (ejemplo más de 3), podemos fetch detallado on-demand.
        if (directoresCount > sample.length) {
          const otros = await detectarOtrosDirectores(grupoId)
          setConfirmData({ grupoId, nombres: otros })
          return
        } else {
          setConfirmData({ grupoId, nombres: sample })
          return
        }
      }
    }
    // Proceder directo
    setSeleccion(prev => {
      const nuevo = new Set(prev)
      if (currentlySelected) {
        nuevo.delete(grupoId)
      } else {
        nuevo.add(grupoId)
      }
      return nuevo
    })
  }

  const temporadasUnicas = useMemo(() => {
    const set = new Set<string>()
    for (const g of grupos) if (g.temporadaNombre) set.add(g.temporadaNombre)
    return [...set].sort((a,b)=>a.localeCompare(b,'es'))
  }, [grupos])

  const gruposOrdenados = useMemo(() => {
    let lista = [...grupos]
    if (filtroActivo !== 'todos') {
      lista = lista.filter(g => filtroActivo === 'activos' ? g.activo !== false : g.activo === false)
    }
    if (filtroTemporada) {
      lista = lista.filter(g => g.temporadaNombre === filtroTemporada)
    }
    if (buscarLider.trim()) {
      const term = normalizeStr(buscarLider.trim())
      lista = lista.filter(g => {
        if (!g.lideres || g.lideres.length === 0) return false
  return g.lideres.some(l => normalizeStr(l).includes(term))
      })
    }
    lista.sort((a,b) => a.nombre.localeCompare(b.nombre, 'es'))
    return lista
  }, [grupos, filtroActivo, filtroTemporada, buscarLider])

  function normalizeStr(s: string){
    return s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase()
  }

  const guardado = async () => {
    setCargandoGuardar(true)
    try {
      const asignadosOriginal = new Set(grupos.filter(g => g.asignado).map(g => g.id))
      const seleccionNueva = seleccion
      const agregar: string[] = []
      const quitar: string[] = []
      if (modo === 'merge') {
        for (const id of seleccionNueva) if (!asignadosOriginal.has(id)) agregar.push(id)
        for (const id of asignadosOriginal) if (!seleccionNueva.has(id)) quitar.push(id)
      } else { // replace
        for (const id of seleccionNueva) agregar.push(id)
        // calcular quitados para confirmación (no se envían en replace)
        for (const id of asignadosOriginal) if (!seleccionNueva.has(id)) quitar.push(id)
        if (quitar.length > 0 && !confirmReplace) {
          setConfirmReplace({ quitar: quitar.length, agregar: agregar.length })
          setCargandoGuardar(false)
          return
        }
      }
      const payload: any = { agregar, modo }
      if (modo === 'merge') payload.quitar = quitar
      const res = await actualizar(payload)
      toast({ title: 'Asignaciones actualizadas', description: `Agregados: ${res.agregados} | Quitados: ${res.quitados}` })
      refresh()
      onClose()
    } catch (e: any) {
      toast({ title: 'Error guardando', description: e.message || 'Error desconocido', variant: 'destructive' })
    } finally {
      setCargandoGuardar(false)
      setConfirmReplace(null)
    }
  }

  const confirmarAgregar = () => {
    if (!confirmData) return
    const { grupoId } = confirmData
    setSeleccion(prev => {
      const nuevo = new Set(prev)
      nuevo.add(grupoId)
      return nuevo
    })
    setConfirmData(null)
  }

  if (!open) return null

  const modalUi = (
    <>
      <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col pointer-events-auto overflow-hidden border border-gray-200">
          {/* Header */}
          <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-br from-orange-50 to-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center text-white">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <TituloSistema nivel={3} className="mb-0">Asignar Grupos</TituloSistema>
                  <TextoSistema variante="sutil" className="text-xs">{directorNombre || 'Director'}</TextoSistema>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="default" size="sm" onClick={guardado} disabled={cargandoGuardar}>
                  <Save className="w-4 h-4 mr-1" />
                  {cargandoGuardar ? 'Guardando...' : 'Guardar'}
                </Button>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>
          </div>

          {/* Controles y filtros */}
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 space-y-3">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <TextoSistema className="text-sm text-red-700">{error}</TextoSistema>
              </div>
            )}
            
            {/* Modo de guardado */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] uppercase tracking-wide font-medium text-gray-600">Modo de guardado</label>
              <div className="flex items-center gap-2 bg-white rounded-lg p-1 border border-gray-200 w-fit">
                <button
                  type="button"
                  onClick={()=> setModo('merge')}
                  className={`px-3 py-1.5 rounded-md transition text-xs font-medium ${modo==='merge' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}
                >Cambios puntuales</button>
                <button
                  type="button"
                  onClick={()=> setModo('replace')}
                  className={`px-3 py-1.5 rounded-md transition text-xs font-medium ${modo==='replace' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}
                  title="Dejará asignados solamente los grupos seleccionados y quitará el resto"
                >Reemplazar todo</button>
              </div>
              <TextoSistema variante="sutil" className="text-[11px]">
                {modo==='merge' ? '✓ Solo añade o quita respecto a lo existente.' : '⚠️ Reemplazará la lista completa de asignaciones por la selección actual.'}
              </TextoSistema>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1.5 flex-1 min-w-[160px]">
                <label className="text-[10px] uppercase tracking-wide font-medium text-gray-600">Buscar líder</label>
                <input
                  type="text"
                  value={buscarLider}
                  onChange={e=>setBuscarLider(e.target.value)}
                  placeholder="Nombre del líder..."
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400/40"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wide font-medium text-gray-600">Estado</label>
                <select value={filtroActivo} onChange={e=>setFiltroActivo(e.target.value as any)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400/40">
                  <option value="todos">Todos</option>
                  <option value="activos">Activos</option>
                  <option value="inactivos">Inactivos</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wide font-medium text-gray-600">Temporada</label>
                <select value={filtroTemporada} onChange={e=>setFiltroTemporada(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400/40 min-w-[140px]">
                  <option value="">Todas</option>
                  {temporadasUnicas.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {(filtroActivo!=='todos' || filtroTemporada || buscarLider) && (
                <Button variant="outline" size="sm" onClick={()=>{setFiltroActivo('todos'); setFiltroTemporada(''); setBuscarLider('')}}>
                  Limpiar
                </Button>
              )}
              <div className="ml-auto flex items-center gap-3">
                <BadgeSistema variante="neutral" className="text-xs">Total: {gruposOrdenados.length}</BadgeSistema>
                <BadgeSistema variante="info" className="text-xs">Seleccionados: {seleccion.size}</BadgeSistema>
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
            {!loading && gruposOrdenados.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <TextoSistema variante="sutil">No hay grupos disponibles.</TextoSistema>
              </div>
            )}
            {!loading && gruposOrdenados.length > 0 && (
              <div className="space-y-3">
                {gruposOrdenados.map(g => {
                  const checked = seleccion.has(g.id)
                  const multi = g.directoresCount && g.directoresCount > 0
                  return (
                    <label key={g.id} className="flex items-start gap-3 p-4 bg-white/50 border border-gray-200 rounded-xl hover:shadow-md transition-all cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-1 w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400/40"
                        checked={checked}
                        onChange={() => toggleGrupo(g.id, checked, (g.directoresCount||0) - (g.asignado?1:0), g.directoresSample || [])}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <h4 className="font-semibold text-gray-800 text-base truncate" title={g.nombre}>{g.nombre}</h4>
                          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                            {g.activo === false ? (
                              <BadgeSistema variante="neutral">Inactivo</BadgeSistema>
                            ) : (
                              <BadgeSistema variante="success">Activo</BadgeSistema>
                            )}
                            {g.asignado && <BadgeSistema variante="success">Asignado</BadgeSistema>}
                            {multi && (
                              <BadgeSistema variante="info" title="Total de directores en este grupo">{g.directoresCount} dir</BadgeSistema>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                          <span><strong>Temporada:</strong> {g.temporadaNombre || '—'}</span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            <strong>Miembros:</strong> {g.miembrosCount ?? 0}
                          </span>
                          <span><strong>Líderes:</strong> {g.lideres && g.lideres.length ? g.lideres.join(', ') : '—'}</span>
                          {multi && g.directoresSample && g.directoresSample.length > 0 && (
                            <span className="truncate max-w-[280px]" title={`Otros directores: ${g.directoresSample.join(', ')}`}>
                              <strong>Otros dir:</strong> {g.directoresSample.join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {confirmData && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-br from-orange-50 to-white border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center text-white flex-shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <TituloSistema nivel={4} className="mb-0">Agregar otro director</TituloSistema>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <TextoSistema className="text-sm">Este grupo ya tiene {confirmData.nombres.length} director(es):</TextoSistema>
              <ul className="space-y-1 pl-4">
                {confirmData.nombres.map(n => (
                  <li key={n} className="text-sm text-gray-700 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                    {n}
                  </li>
                ))}
              </ul>
              <TextoSistema className="text-sm">¿Confirmas añadir también a <strong>{directorNombre || 'este director'}</strong>?</TextoSistema>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmData(null)}>Cancelar</Button>
                <Button variant="default" size="sm" onClick={confirmarAgregar}>Confirmar</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {confirmReplace && (
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-br from-red-50 to-white border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center text-white flex-shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <TituloSistema nivel={4} className="mb-0">Reemplazar asignaciones</TituloSistema>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <TextoSistema className="text-sm">Vas a dejar asignados únicamente los grupos marcados.</TextoSistema>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <TextoSistema className="text-sm text-amber-900">
                  Se quitarán <strong>{confirmReplace.quitar}</strong> y quedarán <strong>{confirmReplace.agregar}</strong> seleccionados.
                </TextoSistema>
              </div>
              <TextoSistema variante="sutil" className="text-xs">
                ℹ️ Esta acción no afecta a otros directores del mismo grupo.
              </TextoSistema>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmReplace(null)}>Cancelar</Button>
                <Button variant="destructive" size="sm" onClick={() => { guardado() }}>Reemplazar</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )

  return typeof document !== 'undefined' ? createPortal(modalUi, document.body) : null
}

export default DirectorGroupsModal
