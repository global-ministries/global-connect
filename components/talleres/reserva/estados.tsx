'use client'

/**
 * The ends of the reservation flow (design/talleres-reserva/05): request
 * received (always pending approval, S5), full edición with "avísame" (S13),
 * closed, already enrolled and a taller for the other género.
 */
import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Bell, CheckCircle2, CircleSlash, Clock, MailCheck } from 'lucide-react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { BotonSistema, InputSistema } from '@/components/ui/sistema-diseno'
import { MENSAJES, edicionesConLugar, estadoCupo, fechaCorta, horaLegible, tituloEdicion } from '@/lib/platform/talleres/reserva-publica'
import { cn } from '@/lib/utils'

import type { FlujoReserva } from './use-flujo-reserva'

export const RUTA_CATALOGO = '/talleres/reservar'
/** "Mis talleres" of the member app; the login keeps it as the redirect. */
export const RUTA_MIS_TALLERES = '/talleres/mi-recorrido'

function Cabecera({ icono, tono, titulo, children }: { icono: React.ReactNode; tono: 'success' | 'warning' | 'danger' | 'muted'; titulo: string; children: React.ReactNode }) {
  const fondo = { success: 'bg-success/15 text-success-text', warning: 'bg-warning/15 text-warning-text', danger: 'bg-danger/10 text-danger-text', muted: 'bg-muted text-muted-foreground' }[tono]
  return (
    <div className="grid gap-3">
      <span aria-hidden="true" className={cn('grid size-14 place-items-center rounded-full', fondo)}>
        {icono}
      </span>
      <h3 className="text-[26px] font-bold leading-tight tracking-tight text-foreground">{titulo}</h3>
      <p className="text-[15px] text-muted-foreground">{children}</p>
    </div>
  )
}

function Paso({ estado, titulo, detalle }: { estado: 'hecho' | 'actual' | 'siguiente'; titulo: string; detalle: React.ReactNode }) {
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0" aria-current={estado === 'actual' ? 'step' : undefined}>
      <span
        aria-hidden="true"
        className={cn(
          'mt-1 grid size-5 shrink-0 place-items-center rounded-full border-2',
          estado === 'hecho' && 'border-success bg-success',
          estado === 'actual' && 'border-warning',
          estado === 'siguiente' && 'border-border',
        )}
      >
        {estado === 'hecho' && <CheckCircle2 className="size-3.5 text-success-foreground" />}
        {estado === 'actual' && <span className="size-2 rounded-full bg-warning" />}
      </span>
      <span className="min-w-0">
        <b className={cn('block text-[15px] font-semibold', estado === 'siguiente' ? 'text-muted-foreground' : 'text-foreground')}>{titulo}</b>
        <span className="block text-[13px] text-muted-foreground">
          {detalle}
          {estado === 'hecho' && <span className="sr-only">. Hecho.</span>}
          {estado === 'actual' && <span className="sr-only">. Paso actual.</span>}
        </span>
      </span>
    </li>
  )
}

