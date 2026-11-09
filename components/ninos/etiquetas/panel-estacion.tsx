'use client'

/**
 * Niños › Etiquetas — the station form inside the detail panel (T3b, S10
 * "Otra medida, la configuro en la estación"): name, label width and height
 * in mm (both empty = 102 × 51 mm, the 4B-2054N roll; the labels fit the
 * size), resolution and, when editing, active and «Crear token nuevo» (asks
 * first: the agent with the old token stops). Checks the same ranges as the
 * database before calling; the RPC's refusal is said in the panel.
 */
import { useId, useState, type FormEvent, type ReactElement } from 'react'
import { KeyRound } from 'lucide-react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { Interruptor } from '@/components/ui/interruptor'
import { BotonSistema, InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import {
  MAX_NOMBRE_ESTACION,
  validarMedidas,
  validarNombreEstacion,
  type EstacionVista,
  type Medidas,
} from '@/lib/platform/ninos/impresion-vista'

const OPCIONES_DPI = [
  { valor: '203', etiqueta: '203 dpi (4B-2054N)' },
  { valor: '300', etiqueta: '300 dpi' },
]

const enTexto = (n: number | null) => (n === null ? '' : String(n).replace('.', ','))

export type DatosEstacion = { readonly nombre: string; readonly activa: boolean } & Medidas

export interface PanelEstacionProps {
  /** null = a new station. */
  readonly estacion: EstacionVista | null
  readonly guardando: boolean
  readonly error: string | null
  readonly onGuardar: (d: DatosEstacion) => void
  readonly onRotarToken?: () => void
  readonly onInvalido: (mensaje: string) => void
}

export function PanelEstacion({ estacion, guardando, error, onGuardar, onRotarToken, onInvalido }: PanelEstacionProps): ReactElement {
  const id = useId()
  const [nombre, setNombre] = useState(estacion?.nombre ?? '')
  const [ancho, setAncho] = useState(enTexto(estacion?.anchoMm ?? null))
  const [alto, setAlto] = useState(enTexto(estacion?.altoMm ?? null))
  const [dpi, setDpi] = useState(String(estacion?.dpi ?? 203))
  const [activa, setActiva] = useState(estacion?.activa ?? true)
  const [confirmarToken, setConfirmarToken] = useState(false)
  const [invalido, setInvalido] = useState<string | null>(null)

  function enviar(e: FormEvent) {
    e.preventDefault()
    const sinNombre = validarNombreEstacion(nombre)
    const medidas = validarMedidas({ ancho, alto, dpi })
    const mensaje = sinNombre ?? (medidas.ok ? null : medidas.message)
    setInvalido(mensaje)
    if (mensaje || !medidas.ok) {
      if (mensaje) onInvalido(mensaje)
      return
    }
    onGuardar({ nombre: nombre.trim(), anchoMm: medidas.anchoMm, altoMm: medidas.altoMm, dpi: medidas.dpi, activa })
  }

  const aviso = invalido ?? error

  return (
    <div className="grid min-w-0 gap-6">
      <form id={`${id}-form`} className="grid min-w-0 gap-4" onSubmit={enviar} noValidate>
        <InputSistema label="Nombre" value={nombre} maxLength={MAX_NOMBRE_ESTACION} placeholder="Mesa 1 · Waumba Land" onChange={(e) => setNombre(e.target.value)} />
        <fieldset className="grid min-w-0 gap-2">
          <legend className="mb-1 text-sm font-medium text-foreground">Medida de la etiqueta</legend>
          <div className="grid min-w-0 grid-cols-2 gap-3">
            <InputSistema label="Ancho (mm)" inputMode="decimal" value={ancho} placeholder="102" onChange={(e) => setAncho(e.target.value)} />
            <InputSistema label="Alto (mm)" inputMode="decimal" value={alto} placeholder="51" onChange={(e) => setAlto(e.target.value)} />
          </div>
          <p className="text-[13px] text-muted-foreground">Déjalos vacíos para imprimir a 102 × 51 mm, el rollo de la 4B-2054N.</p>
        </fieldset>
        <SelectSistema label="Resolución" opciones={OPCIONES_DPI} value={dpi} onValueChange={setDpi} />
        {estacion && (
          <div className="flex min-w-0 items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">Activa</span>
              <span className="block text-[13px] text-muted-foreground">Una estación desactivada no recibe etiquetas y su agente no se conecta.</span>
            </span>
            <Interruptor activo={activa} onCambio={setActiva} aria-label="Estación activa" />
          </div>
        )}
        {aviso && <AvisoFormulario tono="error">{aviso}</AvisoFormulario>}
        <BotonSistema type="submit" className="w-full" cargando={guardando} disabled={guardando}>
          {estacion ? 'Guardar cambios' : 'Crear estación'}
        </BotonSistema>
      </form>

      {estacion && onRotarToken && (
        <section aria-labelledby={`${id}-token`} className="grid min-w-0 gap-2 border-t border-border pt-4">
          <h3 id={`${id}-token`} className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Token del agente
          </h3>
          <p className="text-[13px] text-muted-foreground">
            Si se perdió el token o cambiaste de laptop, crea uno nuevo y pégalo en el agente.
          </p>
          {confirmarToken ? (
            <div className="grid min-w-0 gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3">
              <p className="text-sm text-foreground">El agente que usa el token actual deja de imprimir hasta que le pongas el nuevo.</p>
              <div className="flex flex-wrap gap-2">
                <BotonSistema type="button" variante="outline" tamaño="sm" className="pointer-coarse:min-h-11" onClick={() => setConfirmarToken(false)}>
                  Cancelar
                </BotonSistema>
                <BotonSistema
                  type="button"
                  tamaño="sm"
                  className="pointer-coarse:min-h-11"
                  cargando={guardando}
                  disabled={guardando}
                  onClick={() => {
                    setConfirmarToken(false)
                    onRotarToken()
                  }}
                >
                  Sí, crear token nuevo
                </BotonSistema>
              </div>
            </div>
          ) : (
            <BotonSistema type="button" variante="outline" icono={KeyRound} className="self-start" onClick={() => setConfirmarToken(true)}>
              Crear token nuevo
            </BotonSistema>
          )}
        </section>
      )}
    </div>
  )
}
