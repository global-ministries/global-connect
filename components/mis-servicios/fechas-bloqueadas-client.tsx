'use client'

/**
 * «Fechas que no puedo servir», /mis-servicios/fechas (odd/tasks/
 * dps-asistencia-pco.md, T15c, S13.5, S13.6; artboard design/dps-avisos/06).
 * The ranges that have not ended, each with its nota and «Quitar», and
 * «Agregar fecha»: a sheet (bottom sheet on the phone, side panel on desktop)
 * to pick one or more Sundays or a range, with an optional nota (up to 200).
 * The Sundays where the person is already programmed carry a mark and a
 * warning; after saving, the services inside a range come back from
 * agregarFechaBloqueadaDps and show as «Ya estás programado como Host el
 * domingo 15» with a link to that service. Blocking a date never answers
 * «No puedo» for the person (S13.6); the planner may still pick them.
 */
import { useMemo, useRef, useState, type FormEvent, type ReactElement } from 'react'
import Link from 'next/link'
import { CalendarOff, Plus, X } from 'lucide-react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { BotonAtrasMovil } from '@/components/ui/barra-navegacion-movil'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { BotonSistema, InputSistema, PaginaSistema } from '@/components/ui/sistema-diseno'
import { agregarFechaBloqueadaDps, quitarFechaBloqueadaDps } from '@/lib/actions/dps-avisos.actions'
import { MAX_NOTA_BLOQUEO, validarFechaBloqueada, type FechaBloqueada, type ServicioAviso } from '@/lib/platform/dps/avisos'
import { MENSAJE_NOTA_BLOQUEO } from '@/lib/platform/dps/errores'
import { fechaHablada } from '@/lib/platform/dps/plan'
import { domingoDesde, nombreMes, sumarDias } from '@/lib/platform/dps/programacion'
import { cn } from '@/lib/utils'

import { ANCLA_NO_PUEDO } from './respuesta-servicio'
import { domingosEntre, mesYDia, palabra, rolesTexto, textoConflicto, tituloRango } from './textos'

export interface FechasBloqueadasClientProps {
  readonly fechas: readonly FechaBloqueada[]
  /** The person's upcoming services (dps_mis_servicios): the marks of the Sundays grid. */
  readonly programados: readonly ServicioAviso[]
  /** Today in Caracas (YYYY-MM-DD). */
  readonly hoy: string
}

/** The Sundays the grid offers: about three months. */
const SEMANAS_GRILLA = 13
const CLASE_SECCION = 'px-1 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase'
const CLASE_LINEA = 'before:absolute before:top-0 before:right-0 before:left-[66px] before:h-px before:bg-border/60 first:before:hidden'

type Modo = 'domingos' | 'rango'

const ordenar = (lista: readonly FechaBloqueada[]): FechaBloqueada[] => [...lista].sort((a, b) => (a.desde === b.desde ? a.hasta.localeCompare(b.hasta) : a.desde.localeCompare(b.desde)))

const nombreRango = (f: Pick<FechaBloqueada, 'desde' | 'hasta'>): string => (f.desde === f.hasta ? fechaHablada(f.desde) : tituloRango(f.desde, f.hasta).toLocaleLowerCase('es'))

