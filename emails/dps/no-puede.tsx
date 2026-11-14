/**
 * DPS — the e-mail to the planner when someone answers «No puedo»
 * (odd/tasks/dps-asistencia-pco.md, T16b; S14.4, S14.5; artboard
 * design/dps-avisos-correo/04). One per answer, right away, to whoever sent
 * that notice: who, which day and puesto, the motivo as written, «Buscar
 * reemplazo» (the plan) and «Cómo queda el puesto». Replying writes to the
 * person who cannot (Reply-To). On EmailLayout (dark, the Global logo).
 */
import { Section, Text } from '@react-email/components'
import type { ReactElement } from 'react'

import { EmailButton } from '../components/EmailButton'
import { EmailLayout } from '../components/EmailLayout'

import { LINEA, MARCA, colores, diaCorto, enCaracas, estilos, fechaLarga, horarios, momentoLargo, rolesTexto, nombresRoles, type RolEmail } from './formato'

export type EstadoPersonaPuesto = 'confirmo' | 'no_puede' | 'pendiente' | 'sin_avisar' | 'sin_cuenta'

export interface PuestoEmail {
  readonly nombre: string
  readonly equipo: string
  /** People needed (the puesto's cupos, or the people of the column). */
  readonly cantidad: number
  /** Assigned people who did not say «No puedo». */
  readonly cubiertos: number
  readonly personas: readonly { readonly nombre: string; readonly estado: EstadoPersonaPuesto }[]
}

export interface NoPuedeEmailProps {
  /** The planner's first name; empty when unknown. */
  readonly nombre: string
  /** Who cannot (full name). */
  readonly persona: string
  readonly fecha: string
  readonly contexto: string
  readonly roles: readonly RolEmail[]
  readonly horarios: readonly string[]
  readonly motivo: string | null
  /** UTC instants. */
  readonly respondidoAt: string | null
  readonly enviadoAt: string | null
  readonly puestos: readonly PuestoEmail[]
  readonly urlPlan: string
  /** Replies reach the person (they have an e-mail: the Reply-To). */
  readonly respondeA: boolean
}

const ESTADOS: Record<EstadoPersonaPuesto, { texto: string; color: string }> = {
  confirmo: { texto: 'Confirmó', color: colores.exito },
  no_puede: { texto: 'No puede', color: colores.peligro },
  pendiente: { texto: 'Pendiente', color: colores.aviso },
  sin_avisar: { texto: 'Sin avisar', color: colores.neutro },
  sin_cuenta: { texto: 'Sin cuenta', color: colores.neutro },
}

const primerNombre = (nombre: string): string => nombre.trim().split(/\s+/)[0] ?? nombre

/** «Óscar Rivas no puede el domingo 15 · Cámara 2». */
export function asuntoNoPuede(p: Pick<NoPuedeEmailProps, 'persona' | 'fecha' | 'roles'>): string {
  const roles = nombresRoles(p.roles)
  return `${p.persona} no puede el ${diaCorto(p.fecha)}${roles ? ` · ${roles}` : ''}`
}

const faltan = (p: PuestoEmail): number => Math.max(0, p.cantidad - p.cubiertos)
const lineaPuesto = (p: PuestoEmail): string => `${p.nombre}: ${p.cubiertos} de ${p.cantidad}`
const estadoPuesto = (p: PuestoEmail): string => {
  const n = faltan(p)
  return n === 0 ? 'Completo' : n === 1 ? 'Falta 1 persona' : `Faltan ${n} personas`
}

function filas(p: NoPuedeEmailProps): [string, string][] {
  const respondio = p.respondidoAt ? momentoLargo(p.respondidoAt) : ''
  return [
    ['Quién', p.persona],
    [p.roles.length > 1 ? 'Puestos' : 'Puesto', rolesTexto(p.roles)],
    ['Servicios', horarios(p.horarios)],
    ['Motivo', p.motivo ? `«${p.motivo}»` : 'No escribió motivo'],
    ['Respondió', respondio],
  ].filter((f): f is [string, string] => Boolean(f[1]))
}

function intro(p: NoPuedeEmailProps): string {
  const saludo = p.nombre ? `¡Hola, ${p.nombre}!` : '¡Hola!'
  const enviado = p.enviadoAt ? enCaracas(p.enviadoAt) : null
  return `${saludo} ${primerNombre(p.persona)} respondió «No puedo» al aviso que enviaste${enviado ? ` el ${enviado.dia}` : ''}.`
}

function ayuda(p: NoPuedeEmailProps): string[] {
  const quien = primerNombre(p.persona)
  return [
    `${quien} sigue en el plan marcado «No puede» hasta que elijas a otra persona.`,
  ]
}

