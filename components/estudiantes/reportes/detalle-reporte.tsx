'use client'

/**
 * Estudiantes › Reportes — the read-only drawer (artboards 11 / 12 `#grupo`,
 * `#persona`, `#etapa`): one `DetalleResponsivo` (side panel from md, bottom
 * sheet below) that swaps views instead of stacking sheets (gap G8):
 * - Grupo: meta, "N reuniones sin marcar" (warning), Reuniones · Promedio de
 *   presentes · Asistencia · Visitantes nuevos, the trend sentence, its
 *   meetings (read-only rows, "Sin marcar") and its members (rows that open
 *   the person, back "‹ <grupo>").
 * - Persona: "Faltó las últimas N reuniones" (warning, with the leaders), the
 *   key figures, the note (a move of group, since when it counts, unmarked
 *   meetings, Dream Team service) and "Reunión por reunión" with the group of
 *   each meeting when the range spans more than one (L48); "Ver <grupo>"
 *   unless it was opened from that group. No contact actions (A33). For The
 *   Living Room the panel opens at `lg` and the «Conexiones» cards sit
 *   between the note and "Reunión por reunión" (S21, A41, A42).
 * - Etapa: the people of one funnel step; Sin grupo rows open nothing, En
 *   grupo / Sirviendo rows open the person (back "‹ <etapa>").
 * Group, person and connections data load through
 * lib/actions/estudiantes-reportes.actions.ts when the view opens and stay
 * cached while the range is the same; the connections load on their own, so
 * a failure there never hides the attendance.
 */
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'

import { BadgeSistema, BotonSistema } from '@/components/ui/sistema-diseno'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { BotonAtrasMovil } from '@/components/ui/barra-navegacion-movil'
import { EstadoVacioSistema, SkeletonLista } from '@/components/ui/estado-vacio-sistema'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { conexionesPersonaReporte, detalleGrupoReporte, detallePersonaReporte, type ResultadoReporte } from '@/lib/actions/estudiantes-reportes.actions'
import type { ConexionesPersona } from '@/lib/platform/estudiantes/conexiones'
import {
  vistaDetalleGrupo,
  vistaDetallePersona,
  vistaEtapa,
  type DetalleGrupoReporte,
  type DetallePersonaReporte,
  type Embudo,
  type IdEtapa,
  type RangoReporte,
} from '@/lib/platform/estudiantes/reportes'

import { FilaInset, FilaNavegable, ListaInset, TituloSeccion } from '../filas-inset'
import { AvisoPromocion } from '../promocion/partes-promocion'
import { AvatarIniciales } from '../vivo/franja-visitantes'
import { SeccionConexiones } from './conexiones-persona'
import { DatosClave } from './partes-reportes'

export type VistaReporte =
  | { readonly tipo: 'grupo'; readonly grupoId: string }
  | { readonly tipo: 'persona'; readonly personaId: string }
  | { readonly tipo: 'etapa'; readonly etapa: IdEtapa }

export interface PilaReporte {
  readonly vista: VistaReporte
  /** The view "‹ back" returns to, with its label. */
  readonly volver: { readonly vista: VistaReporte; readonly etiqueta: string } | null
}

type Carga<T> = { readonly estado: 'cargando' } | { readonly estado: 'listo'; readonly data: T } | { readonly estado: 'error'; readonly mensaje: string }

const SIN_CONEXION = 'No se pudo cargar. Revisa tu conexión e inténtalo de nuevo.'

/** Loads a detail once per key; `reintentar` asks again. */
function useCarga<T>(clave: string | null, pedir: () => Promise<ResultadoReporte<T>>): { readonly carga: Carga<T>; readonly reintentar: () => void } {
  const cache = useRef(new Map<string, T>())
  const [estado, setEstado] = useState<{ readonly clave: string | null; readonly carga: Carga<T> }>({ clave: null, carga: { estado: 'cargando' } })
  const [intento, setIntento] = useState(0)
  const pedirRef = useRef(pedir)
  // Declared before the loading effect, so it always calls the latest request.
  useEffect(() => {
    pedirRef.current = pedir
  })

  useEffect(() => {
    if (!clave) return
    const guardado = cache.current.get(clave)
    if (guardado) {
      setEstado({ clave, carga: { estado: 'listo', data: guardado } })
      return
    }
    let vigente = true
    setEstado({ clave, carga: { estado: 'cargando' } })
    pedirRef.current().then(
      (r) => {
        if (!vigente) return
        if (r.ok) cache.current.set(clave, r.data)
        setEstado({ clave, carga: r.ok ? { estado: 'listo', data: r.data } : { estado: 'error', mensaje: r.message } })
      },
      () => vigente && setEstado({ clave, carga: { estado: 'error', mensaje: SIN_CONEXION } }),
    )
    return () => {
      vigente = false
    }
  }, [clave, intento])

  return { carga: estado.clave === clave ? estado.carga : { estado: 'cargando' }, reintentar: () => setIntento((n) => n + 1) }
}

