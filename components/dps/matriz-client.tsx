'use client'

/**
 * DPS › Matriz — client island of /dps/matriz, Matriz de domingos (T12 of
 * odd/tasks/dps-asistencia-pco.md; S6, S7, S8; artboard
 * prototipos/planificacion-dps/03-matriz-domingos.html,
 * docs/design-system/patterns.md#matrix-assign). Several Sundays at once,
 * as the directors saw them in the Excel (L11). Built on the wide layout of
 * docs/design-system/layout.md, like plan-client.tsx.
 *
 * Top to bottom: crumbs "DPS › Plan › Matriz" (the plan's «Matriz» button
 * opens it); the header band (h1 "Matriz de domingos", the summary "1 nov –
 * 20 dic 2026 · 8 domingos y 1 día especial · N puestos sin cubrir", and
 * ‹ Hoy › stepping 8 weeks through `?desde=`); the toolbar (Equipo filter,
 * Condensado | Normal, the highlight chip "Resaltado: <persona> · 3 de 8
 * domingos", the autosave status); the matrix (matriz-domingos.tsx) in a
 * bordered region that alone scrolls both ways; the keys under it. From md
 * the view fills the viewport under the desktop header. A phone gets a
 * short message and a link to the plan instead: the matrix is a desktop
 * view.
 *
 * Whoever plans (dps_plan_equipos.puede_editar) convoca and quita from the
 * cell's popover with the plan's server actions (dps_convocar /
 * dps_desconvocar / dps_candidatos_puesto): the change shows at once, the
 * popover stays open, and a failure rolls it back and explains why. Nobody
 * convocado is notified. The automatic directors (S8) are never removed
 * here. Everyone else who sees DPS reads the same matrix and may highlight a
 * person. The database decides.
 */
