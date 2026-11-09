'use client'

/**
 * DPS › Asistencia — client island of /dps/asistencia, the Sunday
 * attendance on the phone (T9 of odd/tasks/dps-asistencia-pco.md; S6.1, S7.4,
 * S2). Built on the attendance list of docs/design-system/mobile.md and the
 * artboard prototipos/planificacion-dps/05-asistencia-celular.html.
 *
 * Top to bottom: crumbs (none on the phone: the section root), the plan (series eyebrow,
 * the date as title, "N de M llegaron · una marca vale para 9:15 y 11:15",
 * the progress bar), the plan picker when the window has more than one, the
 * autosave status, the Por llegar / Llegaron / Todos filter, one list grouped
 * by team (collapsible sticky headers with n/m and "Marcar todos"), each
 * person with their puestos, "Avisó que no viene" (convocados only) and one
 * big "Llegó" toggle; then "Agregar a alguien que vino sin estar convocado"
 * and the note on how it saves (and that it will validate the refrigerio).
 *
 * One mark per person per plan: a person in two teams shows in both with the
 * same mark. A change is applied at once and saved through a server action;
 * a failure rolls back only the people it still owns and explains why. The
 * sheet reloads after "Marcar todos", after adding someone and when the tab
 * comes back. The database decides who may mark whom and the window.
 *
 * The page column is `relative` so its `sr-only` text cannot stretch the
 * document under the shell (the band of L34, see plan-client.tsx), and the
 * list clips its rounded corners with `overflow-clip`, which unlike
 * `overflow-hidden` is no scroll container: the team headers stick to the
 * page scroll on desktop too.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, ChevronDown, CupSoda, Plus, UsersRound } from 'lucide-react'

import { PaginaSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { AvatarIniciales } from '@/components/grupos-vida/planner/avatar-iniciales'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { cargarPlanillaDps, marcarAsistenciaDps, marcarEquipoDps } from '@/lib/actions/dps-asistencia.actions'
import { fechaCorta, fechaLarga } from '@/lib/platform/estudiantes/lista-vista'
import {
  agregarLlegada,
  aplicarEstados,
  contarEquipo,
  deshacerAgregar,
  horariosTexto,
  nombreCompleto,
  pendientesEquipo,
  tituloPlan,
  totalesPlanilla,
  visibleEnFiltro,
  type EquipoPlanilla,
  type EstadoDps,
  type FiltroDps,
  type OtroPlanilla,
  type PersonaPlanilla,
  type PlanDps,
  type PlanillaDps,
} from '@/lib/platform/dps/planilla'
import { cn } from '@/lib/utils'

import { EstadoGuardado, type EstadoGuardadoValor } from './estado-guardado'
import { HojaAgregar } from './hoja-agregar'
import { MarcaLlegada } from './marca-llegada'
import { MigasDps } from './migas-dps'

export interface AsistenciaClientProps {
  /** The plans of the window (today and 14 days back). */
  readonly planes: readonly PlanDps[]
  readonly plan: PlanDps | null
  /** The sheet loaded by the page; null when there is no plan or it failed. */
  readonly planilla: PlanillaDps | null
  /** Why `planilla` is missing; `sinEquipos` = the caller passes attendance in no team of it. */
  readonly error: { readonly mensaje: string; readonly sinEquipos: boolean } | null
}

const RUTA = '/dps/asistencia'

// Under the app's fixed phone bar (app/(auth)/layout.tsx clears the same
// height) and the sticky desktop header (min-h-16).
// Sticky within the shell's <main> scroller: on a phone <main> already starts
// under the fixed top bar (top 0), from md under the 64px desktop header.
const CLASE_CABECERA_EQUIPO =
  'sticky top-0 z-[2] flex min-h-9 items-center gap-1 border-b border-border bg-muted pr-1.5 md:top-16'
// Hairline between rows, starting after the 32px avatar (60px).
const CLASE_LINEA = 'before:absolute before:top-0 before:right-0 before:left-[60px] before:h-px before:bg-border/60 first:before:hidden'

const palabra = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios)

function etiquetaFiltro(filtro: FiltroDps, n: number): string {
  return `${filtro === 'por_llegar' ? 'Por llegar' : filtro === 'llegaron' ? 'Llegaron' : 'Todos'} ${n}`
}

