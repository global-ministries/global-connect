/**
 * R3d (odd/tasks/talleres-rediseno.md, S1, S2, S4) — the side column of the
 * v2 taller page (artboard design/talleres-interior/22): «Pasos para abrir
 * una edición» (only for who edits the taller), «Equipo» and «Página
 * pública». Server-safe: no hooks, so the page passes lucide icons and data
 * straight in.
 *
 * Equipo: the node's active servidores (talleres_servidores_del_taller), the
 * coordinación first, each with its rol de servicio and, when it facilitates
 * an active plantilla grupo, «Facilitador · {grupo}». The access state (no
 * authority over the node) and the empty state stay as before.
 *
 * Página pública: talleres.publico, read-only here (the public link, QR and
 * embed code live in Compartir).
 */

import type { ReactElement, ReactNode } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ChevronRight, Globe, Lock, Users } from 'lucide-react'

import { EnlaceSistema, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { urlPublica } from '@/components/talleres/compartir/codigo-incrustar'
import type { PlantillaGrupo } from '@/lib/platform/talleres/plantilla'
import { nombreCompletoServidor, type ServidorDelTaller } from '@/lib/platform/talleres/servidores-del-taller'

export function SeccionLateral({
  id,
  titulo,
  accion,
  descripcion,
  children,
}: {
  readonly id: string
  readonly titulo: string
  readonly accion?: ReactNode
  readonly descripcion?: ReactNode
  readonly children: ReactNode
}): ReactElement {
  return (
    <section aria-labelledby={id} className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <TituloSistema nivel={2} id={id}>
            {titulo}
          </TituloSistema>
          {descripcion && (
            <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
              {descripcion}
            </TextoSistema>
          )}
        </div>
        {accion}
      </div>
      {children}
    </section>
  )
}

// ─── Pasos para abrir una edición ───

export interface PasoApertura {
  readonly etiqueta: string
  readonly listo: boolean
}

export function PasosAbrirEdicion({
  pasos,
  textoFinal,
}: {
  readonly pasos: readonly PasoApertura[]
  /** The one question «Abrir edición» will ask, by régimen. */
  readonly textoFinal: string
}): ReactElement {
  return (
    <SeccionLateral id="pasos-heading" titulo="Pasos para abrir una edición">
      <TarjetaSistema className="overflow-hidden p-0">
        <ul className="divide-y divide-border/60">
          {pasos.map((paso) => (
            <li key={paso.etiqueta} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2.5">
              <span className="min-w-0 truncate text-sm text-foreground">{paso.etiqueta}</span>
              <PuntoEstado tono={paso.listo ? 'success' : 'warning'} etiqueta={paso.listo ? 'Listo' : 'Pendiente'} />
            </li>
          ))}
          <li>
            <Link
              href="#ediciones"
              className="focus-ring flex min-h-11 items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              {textoFinal}
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        </ul>
      </TarjetaSistema>
    </SeccionLateral>
  )
}

// ─── Equipo ───

const ES_COORDINACION = /coordin|l[ií]der|director/i

function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase()
}

/** «Facilitador · Grupo A, Grupo B» from the ACTIVE plantilla grupos a persona facilitates. */
function gruposQueFacilita(personaId: string, grupos: readonly PlantillaGrupo[]): string[] {
  return grupos
    .filter((grupo) => grupo.activo && grupo.facilitadores.some((f) => f.personaId === personaId))
    .map((grupo) => grupo.nombre)
}

export function ordenarEquipo(servidores: readonly ServidorDelTaller[]): ServidorDelTaller[] {
  return [...servidores].sort((a, b) => {
    const ca = ES_COORDINACION.test(a.rolServicio ?? '') ? 0 : 1
    const cb = ES_COORDINACION.test(b.rolServicio ?? '') ? 0 : 1
    if (ca !== cb) return ca - cb
    return nombreCompletoServidor(a).localeCompare(nombreCompletoServidor(b), 'es')
  })
}

