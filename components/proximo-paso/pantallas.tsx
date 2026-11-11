/**
 * T8 (odd/tasks/proximo-paso.md; design/proximo-paso 05, 07) — the screens
 * after a step: «¡Listo!» with the 4 Sundays and the calendar (05), and the
 * states (07): sin fechas, cupo lleno, inscripciones cerradas and ya
 * inscrito. The code states (código incorrecto, demasiados intentos) live in
 * paso-codigo.tsx. Every state says what happened and offers the next step.
 */
import type { ReactElement } from 'react'
import Link from 'next/link'
import { CalendarClock, CalendarPlus, CalendarX, CheckCircle2, Info, Lock, Users } from 'lucide-react'

import { PuntoEstado } from '@/components/ui/punto-estado'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { domingo, domingosDe, enlaceGoogleCalendar, enlaceIcs, eventosCalendario, diaDelMes } from '@/lib/platform/proximo-paso/formato'
import type { InscripcionProximoPaso } from '@/lib/platform/proximo-paso/estado'
import { fechaDomingo, RUTA_MIS_CLASES, type EdicionProximoPaso, type EstadoInscripcionProximoPaso } from '@/lib/platform/talleres/proximo-paso-registro'

import { BarraInferior, Cabecera, DetallesPracticos, DiaCalendario, LineaDomingos, Num, Sello, TituloSeccion } from './partes'
import { empieza, textoCuposLargo } from './vistas'

/** The 4 clases of S2, for the page without any open edición. */
export const CLASES_PROXIMO_PASO = [
  { numero: 1, tema: 'Sígueme', fecha: '' },
  { numero: 2, tema: 'Intimidad con Dios', fecha: '' },
  { numero: 3, tema: 'Compañerismo', fecha: '' },
  { numero: 4, tema: 'Influencia', fecha: '' },
] as const

export const RUTA_INICIO = '/dashboard'

/** The DTSTAMP of the .ics: fixed per edición so the server and the browser render the same link. */
export const selloCalendario = (e: Pick<EdicionProximoPaso, 'fechaInicio'>) => new Date(`${e.fechaInicio}T00:00:00Z`)

const archivo = (e: EdicionProximoPaso, sufijo: string) =>
  `proximo-paso-${e.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}${sufijo}.ics`

function AvisoInfo({ children }: { readonly children: React.ReactNode }): ReactElement {
  return (
    <p className="flex gap-2.5 rounded-xl border border-info/30 bg-info/5 p-3.5 text-sm text-foreground">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info-text" />
      <span>{children}</span>
    </p>
  )
}

/** «Tus 4 domingos» with an .ics per clase, one for all of them and Google Calendar (05). */
export function DomingosConCalendario({ edicion }: { readonly edicion: EdicionProximoPaso }): ReactElement | null {
  if (edicion.clases.length === 0) return null
  const eventos = eventosCalendario(edicion)
  const sello = selloCalendario(edicion)
  return (
    <section aria-labelledby="proximo-paso-tus-domingos">
      <TituloSeccion id="proximo-paso-tus-domingos">Tus {edicion.clases.length} domingos</TituloSeccion>
      <div className="rounded-2xl bg-card px-3.5">
        <ul>
          {edicion.clases.map((c, i) => {
            const nombre = c.tema ?? `Clase ${c.numero}`
            return (
              <li key={c.numero} className="flex min-h-16 min-w-0 items-center gap-3 border-b border-border/60 py-2.5">
                <DiaCalendario fecha={c.fecha} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold text-foreground">{nombre}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    Clase <Num>{c.numero}</Num> · {domingo(c.fecha)}
                  </span>
                </span>
                <a
                  href={enlaceIcs([eventos[i]], sello)}
                  download={archivo(edicion, `-clase-${c.numero}`)}
                  aria-label={`Agregar ${nombre}, ${domingo(c.fecha)}, a tu calendario`}
                  className="focus-ring grid size-11 shrink-0 place-items-center rounded-xl text-brand-text hover:bg-accent"
                >
                  <CalendarPlus aria-hidden="true" className="size-5" />
                </a>
              </li>
            )
          })}
        </ul>
        <a
          href={enlaceIcs(eventos, sello)}
          download={archivo(edicion, '')}
          className="focus-ring flex min-h-12 items-center justify-center gap-2 rounded-xl font-medium text-brand-text hover:bg-accent"
        >
          <CalendarPlus aria-hidden="true" className="size-5" />
          Agregar los {edicion.clases.length} a mi calendario
        </a>
        <p className="pb-2.5 text-center text-[13px] text-muted-foreground">
          ¿Usas Google? Abre la primera clase en{' '}
          <a href={enlaceGoogleCalendar(eventos[0])} target="_blank" rel="noreferrer" className="font-medium text-brand-text underline-offset-4 hover:underline">
            Google Calendar
          </a>
        </p>
      </div>
    </section>
  )
}

