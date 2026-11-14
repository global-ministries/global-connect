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
 *
 * Mínimo de inscritos (odd/tasks/talleres-reserva-publica.md T8a, S9 S16) —
 * «Mínimo de inscritos para abrir» (MinimoInscritosCampo).
 *
 * Recuperar clase (odd/tasks/talleres-reserva-publica.md T8b, S17) — the
 * minimum reads «Clases mínimas para el certificado» (artboard 14) and the
 * «Recuperar clases aparte» switch (RecuperarClasesCampo) sits under it.
 *
 * T9 (same doc, S8, L16) — both are controlled fields of this form and save
 * with «Guardar configuración» (they had their own save before).
 *
 * Próximo Paso (odd/tasks/proximo-paso.md T1) — a régimen=cadencia taller
 * picks how its ediciones start: "Primer domingo de cada mes"
 * (talleres.ancla_ediciones) or "Cada N días" (the intervalo field, only
 * shown for that choice). Saved in the same `updateTallerConfiguracion`.
 *
 * Inscripción automática (odd/tasks/proximo-paso.md T2b, L6.2) — an
 * individual taller can approve each inscripción on the spot when the
 * edición has cupo (talleres.inscripcion_automatica, an `Interruptor`),
 * saved in the same `updateTallerConfiguracion`. Couples always wait for
 * the coordinación, so the switch is not offered to them.
 *
 * Registro por QR (odd/tasks/proximo-paso.md T2) — on Próximo Paso itself,
 * whoever edits the taller also gets its "Enlace de inscripción" (public
 * URL, copy and QR) for the announcement.
 *
 * R3d (odd/tasks/talleres-rediseno.md, S1, S2) — restyled after artboard
 * design/talleres-reserva/14: the editor groups its fields in «Inscripción»,
 * «Ediciones» and «Clases y certificado», with the one primary «Guardar
 * configuración» at the end; «Cadencia y duración» keeps its own save
 * (updateCadenciaYDuracion), as before. Same fields, labels and writes.
 *
 * R3k (odd/tasks/talleres-rediseno.md, S1, S4, L10) — the configuration is its
 * own view now (app/(auth)/talleres/[taller]/configuracion, artboard 14), so
 * this component no longer titles itself: the view does. The four sections
 * (Inscripción, Ediciones, Clases y certificado, Cadencia y duración) are
 * cards in SeccionesSistema, and ONE «Guardar configuración» in the
 * PieAccionesSistema saves everything: updateTallerConfiguracion always, and
 * the existing updateCadenciaYDuracion only when cadencia or duración changed;
 * each failed action reports its own error. Numeric fields use the normal
 * font and the full field width (the «Mínimo de inscritos» input is inlined
 * here for that, with the same label, limits, placeholder and NOTA_MINIMO as
 * MinimoInscritosCampo, which still renders the read-only value). The
 * Próximo Paso «Enlace de inscripción» moved to the taller page's «Página
 * pública» card (components/talleres/taller/enlace-proximo-paso.tsx).
 *
 * R3l (odd/tasks/talleres-rediseno.md, L11) — Temporadas is hidden from
 * Talleres: no Régimen selector. A cadencia taller (all of them in
 * production) just shows «Inicio de cada edición»; a taller still on
 * régimen=temporada shows «Este taller está en régimen por temporada.» and
 * its régimen is saved as it is — never changed silently.
 */