const pista = (p: NoPuedeEmailProps): string =>
  `Abre el plan del ${diaCorto(p.fecha)}. Cuando eliges a otra persona, ${primerNombre(p.persona)} sale del plan.`
const pie = (p: NoPuedeEmailProps): string =>
  `Recibes este correo porque enviaste los avisos del ${diaCorto(p.fecha)}. Llega uno por cada «No puedo», en el momento.`

/** The plain-text version (clients without HTML). */
export function textoNoPuede(p: NoPuedeEmailProps): string {
  const titulo = `${p.persona} no puede el ${diaCorto(p.fecha)}`
  const bloque = [LINEA, fechaLarga(p.fecha).toUpperCase(), p.contexto, 'Estado: No puede', ...filas(p).map(([e, v]) => `${e}: ${v}`)].filter(Boolean).join('\n')
  const puestos = p.puestos
    .map((x) =>
      [`${lineaPuesto(x).toUpperCase()} (${estadoPuesto(x).toLowerCase()})`, x.equipo, ...x.personas.map((g) => `${g.nombre} · ${ESTADOS[g.estado].texto}`)]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n')
  return [
    MARCA.toUpperCase(),
    titulo,
    intro(p),
    bloque,
    `Buscar reemplazo:\n${p.urlPlan}\n${pista(p)}`,
    puestos ? `CÓMO QUEDA EL PUESTO\n${LINEA}\n${puestos}` : '',
    `${LINEA}\n${ayuda(p).join('\n\n')}`,
    `${LINEA}\nYo Soy Global · Campus Barquisimeto\n${pie(p)}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function NoPuedeEmail(p: NoPuedeEmailProps): ReactElement {
  const titulo = `${p.persona} no puede el ${diaCorto(p.fecha)}`
  return (
    <EmailLayout
      avisoRespuesta={p.respondeA ? `Si respondes este correo, le escribes a ${primerNombre(p.persona)}.` : undefined}
      preview={p.motivo ? `«${p.motivo}» Busca reemplazo en el plan.` : 'No escribió motivo. Busca reemplazo en el plan.'}>
      <Text style={estilos.marca}>{MARCA}</Text>
      <Text style={estilos.titulo}>{titulo}</Text>
      <Text style={estilos.texto}>{intro(p)}</Text>
      <Section style={estilos.bloque}>
        <Text style={{ ...estilos.estado, color: colores.peligro }}>● No puede</Text>
        <Text style={estilos.fecha}>{fechaLarga(p.fecha)}</Text>
        {p.contexto ? <Text style={estilos.serie}>{p.contexto}</Text> : null}
        <table role="presentation" cellPadding={0} cellSpacing={0} style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {filas(p).map(([etiqueta, valor]) => (
              <tr key={etiqueta}>
                <th scope="row" style={{ ...estilos.etiqueta, textAlign: 'left', fontWeight: 400 }}>
                  {etiqueta}
                </th>
                <td style={etiqueta === 'Motivo' && p.motivo ? { ...estilos.valor, fontStyle: 'italic' } : estilos.valor}>{valor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <EmailButton href={p.urlPlan}>Buscar reemplazo</EmailButton>
      <Text style={{ ...estilos.pista, textAlign: 'center', margin: '-12px 0 16px' }}>{pista(p)}</Text>
      {p.puestos.length > 0 ? (
        <Section>
          <Text style={estilos.seccion}>Cómo queda el puesto</Text>
          {p.puestos.map((x) => (
            <Section key={`${x.nombre}-${x.equipo}`} style={estilos.bloque}>
              <Text style={{ ...estilos.estado, color: faltan(x) > 0 ? colores.aviso : colores.exito }}>● {estadoPuesto(x)}</Text>
              <Text style={estilos.fecha}>{lineaPuesto(x)}</Text>
              {x.equipo ? <Text style={estilos.serie}>{x.equipo}</Text> : null}
              {x.personas.map((g, i) => (
                <Text key={`${g.nombre}-${i}`} style={{ ...estilos.valor, margin: '0', padding: '4px 0' }}>
                  {g.nombre} <span style={{ fontSize: '13px', color: ESTADOS[g.estado].color }}>· {ESTADOS[g.estado].texto}</span>
                </Text>
              ))}
            </Section>
          ))}
        </Section>
      ) : null}
      <Section style={{ borderTop: `1px solid ${colores.borde}`, paddingTop: '16px', marginTop: '8px' }}>
        {ayuda(p).map((a) => (
          <Text key={a} style={estilos.ayuda}>
            {a}
          </Text>
        ))}
      </Section>
      <Text style={estilos.pie}>{pie(p)}</Text>
    </EmailLayout>
  )
}
