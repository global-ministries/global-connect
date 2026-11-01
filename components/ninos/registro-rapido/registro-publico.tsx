'use client'

/**
 * Public, no-login family pre-registration (/ninos/registro) as one scrolling
 * page (odd/tasks/ninos-v2.md N4b, prototype 01): Tú · Tus niños · ¿Quién los
 * retira? · Para después. Complete sections fold to one line; the sticky bar
 * says what is missing. It posts to /api/ninos/preregistro (rate limit and
 * campus from the QR unchanged), now with the parent's género (S6), then
 * offers "¿Vienen hoy?" when a service of today takes notices. It never links
 * to /signup: the account invitation is sent when the table confirms.
 */
import { useState, type FormEvent, type ReactNode } from 'react'
import { Send } from 'lucide-react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { BotonSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import type { SalonNivel } from '@/lib/platform/ninos/nivel'
import { LIMITES_PREREGISTRO, parsePreregistro } from '@/lib/platform/ninos/preregistro'
import { parseAvisoPreregistro, type AvisoPreregistro } from '@/lib/platform/ninos/preregistro-aviso'
import { cuerpoPublico, datosIniciales, personasRetiran } from '@/lib/platform/ninos/registro-rapido'

import { PasoVienenHoy } from '../registro/paso-vienen-hoy'
import { ExitoPublico } from './exito-publico'
import { EstadoEnvio, ResumenFaltantes } from './piezas'
import { SeccionesRegistro } from './secciones-registro'
import { useFormularioRapido } from './use-formulario-rapido'

type Campus = { id: string; nombre: string }

type Props = {
  campus: Campus[]
  /** From the QR (?campus=), when it names one of `campus`. */
  campusInicial?: string
  /** Active salones of every campus, to show each child's salón live. */
  salones?: readonly (SalonNivel & { campusId: string })[]
  /** Secondary line under the title (the sign-in link for account holders). */
  aviso?: ReactNode
}

const MENSAJE_LIMITE = 'Hay muchos registros en este momento. Espera unos minutos y toca «Enviar registro» otra vez; tus datos siguen aquí.'
const MENSAJE_SERVIDOR = 'Tuvimos un problema al enviar. Intenta de nuevo en un momento; tus datos siguen aquí.'
const MENSAJE_RED = 'No pudimos enviar tu registro. Revisa tu conexión y toca «Enviar registro» otra vez; tus datos siguen aquí.'

export function RegistroPublico({ campus, campusInicial, salones = [], aviso }: Props) {
  const campusIds = campus.map((c) => c.id)
  const inicial = campusIds.includes(campusInicial ?? '') ? (campusInicial as string) : campus.length === 1 ? campus[0].id : ''
  const [hoy] = useState(hoyEnCaracas)
  const [campusIdsFijos] = useState(campusIds)
  const form = useFormularioRapido(() => datosIniciales({ campusId: inicial }), { modo: 'publico', hoy, campusIds: campusIdsFijos })
  const { datos } = form
  const [sitioWeb, setSitioWeb] = useState('')
  const [errorEnvio, setErrorEnvio] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(false)
  /** The "¿Vienen hoy?" offer of the create answer (null: no service open today). */
  const [oferta, setOferta] = useState<AvisoPreregistro | null>(null)
  /** undefined while the offer is open; then the chosen service's label, or null when skipped. */
  const [llegada, setLlegada] = useState<string | null | undefined>(undefined)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (enviando || !form.intentar()) return
    const body = cuerpoPublico(datos, sitioWeb)
    const r = parsePreregistro(body, hoy)
    if (!r.ok) {
      setErrorEnvio(r.errores)
      return
    }
    setErrorEnvio([])
    setEnviando(true)
    try {
      const res = await fetch('/api/ninos/preregistro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.ok) {
        setOferta(parseAvisoPreregistro(await res.json().catch(() => null)))
        setListo(true)
        return
      }
      if (res.status === 429) {
        setErrorEnvio([MENSAJE_LIMITE])
        return
      }
      const respuesta = (await res.json().catch(() => null)) as { errores?: string[] } | null
      // The server answered, so the connection is fine: only a thrown fetch means "network".
      setErrorEnvio(respuesta?.errores?.length ? respuesta.errores : [MENSAJE_SERVIDOR])
    } catch {
      setErrorEnvio([MENSAJE_RED])
    } finally {
      setEnviando(false)
    }
  }

  if (listo && oferta && llegada === undefined) return <PasoVienenHoy aviso={oferta} onTerminar={setLlegada} />
  if (listo) {
    const nombres = (xs: readonly { nombre: string }[]) => xs.map((x) => x.nombre.trim().split(/\s+/)[0]).filter(Boolean)
    return (
      <ExitoPublico
        ninos={nombres(datos.hijos)}
        otrosRetiran={nombres(personasRetiran(datos, form.contexto).slice(1))}
        conCorreo={datos.padre.email.trim() !== ''}
        llegada={llegada ?? null}
      />
    )
  }

  return (
    <form onSubmit={enviar} noValidate className="grid min-w-0 flex-1 content-start gap-5">
      <header className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-text">Waumba Land · UpStreet</p>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-foreground sm:text-[34px]">Registra a tu familia</h1>
        <TextoSistema variante="sutil">Una sola página, unos 2 minutos. Lo de hoy primero; lo demás lo completas después.</TextoSistema>
        {aviso}
      </header>

      <SeccionesRegistro
        form={form}
        modo="publico"
        hoy={hoy}
        campus={campus}
        salones={salones.filter((s) => s.campusId === datos.campusId)}
        maximoHijos={LIMITES_PREREGISTRO.hijos}
        maximoAutorizados={LIMITES_PREREGISTRO.autorizados}
      />

      {/* Honeypot: invisible to people and screen readers; bots fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="pre-sitio">Sitio web</label>
        <input id="pre-sitio" name="sitioWeb" type="text" tabIndex={-1} autoComplete="off" value={sitioWeb} onChange={(e) => setSitioWeb(e.target.value)} />
      </div>

      {form.intentado && <ResumenFaltantes faltan={form.faltan} sufijo=" antes de enviar" />}
      {errorEnvio.length > 0 && (
        <AvisoFormulario tono="error">
          <ul className="grid gap-1">
            {errorEnvio.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </AvisoFormulario>
      )}

      {/* Sticky send bar on phones, with room for the home indicator. */}
      <div className="sticky bottom-0 z-10 -mx-4 grid gap-2 border-t border-border bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:mx-0 sm:rounded-2xl sm:border sm:px-4">
        <EstadoEnvio estado={form.estado} />
        <BotonSistema type="submit" tamaño="lg" className="w-full" cargando={enviando} icono={Send} iconoPosicion="derecha">
          Enviar registro
        </BotonSistema>
      </div>
      <TextoSistema variante="muted" tamaño="sm" className="text-center">
        Tus datos solo los ve el equipo de Niños de la iglesia.
      </TextoSistema>
    </form>
  )
}
