'use client'

/**
 * Dream Team — the "Registrar persona nueva" fields of the assign panel (T7/T9).
 *
 * Controlled: the panel owns the values and sends them, with the equipo and
 * rol of step 2, to POST /api/dream-team/usuarios on the last step (one
 * transaction creates the person and their servicio). The fields are split
 * into "Datos básicos" (required, except the cedula: without it the birth
 * date is required so the database can spot duplicates), a collapsed "Más
 * datos (opcional)" and "Representante (opcional)", opened by itself for a
 * minor. The representative (padre/madre, tutor, abuelo/a, tío/a, hermano/a
 * mayor or another relative) is found by cedula and only linked; their cedula
 * is never stored on the child.
 */
import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { BotonSistema, InputSistema, SelectSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import type { useNotificaciones } from '@/hooks/use-notificaciones'
import {
  ESTADOS_CIVILES,
  GENEROS,
  TIPO_REPRESENTANTE_LABELS,
  TIPOS_REPRESENTANTE,
  type TipoRepresentante,
} from '@/lib/platform/dream-team/alta-persona'
import { esMenorDeEdad, type DatosPersonaNueva, type RepresentanteElegido } from './logica'

export interface DatosPersonaNuevaProps {
  readonly valor: DatosPersonaNueva
  readonly onCambio: (valor: DatosPersonaNueva) => void
  readonly toast: ReturnType<typeof useNotificaciones>
}

const opciones = (valores: readonly string[]) => valores.map((v) => ({ valor: v, etiqueta: v }))

function Seccion({
  titulo,
  abierta,
  onAbrir,
  children,
}: {
  readonly titulo: string
  readonly abierta: boolean
  readonly onAbrir: (abierta: boolean) => void
  readonly children: ReactNode
}): ReactElement {
  return (
    <Collapsible open={abierta} onOpenChange={onAbrir} className="rounded-md border border-border">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {titulo}
        <ChevronDown aria-hidden="true" className={`size-4 transition-transform ${abierta ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-3 border-t border-border p-3">{children}</CollapsibleContent>
    </Collapsible>
  )
}

export function DatosPersonaNuevaCampos({ valor, onCambio, toast }: DatosPersonaNuevaProps): ReactElement {
  const cambiar = <K extends keyof DatosPersonaNueva>(campo: K, v: DatosPersonaNueva[K]) =>
    onCambio({ ...valor, [campo]: v })

  const menor = esMenorDeEdad(valor.fechaNacimiento)
  const [masDatos, setMasDatos] = useState(false)
  const [conRepresentante, setConRepresentante] = useState(valor.representante !== null)
  useEffect(() => {
    if (menor) setConRepresentante(true)
  }, [menor])

  const [cedulaRep, setCedulaRep] = useState('')
  const [buscandoRep, setBuscandoRep] = useState(false)
  const [repNoEncontrado, setRepNoEncontrado] = useState(false)

  const sinCedula = valor.cedula.trim() === ''

  async function buscarRepresentante(): Promise<void> {
    if (cedulaRep.trim() === '' || buscandoRep) return
    setBuscandoRep(true)
    setRepNoEncontrado(false)
    try {
      const res = await fetch(`/api/dream-team/usuarios/cedula?cedula=${encodeURIComponent(cedulaRep.trim())}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('lookup failed')
      const { persona } = (await res.json()) as { persona: RepresentanteElegido | null }
      cambiar('representante', persona)
      setRepNoEncontrado(persona === null)
    } catch {
      toast.error('No se pudo buscar al representante.')
    } finally {
      setBuscandoRep(false)
    }
  }

  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium">Datos básicos</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <InputSistema label="Nombre" value={valor.nombre} onChange={(e) => cambiar('nombre', e.target.value)} />
          <InputSistema label="Apellido" value={valor.apellido} onChange={(e) => cambiar('apellido', e.target.value)} />
          <InputSistema
            label="Cédula (opcional)"
            inputMode="numeric"
            value={valor.cedula}
            onChange={(e) => cambiar('cedula', e.target.value)}
          />
          <InputSistema
            label={sinCedula ? 'Fecha de nacimiento' : 'Fecha de nacimiento (opcional)'}
            type="date"
            value={valor.fechaNacimiento}
            onChange={(e) => cambiar('fechaNacimiento', e.target.value)}
          />
          <SelectSistema
            label="Género"
            opciones={opciones(GENEROS)}
            placeholder="Elige el género"
            value={valor.genero}
            onValueChange={(v) => cambiar('genero', v)}
          />
          <SelectSistema
            label="Estado civil"
            opciones={opciones(ESTADOS_CIVILES)}
            value={valor.estadoCivil}
            onValueChange={(v) => cambiar('estadoCivil', v)}
          />
        </div>
        {sinCedula && (
          <TextoSistema variante="sutil" tamaño="sm">
            Sin cédula, la fecha de nacimiento es requerida para no duplicar personas.
          </TextoSistema>
        )}
      </fieldset>

      <Seccion titulo="Más datos (opcional)" abierta={masDatos} onAbrir={setMasDatos}>
        <div className="grid gap-3 sm:grid-cols-2">
          <InputSistema
            label="Teléfono (opcional)"
            type="tel"
            value={valor.telefono}
            onChange={(e) => cambiar('telefono', e.target.value)}
          />
          <SelectSistema
            label="Bautizado (opcional)"
            opciones={[{ valor: 'si', etiqueta: 'Sí' }, { valor: 'no', etiqueta: 'No' }]}
            placeholder="Sin dato"
            value={valor.bautizado}
            onValueChange={(v) => cambiar('bautizado', v)}
          />
          {valor.bautizado === 'si' && (
            <InputSistema
              label="Fecha de bautizo (opcional)"
              type="date"
              value={valor.fechaBautizo}
              onChange={(e) => cambiar('fechaBautizo', e.target.value)}
            />
          )}
          <InputSistema
            label="Talla de franela (opcional)"
            value={valor.tallaFranela}
            onChange={(e) => cambiar('tallaFranela', e.target.value)}
          />
          <InputSistema
            label="Redes sociales (opcional)"
            value={valor.redesSociales}
            onChange={(e) => cambiar('redesSociales', e.target.value)}
          />
        </div>
      </Seccion>

      <Seccion titulo="Representante (opcional)" abierta={conRepresentante} onAbrir={setConRepresentante}>
        <TextoSistema variante="sutil" tamaño="sm">
          {menor ? 'Es menor de edad: vincula a su familiar o tutor.' : 'Familiar o tutor, para menores de edad.'}
        </TextoSistema>
        {valor.representante ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
            <TextoSistema className="min-w-0 truncate">{`${valor.representante.nombre} ${valor.representante.apellido}`}</TextoSistema>
            <div className="flex items-center gap-2">
              <SelectSistema
                aria-label="Tipo de representante"
                opciones={TIPOS_REPRESENTANTE.map((t) => ({ valor: t, etiqueta: TIPO_REPRESENTANTE_LABELS[t] }))}
                value={valor.tipoRepresentante}
                onValueChange={(v) => cambiar('tipoRepresentante', v as TipoRepresentante)}
              />
              <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={() => cambiar('representante', null)}>
                Quitar
              </BotonSistema>
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <InputSistema
                aria-label="Cédula del representante"
                placeholder="Cédula del representante"
                inputMode="numeric"
                value={cedulaRep}
                onChange={(e) => {
                  setCedulaRep(e.target.value)
                  setRepNoEncontrado(false)
                }}
              />
            </div>
            <BotonSistema
              type="button"
              variante="outline"
              tamaño="sm"
              disabled={cedulaRep.trim() === '' || buscandoRep}
              onClick={() => void buscarRepresentante()}
            >
              {buscandoRep ? 'Buscando…' : 'Buscar'}
            </BotonSistema>
          </div>
        )}
        {repNoEncontrado && (
          <TextoSistema variante="sutil" tamaño="sm" role="status">
            No hay nadie registrado con esa cédula.
          </TextoSistema>
        )}
      </Seccion>
    </div>
  )
}