function Cargando(): ReactElement {
  return (
    <div aria-busy="true" className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <SkeletonLista filas={4} />
    </div>
  )
}

function ErrorCarga({ mensaje, onReintentar }: { readonly mensaje: string; readonly onReintentar: () => void }): ReactElement {
  return (
    <div className="space-y-3">
      <AvisoFormulario tono="error">{mensaje}</AvisoFormulario>
      <BotonSistema type="button" variante="outline" tamaño="sm" onClick={onReintentar}>
        Reintentar
      </BotonSistema>
    </div>
  )
}

const Nota = ({ children }: { readonly children: ReactNode }): ReactElement => <p className="text-sm text-muted-foreground">{children}</p>

// ── Group ────────────────────────────────────────────────────────────

function ContenidoGrupo({ detalle, onPersona }: { readonly detalle: DetalleGrupoReporte; readonly onPersona: (personaId: string) => void }): ReactElement {
  const v = vistaDetalleGrupo(detalle)
  return (
    <>
      {v.sinMarcar && (
        <AvisoPromocion tono="warning" titulo={v.sinMarcar.titulo}>
          <p className="text-muted-foreground">{v.sinMarcar.texto}</p>
        </AvisoPromocion>
      )}
      <DatosClave datos={v.datos} />
      <Nota>{v.tendencia}</Nota>
      <section aria-labelledby="reporte-detalle-reuniones" className="space-y-2.5">
        <TituloSeccion id="reporte-detalle-reuniones" texto="Reuniones" cantidad={v.reuniones.length} />
        {v.reuniones.length ? (
          <ListaInset etiqueta="Reuniones">
            {v.reuniones.map((r) => (
              <FilaInset
                key={r.clave}
                titulo={r.fecha}
                subtitulo={r.sinMarcar ? <span className="text-warning-text">{r.detalle}</span> : r.detalle}
                accion={
                  r.sinMarcar ? (
                    <BadgeSistema variante="warning" tamaño="sm">
                      Sin marcar
                    </BadgeSistema>
                  ) : (
                    <span className="font-mono text-sm tabular-nums text-foreground">{r.porcentaje}</span>
                  )
                }
              />
            ))}
          </ListaInset>
        ) : (
          <Nota>{`No tuvo reuniones ${v.rango}.`}</Nota>
        )}
      </section>
      <section aria-labelledby="reporte-detalle-integrantes" className="space-y-2.5">
        <TituloSeccion id="reporte-detalle-integrantes" texto="Integrantes" cantidad={v.integrantes.length} />
        {v.integrantes.length ? (
          <ListaInset etiqueta="Integrantes">
            {v.integrantes.map((p) => (
              <FilaNavegable
                key={p.personaId}
                avatar={<AvatarIniciales nombre={p.nombre} />}
                titulo={p.nombre}
                subtitulo={<span className="font-mono tabular-nums">{p.detalle}</span>}
                etiqueta={`Ver la asistencia de ${p.nombre}`}
                onAbrir={() => onPersona(p.personaId)}
              />
            ))}
          </ListaInset>
        ) : (
          <Nota>Este grupo no tiene integrantes hoy.</Nota>
        )}
      </section>
    </>
  )
}

// ── Person ───────────────────────────────────────────────────────────

export interface ContextoPersonaReporte {
  readonly ambito: string
  readonly lideresDe: (grupoId: string) => readonly string[]
  readonly servicioDe: (personaId: string) => string | null
}

