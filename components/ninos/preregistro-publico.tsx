'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, Mail, Phone, Plus, User, X } from 'lucide-react'

import {
  BotonSistema,
  InputSistema,
  SelectSistema,
  TarjetaSistema,
  TextoSistema,
  TituloSistema,
} from '@/components/ui/sistema-diseno'
import { hijoVacio, type AutorizadoForm, type HijoForm } from '@/lib/platform/ninos/familia'
import { aSalonSugerible, type SalonFila } from '@/lib/platform/ninos/familias-vista'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { LIMITES_PREREGISTRO, parsePreregistro } from '@/lib/platform/ninos/preregistro'

import { CamposAutorizados, CamposNino } from './campos-nino'

type Campus = { id: string; nombre: string }

/** An active room as read by the public page (no personal data). */
export type SalonPublico = SalonFila & { campus_id: string }

type Props = {
  campus: Campus[]
  /** From the QR (?campus=), when it names one of `campus`. */
  campusInicial?: string
  /** Active rooms of every campus listed: they give each child's level. */
  salones?: SalonPublico[]
}

type Padre = { nombre: string; apellido: string; telefono: string; email: string; cedula: string }

export const MENSAJE_LISTO = '¡Listo! Acércate a la mesa de check-in y di tu nombre.'

/** Public, no-login family pre-registration (N8). Shows nothing back but the confirmation. */
export function PreregistroPublico({ campus, campusInicial, salones = [] }: Props) {
  const unico = campus.length === 1 ? campus[0].id : ''
  const [campusId, setCampusId] = useState(campus.some((c) => c.id === campusInicial) ? (campusInicial as string) : unico)
  const [padre, setPadre] = useState<Padre>({ nombre: '', apellido: '', telefono: '', email: '', cedula: '' })
  const [hijos, setHijos] = useState<HijoForm[]>([hijoVacio()])
  const [autorizados, setAutorizados] = useState<AutorizadoForm[]>([])
  const [sitioWeb, setSitioWeb] = useState('')
  const [errores, setErrores] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(false)

  const set = (k: keyof Padre, v: string) => setPadre((p) => ({ ...p, [k]: v }))
  const salonesCampus = useMemo(() => salones.filter((s) => s.campus_id === campusId).map(aSalonSugerible), [salones, campusId])
  // A room belongs to one campus: changing the campus drops the rooms already chosen.
  const cambiarCampus = (id: string) => {
    setCampusId(id)
    setHijos((xs) => xs.map((h) => ({ ...h, salonPreferidoId: '' })))
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const body = { campusId, padre, hijos, autorizados, sitioWeb }
    const r = parsePreregistro(body, hoyEnCaracas())
    if (!r.ok) {
      setErrores(r.errores)
      return
    }
    setErrores([])
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
      const datos = (await res.json().catch(() => null)) as { errores?: string[] } | null
      setErrores(datos?.errores?.length ? datos.errores : ['No pudimos enviar tu registro. Intenta de nuevo.'])
    } catch {
      setErrores(['No pudimos enviar tu registro. Revisa tu conexión e intenta de nuevo.'])
    } finally {
      setEnviando(false)
    }
  }

  if (listo) {
    return (
      <TarjetaSistema variante="elevated" className="space-y-4 text-center" role="status">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" aria-hidden />
        <TituloSistema nivel={2}>{MENSAJE_LISTO}</TituloSistema>
        <TextoSistema variante="sutil">Un anfitrión revisará tus datos contigo antes de registrar a tus niños.</TextoSistema>
      </TarjetaSistema>
    )
  }

  return (
    <form onSubmit={enviar} noValidate className="space-y-6">
      <div className="space-y-2 text-center">
        <TituloSistema nivel={1}>Registro de familia</TituloSistema>
        <TextoSistema variante="sutil">Waumba Land y UpStreet · Llena tus datos y los de tus niños; en la mesa de check-in te confirmamos.</TextoSistema>
      </div>

      {campus.length > 1 && (
        <SelectSistema
          id="pre-campus"
          label="Campus"
          opciones={[{ valor: '', etiqueta: 'Elige…' }, ...campus.map((c) => ({ valor: c.id, etiqueta: c.nombre }))]}
          value={campusId}
          onValueChange={cambiarCampus}
        />
      )}

      <TarjetaSistema variante="elevated" className="space-y-4 p-4 sm:p-6">
        <TituloSistema nivel={3}>Tus datos</TituloSistema>
        <div className="grid gap-4 sm:grid-cols-2">
          <InputSistema id="pre-nombre" label="Tu nombre" icono={User} autoComplete="given-name" value={padre.nombre} onChange={(e) => set('nombre', e.target.value)} />
          <InputSistema id="pre-apellido" label="Tu apellido" icono={User} autoComplete="family-name" value={padre.apellido} onChange={(e) => set('apellido', e.target.value)} />
          <InputSistema id="pre-telefono" label="Teléfono" icono={Phone} type="tel" inputMode="tel" autoComplete="tel" value={padre.telefono} onChange={(e) => set('telefono', e.target.value)} />
          <InputSistema id="pre-email" label="Correo (opcional)" icono={Mail} type="email" autoComplete="email" value={padre.email} onChange={(e) => set('email', e.target.value)} />
          <InputSistema id="pre-cedula" label="Cédula (opcional)" inputMode="numeric" value={padre.cedula} onChange={(e) => set('cedula', e.target.value)} />
        </div>
        <TextoSistema variante="sutil" className="text-xs">
          Con tu correo te avisaremos cuando tus niños ingresen y salgan del salón.
        </TextoSistema>
      </TarjetaSistema>

      {hijos.map((h, i) => (
        <TarjetaSistema key={i} variante="elevated" className="space-y-4 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <TituloSistema nivel={3}>Niño {i + 1}</TituloSistema>
            {hijos.length > 1 && (
              <BotonSistema type="button" variante="ghost" tamaño="sm" icono={X} onClick={() => setHijos((xs) => xs.filter((_, j) => j !== i))}>
                Quitar
              </BotonSistema>
            )}
          </div>
          <CamposNino
            indice={i}
            hijo={h}
            onChange={(x) => setHijos((xs) => xs.map((y, j) => (j === i ? x : y)))}
            salones={salonesCampus}
            publico
          />
        </TarjetaSistema>
      ))}
      {hijos.length < LIMITES_PREREGISTRO.hijos && (
        <BotonSistema
          type="button"
          variante="outline"
          tamaño="sm"
          icono={Plus}
          onClick={() => setHijos((xs) => [...xs, { ...hijoVacio(), apellido: xs[0]?.apellido ?? '' }])}
        >
          Agregar otro niño
        </BotonSistema>
      )}

      <TarjetaSistema variante="elevated" className="space-y-4 p-4 sm:p-6">
        <TituloSistema nivel={3}>Personas autorizadas para retirar</TituloSistema>
        <CamposAutorizados autorizados={autorizados} onChange={setAutorizados} />
      </TarjetaSistema>

      {/* Honeypot: invisible to people and screen readers; bots fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="pre-sitio">Sitio web</label>
        <input id="pre-sitio" name="sitioWeb" type="text" tabIndex={-1} autoComplete="off" value={sitioWeb} onChange={(e) => setSitioWeb(e.target.value)} />
      </div>

      {errores.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
          {errores.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <BotonSistema type="submit" tamaño="lg" className="w-full" cargando={enviando}>
        Enviar registro
      </BotonSistema>
      <TextoSistema variante="muted" tamaño="sm" className="text-center">
        Tus datos solo los ve el equipo de Niños de la iglesia.
      </TextoSistema>
    </form>
  )
}
