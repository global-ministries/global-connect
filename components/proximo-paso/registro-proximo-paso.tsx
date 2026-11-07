'use client'

/**
 * T2 (odd/tasks/proximo-paso.md, S3) — the public QR page of Próximo Paso
 * (/proximo-paso). One scrolling page, phone first: what Próximo Paso is
 * (4 clases, one per Sunday, a new group every first Sunday of the month),
 * "¿Cuándo quieres empezar?" (the open ediciones as a single-choice list,
 * gap GP1 of components.md composed as in Estudiantes' tarjeta-decision),
 * then the account form (nombre, apellido, teléfono, correo, contraseña)
 * with a sticky send bar. A signed-in person skips the form: one tap on
 * "Inscribirme". The end states are the confirmation ("Quedaste inscrito…")
 * with "Ver mis clases" when the inscripción was approved on the spot,
 * or "Recibimos tu inscripción…" when the coordinación still has to confirm it.
 * When the account must confirm its email first, the form switches in place
 * to the code step (paso-codigo.tsx, T2c): it reads the same for every
 * address (it never says whether the email already had an account) and
 * offers "Inicia sesión" to whoever had one. «Cambiar correo» comes back to
 * the form with the data and the edición kept. The server actions re-check
 * everything.
 */

import { useState, type FormEvent, type ReactElement } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, CalendarX, CheckCircle2, Clock, Eye, EyeOff } from 'lucide-react'

