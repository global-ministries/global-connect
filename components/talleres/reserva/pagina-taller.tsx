'use client'

/**
 * Public page of one taller (design/talleres-reserva/02, 06): hero with the
 * key facts, "Elige tu horario" (native radios), facilitators, FAQ and the
 * reserve card, sticky at the side from lg and a sticky bottom bar on
 * phones. "Reservar mi lugar" opens the flow on the chosen horario; a full
 * horario opens it on "avísame" (S13).
 */
import { useState } from 'react'
import { CalendarDays, ChevronRight, Clock, Link2, MapPin, Users } from 'lucide-react'

import { useNotificaciones } from '@/hooks/use-notificaciones'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { audiencia, edicionesConLugar, estadoCupo, fechaCorta, tituloEdicion, type TallerPublico } from '@/lib/platform/talleres/reserva-publica'

import { FlujoReserva } from './flujo-reserva'
import { ListaPasos } from './piezas'
import { IconoTaller } from './tarjeta-taller'
import { OpcionesEdicion } from './vistas'

function duracion(minutos: number | null): string | null {
  if (!minutos) return null
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ')
}

const PREGUNTAS = [
  {
    p: '¿Qué pasa después de reservar?',
    r: 'Tu solicitud queda pendiente. La coordinación la revisa y te avisa por correo y en la app. Al aprobarla te asignamos un grupo y quien lo facilita.',
  },
  {
    p: '¿Necesito ser parte de Global?',
    r: 'No. Si es tu primera vez, creas tu ficha al reservar y recibes un enlace para activar tu cuenta Global.',
  },
  {
    p: 'Ya estoy en Global, ¿vuelvo a llenar mis datos?',
    r: 'No. Escribes tu cédula y te enviamos un código a tu correo y a tus avisos de la app. Con ese código usamos los datos de tu ficha.',
  },
  {
    p: '¿Y si falto a una clase?',
    r: 'Avísale a quien facilita tu grupo. Tu asistencia queda registrada en la app y cuenta para el certificado.',
  },
]

