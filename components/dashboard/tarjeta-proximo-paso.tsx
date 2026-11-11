'use client'

/**
 * T8 (odd/tasks/proximo-paso.md, L22/L24; design/proximo-paso 08–09) — the
 * Próximo Paso card inside the home's «Tus próximos pasos», for whoever has
 * not done it (the section's own rule hides it once the milestone is set):
 *
 *   abiertas  — orange border (the one thing that asks for action): the
 *               nearest edición with cupo, cupos, time and place, the 4
 *               Sundays, «Inscribirme» → a dialog (desktop) or a bottom
 *               sheet (phone) that calls inscribirmeEnProximoPaso once; with
 *               several open dates the other is picked there. The card
 *               turns into «inscrito» at once, without leaving the home.
 *   inscrito  — no border: the next class, the days left, time and place,
 *               «Ver mis clases» and the calendar. A pendiente inscripción
 *               never reads as confirmed.
 *   sin-fecha — soft card, no primary action.
 *
 * The server action is imported on the tap: the home's server tree (and its
 * jsdom tests) never loads app/proximo-paso/actions.ts just to render.
 */
import { useRef, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarPlus } from 'lucide-react'

import { DetallesPracticos, DiaCalendario, Num } from '@/components/proximo-paso/partes'
import { selloCalendario } from '@/components/proximo-paso/pantallas'
import { OpcionesFecha, textoCuposLargo } from '@/components/proximo-paso/vistas'
import { useEsEscritorio } from '@/components/ui/detalle-responsivo'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { HojaInferior } from '@/components/ui/hoja-inferior'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import type { InscripcionProximoPaso, VarianteProximoPaso } from '@/lib/platform/proximo-paso/estado'
import { diasHasta, domingo, domingosDe, enlaceIcs, eventosCalendario } from '@/lib/platform/proximo-paso/formato'
import { RUTA_MIS_CLASES, RUTA_PROXIMO_PASO, type EdicionProximoPaso } from '@/lib/platform/talleres/proximo-paso-registro'
import { cn } from '@/lib/utils'

export interface TarjetaProximoPasoProps {
  readonly estado: VarianteProximoPaso
  /** YYYY-MM-DD in Caracas. */
  readonly hoy: string
  /** First name for «Te inscribes como …». */
  readonly nombre: string | null
}

const CLASE_TARJETA = 'mb-2.5 rounded-2xl p-4'

