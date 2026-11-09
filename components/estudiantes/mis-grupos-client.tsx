'use client'

/**
 * Estudiantes — "Mi grupo" entry (/estudiantes, C3b of
 * odd/tasks/estudiantes-fase-b.md) in the planning style (E4a of
 * odd/tasks/estudiantes-estilo-dps.md; artboard 01-mis-grupos of
 * design/estudiantes-dps, B1–B5).
 *
 * The header band (title, "N grupos · toca uno para marcar su asistencia",
 * "En vivo" for whoever has the live view, C4b, and "Gestionar grupos" for
 * managers), then the groups the caller sees (estudiantes_mis_grupos) in one
 * data region, a band per ámbito (Transit → Inside Out → The Living Room,
 * the order of aGruposMios) with "N grupos". A row is a PCO People style
 * row: avatar, name and leaders ("Sin líder" in warning), Sub-área,
 * Integrantes and Visitantes from md; on a phone 64px with "12 integrantes"
 * and a chevron. The whole row links to the group's leader list. A leader
 * with a single group never lands here: the page sends them straight to it.
 */
import type { ReactElement } from 'react'
import Link from 'next/link'
import { ChevronRight, Radio, Settings2, UsersRound } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { AvatarIniciales } from '@/components/grupos-vida/planner/avatar-iniciales'
import type { GrupoMio } from '@/lib/platform/estudiantes/lista-datos'
import { cn } from '@/lib/utils'

import { EncabezadoPlanificacion, MarcoPlanificacion, ResumenPlanificacion } from './planificacion/marco-planificacion'
import { MigasEstudiantes } from './planificacion/migas-estudiantes'
import { BandaSeccion, CLASE_AVATAR_FILA, CLASE_FILA, CLASE_LINEA, CabeceraColumnas, PieRegion, RegionDatos, TablaPlanificacion } from './planificacion/region-datos'

const palabra = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios)

const COLUMNAS = 'md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_110px_110px_20px]'

export interface MisGruposClientProps {
  readonly grupos: readonly GrupoMio[]
  readonly puedeGestionar: boolean
  /** estudiantes_acceso().vivo: the "En vivo" link. */
  readonly puedeVerVivo?: boolean
}

function Accesos({ puedeGestionar, puedeVerVivo }: { readonly puedeGestionar: boolean; readonly puedeVerVivo: boolean }): ReactElement {
  return (
    <>
      {puedeVerVivo && (
        <BotonSistema asChild variante="outline" tamaño="sm" icono={Radio}>
          <Link href="/estudiantes/vivo">En vivo</Link>
        </BotonSistema>
      )}
      {puedeGestionar && (
        <BotonSistema asChild variante="outline" tamaño="sm" icono={Settings2}>
          <Link href="/estudiantes/grupos">Gestionar grupos</Link>
        </BotonSistema>
      )}
    </>
  )
}

/** Consecutive groups of the same ámbito (aGruposMios already sorts them). */
function porAmbito(grupos: readonly GrupoMio[]): { readonly ambito: string; readonly grupos: GrupoMio[] }[] {
  const bandas: { ambito: string; grupos: GrupoMio[] }[] = []
  for (const g of grupos) {
    const ultima = bandas[bandas.length - 1]
    if (ultima?.ambito === g.ambito) ultima.grupos.push(g)
    else bandas.push({ ambito: g.ambito, grupos: [g] })
  }
  return bandas
}

