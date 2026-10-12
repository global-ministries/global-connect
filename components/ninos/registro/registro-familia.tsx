'use client'

/**
 * Public, no-login family pre-registration (/ninos/registro) as a step-by-step
 * wizard (odd/tasks/ninos-registro-pasos.md R1). It posts the same body as the
 * former single-page form to /api/ninos/preregistro and shows nothing back but
 * the confirmation. It never links to /signup: the account invitation is sent
 * when the table confirms, bound to the new parent ficha.
 */
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Send } from 'lucide-react'

import { BotonSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import type { AutorizadoForm } from '@/lib/platform/ninos/familia'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { parsePreregistro } from '@/lib/platform/ninos/preregistro'

import {
  PASO_REVISAR,
  autorizadoEnBlanco,
  autorizadoVacio,
  cuerpoPreregistro,
  hijoRegistroVacio,
  idCampo,
  primerPasoInvalido,
  validarPaso,
  type DatosRegistro,
  type Errores,
  type HijoRegistro,
  type Paso,
  type PadreRegistro,
} from './logica'
import { PasoRevisar, RegistroExito } from './paso-revisar'
import { PasoHijos, PasoPadre } from './pasos-datos'
import { PasoAutorizados, PasoCuenta, PasoSalud } from './pasos-extra'
import { IndicadorPasos } from './piezas'

type Campus = { id: string; nombre: string }

type Props = {
  campus: Campus[]
  /** From the QR (?campus=), when it names one of `campus`. */
  campusInicial?: string
}

const ENCABEZADOS: Record<Paso, { titulo: string; ayuda: string }> = {
  1: { titulo: 'Tus datos', ayuda: 'Empecemos por ti, que eres quien trae a los niños.' },
  2: { titulo: 'Tus niños', ayuda: 'Con la fecha de nacimiento sabemos a qué salón va cada uno.' },
  3: { titulo: 'Salud', ayuda: 'Así los cuidamos bien. Si todo está bien, solo toca «No».' },
  4: { titulo: '¿Quién más puede retirarlos?', ayuda: 'Además de ti. Si nadie más, puedes saltar este paso.' },
  5: { titulo: '¿Quieres crear tu cuenta?', ayuda: 'Es opcional y gratis.' },
  6: { titulo: 'Revisa y envía', ayuda: 'Mira que todo esté bien. Puedes editar cualquier parte.' },
}

const MENSAJE_LIMITE = 'Hay muchos registros en este momento. Espera unos minutos y toca «Enviar registro» otra vez; tus datos siguen aquí.'
const MENSAJE_RED = 'No pudimos enviar tu registro. Revisa tu conexión y toca «Enviar registro» otra vez; tus datos siguen aquí.'

function focoEn(id: string | undefined) {
  if (id) document.getElementById(id)?.focus()
}

export function RegistroFamilia({ campus, campusInicial }: Props) {
  const campusIds = campus.map((c) => c.id)
  const inicial = campusIds.includes(campusInicial ?? '') ? (campusInicial as string) : campus.length === 1 ? campus[0].id : ''
  const [datos, setDatos] = useState<DatosRegistro>({
    campusId: inicial,
    padre: { nombre: '', apellido: '', telefono: '', email: '', cedula: '' },
    hijos: [hijoRegistroVacio()],
    autorizados: [],
  })
  const [sitioWeb, setSitioWeb] = useState('')
  const [paso, setPaso] = useState<Paso>(1)
  /** Opened from the review: the primary button goes back to it. */
  const [editando, setEditando] = useState(false)
  const [errores, setErrores] = useState<Errores>({})
  const [errorEnvio, setErrorEnvio] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(false)
  const titulo = useRef<HTMLHeadingElement>(null)
  const montado = useRef(false)
  const hoy = hoyEnCaracas()

  useEffect(() => {
    if (montado.current) titulo.current?.focus()
    montado.current = true
  }, [paso])

  const ir = (p: Paso) => {
    setErrores({})
    setErrorEnvio([])
    setPaso(p)
  }

  const setPadre = (campo: keyof PadreRegistro, valor: string) =>
    setDatos((d) => {
      const padre = { ...d.padre, [campo]: valor }
      // The children's surname follows the parent's until it is edited by hand.
      const hijos = campo === 'apellido' ? d.hijos.map((h) => (h.apellido === d.padre.apellido ? { ...h, apellido: valor } : h)) : d.hijos
      return { ...d, padre, hijos }
    })
  const setHijo = (i: number, cambios: Partial<HijoRegistro>) =>
    setDatos((d) => ({ ...d, hijos: d.hijos.map((h, j) => (j === i ? { ...h, ...cambios } : h)) }))
  const setAutorizados = (f: (a: AutorizadoForm[]) => AutorizadoForm[]) => setDatos((d) => ({ ...d, autorizados: f(d.autorizados) }))

  function avanzar() {
    const e = validarPaso(paso, datos, campusIds, hoy)
    setErrores(e)
    if (Object.keys(e).length > 0) {
      focoEn(Object.keys(e)[0])
      return
    }
    if (paso === 4) setAutorizados((as) => as.filter((a) => !autorizadoEnBlanco(a)))
    if (editando) {
      // An edit may leave a later step incomplete (e.g. a new child without health answers).
      const pendiente = primerPasoInvalido(datos, campusIds, hoy)
      if (pendiente === null || pendiente === PASO_REVISAR) setEditando(false)
      ir(pendiente ?? PASO_REVISAR)
      return
    }
    ir((paso + 1) as Paso)
  }

  async function enviar() {
    const pendiente = primerPasoInvalido(datos, campusIds, hoy)
    if (pendiente !== null) {
      setEditando(true)
      ir(pendiente)
      return
    }
    const body = cuerpoPreregistro(datos, sitioWeb)
    const r = parsePreregistro(body, hoy)
    if (!r.ok) {
      setErrorEnvio(r.errores)
      return
    }
    setErrorEnvio([])
    setEnviando(true)
    try {
      const res = await fetch('/api/ninos/preregistro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setListo(true)
        return
      }
      if (res.status === 429) {
        setErrorEnvio([MENSAJE_LIMITE])
        return
      }
      const respuesta = (await res.json().catch(() => null)) as { errores?: string[] } | null
      setErrorEnvio(respuesta?.errores?.length ? respuesta.errores : [MENSAJE_RED])
    } catch {
      setErrorEnvio([MENSAJE_RED])
    } finally {
      setEnviando(false)
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (enviando) return
    if (paso === PASO_REVISAR) void enviar()
    else avanzar()
  }

  if (listo) return <RegistroExito conCorreo={datos.padre.email.trim() !== ''} />

  const { titulo: encabezado, ayuda } = ENCABEZADOS[paso]
  const sinAutorizados = datos.autorizados.every(autorizadoEnBlanco)
  const etiquetaPrincipal =
    paso === PASO_REVISAR
      ? 'Enviar registro'
      : editando
        ? 'Guardar y revisar'
        : paso === 4 && sinAutorizados
          ? 'Saltar este paso'
          : paso === 5 && datos.padre.email.trim() === ''
            ? 'Continuar sin correo'
            : 'Continuar'

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <header className="space-y-4">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">
          Waumba Land · UpStreet
        </p>
        <IndicadorPasos actual={paso} />
      </header>

      <div className="space-y-1">
        <h2 ref={titulo} tabIndex={-1} className="text-2xl font-bold tracking-tight text-foreground focus:outline-none sm:text-3xl">
          {encabezado}
        </h2>
        <TextoSistema variante="sutil">{ayuda}</TextoSistema>
      </div>

      {paso === 1 && (
        <PasoPadre
          padre={datos.padre}
          campus={campus}
          campusId={datos.campusId}
          errores={errores}
          onPadre={setPadre}
          onCampus={(campusId) => setDatos((d) => ({ ...d, campusId }))}
        />
      )}
      {paso === 2 && (
        <PasoHijos
          hijos={datos.hijos}
          hoy={hoy}
          errores={errores}
          onHijo={setHijo}
          onAgregar={() => setDatos((d) => ({ ...d, hijos: [...d.hijos, hijoRegistroVacio(d.padre.apellido)] }))}
          onQuitar={(i) => {
            setErrores({})
            setDatos((d) => ({ ...d, hijos: d.hijos.filter((_, j) => j !== i) }))
          }}
        />
      )}
      {paso === 3 && <PasoSalud hijos={datos.hijos} errores={errores} onHijo={setHijo} />}
      {paso === 4 && (
        <PasoAutorizados
          autorizados={datos.autorizados}
          errores={errores}
          onCambiar={(i, campo, valor) => setAutorizados((as) => as.map((a, j) => (j === i ? { ...a, [campo]: valor } : a)))}
          onAgregar={() => setAutorizados((as) => [...as, autorizadoVacio()])}
          onQuitar={(i) => {
            setErrores({})
            setAutorizados((as) => as.filter((_, j) => j !== i))
          }}
        />
      )}
      {paso === 5 && (
        <PasoCuenta email={datos.padre.email} error={errores[idCampo.padre('email')]} onEmail={(v) => setPadre('email', v)} />
      )}
      {paso === PASO_REVISAR && (
        <PasoRevisar
          datos={datos}
          campus={campus.length > 1 ? campus.find((c) => c.id === datos.campusId)?.nombre : undefined}
          onEditar={(p) => {
            setEditando(true)
            ir(p)
          }}
        />
      )}

      {/* Honeypot: invisible to people and screen readers; bots fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="pre-sitio">Sitio web</label>
        <input id="pre-sitio" name="sitioWeb" type="text" tabIndex={-1} autoComplete="off" value={sitioWeb} onChange={(e) => setSitioWeb(e.target.value)} />
      </div>

      {errorEnvio.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
          {errorEnvio.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-border bg-background/90 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none">
        {paso > 1 && !editando && (
          <BotonSistema type="button" variante="outline" tamaño="lg" icono={ArrowLeft} className="px-4" onClick={() => ir((paso - 1) as Paso)}>
            Atrás
          </BotonSistema>
        )}
        <BotonSistema
          type="submit"
          tamaño="lg"
          className="flex-1"
          cargando={enviando}
          icono={paso === PASO_REVISAR ? Send : ArrowRight}
          iconoPosicion="derecha"
        >
          {etiquetaPrincipal}
        </BotonSistema>
      </div>
      {paso === PASO_REVISAR && (
        <TextoSistema variante="muted" tamaño="sm" className="text-center">
          Tus datos solo los ve el equipo de Niños de la iglesia.
        </TextoSistema>
      )}
    </form>
  )
}