import { useState, useTransition, type ReactElement, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'

import { Interruptor } from '@/components/ui/interruptor'
import {
  BotonSistema,
  CamposSistema,
  InputSistema,
  PieAccionesSistema,
  SeccionesSistema,
  SelectSistema,
  TarjetaSistema,
  TextoSistema,
  TituloSistema,
} from '@/components/ui/sistema-diseno'
import { cierreRelativoLabel, tipoTallerLabel, vinculoLabel } from '@/components/talleres/labels'
import { updateCadenciaYDuracion, updateTallerConfiguracion } from '@/app/(auth)/talleres/[taller]/actions'
import { MinimoInscritosCampo, NOTA_MINIMO } from '@/components/talleres/minimo/minimo-inscritos-campo'
import { RecuperarClasesCampo } from '@/components/talleres/recuperar/recuperar-clases-campo'
import type { AnclaEdiciones } from '@/lib/platform/talleres/ancla-ediciones'

export interface ConfiguracionTallerProps {
  readonly tallerId: string
  readonly tallerSlug: string
  readonly tipo: 'individual' | 'pareja'
  readonly vinculo: 'matrimonio' | 'novios' | null
  readonly regimen: 'temporada' | 'cadencia'
  readonly cierreInscripcionOffsetDias: number
  readonly intervaloEdicionesDias: number | null
  /** talleres.ancla_ediciones; null/omitted = sin ancla. */
  readonly anclaEdiciones?: AnclaEdiciones | null
  /** null = todas las clases dictadas. */
  readonly clasesMinimasParaCompletar: number | null
  /** talleres.minimo_inscritos; null = sin mínimo. */
  readonly minimoInscritos: number | null
  /** talleres.permite_recuperar_clases. */
  readonly permiteRecuperarClases: boolean
  /** talleres.momento_envio_acceso; defaults to 'al_aprobar'. */
  readonly momentoEnvioAcceso?: MomentoEnvioAcceso
  /** talleres.inscripcion_automatica; defaults to false. */
  readonly inscripcionAutomatica?: boolean
  readonly cadenciaDias: number
  readonly duracionMinutos: number | null
  readonly puedeEditar: boolean
}

type MomentoEnvioAcceso = 'al_aprobar' | 'al_inscribirse'

const MOMENTO_ENVIO_LABEL: Record<MomentoEnvioAcceso, string> = {
  al_aprobar: 'Al aprobar',
  al_inscribirse: 'Al inscribirse',
}

const INSCRIPCION_AUTOMATICA_LABEL = 'Inscripción automática si hay cupo'

type InicioEdicion = AnclaEdiciones | 'cada_n_dias'

const INICIO_EDICION_LABEL: Record<InicioEdicion, string> = {
  primer_domingo_mes: 'Primer domingo de cada mes',
  cada_n_dias: 'Cada N días',
}

/** R3l — the only régimen line left: a taller still on régimen=temporada. */
const NOTA_REGIMEN_TEMPORADA = 'Este taller está en régimen por temporada.'

export function ConfiguracionTaller({
  tallerId,
  tallerSlug,
  tipo,
  vinculo,
  regimen,
  cierreInscripcionOffsetDias,
  intervaloEdicionesDias,
  anclaEdiciones = null,
  clasesMinimasParaCompletar,
  minimoInscritos,
  permiteRecuperarClases,
  momentoEnvioAcceso = 'al_aprobar',
  inscripcionAutomatica = false,
  cadenciaDias,
  duracionMinutos,
  puedeEditar,
}: ConfiguracionTallerProps): ReactElement {
  const router = useRouter()
  const [guardando, startTransition] = useTransition()
  // One error per action, so each failure is reported on its own.
  const [errorConfiguracion, setErrorConfiguracion] = useState<string | null>(null)
  const [errorCadencia, setErrorCadencia] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)

  const [tipoSel, setTipoSel] = useState<'individual' | 'pareja'>(tipo)
  const [vinculoSel, setVinculoSel] = useState<'matrimonio' | 'novios' | ''>(vinculo ?? '')
  // R3l — no selector: the régimen is saved as it is.
  const regimenSel = regimen
  const [cierreSel, setCierreSel] = useState(String(cierreInscripcionOffsetDias))
  const [intervaloSel, setIntervaloSel] = useState(
    intervaloEdicionesDias !== null ? String(intervaloEdicionesDias) : '',
  )
  const [inicioSel, setInicioSel] = useState<InicioEdicion>(anclaEdiciones ?? 'cada_n_dias')
  const [clasesMinimasSel, setClasesMinimasSel] = useState(
    clasesMinimasParaCompletar !== null ? String(clasesMinimasParaCompletar) : '',
  )

  const [minimoSel, setMinimoSel] = useState(minimoInscritos !== null ? String(minimoInscritos) : '')
  const [recuperarSel, setRecuperarSel] = useState(permiteRecuperarClases)

  const [momentoSel, setMomentoSel] = useState<MomentoEnvioAcceso>(momentoEnvioAcceso)
  const [automaticaSel, setAutomaticaSel] = useState(inscripcionAutomatica)

  const [cadencia, setCadencia] = useState(String(cadenciaDias))
  const [duracion, setDuracion] = useState(duracionMinutos !== null ? String(duracionMinutos) : '')

  const cadenciaInicial = String(cadenciaDias)
  const duracionInicial = duracionMinutos !== null ? String(duracionMinutos) : ''

  function guardarConfiguracion(): void {
    setErrorConfiguracion(null)
    setErrorCadencia(null)
    setGuardado(false)
    const cierreNum = Number(cierreSel)
    const ancla = regimenSel === 'cadencia' && inicioSel !== 'cada_n_dias' ? inicioSel : null
    const intervaloNum = ancla !== null || intervaloSel.trim() === '' ? null : Number(intervaloSel)
    const clasesMinimasNum = clasesMinimasSel.trim() === '' ? null : Number(clasesMinimasSel)
    const minimoNum = minimoSel.trim() === '' ? null : Number(minimoSel)
    // updateCadenciaYDuracion only runs when one of its two fields changed.
    const cambioCadencia = cadencia !== cadenciaInicial || duracion !== duracionInicial
    const cadenciaNum = Number(cadencia)
    const duracionNum = duracion.trim() === '' ? null : Number(duracion)
    startTransition(async () => {
      const resultado = await updateTallerConfiguracion({
        tallerId,
        tallerSlug,
        tipo: tipoSel,
        vinculo: tipoSel === 'pareja' && vinculoSel !== '' ? vinculoSel : null,
        regimen: regimenSel,
        cierreInscripcionOffsetDias: cierreNum,
        intervaloEdicionesDias: intervaloNum,
        anclaEdiciones: ancla,
        clasesMinimasParaCompletar: clasesMinimasNum,
        minimoInscritos: minimoNum,
        permiteRecuperarClases: recuperarSel,
        ...(tipoSel === 'pareja' ? { momentoEnvioAcceso: momentoSel } : { inscripcionAutomatica: automaticaSel }),
      })
      const resultadoCadencia = cambioCadencia
        ? await updateCadenciaYDuracion({ tallerId, tallerSlug, cadenciaDias: cadenciaNum, duracionMinutos: duracionNum })
        : null
      if (!resultado.ok) setErrorConfiguracion(resultado.message)
      if (resultadoCadencia && !resultadoCadencia.ok) setErrorCadencia(resultadoCadencia.message)
      if (resultado.ok || resultadoCadencia?.ok) router.refresh()
      setGuardado(resultado.ok && (resultadoCadencia === null || resultadoCadencia.ok))
    })
  }

  const cierreNumParaLabel = Number(cierreSel)
  const unidadMinimo = tipoSel === 'pareja' ? 'parejas' : 'personas'

  if (!puedeEditar) {
    return (
      <section aria-label="Configuración del taller">
        <TarjetaSistema className="p-4 sm:p-5">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Campo titulo="Tipo">{tipoTallerLabel(tipo)}</Campo>
            {tipo === 'pareja' && <Campo titulo="Vínculo">{vinculoLabel(vinculo)}</Campo>}
            {tipo === 'pareja' && (
              <Campo titulo="Envío del acceso al cónyuge nuevo">{MOMENTO_ENVIO_LABEL[momentoEnvioAcceso]}</Campo>
            )}
            {tipo === 'individual' && (
              <Campo titulo={INSCRIPCION_AUTOMATICA_LABEL}>{inscripcionAutomatica ? 'Sí' : 'No'}</Campo>
            )}
            {regimen === 'temporada' && <Campo titulo="Régimen">{NOTA_REGIMEN_TEMPORADA}</Campo>}
            <Campo titulo="Cierre de inscripción">{cierreRelativoLabel(cierreInscripcionOffsetDias)}</Campo>
            {regimen === 'cadencia' && anclaEdiciones !== null && (
              <Campo titulo="Inicio de cada edición">{INICIO_EDICION_LABEL[anclaEdiciones]}</Campo>
            )}
            {regimen === 'cadencia' && anclaEdiciones === null && intervaloEdicionesDias !== null && (
              <Campo titulo="Intervalo entre ediciones">{`Cada ${intervaloEdicionesDias} días`}</Campo>
            )}
            <Campo titulo="Clases mínimas para el certificado">
              {clasesMinimasLabel(clasesMinimasParaCompletar)}
            </Campo>
            <RecuperarClasesCampo permite={permiteRecuperarClases} onCambio={() => {}} puedeEditar={false} />
            <Campo titulo="Cadencia y duración">
              {`Cada ${cadenciaDias} días${duracionMinutos !== null ? ` · Duración ${duracionMinutos} min` : ''}`}
            </Campo>
            <MinimoInscritosCampo
              tipo={tipo}
              valor={minimoInscritos !== null ? String(minimoInscritos) : ''}
              onCambio={() => {}}
              puedeEditar={false}
            />
          </dl>
        </TarjetaSistema>
      </section>
    )
  }

  return (
    <section aria-label="Configuración del taller" className="grid gap-6">
      <SeccionesSistema>
        <GrupoConfiguracion id="config-inscripcion" titulo="Inscripción" descripcion="Para quién es, cuándo se cierra y el mínimo para abrir.">
          <CamposSistema>
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
              <InputSistema
                label="Cierre de inscripción (días relativos a la primera clase)"
                type="number"
                inputMode="numeric"
                min={-60}
                max={60}
                value={cierreSel}
                onChange={(e) => setCierreSel(e.target.value)}
              />
              <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
                {Number.isFinite(cierreNumParaLabel) ? cierreRelativoLabel(cierreNumParaLabel) : ''}
              </TextoSistema>
            </div>

            <div>
              <InputSistema
                label={`Mínimo de inscritos para abrir (${unidadMinimo})`}
                type="number"
                inputMode="numeric"
                min={1}
                max={500}
                value={minimoSel}
                onChange={(e) => setMinimoSel(e.target.value)}
                placeholder="Sin mínimo"
              />
            </div>
          </CamposSistema>
          <TextoSistema variante="sutil" tamaño="sm" className="block">
            {NOTA_MINIMO}
          </TextoSistema>

          {tipoSel === 'individual' && (
            <div className="flex items-start justify-between gap-3 border-t border-border/60 pt-4">
              <div className="grid gap-1">
                <TextoSistema className="block font-medium">{INSCRIPCION_AUTOMATICA_LABEL}</TextoSistema>
                <TextoSistema variante="sutil" tamaño="sm" className="block">
                  Con cupo, la inscripción queda aprobada al momento, sin pasar por Pendientes.
                </TextoSistema>
              </div>
              <Interruptor activo={automaticaSel} onCambio={setAutomaticaSel} aria-label={INSCRIPCION_AUTOMATICA_LABEL} />
            </div>
          )}
        </GrupoConfiguracion>

        <GrupoConfiguracion id="config-ediciones" titulo="Ediciones" descripcion="Cómo se crean y cuándo empieza cada una.">
          {regimenSel === 'temporada' ? (
            <TextoSistema variante="sutil" tamaño="sm" className="block">
              {NOTA_REGIMEN_TEMPORADA}
            </TextoSistema>
          ) : (
            <CamposSistema>
              <div>
                <SelectSistema
                  label="Inicio de cada edición"
                  value={inicioSel}
                  onValueChange={(v) => setInicioSel(v as InicioEdicion)}
                  opciones={[
                    { valor: 'primer_domingo_mes', etiqueta: INICIO_EDICION_LABEL.primer_domingo_mes },
                    { valor: 'cada_n_dias', etiqueta: INICIO_EDICION_LABEL.cada_n_dias },
                  ]}
                />
                {inicioSel === 'primer_domingo_mes' && (
                  <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
                    Cada edición empieza el primer domingo de su mes, una por mes.
                  </TextoSistema>
                )}
              </div>

              {inicioSel === 'cada_n_dias' && (
                <div>
                  <InputSistema
                    label="Intervalo entre ediciones (días)"
                    type="number"
                    inputMode="numeric"
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
            </CamposSistema>
          )}
        </GrupoConfiguracion>

        <GrupoConfiguracion id="config-clases" titulo="Clases y certificado" descripcion="Cuántas clases hacen falta para el certificado.">
          <CamposSistema>
            <div>
              <InputSistema
                label="Clases mínimas para el certificado"
                type="number"
                inputMode="numeric"
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
          </CamposSistema>
          <RecuperarClasesCampo permite={recuperarSel} onCambio={setRecuperarSel} puedeEditar />
        </GrupoConfiguracion>

        <GrupoConfiguracion id="config-cadencia" titulo="Cadencia y duración" descripcion="Días entre clases y cuánto dura cada una.">
          <CamposSistema>
            <InputSistema
              label="Cada N días"
              type="number"
              inputMode="numeric"
              min={1}
              value={cadencia}
              onChange={(e) => setCadencia(e.target.value)}
            />
            <InputSistema
              label="Duración (min)"
              type="number"
              inputMode="numeric"
              min={1}
              value={duracion}
              onChange={(e) => setDuracion(e.target.value)}
              placeholder="Sin duración"
            />
          </CamposSistema>
        </GrupoConfiguracion>
      </SeccionesSistema>

      <PieAccionesSistema>
        <div className="grid min-w-0 gap-1 sm:mr-auto">
          {errorConfiguracion && (
            <TextoSistema role="alert" tamaño="sm" className="block text-danger-text">
              {`No se guardó la configuración: ${errorConfiguracion}`}
            </TextoSistema>
          )}
          {errorCadencia && (
            <TextoSistema role="alert" tamaño="sm" className="block text-danger-text">
              {`No se guardaron la cadencia y la duración: ${errorCadencia}`}
            </TextoSistema>
          )}
          <p aria-live="polite" className="text-sm text-muted-foreground empty:hidden">
            {guardado ? 'Guardado. Vale para las ediciones que crees desde ahora.' : ''}
          </p>
        </div>
        <BotonSistema type="button" variante="primario" icono={Check} cargando={guardando} onClick={guardarConfiguracion}>
          Guardar configuración
        </BotonSistema>
      </PieAccionesSistema>
    </section>
  )
}

function GrupoConfiguracion({
  id,
  titulo,
  descripcion,
  children,
}: {
  readonly id: string
  readonly titulo: string
  readonly descripcion: string
  readonly children: ReactNode
}): ReactElement {
  return (
    <section aria-labelledby={id} className="min-w-0">
      <TarjetaSistema className="grid gap-4 p-4 sm:p-5">
        <div>
          <TituloSistema nivel={3} id={id}>
            {titulo}
          </TituloSistema>
          <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
            {descripcion}
          </TextoSistema>
        </div>
        {children}
      </TarjetaSistema>
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
