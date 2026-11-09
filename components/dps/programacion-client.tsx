'use client'

/**
 * DPS › Programación — client island of /dps/programacion, the annual
 * programming sheet that replaces the Excel "Series 2026" (T11 of
 * odd/tasks/dps-asistencia-pco.md; S6.4, S7.1, S7.3; artboard
 * prototipos/planificacion-dps/04-programacion-anual-hoja.html). Built on the
 * wide layout of docs/design-system/layout.md, like plan-client.tsx.
 *
 * Top to bottom: crumbs "DPS › Programación"; the header band (h1
 * "Programación 2026", the summary "N domingos · N series · N días
 * especiales · N puestos … sin asignar de aquí a fin de año", "Nueva serie"
 * for whoever plans); the toolbar (Año, which changes `?anio=`; Mes, a
 * filter announced politely; "Columnas n/10"; Condensado | Normal; the
 * autosave status); the sheet (hoja-programacion.tsx) in a bordered region
 * that alone scrolls both ways, so the header row, the month separators and
 * the Fecha and Serie columns stay in view; the keyboard hints under it.
 * From md the view fills the viewport under the desktop header. A phone
 * gets a task view instead: the dates as a list with the series and the
 * productor, host and comunicador, each opening its plan; the sheet is
 * edited on a wider screen.
 *
 * Whoever plans (dps_puede_planificar) edits the cells: the change shows at
 * once and is saved through guardarCeldaDps (a Sunday without a plan gets it
 * then); a failure rolls the cell back and explains why. "Nueva serie"
 * (dialogo-nueva-serie.tsx) creates the series and its Sundays and reloads
 * the year. «Nuevo evento» (dialogo-nuevo-evento.tsx) creates a special
 * event of one or several days (one plan per day, shown together as
 * «Título · Día N de M»), and the menu of a special row moves it to another
 * date or deletes it (dialogos-evento.tsx); each reloads the year (T11b,
 * S9). Everyone else who sees DPS reads the same sheet (S6). The database
 * decides.
 */
import { useMemo, useRef, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarPlus, CalendarRange, ChevronDown, Columns3, Plus } from 'lucide-react'

