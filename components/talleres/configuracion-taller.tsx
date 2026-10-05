'use client'

/**
 * T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the taller
 * page's "Configuración" section: tipo, vínculo (only for tipo=pareja),
 * régimen, cierre de inscripción (relative to the first clase) and
 * intervalo entre ediciones (only for régimen=cadencia), plus the
 * cadencia_dias/duracion_minutos fields MOVED here from the old Clases
 * section (PlantillaClasesSection keeps only its clases list now).
 *
 * Two independent server actions, mirroring how this taller page already
 * splits its mutations by concern (cabecera vs. plantilla): the five
 * configuration fields save through `updateTallerConfiguracion` in one
 * call, cadencia/duración keep saving through the PRE-EXISTING
 * `updateCadenciaYDuracion` (unchanged — only its UI location moved).
 *
 * Edit controls only render when `puedeEditar` (permisos.editarTaller —
 * the page decides, this component never re-derives a capability), same
 * as every other taller-page section.
 *
 * Cierre de edición (odd/tasks/talleres-cierre-de-edicion.md T2) — adds
 * "Clases mínimas para completar" to the same `updateTallerConfiguracion`
 * save: the completion rule talleres_cerrar_edicion applies when a
 * director closes an edición. An empty field is sent as null and means
 * every clase dictada.
 *
 * Ficha nueva del cónyuge (odd/tasks/talleres-conyuge-invitacion.md C2) —
 * couple talleres also choose when a partner ficha created at enrollment
 * gets its access email: al aprobar (default) or al inscribirse.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'

import { BotonSistema, InputSistema, SelectSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import {
  cierreRelativoLabel,
  regimenLabel,
  tipoTallerLabel,
  vinculoLabel,
} from '@/components/talleres/labels'
import { updateCadenciaYDuracion, updateTallerConfiguracion } from '@/app/(auth)/talleres/[taller]/actions'

export interface ConfiguracionTallerProps {
  readonly tallerId: string
  readonly tallerSlug: string
  readonly tipo: 'individual' | 'pareja'
  readonly vinculo: 'matrimonio' | 'novios' | null
  readonly regimen: 'temporada' | 'cadencia'
  readonly cierreInscripcionOffsetDias: number
  readonly intervaloEdicionesDias: number | null
  /** null = todas las clases dictadas. */
  readonly clasesMinimasParaCompletar: number | null
  /** talleres.momento_envio_acceso; defaults to 'al_aprobar'. */
  readonly momentoEnvioAcceso?: MomentoEnvioAcceso
  readonly cadenciaDias: number
  readonly duracionMinutos: number | null
  readonly puedeEditar: boolean
}

type MomentoEnvioAcceso = 'al_aprobar' | 'al_inscribirse'

const MOMENTO_ENVIO_LABEL: Record<MomentoEnvioAcceso, string> = {
  al_aprobar: 'Al aprobar',
  al_inscribirse: 'Al inscribirse',
}

const REGIMEN_EXPLICACION: Record<'temporada' | 'cadencia', string> = {
  temporada: 'Las ediciones de este taller se agrupan en las temporadas de tu dirección.',
  cadencia: 'Las ediciones de este taller se crean por su propia cadencia, sin depender de una temporada.',
}