function ContenidoPersona({
  detalle,
  contexto,
  desdeGrupoId,
  onGrupo,
  conexiones,
}: {
  readonly detalle: DetallePersonaReporte
  readonly contexto: ContextoPersonaReporte
  readonly desdeGrupoId: string | null
  readonly onGrupo: (grupoId: string, nombre: string) => void
  /** The Living Room «Conexiones» section (S21). */
  readonly conexiones?: ReactNode
}): ReactElement {
  const actual = detalle.membresias.find((m) => m.activo) ?? null
  const v = vistaDetallePersona(detalle, {
    ambito: contexto.ambito,
    lideres: actual ? contexto.lideresDe(actual.grupoId) : [],
    servicio: contexto.servicioDe(detalle.persona.personaId),
  })
  return (
    <>
      <p className="text-sm text-muted-foreground">{v.meta}</p>
      {v.alerta && (
        <AvisoPromocion tono="warning" titulo={v.alerta.titulo}>
          <p className="text-muted-foreground">{v.alerta.texto}</p>
        </AvisoPromocion>
      )}
      <DatosClave datos={v.datos} />
      {v.nota && <Nota>{v.nota}</Nota>}
      {conexiones}
      <section aria-labelledby="reporte-detalle-marcas" className="space-y-2.5">
        <TituloSeccion id="reporte-detalle-marcas" texto="Reunión por reunión" cantidad={v.reuniones.length} />
        {v.reuniones.length ? (
          <ListaInset etiqueta="Reunión por reunión">
            {v.reuniones.map((r) => (
              <FilaInset key={r.clave} titulo={r.fecha} subtitulo={r.detalle} accion={<PuntoEstado tono={r.estado.tono} etiqueta={r.estado.etiqueta} />} />
            ))}
          </ListaInset>
        ) : (
          <Nota>Su grupo no tuvo reuniones en este rango.</Nota>
        )}
      </section>
      {v.grupoActual && v.grupoActual.grupoId !== desdeGrupoId && (
        <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => onGrupo(v.grupoActual!.grupoId, v.grupoActual!.nombre)}>
          {`Ver ${v.grupoActual.nombre}`}
        </BotonSistema>
      )}
    </>
  )
}

// ── Funnel step ──────────────────────────────────────────────────────

function ContenidoEtapa({ embudo, etapa, alcance, onPersona }: { readonly embudo: Embudo; readonly etapa: IdEtapa; readonly alcance: string; readonly onPersona: (personaId: string) => void }): ReactElement {
  const v = vistaEtapa(embudo, etapa, alcance)
  if (v.filas.length === 0) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
        <EstadoVacioSistema titulo={v.vacio.titulo} subtitulo={v.vacio.subtitulo} />
      </div>
    )
  }
  return (
    <>
      <ListaInset etiqueta={v.titulo}>
        {v.filas.map((f) =>
          f.navegable ? (
            <FilaNavegable
              key={f.personaId}
              avatar={<AvatarIniciales nombre={f.nombre} />}
              titulo={f.nombre}
              subtitulo={f.detalle}
              etiqueta={`Ver la asistencia de ${f.nombre}`}
              onAbrir={() => onPersona(f.personaId)}
            />
          ) : (
            <FilaInset
              key={f.personaId}
              avatar={<AvatarIniciales nombre={f.nombre} />}
              titulo={f.nombre}
              subtitulo={f.detalle}
              accion={
                f.insignia ? (
                  <BadgeSistema variante={f.insignia === 'Visitante' ? 'info' : 'default'} tamaño="sm">
                    {f.insignia}
                  </BadgeSistema>
                ) : undefined
              }
            />
          ),
        )}
      </ListaInset>
      {v.nota && <Nota>{v.nota}</Nota>}
    </>
  )
}

// ── The drawer ───────────────────────────────────────────────────────

export interface DetalleReporteProps {
  readonly pila: PilaReporte | null
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  readonly onIr: (pila: PilaReporte) => void
  readonly rango: RangoReporte
  readonly ambitoId: string
  readonly embudo: Embudo | null
  /** Scope line of the funnel drawer ("Transit · Grupos de Chicas"). */
  readonly alcance: string
  readonly contexto: ContextoPersonaReporte
  /** Names known from the lists, shown while a detail loads. */
  readonly nombreGrupo: (grupoId: string) => string | null
  readonly nombrePersona: (personaId: string) => string | null
  /** The Living Room: the person view adds the «Conexiones» cards (S21). */
  readonly livingRoom?: boolean
  /** Campus of the report (the connections RPC asks for it). */
  readonly campusId?: string
  /** Today in Caracas, for "hace 1 semana". */
  readonly hoy?: string
}

/** Focuses the inner view when it changes (G8: focus moves with the view). */
function VistaEnfocada({ clave, enfocar, children }: { readonly clave: string; readonly enfocar: boolean; readonly children: ReactNode }): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (enfocar) ref.current?.focus()
  }, [clave, enfocar])
  return (
    <div ref={ref} tabIndex={-1} className="space-y-5 outline-none">
      {children}
    </div>
  )
}