import { BotonSistema, PaginaSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { CLASE_RESUMEN_PAGINA, CLASE_TITULO_PAGINA } from '@/components/grupos-vida/planner/marco-planner'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { cargarProgramacionDps, guardarCeldaDps } from '@/lib/actions/dps-programacion.actions'
import {
  COLUMNAS_HOJA,
  diasDelEvento,
  fechaCorta,
  filasHoja,
  nombreEspecial,
  nombreMes,
  normalizarCelda,
  partesFecha,
  proximoDomingo,
  resumenHoja,
  semanaSerie,
  valorParaRpc,
  type ColumnaHoja,
  type PlanHoja,
} from '@/lib/platform/dps/programacion'

import { DialogoNuevaSerie } from './dialogo-nueva-serie'
import { DialogoNuevoEvento } from './dialogo-nuevo-evento'
import { DialogoEliminarEvento, DialogoMoverFecha } from './dialogos-evento'
import { hrefPlan } from './encabezado-plan'
import { EstadoGuardado, type EstadoGuardadoValor } from './estado-guardado'
import { HojaProgramacion, type Densidad, type FilaDomingo } from './hoja-programacion'
import { MigasDps } from './migas-dps'

export interface ProgramacionClientProps {
  readonly anio: number
  readonly hoy: string
  /** dps_planes_rango of the year. */
  readonly planes: readonly PlanHoja[]
  /** dps_puede_planificar. */
  readonly editable: boolean
  /** Why the year could not be read. */
  readonly error: string | null
}

const RUTA = '/dps/programacion'
const OPCIONES_MES = [{ valor: '', etiqueta: 'Todos los meses' }, ...Array.from({ length: 12 }, (_, i) => ({ valor: String(i), etiqueta: nombreMes(i).replace(/^./, (l) => l.toLocaleUpperCase('es')) }))]
const DENSIDADES = [
  { valor: 'condensado', etiqueta: 'Condensado' },
  { valor: 'normal', etiqueta: 'Normal' },
] as const satisfies readonly { valor: Densidad; etiqueta: string }[]

interface CambioEnVuelo {
  readonly valor: string
  /** Which edit of the cell this is: only the latest one clears it. */
  readonly turno: number
}

const plural = (n: number, uno: string, varios: string) => `${n === 1 ? uno : varios}`

function Resumen({ domingos, series, especiales, sinAsignar, conPendientes }: ReturnType<typeof resumenHoja> & { conPendientes: boolean }): ReactElement {
  const num = (n: number) => <strong className="font-mono tabular-nums">{n}</strong>
  return (
    <p data-testid="resumen-programacion" className={CLASE_RESUMEN_PAGINA}>
      {num(domingos)} {plural(domingos, 'domingo', 'domingos')} · {num(series)} {plural(series, 'serie', 'series')} · {num(especiales)}{' '}
      {plural(especiales, 'día especial', 'días especiales')}
      {conPendientes && (
        <>
          {' '}
          · {num(sinAsignar)} {plural(sinAsignar, 'puesto', 'puestos')} de productor, host o comunicador sin asignar de aquí a fin de año
        </>
      )}
    </p>
  )
}

export function ProgramacionClient({ anio, hoy, planes: planesIniciales, editable, error }: ProgramacionClientProps): ReactElement {
  const router = useRouter()
  const toast = useNotificaciones()
  const [planes, setPlanes] = useState<readonly PlanHoja[]>(planesIniciales)
  const [mes, setMes] = useState<number | null>(null)
  const [ocultas, setOcultas] = useState<ReadonlySet<ColumnaHoja>>(new Set())
  const [densidad, setDensidad] = useState<Densidad>('normal')
  const [cambios, setCambios] = useState<Readonly<Record<string, CambioEnVuelo>>>({})
  const [guardado, setGuardado] = useState<EstadoGuardadoValor>('inactivo')
  const [aviso, setAviso] = useState('')
  const [nuevaSerie, setNuevaSerie] = useState(false)
  const [nuevoEvento, setNuevoEvento] = useState(false)
  const [accion, setAccion] = useState<{ readonly tipo: 'mover' | 'eliminar'; readonly plan: PlanHoja } | null>(null)
  const enVueloRef = useRef(0)
  const turnoRef = useRef(0)

  const filas = useMemo(() => filasHoja(planes, anio), [planes, anio])
  const visibles = useMemo(() => (mes === null ? filas : filas.filter((f) => f.mes === mes)), [filas, mes])
  const columnas = COLUMNAS_HOJA.filter((c) => !ocultas.has(c.id))
  const resumen = useMemo(() => resumenHoja(filas, hoy, anio), [filas, hoy, anio])
  const proximo = useMemo(() => proximoDomingo(filas, hoy), [filas, hoy])
  const anioHoy = Number(hoy.slice(0, 4))
  const anios = [...new Set([anioHoy - 1, anioHoy, anioHoy + 1, anio])].sort((a, b) => a - b)

  const valor = (fila: FilaDomingo, columna: ColumnaHoja): string => cambios[`${fila.fecha}|${columna}`]?.valor ?? fila.plan?.valores[columna] ?? ''

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
    } else if (enVueloRef.current === 0) {
      setGuardado((g) => (g === 'error' ? g : 'guardado'))
    }
  }

  async function guardarCelda(fila: FilaDomingo, columna: ColumnaHoja, texto: string): Promise<void> {
    const revisado = valorParaRpc(columna, texto)
    if (!revisado.ok) {
      toast.error(revisado.mensaje)
      return
    }
    const nuevo = normalizarCelda(columna, texto)
    if (nuevo === valor(fila, columna)) return
    const clave = `${fila.fecha}|${columna}`
    turnoRef.current += 1
    const turno = turnoRef.current
    const etiqueta = COLUMNAS_HOJA.find((c) => c.id === columna)?.etiqueta ?? columna
    setCambios((c) => ({ ...c, [clave]: { valor: nuevo, turno } }))
    empezar(`${etiqueta} del ${fechaCorta(fila.fecha)}: ${nuevo || 'vacío'}.`)

    const r = await guardarCeldaDps({ planId: fila.plan?.id ?? null, fecha: fila.fecha, columna, valor: texto })
    if (r.ok) setPlanes((ps) => [...ps.filter((p) => p.id !== r.data.id), r.data])
    setCambios((c) => {
      if (c[clave]?.turno !== turno) return c
      const { [clave]: _quitado, ...resto } = c
      return resto
    })
    terminar(r.ok, r.ok ? undefined : r.message)
  }

  function filtrarMes(valorMes: string): void {
    const elegido = valorMes === '' ? null : Number(valorMes)
    setMes(elegido)
    if (elegido === null) setAviso('Mostrando todo el año.')
    else {
      const n = filas.filter((f) => f.mes === elegido && f.clase === 'domingo').length
      setAviso(`Mostrando ${nombreMes(elegido)}: ${n} ${n === 1 ? 'domingo' : 'domingos'}.`)
    }
  }

  function alternarColumna(id: ColumnaHoja, visible: boolean): void {
    setOcultas((o) => {
      const siguiente = new Set(o)
      if (visible) siguiente.delete(id)
      else if (COLUMNAS_HOJA.length - o.size > 1) siguiente.add(id)
      return siguiente
    })
  }

  /** Announces a change made in a dialog and reloads the year (series, events, «Día N de M»). */
  async function recargar(frase: string): Promise<void> {
    toast.success(frase)
    setAviso(frase)
    const r = await cargarProgramacionDps({ anio })
    if (r.ok) setPlanes(r.data)
    else toast.error(r.message)
  }

  async function serieCreada(nombre: string, semanas: number): Promise<void> {
    setNuevaSerie(false)
    await recargar(`Creamos «${nombre}» con ${semanas} ${semanas === 1 ? 'domingo' : 'domingos'}.`)
  }

  async function eventoCreado(titulo: string, dias: number): Promise<void> {
    setNuevoEvento(false)
    await recargar(dias === 1 ? `Creamos «${titulo}».` : `Creamos «${titulo}» (${dias} días).`)
  }

  return (
    <PaginaSistema breadcrumbs={<MigasDps actual="Programación" />} className="relative">
      {/* Past the page gutters of PaginaSistema, as plan-client.tsx: from md, exactly the viewport under the 64px desktop header. */}
      <div data-testid="marco-programacion" className="-m-4 sm:-m-6 md:flex md:h-[calc(100dvh-4rem)] md:min-h-[32rem] md:flex-col lg:-mx-12 lg:-my-8">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 pt-4 sm:px-6 md:border-b md:border-border md:bg-card md:pb-3.5">
          <div className="min-w-0 flex-1 basis-80 space-y-1">
            <h1 className={CLASE_TITULO_PAGINA}>Programación {anio}</h1>
            {!error && <Resumen {...resumen} conPendientes={anio >= anioHoy} />}
          </div>
          {editable && !error && (
            <div className="flex flex-wrap items-center gap-2">
              <BotonSistema variante="outline" tamaño="sm" icono={CalendarPlus} onClick={() => setNuevoEvento(true)}>
                Nuevo evento
              </BotonSistema>
              <BotonSistema tamaño="sm" icono={Plus} onClick={() => setNuevaSerie(true)}>
                Nueva serie
              </BotonSistema>
            </div>
          )}
        </header>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5 px-4 pt-4 pb-3 sm:px-6 md:py-2.5">
          <SelectSistema
            aria-label="Año"
            opciones={anios.map((a) => ({ valor: String(a), etiqueta: String(a) }))}
            value={String(anio)}
            onValueChange={(a) => router.push(`${RUTA}?anio=${a}`)}
          />
          <SelectSistema aria-label="Mes" opciones={OPCIONES_MES} value={mes === null ? '' : String(mes)} onValueChange={filtrarMes} />
          <div className="hidden md:contents">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <BotonSistema variante="outline" tamaño="sm" icono={Columns3}>
                  Columnas{' '}
                  <span className="font-mono tabular-nums">
                    {columnas.length}/{COLUMNAS_HOJA.length}
                  </span>
                  <ChevronDown aria-hidden="true" className="size-3.5" />
                </BotonSistema>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" aria-label="Columnas visibles" className="min-w-56 bg-card shadow-sheet">
                {COLUMNAS_HOJA.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={!ocultas.has(c.id)}
                    onCheckedChange={(v) => alternarColumna(c.id, v === true)}
                    onSelect={(e) => e.preventDefault()}
                    className="min-h-8 text-[13px] pointer-coarse:min-h-11"
                  >
                    {c.etiqueta}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <ControlSegmentado etiqueta="Densidad" opciones={DENSIDADES} valor={densidad} onCambio={setDensidad} />
          </div>
          {!editable && !error && <p className="text-[13px] text-muted-foreground">Solo lectura: la programación la arman la dirección de DPS y quienes ella agrega.</p>}
          {editable && <EstadoGuardado estado={guardado} className="ml-auto" />}
        </div>

        {error ? (
          <div className="px-4 pb-8 sm:px-6">
            <EstadoVacioSistema icono={CalendarRange} titulo="No se pudo cargar la programación" subtitulo={error} />
          </div>
        ) : (
          <>
            <div
              role="region"
              aria-label={`Hoja de programación ${anio}`}
              className="mx-4 hidden overflow-auto rounded-md border border-border bg-card [scrollbar-color:color-mix(in_oklab,var(--muted-foreground)_40%,transparent)_transparent] [scrollbar-width:thin] sm:mx-6 md:block md:min-h-0 md:flex-1"
            >
              <HojaProgramacion
                anio={anio}
                filas={visibles}
                columnas={columnas}
                editable={editable}
                densidad={densidad}
                hoy={hoy}
                proximo={proximo}
                valor={valor}
                onGuardar={(fila, columna, texto) => void guardarCelda(fila, columna, texto)}
                onMover={(plan) => setAccion({ tipo: 'mover', plan })}
                onEliminar={(plan) => setAccion({ tipo: 'eliminar', plan })}
              />
            </div>
            <p id="ayuda-hoja" className="hidden shrink-0 flex-wrap items-center gap-x-4 gap-y-1 px-6 pt-2 pb-3 text-xs text-muted-foreground md:flex">
              {editable && (
                <>
                  <span>
                    <kbd className="rounded-md border border-border bg-card px-1 font-mono text-[11px] text-foreground">Enter</kbd> edita y baja
                  </span>
                  <span>
                    <kbd className="rounded-md border border-border bg-card px-1 font-mono text-[11px] text-foreground">Tab</kbd> siguiente
                  </span>
                  <span>
                    <kbd className="rounded-md border border-border bg-card px-1 font-mono text-[11px] text-foreground">Esc</kbd> cancela
                  </span>
                  <span>Escribe sobre una celda para reemplazarla</span>
                </>
              )}
              <span>Flechas para moverte</span>
              <span className="ml-auto">Las columnas Fecha y Serie quedan fijas al desplazarte</span>
            </p>

            {/* Phones: a task view of the same dates (the sheet is edited on a wider screen). */}
            <div className="px-4 pb-8 md:hidden">
              <ul aria-label={`Fechas de ${anio}`} className="overflow-hidden rounded-2xl border border-border bg-card">
                {visibles.map((fila) => {
                  const { dia, numero, mes: mesCorto } = partesFecha(fila.fecha)
                  const plan = fila.plan
                  const titulo = fila.clase === 'especial' ? nombreEspecial(fila.plan) : plan?.serie ? `${plan.serie.nombre} ${semanaSerie(plan)}`.trim() : 'Sin serie'
                  const quienes = plan ? (['productor', 'host', 'comunicador'] as const).map((c) => plan.valores[c]).filter(Boolean).join(' · ') : ''
                  const contenido = (
                    <>
                      <span className="w-16 shrink-0 text-[13px] text-muted-foreground">
                        {dia} <span className="font-mono tabular-nums text-foreground">{numero}</span> {mesCorto}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{titulo}</span>
                        {quienes && <span className="block truncate text-[13px] text-muted-foreground">{quienes}</span>}
                      </span>
                    </>
                  )
                  return (
                    <li key={fila.clave} className="border-border/60 [&+&]:border-t">
                      {plan ? (
                        <Link href={hrefPlan(plan.id)} className="focus-ring flex min-h-16 items-center gap-3 px-4 py-2">
                          {contenido}
                        </Link>
                      ) : (
                        <div className="flex min-h-16 items-center gap-3 px-4 py-2">{contenido}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
              {editable && <p className="mt-3 text-[13px] text-muted-foreground">Para editar la hoja, ábrela en una pantalla más ancha.</p>}
            </div>
          </>
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite" data-testid="aviso-cambio">
        {aviso}
      </p>

      {editable && nuevaSerie && (
        <DialogoNuevaSerie planes={planes} anio={anio} hoy={hoy} onCerrar={() => setNuevaSerie(false)} onCreada={(n, s) => void serieCreada(n, s)} />
      )}
      {editable && nuevoEvento && <DialogoNuevoEvento planes={planes} hoy={hoy} onCerrar={() => setNuevoEvento(false)} onCreado={(t, d) => void eventoCreado(t, d)} />}
      {editable && accion?.tipo === 'mover' && (
        <DialogoMoverFecha
          plan={accion.plan}
          planes={planes}
          hoy={hoy}
          onCerrar={() => setAccion(null)}
          onMovido={(nombre, fecha) => {
            setAccion(null)
            void recargar(`Movimos «${nombre}» al ${fechaCorta(fecha)}.`)
          }}
        />
      )}
      {editable && accion?.tipo === 'eliminar' && (
        <DialogoEliminarEvento
          plan={accion.plan}
          dias={diasDelEvento(planes, accion.plan)}
          onCerrar={() => setAccion(null)}
          onEliminado={(frase) => {
            setAccion(null)
            void recargar(frase)
          }}
        />
      )}
    </PaginaSistema>
  )
}
