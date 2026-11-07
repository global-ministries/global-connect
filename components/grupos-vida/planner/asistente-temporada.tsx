'use client'

/**
 * Planner — the new-season assistant /grupos-vida/planificar/nueva (artboard
 * 10; T8b of odd/tasks/planner-gdv.md; S18, S19, S20, A10–A14). Only admin,
 * pastor and director general reach it (the page redirects anyone else;
 * planner_crear_temporada checks it again).
 *
 * Four steps with a stepper and a running summary card:
 *   1 Nueva temporada: create one here (name and dates suggested by the
 *     cohort rule, temporada-nueva.ts; no "activa" toggle: it is created En
 *     planificación) or use one already in planning.
 *   2 Temporada que cierra: the latest season of the same cohort that starts
 *     before it (computed, not editable; "Ninguna" when there is none) and
 *     the other cohort's season, which is not touched.
 *   3 Diagnóstico de cierre of that season (cargarCierreAction →
 *     planner_tablero + planner_banco of the origin, diagnostico.ts).
 *   4 Cómo empezar: copy the closing season's groups (recommended) or start
 *     blank; for a season already in planning, keep what it has (copying is
 *     offered only while it has no groups, so no leader is pulled out of a
 *     group it already has).
 * "Crear y abrir el planificador" creates the season (crearTemporadaAction),
 * then, to copy, saves the copy plan (copia.ts) with guardarCambiosAction in
 * batches of at most 200 changes, showing the progress. A failed batch
 * leaves the season and the batches already saved: the page says how many
 * groups were copied and offers to copy the rest or open the board. At the
 * end it opens /grupos-vida/planificar?temporada=<id>.
 */
