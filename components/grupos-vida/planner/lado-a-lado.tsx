'use client'

/**
 * Planner — the Lado a lado view (T7 of odd/tasks/planner-gdv.md; artboard
 * 07; S2, S9, S10, S21, S23, S24).
 *
 * Mode "<origen> con <destino>" (default): on the left a group of the origin
 * season, read-only (the groups load when the view opens, scoped by segment
 * on the server, S10); on the right a group of the season in planning,
 * preselected where the origin's leaders are now. Each origin person or
 * couple (one row, S23) says "Ya en <grupo>" or "Sin ubicar"; "Pasar" and
 * "Pasar las N sin ubicar" move them keeping their role (Líder → lider,
 * Colíder → aprendiz, Miembro → miembro) with the spouse rule (S2), and
 * "Siguiente grupo con personas sin ubicar" jumps ahead. Without a group on
 * the right, "Crear grupo copiando este" adds the group and its leaders.
 *
 * Mode "Dos grupos de <destino>": two groups of the season in planning, to
 * move people between them with "Pasar" or by dragging onto a role.
 *
 * Every action adds to the session draft (S24, pasos-planner.tsx); the
 * panes show it at once with the "Sin guardar" marks of the board. Only the
 * groups of the segments the actor edits are offered as destination (S10).
 *
 * Planning style (S25, the team columns of prototipos/planificacion-dps/01):
 * each pane is one flat `rounded-md` column; its head (12px uppercase label,
 * the group select, the summary) sits over a border, then the group's head
 * and its roles as `bg-muted` header rows with 32px person rows, as in the
 * Tablero cards (estilo-planner.ts).
 */
import { useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Copy, SkipForward } from 'lucide-react'

import { BotonSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import {
  etiquetaGrupo,
  nombrePersona,
  normalizar,
  personasDelGrupo,
  type GrupoTablero,
  type PersonaBanco,
  type PersonaGrupo,
  type TemporadaPlanner,
  type TemporadasPlanner,
} from '@/lib/platform/grupos-vida/planner'
import { cn } from '@/lib/utils'

import { AvatarIniciales } from './avatar-iniciales'
import { EtiquetaPlanner, MarcaSinGuardar, type TonoEtiqueta } from './etiqueta'
import {
  CLASE_CABEZA_ROL,
  CLASE_CUENTA_ROL,
  CLASE_FILA_PERSONA,
  CLASE_NOMBRE_FILA,
  CLASE_ROL_VACIO,
  CLASE_SOBRE_DENTRO,
} from './estilo-planner'
import { filasDelRol, nombresFila, rolesGrupo, textoLideres, type RolDestino } from './modelo'
import {
  ROL_DE_LISTA,
  coincideGrupo,
  destinoSugerido,
  filasOrigen,
  opcionGrupo,
  resumenOrigen,
  siguienteConSinUbicar,
  type FilaOrigen,
} from './modelo-lado'
import { usePasos, useZonaSoltar, type Carga } from './contexto-pasos'

/** The origin season's groups as the view loads them. */
export type EstadoOrigen =
  | { readonly tipo: 'cargando' }
  | { readonly tipo: 'error'; readonly mensaje: string }
  | { readonly tipo: 'listo'; readonly grupos: readonly GrupoTablero[] }

export interface AccionesLado {
  readonly pasar: (carga: Carga, destino: GrupoTablero, rol: RolDestino, origen: GrupoTablero | null) => void
  readonly pasarVarios: (filas: readonly { readonly carga: Carga; readonly rol: RolDestino }[], destino: GrupoTablero, origen: GrupoTablero | null) => void
  /** The new group's "tmp:" key, or null when it was not added. */
  readonly crearCopia: (origen: GrupoTablero) => string | null
}

export interface LadoALadoProps {
  readonly temporada: TemporadaPlanner
  readonly capacidades: TemporadasPlanner
  /** The groups of the season in planning with the draft applied. */
  readonly grupos: readonly GrupoTablero[]
  /** The bank rows (draft applied): ages, where they live and where they are now. */
  readonly fichas: ReadonlyMap<string, PersonaBanco>
  readonly origen: EstadoOrigen
  readonly onReintentar: () => void
  readonly busqueda: string
  readonly acciones: AccionesLado
}

type Modo = 'origen' | 'dos'

const porSegmentoYNombre = (a: GrupoTablero, b: GrupoTablero): number =>
  a.segmento_nombre.localeCompare(b.segmento_nombre, 'es') || a.nombre.localeCompare(b.nombre, 'es')

const opcionesDe = (grupos: readonly GrupoTablero[]) => grupos.map((g) => ({ valor: g.grupo_id, etiqueta: opcionGrupo(g, textoLideres(g)) }))

/** "52 y 48 años · Cabudare": the ages and where they live, as in the bank. */
function datosFila(personas: readonly PersonaGrupo[], fichas: ReadonlyMap<string, PersonaBanco>): string {
  const edades = personas.map((p) => fichas.get(p.usuario_id)?.edad).filter((e): e is number => e !== null && e !== undefined)
  const lugares = [...new Set(personas.map((p) => fichas.get(p.usuario_id)?.municipio_nombre).filter(Boolean))]
  const edad = edades.length > 0 ? `${edades.join(' y ')} años` : null
  return [edad, ...lugares].filter(Boolean).join(' · ')
}

interface Etiqueta {
  readonly texto: string
  readonly tono: TonoEtiqueta
}

/** One row of a pane: a person or a couple, its tags, and optionally "Pasar". */
function FilaLado({
  nombre,
  personas,
  fichas,
  etiquetas = [],
  carga,
  pasar,
}: {
  readonly nombre: string
  readonly personas: readonly PersonaGrupo[]
  readonly fichas: ReadonlyMap<string, PersonaBanco>
  readonly etiquetas?: readonly Etiqueta[]
  /** Who can be dragged from this row; null when nobody. */
  readonly carga: Carga | null
  readonly pasar?: { readonly etiqueta: string; readonly direccion: 'derecha' | 'izquierda'; readonly onClick: () => void } | null
}): ReactElement {
  const pasos = usePasos()
  const arrastrable = pasos !== null && carga !== null
  const sinGuardar = pasos !== null && personas.some((p) => pasos.pendiente.persona(p.usuario_id))
  const datos = datosFila(personas, fichas)
  return (
    <li
      aria-label={nombre}
      draggable={arrastrable}
      onDragStart={arrastrable ? (e) => pasos.arrastrar(carga, e) : undefined}
      onDragEnd={arrastrable ? () => pasos.terminarArrastre() : undefined}
      className={cn(CLASE_FILA_PERSONA, arrastrable && 'cursor-grab')}
    >
      <AvatarIniciales nombres={personas.map(nombrePersona)} className="mt-px" />
      <div className="min-w-0 flex-1 py-[3px]">
        <p data-nombres className={CLASE_NOMBRE_FILA}>
          {nombre}
        </p>
        {datos && <p className="break-words text-xs text-muted-foreground">{datos}</p>}
        {sinGuardar && <MarcaSinGuardar />}
        {etiquetas.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {etiquetas.map((e) => (
              <EtiquetaPlanner key={e.texto} tono={e.tono}>
                {e.texto}
              </EtiquetaPlanner>
            ))}
          </div>
        )}
      </div>
      {pasar && (
        <BotonSistema
          type="button"
          variante="ghost"
          tamaño="sm"
          aria-label={pasar.etiqueta}
          onClick={pasar.onClick}
          className="-my-0.5"
        >
          {pasar.direccion === 'izquierda' && <ArrowLeft aria-hidden="true" className="size-4" />}
          Pasar
          {pasar.direccion === 'derecha' && <ArrowRight aria-hidden="true" className="size-4" />}
        </BotonSistema>
      )}
    </li>
  )
}

/** One role of a pane; on a group of the season in planning it takes dropped people in that role. */
function SeccionRol({
  titulo,
  cantidad,
  grupo,
  rol,
  falta,
  children,
}: {
  readonly titulo: string
  readonly cantidad: number
  /** The group that takes drops; null for the read-only origin. */
  readonly grupo: GrupoTablero | null
  readonly rol: RolDestino
  readonly falta: boolean
  readonly children: ReactNode
}): ReactElement {
  const zona = useZonaSoltar(grupo, rol)
  const props = grupo ? zona.props : {}
  return (
    <section aria-label={titulo} {...props} className={cn('pb-0.5', grupo && zona.sobre && CLASE_SOBRE_DENTRO)}>
      <h4 className={cn(CLASE_CABEZA_ROL, falta ? 'text-danger-text' : 'text-foreground')}>
        {titulo} <span className={CLASE_CUENTA_ROL}>{cantidad}</span>
      </h4>
      {cantidad === 0 ? (
        <p className={cn(CLASE_ROL_VACIO, falta ? 'font-medium text-danger-text' : 'text-muted-foreground')}>
          {falta ? 'Falta el Líder' : grupo ? 'Nadie todavía · arrastra aquí' : 'Nadie'}
        </p>
      ) : (
        <ul>{children}</ul>
      )}
    </section>
  )
}