function FilaGrupo({ grupo }: { readonly grupo: GrupoMio }): ReactElement {
  return (
    <li className={CLASE_LINEA}>
      <Link
        href={`/estudiantes/grupos/${encodeURIComponent(grupo.grupoId)}`}
        aria-label={`Abrir la lista de ${grupo.nombre}`}
        className={cn(CLASE_FILA, COLUMNAS, 'focus-ring min-h-16 pr-2.5 touch-manipulation transition-colors active:bg-accent md:min-h-[52px] md:py-1.5')}
      >
        <span className="flex min-w-0 flex-1 items-center gap-3 md:gap-2.5">
          <AvatarIniciales nombres={[grupo.nombre]} className={CLASE_AVATAR_FILA} />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold text-foreground md:text-sm">{grupo.nombre}</span>
            <span className="block truncate text-[13px] text-muted-foreground md:text-xs">
              {grupo.lideres.length > 0 ? grupo.lideres.join(', ') : <span className="font-medium text-warning-text">Sin líder</span>}
            </span>
          </span>
        </span>
        <span className="hidden truncate text-[13px] text-foreground md:block">{grupo.subarea}</span>
        <span className="shrink-0 whitespace-nowrap text-[13px] text-muted-foreground md:text-sm md:text-foreground">
          <span className="font-mono tabular-nums">{grupo.miembros}</span>
          <span className="md:hidden">{` ${palabra(grupo.miembros, 'integrante', 'integrantes')}`}</span>
        </span>
        <span className="hidden font-mono text-sm tabular-nums text-foreground md:block">{grupo.visitantes}</span>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  )
}

export function MisGruposClient({ grupos, puedeGestionar, puedeVerVivo = false }: MisGruposClientProps): ReactElement {
  const titulo = grupos.length === 1 ? 'Mi grupo' : 'Mis grupos'
  const accesos = puedeGestionar || puedeVerVivo ? <Accesos puedeGestionar={puedeGestionar} puedeVerVivo={puedeVerVivo} /> : undefined

  return (
    <MarcoPlanificacion migas={<MigasEstudiantes migas={[{ texto: 'Estudiantes' }]} />}>
      <EncabezadoPlanificacion titulo={titulo} antetitulo="Estudiantes" acciones={accesos}>
        {grupos.length > 0 && (
          <ResumenPlanificacion>
            <strong className="font-mono tabular-nums">{grupos.length}</strong> {palabra(grupos.length, 'grupo', 'grupos')} · toca uno para marcar su asistencia
          </ResumenPlanificacion>
        )}
      </EncabezadoPlanificacion>

      <RegionDatos>
        <TablaPlanificacion>
          {grupos.length === 0 ? (
            <EstadoVacioSistema
              icono={UsersRound}
              titulo="Todavía no tienes un grupo"
              subtitulo={puedeGestionar ? 'Crea el primero desde «Gestionar grupos».' : 'Cuando la dirección te asigne como líder, tu grupo aparece aquí.'}
            />
          ) : (
            <>
              <CabeceraColumnas className={COLUMNAS}>
                <span>Grupo</span>
                <span>Sub-área</span>
                <span>Integrantes</span>
                <span>Visitantes</span>
                <span />
              </CabeceraColumnas>
              {porAmbito(grupos).map((banda, i) => (
                <section key={banda.ambito} aria-labelledby={`mis-grupos-${i}`}>
                  <BandaSeccion
                    id={`mis-grupos-${i}`}
                    titulo={banda.ambito}
                    pista={
                      <>
                        <span className="font-mono tabular-nums">{banda.grupos.length}</span> {palabra(banda.grupos.length, 'grupo', 'grupos')}
                      </>
                    }
                  />
                  <ul aria-label={`Grupos de ${banda.ambito}`}>
                    {banda.grupos.map((g) => (
                      <FilaGrupo key={g.grupoId} grupo={g} />
                    ))}
                  </ul>
                </section>
              ))}
            </>
          )}
        </TablaPlanificacion>
        {grupos.length > 0 && (
          <PieRegion>
            <span>
              <span className="font-mono tabular-nums">{grupos.length}</span> {palabra(grupos.length, 'grupo', 'grupos')}
            </span>
            <span>Orden: ámbito, luego nombre</span>
          </PieRegion>
        )}
      </RegionDatos>
    </MarcoPlanificacion>
  )
}