function FilaFecha({ fecha, onQuitar, quitando }: { fecha: FechaBloqueada; onQuitar: (f: FechaBloqueada) => void; quitando: boolean }): ReactElement {
  const uno = fecha.desde === fecha.hasta
  const domingos = domingosEntre(fecha.desde, fecha.hasta)
  const inicio = mesYDia(fecha.desde)
  const fin = mesYDia(fecha.hasta)
  const sub = [uno ? '' : `${domingos.length} ${palabra(domingos.length, 'domingo', 'domingos')}`, fecha.nota ?? (uno ? 'Sin nota' : '')].filter(Boolean).join(' · ')
  return (
    <li className={cn('relative flex min-h-16 items-start gap-3 py-2.5 pr-1.5 pl-3.5', CLASE_LINEA)}>
      <span aria-hidden="true" className="mt-0.5 grid h-11 w-10 shrink-0 content-center justify-items-center rounded-md bg-muted leading-none">
        <small className="text-xs font-semibold uppercase text-brand-text">{uno ? inicio.mes : `${domingos.length} dom`}</small>
        <b className={cn('mt-0.5 font-mono font-[650] tabular-nums', uno ? 'text-lg' : 'text-[13px]')}>{uno ? inicio.dia : `${inicio.dia}–${fin.dia}`}</b>
      </span>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="truncate text-base font-semibold">{tituloRango(fecha.desde, fecha.hasta)}</p>
        {sub && <p className="truncate text-[13px] text-muted-foreground">{sub}</p>}
        {fecha.conflictos.map((c) => (
          <div key={c.planId} className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2">
            <span className="flex min-w-0 items-start gap-2">
              <PuntoEstado tono="warning" className="mt-1" />
              <span className="text-[13px] font-medium text-warning-text">{textoConflicto(c)}</span>
            </span>
            {c.estado === 'no_puede' ? (
              <span className="text-[13px] text-muted-foreground">Ya respondiste «No puedo»</span>
            ) : (
              <Link
                href={`/mis-servicios/${c.planId}#${ANCLA_NO_PUEDO}`}
                className="focus-ring inline-flex min-h-11 items-center rounded-md text-[13px] font-medium text-brand-text touch-manipulation"
              >
                Responder «No puedo»
              </Link>
            )}
          </div>
        ))}
      </div>
      <BotonSistema
        soloIcono
        icono={X}
        variante="ghost"
        type="button"
        aria-label={`Quitar ${nombreRango(fecha)}`}
        onClick={() => onQuitar(fecha)}
        disabled={quitando}
      />
    </li>
  )
}

interface HojaAgregarProps {
  readonly abierta: boolean
  readonly onCambioAbierta: (abierta: boolean) => void
  readonly hoy: string
  readonly fechas: readonly FechaBloqueada[]
  readonly programados: readonly ServicioAviso[]
  readonly onGuardadas: (nuevas: FechaBloqueada[]) => void
}