/** The head of a group of the season in planning: name (opens the group panel), label, count over capacity. */
function CabeceraGrupo({ grupo }: { readonly grupo: GrupoTablero }): ReactElement {
  const pasos = usePasos()
  const etiqueta = etiquetaGrupo(grupo)
  const cantidad = personasDelGrupo(grupo).length
  return (
    <header className="space-y-0.5 px-3 pt-2.5 pb-2">
      <h3 className="break-words text-sm font-[650] leading-[18px] text-foreground">
        {pasos ? (
          <button type="button" onClick={() => pasos.abrirGrupo(grupo.grupo_id)} className="focus-ring rounded-md text-left transition-colors hover:text-brand-text">
            {grupo.nombre.trim() || etiqueta}
          </button>
        ) : (
          grupo.nombre.trim() || etiqueta
        )}
      </h3>
      <p title={etiqueta} className={cn('truncate text-xs', grupo.localidad_id ? 'text-muted-foreground' : 'text-danger-text')}>
        {etiqueta}
      </p>
      <p className="font-mono text-[13px] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
        {cantidad}
        {grupo.capacidad_maxima !== null && <small className="font-normal text-muted-foreground"> / {grupo.capacidad_maxima}</small>}
      </p>
      {pasos?.pendiente.grupo(grupo.grupo_id) && <MarcaSinGuardar />}
    </header>
  )
}

/** The roles of a group of the season in planning; `pasarA` adds "Pasar" towards the other group (mode B). */
function RolesGrupo({
  grupo,
  fichas,
  pasarA,
  direccion,
  acciones,
}: {
  readonly grupo: GrupoTablero
  readonly fichas: ReadonlyMap<string, PersonaBanco>
  readonly pasarA: GrupoTablero | null
  readonly direccion: 'derecha' | 'izquierda'
  readonly acciones: AccionesLado
}): ReactElement {
  const pasos = usePasos()
  const editable = pasos !== null && pasos.editable(grupo.segmento_id)
  const puedePasar = editable && pasarA !== null && pasos.editable(pasarA.segmento_id)
  return (
    <div>
      {rolesGrupo(grupo).map((rol) => (
        <SeccionRol
          key={rol.id}
          titulo={rol.titulo}
          cantidad={rol.personas.length}
          grupo={editable ? grupo : null}
          rol={ROL_DE_LISTA[rol.id]}
          falta={rol.id === 'lideres' && rol.personas.length === 0}
        >
          {filasDelRol(rol.personas, fichas).map((fila) => {
            const nombre = nombresFila(fila.personas)
            const carga: Carga = { ids: fila.personas.map((p) => p.usuario_id), nombre, desdeGrupo: true }
            return (
              <FilaLado
                key={fila.clave}
                nombre={nombre}
                personas={fila.personas}
                fichas={fichas}
                carga={editable ? carga : null}
                pasar={
                  puedePasar && pasarA
                    ? {
                        etiqueta: `Pasar a ${nombre} a ${pasarA.nombre}`,
                        direccion,
                        onClick: () => acciones.pasar(carga, pasarA, ROL_DE_LISTA[rol.id], grupo),
                      }
                    : null
                }
              />
            )
          })}
        </SeccionRol>
      ))}
    </div>
  )
}

/** One pane: a flat column whose head (label, `cabeza`) sits over a border, then the body. */
const Panel = ({
  etiqueta,
  idEtiqueta,
  cabeza,
  children,
}: {
  readonly etiqueta: string
  readonly idEtiqueta: string
  readonly cabeza: ReactNode
  readonly children: ReactNode
}): ReactElement => (
  <section aria-labelledby={idEtiqueta} className="min-w-0 overflow-hidden rounded-md border border-border bg-card">
    <div className="space-y-2 border-b border-border px-3 pt-2.5 pb-3">
      <span id={idEtiqueta} className="block truncate text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {etiqueta}
      </span>
      {cabeza}
    </div>
    {children}
  </section>
)

