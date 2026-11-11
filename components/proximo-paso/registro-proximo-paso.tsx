'use client'

/**
 * T2 (odd/tasks/proximo-paso.md, S3) — the public QR page of Próximo Paso
 * (/proximo-paso). T8 (design/proximo-paso 01–07, approved in L24) makes it
 * a native-app flow on the phone:
 *
 *   inicio (01) → [fecha (02), only with several open ediciones] → tus datos
 *   (03) → código (04, paso-codigo.tsx) → ¡Listo! (05)
 *
 * A signed-in person gets the one-tap landing (06) with «Cambiar fecha» in
 * a bottom sheet, or «Ya tienes tu lugar» when already enrolled. The states
 * of 07: sin fechas, cupo lleno (the data stays and the next date is
 * offered), cerradas (a link to a date that closed), código incorrecto and
 * demasiados intentos (paso-codigo.tsx), ya inscrito. Time and place show
 * wherever a date does (L24.3), and nothing when the edición has none.
 *
 * The code step reads the same for every address (it never says whether
 * the email already had an account) and offers «Inicia sesión»; «Cambiar
 * correo» comes back to «Tus datos» with the data kept. The server actions
 * re-check everything (app/proximo-paso/actions.ts).
 */

import { useState, type FormEvent, type ReactElement, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

import { inscribirmeEnProximoPaso, registrarseEnProximoPaso, type FalloProximoPaso } from '@/app/proximo-paso/actions'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { PasoCodigo } from '@/components/proximo-paso/paso-codigo'
import { HojaInferior } from '@/components/ui/hoja-inferior'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import type { InscripcionProximoPaso } from '@/lib/platform/proximo-paso/estado'
import {
  loginProximoPaso,
  validarRegistro,
  type CampoRegistro,
  type EdicionProximoPaso,
  type EdicionResumen,
  type EstadoInscripcionProximoPaso,
} from '@/lib/platform/talleres/proximo-paso-registro'
import { cn } from '@/lib/utils'

import { CupoLleno, FechaCerrada, PantallaListo, SinFechas, YaInscrito } from './pantallas'
import { ElegirFecha, enlace, InicioConSesion, InicioPublico, OpcionesFecha, TusDatos, type CamposRegistro } from './vistas'

export interface RegistroProximoPasoProps {
  readonly ediciones: readonly EdicionProximoPaso[]
  readonly conSesion: boolean
  /** ?edicion= of the link (the login and the confirmation email come back with it). */
  readonly edicionInicial?: string | null
  /** The signed-in person's first name, for «Hola, …» and «¡Listo, …!». */
  readonly persona?: { readonly nombre: string | null } | null
  /** The signed-in person's own inscripción in an open (or running) edición. */
  readonly inscripcion?: InscripcionProximoPaso | null
}

type Vista =
  | { readonly tipo: 'inicio' }
  | { readonly tipo: 'fecha' }
  | { readonly tipo: 'datos' }
  | { readonly tipo: 'codigo'; readonly email: string; readonly edicion: EdicionResumen }
  | { readonly tipo: 'listo'; readonly estado: EstadoInscripcionProximoPaso; readonly edicion: EdicionResumen }
  | { readonly tipo: 'lleno'; readonly edicion: EdicionResumen }
  | { readonly tipo: 'cerrada' }
  | { readonly tipo: 'ya-inscrito'; readonly estado: EstadoInscripcionProximoPaso | null; readonly edicion: EdicionResumen }

const CAMPOS_VACIOS: CamposRegistro = { nombre: '', apellido: '', telefono: '', email: '', password: '' }

/** The full edición when it is in the list; else what the server answered. */
function completa(ediciones: readonly EdicionProximoPaso[], r: EdicionResumen): EdicionProximoPaso {
  return (
    ediciones.find((e) => e.id === r.id) ?? {
      ...r,
      fechaFin: null,
      cupoRestante: null,
      clases: [],
      hora: null,
      lugar: null,
      indicaciones: null,
    }
  )
}

const primerNombre = (nombre: string | null | undefined): string | null => nombre?.trim().split(/\s+/)[0] || null

function vistaInicial({ ediciones, conSesion, edicionInicial, inscripcion }: RegistroProximoPasoProps): Vista {
  if (conSesion && inscripcion) return { tipo: 'ya-inscrito', estado: inscripcion.estado, edicion: inscripcion.edicion }
  if (edicionInicial && ediciones.length > 0 && !ediciones.some((e) => e.id === edicionInicial && e.cupoRestante !== 0)) {
    return { tipo: 'cerrada' }
  }
  return { tipo: 'inicio' }
}

/** Sticky top bar: the brand (or back) on the left, sign-in on the right. */
function Barra({ atras, derecha, titulo }: { readonly atras?: { readonly etiqueta: string; readonly onClick: () => void }; readonly derecha?: ReactNode; readonly titulo: string }) {
  return (
    <nav aria-label={titulo} className="sticky top-0 z-10 -mx-4 mb-2 grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center bg-background/90 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-xl sm:-mx-6 sm:px-4">
      {atras ? (
        <button
          type="button"
          onClick={atras.onClick}
          aria-label={`Volver a ${atras.etiqueta}`}
          className="focus-ring inline-flex min-h-11 max-w-[60vw] items-center gap-0.5 justify-self-start rounded-xl px-2 text-base text-brand-text"
        >
          <ChevronLeft aria-hidden="true" className="-ml-1 size-6" />
          <span className="truncate">{atras.etiqueta}</span>
        </button>
      ) : (
        <span className="inline-flex min-h-11 items-center gap-2 justify-self-start px-2 text-[15px] font-bold">
          <i aria-hidden="true" className="size-6 rounded-lg bg-brand" />
          Global
        </span>
      )}
      {derecha}
    </nav>
  )
}

function AvisoFalloEnvio({ fallo, onOtraVez }: { readonly fallo: FalloProximoPaso; readonly onOtraVez: () => void }): ReactElement {
  return (
    <AvisoFormulario tono="error" className="grid gap-2">
      <p>{fallo.message}</p>
      {fallo.loginHref && (
        <Link href={fallo.loginHref} className={cn(enlace, 'justify-self-start')}>
          Iniciar sesión
        </Link>
      )}
      {(fallo.error === 'CUENTA_SIN_INSCRIPCION' || fallo.error === 'CON_SESION') && (
        <button type="button" onClick={onOtraVez} className={cn(enlace, 'justify-self-start')}>
          Volver a intentar
        </button>
      )}
    </AvisoFormulario>
  )
}

export function RegistroProximoPaso(props: RegistroProximoPasoProps): ReactElement {
  const { ediciones, conSesion: conSesionInicial, edicionInicial, persona } = props
  const router = useRouter()
  const [vista, setVista] = useState<Vista>(() => vistaInicial(props))
  // Ediciones the server said are full while the person was here.
  const [llenas, setLlenas] = useState<readonly string[]>([])
  const disponible = (e: EdicionProximoPaso) => e.cupoRestante !== 0 && !llenas.includes(e.id)
  const disponibles = ediciones.filter(disponible)
  const [edicionId, setEdicionId] = useState<string | null>(
    () => (ediciones.find((e) => e.id === edicionInicial && e.cupoRestante !== 0) ?? ediciones.find((e) => e.cupoRestante !== 0))?.id ?? null,
  )
  const [campos, setCampos] = useState<CamposRegistro>(CAMPOS_VACIOS)
  const [errores, setErrores] = useState<Partial<Record<CampoRegistro, string>>>({})
  const [fallo, setFallo] = useState<FalloProximoPaso | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [verContrasena, setVerContrasena] = useState(false)
  const [hojaFecha, setHojaFecha] = useState(false)
  // The code was right but the enrollment did not go through: signed in from now on.
  const [sesionAbierta, setSesionAbierta] = useState(false)
  const conSesion = conSesionInicial || sesionAbierta

  const elegida = disponibles.find((e) => e.id === edicionId) ?? disponibles[0] ?? null
  const varias = disponibles.length > 1
  const total = varias ? 3 : 2
  const nombre = primerNombre(persona?.nombre) ?? primerNombre(campos.nombre)
  const aviso = fallo && <AvisoFalloEnvio fallo={fallo} onOtraVez={() => router.refresh()} />

  function ir(v: Vista) {
    setFallo(null)
    setVista(v)
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') window.scrollTo({ top: 0 })
  }

  /** The common answers of both actions: the full date, a closed one, already enrolled. */
  function falloComun(r: FalloProximoPaso, edicion: EdicionProximoPaso): boolean {
    if (r.error === 'CUPO_LLENO') {
      setLlenas((l) => [...l, edicion.id])
      ir({ tipo: 'lleno', edicion })
      return true
    }
    if (r.error === 'EDICION_NO_DISPONIBLE' || r.error === 'EDICION_NOT_FOUND' || r.error === 'EDICION_NO_ABIERTA') {
      setLlenas((l) => [...l, edicion.id])
      ir({ tipo: 'cerrada' })
      return true
    }
    if (r.error === 'YA_INSCRITO') {
      ir({ tipo: 'ya-inscrito', estado: null, edicion })
      return true
    }
    return false
  }

  async function inscribirConSesion(edicion: EdicionProximoPaso) {
    if (enviando) return
    setFallo(null)
    setEnviando(true)
    try {
      const r = await inscribirmeEnProximoPaso(edicion.id)
      if (r.ok) ir({ tipo: 'listo', estado: r.estado, edicion: r.edicion })
      else if (!falloComun(r, edicion)) setFallo(r)
    } catch {
      setFallo({ ok: false, error: 'internal', message: 'No se pudo completar la inscripción. Inténtalo de nuevo.' })
    } finally {
      setEnviando(false)
    }
  }

  async function registrar(edicion: EdicionProximoPaso) {
    if (enviando) return
    setFallo(null)
    const validacion = validarRegistro(campos)
    if (!validacion.ok) {
      setErrores(validacion.errores)
      setVista({ tipo: 'datos' })
      return
    }
    setEnviando(true)
    try {
      const r = await registrarseEnProximoPaso({ edicionId: edicion.id, ...campos })
      if (r.ok && r.estado === 'confirmar_correo') ir({ tipo: 'codigo', email: r.email, edicion: r.edicion })
      else if (r.ok) ir({ tipo: 'listo', estado: r.estado, edicion: r.edicion })
      else if (!falloComun(r, edicion)) {
        setVista({ tipo: 'datos' })
        if (r.errores) setErrores(r.errores)
        setFallo(r)
      }
    } catch {
      setFallo({ ok: false, error: 'internal', message: 'No se pudo completar el registro. Inténtalo de nuevo.' })
    } finally {
      setEnviando(false)
    }
  }

  const loginHref = loginProximoPaso(elegida?.id ?? edicionId)
  const iniciarSesion = !conSesion && (
    <Link href={loginHref} className={cn(enlace, 'justify-self-end')}>
      Iniciar sesión
    </Link>
  )
  const alInicio = { etiqueta: 'Próximo Paso', onClick: () => ir({ tipo: 'inicio' }) }

  let contenido: ReactElement
  let atras: { etiqueta: string; onClick: () => void } | undefined
  let derecha: ReactNode = iniciarSesion

  if (vista.tipo === 'listo') {
    derecha = null
    contenido = <PantallaListo estado={vista.estado} edicion={completa(ediciones, vista.edicion)} nombre={nombre} />
  } else if (vista.tipo === 'ya-inscrito') {
    derecha = null
    contenido = <YaInscrito inscripcion={{ estado: vista.estado, edicion: completa(ediciones, vista.edicion) }} />
  } else if (vista.tipo === 'codigo') {
    atras = { etiqueta: 'Tus datos', onClick: () => ir({ tipo: 'datos' }) }
    derecha = null
    contenido = (
      <PasoCodigo
        email={vista.email}
        edicion={vista.edicion}
        paso={{ numero: total, total }}
        onInscrito={(r) => ir({ tipo: 'listo', estado: r.estado, edicion: r.edicion })}
        onSesionAbierta={(f) => {
          setSesionAbierta(true)
          setVista({ tipo: 'inicio' })
          setFallo(f)
          router.refresh()
        }}
        onCambiarCorreo={() => ir({ tipo: 'datos' })}
      />
    )
  } else if (ediciones.length === 0 || (!elegida && vista.tipo !== 'lleno' && vista.tipo !== 'cerrada')) {
    contenido = <SinFechas llenas={ediciones.length > 0} />
  } else if (vista.tipo === 'lleno') {
    atras = conSesion ? undefined : { etiqueta: 'Tus datos', onClick: () => ir({ tipo: 'datos' }) }
    contenido = (
      <CupoLleno
        llena={vista.edicion}
        siguiente={elegida}
        enviando={enviando}
        onInscribir={(e) => {
          setEdicionId(e.id)
          void (conSesion ? inscribirConSesion(e) : registrar(e))
        }}
        onAhoraNo={() => ir({ tipo: 'inicio' })}
      />
    )
  } else if (vista.tipo === 'cerrada') {
    contenido = (
      <FechaCerrada
        siguiente={elegida}
        onInscribir={(e) => {
          setEdicionId(e.id)
          ir({ tipo: conSesion ? 'inicio' : 'datos' })
        }}
      />
    )
  } else if (conSesion && elegida) {
    contenido = (
      <InicioConSesion
        nombre={nombre}
        edicion={elegida}
        puedeCambiar={varias}
        enviando={enviando}
        aviso={aviso}
        onCambiarFecha={() => setHojaFecha(true)}
        onInscribirme={() => void inscribirConSesion(elegida)}
      />
    )
  } else if (vista.tipo === 'fecha' && elegida) {
    atras = alInicio
    contenido = (
      <ElegirFecha
        ediciones={ediciones}
        elegida={elegida}
        disponible={disponible}
        onElegir={setEdicionId}
        onContinuar={() => ir({ tipo: 'datos' })}
      />
    )
  } else if (vista.tipo === 'datos' && elegida) {
    atras = varias ? { etiqueta: 'Fecha', onClick: () => ir({ tipo: 'fecha' }) } : alInicio
    contenido = (
      <TusDatos
        edicion={elegida}
        paso={{ numero: total - 1, total }}
        puedeCambiar={varias}
        campos={campos}
        errores={errores}
        enviando={enviando}
        verContrasena={verContrasena}
        loginHref={loginHref}
        aviso={aviso}
        onCambiarFecha={() => ir({ tipo: 'fecha' })}
        onCampo={(campo, valor) => {
          setCampos((c) => ({ ...c, [campo]: valor }))
          setErrores((e) => ({ ...e, [campo]: undefined }))
        }}
        onVerContrasena={() => setVerContrasena((v) => !v)}
        onEnviar={(evento: FormEvent<HTMLFormElement>) => {
          evento.preventDefault()
          if (elegida) void registrar(elegida)
        }}
      />
    )
  } else {
    contenido = (
      <InicioPublico
        edicion={elegida as EdicionProximoPaso}
        fechasConCupo={disponibles.length}
        loginHref={loginHref}
        onInscribirme={() => ir({ tipo: varias ? 'fecha' : 'datos' })}
        onVerFechas={() => ir({ tipo: 'fecha' })}
      />
    )
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <Barra titulo="Próximo Paso" atras={atras} derecha={derecha} />
      {contenido}
      {conSesion && varias && (
        <HojaInferior
          abierta={hojaFecha}
          onCambioAbierta={setHojaFecha}
          titulo="Elige la fecha"
          pie={
            <BotonSistema type="button" tamaño="lg" className="w-full" onClick={() => setHojaFecha(false)}>
              Usar esta fecha
            </BotonSistema>
          }
        >
          <p id="proximo-paso-hoja-fecha" className="sr-only">
            Elige la fecha
          </p>
          <OpcionesFecha ediciones={disponibles} elegida={elegida?.id ?? null} onElegir={setEdicionId} etiquetadoPor="proximo-paso-hoja-fecha" disponible={disponible} />
        </HojaInferior>
      )}
    </div>
  )
}
