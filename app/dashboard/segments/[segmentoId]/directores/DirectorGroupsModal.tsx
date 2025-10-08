import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDirectorGroupAssignments } from '@/hooks/useDirectorGroupAssignments'
import { useToast } from '@/hooks/use-toast'

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
      <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm" />
      <div className="fixed inset-0 z-[160] flex flex-col bg-white dark:bg-neutral-900">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-900/90 backdrop-blur">
        <h2 className="font-semibold text-lg">Asignar Grupos a {directorNombre || 'Director'}</h2>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-neutral-600 hover:bg-gray-50 dark:hover:bg-neutral-800">Cerrar</button>
          <button disabled={cargandoGuardar} onClick={guardado} className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
            {cargandoGuardar ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-6 py-4 space-y-4 overflow-auto">
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2 flex-1">
              <div className="text-sm text-gray-600 dark:text-gray-400">Selecciona los grupos. Elige cómo aplicar los cambios:</div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-neutral-800 rounded p-1">
                  <button
                    type="button"
                    onClick={()=> setModo('merge')}
                    className={`px-2 py-1 rounded transition text-xs ${modo==='merge' ? 'bg-white dark:bg-neutral-700 shadow font-medium' : 'opacity-70 hover:opacity-100'}`}
                    aria-pressed={modo==='merge'}
                  >Cambios puntuales</button>
                  <button
                    type="button"
                    onClick={()=> setModo('replace')}
                    className={`px-2 py-1 rounded transition text-xs ${modo==='replace' ? 'bg-white dark:bg-neutral-700 shadow font-medium' : 'opacity-70 hover:opacity-100'}`}
                    aria-pressed={modo==='replace'}
                    title="Dejará asignados solamente los grupos seleccionados y quitará el resto"
                  >Reemplazar todo</button>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <select value={filtroActivo} onChange={e=>setFiltroActivo(e.target.value as any)} className="border border-gray-300 dark:border-neutral-700 rounded px-2 py-1 bg-white dark:bg-neutral-800">
                    <option value="todos">Todos</option>
                    <option value="activos">Activos</option>
                    <option value="inactivos">Inactivos</option>
                  </select>
                  <select value={filtroTemporada} onChange={e=>setFiltroTemporada(e.target.value)} className="border border-gray-300 dark:border-neutral-700 rounded px-2 py-1 bg-white dark:bg-neutral-800 min-w-[140px]">
                    <option value="">Todas las temporadas</option>
                    {temporadasUnicas.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    type="text"
                    value={buscarLider}
                    onChange={e=>setBuscarLider(e.target.value)}
                    placeholder="Buscar líder..."
                    className="border border-gray-300 dark:border-neutral-700 rounded px-2 py-1 bg-white dark:bg-neutral-800 placeholder:text-gray-400 dark:placeholder:text-neutral-500 w-40"
                  />
                  {(filtroActivo!=='todos' || filtroTemporada) && (
                    <button onClick={()=>{setFiltroActivo('todos'); setFiltroTemporada('')}} className="text-xs text-blue-600 hover:underline">Limpiar filtros</button>
                  )}
                </div>
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                {modo==='merge' ? 'Solo añade o quita respecto a lo existente.' : 'Reemplazará la lista completa de asignaciones por la selección actual.'}
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="text-gray-500 dark:text-gray-400">Total grupos: {gruposOrdenados.length}</div>
              <div className="text-gray-500 dark:text-gray-400">Seleccionados: {seleccion.size}</div>
            </div>
          </div>
          <div className="h-[calc(100vh-260px)] overflow-auto rounded border border-gray-200 dark:border-neutral-800 divide-y divide-gray-100 dark:divide-neutral-800">
            {loading && <div className="p-4 text-sm">Cargando...</div>}
            {!loading && gruposOrdenados.length === 0 && <div className="p-4 text-sm text-gray-500">No hay grupos.</div>}
            {!loading && gruposOrdenados.map(g => {
              const checked = seleccion.has(g.id)
              const multi = g.directoresCount && g.directoresCount > 0
              return (
                <label key={g.id} className="flex items-start gap-3 p-2 hover:bg-gray-50 dark:hover:bg-neutral-800 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={() => toggleGrupo(g.id, checked, (g.directoresCount||0) - (g.asignado?1:0), g.directoresSample || [])}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate" title={g.nombre}>{g.nombre}</span>
                      {g.activo === false
                        ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">Inactivo</span>
                        : <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-300">Activo</span>
                      }
                      {g.asignado && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-300">Asignado</span>}
                      {multi && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-600/20 dark:text-indigo-300" title="Total de directores en este grupo">
                          {g.directoresCount} dir
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-600 dark:text-gray-400 space-x-2 flex flex-wrap items-center">
                      <span>Temporada: {g.temporadaNombre || '—'}</span>
                      <span>Miembros: {g.miembrosCount ?? 0}</span>
                      <span>Líderes: {g.lideres && g.lideres.length ? g.lideres.join(', ') : '—'}</span>
                      {multi && g.directoresSample && g.directoresSample.length > 0 && (
                        <span className="truncate max-w-[200px]" title={`Otros directores: ${g.directoresSample.join(', ')}`}>Otros dir: {g.directoresSample.join(', ')}</span>
                      )}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
          </div>
        </div>
      </div>

      {confirmData && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-lg bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 shadow-xl p-5 space-y-4">
            <h3 className="font-semibold text-base">Agregar otro director a este grupo</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">Este grupo ya tiene {confirmData.nombres.length} director(es):</p>
            <ul className="text-sm list-disc list-inside text-gray-700 dark:text-gray-200">
              {confirmData.nombres.map(n => <li key={n}>{n}</li>)}
            </ul>
            <p className="text-sm text-gray-600 dark:text-gray-300">¿Confirmas añadir también a {directorNombre || 'este director'}?</p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setConfirmData(null)} className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-neutral-600 hover:bg-gray-50 dark:hover:bg-neutral-800">Cancelar</button>
              <button onClick={confirmarAgregar} className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Confirmar</button>
            </div>
          </div>
        </div>
      )}
      {confirmReplace && (
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-lg bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 shadow-xl p-5 space-y-4">
            <h3 className="font-semibold text-base">Reemplazar asignaciones</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300">Vas a dejar asignados únicamente los grupos marcados.</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">Se quitarán <strong>{confirmReplace.quitar}</strong> y quedarán <strong>{confirmReplace.agregar}</strong> seleccionados.</p>
            <p className="text-xs text-amber-600 dark:text-amber-400">Esta acción no afecta a otros directores del mismo grupo.</p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setConfirmReplace(null)} className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-neutral-600 hover:bg-gray-50 dark:hover:bg-neutral-800">Cancelar</button>
              <button
                onClick={() => { guardado() }}
                className="px-4 py-1.5 text-sm rounded bg-red-600 text-white hover:bg-red-700"
              >Reemplazar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  return typeof document !== 'undefined' ? createPortal(modalUi, document.body) : null
}

export default DirectorGroupsModal