/** A dashed note inside a pane's body (no group chosen, none to copy). */
const CLASE_NOTA_PANEL = 'm-3 space-y-3 rounded-md border border-dashed border-border p-4'

function etiquetasOrigen(fila: FilaOrigen): Etiqueta[] {
  return [
    ...(fila.sinUbicar.length > 0 ? [{ texto: 'Sin ubicar', tono: 'warning' as const }] : []),
    ...fila.ubicados.map((u) => ({ texto: `Ya en ${u.grupoNombre}`, tono: 'success' as const })),
  ]
}

/** Mode "<origen> con <destino>". Mounted once the origin groups are read, so its first group is chosen from them. */
function ModoOrigen({
  temporada,
  origenes,
  destinos,
  fichas,
  busqueda,
  acciones,
}: {
  readonly temporada: TemporadaPlanner
  readonly origenes: readonly GrupoTablero[]
  /** The groups of the season in planning the actor edits. */
  readonly destinos: readonly GrupoTablero[]
  readonly fichas: ReadonlyMap<string, PersonaBanco>
  readonly busqueda: string
  readonly acciones: AccionesLado
}): ReactElement {
  const pasos = usePasos()
  const nombreOrigen = temporada.origen_nombre ?? 'la temporada anterior'
  const [origenId, setOrigenId] = useState<string | null>(
    () => origenes.find((g) => resumenOrigen(g, fichas).sinUbicar > 0)?.grupo_id ?? origenes[0]?.grupo_id ?? null,
  )
  // The destination chosen for each origin group; without a choice, where its leaders are now.
  const [elegidos, setElegidos] = useState<Readonly<Record<string, string>>>({})
  const origen = origenes.find((g) => g.grupo_id === origenId) ?? origenes[0] ?? null
  const destinoId = origen ? (elegidos[origen.grupo_id] ?? destinoSugerido(origen, destinos, fichas) ?? '') : ''
  const destino = destinos.find((g) => g.grupo_id === destinoId) ?? null
  const siguiente = origen ? siguienteConSinUbicar(origenes, origen.grupo_id, fichas) : null

  const consulta = normalizar(busqueda)
  const opcionesOrigen = opcionesDe(origenes.filter((g) => g.grupo_id === origen?.grupo_id || coincideGrupo(g, consulta)))
  const elegir = (id: string) => origen && setElegidos((e) => ({ ...e, [origen.grupo_id]: id }))

  if (!origen) {
    return (
      <p className="rounded-md border border-dashed border-border bg-card p-4 text-[13px] text-muted-foreground">
        No ves ningún grupo de {nombreOrigen}. Usa «Dos grupos de {temporada.nombre}».
      </p>
    )
  }

  const resumen = resumenOrigen(origen, fichas)
  const roles = filasOrigen(origen, fichas)
  const pendientes = roles.flatMap((r) => r.filas.filter((f) => f.sinUbicar.length > 0))
  const puedePasar = destino !== null && pasos !== null && pasos.editable(destino.segmento_id)
  const cargaDe = (fila: FilaOrigen): Carga => ({
    ids: fila.sinUbicar,
    nombre: nombresFila(fila.personas.filter((p) => fila.sinUbicar.includes(p.usuario_id))),
    desdeGrupo: false,
  })
  const puedeCopiar = pasos !== null && pasos.editable(origen.segmento_id)

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <BotonSistema
          type="button"
          variante="outline"
          tamaño="sm"
          disabled={!siguiente}
          title={siguiente ? undefined : `No queda otro grupo de ${nombreOrigen} con personas sin ubicar`}
          onClick={() => siguiente && setOrigenId(siguiente)}
        >
          Siguiente grupo con personas sin ubicar
          <SkipForward aria-hidden="true" className="size-4" />
        </BotonSistema>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel
          etiqueta={`Origen · ${nombreOrigen}`}
          idEtiqueta="lado-origen"
          cabeza={
            <>
              <SelectSistema aria-label={`Grupo de ${nombreOrigen}`} opciones={opcionesOrigen} value={origen.grupo_id} onValueChange={setOrigenId} />
              <p className="text-[13px] text-muted-foreground">
                {resumen.personas} {resumen.personas === 1 ? 'persona' : 'personas'} · {resumen.ubicadas} ya {resumen.ubicadas === 1 ? 'ubicada' : 'ubicadas'} en{' '}
                {temporada.nombre} · <strong className="font-semibold text-foreground">{resumen.sinUbicar} sin ubicar</strong>. Solo se copia desde aquí: la
                temporada pasada no cambia.
              </p>
            </>
          }
        >
          <div>
            {roles.map((rol) => (
              <SeccionRol
                key={rol.id}
                titulo={rol.titulo}
                cantidad={rol.filas.reduce((n, f) => n + f.personas.length, 0)}
                grupo={null}
                rol={ROL_DE_LISTA[rol.id]}
                falta={false}
              >
                {rol.filas.map((fila) => {
                  const carga = fila.sinUbicar.length > 0 ? cargaDe(fila) : null
                  return (
                    <FilaLado
                      key={fila.clave}
                      nombre={fila.nombre}
                      personas={fila.personas}
                      fichas={fichas}
                      etiquetas={etiquetasOrigen(fila)}
                      carga={carga}
                      pasar={
                        carga && puedePasar && destino
                          ? {
                              etiqueta: `Pasar a ${carga.nombre} a ${destino.nombre}`,
                              direccion: 'derecha',
                              onClick: () => acciones.pasar(carga, destino, fila.rol, origen),
                            }
                          : null
                      }
                    />
                  )
                })}
              </SeccionRol>
            ))}
          </div>
          {puedePasar && destino && resumen.sinUbicar > 0 && (
            <div className="border-t border-border p-3">
              <BotonSistema
                type="button"
                variante="outline"
                tamaño="sm"
                className="w-full"
                onClick={() => acciones.pasarVarios(pendientes.map((f) => ({ carga: cargaDe(f), rol: f.rol })), destino, origen)}
              >
                {resumen.sinUbicar === 1 ? 'Pasar la persona sin ubicar' : `Pasar las ${resumen.sinUbicar} sin ubicar`} a {destino.nombre}
                <ArrowRight aria-hidden="true" className="size-4" />
              </BotonSistema>
            </div>
          )}
        </Panel>
        <Panel
          etiqueta={`Destino · ${temporada.nombre} (planificando)`}
          idEtiqueta="lado-destino"
          cabeza={
            <SelectSistema
              aria-label={`Grupo de ${temporada.nombre}`}
              opciones={opcionesDe(destinos)}
              placeholder="Elige un grupo"
              value={destino?.grupo_id ?? ''}
              onValueChange={elegir}
            />
          }
        >
          {destino ? (
            <>
              <CabeceraGrupo grupo={destino} />
              <RolesGrupo grupo={destino} fichas={fichas} pasarA={null} direccion="derecha" acciones={acciones} />
            </>
          ) : (
            <div className={CLASE_NOTA_PANEL}>
              <p className="text-[13px] text-foreground">
                Ningún grupo de {temporada.nombre} tiene a los líderes de {origen.nombre.trim() || 'este grupo'}.
              </p>
              {puedeCopiar ? (
                <>
                  <BotonSistema
                    type="button"
                    variante="outline"
                    tamaño="sm"
                    icono={Copy}
                    aria-label={`Crear grupo copiando ${origen.nombre}`}
                    onClick={() => {
                      const clave = acciones.crearCopia(origen)
                      if (clave) elegir(clave)
                    }}
                  >
                    Crear grupo copiando este
                  </BotonSistema>
                  <p className="text-xs text-muted-foreground">
                    Copia el nombre, el segmento, la localidad, el día y la hora, la capacidad y los directores de etapa; sus líderes pasan con él. Queda sin guardar
                    hasta que toques «Guardar».
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Elige un grupo arriba: no editas grupos de {origen.segmento_nombre}.</p>
              )}
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}

/** Mode "Dos grupos de <destino>". */
function ModoDos({
  temporada,
  destinos,
  fichas,
  acciones,
}: {
  readonly temporada: TemporadaPlanner
  readonly destinos: readonly GrupoTablero[]
  readonly fichas: ReadonlyMap<string, PersonaBanco>
  readonly acciones: AccionesLado
}): ReactElement {
  const [izquierdaId, setIzquierdaId] = useState<string>(() => destinos[0]?.grupo_id ?? '')
  const [derechaId, setDerechaId] = useState<string>(() => destinos[1]?.grupo_id ?? '')
  const izquierda = destinos.find((g) => g.grupo_id === izquierdaId) ?? null
  const derecha = destinos.find((g) => g.grupo_id === derechaId && g.grupo_id !== izquierda?.grupo_id) ?? null
  const lados = [
    { id: 'izquierda', etiqueta: 'Izquierda', grupo: izquierda, otro: derecha, cambiar: setIzquierdaId, direccion: 'derecha' as const },
    { id: 'derecha', etiqueta: 'Derecha', grupo: derecha, otro: izquierda, cambiar: setDerechaId, direccion: 'izquierda' as const },
  ]
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {lados.map((lado) => (
        <Panel
          key={lado.id}
          etiqueta={`${lado.etiqueta} · ${temporada.nombre}`}
          idEtiqueta={`lado-${lado.id}`}
          cabeza={
            <SelectSistema
              aria-label={`Grupo de la ${lado.id}`}
              opciones={opcionesDe(destinos.filter((g) => g.grupo_id !== lado.otro?.grupo_id))}
              placeholder="Elige un grupo"
              value={lado.grupo?.grupo_id ?? ''}
              onValueChange={lado.cambiar}
            />
          }
        >
          {lado.grupo ? (
            <>
              <CabeceraGrupo grupo={lado.grupo} />
              <RolesGrupo grupo={lado.grupo} fichas={fichas} pasarA={lado.otro} direccion={lado.direccion} acciones={acciones} />
            </>
          ) : (
            <p className={cn(CLASE_NOTA_PANEL, 'text-[13px] text-muted-foreground')}>Elige un grupo de {temporada.nombre}.</p>
          )}
        </Panel>
      ))}
    </div>
  )
}

export function LadoALado({ temporada, capacidades, grupos, fichas, origen, onReintentar, busqueda, acciones }: LadoALadoProps): ReactElement {
  const conOrigen = temporada.origen_id !== null
  const [modo, setModo] = useState<Modo>(conOrigen ? 'origen' : 'dos')
  // S10: the destination is a group the actor edits; the origin, a group of a segment the actor sees.
  const destinos = useMemo(() => {
    const editables = new Set(capacidades.segmentos_editables)
    return grupos.filter((g) => editables.has(g.segmento_id)).sort(porSegmentoYNombre)
  }, [grupos, capacidades.segmentos_editables])
  const origenes = useMemo(() => {
    if (origen.tipo !== 'listo') return []
    const visibles = new Set(capacidades.segmentos.map((s) => s.id))
    return origen.grupos.filter((g) => capacidades.ve_todos_los_segmentos || visibles.has(g.segmento_id)).sort(porSegmentoYNombre)
  }, [origen, capacidades])

  return (
    <div role="region" aria-label="Grupos lado a lado" className="min-w-0 space-y-4">
      <ControlSegmentado<Modo>
        etiqueta="Qué comparar"
        opciones={[
          ...(conOrigen ? [{ valor: 'origen' as const, etiqueta: `${temporada.origen_nombre ?? 'Origen'} con ${temporada.nombre}` }] : []),
          { valor: 'dos', etiqueta: `Dos grupos de ${temporada.nombre}` },
        ]}
        valor={modo}
        onCambio={setModo}
      />
      {modo === 'dos' ? (
        <ModoDos temporada={temporada} destinos={destinos} fichas={fichas} acciones={acciones} />
      ) : origen.tipo === 'cargando' ? (
        <p role="status" className="rounded-md border border-dashed border-border bg-card p-4 text-[13px] text-muted-foreground">
          Cargando los grupos de {temporada.origen_nombre}…
        </p>
      ) : origen.tipo === 'error' ? (
        <AvisoFormulario tono="error" className="flex flex-wrap items-center gap-3 py-3">
          <span className="min-w-0 flex-1">{origen.mensaje}</span>
          <BotonSistema type="button" variante="outline" tamaño="sm" onClick={onReintentar}>
            Reintentar
          </BotonSistema>
        </AvisoFormulario>
      ) : (
        <ModoOrigen temporada={temporada} origenes={origenes} destinos={destinos} fichas={fichas} busqueda={busqueda} acciones={acciones} />
      )}
    </div>
  )
}
