'use client'

/**
 * Estudiantes › Grupos — the member view inside the group drawer (artboards
 * 06 / 07, `#vista=persona:<n>`; gap G8), for members and visitors alike:
 * identity, WhatsApp / Llamar, a visitor's callout with "Confirmar como
 * miembro" (any number of visits; confirmar_miembro), since when they are in
 * the group, the representantes (Transit / Inside Out; Q3
 * lets the dirección see them), "Mover a otro grupo" (same ámbito and
 * campus, one step: estudiantes_grupo_miembro_mover) and "Quitar del grupo"
 * with an inline confirmation, so a visitor added to the wrong group can be
 * moved (they arrive as a visitor) or removed. Past attendance stays with the
 * old group.
 * Transit / Inside Out members also get the "Año escolar" row with its
 * editor (S16) and an always-present Representante section («Sin
 * representante» when empty) with «Agregar representante» (the search-first
 * picker, inline) and «Quitar» per representante with an inline
 * confirmation; quitar removes only the family link (S2, S3 of
 * odd/tasks/representante-buscador.md; the database requires level 3). The
 * Living Room keeps the read-only list, shown only when it has someone.
 */
import { useState, type ReactElement } from 'react'
import { ArrowRightLeft, MessageCircle, Phone, Star, UserMinus, UserPlus } from 'lucide-react'

