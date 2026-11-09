'use client'

/**
 * Niños › Salones — «Nuevo salón» (`DetalleResponsivo`): the name and the
 * carpeta (only the areas the caller configures). The salón is created after
 * the last one of its carpeta with the default rules; its panel opens next to
 * set ages, quota and the rest.
 */
import { useId, useState, type FormEvent, type ReactElement } from 'react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { BotonSistema, InputSistema } from '@/components/ui/sistema-diseno'
import type { Resultado } from '@/lib/platform/ninos/eventos'
import { MAX_NOMBRE_SALON, NOMBRE_AREA, validarDatosSalon } from '@/lib/platform/ninos/salones-reglas'
import type { AreaSalon } from '@/lib/platform/ninos/sugerir-salon'

export function NuevoSalon({
  abierto,
  areas,
  onCerrar,
  onCrear,
}: {
  readonly abierto: boolean
  /** The carpetas where the caller may create a salón. */
  readonly areas: readonly AreaSalon[]
  readonly onCerrar: () => void
  readonly onCrear: (datos: { area: AreaSalon; nombre: string }) => Promise<Resultado<{ id: string }>>
}): ReactElement {
  const idForm = useId()
  const [nombre, setNombre] = useState('')
  const [area, setArea] = useState<AreaSalon>(areas[0] ?? 'waumba')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // Each opening starts blank.
  const [abiertoAntes, setAbiertoAntes] = useState(false)
  if (abierto !== abiertoAntes) {
    setAbiertoAntes(abierto)
    if (abierto) {
      setNombre('')
      setArea(areas[0] ?? 'waumba')
      setError(null)
    }
  }

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    const invalido = validarDatosSalon({ nombre, capacidad: 1, edadMinMeses: null, edadMaxMeses: null, gradoMin: null, gradoMax: null })
    if (invalido) {
      setError(invalido)
      return
    }
    setEnviando(true)
    const r = await onCrear({ area, nombre })
    setEnviando(false)
    if (r.ok) onCerrar()
    else setError(r.message)
  }

  return (
    <DetalleResponsivo
      abierto={abierto}
      onCambioAbierto={(a) => !a && !enviando && onCerrar()}
      titulo="Nuevo salón"
      descripcion="Elige el nombre y la carpeta. Las edades, el cupo y lo demás se ponen después."
      pie={
        <>
          <BotonSistema type="button" variante="outline" disabled={enviando} onClick={onCerrar}>
            Cancelar
          </BotonSistema>
          <BotonSistema type="submit" form={idForm} cargando={enviando} disabled={enviando}>
            Crear salón
          </BotonSistema>
        </>
      }
    >
      <form id={idForm} onSubmit={enviar} noValidate className="grid gap-5">
        <InputSistema
          label="Nombre del salón"
          value={nombre}
          maxLength={MAX_NOMBRE_SALON}
          placeholder="Ejemplo: Preescolar IV"
          onChange={(e) => setNombre(e.target.value)}
          required
        />
        {areas.length > 1 && (
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium text-foreground">Carpeta</legend>
            <ControlSegmentado
              etiqueta="Carpeta"
              opciones={areas.map((a) => ({ valor: a, etiqueta: NOMBRE_AREA[a] }))}
              valor={area}
              onCambio={setArea}
              className="flex [&>button]:flex-1"
            />
          </fieldset>
        )}
        <p className="text-[13px] text-muted-foreground">
          Queda abierto, al final de {NOMBRE_AREA[area]}, con cupo de 20 regulares y sin puestos de visitantes.
        </p>
        {error && <AvisoFormulario tono="error">{error}</AvisoFormulario>}
      </form>
    </DetalleResponsivo>
  )
}