function lineaPersona(p: PersonaPlanilla): { texto: string; tono: 'aviso' | 'sin_convocar' | null } {
  const puestos = p.puestos.join(', ')
  const otros = p.otrosPuestos.length > 0 ? `También en ${p.otrosPuestos.join(', ')}` : ''
  const resto = [puestos, otros].filter(Boolean).join(' · ')
  if (p.estado === 'aviso_no_viene') return { texto: ['Avisó que no viene', resto].filter(Boolean).join(' · '), tono: 'aviso' }
  if (!p.convocado) return { texto: ['Vino sin estar convocado', resto].filter(Boolean).join(' · '), tono: 'sin_convocar' }
  return { texto: resto, tono: null }
}

interface FilaPersonaProps {
  readonly persona: PersonaPlanilla
  readonly equipoId: string
  readonly editable: boolean
  readonly onLlego: (p: PersonaPlanilla) => void
  readonly onAviso: (p: PersonaPlanilla) => void
}

function FilaPersona({ persona, equipoId, editable, onLlego, onAviso }: FilaPersonaProps): ReactElement {
  const nombre = nombreCompleto(persona)
  const llego = persona.estado === 'llego'
  const aviso = persona.estado === 'aviso_no_viene'
  const linea = lineaPersona(persona)
  return (
    <li className={cn('relative flex min-h-14 items-center gap-3 py-1.5 pr-2 pl-4', CLASE_LINEA)}>
      <AvatarIniciales nombres={[nombre]} className="size-8 text-xs" />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-[15px] font-semibold', llego && 'font-medium text-muted-foreground')}>{nombre}</p>
        {linea.texto && (
          <p
            className={cn(
              'truncate text-[13px] text-muted-foreground',
              linea.tono === 'aviso' && 'text-warning-text',
              linea.tono === 'sin_convocar' && 'text-info-text',
            )}
          >
            {linea.texto}
          </p>
        )}
      </div>
      {editable && persona.convocado && (
        <button
          type="button"
          aria-pressed={aviso}
          aria-label={`Avisó que no viene: ${nombre}`}
          onClick={() => onAviso(persona)}
          className={cn(
            'focus-ring min-h-11 shrink-0 touch-manipulation rounded-md px-2 text-[13px] font-medium transition-colors',
            aviso ? 'bg-warning/15 text-warning-text' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          No viene
        </button>
      )}
      <MarcaLlegada nombre={nombre} llego={llego} disabled={!editable} onClick={() => onLlego(persona)} data-marca={`${equipoId}:${persona.personaId}`} />
    </li>
  )
}

interface SeccionEquipoProps {
  readonly equipo: EquipoPlanilla
  readonly filtro: FiltroDps
  readonly editable: boolean
  readonly abierto: boolean
  readonly onAlternar: () => void
  readonly onMarcarTodos: () => void
  readonly onLlego: (p: PersonaPlanilla, equipoId: string) => void
  readonly onAviso: (p: PersonaPlanilla) => void
}

function SeccionEquipo({ equipo, filtro, editable, abierto, onAlternar, onMarcarTodos, onLlego, onAviso }: SeccionEquipoProps): ReactElement {
  const { llegaron, total, porLlegar } = contarEquipo(equipo)
  const visibles = equipo.personas.filter((p) => visibleEnFiltro(p, filtro))
  const id = `dps-equipo-${equipo.equipoId}`
  return (
    <section aria-labelledby={`${id}-nombre`}>
      <div className={CLASE_CABECERA_EQUIPO}>
        <h2 className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={abierto}
            aria-controls={`${id}-lista`}
            onClick={onAlternar}
            className="focus-ring flex min-h-9 w-full touch-manipulation items-center gap-2 rounded-md pl-4 text-left pointer-coarse:min-h-11"
          >
            <span id={`${id}-nombre`} className="min-w-0 truncate text-[13px] font-[650]">
              {equipo.equipo}
            </span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {llegaron}/{total}
            </span>
            <ChevronDown aria-hidden="true" className={cn('ml-auto size-4 shrink-0 text-muted-foreground transition-transform', !abierto && '-rotate-90')} />
          </button>
        </h2>
        {editable && filtro !== 'llegaron' && (
          <button
            type="button"
            onClick={onMarcarTodos}
            disabled={porLlegar === 0}
            className="focus-ring min-h-9 shrink-0 touch-manipulation rounded-md px-2.5 text-[13px] font-medium text-brand-text transition-colors hover:bg-accent disabled:cursor-default disabled:text-muted-foreground disabled:hover:bg-transparent pointer-coarse:min-h-11"
          >
            Marcar todos<span className="sr-only"> en {equipo.equipo}</span>
          </button>
        )}
      </div>
      {abierto && (
        <div id={`${id}-lista`}>
          {visibles.length > 0 ? (
            <ul aria-label={`Personas de ${equipo.equipo}`}>
              {visibles.map((p) => (
                <FilaPersona key={p.personaId} persona={p} equipoId={equipo.equipoId} editable={editable} onLlego={(x) => onLlego(x, equipo.equipoId)} onAviso={onAviso} />
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3.5 text-[13px] text-muted-foreground">
              {filtro === 'por_llegar' ? 'Ya llegaron todos.' : filtro === 'llegaron' ? 'Todavía nadie.' : 'Nadie en este equipo.'}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

export function AsistenciaClient({ planes, plan, planilla: planillaInicial, error }: AsistenciaClientProps): ReactElement {
  const router = useRouter()
  const toast = useNotificaciones()
  const [planilla, setPlanilla] = useState<PlanillaDps | null>(planillaInicial)
  const [filtro, setFiltro] = useState<FiltroDps>('por_llegar')
  const [plegados, setPlegados] = useState<ReadonlySet<string>>(() => new Set())
  const [hojaAbierta, setHojaAbierta] = useState(false)
  const [guardado, setGuardado] = useState<EstadoGuardadoValor>('inactivo')
  const [aviso, setAviso] = useState('')

  // A reload answers only if it is the latest one and no change started after
  // it or is in flight, so it never undoes an optimistic mark. `dueno` keeps,
  // per person, the last change that touched them: a failure only rolls back
  // the people it still owns.
  const cargaRef = useRef(0)
  const versionRef = useRef(0)
  const enVueloRef = useRef(0)
  const duenoRef = useRef(new Map<string, number>())
  // Where the focus goes after a change (the same toggle, or the one now in its place).
  const focoRef = useRef<{ clave: string; indice: number } | null>(null)
  const listaRef = useRef<HTMLDivElement>(null)
  const agregarRef = useRef<HTMLButtonElement>(null)

  const planId = planilla?.planId ?? null

  const recargar = useCallback(async () => {
    if (!planId) return
    const carga = ++cargaRef.current
    const version = versionRef.current
    const r = await cargarPlanillaDps({ planId })
    if (carga !== cargaRef.current || version !== versionRef.current || enVueloRef.current > 0) return
    if (r.ok) setPlanilla(r.data)
  }, [planId])

  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible') void recargar()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [recargar])

  useLayoutEffect(() => {
    const foco = focoRef.current
    if (!foco) return
    focoRef.current = null
    const marcas = [...(listaRef.current?.querySelectorAll<HTMLButtonElement>('[data-marca]') ?? [])]
    const destino = marcas.find((b) => b.dataset.marca === foco.clave) ?? marcas[Math.min(foco.indice, marcas.length - 1)] ?? agregarRef.current
    destino?.focus()
  })

  const totales = useMemo(() => (planilla ? totalesPlanilla(planilla) : null), [planilla])
  const editable = planilla?.editable === true

  function recordarFoco(clave: string): void {
    const marcas = [...(listaRef.current?.querySelectorAll<HTMLButtonElement>('[data-marca]') ?? [])]
    focoRef.current = { clave, indice: Math.max(0, marcas.findIndex((b) => b.dataset.marca === clave)) }
  }

  function empezar(ids: readonly string[]): number {
    const version = ++versionRef.current
    for (const id of ids) duenoRef.current.set(id, version)
    enVueloRef.current += 1
    setGuardado('guardando')
    return version
  }

  function terminar(ok: boolean, mensaje?: string): void {
    enVueloRef.current -= 1
    if (!ok) {
      setGuardado('error')
      if (mensaje) toast.error(mensaje)
    } else if (enVueloRef.current === 0) {
      setGuardado((g) => (g === 'error' ? g : 'guardado'))
    }
  }

  const deshacer = (previos: ReadonlyMap<string, EstadoDps | null>, version: number) =>
    setPlanilla((p) => p && aplicarEstados(p, new Map([...previos].filter(([id]) => duenoRef.current.get(id) === version))))

  async function marcar(persona: PersonaPlanilla, estado: EstadoDps | null, frase: string): Promise<void> {
    if (!planId) return
    const version = empezar([persona.personaId])
    const previos = new Map([[persona.personaId, persona.estado] as const])
    setPlanilla((p) => p && aplicarEstados(p, new Map([[persona.personaId, estado] as const])))
    setAviso(frase)

    const r = await marcarAsistenciaDps({ planId, personaIds: [persona.personaId], estado })
    if (!r.ok) {
      deshacer(previos, version)
      setAviso('')
      terminar(false, r.message)
      return
    }
    terminar(true)
    // Someone who came without being convocado and was cleared goes back to `otros`.
    if (!persona.convocado && estado === null) void recargar()
  }

  function alLlegar(persona: PersonaPlanilla, equipoId: string): void {
    const nombre = nombreCompleto(persona)
    const llego = persona.estado === 'llego'
    recordarFoco(`${equipoId}:${persona.personaId}`)
    void marcar(persona, llego ? null : 'llego', llego ? `Quitaste la llegada de ${nombre}.` : `${nombre} llegó.`)
  }

  function alAvisar(persona: PersonaPlanilla): void {
    const nombre = nombreCompleto(persona)
    const avisado = persona.estado === 'aviso_no_viene'
    void marcar(persona, avisado ? null : 'aviso_no_viene', avisado ? `Quitaste el aviso de ${nombre}.` : `${nombre} avisó que no viene.`)
  }

  async function marcarTodos(equipo: EquipoPlanilla): Promise<void> {
    if (!planId) return
    const pendientes = pendientesEquipo(equipo)
    if (pendientes.length === 0) return
    const ids = pendientes.map((p) => p.personaId)
    const version = empezar(ids)
    const previos = new Map(pendientes.map((p) => [p.personaId, p.estado] as const))
    setPlanilla((p) => p && aplicarEstados(p, new Map(ids.map((id) => [id, 'llego'] as const))))
    setAviso(`Marcaste ${ids.length} ${palabra(ids.length, 'llegada', 'llegadas')} en ${equipo.equipo}.`)
    agregarRef.current?.focus()

    const r = await marcarEquipoDps({ planId, equipoId: equipo.equipoId })
    if (!r.ok) {
      deshacer(previos, version)
      setAviso('')
      terminar(false, r.message)
      return
    }
    terminar(true)
    // Someone else may have marked part of the team meanwhile: show what was stored.
    void recargar()
  }

  async function agregar(equipo: EquipoPlanilla, otro: OtroPlanilla): Promise<void> {
    if (!planId || !planilla) return
    const antes = planilla
    const version = empezar([otro.personaId])
    setHojaAbierta(false)
    setPlanilla((p) => p && agregarLlegada(p, equipo.equipoId, otro))
    setAviso(`${nombreCompleto(otro)} quedó como llegó en ${equipo.equipo}.`)
    agregarRef.current?.focus()

    const r = await marcarAsistenciaDps({ planId, personaIds: [otro.personaId], estado: 'llego' })
    if (!r.ok) {
      if (duenoRef.current.get(otro.personaId) === version) setPlanilla((p) => p && deshacerAgregar(p, otro.personaId, antes))
      setAviso('')
      terminar(false, r.message)
      return
    }
    terminar(true)
    // They now show under every team of their active servicios.
    void recargar()
  }

  function alternarEquipo(equipoId: string): void {
    setPlegados((actual) => {
      const siguiente = new Set(actual)
      if (siguiente.has(equipoId)) siguiente.delete(equipoId)
      else siguiente.add(equipoId)
      return siguiente
    })
  }

  const migas = <MigasDps actual="Asistencia" />

  const selectorPlan =
    planes.length > 1 && plan ? (
      <div className="max-w-md">
        <SelectSistema
          label="Plan"
          opciones={planes.map((p) => ({ valor: p.id, etiqueta: `${fechaCorta(p.fecha)} · ${tituloPlan(p)}` }))}
          value={plan.id}
          onValueChange={(id) => router.replace(`${RUTA}?plan=${encodeURIComponent(id)}`, { scroll: false })}
        />
      </div>
    ) : null

  if (!plan) {
    return (
      <PaginaSistema breadcrumbs={migas} className="relative">
        <h1 className="text-[28px] font-bold leading-[1.1] tracking-[-0.03em] md:text-2xl md:font-[650] md:tracking-[-0.02em]">Asistencia</h1>
        {error ? (
          <EstadoVacioSistema icono={CalendarDays} titulo="No se pudo cargar la asistencia" subtitulo={error.mensaje} />
        ) : (
          <EstadoVacioSistema
            icono={CalendarDays}
            titulo="No hay planes en los últimos 14 días"
            subtitulo="La asistencia se pasa el día del plan o hasta 14 días después. La dirección de DPS crea los planes."
          />
        )}
      </PaginaSistema>
    )
  }

  const horarios = horariosTexto(plan.horarios)
  const progreso = totales && totales.total > 0 ? (totales.llegaron / totales.total) * 100 : 0

  return (
    <PaginaSistema breadcrumbs={migas} className="relative pb-28 md:pb-0">
      <section aria-labelledby="dps-asistencia-titulo" className="space-y-1.5">
        <p className="text-[13px] text-muted-foreground">{tituloPlan(plan)}</p>
        <h1
          id="dps-asistencia-titulo"
          className="text-[28px] font-bold leading-[1.1] tracking-[-0.03em] md:text-2xl md:font-[650] md:tracking-[-0.02em]"
        >
          {fechaLarga(plan.fecha)}
        </h1>
        {totales && (
          <>
            <p data-testid="resumen-asistencia" className="text-[15px] text-muted-foreground">
              <strong className="font-mono font-semibold tabular-nums text-foreground">
                {totales.llegaron} de {totales.total}
              </strong>{' '}
              llegaron
              {plan.horarios.length > 1 && (
                <>
                  {' '}
                  · una marca vale para <span className="font-mono tabular-nums">{horarios}</span>
                </>
              )}
              {totales.avisos > 0 && (
                <>
                  {' '}
                  · <span className="font-mono tabular-nums">{totales.avisos}</span> {palabra(totales.avisos, 'avisó que no viene', 'avisaron que no vienen')}
                </>
              )}
            </p>
            <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-muted">
              <span className="block h-full bg-success transition-[width] duration-300 ease-[var(--ease-out-quint)]" style={{ width: `${progreso}%` }} />
            </div>
          </>
        )}
      </section>

      {selectorPlan}

      {error && (
        <EstadoVacioSistema
          icono={UsersRound}
          titulo={error.sinEquipos ? 'No tienes equipos para pasar asistencia' : 'No se pudo cargar la asistencia'}
          subtitulo={
            error.sinEquipos
              ? 'La pasan los coordinadores de cada equipo de DPS y quienes arman el plan.'
              : error.mensaje
          }
        />
      )}

      {planilla && totales && (
        <>
          {!editable && (
            <AvisoFormulario>Solo se puede pasar asistencia el día del plan o hasta 14 días después. Esta lista es de solo lectura.</AvisoFormulario>
          )}

          {planilla.equipos.length === 0 ? (
            <EstadoVacioSistema
              icono={UsersRound}
              titulo="Nadie convocado en este plan"
              subtitulo="Cuando la dirección convoque a tus equipos, aparecen aquí."
            />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ControlSegmentado
                  etiqueta="Mostrar"
                  opciones={(['por_llegar', 'llegaron', 'todos'] as const).map((f) => ({
                    valor: f,
                    etiqueta: etiquetaFiltro(f, f === 'por_llegar' ? totales.porLlegar : f === 'llegaron' ? totales.llegaron : totales.total),
                  }))}
                  valor={filtro}
                  onCambio={setFiltro}
                  className="flex w-full sm:w-auto [&>button]:flex-1"
                />
                <EstadoGuardado estado={guardado} />
              </div>

              <div ref={listaRef} className="-mx-4 border-y border-border bg-card sm:-mx-6 md:mx-0 md:overflow-clip md:rounded-md md:border">
                {planilla.equipos.map((e) => (
                  <SeccionEquipo
                    key={e.equipoId}
                    equipo={e}
                    filtro={filtro}
                    editable={editable}
                    abierto={!plegados.has(e.equipoId)}
                    onAlternar={() => alternarEquipo(e.equipoId)}
                    onMarcarTodos={() => void marcarTodos(e)}
                    onLlego={alLlegar}
                    onAviso={alAvisar}
                  />
                ))}
                {editable && (
                  <button
                    ref={agregarRef}
                    type="button"
                    onClick={() => setHojaAbierta(true)}
                    className="focus-ring flex min-h-14 w-full touch-manipulation items-center gap-3 border-t border-border px-4 text-left text-[15px] font-medium text-brand-text transition-colors hover:bg-accent"
                  >
                    <Plus aria-hidden="true" className="size-5" />
                    Agregar a alguien que vino sin estar convocado
                  </button>
                )}
              </div>
            </div>
          )}

          <p className="flex gap-2 text-[13px] text-muted-foreground">
            <CupSoda aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              {editable ? 'Se guarda al tocar el círculo; tócalo otra vez para deshacer. ' : ''}
              Esta asistencia será la base para validar el refrigerio más adelante.
            </span>
          </p>
          <p className="sr-only" role="status" aria-live="polite" data-testid="aviso-cambio">
            {aviso}
          </p>

          {editable && <HojaAgregar abierta={hojaAbierta} onCambioAbierta={setHojaAbierta} equipos={planilla.equipos} onElegir={(e, o) => void agregar(e, o)} />}
        </>
      )}
    </PaginaSistema>
  )
}