import { BotonSistema, SelectSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { AvatarServidor, telefonoVisible } from '@/components/dream-team/servidores/lista-servidores'
import { formatearFecha } from '@/components/dream-team/detalle-persona'
import { confirmarMiembro, moverIntegrante, quitarIntegrante, quitarRepresentante } from '@/lib/actions/estudiantes-grupos.actions'
import { destinosMover } from '@/lib/platform/estudiantes/gestion-grupo'
import type { GrupoGestion, Integrante, Representante } from '@/lib/platform/estudiantes/grupos-datos'
import { lideresTexto } from '@/lib/platform/estudiantes/grupos-vista'
import { enlaceWhatsapp } from '@/lib/utils/telefono'

import { TituloSeccion } from '../filas-inset'
import { AnioEscolar } from '../lista/anio-escolar'
import { AgregarRepresentante } from '../representante/agregar-representante'
import type { AccionGrupo } from './use-accion-grupo'
import { DatoClave, subtituloIntegrante } from './vista-grupo'

/** " · vino 3 domingos." (" · vino a 3 reuniones." in The Living Room), or " · aún sin asistencias marcadas." */
function textoVisitas(visitas: number, tlr: boolean): string {
  if (visitas <= 0) return ' · aún sin asistencias marcadas.'
  if (tlr) return ` · vino a ${visitas} ${visitas === 1 ? 'reunión' : 'reuniones'}.`
  return ` · vino ${visitas} ${visitas === 1 ? 'domingo' : 'domingos'}.`
}

/** The quick actions are 66px stacked buttons, icon over label (docs/design-system/patterns.md#detail-drawer). */
const ACCION_RAPIDA = 'h-[66px] min-w-0 flex-col gap-1 px-2 text-[13px]'

const TIPO_REPRESENTANTE: Readonly<Record<string, string>> = {
  padre: 'Padre o madre',
  tutor: 'Tutor',
  abuelo: 'Abuelo o abuela',
  tio: 'Tío o tía',
  hermano: 'Hermano o hermana',
  otro_familiar: 'Familiar',
}

function Contacto({ telefono, nombre, grande = false }: { readonly telefono: string | null; readonly nombre: string; readonly grande?: boolean }): ReactElement {
  const whatsapp = enlaceWhatsapp(telefono)
  const llamar = telefonoVisible(telefono) ? `tel:${(telefono ?? '').replace(/[^\d+]/g, '')}` : null
  const clase = grande ? ACCION_RAPIDA : undefined
  const tamaño = grande ? 'md' : 'sm'
  return (
    <div className={grande ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}>
      {whatsapp ? (
        <BotonSistema asChild variante="outline" tamaño={tamaño} icono={MessageCircle} className={clase}>
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp a ${nombre}`}>
            WhatsApp
          </a>
        </BotonSistema>
      ) : (
        <BotonSistema type="button" variante="outline" tamaño={tamaño} icono={MessageCircle} className={clase} disabled>
          WhatsApp
        </BotonSistema>
      )}
      {llamar ? (
        <BotonSistema asChild variante="outline" tamaño={tamaño} icono={Phone} className={clase}>
          <a href={llamar} aria-label={`Llamar a ${nombre}`}>
            Llamar
          </a>
        </BotonSistema>
      ) : (
        <BotonSistema type="button" variante="outline" tamaño={tamaño} icono={Phone} className={clase} disabled>
          Llamar
        </BotonSistema>
      )}
    </div>
  )
}

export interface VistaIntegranteProps {
  readonly grupo: GrupoGestion
  readonly integrante: Integrante
  readonly grupos: readonly GrupoGestion[]
  readonly accion: AccionGrupo
  /** Back to the group view (after moving or removing, too). */
  readonly onVolver: () => void
}

export function VistaIntegrante({ grupo, integrante, grupos, accion, onVolver }: VistaIntegranteProps): ReactElement {
  const [destino, setDestino] = useState('')
  const [confirmarQuitar, setConfirmarQuitar] = useState(false)
  const [agregandoRep, setAgregandoRep] = useState(false)
  const [quitandoRep, setQuitandoRep] = useState<string | null>(null)
  const { pendiente, ejecutar } = accion
  const destinos = destinosMover(grupos, grupo)
  const telefono = telefonoVisible(integrante.telefono)
  const nombreCorto = integrante.nombre.split(' ')[0] ?? integrante.nombre
  const visitante = integrante.estado === 'visitante'
  const tlr = grupo.experiencia === 'the_living_room'
  const representantes = integrante.representantes

  async function mover(): Promise<void> {
    const elegido = grupos.find((g) => g.id === destino)
    if (!elegido) return
    const ok = await ejecutar(
      'mover',
      () => moverIntegrante({ grupoId: elegido.id, personaId: integrante.personaId }),
      `${integrante.nombre} pasó a ${elegido.nombre}`,
    )
    if (ok) onVolver()
  }

  async function quitar(): Promise<void> {
    const ok = await ejecutar(
      'quitar',
      () => quitarIntegrante({ grupoId: grupo.id, personaId: integrante.personaId }),
      `${integrante.nombre} ya no está en ${grupo.nombre}`,
    )
    if (ok) onVolver()
  }

  async function quitarRep(representante: Representante): Promise<void> {
    const ok = await ejecutar(
      `quitar-rep:${representante.personaId}`,
      () => quitarRepresentante({ grupoId: grupo.id, personaId: integrante.personaId, representanteId: representante.personaId }),
      `${representante.nombre} ya no es representante de ${integrante.nombre}`,
    )
    if (ok) setQuitandoRep(null)
  }

  return (
    <div className="space-y-5">
      <div className="flex min-w-0 items-center gap-4">
        <AvatarServidor nombre={integrante.nombre} grande />
        <div className="min-w-0 text-sm text-muted-foreground">
          <p className="truncate">{`${subtituloIntegrante(grupo, integrante, new Date())} · ${grupo.nombre}`}</p>
          <p className={telefono ? 'font-mono tabular-nums' : undefined}>{telefono ?? 'Sin teléfono'}</p>
        </div>
      </div>

      <Contacto telefono={integrante.telefono} nombre={integrante.nombre} grande />

      {visitante && (
        <AvisoFormulario tono="info" className="flex gap-3">
          <Star aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info-text" />
          <div className="min-w-0 space-y-2">
            <p>
              <b className="font-semibold">Visitante</b>
              {`${textoVisitas(integrante.visitas, grupo.experiencia === 'the_living_room')} Cuando lo confirmes pasa a ser integrante del grupo.`}
            </p>
            <BotonSistema
              type="button"
              tamaño="sm"
              cargando={pendiente === 'confirmar'}
              disabled={pendiente !== null}
              onClick={() =>
                ejecutar(
                  'confirmar',
                  () => confirmarMiembro({ grupoId: grupo.id, personaId: integrante.personaId }),
                  `${integrante.nombre} ya es integrante de ${grupo.nombre}`,
                )
              }
            >
              Confirmar como miembro
            </BotonSistema>
          </div>
        </AvisoFormulario>
      )}

      <dl className="grid grid-cols-2 gap-3">
        <DatoClave etiqueta="En el grupo desde" valor={formatearFecha(integrante.desde)} />
        <DatoClave etiqueta="Estado" valor={integrante.estado === 'miembro' ? 'Integrante' : 'Visitante'} />
      </dl>

      {grupo.experiencia !== 'the_living_room' && <AnioEscolar personaId={integrante.personaId} nombre={integrante.nombre} />}

      {(!tlr || representantes.length > 0) && (
        <section aria-labelledby="integrante-representante" className="space-y-2">
          <TituloSeccion id="integrante-representante" texto={representantes.length > 1 ? 'Representantes' : 'Representante'} />
          {representantes.length === 0 && <p className="text-sm text-muted-foreground">Sin representante</p>}
          {representantes.map((representante) => {
            const telefonoRep = telefonoVisible(representante.telefono)
            return (
              <TarjetaSistema key={representante.personaId} className="space-y-3 p-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{representante.nombre}</p>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {TIPO_REPRESENTANTE[representante.tipo] ?? 'Familiar'}
                      {' · '}
                      <span className={telefonoRep ? 'font-mono tabular-nums' : undefined}>{telefonoRep ?? 'Sin teléfono'}</span>
                    </p>
                  </div>
                  {!tlr && quitandoRep !== representante.personaId && (
                    <BotonSistema
                      type="button"
                      variante="ghost"
                      tamaño="sm"
                      icono={UserMinus}
                      aria-label={`Quitar a ${representante.nombre} como representante`}
                      disabled={pendiente !== null}
                      onClick={() => setQuitandoRep(representante.personaId)}
                    >
                      Quitar
                    </BotonSistema>
                  )}
                </div>
                {quitandoRep === representante.personaId ? (
                  <AvisoFormulario tono="error" className="space-y-2">
                    <p className="font-semibold">{`¿Quitar a ${representante.nombre} como representante?`}</p>
                    <p className="font-normal text-foreground">{`${representante.nombre} sigue en el sistema; solo se quita su vínculo con ${nombreCorto}.`}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => setQuitandoRep(null)} disabled={pendiente !== null}>
                        Cancelar
                      </BotonSistema>
                      <BotonSistema
                        type="button"
                        variante="peligro"
                        tamaño="sm"
                        cargando={pendiente === `quitar-rep:${representante.personaId}`}
                        disabled={pendiente !== null}
                        onClick={() => quitarRep(representante)}
                      >
                        Quitar
                      </BotonSistema>
                    </div>
                  </AvisoFormulario>
                ) : (
                  <Contacto telefono={representante.telefono} nombre={representante.nombre} />
                )}
              </TarjetaSistema>
            )
          })}
          {!tlr &&
            (agregandoRep ? (
              <AgregarRepresentante
                grupoId={grupo.id}
                personaId={integrante.personaId}
                estudiante={integrante.nombre}
                accion={accion}
                onCerrar={() => setAgregandoRep(false)}
              />
            ) : (
              <BotonSistema type="button" variante="outline" icono={UserPlus} onClick={() => setAgregandoRep(true)}>
                Agregar representante
              </BotonSistema>
            ))}
        </section>
      )}

      <section aria-labelledby="integrante-mover" className="space-y-2">
        <TituloSeccion id="integrante-mover" texto="Mover a otro grupo" />
        {destinos.length > 0 ? (
          <>
            <SelectSistema
              label="Grupo nuevo"
              placeholder="Elige un grupo"
              opciones={destinos.map((d) => ({ valor: d.grupoId, etiqueta: d.etiqueta }))}
              value={destino}
              onValueChange={setDestino}
            />
            <p className="text-[13px] text-muted-foreground">
              {visitante
                ? `Llega como visitante. Su asistencia anterior queda con ${grupo.nombre}.`
                : `Su asistencia anterior queda con ${grupo.nombre}.`}
            </p>
            <BotonSistema
              type="button"
              variante="outline"
              icono={ArrowRightLeft}
              cargando={pendiente === 'mover'}
              disabled={destino === '' || pendiente !== null}
              onClick={mover}
            >
              Mover
            </BotonSistema>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{`No hay otro grupo activo en ${grupo.ambito} para este campus.`}</p>
        )}
      </section>

      {confirmarQuitar ? (
        <AvisoFormulario tono="error" className="space-y-2">
          <p className="font-semibold">{`¿Quitar a ${nombreCorto} del grupo?`}</p>
          <p className="font-normal text-foreground">
            {`Queda sin grupo en ${grupo.ambito} y deja de aparecer en la lista de ${lideresTexto(grupo) ?? 'su líder'}. Su asistencia se conserva.`}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => setConfirmarQuitar(false)} disabled={pendiente !== null}>
              Cancelar
            </BotonSistema>
            <BotonSistema type="button" variante="peligro" tamaño="sm" cargando={pendiente === 'quitar'} disabled={pendiente !== null} onClick={quitar}>
              Quitar
            </BotonSistema>
          </div>
        </AvisoFormulario>
      ) : (
        <BotonSistema type="button" variante="ghost" icono={UserMinus} onClick={() => setConfirmarQuitar(true)}>
          Quitar del grupo
        </BotonSistema>
      )}
    </div>
  )
}
