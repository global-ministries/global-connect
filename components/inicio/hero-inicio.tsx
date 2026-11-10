/**
 * Hero of the home: date, «Hola, {nombre}» and one summary line with the key
 * numbers (docs/design-system: hero on desktop, large title on phone).
 */
import type { ReactElement, ReactNode } from 'react'

import { TituloGrande } from '@/components/ui/barra-navegacion-movil'
import type { DatosGrupoMiembro } from '@/lib/inicio/cargar-grupos-miembro'
import type { SeccionInicio } from '@/lib/inicio/decidir-secciones'

import { fechaCorta, fechaLarga, primerNombre } from './textos-inicio'

const N = ({ children }: { readonly children: ReactNode }) => <strong className="font-mono font-semibold tabular-nums">{children}</strong>

/** The most urgent thing first: what to answer, else the group and the next step. */
export function resumenInicio(secciones: SeccionInicio[], grupos: Record<string, DatosGrupoMiembro>, hoy: string): ReactNode {
  const responder = secciones.find((s) => s.id === 'para-responder')
  const servicios = secciones.find((s) => s.id === 'mis-servicios')
  if (responder) {
    const total = responder.items.reduce((suma, i) => suma + i.cantidad, 0)
    return (
      <>
        Tienes <N>{total}</N> {total === 1 ? 'cosa' : 'cosas'} por responder.
      </>
    )
  }
  if (servicios && servicios.porConfirmar > 0) {
    return (
      <>
        Tienes <N>{servicios.porConfirmar}</N> {servicios.porConfirmar === 1 ? 'servicio' : 'servicios'} por responder.
      </>
    )
  }

  const frases: ReactNode[] = []
  const grupo = secciones.find((s) => s.id === 'grupo-miembro')
  const reunion = grupo ? grupos[grupo.grupoId]?.proximaReunion : null
  if (reunion) {
    const dia = reunion.fecha === hoy ? 'hoy' : `el ${fechaCorta(reunion.fecha).split(' ')[0].toLowerCase()}`
    frases.push(
      <span key="grupo">
        Tu grupo se reúne <strong>{dia}</strong>.{' '}
      </span>,
    )
  }
  const pasos = secciones.find((s) => s.id === 'proximos-pasos')
  if (pasos?.pasos.some((p) => p.destacado)) {
    frases.push(
      <span key="paso">
        Tu siguiente paso es <strong>Próximo Paso</strong>.
      </span>,
    )
  }
  return frases.length > 0 ? frases : 'Estás al día.'
}

type Props = {
  readonly nombre: string | null
  readonly hoy: string
  readonly resumen: ReactNode
}

export function HeroInicio({ nombre, hoy, resumen }: Props): ReactElement {
  const fecha = fechaLarga(hoy)
  const saludo = primerNombre(nombre) ? `Hola, ${primerNombre(nombre)}` : 'Hola'
  const claseFecha = 'text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground'

  return (
    <div className="md:col-span-12">
      {/* Phone: the large title (the shell's phone header shows the logo on Inicio). */}
      <div className="md:hidden">
        <p className={`px-1 ${claseFecha}`}>{fecha}</p>
        <TituloGrande titulo={saludo} resumen={resumen} />
      </div>
      <div className="hidden md:block">
        <p className={claseFecha}>{fecha}</p>
        <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-[-0.02em] text-foreground">{saludo}</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground [&_strong]:text-foreground">{resumen}</p>
      </div>
    </div>
  )
}
