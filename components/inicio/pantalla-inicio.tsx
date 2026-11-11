/**
 * The home (/dashboard) by person (odd/tasks/home-por-rol.md T3, S1, S9;
 * design/home-por-rol): renders the sections decidirSecciones returns, in that
 * order, and nothing else. A section whose content is missing is not shown.
 * Desktop: a full-width 12-column grid where consecutive narrow sections
 * share a row (7 + 5); phone: one column.
 *
 * Server-safe. The page loads the data: «A tu cargo» gets one entry per
 * cargo (null where it did not load, T4), «Visión general» the campus
 * numbers, «Notas de líderes» and «Próximos cumpleaños» their lists (T7,
 * hidden when empty); «Mis hijos» and «Mis servicios» arrive as nodes.
 */
import { Fragment, type ReactElement, type ReactNode } from 'react'

import type { DatosCargo } from '@/lib/inicio/cargar-a-cargo'
import type { Cumpleanos } from '@/lib/inicio/cargar-cumpleanos'
import type { DatosGrupoMiembro } from '@/lib/inicio/cargar-grupos-miembro'
import type { NotaLider } from '@/lib/inicio/cargar-notas-lideres'
import type { SeccionInicio } from '@/lib/inicio/decidir-secciones'

import { HeroInicio, resumenInicio } from './hero-inicio'
import { RanuraMisServicios } from './ranura-mis-servicios'
import { SeccionesACargo } from './seccion-a-cargo'
import { SeccionCumpleanos } from './seccion-cumpleanos'
import { SeccionExplorar } from './seccion-explorar'
import { SeccionGrupoMiembro } from './seccion-grupo-miembro'
import { SeccionNotasLideres } from './seccion-notas-lideres'
import { SeccionParaResponder } from './seccion-para-responder'
import { SeccionProximosPasos } from './seccion-proximos-pasos'
import { SeccionVisionGeneral, type DatosVisionGeneral } from './seccion-vision-general'

export type PantallaInicioProps = {
  readonly nombre: string | null
  /** YYYY-MM-DD in Caracas. */
  readonly hoy: string
  readonly secciones: SeccionInicio[]
  readonly gruposMiembro?: Record<string, DatosGrupoMiembro>
  /** «Mis servicios» of feat/dps-avisos (S2); empty until it is merged. */
  readonly misServicios?: ReactNode
  readonly misHijos?: ReactNode
  /** One entry per cargo of the «a-cargo» section, in its order; null where it did not load. */
  readonly aCargo?: readonly (DatosCargo | null)[]
  readonly visionGeneral?: DatosVisionGeneral | null
  readonly notasLideres?: readonly NotaLider[]
  readonly cumpleanos?: readonly Cumpleanos[]
  /** «Contextos visibles» of the platform navigation, after Visión general or the cargos. */
  readonly contextos?: ReactNode
  /** The Próximo Paso card (odd/tasks/proximo-paso.md T8) inside «Tus próximos pasos». */
  readonly proximoPaso?: ReactNode
}

type Ancho = 'completa' | 'izquierda' | 'derecha'

const CLASE_ANCHO: Record<Ancho, string> = {
  completa: 'md:col-span-12',
  izquierda: 'md:col-span-12 lg:col-span-7',
  derecha: 'md:col-span-12 lg:col-span-5',
}

// Sections that fit half a desktop row; the rest always take the whole row.
const ANGOSTAS = new Set<SeccionInicio['id']>(['mis-hijos', 'notas-lideres', 'grupo-miembro', 'cumpleanos', 'proximos-pasos', 'explorar'])

/** Pairs consecutive narrow sections (7 + 5); a narrow section alone takes the row. */
function anchos(secciones: SeccionInicio[]): Ancho[] {
  const resultado: Ancho[] = []
  for (let i = 0; i < secciones.length; i++) {
    const angosta = ANGOSTAS.has(secciones[i].id)
    if (angosta && i + 1 < secciones.length && ANGOSTAS.has(secciones[i + 1].id)) {
      resultado.push('izquierda', 'derecha')
      i++
    } else {
      resultado.push('completa')
    }
  }
  return resultado
}

export function PantallaInicio({
  nombre,
  hoy,
  secciones,
  gruposMiembro = {},
  misServicios,
  misHijos,
  aCargo = [],
  visionGeneral,
  notasLideres = [],
  cumpleanos = [],
  contextos,
  proximoPaso,
}: PantallaInicioProps): ReactElement {
  const conCargos = aCargo.some((c) => c !== null)
  // Sections whose content is loaded elsewhere and did not arrive (or is empty) are left out (S1).
  const visibles = secciones.filter(
    (s) =>
      (s.id !== 'mis-hijos' || misHijos) &&
      (s.id !== 'a-cargo' || conCargos) &&
      (s.id !== 'vision-general' || visionGeneral) &&
      (s.id !== 'notas-lideres' || notasLideres.length > 0) &&
      (s.id !== 'cumpleanos' || cumpleanos.length > 0),
  )
  // The contexts go with the campus view, else after the cargos.
  const contextosEn = visibles.some((s) => s.id === 'vision-general') ? 'vision-general' : 'a-cargo'
  const conCargo = secciones.some((s) => s.id === 'a-cargo')
  const ancho = anchos(visibles)

  return (
    <div className="grid grid-cols-1 gap-[22px] *:min-w-0 md:grid-cols-12 md:gap-x-6 md:gap-y-7">
      <HeroInicio nombre={nombre} hoy={hoy} resumen={resumenInicio(secciones, gruposMiembro, hoy)} />
      {visibles.map((s, i) => {
        const clase = CLASE_ANCHO[ancho[i]]
        switch (s.id) {
          case 'para-responder':
            return <SeccionParaResponder key={s.id} items={s.items} className={clase} />
          case 'mis-servicios':
            return (
              <RanuraMisServicios key={s.id} className={clase}>
                {misServicios}
              </RanuraMisServicios>
            )
          case 'mis-hijos':
            return (
              <div key={s.id} className={clase}>
                {misHijos}
              </div>
            )
          case 'a-cargo':
            return (
              <Fragment key={s.id}>
                <SeccionesACargo datos={aCargo} hoy={hoy} className={clase} />
                {contextos && contextosEn === 'a-cargo' && <div className={clase}>{contextos}</div>}
              </Fragment>
            )
          case 'notas-lideres':
            return <SeccionNotasLideres key={s.id} notas={notasLideres} hoy={hoy} className={clase} />
          case 'cumpleanos':
            return <SeccionCumpleanos key={s.id} cumpleanos={cumpleanos} hoy={hoy} className={clase} />
          case 'grupo-miembro':
            return (
              <SeccionGrupoMiembro
                key={`${s.id}-${s.grupoId}`}
                grupoId={s.grupoId}
                nombre={s.nombre}
                soloLectura={s.soloLectura}
                conCargo={conCargo}
                datos={gruposMiembro[s.grupoId]}
                className={clase}
              />
            )
          case 'vision-general':
            return (
              visionGeneral && (
                <SeccionVisionGeneral key={s.id} datos={visionGeneral} className={clase}>
                  {contextosEn === 'vision-general' && contextos}
                </SeccionVisionGeneral>
              )
            )
          case 'proximos-pasos':
            return <SeccionProximosPasos key={s.id} pasos={s.pasos} className={clase} proximoPaso={proximoPaso} />
          case 'explorar':
            return <SeccionExplorar key={s.id} tiles={s.tiles} ancha={ancho[i] === 'completa'} className={clase} />
        }
      })}
    </div>
  )
}
