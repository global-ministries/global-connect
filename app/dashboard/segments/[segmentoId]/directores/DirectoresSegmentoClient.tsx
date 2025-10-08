"use client";
import { useEffect, useState } from 'react'
import DirectorGroupsModal from './DirectorGroupsModal'
import DirectorAssignedGroupsModal from './DirectorAssignedGroupsModal'
import { useSegmentDirectors } from '@/hooks/useSegmentDirectors'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TarjetaSistema, TituloSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { useToast } from '@/hooks/use-toast'

interface Props { segmentoId: string; esSuperior?: boolean }

export default function DirectoresSegmentoClient({ segmentoId, esSuperior = false }: Props) {
  const { data, loading, error, refresh, toggleCiudad, crearDirector, eliminarDirector } = useSegmentDirectors(segmentoId)
  const { toast } = useToast()
  const [showModal, setShowModal] = useState(false)
  const [candidatos, setCandidatos] = useState<{ id: string; nombre: string; yaEnOtroSegmento?: boolean }[]>([])
  const [loadingCandidatos, setLoadingCandidatos] = useState(false)
  const [creando, setCreando] = useState(false)
  const [creandoId, setCreandoId] = useState<string | null>(null)
  const [ciudadSeleccionada, setCiudadSeleccionada] = useState<string>('')
  const [ubicaciones, setUbicaciones] = useState<{ id: string; nombre: string }[]>([])
  const [loadingUbic, setLoadingUbic] = useState(false)

  useEffect(() => {
    const fetchUbic = async () => {
      if (!segmentoId) return
      setLoadingUbic(true)
      try {
        const res = await fetch(`/api/segmentos/${segmentoId}/ubicaciones`)
        if (res.ok) {
          const json = await res.json()
          setUbicaciones(json.ubicaciones || [])
        }
      } finally {
        setLoadingUbic(false)
      }
    }
    fetchUbic()
  }, [segmentoId])

  const handleToggleCiudad = async (directorId: string, ubicacionId: string, currentHas: boolean) => {
    await toggleCiudad({ directorId, segmentoId, segmentoUbicacionId: ubicacionId, accion: currentHas ? 'quitar' : 'agregar' })
  }

  const [modalGruposOpen, setModalGruposOpen] = useState(false)
  const [directorSeleccionado, setDirectorSeleccionado] = useState<{ id: string; nombre: string } | null>(null)
  const [modalVerGruposOpen, setModalVerGruposOpen] = useState(false)

  const abrirModalGrupos = (id: string, nombre: string) => {
    setDirectorSeleccionado({ id, nombre })
    setModalGruposOpen(true)
  }
  const abrirModalVerGrupos = (id: string, nombre: string) => {
    setDirectorSeleccionado({ id, nombre })
    setModalVerGruposOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <TituloSistema nivel={4} className="mb-1">Directores</TituloSistema>
          <TextoSistema variante="sutil" className="text-xs">Asigna ciudades a cada director de etapa.</TextoSistema>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>Refrescar</Button>
          {esSuperior && (
            <Button size="sm" onClick={async ()=> {
              setShowModal(true);
              setLoadingCandidatos(true);
              try {
                const res = await fetch(`/api/segmentos/${segmentoId}/directores-etapa/candidatos`);
                if (res.ok) {
                  const json = await res.json();
                  setCandidatos(json.candidatos || []);
                } else {
                  setCandidatos([]);
                }
              } finally {
                setLoadingCandidatos(false);
              }
            }}>Agregar Director</Button>
          )}
        </div>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <TarjetaSistema className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="text-left p-2 font-medium">Director</th>
                <th className="text-left p-2 font-medium">Ciudad</th>
                <th className="text-left p-2 font-medium w-56">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">Cargando...</td></tr>
              )}
              {!loading && data.length === 0 && (
                <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">Sin directores registrados</td></tr>
              )}
              {data.map(d => {
                return (
                  <tr key={d.id} className="border-t last:border-b bg-white hover:bg-muted/50 transition-colors">
                    <td className="p-3 align-top">
                      <div className="font-medium">{d.nombre}</div>
                      <div className="text-[10px] text-muted-foreground">{d.usuario_id}</div>
                    </td>
                    <td className="p-3 align-top">
                      <div className="flex items-center gap-2 flex-wrap">
                        {(() => {
                          const actual = d.ciudades && d.ciudades.length > 0 ? d.ciudades[0] : null
                          if (!esSuperior) {
                            return <span className="text-[11px] px-2 py-1 rounded border bg-white text-gray-700">{actual || '—'}</span>
                          }
                          return (
                            <div className="flex items-center gap-2">
                              <select
                                disabled={!esSuperior || ubicaciones.length === 0}
                                className="border rounded px-2 py-1 text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-orange-400/40"
                                value={(() => {
                                  if (!actual) return ''
                                  const match = ubicaciones.find(u => u.nombre === actual)
                                  return match ? match.id : ''
                                })()}
                                onChange={async (e) => {
                                  const nuevaId = e.target.value
                                  const matchActual = actual ? ubicaciones.find(u => u.nombre === actual) : null
                                  try {
                                    if (!nuevaId) {
                                      if (matchActual) {
                                        await handleToggleCiudad(d.id, matchActual.id, true)
                                        toast({ title: 'Ciudad quitada' })
                                      }
                                    } else {
                                      // Si había una previa diferente, primero quitar
                                      if (matchActual && matchActual.id !== nuevaId) {
                                        await handleToggleCiudad(d.id, matchActual.id, true)
                                      }
                                      await handleToggleCiudad(d.id, nuevaId, false)
                                      toast({ title: 'Ciudad asignada' })
                                    }
                                  } catch {
                                    toast({ title: 'Error', description: 'Operación fallida', variant: 'destructive' as any })
                                  }
                                }}
                              >
                                <option value="">(Sin ciudad)</option>
                                {ubicaciones.map(u => (
                                  <option key={u.id} value={u.id}>{u.nombre}</option>
                                ))}
                              </select>
                              {actual && (
                                <button
                                  type="button"
                                  disabled={!esSuperior}
                                  onClick={async () => {
                                    const matchActual = ubicaciones.find(u => u.nombre === actual)
                                    if (matchActual) {
                                      await handleToggleCiudad(d.id, matchActual.id, true)
                                      toast({ title: 'Ciudad quitada' })
                                    }
                                  }}
                                  className="text-[10px] px-2 py-1 border rounded bg-white hover:bg-muted disabled:opacity-40"
                                >Quitar</button>
                              )}
                            </div>
                          )
                        })()}
                        {ubicaciones.length === 0 && !loadingUbic && (
                          <span className="text-[11px] text-muted-foreground">Sin ubicaciones definidas</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 align-top space-x-2 whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => abrirModalVerGrupos(d.id, d.nombre)}
                      >Ver grupos</Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => abrirModalGrupos(d.id, d.nombre)}
                      >Asignar grupos</Button>
                      {esSuperior && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={async () => {
                            if (!confirm('¿Eliminar director? Esta acción quitará su ciudad y asignaciones.')) return
                            const ok = await eliminarDirector(d.id)
                            if (ok) {
                              toast({ title: 'Director eliminado' })
                            } else {
                              toast({ title: 'Error', description: 'No se pudo eliminar', variant: 'destructive' as any })
                            }
                          }}
                        >Eliminar</Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </TarjetaSistema>
      <TextoSistema variante="sutil" className="text-[11px]">Pulsa una ciudad para asignar o quitar al director. Usa “Asignar grupos” para gestionar sus grupos supervisados.</TextoSistema>
      {modalGruposOpen && directorSeleccionado && (
        <DirectorGroupsModal
          open={modalGruposOpen}
            onClose={() => { setModalGruposOpen(false); setDirectorSeleccionado(null); }}
          segmentoId={segmentoId}
          directorId={directorSeleccionado.id}
          directorNombre={directorSeleccionado.nombre}
        />
      )}
      {modalVerGruposOpen && directorSeleccionado && (
        <DirectorAssignedGroupsModal
          open={modalVerGruposOpen}
          onClose={() => { setModalVerGruposOpen(false); setDirectorSeleccionado(null) }}
          segmentoId={segmentoId}
          directorId={directorSeleccionado.id}
          directorNombre={directorSeleccionado.nombre}
        />
      )}
  {esSuperior && showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
          <div className="bg-white rounded shadow-lg w-full max-w-md p-4 space-y-4">
            <div className="flex items-center justify-between">
              <TituloSistema nivel={4}>Agregar Director</TituloSistema>
              <button onClick={()=> setShowModal(false)} className="text-xs text-muted-foreground hover:text-foreground">Cerrar</button>
            </div>
            <TextoSistema variante="sutil" className="text-xs mb-2">Selecciona un usuario y opcionalmente una ciudad inicial.</TextoSistema>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Ciudad inicial</label>
              <select
                value={ciudadSeleccionada}
                onChange={e=> setCiudadSeleccionada(e.target.value)}
                className="w-full border rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
              >
                <option value="">(Sin asignar ahora)</option>
                {ubicaciones.map(u => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
            </div>
            <div className="border rounded max-h-64 overflow-auto divide-y">
              {loadingCandidatos && <div className="p-3 text-sm">Cargando...</div>}
              {!loadingCandidatos && candidatos.length === 0 && <div className="p-3 text-sm text-muted-foreground">Sin candidatos disponibles</div>}
              {!loadingCandidatos && candidatos.map(c => (
                <button
                  key={c.id}
                  disabled={creando && creandoId !== null}
                  onClick={async ()=> {
                    if (creando) return;
                    setCreando(true);
                    setCreandoId(c.id);
                    const res = await fetch(`/api/segmentos/${segmentoId}/directores-etapa/crear`, {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ usuario_id: c.id, segmento_ubicacion_id: ciudadSeleccionada || undefined })
                    });
                    const ok = res.ok;
                    let errorMsg: string | null = null;
                    let ciudadError: string | null = null;
                    let ciudadAsignada: string | null = null;
                    if (!ok) {
                      try { const j = await res.json(); errorMsg = (j.error || `HTTP ${res.status}`) + (j.rolesActuales ? ` (roles: ${j.rolesActuales.join(',')})` : ''); } catch { errorMsg = `HTTP ${res.status}` }
                    } else {
                      try {
                        const j = await res.json();
                        if (j.ciudadError) ciudadError = j.ciudadError;
                        if (j.ciudadAsignada) ciudadAsignada = j.ciudadAsignada;
                      } catch {}
                      // Refrescar datos tras éxito
                      refresh();
                    }
                    setCreando(false);
                    setCreandoId(null);
                    if (ok) {
                      setShowModal(false);
                      setCiudadSeleccionada('');
                      if (ciudadError) {
                        toast({ title: 'Director creado (sin ciudad)', description: ciudadError, variant: 'warning' as any });
                      } else {
                        toast({ title: 'Director creado', description: ciudadAsignada ? 'Ciudad asignada correctamente' : 'Sin ciudad inicial', variant: 'default' });
                      }
                    } else {
                      toast({ title: 'Error', description: errorMsg || 'Fallo desconocido', variant: 'destructive' as any });
                    }
                  }}
                  className="w-full text-left p-2 text-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-indigo-400/40 disabled:opacity-50"
                >
                  <span className="flex items-center gap-2 justify-between">
                    <span className="flex items-center gap-2">
                      {creando && creandoId === c.id && (
                        <span className="inline-block w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" aria-label="Creando" />
                      )}
                      <span>{c.nombre}</span>
                    </span>
                    {c.yaEnOtroSegmento && (
                      <BadgeSistema variante="warning" className="text-[10px] leading-none">otro segmento</BadgeSistema>
                    )}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={()=> { setShowModal(false); setCiudadSeleccionada(''); }} disabled={creando}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