import { useMemo, useRef, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { CalendarRange, ChevronLeft, ChevronRight, Crosshair, X } from 'lucide-react'

import { BotonSistema, PaginaSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { CLASE_RESUMEN_PAGINA, CLASE_TITULO_PAGINA } from '@/components/grupos-vida/planner/marco-planner'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { convocarDps, desconvocarDps } from '@/lib/actions/dps-plan.actions'
import {
  columnasMatriz,
  domingosConPersona,
  etiquetaColumna,
  etiquetaRango,
  faltaTotalMatriz,
  filasMatriz,
  hrefMatriz,
  proximaColumna,
  resumenColumnas,
  SEMANAS_MATRIZ,
  type ColumnaMatriz,
  type RangoMatriz,
} from '@/lib/platform/dps/matriz'
import {
  confirmarConvocado,
  convocarEnPlan,
  quitarDePlan,
  type CandidatoPuesto,
  type ConvocadoPlan,
  type EquiposPlan,
  type PlanCabecera,
  type PuestoPlan,
} from '@/lib/platform/dps/plan'
import { nombreCompleto } from '@/lib/platform/dps/planilla'

import { EstadoGuardado, type EstadoGuardadoValor } from './estado-guardado'
import type { Densidad } from './hoja-programacion'
import { MatrizDomingos, type CeldaAbierta } from './matriz-domingos'
import { MigasDps } from './migas-dps'

export interface MatrizClientProps {
  readonly rango: RangoMatriz
  readonly hoy: string
  /** dps_planes_rango of the range. */
  readonly planes: readonly PlanCabecera[]
  /** dps_plan_equipos by plan id; a plan that could not be read is missing. */
  readonly equipos: Readonly<Record<string, EquiposPlan>>
  readonly editable: boolean
  /** Why the range, or some of its plans, could not be read. */
  readonly error: string | null
}

const DENSIDADES = [
  { valor: 'condensado', etiqueta: 'Condensado' },
  { valor: 'normal', etiqueta: 'Normal' },
] as const satisfies readonly { valor: Densidad; etiqueta: string }[]

const CLASE_TECLA = 'rounded-md border border-border bg-card px-1 font-mono text-[11px] text-foreground'

const num = (n: number) => <strong className="font-mono tabular-nums">{n}</strong>

function Resumen({ rango, columnas, falta }: { rango: RangoMatriz; columnas: readonly ColumnaMatriz[]; falta: number | null }): ReactElement {
  const { domingos, especiales } = resumenColumnas(columnas)
  return (
    <p data-testid="resumen-matriz" className={CLASE_RESUMEN_PAGINA}>
      <strong>{etiquetaRango(rango)}</strong>
      {falta !== null && (
        <>
          {' '}
          · {num(domingos)} {domingos === 1 ? 'domingo' : 'domingos'}
          {especiales > 0 && (
            <>
              {' '}
              y {num(especiales)} {especiales === 1 ? 'día especial' : 'días especiales'}
            </>
          )}{' '}
          ·{' '}
          {falta === 0 ? (
            'todo cubierto'
          ) : (
            <>
              {num(falta)} {falta === 1 ? 'puesto sin cubrir' : 'puestos sin cubrir'}
            </>
          )}
        </>
      )}
    </p>
  )
}

export function MatrizClient({ rango, hoy, planes, equipos: equiposIniciales, editable, error }: MatrizClientProps): ReactElement {
  const toast = useNotificaciones()
  const [equiposPorPlan, setEquiposPorPlan] = useState<Readonly<Record<string, EquiposPlan>>>(equiposIniciales)
  const [filtro, setFiltro] = useState('')
  const [densidad, setDensidad] = useState<Densidad>('normal')
  const [resaltado, setResaltado] = useState<{ readonly personaId: string; readonly nombre: string } | null>(null)
  const [abierta, setAbierta] = useState<CeldaAbierta | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [guardado, setGuardado] = useState<EstadoGuardadoValor>('inactivo')
  const [aviso, setAviso] = useState('')
  const enVueloRef = useRef(0)

  const columnas = useMemo(() => columnasMatriz(planes, rango), [planes, rango])
  const filas = useMemo(() => filasMatriz(equiposPorPlan, columnas), [equiposPorPlan, columnas])
  const visibles = filtro === '' ? filas : filas.filter((e) => e.equipoId === filtro)
  const falta = useMemo(() => faltaTotalMatriz(filas, columnas, equiposPorPlan), [filas, columnas, equiposPorPlan])
  const proximo = proximaColumna(columnas, hoy)
  const domingosResaltado = resaltado ? domingosConPersona(resaltado.personaId, columnas, equiposPorPlan) : 0

  function cambiarPlan(planId: string, cambio: (e: EquiposPlan) => EquiposPlan): void {
    setEquiposPorPlan((todos) => (todos[planId] ? { ...todos, [planId]: cambio(todos[planId]) } : todos))
  }

  function empezar(frase: string): void {
    enVueloRef.current += 1
    setGuardado('guardando')
    setAviso(frase)
  }

  function terminar(ok: boolean, mensaje?: string): void {
    enVueloRef.current -= 1
    if (!ok) {
      setGuardado('error')
      setAviso('')
      if (mensaje) toast.error(mensaje)
    } else {
      // The popover's candidates are read again (who is in the puesto now).
      setRecarga((r) => r + 1)
      if (enVueloRef.current === 0) setGuardado((g) => (g === 'error' ? g : 'guardado'))
    }
  }

  async function convocar(columna: ColumnaMatriz, puesto: PuestoPlan, candidato: CandidatoPuesto): Promise<void> {
    const planId = columna.plan?.id
    if (!planId || puesto.convocados.some((c) => c.personaId === candidato.personaId)) return
    const nombre = nombreCompleto(candidato)
    const temporal: ConvocadoPlan = { convocadoId: '', personaId: candidato.personaId, servicioId: candidato.servicioId, nombre, automatico: false }
    cambiarPlan(planId, (e) => convocarEnPlan(e, puesto.puestoId, temporal))
    empezar(`Convocaste a ${nombre} · ${puesto.nombre}, ${etiquetaColumna(columna).titulo}.`)

    const r = await convocarDps({ planId, puestoId: puesto.puestoId, servicioId: candidato.servicioId })
    if (!r.ok) {
      cambiarPlan(planId, (e) => quitarDePlan(e, puesto.puestoId, candidato.personaId))
      terminar(false, r.message)
      return
    }
    cambiarPlan(planId, (e) => confirmarConvocado(e, puesto.puestoId, candidato.personaId, r.data.convocadoId))
    terminar(true)
  }

  async function quitar(columna: ColumnaMatriz, puesto: PuestoPlan, convocado: ConvocadoPlan): Promise<void> {
    const planId = columna.plan?.id
    if (!planId || convocado.automatico) return
    cambiarPlan(planId, (e) => quitarDePlan(e, puesto.puestoId, convocado.personaId))
    empezar(`Quitaste a ${convocado.nombre} · ${puesto.nombre}, ${etiquetaColumna(columna).titulo}.`)

    const r = await desconvocarDps({ planId, puestoId: puesto.puestoId, personaId: convocado.personaId })
    if (!r.ok) {
      cambiarPlan(planId, (e) => convocarEnPlan(e, puesto.puestoId, convocado))
      terminar(false, r.message)
      return
    }
    terminar(true)
  }

  function resaltar(convocado: ConvocadoPlan): void {
    const quitarlo = resaltado?.personaId === convocado.personaId
    setResaltado(quitarlo ? null : { personaId: convocado.personaId, nombre: convocado.nombre })
    setAviso(quitarlo ? 'Sin resaltado.' : `Resaltando a ${convocado.nombre}.`)
  }

  function filtrar(equipoId: string): void {
    setFiltro(equipoId)
    setAbierta(null)
    setAviso(equipoId === '' ? 'Mostrando todos los equipos.' : `Mostrando ${filas.find((e) => e.equipoId === equipoId)?.equipo ?? 'un equipo'}.`)
  }

  const opcionesEquipo = [{ valor: '', etiqueta: 'Todos los equipos' }, ...filas.map((e) => ({ valor: e.equipoId, etiqueta: e.equipo }))]
  const conMatriz = planes.length > 0 && filas.length > 0

  return (
    <PaginaSistema breadcrumbs={<MigasDps padre={{ href: '/dps/plan', texto: 'Plan' }} actual="Matriz" />} className="relative">
      {/* Past the page gutters of PaginaSistema, as plan-client.tsx: from md, exactly the viewport under the 64px desktop header. */}
      <div data-testid="marco-matriz" className="-m-4 sm:-m-6 md:flex md:h-[calc(100dvh-4rem)] md:min-h-[32rem] md:flex-col lg:-mx-12 lg:-my-8">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 pt-4 sm:px-6 md:border-b md:border-border md:bg-card md:pb-3.5">
          <div className="min-w-0 flex-1 basis-80 space-y-1">
            <h1 className={CLASE_TITULO_PAGINA}>Matriz de domingos</h1>
            <Resumen rango={rango} columnas={columnas} falta={planes.length > 0 ? falta : null} />
          </div>
          <nav aria-label="Semanas" className="hidden items-center gap-2 md:flex">
            <BotonSistema asChild variante="outline" tamaño="sm" soloIcono icono={ChevronLeft} aria-label="Semanas anteriores">
              <Link href={hrefMatriz(rango.anterior)} />
            </BotonSistema>
            <BotonSistema asChild variante="outline" tamaño="sm">
              <Link href="/dps/matriz">Hoy</Link>
            </BotonSistema>
            <BotonSistema asChild variante="outline" tamaño="sm" soloIcono icono={ChevronRight} aria-label="Semanas siguientes">
              <Link href={hrefMatriz(rango.siguiente)} />
            </BotonSistema>
          </nav>
        </header>

        {/* Phones: the matrix is a desktop view. */}
        <div data-testid="matriz-movil" className="px-4 pt-3 pb-8 md:hidden">
          <p className="text-[15px] text-muted-foreground">La matriz se usa en una pantalla más ancha. En el celular, arma cada domingo desde su plan.</p>
          <BotonSistema asChild variante="outline" tamaño="md" className="mt-4">
            <Link href="/dps/plan">Ir al plan del domingo</Link>
          </BotonSistema>
        </div>

        <div className="hidden shrink-0 flex-wrap items-center gap-2.5 px-6 py-2.5 md:flex">
          {conMatriz && (
            <>
              <SelectSistema aria-label="Equipo" opciones={opcionesEquipo} value={filtro} onValueChange={filtrar} />
              <ControlSegmentado etiqueta="Densidad" opciones={DENSIDADES} valor={densidad} onCambio={setDensidad} />
            </>
          )}
          {resaltado && (
            <span
              data-testid="resaltado"
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-brand/40 bg-brand-tint pr-1 pl-2.5 text-[13px]"
            >
              <Crosshair aria-hidden="true" className="size-3.5 text-brand-text" />
              <span>
                Resaltado: <strong className="font-semibold">{resaltado.nombre}</strong> · <span className="font-mono tabular-nums">{domingosResaltado}</span> de{' '}
                <span className="font-mono tabular-nums">{SEMANAS_MATRIZ}</span> domingos
              </span>
              <button
                type="button"
                aria-label={`Quitar resaltado de ${resaltado.nombre}`}
                onClick={() => {
                  setResaltado(null)
                  setAviso('Sin resaltado.')
                }}
                className="focus-ring grid size-[26px] place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:size-11"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </span>
          )}
          {conMatriz && !editable && <p className="text-[13px] text-muted-foreground">Solo lectura: el plan lo arman la dirección de DPS y quienes ella agrega.</p>}
          {editable && <EstadoGuardado estado={guardado} className="ml-auto" />}
        </div>

        {error && planes.length > 0 && (
          <p role="alert" className="mx-6 mb-2.5 hidden text-[13px] text-danger-text md:block">
            {error}
          </p>
        )}

        {!conMatriz ? (
          <div className="hidden px-6 pb-8 md:block">
            {error ? (
              <EstadoVacioSistema icono={CalendarRange} titulo="No se pudo cargar la matriz" subtitulo={error} />
            ) : (
              <EstadoVacioSistema
                icono={CalendarRange}
                titulo="Sin planes en estas semanas"
                subtitulo="La dirección de DPS crea los planes de cada fecha en la programación anual."
              />
            )}
          </div>
        ) : (
          <>
            <div
              role="region"
              aria-label="Matriz de domingos"
              className="mx-6 hidden min-h-0 flex-1 overflow-auto rounded-md border border-border bg-card [scrollbar-color:color-mix(in_oklab,var(--muted-foreground)_40%,transparent)_transparent] [scrollbar-width:thin] md:block"
            >
              <MatrizDomingos
                columnas={columnas}
                equipos={visibles}
                equiposPorPlan={equiposPorPlan}
                editable={editable}
                densidad={densidad}
                proximo={proximo}
                resaltado={resaltado?.personaId ?? null}
                abierta={abierta}
                onAbrir={setAbierta}
                recarga={recarga}
                onConvocar={(c, p, candidato) => void convocar(c, p, candidato)}
                onQuitar={(c, p, convocado) => void quitar(c, p, convocado)}
                onResaltar={resaltar}
                onAviso={setAviso}
              />
            </div>
            <p id="ayuda-matriz" className="hidden shrink-0 flex-wrap items-center gap-x-4 gap-y-1 px-6 pt-2 pb-3 text-xs text-muted-foreground md:flex">
              <span>
                Clic o <kbd className={CLASE_TECLA}>Enter</kbd> en una celda para {editable ? 'convocar' : 'ver quién está'}
              </span>
              <span>Flechas para moverte</span>
              <span>Resalta a una persona desde su celda para verla en todas las fechas</span>
              {editable && <span className="ml-auto">Los cambios se guardan solos y no se avisa a los convocados</span>}
            </p>
          </>
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite" data-testid="aviso-cambio">
        {aviso}
      </p>
    </PaginaSistema>
  )
}