/** Request received (design 05 state 1). */
export function VistaListo({ f, nombre, email }: { f: FlujoReserva; nombre: string; email: string }) {
  const e = f.taller.ediciones.find((x) => x.id === f.edicionId)
  const r = f.resultado
  const persona = f.taller.generoRequerido === 'Femenino' ? 'facilitadora' : 'facilitador'
  const hora = e ? horaLegible(e.hora) : null
  return (
    <div className="grid gap-6">
      <Cabecera icono={<CheckCircle2 className="size-7" />} tono="success" titulo="Solicitud recibida">
        {nombre ? `Gracias, ${nombre}. ` : 'Gracias. '}La coordinación de {f.taller.nombre} revisa cada solicitud y te avisa por correo y en la app.
      </Cabecera>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <PuntoEstado tono="warning" etiqueta="Pendiente de aprobación" />
        {r?.porVerificar && <PuntoEstado tono="info" etiqueta="Por verificar" />}
      </div>
      {e && (
        <div className="grid gap-1 rounded-2xl border border-border bg-card p-4">
          <b className="text-[17px] font-semibold text-foreground">{f.taller.nombre}</b>
          <span className="text-[13px] text-muted-foreground">
            {tituloEdicion(e)}
            {e.clases ? (
              <>
                {' '}
                · <span className="font-mono tabular-nums">{e.clases}</span> clases
              </>
            ) : null}
            {e.lugar ? ` · ${e.lugar}` : ''}
          </span>
        </div>
      )}
      <section aria-labelledby="reserva-que-sigue" className="grid gap-3">
        <h4 id="reserva-que-sigue" className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Qué sigue
        </h4>
        <ol className="grid">
          <Paso estado="hecho" titulo="Recibida" detalle="Hoy" />
          <Paso estado="actual" titulo="Aprobada por la coordinación" detalle="Te avisamos por correo y en la app." />
          <Paso estado="siguiente" titulo={`Te asignamos grupo y ${persona}`} detalle="Verás su nombre y su contacto." />
          {e && (
            <Paso
              estado="siguiente"
              titulo="Primera clase"
              detalle={
                <>
                  {fechaCorta(e.fechaInicio)}
                  {hora ? ` · ${hora}` : ''}
                  {e.lugar ? ` · ${e.lugar}` : ''}
                </>
              }
            />
          )}
        </ol>
      </section>
      {r?.cuentaNueva ? (
        <div className="grid gap-2 rounded-2xl border border-brand/30 bg-brand-tint p-4">
          <b className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
            <MailCheck aria-hidden="true" className="size-5 text-brand-text" />
            Activa tu cuenta Global
          </b>
          <p className="text-[14px] text-foreground">
            Te enviamos un enlace{email ? <> a <b className="break-all font-semibold">{email}</b></> : null}. Con tu cuenta ves tu grupo y a tu {persona}, llevas tu
            asistencia clase por clase y descargas tu certificado al terminar.
          </p>
          <p className="text-[13px] text-muted-foreground">¿No llegó? Mira en spam.</p>
        </div>
      ) : (
        <div className="grid gap-3 rounded-2xl border border-border bg-card p-4">
          <b className="text-[15px] font-semibold text-foreground">Síguela en la app</b>
          <p className="text-[14px] text-muted-foreground">En Mis talleres ves el estado de tu solicitud y, al aprobarla, tu grupo y tu {persona}.</p>
          <BotonSistema asChild variante="outline" className="justify-self-start">
            <Link href={RUTA_MIS_TALLERES}>Abrir Global</Link>
          </BotonSistema>
        </div>
      )}
    </div>
  )
}