function Domingos({ edicion, etiqueta, hoy, marcarProxima }: { readonly edicion: EdicionProximoPaso; readonly etiqueta: string; readonly hoy: string; readonly marcarProxima: boolean }) {
  if (edicion.clases.length === 0) return null
  const proxima = edicion.clases.find((c) => c.fecha >= hoy)
  return (
    <ol aria-label={etiqueta} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {edicion.clases.map((c) => {
        const esProxima = marcarProxima && c === proxima
        return (
          <li key={c.numero} className={cn('flex min-w-0 items-center gap-2.5 rounded-xl bg-card p-2', esProxima && 'ring-[1.5px] ring-brand ring-inset')}>
            <DiaCalendario fecha={c.fecha} className="h-11 w-10" />
            <span className="min-w-0">
              <small className="block text-xs text-muted-foreground">{esProxima ? 'Próxima' : `Clase ${c.numero}`}</small>
              <b className="block truncate text-sm font-semibold">{c.tema ?? `Clase ${c.numero}`}</b>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Encabezado({ id, titulo, estado, derecha }: { readonly id: string; readonly titulo: string; readonly estado: ReactElement; readonly derecha?: ReactElement | null }) {
  return (
    <>
      <div className="flex min-h-6 items-center justify-between gap-2">
        {estado}
        {derecha}
      </div>
      <h3 id={id} className="mt-2 text-[19px] font-semibold tracking-[-0.01em] text-foreground">
        {titulo}
      </h3>
    </>
  )
}

const QUE_ES = (
  <BotonSistema asChild variante="ghost">
    <Link href={RUTA_PROXIMO_PASO}>Qué es Próximo Paso</Link>
  </BotonSistema>
)

function TarjetaInscrito({ inscripcion, hoy }: { readonly inscripcion: InscripcionProximoPaso; readonly hoy: string }): ReactElement {
  const { edicion, estado } = inscripcion
  const proxima = edicion.clases.find((c) => c.fecha >= hoy)
  const empezo = edicion.fechaInicio < hoy
  const faltan = empezo ? null : diasHasta(hoy, edicion.fechaInicio)
  const texto =
    estado === 'pendiente'
      ? `Recibimos tu inscripción. La coordinación la confirmará. La primera clase es el ${domingo(edicion.fechaInicio)}.`
      : proxima
        ? `Estás inscrito. Tu ${empezo ? 'próxima' : 'primera'} clase es el ${domingo(proxima.fecha)}${proxima.tema ? `: ${proxima.tema}` : ''}.`
        : `Estás inscrito. ${empezo ? 'Tus clases ya empezaron' : `La primera clase es el ${domingo(edicion.fechaInicio)}`}.`
  return (
    <article aria-labelledby="inicio-proximo-paso-tarjeta" tabIndex={-1} className={cn(CLASE_TARJETA, 'bg-card ring-1 ring-border/60 ring-inset')}>
      <Encabezado
        id="inicio-proximo-paso-tarjeta"
        titulo={`Próximo Paso · ${edicion.nombre}`}
        estado={
          estado === 'inscrito' ? <PuntoEstado tono="success" etiqueta="Inscripción confirmada" /> : <PuntoEstado tono="warning" etiqueta="Pendiente de confirmar" />
        }
        derecha={
          faltan !== null && faltan > 0 ? (
            <span className="text-[13px] text-muted-foreground">
              Faltan <Num>{faltan}</Num> {faltan === 1 ? 'día' : 'días'}
            </span>
          ) : null
        }
      />
      <p className="mt-0.5 text-sm text-muted-foreground">{texto}</p>
      <DetallesPracticos edicion={edicion} className="mt-2" />
      <Domingos edicion={edicion} etiqueta={`Tus ${edicion.clases.length} domingos`} hoy={hoy} marcarProxima />
      <div className="mt-3 flex flex-wrap gap-2">
        <BotonSistema asChild variante="outline">
          <Link href={RUTA_MIS_CLASES}>Ver mis clases</Link>
        </BotonSistema>
        {edicion.clases.length > 0 && (
          <BotonSistema asChild variante="ghost" icono={CalendarPlus}>
            <a href={enlaceIcs(eventosCalendario(edicion), selloCalendario(edicion))} download={`proximo-paso-${edicion.id}.ics`}>
              Agregar al calendario
            </a>
          </BotonSistema>
        )}
      </div>
    </article>
  )
}

function ContenidoInscripcion({
  disponibles,
  elegida,
  nombre,
  error,
  onElegir,
}: {
  readonly disponibles: readonly EdicionProximoPaso[]
  readonly elegida: EdicionProximoPaso
  readonly nombre: string | null
  readonly error: string | null
  readonly onElegir: (id: string) => void
}) {
  const cupos = textoCuposLargo(elegida.cupoRestante)
  return (
    <div className="grid gap-3">
      {disponibles.length > 1 ? (
        <>
          <p id="inicio-proximo-paso-fechas" className="text-sm font-medium text-foreground">
            Elige la fecha
          </p>
          <OpcionesFecha ediciones={disponibles} elegida={elegida.id} onElegir={onElegir} etiquetadoPor="inicio-proximo-paso-fechas" disponible={() => true} />
        </>
      ) : (
        <div className="grid gap-0.5 rounded-xl bg-muted/60 p-3">
          <b className="text-base font-semibold">{elegida.nombre}</b>
          <span className="text-sm text-muted-foreground">{domingosDe(elegida.clases) ?? `Empieza el ${domingo(elegida.fechaInicio)}`}</span>
          {cupos && <span className="text-sm text-muted-foreground">{cupos}</span>}
        </div>
      )}
      <DetallesPracticos edicion={elegida} />
      <p className="text-sm text-muted-foreground">{nombre ? `Te inscribes como ${nombre}, con tu cuenta.` : 'Te inscribes con tu cuenta.'}</p>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger-text">
          {error}
        </p>
      )}
    </div>
  )
}

export function TarjetaProximoPaso({ estado, hoy, nombre }: TarjetaProximoPasoProps): ReactElement {
  const router = useRouter()
  const escritorio = useEsEscritorio() ?? true
  const [inscripcion, setInscripcion] = useState<InscripcionProximoPaso | null>(estado.variante === 'inscrito' ? estado.inscripcion : null)
  const [abierto, setAbierto] = useState(false)
  const [edicionId, setEdicionId] = useState<string | null>(estado.variante === 'abiertas' ? estado.edicion.id : null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [anuncio, setAnuncio] = useState('')
  // Synchronous guard: two taps in the same tick send once.
  const enCurso = useRef(false)

  const live = (
    <p role="status" aria-live="polite" className="sr-only">
      {anuncio}
    </p>
  )

  if (inscripcion) {
    return (
      <>
        <TarjetaInscrito inscripcion={inscripcion} hoy={hoy} />
        {live}
      </>
    )
  }

  if (estado.variante !== 'abiertas') {
    return (
      <article aria-labelledby="inicio-proximo-paso-tarjeta" className={cn(CLASE_TARJETA, 'bg-card ring-1 ring-border/60 ring-inset')}>
        <Encabezado id="inicio-proximo-paso-tarjeta" titulo="Próximo Paso" estado={<PuntoEstado tono="muted" etiqueta="Sin fecha abierta" />} />
        <p className="mt-0.5 text-sm text-muted-foreground">Empieza el primer domingo de cada mes. Cuando abramos la próxima fecha, la verás aquí para inscribirte.</p>
        <div className="mt-2 -ml-3">{QUE_ES}</div>
      </article>
    )
  }

  const { edicion, disponibles } = estado
  const elegida = disponibles.find((e) => e.id === edicionId) ?? edicion
  const cupos = textoCuposLargo(edicion.cupoRestante)

  async function confirmar() {
    if (enCurso.current) return
    enCurso.current = true
    setEnviando(true)
    setError(null)
    try {
      const { inscribirmeEnProximoPaso } = await import('@/app/proximo-paso/actions')
      const r = await inscribirmeEnProximoPaso(elegida.id)
      if (r.ok) {
        const completa = disponibles.find((e) => e.id === r.edicion.id) ?? elegida
        setAbierto(false)
        setInscripcion({ estado: r.estado, edicion: completa })
        setAnuncio(r.estado === 'inscrito' ? `Listo. Estás en Próximo Paso, ${completa.nombre}.` : `Recibimos tu inscripción en Próximo Paso, ${completa.nombre}.`)
        router.refresh()
      } else setError(r.message)
    } catch {
      setError('No se pudo completar la inscripción. Inténtalo de nuevo.')
    } finally {
      enCurso.current = false
      setEnviando(false)
    }
  }

  const cambiarAbierto = (v: boolean) => {
    if (enviando) return
    setAbierto(v)
    if (!v) setError(null)
  }
  const contenido = <ContenidoInscripcion disponibles={disponibles} elegida={elegida} nombre={nombre} error={error} onElegir={setEdicionId} />
  const botonConfirmar = (
    <BotonSistema type="button" cargando={enviando} onClick={() => void confirmar()} className="w-full sm:w-auto">
      Confirmar inscripción
    </BotonSistema>
  )

  return (
    <>
      <article aria-labelledby="inicio-proximo-paso-tarjeta" className={cn(CLASE_TARJETA, 'bg-brand-tint ring-[1.5px] ring-brand ring-inset')}>
        <Encabezado
          id="inicio-proximo-paso-tarjeta"
          titulo={`Próximo Paso · ${edicion.nombre}`}
          estado={<PuntoEstado tono="success" etiqueta="Inscripciones abiertas" />}
          derecha={cupos ? <span className="text-[13px] text-muted-foreground">{cupos}</span> : null}
        />
        <p className="mt-0.5 text-sm text-muted-foreground">
          {`Cuatro domingos para conocer Global. Empieza el ${domingo(edicion.fechaInicio)} y es el primer paso para servir.`}
        </p>
        <DetallesPracticos edicion={edicion} className="mt-2" />
        <Domingos edicion={edicion} etiqueta={`Las ${edicion.clases.length} clases`} hoy={hoy} marcarProxima={false} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <BotonSistema type="button" onClick={() => setAbierto(true)} className="w-full sm:w-auto">
            Inscribirme
          </BotonSistema>
          {QUE_ES}
        </div>
      </article>
      {live}
      {escritorio ? (
        <Dialog open={abierto} onOpenChange={cambiarAbierto}>
          <DialogContent className="rounded-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Inscribirte en Próximo Paso</DialogTitle>
              <DialogDescription>Cuatro domingos seguidos, una clase por domingo.</DialogDescription>
            </DialogHeader>
            {contenido}
            <DialogFooter>
              <BotonSistema type="button" variante="outline" disabled={enviando} onClick={() => cambiarAbierto(false)}>
                Cancelar
              </BotonSistema>
              {botonConfirmar}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <HojaInferior
          abierta={abierto}
          onCambioAbierta={cambiarAbierto}
          titulo="Inscribirte en Próximo Paso"
          pie={
            <>
              <BotonSistema type="button" variante="ghost" disabled={enviando} onClick={() => cambiarAbierto(false)}>
                Cancelar
              </BotonSistema>
              {botonConfirmar}
            </>
          }
        >
          {contenido}
        </HojaInferior>
      )}
    </>
  )
}