function HojaAgregar({ abierta, onCambioAbierta, hoy, fechas, programados, onGuardadas }: HojaAgregarProps): ReactElement {
  const [modo, setModo] = useState<Modo>('domingos')
  const [elegidos, setElegidos] = useState<ReadonlySet<string>>(() => new Set())
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [nota, setNota] = useState('')
  const [errorNota, setErrorNota] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const bloqueados = useMemo(() => new Set(fechas.flatMap((f) => domingosEntre(f.desde, f.hasta))), [fechas])
  const programadoEn = useMemo(() => {
    const mapa = new Map<string, ServicioAviso>()
    for (const s of programados) if (s.estado !== 'no_puede' && !mapa.has(s.fecha)) mapa.set(s.fecha, s)
    return mapa
  }, [programados])
  const grilla = useMemo(() => {
    const primero = domingoDesde(hoy)
    const porMes = new Map<string, string[]>()
    for (let i = 0; i < SEMANAS_GRILLA; i += 1) {
      const d = sumarDias(primero, i * 7)
      const mes = d.slice(0, 7)
      porMes.set(mes, [...(porMes.get(mes) ?? []), d])
    }
    return [...porMes]
  }, [hoy])

  const rangoValido = desde !== '' && hasta !== '' && desde <= hasta
  const dias = modo === 'domingos' ? [...elegidos].sort() : rangoValido ? domingosEntre(desde, hasta) : []
  const listo = modo === 'domingos' ? elegidos.size > 0 : rangoValido
  const choques = [...new Set(modo === 'domingos' ? dias : programados.map((s) => s.fecha).filter((f) => rangoValido && f >= desde && f <= hasta))]
    .filter((d) => programadoEn.has(d))
    .sort()

  function reiniciar() {
    setModo('domingos')
    setElegidos(new Set())
    setDesde('')
    setHasta('')
    setNota('')
    setErrorNota(null)
    setError(null)
  }

  function alternar(domingo: string) {
    setElegidos((actual) => {
      const nuevo = new Set(actual)
      if (nuevo.has(domingo)) nuevo.delete(domingo)
      else nuevo.add(domingo)
      return nuevo
    })
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!listo || guardando) return
    if (nota.trim().length > MAX_NOTA_BLOQUEO) {
      setErrorNota(MENSAJE_NOTA_BLOQUEO)
      return
    }
    const rangos = modo === 'domingos' ? [...elegidos].sort().map((d) => ({ desde: d, hasta: d })) : [{ desde, hasta }]
    for (const r of rangos) {
      const revisada = validarFechaBloqueada(r.desde, r.hasta, nota)
      if (!revisada.ok) {
        if (revisada.codigo === 'nota_invalida') setErrorNota(revisada.mensaje)
        else setError(revisada.mensaje)
        return
      }
    }
    setError(null)
    setGuardando(true)
    const guardadas: FechaBloqueada[] = []
    let fallo: string | null = null
    for (const r of rangos) {
      const resultado = await agregarFechaBloqueadaDps({ desde: r.desde, hasta: r.hasta, nota: nota.trim() === '' ? null : nota.trim() })
      if (!resultado.ok) {
        fallo = resultado.message
        break
      }
      guardadas.push(resultado.data)
    }
    setGuardando(false)
    if (guardadas.length > 0) onGuardadas(guardadas)
    if (fallo) {
      // What was saved stays saved; take it out of the selection.
      setElegidos((actual) => new Set([...actual].filter((d) => !guardadas.some((g) => g.desde === d))))
      setError(fallo)
      return
    }
    onCambioAbierta(false)
    reiniciar()
  }

  const formulario = 'fechas-bloqueadas-agregar'
  const etiquetaGuardar = modo === 'domingos' && elegidos.size > 1 ? `Guardar ${elegidos.size} domingos` : 'Guardar'

  return (
    <DetalleResponsivo
      abierto={abierta}
      onCambioAbierto={(a) => {
        onCambioAbierta(a)
        if (!a) reiniciar()
      }}
      titulo="Agregar fecha"
      pie={
        <>
          <BotonSistema
            type="button"
            variante="outline"
            onClick={() => {
              onCambioAbierta(false)
              reiniciar()
            }}
          >
            Cancelar
          </BotonSistema>
          <BotonSistema type="submit" form={formulario} disabled={!listo} cargando={guardando}>
            {etiquetaGuardar}
          </BotonSistema>
        </>
      }
    >
      <form id={formulario} onSubmit={guardar} noValidate className="grid gap-4">
        <ControlSegmentado<Modo>
          etiqueta="Tipo de fecha"
          opciones={[
            { valor: 'domingos', etiqueta: 'Domingos' },
            { valor: 'rango', etiqueta: 'Un rango de fechas' },
          ]}
          valor={modo}
          onCambio={(m) => {
            setModo(m)
            setError(null)
          }}
          className="grid grid-cols-2"
        />

        {modo === 'domingos' ? (
          <div className="grid gap-3">
            <p className="text-[13px] text-muted-foreground">Elige uno o varios domingos.</p>
            {grilla.map(([mes, domingos]) => (
              <div key={mes} className="grid gap-2">
                <p className="text-[13px] font-semibold capitalize">{nombreMes(Number(mes.slice(5, 7)) - 1)}</p>
                <div className="grid grid-cols-4 gap-2">
                  {domingos.map((d) => {
                    const bloqueado = bloqueados.has(d)
                    const programado = programadoEn.get(d)
                    const pulsado = elegidos.has(d)
                    const { dia, mes: mesCorto } = mesYDia(d)
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={pulsado}
                        disabled={bloqueado}
                        aria-label={`${fechaHablada(d)}${programado ? `, ya estás programado como ${rolesTexto(programado.roles)}` : ''}${bloqueado ? ', ya bloqueado' : ''}`}
                        onClick={() => alternar(d)}
                        className={cn(
                          'focus-ring relative grid min-h-14 place-items-center content-center rounded-xl border bg-card leading-none transition-colors touch-manipulation',
                          pulsado ? 'border-brand bg-brand-tint text-brand-text' : 'border-border hover:bg-accent',
                          bloqueado && 'cursor-not-allowed border-dashed text-muted-foreground hover:bg-card',
                        )}
                      >
                        {programado && <span aria-hidden="true" className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-warning" />}
                        <b className="font-mono text-lg font-[650] tabular-nums">{dia}</b>
                        <small className="mt-0.5 text-xs">{bloqueado ? 'Bloqueado' : mesCorto.toLocaleLowerCase('es')}</small>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
                Ya estás programado
              </span>
              <span>Borde punteado: ya bloqueado</span>
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
              <InputSistema type="date" label="Desde" min={hoy} value={desde} onChange={(e) => setDesde(e.target.value)} />
              <InputSistema type="date" label="Hasta" min={desde || hoy} value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
            <p className="text-[13px] text-muted-foreground" aria-live="polite">
              {rangoValido ? (
                <>
                  Incluye <strong className="font-mono font-semibold tabular-nums text-foreground">{dias.length}</strong> {palabra(dias.length, 'domingo', 'domingos')}.
                </>
              ) : desde && hasta ? (
                'La fecha «Hasta» no puede ser antes de «Desde».'
              ) : (
                'Por ejemplo, unas vacaciones. Bloquea todos los domingos del rango.'
              )}
            </p>
          </div>
        )}

        {choques.length > 0 && (
          <AvisoFormulario tono="info">
            Ya estás programado el {choques.map(fechaHablada).join(' y el ')}. Guarda la fecha y luego responde «No puedo» en ese servicio para que
            busquen a otra persona.
          </AvisoFormulario>
        )}

        <div className="grid gap-1">
          <InputSistema
            label="Nota (opcional)"
            value={nota}
            onChange={(e) => {
              setNota(e.target.value)
              if (errorNota) setErrorNota(null)
            }}
            placeholder="Ej.: viaje, exámenes, guardia"
            error={errorNota ?? undefined}
          />
          <p className="flex justify-between gap-3 text-[13px] text-muted-foreground">
            <span>Solo la ve el equipo que planifica.</span>
            <span className="shrink-0 font-mono tabular-nums" aria-hidden="true">
              {nota.trim().length}/{MAX_NOTA_BLOQUEO}
            </span>
          </p>
        </div>

        {error && <AvisoFormulario tono="error">{error}</AvisoFormulario>}
      </form>
    </DetalleResponsivo>
  )
}

export function FechasBloqueadasClient({ fechas: iniciales, programados, hoy }: FechasBloqueadasClientProps): ReactElement {
  const [fechas, setFechas] = useState<FechaBloqueada[]>(() => ordenar(iniciales))
  const [hoja, setHoja] = useState(false)
  const [quitando, setQuitando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vivo, setVivo] = useState('')
  const botonAgregar = useRef<HTMLButtonElement>(null)

  const totalDomingos = useMemo(() => new Set(fechas.flatMap((f) => domingosEntre(f.desde < hoy ? hoy : f.desde, f.hasta))).size, [fechas, hoy])

  async function quitar(fecha: FechaBloqueada) {
    setQuitando(fecha.id)
    setError(null)
    const r = await quitarFechaBloqueadaDps({ id: fecha.id })
    setQuitando(null)
    if (!r.ok) {
      setError(r.message)
      return
    }
    setFechas((lista) => lista.filter((f) => f.id !== fecha.id))
    setVivo(`Quitaste ${nombreRango(fecha)}. Ya pueden programarte.`)
    requestAnimationFrame(() => botonAgregar.current?.focus())
  }

  function guardadas(nuevas: FechaBloqueada[]) {
    setFechas((lista) => ordenar([...lista.filter((f) => !nuevas.some((n) => n.id === f.id)), ...nuevas]))
    const domingos = new Set(nuevas.flatMap((n) => domingosEntre(n.desde, n.hasta))).size
    const conflictos = nuevas.flatMap((n) => n.conflictos).map(textoConflicto)
    setVivo([`Guardado. ${domingos} ${palabra(domingos, 'domingo bloqueado', 'domingos bloqueados')}.`, ...conflictos.map((c) => `${c}.`)].join(' '))
  }

  return (
    <PaginaSistema breadcrumbs={<span aria-current="page">Fechas que no puedo servir</span>} regreso={{ href: '/dashboard', texto: 'Inicio' }} className="relative pb-6">
      <BotonAtrasMovil atras={{ etiqueta: 'Inicio', href: '/dashboard' }} className="-mt-2 -ml-2 max-w-[160px] md:hidden" />
      <section aria-labelledby="fechas-bloqueadas-titulo" className="space-y-1.5">
        <h1 id="fechas-bloqueadas-titulo" className="text-[28px] font-bold leading-[1.1] tracking-[-0.03em] md:text-2xl md:font-[650] md:tracking-[-0.02em]">
          Fechas que no puedo servir
        </h1>
        <p className="text-[15px] text-muted-foreground">Quien planifica verá que no estás disponible esas fechas.</p>
      </section>

      <section aria-labelledby="fechas-bloqueadas-proximas" className="min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 id="fechas-bloqueadas-proximas" className={CLASE_SECCION}>
            Próximas
          </h2>
          {totalDomingos > 0 && (
            <span className="text-[13px] text-muted-foreground">
              <span className="font-mono tabular-nums">{totalDomingos}</span> {palabra(totalDomingos, 'domingo', 'domingos')}
            </span>
          )}
        </div>
        {error && <AvisoFormulario tono="error">{error}</AvisoFormulario>}
        <div className="overflow-hidden rounded-2xl bg-card md:border md:border-border">
          {fechas.length > 0 ? (
            <ul aria-labelledby="fechas-bloqueadas-proximas">
              {fechas.map((f) => (
                <FilaFecha key={f.id} fecha={f} onQuitar={quitar} quitando={quitando === f.id} />
              ))}
            </ul>
          ) : (
            <EstadoVacioSistema icono={CalendarOff} titulo="No tienes fechas bloqueadas" subtitulo="Agrega los domingos que sabes que no vas a estar." className="py-8" />
          )}
          <button
            ref={botonAgregar}
            type="button"
            aria-haspopup="dialog"
            onClick={() => setHoja(true)}
            className="focus-ring flex min-h-14 w-full items-center gap-3 border-t border-border/60 px-3.5 text-left text-[15px] font-medium text-brand-text transition-colors touch-manipulation hover:bg-accent"
          >
            <span aria-hidden="true" className="grid w-10 place-items-center">
              <Plus className="size-5" />
            </span>
            Agregar fecha
          </button>
        </div>
        <ul className="list-disc space-y-1 pt-2 pl-5 text-[13px] text-muted-foreground">
          <li>Quien planifica ve que no estás disponible esas fechas. Puede programarte igual si hace falta; en ese caso te llega el aviso y respondes tú.</li>
          <li>La nota solo la ve el equipo que planifica.</li>
          <li>Las fechas pasadas se quitan solas.</li>
        </ul>
      </section>

      <p className="sr-only" role="status" aria-live="polite">
        {vivo}
      </p>

      <HojaAgregar
        abierta={hoja}
        onCambioAbierta={(a) => {
          setHoja(a)
          if (!a) requestAnimationFrame(() => botonAgregar.current?.focus())
        }}
        hoy={hoy}
        fechas={fechas}
        programados={programados}
        onGuardadas={guardadas}
      />
    </PaginaSistema>
  )
}