function textoRango(e: EdicionProximoPaso): string | null {
  const n = e.clases.length
  if (n < 2) return null
  const primero = e.clases[0].fecha
  const ultimo = e.clases[n - 1].fecha
  const mismoMes = primero.slice(0, 7) === ultimo.slice(0, 7)
  return mismoMes
    ? `${n} domingos seguidos, del ${diaDelMes(primero)} al ${fechaDomingo(ultimo)}.`
    : `${n} domingos seguidos, del ${fechaDomingo(primero)} al ${fechaDomingo(ultimo)}.`
}

const ESTADO_INSCRIPCION: Record<EstadoInscripcionProximoPaso, { tono: 'success' | 'warning'; etiqueta: string }> = {
  inscrito: { tono: 'success', etiqueta: 'Inscripción confirmada' },
  pendiente: { tono: 'warning', etiqueta: 'Pendiente de confirmar' },
}

/** 05 · «¡Listo!» (inscrito) or «Recibimos tu inscripción» (pendiente). */
export function PantallaListo({ estado, edicion, nombre }: { readonly estado: EstadoInscripcionProximoPaso; readonly edicion: EdicionProximoPaso; readonly nombre: string | null }): ReactElement {
  const inscrito = estado === 'inscrito'
  const primera = edicion.clases[0]
  return (
    <section aria-live="polite" className="flex min-w-0 flex-1 flex-col gap-5">
      <div className="px-1">
        <Sello icono={inscrito ? CheckCircle2 : CalendarClock} tono={inscrito ? 'success' : 'warning'} />
      </div>
      {inscrito ? (
        <Cabecera titulo={nombre ? `¡Listo, ${nombre}!` : '¡Listo!'}>
          Tu lugar en Próximo Paso está apartado. Te esperamos el {domingo(edicion.fechaInicio)}.
        </Cabecera>
      ) : (
        <Cabecera titulo="Recibimos tu inscripción">{`La coordinación la confirmará. La primera clase es el ${domingo(edicion.fechaInicio)}.`}</Cabecera>
      )}

      <div className="grid gap-1.5 rounded-2xl bg-card p-4">
        <PuntoEstado tono={ESTADO_INSCRIPCION[estado].tono} etiqueta={ESTADO_INSCRIPCION[estado].etiqueta} />
        <b className="text-[17px] font-semibold text-foreground">Próximo Paso · {edicion.nombre}</b>
        {textoRango(edicion) && <p className="text-sm text-muted-foreground">{textoRango(edicion)}</p>}
        <DetallesPracticos edicion={edicion} className="mt-1" />
      </div>

      <DomingosConCalendario edicion={edicion} />

      <section aria-labelledby="proximo-paso-que-sigue">
        <TituloSeccion id="proximo-paso-que-sigue">Qué sigue</TituloSeccion>
        <ol className="rounded-2xl bg-card px-3.5">
          <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 py-3">
            <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-brand-tint font-mono text-sm font-semibold text-brand-text">1</span>
            <span>
              <b className="block text-[15px] font-semibold">Ve el {domingo(edicion.fechaInicio)}</b>
              <span className="block text-[13px] text-muted-foreground">{primera?.tema ? `Es la primera clase, ${primera.tema}.` : 'Es la primera clase.'}</span>
            </span>
          </li>
          <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 border-t border-border/60 py-3">
            <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-brand-tint font-mono text-sm font-semibold text-brand-text">2</span>
            <span>
              <b className="block text-[15px] font-semibold">Sigue tus clases en la app</b>
              <span className="block text-[13px] text-muted-foreground">Entra con tu correo y tu contraseña. Ahí verás cada clase.</span>
            </span>
          </li>
        </ol>
      </section>

      <BarraInferior>
        {inscrito && (
          <BotonSistema asChild tamaño="lg" className="w-full">
            <Link href={RUTA_MIS_CLASES}>Ver mis clases</Link>
          </BotonSistema>
        )}
        <BotonSistema asChild variante="ghost" className="w-full">
          <Link href={RUTA_INICIO}>Ir al inicio</Link>
        </BotonSistema>
      </BarraInferior>
    </section>
  )
}