export function ConfiguracionTaller({
  tallerId,
  tallerSlug,
  tipo,
  vinculo,
  regimen,
  cierreInscripcionOffsetDias,
  intervaloEdicionesDias,
  clasesMinimasParaCompletar,
  momentoEnvioAcceso = 'al_aprobar',
  cadenciaDias,
  duracionMinutos,
  puedeEditar,
}: ConfiguracionTallerProps): ReactElement {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [tipoSel, setTipoSel] = useState<'individual' | 'pareja'>(tipo)
  const [vinculoSel, setVinculoSel] = useState<'matrimonio' | 'novios' | ''>(vinculo ?? '')
  const [regimenSel, setRegimenSel] = useState<'temporada' | 'cadencia'>(regimen)
  const [cierreSel, setCierreSel] = useState(String(cierreInscripcionOffsetDias))
  const [intervaloSel, setIntervaloSel] = useState(
    intervaloEdicionesDias !== null ? String(intervaloEdicionesDias) : '',
  )
  const [clasesMinimasSel, setClasesMinimasSel] = useState(
    clasesMinimasParaCompletar !== null ? String(clasesMinimasParaCompletar) : '',
  )

  const [momentoSel, setMomentoSel] = useState<MomentoEnvioAcceso>(momentoEnvioAcceso)

  const [cadencia, setCadencia] = useState(String(cadenciaDias))
  const [duracion, setDuracion] = useState(duracionMinutos !== null ? String(duracionMinutos) : '')

  function guardarConfiguracion(): void {
    setError(null)
    const cierreNum = Number(cierreSel)
    const intervaloNum = intervaloSel.trim() === '' ? null : Number(intervaloSel)
    const clasesMinimasNum = clasesMinimasSel.trim() === '' ? null : Number(clasesMinimasSel)
    startTransition(async () => {
      const result = await updateTallerConfiguracion({
        tallerId,
        tallerSlug,
        tipo: tipoSel,
        vinculo: tipoSel === 'pareja' && vinculoSel !== '' ? vinculoSel : null,
        regimen: regimenSel,
        cierreInscripcionOffsetDias: cierreNum,
        intervaloEdicionesDias: intervaloNum,
        clasesMinimasParaCompletar: clasesMinimasNum,
        ...(tipoSel === 'pareja' ? { momentoEnvioAcceso: momentoSel } : {}),
      })
      if (result.ok) {
        router.refresh()
      } else {
        setError(result.message)
      }
    })
  }

  function guardarCadencia(): void {
    setError(null)
    const cadenciaNum = Number(cadencia)
    const duracionNum = duracion.trim() === '' ? null : Number(duracion)
    startTransition(async () => {
      const result = await updateCadenciaYDuracion({
        tallerId,
        tallerSlug,
        cadenciaDias: cadenciaNum,
        duracionMinutos: duracionNum,
      })
      if (result.ok) {
        router.refresh()
      } else {
        setError(result.message)
      }
    })
  }

  const cierreNumParaLabel = Number(cierreSel)

  return (
    <section aria-labelledby="configuracion-heading">
      <TituloSistema nivel={2} id="configuracion-heading">
        Configuración
      </TituloSistema>

      {error && (
        <TextoSistema role="alert" className="mt-3 block text-destructive">
          {error}
        </TextoSistema>
      )}

      {puedeEditar ? (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <SelectSistema
            label="Tipo"
            value={tipoSel}
            onValueChange={(v) => {
              const value = v as 'individual' | 'pareja'
              setTipoSel(value)
              if (value === 'individual') setVinculoSel('')
            }}
            opciones={[
              { valor: 'individual', etiqueta: 'Individual' },
              { valor: 'pareja', etiqueta: 'Parejas' },
            ]}
          />

          {tipoSel === 'pareja' && (
            <SelectSistema
              label="Vínculo"
              value={vinculoSel}
              onValueChange={(v) => setVinculoSel(v as 'matrimonio' | 'novios' | '')}
              placeholder="— Cualquiera —"
              opciones={[
                { valor: 'matrimonio', etiqueta: 'Matrimonios' },
                { valor: 'novios', etiqueta: 'Novios' },
              ]}
            />
          )}

          {tipoSel === 'pareja' && (
            <SelectSistema
              label="Envío del acceso al cónyuge nuevo"
              value={momentoSel}
              onValueChange={(v) => setMomentoSel(v as MomentoEnvioAcceso)}
              opciones={[
                { valor: 'al_aprobar', etiqueta: MOMENTO_ENVIO_LABEL.al_aprobar },
                { valor: 'al_inscribirse', etiqueta: MOMENTO_ENVIO_LABEL.al_inscribirse },
              ]}
            />
          )}

          <div>
            <SelectSistema
              label="Régimen"
              value={regimenSel}
              onValueChange={(v) => setRegimenSel(v as 'temporada' | 'cadencia')}
              opciones={[
                { valor: 'temporada', etiqueta: 'Por temporada de la dirección' },
                { valor: 'cadencia', etiqueta: 'Por cadencia propia' },
              ]}
            />
            <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
              {REGIMEN_EXPLICACION[regimenSel]}
            </TextoSistema>
          </div>

          <div>
            <InputSistema
              label="Cierre de inscripción (días relativos a la primera clase)"
              type="number"
              min={-60}
              max={60}
              value={cierreSel}
              onChange={(e) => setCierreSel(e.target.value)}
            />
            <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
              {Number.isFinite(cierreNumParaLabel) ? cierreRelativoLabel(cierreNumParaLabel) : ''}
            </TextoSistema>
          </div>

          {regimenSel === 'cadencia' && (
            <div>
              <InputSistema
                label="Intervalo entre ediciones (días)"
                type="number"
                min={1}
                max={365}
                value={intervaloSel}
                onChange={(e) => setIntervaloSel(e.target.value)}
                placeholder="Sin intervalo"
              />
              <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
                28 = mensual
              </TextoSistema>
            </div>
          )}

          <div>
            <InputSistema
              label="Clases mínimas para completar"
              type="number"
              min={1}
              max={50}
              value={clasesMinimasSel}
              onChange={(e) => setClasesMinimasSel(e.target.value)}
              placeholder="Todas"
            />
            <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
              Vacío = todas las clases dictadas
            </TextoSistema>
          </div>

          <div className="md:col-span-2">
            <BotonSistema type="button" variante="outline" tamaño="sm" onClick={guardarConfiguracion}>
              Guardar configuración
            </BotonSistema>
          </div>

          <InputSistema
            label="Cada N días"
            type="number"
            min={1}
            value={cadencia}
            onChange={(e) => setCadencia(e.target.value)}
            className="w-28"
          />
          <InputSistema
            label="Duración (min)"
            type="number"
            min={1}
            value={duracion}
            onChange={(e) => setDuracion(e.target.value)}
            className="w-28"
          />
          <div className="md:col-span-2">
            <BotonSistema type="button" variante="outline" tamaño="sm" onClick={guardarCadencia}>
              Guardar cadencia
            </BotonSistema>
          </div>
        </div>
      ) : (
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Campo titulo="Tipo">{tipoTallerLabel(tipo)}</Campo>
          {tipo === 'pareja' && <Campo titulo="Vínculo">{vinculoLabel(vinculo)}</Campo>}
          {tipo === 'pareja' && (
            <Campo titulo="Envío del acceso al cónyuge nuevo">{MOMENTO_ENVIO_LABEL[momentoEnvioAcceso]}</Campo>
          )}
          <Campo titulo="Régimen">{regimenLabel(regimen)}</Campo>
          <Campo titulo="Cierre de inscripción">{cierreRelativoLabel(cierreInscripcionOffsetDias)}</Campo>
          {regimen === 'cadencia' && intervaloEdicionesDias !== null && (
            <Campo titulo="Intervalo entre ediciones">{`Cada ${intervaloEdicionesDias} días`}</Campo>
          )}
          <Campo titulo="Clases mínimas para completar">
            {clasesMinimasLabel(clasesMinimasParaCompletar)}
          </Campo>
          <Campo titulo="Cadencia y duración">
            {`Cada ${cadenciaDias} días${duracionMinutos !== null ? ` · Duración ${duracionMinutos} min` : ''}`}
          </Campo>
        </dl>
      )}
    </section>
  )
}

function clasesMinimasLabel(clasesMinimas: number | null): string {
  if (clasesMinimas === null) return 'Todas las clases dictadas'
  return `${clasesMinimas} ${clasesMinimas === 1 ? 'clase' : 'clases'}`
}

function Campo({ titulo, children }: { readonly titulo: string; readonly children: string }): ReactElement {
  return (
    <div>
      <TextoSistema variante="sutil" tamaño="sm" className="block uppercase tracking-wide">
        {titulo}
      </TextoSistema>
      <TextoSistema className="mt-1 block">{children}</TextoSistema>
    </div>
  )
}