export function DetalleReporte({
  pila,
  abierto,
  onCambioAbierto,
  onIr,
  rango,
  ambitoId,
  embudo,
  alcance,
  contexto,
  nombreGrupo,
  nombrePersona,
  livingRoom = false,
  campusId = '',
  hoy = rango.hasta,
}: DetalleReporteProps): ReactElement | null {
  const vista = pila?.vista ?? null
  const claveRango = `${rango.desde}|${rango.hasta}`
  const grupo = useCarga<DetalleGrupoReporte>(vista?.tipo === 'grupo' ? `${vista.grupoId}|${claveRango}` : null, () =>
    detalleGrupoReporte({ grupoId: vista?.tipo === 'grupo' ? vista.grupoId : '', desde: rango.desde, hasta: rango.hasta }),
  )
  const persona = useCarga<DetallePersonaReporte>(vista?.tipo === 'persona' ? `${vista.personaId}|${ambitoId}|${claveRango}` : null, () =>
    detallePersonaReporte({ personaId: vista?.tipo === 'persona' ? vista.personaId : '', ambitoId, desde: rango.desde, hasta: rango.hasta }),
  )
  const conexiones = useCarga<ConexionesPersona>(livingRoom && vista?.tipo === 'persona' ? `${vista.personaId}|${ambitoId}|${claveRango}` : null, () =>
    conexionesPersonaReporte({ personaId: vista?.tipo === 'persona' ? vista.personaId : '', ambitoId, campusId, desde: rango.desde, hasta: rango.hasta }),
  )
  const clave = !vista ? '' : vista.tipo === 'grupo' ? `g:${vista.grupoId}` : vista.tipo === 'persona' ? `p:${vista.personaId}` : `e:${vista.etapa}`
  // The first view keeps the drawer's own focus; every later view (in or back) takes it (G8).
  const [claveInicial] = useState(clave)
  if (!pila || !vista) return null

  let titulo = ''
  let descripcion: ReactNode
  let contenido: ReactNode
  if (vista.tipo === 'grupo') {
    const carga = grupo.carga
    titulo = carga.estado === 'listo' ? carga.data.grupo.nombre : (nombreGrupo(vista.grupoId) ?? 'Grupo')
    if (carga.estado === 'listo') descripcion = vistaDetalleGrupo(carga.data).meta
    contenido =
      carga.estado === 'cargando' ? (
        <Cargando />
      ) : carga.estado === 'error' ? (
        <ErrorCarga mensaje={carga.mensaje} onReintentar={grupo.reintentar} />
      ) : (
        <ContenidoGrupo detalle={carga.data} onPersona={(personaId) => onIr({ vista: { tipo: 'persona', personaId }, volver: { vista, etiqueta: carga.data.grupo.nombre } })} />
      )
  } else if (vista.tipo === 'persona') {
    const carga = persona.carga
    titulo = carga.estado === 'listo' ? carga.data.persona.nombre : (nombrePersona(vista.personaId) ?? 'Asistencia')
    const desdeGrupoId = pila.volver?.vista.tipo === 'grupo' ? pila.volver.vista.grupoId : null
    contenido =
      carga.estado === 'cargando' ? (
        <Cargando />
      ) : carga.estado === 'error' ? (
        <ErrorCarga mensaje={carga.mensaje} onReintentar={persona.reintentar} />
      ) : (
        <ContenidoPersona
          detalle={carga.data}
          contexto={contexto}
          desdeGrupoId={desdeGrupoId}
          onGrupo={(grupoId) => onIr({ vista: { tipo: 'grupo', grupoId }, volver: { vista, etiqueta: carga.data.persona.nombre } })}
          conexiones={
            livingRoom ? (
              <SeccionConexiones
                persona={conexiones.carga.estado === 'listo' ? conexiones.carga.data : null}
                cargando={conexiones.carga.estado === 'cargando'}
                error={conexiones.carga.estado === 'error' ? conexiones.carga.mensaje : null}
                onReintentar={conexiones.reintentar}
                desde={rango.desde}
                hasta={rango.hasta}
                hoy={hoy}
              />
            ) : undefined
          }
        />
      )
  } else if (embudo) {
    const v = vistaEtapa(embudo, vista.etapa, alcance)
    titulo = `${v.titulo} · ${v.cantidad}`
    descripcion = v.descripcion
    contenido = (
      <ContenidoEtapa embudo={embudo} etapa={vista.etapa} alcance={alcance} onPersona={(personaId) => onIr({ vista: { tipo: 'persona', personaId }, volver: { vista, etiqueta: v.titulo } })} />
    )
  } else {
    return null
  }

  return (
    // The Living Room person view opens wider so the four cards sit 2 × 2 (A41).
    <DetalleResponsivo abierto={abierto} onCambioAbierto={onCambioAbierto} titulo={titulo} descripcion={descripcion} ancho={livingRoom && vista.tipo === 'persona' ? 'lg' : 'md'}>
      <VistaEnfocada clave={clave} enfocar={clave !== claveInicial}>
        {pila.volver && (
          <BotonAtrasMovil atras={{ etiqueta: pila.volver.etiqueta, onClick: () => onIr({ vista: pila.volver!.vista, volver: null }) }} className="-ml-2 max-w-full" />
        )}
        {contenido}
      </VistaEnfocada>
    </DetalleResponsivo>
  )
}
