'use client'

/**
 * Planner — "Nuevo grupo" of a lane (S3, S4; artboard 02, minimal). A side
 * panel with the free name and "Usar sugerencia" (sugerirNombre: "<Localidad>
 * <Segmento> - N" from the localidad chosen), the computed label, the
 * segment fixed to the lane, the localidad (a group without one blocks
 * publishing), day, hour, capacity and the directores de etapa: every eligible
 * one of the segment, a couple as one option (directoresElegibles). The new
 * group joins the session draft (S24) and shows on the board at once; it is
 * created on "Guardar". A refusal (a used name, a bad field) stays in the
 * form.
 */
import { useId, useState, type FormEvent, type ReactElement } from 'react'

import { PanelLateralSistema } from '@/components/ui/panel-lateral-sistema'
import { BotonSistema, InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { PastillaFiltro } from '@/components/ui/PastillasFiltro'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import {
  etiquetaGrupo,
  sugerirNombre,
  type GrupoTablero,
  type Localidad,
  type PersonaBanco,
  type SegmentoConDirectores,
  type SegmentoPlanner,
} from '@/lib/platform/grupos-vida/planner'
import { DIAS_REUNION, MAXIMO_DIRECTORES, type DatosGrupo, type ResultadoAccion } from '@/lib/platform/grupos-vida/planner/acciones'

import { directoresElegibles } from './modelo'

export interface PanelNuevoGrupoProps {
  readonly segmento: SegmentoPlanner | null
  readonly grupos: readonly GrupoTablero[]
  /** planner_temporadas.segmentos: each with its eligible directores de etapa. */
  readonly segmentos: readonly SegmentoConDirectores[]
  /** The bank by usuario_id, for the spouses. */
  readonly fichas: ReadonlyMap<string, PersonaBanco>
  readonly localidades: readonly Localidad[]
  readonly onCerrar: () => void
  readonly onCrear: (segmento: SegmentoPlanner, datos: DatosGrupo) => Promise<ResultadoAccion<unknown>>
}

const CAPACIDAD_INICIAL = '12'

function Formulario({
  segmento,
  grupos,
  segmentos,
  fichas,
  localidades,
  onCerrar,
  onCrear,
  idForm,
  onEnviando,
}: Omit<PanelNuevoGrupoProps, 'segmento'> & {
  readonly segmento: SegmentoPlanner
  readonly idForm: string
  readonly onEnviando: (enviando: boolean) => void
}): ReactElement {
  const [nombre, setNombre] = useState('')
  const [localidadId, setLocalidadId] = useState('')
  const [dia, setDia] = useState('Jueves')
  const [hora, setHora] = useState('19:30')
  const [capacidad, setCapacidad] = useState(CAPACIDAD_INICIAL)
  const [directores, setDirectores] = useState<readonly string[]>([])
  const [error, setError] = useState<string | null>(null)

  const localidad = localidades.find((l) => l.id === localidadId) ?? null
  const nombresDelSegmento = grupos.filter((g) => g.segmento_id === segmento.id).map((g) => g.nombre)
  const sugerido = sugerirNombre(localidad?.nombre ?? null, segmento.nombre, nombresDelSegmento)
  const etiqueta = etiquetaGrupo({ segmento_nombre: segmento.nombre, localidad_nombre: localidad?.nombre ?? null })
  const elegibles = directoresElegibles(
    segmentos.find((s) => s.id === segmento.id),
    fichas,
  )

  // A couple goes in or out together, and only when both fit in MAXIMO_DIRECTORES.
  const alternar = (usuarioIds: readonly string[]) =>
    setDirectores((d) =>
      usuarioIds.every((id) => d.includes(id))
        ? d.filter((x) => !usuarioIds.includes(x))
        : d.length + usuarioIds.filter((id) => !d.includes(id)).length <= MAXIMO_DIRECTORES
          ? [...d, ...usuarioIds.filter((id) => !d.includes(id))]
          : d,
    )

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    const cupo = Number(capacidad)
    onEnviando(true)
    setError(null)
    const resultado = await onCrear(segmento, {
      nombre,
      segmento_id: segmento.id,
      localidad_id: localidadId || null,
      dia_reunion: dia || null,
      hora_reunion: hora || null,
      capacidad_maxima: capacidad.trim() === '' ? null : cupo,
      director_etapa_ids: directores,
    })
    onEnviando(false)
    if (resultado.ok) onCerrar()
    else setError(resultado.mensaje)
  }

  return (
    <form id={idForm} onSubmit={enviar} className="space-y-5">
      <div className="space-y-2">
        <InputSistema label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} required autoComplete="off" />
        {sugerido ? (
          <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={() => setNombre(sugerido)}>
            Usar sugerencia: {sugerido}
          </BotonSistema>
        ) : (
          <p className="text-xs text-muted-foreground">Elige la localidad para sugerir un nombre</p>
        )}
        <p className="text-xs text-muted-foreground">
          Se verá como <span className={localidad ? 'text-foreground' : 'text-danger-text'}>{etiqueta}</span>
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        Segmento: <strong className="font-medium text-foreground">{segmento.nombre}</strong>
      </p>
      <div className="space-y-1">
        <SelectSistema
          label="Localidad"
          opciones={[{ valor: '', etiqueta: 'Sin localidad' }, ...localidades.map((l) => ({ valor: l.id, etiqueta: l.nombre }))]}
          value={localidadId}
          onValueChange={setLocalidadId}
        />
        {!localidad && <p className="text-xs text-danger-text">Un grupo sin localidad no deja publicar la temporada.</p>}
      </div>
      <div className="grid gap-3 @md:grid-cols-3">
        <SelectSistema
          label="Día"
          opciones={[{ valor: '', etiqueta: 'Sin día' }, ...DIAS_REUNION.map((d) => ({ valor: d, etiqueta: d }))]}
          value={dia}
          onValueChange={setDia}
        />
        <InputSistema label="Hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        <InputSistema label="Capacidad" type="number" inputMode="numeric" min={1} step={1} value={capacidad} onChange={(e) => setCapacidad(e.target.value)} className="font-mono tabular-nums" />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Director de etapa</p>
        {elegibles.length > 0 ? (
          <div role="group" aria-label="Directores de etapa" className="flex flex-wrap gap-2">
            {elegibles.map((d) => (
              <PastillaFiltro
                key={d.clave}
                etiqueta={d.nombre}
                activa={d.usuarioIds.every((id) => directores.includes(id))}
                onClick={() => alternar(d.usuarioIds)}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{segmento.nombre} no tiene directores de etapa todavía; puedes asignarlo después.</p>
        )}
        {directores.length === 0 && <p className="text-xs text-danger-text">Un grupo sin director de etapa no deja publicar la temporada.</p>}
      </div>
      {error && (
        <AvisoFormulario tono="error" className="py-3">
          {error}
        </AvisoFormulario>
      )}
    </form>
  )
}

export function PanelNuevoGrupo(props: PanelNuevoGrupoProps): ReactElement {
  const { segmento, onCerrar } = props
  const idForm = useId()
  const [enviando, setEnviando] = useState(false)
  return (
    <PanelLateralSistema
      abierto={segmento !== null}
      onAbiertoChange={(abierto) => !abierto && onCerrar()}
      titulo={segmento ? `Nuevo grupo de ${segmento.nombre}` : 'Nuevo grupo'}
      descripcion="Queda sin guardar hasta que toques «Guardar»."
      pie={
        <>
          <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={onCerrar}>
            Cancelar
          </BotonSistema>
          <BotonSistema type="submit" form={idForm} tamaño="sm" cargando={enviando}>
            Crear grupo
          </BotonSistema>
        </>
      }
    >
      {segmento && <Formulario key={segmento.id} {...props} segmento={segmento} idForm={idForm} onEnviando={setEnviando} />}
    </PanelLateralSistema>
  )
}