/** 07 · 6: already enrolled (signed in). `estado` null = the server said YA_INSCRITO without more. */
export function YaInscrito({ inscripcion }: { readonly inscripcion: { readonly estado: InscripcionProximoPaso['estado'] | null; readonly edicion: EdicionProximoPaso } }): ReactElement {
  const { estado, edicion } = inscripcion
  const primera = edicion.clases[0]
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5">
      <div className="px-1">
        <Sello icono={CheckCircle2} tono="success" />
      </div>
      <Cabecera titulo="Ya tienes tu lugar">
        Estás en <strong className="text-foreground">Próximo Paso · {edicion.nombre}</strong>. Tu primera clase es el{' '}
        <strong className="text-foreground">{domingo(edicion.fechaInicio)}</strong>.
      </Cabecera>
      {estado && (
        <span className="px-1">
          <PuntoEstado tono={ESTADO_INSCRIPCION[estado].tono} etiqueta={ESTADO_INSCRIPCION[estado].etiqueta} />
        </span>
      )}
      <div className="grid gap-3 rounded-2xl bg-card p-3.5">
        {primera && (
          <div className="flex min-w-0 items-center gap-3">
            <DiaCalendario fecha={primera.fecha} />
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold">{primera.tema ?? `Clase ${primera.numero}`}</span>
              <span className="block text-[13px] text-muted-foreground">Próxima clase</span>
            </span>
          </div>
        )}
        <DetallesPracticos edicion={edicion} />
      </div>
      <BarraInferior>
        <BotonSistema asChild tamaño="lg" className="w-full">
          <Link href={RUTA_MIS_CLASES}>Ver mis clases</Link>
        </BotonSistema>
      </BarraInferior>
    </div>
  )
}

/** 07 · 1: no open edición (or every one is full). Still explains Próximo Paso. */
export function SinFechas({ llenas }: { readonly llenas: boolean }): ReactElement {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5">
      <div className="px-1">
        <Sello icono={CalendarX} tono="muted" />
      </div>
      <Cabecera titulo="Pronto abrimos la próxima fecha" id="proximo-paso-titulo">
        {llenas
          ? 'Próximo Paso empieza el primer domingo de cada mes. Las fechas abiertas ya no tienen cupos.'
          : 'Próximo Paso empieza el primer domingo de cada mes. Ahora mismo no hay inscripciones abiertas.'}
      </Cabecera>
      <AvisoInfo>Pregunta en la mesa de bienvenida el domingo. Si ya tienes cuenta, te avisamos en tu inicio cuando abramos.</AvisoInfo>
      <section aria-labelledby="proximo-paso-clases">
        <TituloSeccion id="proximo-paso-clases">Las 4 clases</TituloSeccion>
        <LineaDomingos clases={CLASES_PROXIMO_PASO} sinFechas />
      </section>
    </div>
  )
}