export function EquipoTaller({
  servidores,
  sinAutoridad,
  grupos,
  enlaceServidores,
}: {
  readonly servidores: readonly ServidorDelTaller[]
  readonly sinAutoridad: boolean
  readonly grupos: readonly PlantillaGrupo[]
  /** «Gestionar en Servidores», only when the viewer may open it. */
  readonly enlaceServidores: string | null
}): ReactElement {
  return (
    <SeccionLateral
      id="equipo-heading"
      titulo="Equipo"
      descripcion="Servidores activos; se gestionan en Dream Team."
      accion={
        enlaceServidores && (
          <EnlaceSistema href={enlaceServidores} variante="marca" className="inline-flex min-h-[44px] items-center text-sm">
            Gestionar en Servidores
          </EnlaceSistema>
        )
      }
    >
      {sinAutoridad ? (
        <TarjetaSistema className="p-0">
          <EstadoVacioSistema icono={Lock} titulo="No tienes autoridad para ver el equipo de este taller." />
        </TarjetaSistema>
      ) : servidores.length === 0 ? (
        <TarjetaSistema className="p-0">
          <EstadoVacioSistema
            icono={Users}
            titulo="Sin servidores activos en este equipo"
            subtitulo="Asigna servidores en Dream Team → Servidores para que aparezcan aquí."
          />
        </TarjetaSistema>
      ) : (
        <TarjetaSistema className="overflow-hidden p-0">
          <ul className="divide-y divide-border/60">
            {ordenarEquipo(servidores).map((servidor) => {
              const nombre = nombreCompletoServidor(servidor)
              const facilita = gruposQueFacilita(servidor.personaId, grupos)
              const detalle = [servidor.rolServicio, facilita.length > 0 ? `Facilitador · ${facilita.join(', ')}` : null]
                .filter(Boolean)
                .join(' · ')
              return (
                <li key={servidor.personaId} className="flex min-h-14 min-w-0 items-center gap-3 px-4 py-2.5">
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-tint text-xs font-semibold text-brand-text"
                  >
                    {iniciales(nombre)}
                  </span>
                  <span className="grid min-w-0">
                    <span className="truncate text-sm font-medium text-foreground">{nombre}</span>
                    <span className="truncate text-[13px] text-muted-foreground">{detalle || '—'}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </TarjetaSistema>
      )}
    </SeccionLateral>
  )
}

// ─── Página pública ───

export function PaginaPublicaTaller({
  slug,
  publico,
  enlaceCompartir,
}: {
  readonly slug: string
  readonly publico: boolean
  /** ./compartir, only for who edits the taller. */
  readonly enlaceCompartir: string | null
}): ReactElement {
  const ruta = urlPublica('', slug)
  return (
    <SeccionLateral
      id="publica-heading"
      titulo="Página pública"
      accion={
        <PuntoEstado
          tono={publico ? 'success' : 'muted'}
          etiqueta={publico ? 'Recibe solicitudes' : 'No aparece'}
        />
      }
    >
      <TarjetaSistema className="grid gap-3 p-4">
        <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <Globe className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate font-mono text-[13px]">{ruta}</span>
        </span>
        <TextoSistema variante="sutil" tamaño="sm" className="block">
          {publico
            ? 'Cualquiera puede pedir su lugar en las ediciones con inscripción abierta, tenga o no cuenta.'
            : 'Este taller no aparece en la página pública; solo se inscribe desde la app o la coordinación.'}{' '}
          Este dato no se cambia desde aquí.
        </TextoSistema>
        {(publico || enlaceCompartir) && (
          <div className="flex flex-wrap gap-x-4">
            {publico && (
              <a
                href={ruta}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium text-brand-text hover:underline"
              >
                Ver página
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
            )}
            {enlaceCompartir && (
              <Link
                href={enlaceCompartir}
                className="focus-ring inline-flex min-h-11 items-center rounded-md text-sm font-medium text-brand-text hover:underline"
              >
                Enlace, QR y código
              </Link>
            )}
          </div>
        )}
      </TarjetaSistema>
    </SeccionLateral>
  )
}