/** Full edición (design 05 state 2): other horarios and "avísame" (S13). */
export function VistaLleno({ f, nombreInicial, emailInicial }: { f: FlujoReserva; nombreInicial: string; emailInicial: string }) {
  const e = f.taller.ediciones.find((x) => x.id === f.edicionId)
  const otras = edicionesConLugar(f.taller).filter((x) => x.id !== f.edicionId)
  const [nombre, setNombre] = useState(nombreInicial)
  const [email, setEmail] = useState(emailInicial)
  const [errores, setErrores] = useState<{ nombre?: string; email?: string }>({})
  const [aviso, setAviso] = useState<string | null>(null)
  const [listo, setListo] = useState(false)

  async function avisar(ev: FormEvent | React.MouseEvent) {
    ev.preventDefault()
    const faltan = { nombre: nombre.trim() ? undefined : 'Escribe tu nombre.', email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) ? undefined : 'Escribe un correo completo.' }
    setErrores(faltan)
    if (faltan.nombre || faltan.email) return
    const r = await f.avisame(nombre.trim(), email.trim())
    if (r.estado === 'ok') {
      setListo(true)
      setAviso(null)
      return
    }
    if (r.estado === 'invalido' && (r.campo === 'nombre' || r.campo === 'email')) setErrores({ [r.campo]: r.mensaje })
    setAviso(r.mensaje ?? MENSAJES.error)
  }

  return (
    <div className="grid gap-6">
      <Cabecera icono={<CircleSlash className="size-7" />} tono="danger" titulo={e ? `El ${tituloEdicion(e).split(' · ')[0].toLowerCase()} se llenó` : 'Este horario se llenó'}>
        {e ? `Se ocupó el último lugar de ${tituloEdicion(e)}; tus datos siguen aquí. ` : 'Tus datos siguen aquí. '}Elige otro horario o te avisamos si se abre un lugar.
      </Cabecera>
      {otras.length > 0 && (
        <section aria-labelledby="reserva-otros" className="grid gap-3">
          <h4 id="reserva-otros" className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Otros horarios de {f.taller.nombre}
          </h4>
          <ul className="grid gap-2">
            {otras.map((o) => {
              const cupo = estadoCupo(o)
              return (
                <li key={o.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
                  <span className="min-w-0 flex-1">
                    <b className="block text-[15px] font-semibold text-foreground">{tituloEdicion(o)}</b>
                    <span className="block text-[13px] text-muted-foreground">
                      Inicia {fechaCorta(o.fechaInicio)}
                      {o.lugar ? ` · ${o.lugar}` : ''}
                    </span>
                    <PuntoEstado tono={cupo.tono} etiqueta={cupo.etiqueta} className="mt-1" />
                  </span>
                  <BotonSistema type="button" variante="secundario" onClick={() => f.elegirEdicion(o.id)}>
                    Reservar el {tituloEdicion(o).split(' · ')[0].toLowerCase()}
                  </BotonSistema>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <section aria-labelledby="reserva-avisame" className="grid gap-3 rounded-2xl border border-border bg-card p-4">
        <h4 id="reserva-avisame" className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
          <Bell aria-hidden="true" className="size-5 text-brand-text" />
          Avísame si se abre un lugar
        </h4>
        {listo ? (
          <p role="status" className="text-[14px] text-foreground">
            Listo. Si se abre un lugar, te avisamos a ti y a las demás personas anotadas al mismo tiempo; el primero que reserve se queda con el lugar.
          </p>
        ) : (
          <>
            <p className="text-[13px] text-muted-foreground">
              No es una reserva ni un turno: si se abre un lugar avisamos por correo a todas las personas anotadas a la vez. El primero que reserve se queda con el lugar.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <InputSistema id="reserva-avisame-nombre" label="Nombre" value={nombre} onChange={(ev) => setNombre(ev.target.value)} maxLength={120} autoComplete="name" error={errores.nombre} />
              <InputSistema
                id="reserva-avisame-email"
                label="Correo"
                type="email"
                inputMode="email"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                maxLength={254}
                autoComplete="email"
                error={errores.email}
              />
            </div>
            {aviso && <AvisoFormulario tono="error">{aviso}</AvisoFormulario>}
            <BotonSistema type="button" variante="secundario" onClick={avisar} cargando={f.cargando} className="justify-self-start">
              Avísame
            </BotonSistema>
          </>
        )}
      </section>
    </div>
  )
}

export function VistaCerrada({ f }: { f: FlujoReserva }) {
  const otras = edicionesConLugar(f.taller).filter((x) => x.id !== f.edicionId)
  return (
    <div className="grid gap-6">
      <Cabecera icono={<Clock className="size-7" />} tono="muted" titulo="Las inscripciones cerraron">
        Este horario ya no recibe solicitudes.{otras.length > 0 ? ' Todavía puedes elegir otro horario.' : ' Mira los otros talleres abiertos.'}
      </Cabecera>
      {otras.length > 0 && (
        <ul className="grid gap-2">
          {otras.map((o) => (
            <li key={o.id}>
              <BotonSistema type="button" variante="outline" className="w-full justify-between" onClick={() => f.elegirEdicion(o.id)}>
                {tituloEdicion(o)}
              </BotonSistema>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function VistaYaInscrito({ f, nombre }: { f: FlujoReserva; nombre: string }) {
  return (
    <div className="grid gap-6">
      <Cabecera icono={<CheckCircle2 className="size-7" />} tono="warning" titulo="Ya tienes una solicitud">
        {nombre ? `${nombre}, ya` : 'Ya'} pediste un lugar en {f.taller.nombre}. No hace falta enviarla otra vez.
      </Cabecera>
      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4">
        <p className="text-[14px] text-muted-foreground">¿Quieres otro horario? Escribe a la coordinación y te lo cambian si hay lugar. En Mis talleres ves el estado de tu solicitud.</p>
        <BotonSistema asChild variante="outline" className="justify-self-start">
          <Link href={RUTA_MIS_TALLERES}>Ver en la app</Link>
        </BotonSistema>
      </div>
    </div>
  )
}

export function VistaGeneroNoAplica({ f }: { f: FlujoReserva }) {
  const para = f.taller.generoRequerido === 'Femenino' ? 'mujeres' : 'hombres'
  return (
    <Cabecera icono={<CircleSlash className="size-7" />} tono="muted" titulo={`${f.taller.nombre} es para ${para}`}>
      Según tu ficha de Global este taller no es para ti. Mira los otros Grupos de Corto Plazo; si tu ficha tiene un error, escribe a la coordinación.
    </Cabecera>
  )
}
