/**
 * The home (/dashboard) by person (odd/tasks/home-por-rol.md T3, S1, S9;
 * design/home-por-rol): renders the sections decidirSecciones returns, in that
 * order, and nothing else. A section whose content is missing is not shown.
 * Desktop: a full-width 12-column grid where consecutive narrow sections
 * share a row (7 + 5); phone: one column.
 *
 * Server-safe. The page loads the data; the sections that still reuse the
 * previous dashboard (mis hijos, a cargo, visión general) arrive as nodes.
 */
import type { ReactElement, ReactNode } from 'react'

import type { DatosGrupoMiembro } from '@/lib/inicio/cargar-grupos-miembro'
import type { SeccionInicio } from '@/lib/inicio/decidir-secciones'

import { HeroInicio, resumenInicio } from './hero-inicio'
import { EncabezadoSeccion } from './partes-inicio'
import { RanuraMisServicios } from './ranura-mis-servicios'
import { SeccionExplorar } from './seccion-explorar'
import { SeccionGrupoMiembro } from './seccion-grupo-miembro'
import { SeccionParaResponder } from './seccion-para-responder'
import { SeccionProximosPasos } from './seccion-proximos-pasos'

export type PantallaInicioProps = {
  readonly nombre: string | null
  /** YYYY-MM-DD in Caracas. */
  readonly hoy: string
  readonly secciones: SeccionInicio[]
  readonly gruposMiembro?: Record<string, DatosGrupoMiembro>
  /** «Mis servicios» of feat/dps-avisos (S2); empty until it is merged. */
  readonly misServicios?: ReactNode
  readonly misHijos?: ReactNode
  readonly aCargo?: ReactNode
  readonly visionGeneral?: ReactNode
}

type Ancho = 'completa' | 'izquierda' | 'derecha'

const CLASE_ANCHO: Record<Ancho, string> = {
  completa: 'md:col-span-12',
  izquierda: 'md:col-span-12 lg:col-span-7',
  derecha: 'md:col-span-12 lg:col-span-5',
}

// Sections that fit half a desktop row; the rest always take the whole row.
const ANGOSTAS = new Set<SeccionInicio['id']>(['mis-hijos', 'grupo-miembro', 'proximos-pasos', 'explorar'])

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

function SeccionConContenido({ id, titulo, children, className }: { readonly id: string; readonly titulo: string; readonly children: ReactNode; readonly className: string }): ReactElement {
  return (
    <section aria-labelledby={id} className={className}>
      <EncabezadoSeccion id={id} titulo={titulo} />
      <div className="space-y-6">{children}</div>
    </section>
  )
}

export function PantallaInicio({ nombre, hoy, secciones, gruposMiembro = {}, misServicios, misHijos, aCargo, visionGeneral }: PantallaInicioProps): ReactElement {
  // Sections whose content is loaded elsewhere and did not arrive are left out (S1).
  const visibles = secciones.filter(
    (s) => (s.id !== 'mis-hijos' || misHijos) && (s.id !== 'a-cargo' || aCargo) && (s.id !== 'vision-general' || visionGeneral),
  )
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
              <SeccionConContenido key={s.id} id="inicio-a-cargo" titulo="A tu cargo" className={clase}>
                {aCargo}
              </SeccionConContenido>
            )
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
              <SeccionConContenido key={s.id} id="inicio-vision-general" titulo="Visión general" className={clase}>
                {visionGeneral}
              </SeccionConContenido>
            )
          case 'proximos-pasos':
            return <SeccionProximosPasos key={s.id} pasos={s.pasos} className={clase} />
          case 'explorar':
            return <SeccionExplorar key={s.id} tiles={s.tiles} ancha={ancho[i] === 'completa'} className={clase} />
        }
      })}
    </div>
  )
}