export function PaginaTaller({ taller }: { taller: TallerPublico }) {
  const [edicionId, setEdicionId] = useState(() => (edicionesConLugar(taller)[0] ?? taller.ediciones[0])?.id ?? '')
  const [abierto, setAbierto] = useState(false)
  const notificar = useNotificaciones()
  const edicion = taller.ediciones.find((e) => e.id === edicionId) ?? null
  const cupo = edicion ? estadoCupo(edicion) : null
  const para = audiencia(taller)
  const facilitadores = Array.from(new Set(taller.ediciones.flatMap((e) => e.facilitadores)))
  const persona = taller.generoRequerido === 'Femenino' ? 'Facilitadoras' : 'Facilitadores'

  async function copiarEnlace() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      notificar.success('Enlace copiado')
    } catch {
      notificar.error('No pudimos copiar el enlace')
    }
  }

  const hechos = [
    edicion?.clases ? { icono: CalendarDays, etiqueta: 'Duración', valor: `${edicion.clases} clases` } : null,
    duracion(taller.duracionMinutos) ? { icono: Clock, etiqueta: 'Cada clase', valor: duracion(taller.duracionMinutos) as string } : null,
    edicion?.lugar ? { icono: MapPin, etiqueta: 'Lugar', valor: edicion.lugar } : null,
    { icono: Users, etiqueta: 'Para', valor: `${para ? para.replace('Para ', '').replace(/^./, (c) => c.toUpperCase()) : 'Adultos'} desde 18 años` },
  ].filter((h): h is { icono: typeof CalendarDays; etiqueta: string; valor: string } => h !== null)

  const accionReservar = edicion?.lleno ? 'Avísame si se abre un lugar' : 'Reservar mi lugar'

  return (
    <>
      <main id="contenido" className="grid min-w-0 items-start gap-8 px-4 pt-4 pb-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12 lg:px-12 lg:pt-8">
        <div className="grid min-w-0 gap-8">
          <section aria-labelledby="taller-titulo" className="grid gap-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-brand-text">
              <IconoTaller taller={taller} className="size-4" />
              Grupo de Corto Plazo{para ? ` · ${para.toLowerCase()}` : ''}
            </p>
            <h1 id="taller-titulo" className="text-[28px] font-bold leading-[1.1] tracking-[-0.03em] text-foreground md:text-2xl md:font-semibold md:tracking-tight">
              {taller.nombre}
            </h1>
            {taller.descripcion && <p className="max-w-[68ch] text-[15px] text-muted-foreground">{taller.descripcion}</p>}
            <dl className="mt-2 grid grid-cols-2 gap-3 2xl:grid-cols-4">
              {hechos.map((h) => (
                <div key={h.etiqueta} className="flex min-w-0 items-center gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-3">
                  <h.icono aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{h.etiqueta}</dt>
                    <dd className="text-[15px] font-semibold break-words text-foreground">{h.valor}</dd>
                  </span>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="taller-horarios" className="grid gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 id="taller-horarios" className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Elige tu horario
              </h2>
              <span className="text-[13px] text-muted-foreground">El grupo se asigna al aprobar tu inscripción</span>
            </div>
            {taller.ediciones.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-5 text-[15px] text-muted-foreground">
                No hay horarios abiertos ahora. Vuelve pronto: las nuevas ediciones aparecen aquí.
              </p>
            ) : (
              <div className="[&_fieldset]:sm:grid-cols-2 [&_fieldset]:2xl:grid-cols-3">
                <OpcionesEdicion ediciones={taller.ediciones} valor={edicionId} onCambio={setEdicionId} nombre={`Horarios de ${taller.nombre}`} />
              </div>
            )}
          </section>

          <div className="grid gap-8 xl:grid-cols-2">
            <section aria-labelledby="taller-como" className="grid content-start gap-3">
              <h2 id="taller-como" className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Cómo funciona
              </h2>
              <ListaPasos
                pasos={[
                  { titulo: 'Reservas tu lugar', detalle: 'Eliges el horario y nos dejas tus datos en dos minutos.' },
                  { titulo: 'La coordinación te aprueba', detalle: 'Revisamos cada solicitud y te avisamos por correo y en la app.' },
                  { titulo: 'Te asignamos grupo', detalle: 'Conoces a quien facilita tu grupo antes de la primera clase.' },
                ]}
              />
              {facilitadores.length > 0 && (
                <div className="mt-3 grid gap-3">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{persona}</h2>
                  <ul className="flex flex-wrap gap-2">
                    {facilitadores.map((nombre) => (
                      <li key={nombre} className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-card py-1 pr-4 pl-1">
                        <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-brand-tint text-[13px] font-semibold text-brand-text">
                          {nombre.charAt(0)}
                        </span>
                        <span className="text-[15px] font-medium text-foreground">{nombre}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
            <section aria-labelledby="taller-preguntas" className="grid content-start gap-3">
              <h2 id="taller-preguntas" className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Preguntas frecuentes
              </h2>
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                {PREGUNTAS.map((q) => (
                  <details key={q.p} className="group border-border/60 [&+&]:border-t">
                    <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 text-[15px] font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                      <span className="flex-1">{q.p}</span>
                      <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" />
                    </summary>
                    <p className="max-w-[72ch] px-4 pb-4 text-[14px] text-muted-foreground">{q.r}</p>
                  </details>
                ))}
              </div>
            </section>
          </div>
        </div>

        {edicion && (
          <aside aria-labelledby="taller-reservar" className="hidden gap-4 rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-24 lg:grid">
            <h2 id="taller-reservar" className="text-lg font-semibold text-foreground">
              Reservar mi lugar
            </h2>
            <div aria-live="polite" className="grid gap-1.5 rounded-xl bg-muted p-3.5">
              <span className="text-base font-semibold text-foreground">{tituloEdicion(edicion)}</span>
              <span className="text-[13px] text-muted-foreground">
                Inicia {fechaCorta(edicion.fechaInicio)}
                {edicion.lugar ? ` · ${edicion.lugar}` : ''}
              </span>
              {cupo && <PuntoEstado tono={cupo.tono} etiqueta={cupo.etiqueta} />}
            </div>
            <BotonSistema type="button" tamaño="lg" className="w-full" onClick={() => setAbierto(true)}>
              {accionReservar}
            </BotonSistema>
            <p className="text-[13px] text-muted-foreground">
              Tu solicitud queda <b className="font-semibold text-foreground">pendiente de aprobación</b>. La coordinación te avisa por correo y en la app.
            </p>
            <div className="h-px bg-border" role="presentation" />
            <BotonSistema type="button" variante="ghost" icono={Link2} className="justify-self-start" onClick={copiarEnlace}>
              Copiar enlace del taller
            </BotonSistema>
          </aside>
        )}
      </main>

      {/* Phone and tablet: the one primary action stays in reach. */}
      {edicion && (
        <div className="fixed inset-x-0 bottom-0 z-20 grid gap-1 border-t border-border bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 lg:hidden">
          <span className="truncate text-[13px] text-muted-foreground">
            {tituloEdicion(edicion)} · {cupo?.etiqueta}
          </span>
          <BotonSistema type="button" tamaño="lg" className="w-full" onClick={() => setAbierto(true)}>
            {accionReservar}
          </BotonSistema>
        </div>
      )}

      {edicion && <FlujoReserva taller={taller} edicionId={edicionId} abierto={abierto} onAbiertoChange={setAbierto} />}
    </>
  )
}