import { useEffect, useId, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'

import { BotonSistema, InputSistema, PaginaSistema, SelectSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { contar, enLista, type TemporadaPlanner, type TemporadasPlanner } from '@/lib/platform/grupos-vida/planner'
import { lotesDeCopia, planCopia, type GrupoACopiar } from '@/lib/platform/grupos-vida/planner/copia'
import type { ResultadoCierre } from '@/lib/platform/grupos-vida/planner/datos'
import {
  cohorteDe,
  otraCohorteNoSeToca,
  sugerirSiguienteTemporada,
  temporadaQueCierra,
  validarNuevaTemporada,
} from '@/lib/platform/grupos-vida/planner/temporada-nueva'
import { cargarCierreAction, crearTemporadaAction, guardarCambiosAction } from '@/app/(auth)/grupos-vida/planificar/actions'
import { cn } from '@/lib/utils'

import { hrefTemporada, RUTA_PLANIFICAR } from './cabecera-temporada'
import { DiagnosticoCierreVista } from './diagnostico-cierre'
import { MigasPlanner } from './migas-planner'
import { formatearCantidad } from './modelo'

const ERROR_RED = 'No se pudo completar. Revisa tu conexión e inténtalo de nuevo.'

const PASOS = [
  { titulo: 'Nueva temporada' },
  { titulo: 'Temporada que cierra' },
  { titulo: 'Diagnóstico de cierre' },
  { titulo: 'Cómo empezar' },
] as const

const FECHA = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** "8 feb 2027" for 'YYYY-MM-DD'; the text as is when it is not a date. */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return ''
  const fecha = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(fecha.getTime()) ? iso : FECHA.format(fecha)
}

const rango = (inicio: string | null | undefined, fin: string | null | undefined): string =>
  inicio ? `${fechaCorta(inicio)} – ${fin ? fechaCorta(fin) : 'sin fecha de fin'}` : 'sin fechas'

type Modo = 'nueva' | 'existente'
type ComoEmpezar = 'copiar' | 'blanco' | 'seguir'
type Cierre = { readonly estado: 'cargando' } | { readonly estado: 'error'; readonly mensaje: string } | { readonly estado: 'listo'; readonly datos: Extract<ResultadoCierre, { ok: true }> }

type Creacion =
  | { readonly fase: 'quieto' }
  | { readonly fase: 'creando' }
  | { readonly fase: 'error_crear'; readonly mensaje: string }
  | { readonly fase: 'copiando'; readonly temporada: Destino; readonly copiados: number; readonly total: number }
  | {
      readonly fase: 'error_copia'
      readonly temporada: Destino
      readonly lotes: readonly (readonly GrupoACopiar[])[]
      readonly siguiente: number
      readonly copiados: number
      readonly total: number
      readonly mensaje: string
    }
  | { readonly fase: 'abriendo'; readonly temporada: Destino }

interface Destino {
  readonly id: string
  readonly nombre: string
}

export interface AsistenteTemporadaProps {
  readonly capacidades: TemporadasPlanner
  /** Today in the church's time zone, 'YYYY-MM-DD' (the suggestion of a cohort without seasons). */
  readonly hoy: string
}

/** A radio choice card: the pill pressed look (brand border + brand tint); dashed when disabled. */
function Opcion({
  nombre,
  valor,
  elegida,
  onElegir,
  titulo,
  marca,
  deshabilitada = false,
  children,
  extra,
}: {
  readonly nombre: string
  readonly valor: string
  readonly elegida: boolean
  readonly onElegir: () => void
  readonly titulo: string
  readonly marca?: string
  readonly deshabilitada?: boolean
  readonly children?: ReactNode
  readonly extra?: ReactNode
}): ReactElement {
  const id = useId()
  return (
    <div
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-2xl border-[1.5px] p-4 transition-colors has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-brand',
        deshabilitada ? 'border-dashed border-border' : elegida ? 'border-brand bg-brand-tint' : 'border-border bg-card hover:bg-accent',
      )}
    >
      <input
        id={id}
        type="radio"
        name={nombre}
        value={valor}
        checked={elegida}
        disabled={deshabilitada}
        onChange={onElegir}
        aria-describedby={children ? `${id}-d` : undefined}
        className="mt-0.5 size-5 accent-[var(--brand-strong)] disabled:cursor-not-allowed"
      />
      <div className="min-w-0">
        <label htmlFor={id} className={cn('flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[15px] font-semibold', deshabilitada ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer text-foreground')}>
          {titulo}
          {marca && <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success-text">{marca}</span>}
        </label>
        {children && (
          <div id={`${id}-d`} className="mt-1 text-sm leading-relaxed text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground">
            {children}
          </div>
        )}
      </div>
      {elegida && extra && <div className="col-start-2 grid gap-3.5 pt-1.5">{extra}</div>}
    </div>
  )
}

function Paso({ titulo, descripcion, children, pie }: { readonly titulo: string; readonly descripcion: ReactNode; readonly children: ReactNode; readonly pie: ReactNode }): ReactElement {
  return (
    <TarjetaSistema>
      <section aria-labelledby="asistente-paso" className="grid gap-5">
        <header>
          <h2 id="asistente-paso" className="text-xl font-semibold tracking-[-0.01em] text-foreground">
            {titulo}
          </h2>
          <p className="mt-1.5 text-[15px] text-muted-foreground">{descripcion}</p>
        </header>
        {children}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">{pie}</div>
      </section>
    </TarjetaSistema>
  )
}

export function AsistenteTemporada({ capacidades, hoy }: AsistenteTemporadaProps): ReactElement {
  const router = useRouter()
  const { temporadas, segmentos } = capacidades
  const sugerencia = useMemo(() => sugerirSiguienteTemporada(temporadas, hoy), [temporadas, hoy])
  const enPlanificacion = useMemo(() => temporadas.filter((t) => t.estado === 'planificacion'), [temporadas])

  const [paso, setPaso] = useState(1)
  const [alcanzado, setAlcanzado] = useState(1)
  const [modo, setModo] = useState<Modo>('nueva')
  const [nombre, setNombre] = useState(sugerencia.nombre)
  const [inicio, setInicio] = useState(sugerencia.fecha_inicio)
  const [fin, setFin] = useState(sugerencia.fecha_fin)
  const [existenteId, setExistenteId] = useState(enPlanificacion[0]?.id ?? '')
  const [errorPaso1, setErrorPaso1] = useState<string | null>(null)
  const [cierres, setCierres] = useState<Readonly<Record<string, Cierre>>>({})
  const [comoEmpezar, setComoEmpezar] = useState<ComoEmpezar | null>(null)
  const [creacion, setCreacion] = useState<Creacion>({ fase: 'quieto' })

  const existente = enPlanificacion.find((t) => t.id === existenteId) ?? null
  const destinoNombre = modo === 'nueva' ? nombre.replace(/\s+/g, ' ').trim() : (existente?.nombre ?? '')
  const origen: TemporadaPlanner | Destino | null =
    modo === 'nueva'
      ? temporadaQueCierra(temporadas, nombre, inicio)
      : existente?.origen_id
        ? (temporadas.find((t) => t.id === existente.origen_id) ?? { id: existente.origen_id, nombre: existente.origen_nombre ?? 'Temporada anterior' })
        : null
  const otra = otraCohorteNoSeToca(temporadas, destinoNombre)
  const cohorte = cohorteDe(destinoNombre)
  const destinoExistenteId = modo === 'existente' ? (existente?.id ?? null) : null
  const claveCierre = origen ? `${origen.id}|${destinoExistenteId ?? ''}` : null
  const cierre = claveCierre ? cierres[claveCierre] : undefined
  const datosCierre = cierre?.estado === 'listo' ? cierre.datos : null
  const plan = useMemo(() => (datosCierre ? planCopia(datosCierre.grupos, segmentos) : null), [datosCierre, segmentos])

  const cargarCierre = (clave: string, origenId: string, destinoId: string | null) => {
    setCierres((c) => ({ ...c, [clave]: { estado: 'cargando' } }))
    cargarCierreAction({ origenId, destinoId })
      .then((r) => setCierres((c) => ({ ...c, [clave]: r.ok ? { estado: 'listo', datos: r } : { estado: 'error', mensaje: r.mensaje } })))
      .catch(() => setCierres((c) => ({ ...c, [clave]: { estado: 'error', mensaje: ERROR_RED } })))
  }

  useEffect(() => {
    if (paso >= 2 && claveCierre && origen && !cierres[claveCierre]) cargarCierre(claveCierre, origen.id, destinoExistenteId)
    // cargarCierre only writes state; the key says what to read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, claveCierre])

  // ─── Paso 4 options ───
  const yaTieneGrupos = modo === 'existente' && datosCierre !== null && (datosCierre.gruposDestino ?? 0) > 0
  const motivoNoCopiar = !origen
    ? 'No hay ninguna temporada que cierre.'
    : !cierre || cierre.estado === 'cargando'
      ? `Leyendo los grupos de ${origen.nombre}…`
      : cierre.estado === 'error'
        ? `No se pudieron leer los grupos de ${origen.nombre}.`
        : yaTieneGrupos
          ? `${destinoNombre} ya tiene ${contar(datosCierre?.gruposDestino ?? 0, 'grupo', 'grupos')}: sigue con lo que tiene.`
          : (plan?.grupos.length ?? 0) === 0
            ? `${origen.nombre} no tiene grupos para copiar.`
            : null
  const sinCopia: ComoEmpezar = modo === 'nueva' ? 'blanco' : 'seguir'
  const posibles: readonly ComoEmpezar[] = motivoNoCopiar ? [sinCopia] : [sinCopia, 'copiar']
  // Copying is recommended whenever it is possible.
  const empezarValido: ComoEmpezar = comoEmpezar && posibles.includes(comoEmpezar) ? comoEmpezar : motivoNoCopiar ? sinCopia : 'copiar'

  // ─── Navigation ───
  const ir = (n: number) => {
    setPaso(n)
    setAlcanzado((a) => Math.max(a, n))
  }
  /** A change in step 1 makes the later steps depend on it again. */
  const cambiarPaso1 = (cambio: () => void) => {
    cambio()
    setErrorPaso1(null)
    setAlcanzado(1)
    setComoEmpezar(null)
  }

  const siguienteDesde1 = () => {
    if (modo === 'existente') {
      if (!existente) return setErrorPaso1('Elige la temporada en planificación.')
      return ir(2)
    }
    const validada = validarNuevaTemporada(temporadas, { nombre, fecha_inicio: inicio, fecha_fin: fin })
    if ('error' in validada) return setErrorPaso1(validada.error)
    setNombre(validada.valores.nombre)
    ir(2)
  }

  // ─── Create, copy and open ───
  const abrir = (temporada: Destino) => {
    setCreacion({ fase: 'abriendo', temporada })
    router.push(hrefTemporada(temporada.id))
  }

  const copiar = async (temporada: Destino, lotes: readonly (readonly GrupoACopiar[])[], desde: number, yaCopiados: number) => {
    const total = lotes.reduce((n, l) => n + l.length, 0)
    let copiados = yaCopiados
    for (let i = desde; i < lotes.length; i += 1) {
      setCreacion({ fase: 'copiando', temporada, copiados, total })
      let mensaje: string | null = null
      try {
        const r = await guardarCambiosAction({ temporadaId: temporada.id, cambios: lotes[i].flatMap((g) => g.cambios) })
        if (!r.ok) mensaje = r.mensaje
      } catch {
        mensaje = ERROR_RED
      }
      if (mensaje) {
        setCreacion({ fase: 'error_copia', temporada, lotes, siguiente: i, copiados, total, mensaje })
        return
      }
      copiados += lotes[i].length
    }
    abrir(temporada)
  }

  const crearYAbrir = async () => {
    let temporada: Destino
    if (modo === 'existente') {
      if (!existente) return
      temporada = { id: existente.id, nombre: existente.nombre }
    } else {
      setCreacion({ fase: 'creando' })
      try {
        const r = await crearTemporadaAction({ nombre: destinoNombre, fechaInicio: inicio, fechaFin: fin })
        if (!r.ok) return setCreacion({ fase: 'error_crear', mensaje: r.mensaje })
        temporada = { id: r.datos.id, nombre: r.datos.nombre }
      } catch {
        return setCreacion({ fase: 'error_crear', mensaje: ERROR_RED })
      }
    }
    if (empezarValido !== 'copiar' || !plan) return abrir(temporada)
    await copiar(temporada, lotesDeCopia(plan.grupos), 0, 0)
  }

  const trabajando = creacion.fase === 'creando' || creacion.fase === 'copiando' || creacion.fase === 'abriendo'
  const creada = creacion.fase === 'copiando' || creacion.fase === 'error_copia' || creacion.fase === 'abriendo'

  // ─── Steps ───
  const atras = (
    <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={() => setPaso((p) => Math.max(1, p - 1))} disabled={trabajando || creada}>
      Atrás
    </BotonSistema>
  )
  const indicador = <span className="font-mono text-sm tabular-nums text-muted-foreground">Paso {paso} de 4</span>
  const siguiente = (onClick: () => void) => (
    <div className="flex items-center gap-3">
      {indicador}
      <BotonSistema type="button" variante="primario" tamaño="sm" onClick={onClick}>
        Siguiente
      </BotonSistema>
    </div>
  )

  const paso1 = (
    <Paso titulo="¿Qué temporada vas a planificar?" descripcion="Créala aquí mismo o usa una que ya esté en planificación." pie={<><span />{siguiente(siguienteDesde1)}</>}>
      <fieldset className="grid min-w-0 gap-2.5">
        <legend className="mb-1 text-sm font-medium text-foreground">Temporada a planificar</legend>
        <Opcion
          nombre="temporada"
          valor="nueva"
          elegida={modo === 'nueva'}
          onElegir={() => cambiarPaso1(() => setModo('nueva'))}
          titulo="Crear una temporada nueva"
          extra={
            <>
              <div className="grid gap-3.5 md:grid-cols-3">
                <InputSistema label="Nombre" value={nombre} onChange={(e) => cambiarPaso1(() => setNombre(e.target.value))} maxLength={80} autoComplete="off" />
                <InputSistema label="Empieza" type="date" value={inicio} onChange={(e) => cambiarPaso1(() => setInicio(e.target.value))} />
                <InputSistema label="Termina" type="date" value={fin} onChange={(e) => cambiarPaso1(() => setFin(e.target.value))} />
              </div>
              <AvisoFormulario tono="info" role="note" className="py-3">
                Se crea <b>En planificación</b>, no activa. Solo se activa cuando la publiques desde «Revisar y publicar». Hasta entonces no aparece en Asistencia ni en los grupos de los líderes.
              </AvisoFormulario>
            </>
          }
        >
          {sugerencia.anterior ? (
            <>
              Sigue la cohorte «{sugerencia.cohorte}», que empieza en {sugerencia.cohorte === 'I' ? 'febrero' : 'octubre'} y dura un año. Sugerido: <b>{sugerencia.nombre}</b>, del{' '}
              {fechaCorta(sugerencia.fecha_inicio)} al {fechaCorta(sugerencia.fecha_fin)}, después de que termina {sugerencia.anterior.nombre}.
            </>
          ) : (
            <>
              Las temporadas «-I» empiezan en febrero y las «-II» en octubre; cada una dura un año. Sugerido: <b>{sugerencia.nombre}</b>.
            </>
          )}
        </Opcion>
        <Opcion
          nombre="temporada"
          valor="existente"
          elegida={modo === 'existente'}
          onElegir={() => cambiarPaso1(() => setModo('existente'))}
          titulo="Usar una temporada que ya está en planificación"
          deshabilitada={enPlanificacion.length === 0}
          extra={
            enPlanificacion.length > 1 ? (
              <SelectSistema
                label="Temporada en planificación"
                value={existenteId}
                onValueChange={(v) => cambiarPaso1(() => setExistenteId(v))}
                opciones={enPlanificacion.map((t) => ({ valor: t.id, etiqueta: `${t.nombre} · ${rango(t.fecha_inicio, t.fecha_fin)}` }))}
              />
            ) : undefined
          }
        >
          {enPlanificacion.length === 0
            ? 'No hay ninguna ahora. Las que se crean en Temporadas aparecen aquí.'
            : enLista(enPlanificacion.map((t) => `${t.nombre} · ${rango(t.fecha_inicio, t.fecha_fin)}`))}
        </Opcion>
      </fieldset>
      {errorPaso1 && <AvisoFormulario tono="error">{errorPaso1}</AvisoFormulario>}
    </Paso>
  )

  const conteoCierre = datosCierre ? ` · ${contar(datosCierre.diagnostico.grupos, 'grupo', 'grupos')} · ${contar(datosCierre.diagnostico.integrantes, 'persona', 'personas')}` : ''
  const fechasOrigen = origen && 'fecha_inicio' in origen ? ` · ${rango(origen.fecha_inicio, origen.fecha_fin)}` : ''

  const paso2 = (
    <Paso
      titulo={`¿Qué temporada termina cuando publiques ${destinoNombre}?`}
      descripcion={`Al publicar, esa temporada se cierra y sus grupos se archivan con toda su asistencia. Sus personas son el punto de partida de ${destinoNombre}.`}
      pie={<>{atras}{siguiente(() => ir(3))}</>}
    >
      <fieldset className="grid min-w-0 gap-2.5">
        <legend className="mb-1 text-sm font-medium text-foreground">Temporada que cierra</legend>
        {origen ? (
          <Opcion nombre="cierra" valor={origen.id} elegida onElegir={() => undefined} titulo={origen.nombre} marca="Misma cohorte">
            Cohorte «{cohorte}»{fechasOrigen}
            {conteoCierre}. Se calcula por la cohorte: la última «-{cohorte}» que empieza antes de {destinoNombre}.
          </Opcion>
        ) : (
          <Opcion nombre="cierra" valor="ninguna" elegida onElegir={() => undefined} titulo="Ninguna">
            {destinoNombre} es la primera de la cohorte «{cohorte}»: al publicarla no se cierra ninguna temporada.
          </Opcion>
        )}
      </fieldset>
      {otra && (
        <AvisoFormulario tono="info" role="note" className="border-success/35 bg-success/5 py-3">
          <b>{otra.nombre} no se toca.</b> Es de la otra cohorte («{cohorteDe(otra.nombre)}»): sigue como está y, cuando se publique, cierra la anterior de su cohorte, no {origen?.nombre ?? 'esta'}.
        </AvisoFormulario>
      )}
    </Paso>
  )

  const paso3 = (
    <Paso
      titulo={origen ? `Cómo termina ${origen.nombre}` : 'Diagnóstico de cierre'}
      descripcion={origen ? `El punto de partida de ${destinoNombre}: quién lidera, quién podría liderar y dónde están.` : 'No hay temporada que cierre, así que no hay diagnóstico.'}
      pie={<>{atras}{siguiente(() => ir(4))}</>}
    >
      {!origen ? (
        <p className="text-sm text-muted-foreground">Todas las personas empiezan en el banco como «Sin ubicar».</p>
      ) : !cierre || cierre.estado === 'cargando' ? (
        <p role="status" className="text-sm text-muted-foreground">
          Leyendo los grupos de {origen.nombre}…
        </p>
      ) : cierre.estado === 'error' ? (
        <AvisoFormulario tono="error" className="flex flex-wrap items-center justify-between gap-3">
          <span>{cierre.mensaje}</span>
          <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => claveCierre && cargarCierre(claveCierre, origen.id, destinoExistenteId)}>
            Reintentar
          </BotonSistema>
        </AvisoFormulario>
      ) : (
        <DiagnosticoCierreVista diagnostico={cierre.datos.diagnostico} origen={origen.nombre} destino={destinoNombre} />
      )}
    </Paso>
  )

  const textoBoton = modo === 'existente' ? 'Abrir el planificador' : 'Crear y abrir el planificador'
  const paso4 = (
    <Paso
      titulo="¿Cómo empiezas?"
      descripcion={`Elige con qué arranca ${destinoNombre}. Después todo se ajusta en el tablero.`}
      pie={
        <>
          {atras}
          <div className="flex items-center gap-3">
            {indicador}
            {!creada && (
              <BotonSistema type="button" variante="primario" tamaño="sm" cargando={trabajando} disabled={trabajando} onClick={() => void crearYAbrir()}>
                {textoBoton}
              </BotonSistema>
            )}
          </div>
        </>
      }
    >
      <fieldset className="grid min-w-0 gap-2.5" disabled={trabajando || creada}>
        <legend className="mb-1 text-sm font-medium text-foreground">Cómo empezar</legend>
        {modo === 'existente' && (
          <Opcion nombre="empezar" valor="seguir" elegida={empezarValido === 'seguir'} onElegir={() => setComoEmpezar('seguir')} titulo={`Seguir con lo que ya tiene ${destinoNombre}`}>
            Abre el tablero con sus grupos tal como están.
          </Opcion>
        )}
        <Opcion
          nombre="empezar"
          valor="copiar"
          elegida={empezarValido === 'copiar'}
          onElegir={() => setComoEmpezar('copiar')}
          titulo={origen ? `Copiar los grupos de ${origen.nombre}` : 'Copiar los grupos'}
          marca={motivoNoCopiar ? undefined : 'Recomendado'}
          deshabilitada={motivoNoCopiar !== null}
        >
          {motivoNoCopiar ?? (
            <>
              Se crean <b>{contar(plan?.grupos.length ?? 0, 'grupo', 'grupos')}</b> con el mismo nombre, segmento, localidad, día, hora y director de etapa, y sus líderes. Los aprendices y
              miembros quedan en el banco como sugerencia. Cada segmento empieza «Sin terminar».
              {plan && plan.omitidos.length > 0 && (
                <> No se copian {contar(plan.omitidos.length, 'grupo', 'grupos')}: {enLista(plan.omitidos.map((o) => `${o.nombre} (${o.motivo.toLowerCase()})`))}.</>
              )}
            </>
          )}
        </Opcion>
        {modo === 'nueva' && (
          <Opcion nombre="empezar" valor="blanco" elegida={empezarValido === 'blanco'} onElegir={() => setComoEmpezar('blanco')} titulo="Empezar en blanco">
            Sin grupos: todas las personas quedan en el banco como «Sin ubicar».
          </Opcion>
        )}
      </fieldset>

      {creacion.fase === 'error_crear' && <AvisoFormulario tono="error">{creacion.mensaje}</AvisoFormulario>}
      {creacion.fase === 'copiando' && (
        <p role="status" className="text-sm text-muted-foreground">
          {creacion.temporada.nombre} creada. Copiando los grupos de {origen?.nombre}:{' '}
          <span className="font-mono tabular-nums">{formatearCantidad(creacion.copiados)}</span> de <span className="font-mono tabular-nums">{formatearCantidad(creacion.total)}</span>…
        </p>
      )}
      {creacion.fase === 'abriendo' && (
        <p role="status" className="text-sm text-muted-foreground">
          Abriendo el planificador de {creacion.temporada.nombre}…
        </p>
      )}
      {creacion.fase === 'error_copia' && (
        <AvisoFormulario tono="error" className="grid gap-3">
          <p>
            {creacion.temporada.nombre} ya existe y se {creacion.copiados === 1 ? 'copió' : 'copiaron'} {formatearCantidad(creacion.copiados)} de {contar(creacion.total, 'grupo', 'grupos')}. {creacion.mensaje}
          </p>
          <div className="flex flex-wrap gap-2">
            <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => void copiar(creacion.temporada, creacion.lotes, creacion.siguiente, creacion.copiados)}>
              Copiar los que faltan
            </BotonSistema>
            <BotonSistema asChild variante="ghost" tamaño="sm">
              <Link href={hrefTemporada(creacion.temporada.id)}>Abrir el planificador</Link>
            </BotonSistema>
          </div>
        </AvisoFormulario>
      )}
    </Paso>
  )

  const resumenInicio = paso < 4 && alcanzado < 4 ? null : empezarValido === 'copiar' ? `Copia ${contar(plan?.grupos.length ?? 0, 'grupo', 'grupos')} de ${origen?.nombre}` : empezarValido === 'seguir' ? 'Sigue con lo que ya tiene' : 'En blanco'

  return (
    <PaginaSistema
      breadcrumbs={<MigasPlanner actual="Nueva temporada" />}
      acciones={
        <BotonSistema asChild variante="ghost" tamaño="sm">
          <Link href={RUTA_PLANIFICAR}>Salir sin crear</Link>
        </BotonSistema>
      }
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground">Planificar nueva temporada</h1>
        <p className="text-[15px] text-muted-foreground">Cuatro pasos cortos. La temporada se crea En planificación y no queda activa hasta que la publiques.</p>
      </div>

      <ol aria-label="Pasos del asistente" className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {PASOS.map((p, i) => {
          const n = i + 1
          const actual = n === paso
          const hecho = n < alcanzado || (n < paso)
          const contenido = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full font-mono text-xs tabular-nums',
                  actual ? 'bg-brand-strong text-brand-foreground' : hecho ? 'bg-success/10 text-success-text' : 'bg-muted text-muted-foreground',
                )}
              >
                {hecho && !actual ? <Check className="size-3.5" /> : n}
              </span>
              <span className="min-w-0 truncate font-semibold text-foreground">{p.titulo}</span>
            </>
          )
          const clase = cn(
            'flex min-h-14 w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
            actual ? 'border-brand bg-brand-tint' : 'border-border bg-card',
          )
          const puedeIr = !actual && n <= alcanzado && !trabajando && !creada
          return (
            <li key={p.titulo}>
              {puedeIr ? (
                <button type="button" className={cn(clase, 'focus-ring hover:bg-accent')} onClick={() => setPaso(n)}>
                  {contenido}
                  <span className="sr-only">{hecho ? ' (hecho)' : ''}</span>
                </button>
              ) : (
                <span aria-current={actual ? 'step' : undefined} className={clase}>
                  {contenido}
                </span>
              )}
            </li>
          )
        })}
      </ol>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {paso === 1 ? paso1 : paso === 2 ? paso2 : paso === 3 ? paso3 : paso4}
        <aside aria-label="Tu nueva temporada" className="lg:sticky lg:top-22">
          <TarjetaSistema>
            <h2 className="mb-4 text-base font-semibold text-foreground">Tu nueva temporada</h2>
            <dl className="grid gap-3 text-sm">
              <div className="grid gap-0.5">
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Temporada</dt>
                <dd>
                  {destinoNombre || '—'}
                  <small className="block text-[13px] text-muted-foreground">
                    {modo === 'nueva' ? `${rango(inicio, fin)} · En planificación, no activa` : existente ? `${rango(existente.fecha_inicio, existente.fecha_fin)} · ya en planificación` : ''}
                  </small>
                </dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Cierra</dt>
                <dd>{alcanzado >= 2 ? (origen?.nombre ?? 'Ninguna') : <span className="text-muted-foreground">Paso 2</span>}</dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Diagnóstico</dt>
                <dd>
                  {alcanzado >= 3 && datosCierre ? (
                    `${contar(datosCierre.diagnostico.grupos, 'grupo', 'grupos')} · ${contar(datosCierre.diagnostico.listosParaLiderar, 'listo', 'listos')} para liderar`
                  ) : (
                    <span className="text-muted-foreground">{alcanzado >= 3 && !origen ? 'Sin temporada que cierre' : 'Paso 3'}</span>
                  )}
                </dd>
              </div>
              <div className="grid gap-0.5">
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Cómo empieza</dt>
                <dd>{resumenInicio ?? <span className="text-muted-foreground">Paso 4</span>}</dd>
              </div>
            </dl>
          </TarjetaSistema>
        </aside>
      </div>
    </PaginaSistema>
  )
}
