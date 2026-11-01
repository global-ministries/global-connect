'use client'

/**
 * Estudiantes › En vivo — the group detail (artboards 03 / 04, `#grupo=`):
 * one `DetalleResponsivo` (side panel from md, bottom sheet below) with the
 * "Nadie marcó todavía" notice for a group without marks (S5: does the
 * leader need help?), the counts of the meeting, the leaders, today's
 * visitors of the group and "Ver la lista" (its leader list at this meeting,
 * with "‹ En vivo" back here). The live data has no phones and no roster, so
 * WhatsApp / Llamar and the read-only roster of the artboard are left out;
 * the list holds both.
 */
import type { ReactElement } from 'react'
import Link from 'next/link'
import { ClipboardList } from 'lucide-react'

import { BadgeSistema, BotonSistema } from '@/components/ui/sistema-diseno'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import type { GrupoVivo, OpcionVivo, VisitanteHoy } from '@/lib/platform/estudiantes/vivo-datos'
import { enlaceLista, estadoGrupo, etiquetaEstado, inscritosDe, lineaVisitante } from '@/lib/platform/estudiantes/vivo-vista'

import { FilaInset, ListaInset, TituloSeccion } from '../filas-inset'
import { AvatarIniciales } from './franja-visitantes'

const unirNombres = (nombres: readonly string[]): string =>
  nombres.length <= 1 ? (nombres[0] ?? '') : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`

export interface DetalleGrupoVivoProps {
  /** `null` keeps the drawer closed (the group left the data). */
  readonly grupo: GrupoVivo | null
  readonly opcion: OpcionVivo
  readonly visitantes: readonly VisitanteHoy[]
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
}

export function DetalleGrupoVivo({ grupo, opcion, visitantes, abierto, onCambioAbierto }: DetalleGrupoVivoProps): ReactElement | null {
  if (!grupo) return null
  const { tono, texto } = etiquetaEstado(grupo)
  const propios = visitantes.filter((v) => v.grupoId === grupo.grupoId)
  const cifras: readonly (readonly [string, number])[] = [
    ['Presentes', grupo.presentes],
    ['Ausentes', grupo.ausentes],
    ['Sin marcar', grupo.sinMarcar],
    ['Visitantes', grupo.visitantes],
  ]

  return (
    <DetalleResponsivo
      abierto={abierto}
      onCambioAbierto={onCambioAbierto}
      titulo={grupo.nombre}
      descripcion={[grupo.subarea, opcion.ambito].filter(Boolean).join(' · ')}
      pie={
        <BotonSistema asChild variante="primario" icono={ClipboardList} className="w-full">
          <Link href={enlaceLista(grupo.grupoId, opcion)}>Ver la lista</Link>
        </BotonSistema>
      }
    >
      <div className="space-y-5">
        <PuntoEstado tono={tono} etiqueta={texto} />

        {estadoGrupo(grupo) === 'sin_marcar' && (
          <AvisoFormulario tono="info">
            <p className="font-semibold text-foreground">Nadie marcó todavía</p>
            <p className="mt-1 text-muted-foreground">
              {grupo.lideres.length > 0
                ? `¿${unirNombres(grupo.lideres)} ${grupo.lideres.length > 1 ? 'necesitan' : 'necesita'} apoyo? Avísale a su entrenador.`
                : 'Este grupo no tiene líder. Avísale a su entrenador.'}
            </p>
          </AvisoFormulario>
        )}

        <dl className="grid grid-cols-2 gap-2.5">
          {cifras.map(([etiqueta, valor]) => (
            <div key={etiqueta} className="rounded-xl border border-border/60 bg-card px-3.5 py-3">
              <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
              <dd className="mt-0.5 font-mono text-xl tabular-nums text-foreground">{valor}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground">
          <span className="font-mono tabular-nums text-foreground">{inscritosDe(grupo)}</span> en la lista de hoy
        </p>

        <section aria-labelledby="vivo-detalle-lideres" className="space-y-2.5">
          <TituloSeccion id="vivo-detalle-lideres" texto="Líderes" cantidad={grupo.lideres.length} />
          {grupo.lideres.length > 0 ? (
            <ListaInset etiqueta="Líderes">
              {grupo.lideres.map((nombre) => (
                <FilaInset key={nombre} avatar={<AvatarIniciales nombre={nombre} />} titulo={nombre} />
              ))}
            </ListaInset>
          ) : (
            <p className="text-sm font-medium text-warning-text">Sin líder</p>
          )}
        </section>

        {propios.length > 0 && (
          <section aria-labelledby="vivo-detalle-visitantes" className="space-y-2.5">
            <TituloSeccion id="vivo-detalle-visitantes" texto="Visitantes de hoy" cantidad={propios.length} />
            <ListaInset etiqueta="Visitantes de hoy del grupo">
              {propios.map((v) => (
                <FilaInset
                  key={v.personaId}
                  avatar={<AvatarIniciales nombre={v.nombre} />}
                  titulo={v.nombre}
                  subtitulo={lineaVisitante(v) || undefined}
                  accion={
                    v.esNuevo ? (
                      <BadgeSistema variante="info" tamaño="sm">
                        Nuevo
                      </BadgeSistema>
                    ) : undefined
                  }
                />
              ))}
            </ListaInset>
          </section>
        )}
      </div>
    </DetalleResponsivo>
  )
}