import { inscribirmeEnProximoPaso, registrarseEnProximoPaso, type FalloProximoPaso } from '@/app/proximo-paso/actions'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { PasoCodigo } from '@/components/proximo-paso/paso-codigo'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { BotonSistema, InputSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import {
  fechaDomingo,
  loginProximoPaso,
  mensajeInscrito,
  mensajePendiente,
  RUTA_MIS_CLASES,
  validarRegistro,
  type CampoRegistro,
  type EdicionProximoPaso,
  type EdicionResumen,
} from '@/lib/platform/talleres/proximo-paso-registro'
import { cn } from '@/lib/utils'

export interface RegistroProximoPasoProps {
  readonly ediciones: readonly EdicionProximoPaso[]
  readonly conSesion: boolean
  /** ?edicion= of the link (the login and the confirmation email come back with it). */
  readonly edicionInicial?: string | null
}

type Final =
  | { readonly tipo: 'inscrito'; readonly edicion: EdicionResumen }
  | { readonly tipo: 'pendiente'; readonly edicion: EdicionResumen }

/** The account waits for the code of its confirmation email. */
interface EsperaCodigo {
  readonly email: string
  readonly edicion: EdicionResumen
}

const CAMPOS_VACIOS: Record<CampoRegistro, string> = { nombre: '', apellido: '', telefono: '', email: '', password: '' }

const enlace = 'inline-flex min-h-11 items-center rounded-md px-1 font-semibold text-brand-text underline-offset-4 hover:underline focus-ring'

const disponible = (e: EdicionProximoPaso) => e.cupoRestante !== 0

function edicionPorDefecto(ediciones: readonly EdicionProximoPaso[], inicial?: string | null): string | null {
  const elegida = ediciones.find((e) => e.id === inicial && disponible(e))
  return (elegida ?? ediciones.find(disponible))?.id ?? null
}

function descripcionEdicion(e: EdicionProximoPaso): string {
  const fin = e.fechaFin ? ` · termina el ${fechaDomingo(e.fechaFin)}` : ''
  return `Primera clase el domingo ${fechaDomingo(e.fechaInicio)}${fin}`
}

function cupoEdicion(e: EdicionProximoPaso): string | null {
  if (e.cupoRestante === null || e.cupoRestante === 0) return null
  return e.cupoRestante === 1 ? 'Queda 1 cupo' : `Quedan ${e.cupoRestante} cupos`
}

export function RegistroProximoPaso({ ediciones, conSesion: conSesionInicial, edicionInicial }: RegistroProximoPasoProps): ReactElement {
  const router = useRouter()
  const [edicionId, setEdicionId] = useState<string | null>(() => edicionPorDefecto(ediciones, edicionInicial))
  const [campos, setCampos] = useState(CAMPOS_VACIOS)
  const [errores, setErrores] = useState<Partial<Record<CampoRegistro, string>>>({})
  const [falloEnvio, setFalloEnvio] = useState<FalloProximoPaso | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [verContrasena, setVerContrasena] = useState(false)
  const [final, setFinal] = useState<Final | null>(null)
  const [esperaCodigo, setEsperaCodigo] = useState<EsperaCodigo | null>(null)
  // The code was right but the enrollment did not go through: signed in from now on.
  const [sesionAbierta, setSesionAbierta] = useState(false)
  const conSesion = conSesionInicial || sesionAbierta

  if (final) return <PantallaFinal final={final} />
  if (esperaCodigo) {
    return (
      <PasoCodigo
        email={esperaCodigo.email}
        edicion={esperaCodigo.edicion}
        onInscrito={(r) => setFinal({ tipo: r.estado, edicion: r.edicion })}
        onSesionAbierta={(f) => {
          setEsperaCodigo(null)
          setSesionAbierta(true)
          setFalloEnvio(f)
          router.refresh()
        }}
        onCambiarCorreo={() => setEsperaCodigo(null)}
      />
    )
  }

  const conClases = ediciones.find((e) => e.clases.some((c) => c.tema)) ?? ediciones[0]
  const numeroClases = conClases?.clases.length || 4
  const temas = conClases?.clases.map((c) => c.tema).filter((t): t is string => Boolean(t)) ?? []

  const cambiar = (campo: CampoRegistro) => (valor: string) => {
    setCampos((c) => ({ ...c, [campo]: valor }))
    setErrores((e) => ({ ...e, [campo]: undefined }))
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enviando) return
    setFalloEnvio(null)
    if (!edicionId) {
      setFalloEnvio({ ok: false, error: 'invalid-input', message: 'Elige una fecha para empezar.' })
      return
    }

    if (conSesion) {
      setEnviando(true)
      try {
        const r = await inscribirmeEnProximoPaso(edicionId)
        if (r.ok) setFinal({ tipo: r.estado, edicion: r.edicion })
        else setFalloEnvio(r)
      } catch {
        setFalloEnvio({ ok: false, error: 'internal', message: 'No se pudo completar la inscripción. Inténtalo de nuevo.' })
      } finally {
        setEnviando(false)
      }
      return
    }

    const validacion = validarRegistro(campos)
    if (!validacion.ok) {
      setErrores(validacion.errores)
      return
    }
    setEnviando(true)
    try {
      const r = await registrarseEnProximoPaso({ edicionId, ...campos })
      if (r.ok && r.estado === 'confirmar_correo') setEsperaCodigo({ email: r.email, edicion: r.edicion })
      else if (r.ok) setFinal({ tipo: r.estado, edicion: r.edicion })
      else {
        if (r.errores) setErrores(r.errores)
        setFalloEnvio(r)
      }
    } catch {
      setFalloEnvio({ ok: false, error: 'internal', message: 'No se pudo completar el registro. Inténtalo de nuevo.' })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="grid min-w-0 flex-1 content-start gap-6">
      <header className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-text">Global · Próximo Paso</p>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-foreground sm:text-[34px]">Inscríbete en Próximo Paso</h1>
        <TextoSistema variante="sutil">
          {`Son ${numeroClases} clases, una cada domingo. Cada primer domingo del mes empieza un grupo nuevo: elige cuándo quieres empezar.`}
        </TextoSistema>
        {temas.length > 0 && <p className="text-sm font-medium text-foreground">{temas.join(' · ')}</p>}
      </header>

      {ediciones.length === 0 ? (
        <TarjetaSistema>
          <EstadoVacioSistema
            icono={CalendarX}
            titulo="No hay fechas abiertas en este momento"
            subtitulo="Pronto abrimos la próxima. Pregunta en la mesa de bienvenida."
          />
        </TarjetaSistema>
      ) : (
        <>
          <fieldset className="min-w-0">
            <legend className="mb-2 text-[17px] font-semibold text-foreground">¿Cuándo quieres empezar?</legend>
            <ul className="min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card">
              {ediciones.map((e) => {
                const id = `proximo-paso-edicion-${e.id}`
                const elegida = edicionId === e.id
                const cupo = cupoEdicion(e)
                return (
                  <li key={e.id} className="relative before:absolute before:top-0 before:right-0 before:left-12 before:h-px before:bg-border/60 first:before:hidden">
                    <label
                      htmlFor={id}
                      className={cn(
                        'flex min-h-[64px] w-full min-w-0 gap-3 px-3.5 py-3 transition-colors',
                        disponible(e) ? 'cursor-pointer md:hover:bg-accent/50' : 'cursor-not-allowed opacity-70',
                        elegida && 'bg-brand-tint md:hover:bg-brand-tint',
                      )}
                    >
                      <input
                        id={id}
                        type="radio"
                        name="edicion"
                        value={e.id}
                        checked={elegida}
                        disabled={!disponible(e)}
                        onChange={() => {
                          setEdicionId(e.id)
                          setFalloEnvio(null)
                        }}
                        className="focus-ring mt-0.5 size-5 shrink-0 accent-[var(--brand-strong)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold text-foreground">{e.nombre}</span>
                        <span className="mt-0.5 block text-[13px] text-muted-foreground">{descripcionEdicion(e)}</span>
                        {cupo && <span className="mt-0.5 block font-mono text-[13px] tabular-nums text-muted-foreground">{cupo}</span>}
                        {!disponible(e) && <span className="mt-1 block text-[13px] font-medium text-warning-text">Sin cupos</span>}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </fieldset>

          {!conSesion && (
            <section aria-labelledby="proximo-paso-datos" className="grid gap-4">
              <div className="grid gap-1">
                <h2 id="proximo-paso-datos" className="text-[17px] font-semibold text-foreground">
                  Tus datos
                </h2>
                <p className="text-sm text-muted-foreground">
                  Con ellos creas tu cuenta para ver tus clases en la app. ¿Ya tienes cuenta?{' '}
                  <Link href={loginProximoPaso(edicionId)} className={enlace}>
                    Inicia sesión
                  </Link>
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <InputSistema
                  label="Nombre"
                  name="nombre"
                  autoComplete="given-name"
                  value={campos.nombre}
                  onChange={(e) => cambiar('nombre')(e.target.value)}
                  error={errores.nombre}
                  disabled={enviando}
                />
                <InputSistema
                  label="Apellido"
                  name="apellido"
                  autoComplete="family-name"
                  value={campos.apellido}
                  onChange={(e) => cambiar('apellido')(e.target.value)}
                  error={errores.apellido}
                  disabled={enviando}
                />
              </div>
              <InputSistema
                label="Teléfono"
                name="telefono"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0412 123 4567"
                value={campos.telefono}
                onChange={(e) => cambiar('telefono')(e.target.value)}
                error={errores.telefono}
                disabled={enviando}
              />
              <InputSistema
                label="Correo electrónico"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="tu@correo.com"
                value={campos.email}
                onChange={(e) => cambiar('email')(e.target.value)}
                error={errores.email}
                disabled={enviando}
              />
              <InputSistema
                label="Contraseña"
                name="password"
                type={verContrasena ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
                value={campos.password}
                onChange={(e) => cambiar('password')(e.target.value)}
                error={errores.password}
                disabled={enviando}
                accesorio={
                  <BotonSistema
                    type="button"
                    variante="ghost"
                    tamaño="sm"
                    soloIcono
                    icono={verContrasena ? EyeOff : Eye}
                    aria-label={verContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={verContrasena}
                    onClick={() => setVerContrasena((v) => !v)}
                  />
                }
              />
            </section>
          )}

          {falloEnvio && <AvisoFalloEnvio fallo={falloEnvio} onOtraFecha={() => router.refresh()} />}

          {/* Sticky send bar on phones, with room for the home indicator. */}
          <div className="sticky bottom-0 z-10 -mx-4 grid gap-2 border-t border-border bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:mx-0 sm:rounded-2xl sm:border sm:px-4">
            <BotonSistema
              type="submit"
              tamaño="lg"
              className="w-full"
              cargando={enviando}
              disabled={!edicionId}
              icono={ArrowRight}
              iconoPosicion="derecha"
            >
              {conSesion ? 'Inscribirme' : 'Crear cuenta e inscribirme'}
            </BotonSistema>
          </div>
        </>
      )}
    </form>
  )
}

function AvisoFalloEnvio({ fallo, onOtraFecha }: { readonly fallo: FalloProximoPaso; readonly onOtraFecha: () => void }): ReactElement {
  return (
    <AvisoFormulario tono="error" className="grid gap-2">
      <p>{fallo.message}</p>
      {fallo.loginHref && (
        <Link href={fallo.loginHref} className={cn(enlace, 'justify-self-start')}>
          Iniciar sesión
        </Link>
      )}
      {(fallo.error === 'CUENTA_SIN_INSCRIPCION' || fallo.error === 'CON_SESION') && (
        <button type="button" onClick={onOtraFecha} className={cn(enlace, 'justify-self-start')}>
          Volver a intentar
        </button>
      )}
    </AvisoFormulario>
  )
}

const ICONO_FINAL = { inscrito: CheckCircle2, pendiente: Clock } as const

function PantallaFinal({ final }: { readonly final: Final }): ReactElement {
  const Icono = ICONO_FINAL[final.tipo]
  return (
    <TarjetaSistema className="grid gap-5 p-5 text-center">
      <section aria-labelledby="proximo-paso-final" className="grid gap-5" aria-live="polite">
        <Icono className={cn('mx-auto size-10', final.tipo === 'inscrito' ? 'text-success-text' : 'text-brand')} aria-hidden />
        <div className="grid gap-2">
          <h2 id="proximo-paso-final" className="text-xl font-bold tracking-tight text-foreground">
            {final.tipo === 'inscrito' ? mensajeInscrito(final.edicion) : mensajePendiente(final.edicion)}
          </h2>
          <TextoSistema variante="sutil">
            {final.tipo === 'inscrito'
              ? 'Te esperamos ese domingo. En la app ves tus clases.'
              : `La coordinación la confirmará. La primera clase es el domingo ${fechaDomingo(final.edicion.fechaInicio)}.`}
          </TextoSistema>
        </div>
        {final.tipo === 'inscrito' && (
          <BotonSistema asChild tamaño="lg" icono={ArrowRight} iconoPosicion="derecha" className="w-full">
            <Link href={RUTA_MIS_CLASES}>Ver mis clases</Link>
          </BotonSistema>
        )}
      </section>
    </TarjetaSistema>
  )
}