/** The other edición offered by «cupo lleno» and «cerradas». */
function OtraFecha({ edicion }: { readonly edicion: EdicionProximoPaso }): ReactElement {
  const cupos = textoCuposLargo(edicion.cupoRestante)
  return (
    <div className="grid gap-1 rounded-2xl border-[1.5px] border-brand bg-brand-tint px-4 py-3.5">
      <b className="text-[19px] font-[650] tracking-[-0.01em]">{edicion.nombre}</b>
      <span className="text-sm">{domingosDe(edicion.clases) ?? empieza(edicion)}</span>
      <DetallesPracticos edicion={edicion} />
      {cupos && <PuntoEstado tono="success" etiqueta={cupos} />}
    </div>
  )
}

/** 07 · 2: the last place went while the form was being filled; the data stays. */
export function CupoLleno({
  llena,
  siguiente,
  enviando,
  onInscribir,
  onAhoraNo,
}: {
  readonly llena: Pick<EdicionProximoPaso, 'nombre'>
  readonly siguiente: EdicionProximoPaso | null
  readonly enviando: boolean
  readonly onInscribir: (e: EdicionProximoPaso) => void
  readonly onAhoraNo: () => void
}): ReactElement {
  const mes = llena.nombre.replace(/\s+\d{4}$/, '')
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5">
      <div className="px-1">
        <Sello icono={Users} tono="warning" />
      </div>
      <Cabecera titulo={`${mes} se llenó`} id="proximo-paso-titulo">
        Justo ahora se ocupó el último cupo de <strong className="text-foreground">{llena.nombre}</strong>. Tus datos siguen aquí, no tienes que
        escribirlos otra vez.
      </Cabecera>
      {siguiente ? (
        <section aria-labelledby="proximo-paso-siguiente">
          <TituloSeccion id="proximo-paso-siguiente">Siguiente fecha con cupo</TituloSeccion>
          <OtraFecha edicion={siguiente} />
        </section>
      ) : (
        <AvisoInfo>No quedan otras fechas con cupo. Pregunta en la mesa de bienvenida el domingo.</AvisoInfo>
      )}
      <BarraInferior>
        {siguiente && (
          <BotonSistema type="button" tamaño="lg" className="w-full" cargando={enviando} onClick={() => onInscribir(siguiente)}>
            {`Inscribirme en ${siguiente.nombre}`}
          </BotonSistema>
        )}
        <BotonSistema type="button" variante="ghost" className="w-full" disabled={enviando} onClick={onAhoraNo}>
          Ahora no
        </BotonSistema>
      </BarraInferior>
    </div>
  )
}

/** 07 · 3: a link (or a choice) to a date whose inscription already closed. */
export function FechaCerrada({ siguiente, onInscribir }: { readonly siguiente: EdicionProximoPaso | null; readonly onInscribir: (e: EdicionProximoPaso) => void }): ReactElement {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5">
      <div className="px-1">
        <Sello icono={Lock} tono="muted" />
      </div>
      <Cabecera titulo="Las inscripciones de esa fecha cerraron" id="proximo-paso-titulo">
        {siguiente ? `La próxima fecha empieza el ${domingo(siguiente.fechaInicio)}.` : 'Por ahora no hay otra fecha abierta.'}
      </Cabecera>
      {siguiente && <OtraFecha edicion={siguiente} />}
      {siguiente && (
        <BarraInferior>
          <BotonSistema type="button" tamaño="lg" className="w-full" onClick={() => onInscribir(siguiente)}>
            {`Inscribirme en ${siguiente.nombre}`}
          </BotonSistema>
        </BarraInferior>
      )}
    </div>
  )
}
