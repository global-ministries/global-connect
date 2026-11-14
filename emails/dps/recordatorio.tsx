/**
 * DPS — the automatic service reminder by e-mail (odd/tasks/dps-asistencia-pco.md,
 * T16c; S14.3, S14.5, S14.6; artboard design/dps-avisos-correo 03). ONE
 * e-mail per person and day, days before the service (configurable, 2 by
 * default), to whoever confirmed (no buttons; «Cambiar respuesta» in the app)
 * or has not answered yet (Confirmar / No puedo, the T16b link); never to a
 * «No puedo». The arrival goes up front, «Tu parte» comes from the order of
 * the service when its responsable names the person's puesto or name (a
 * guess, as in «Mis servicios»), the order marks their row «Tú», and «Quiénes
 * sirven contigo» is only counts. Built on EmailLayout (dark, the Global
 * logo); replying reaches whoever sent the notice. `contenidoRecordatorio`
 * computes every text once: the HTML and the plain text say the same.
 */
import { Button, Column, Link, Row, Section, Text } from '@react-email/components'
import type { ReactElement } from 'react'

import { EmailLayout } from '../components/EmailLayout'
import { ETIQUETA_TIPO, type TipoPlan } from '@/lib/platform/dps/planilla'

import { LINEA, MARCA, colores, diaCorto, enLista, esDomingo, estilos, fechaLarga, hora, horarios, mayuscula, nombresRoles, rolesTexto, type RolEmail } from './formato'

/** One row of the order of the service (the first service's time). */
export interface FilaOrdenEmail {
  readonly hora: string | null
  readonly titulo: string
  readonly detalle: string | null
  /** «5 min». */
  readonly duracion: string | null
  /** The person's part (their row is marked «Tú»). */
  readonly mia: boolean
}

export interface OrdenRecordatorio {
  /** The first service, «9:00». */
  readonly hora: string
  /** The other services, same order. */
  readonly otros: readonly string[]
  readonly filas: readonly FilaOrdenEmail[]
}

export interface EquipoRecordatorio {
  readonly personas: number
  readonly confirmaron: number
  readonly direcciones: readonly { readonly nombre: string; readonly personas: number }[]
}

/** One plan of that day, as the person was told it. */
export interface BloqueRecordatorio {
  /** 'YYYY-MM-DD'. */
  readonly fecha: string
  readonly tipo: string
  readonly titulo: string | null
  readonly serie: string | null
  readonly semana: number | null
  readonly roles: readonly RolEmail[]
  readonly horarios: readonly string[]
  readonly llegada: string
  readonly estado: 'pendiente' | 'confirmo'
  /** «Anuncios a las 9:35 y 12:05» and its notes; null when the order does not name them. */
  readonly parte: { readonly texto: string; readonly detalle: string | null } | null
  readonly orden: OrdenRecordatorio | null
  readonly equipo: EquipoRecordatorio | null
  /** The one-tap link; null when already confirmed. */
  readonly urlConfirmar: string | null
  readonly urlNoPuedo: string | null
  readonly urlVer: string
}

export interface RecordatorioEmailProps {
  /** First name; empty when unknown. */
  readonly nombre: string
  /** Who sent the notice (full name), or null. */
  readonly remitente: string | null
  /** Replies reach the planner (they have an e-mail: the Reply-To). */
  readonly respondeA: boolean
  /** How many days before it leaves (the footer says it). */
  readonly dias: number
  readonly bloques: readonly BloqueRecordatorio[]
}

export interface ContenidoRecordatorio {
  readonly asunto: string
  readonly preview: string
  readonly titulo: string
  readonly parrafos: readonly string[]
  readonly ayuda: readonly string[]
  readonly pie: readonly string[]
}

function contexto(b: BloqueRecordatorio): string {
  if (b.titulo) return b.titulo
  if (b.serie) return b.semana ? `${b.serie} · Parte ${b.semana}` : b.serie
  return b.tipo && b.tipo !== 'domingo' ? (ETIQUETA_TIPO[b.tipo as TipoPlan] ?? '') : ''
}

const diasAntes = (dias: number): string => `${dias} ${dias === 1 ? 'día' : 'días'} antes`
const personas = (n: number): string => `${n} ${n === 1 ? 'persona' : 'personas'}`

/** Every text of the e-mail, once: subject, preview, title, paragraphs, help and closing. */
export function contenidoRecordatorio({ nombre, remitente, respondeA, dias, bloques }: RecordatorioEmailProps): ContenidoRecordatorio {
  const ordenados = [...bloques].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const primero = ordenados[0]
  const fecha = primero?.fecha ?? ''
  const domingo = fecha !== '' && esDomingo(fecha)
  const donde = domingo ? 'este domingo' : `el ${diaCorto(fecha)}`
  const roles = nombresRoles(ordenados.flatMap((b) => b.roles))
  const llegada = hora(primero?.llegada ?? '')
  const servicios = horarios(primero?.horarios ?? [])
  const pendiente = ordenados.some((b) => b.estado === 'pendiente')
  const saludo = nombre ? `¡Hola, ${nombre}!` : '¡Hola!'
  const partes = ordenados.map((b) => b.parte?.texto).filter((p): p is string => Boolean(p))

  let asunto: string
  let titulo: string
  let preview: string
  let parrafos: string[]
  const ayuda: string[] = []
  if (pendiente) {
    asunto = `¿Puedes servir ${domingo ? 'este' : 'el'} ${diaCorto(fecha)}? Aún no respondes`
    titulo = `¿Puedes servir ${donde}?`
    preview = `${roles} · servicios ${servicios}, llegada ${llegada}. Responde con un toque.`
    parrafos = [
      `${saludo} ${remitente ? `${remitente} te programó` : 'Te programaron'} para ${donde} y aún no sabemos si puedes. Responde con un toque para que ${remitente ? 'pueda' : 'puedan'} organizar el equipo.`,
    ]
    ayuda.push('También puedes responder desde tu panel en Global Connect, en «Mis servicios».')
  } else {
    asunto = `${mayuscula(donde)} sirves · ${roles}, llegada ${llegada}`
    titulo = `${mayuscula(donde)} sirves`
    preview =
      partes.length > 0
        ? `${mayuscula(diaCorto(fecha))} · servicios ${servicios}. Tu parte: ${partes.join('; ')}.`
        : `${mayuscula(diaCorto(fecha))} · servicios ${servicios} · llegada ${llegada}.`
    parrafos = [`${saludo} Te recordamos tu servicio de ${donde}. Gracias por confirmar.`]
    ayuda.push(
      `¿Ya no puedes? Avísalo cuanto antes desde el servicio en Global Connect con «Cambiar respuesta»${remitente ? `, para que ${remitente} busque a alguien` : ''}.`,
    )
  }
  ayuda.push(respondeA && remitente ? `¿Dudas? Responde este correo y le llega a ${remitente}.` : '¿Dudas? Escríbele a quien planifica tu equipo.')

  return { asunto, preview, titulo, parrafos, ayuda, pie: [`Recibes este recordatorio ${diasAntes(dias)}; tu director puede cambiarlo.`] }
}

export const asuntoRecordatorio = (props: RecordatorioEmailProps): string => contenidoRecordatorio(props).asunto

interface FilaVista {
  readonly etiqueta: string
  readonly valor: string
  readonly sub: string | null
  readonly destacada: boolean
}

function filasBloque(b: BloqueRecordatorio): FilaVista[] {
  const fila = (etiqueta: string, valor: string, sub: string | null = null, destacada = false): FilaVista => ({ etiqueta, valor, sub, destacada })
  const filas = [
    fila(b.roles.length > 1 ? 'Tus puestos' : 'Tu puesto', rolesTexto(b.roles)),
    fila('Servicios', horarios(b.horarios)),
    fila('Llegada', hora(b.llegada), null, true),
  ]
  if (b.parte) filas.push(fila('Tu parte', b.parte.texto, b.parte.detalle))
  return filas.filter((f) => f.valor)
}

const otrosServicios = (o: OrdenRecordatorio): string => (o.otros.length > 0 ? `A las ${enLista(o.otros)} es el mismo orden.` : '')
const resumenEquipo = (e: EquipoRecordatorio): string => `${personas(e.personas)} · ${e.confirmaron} confirmaron`
const direcciones = (e: EquipoRecordatorio): string => e.direcciones.map((d) => `${d.nombre} ${d.personas}`).join(' · ')

/** The plain-text version (clients without HTML). */
export function textoRecordatorio(props: RecordatorioEmailProps): string {
  const c = contenidoRecordatorio(props)
  const partes: string[] = [MARCA.toUpperCase(), c.titulo, ...c.parrafos]
  for (const b of [...props.bloques].sort((x, y) => x.fecha.localeCompare(y.fecha))) {
    const lineas = [LINEA, fechaLarga(b.fecha).toUpperCase(), contexto(b), `Estado: ${b.estado === 'confirmo' ? 'Confirmaste' : 'Pendiente de respuesta'}`]
    for (const f of filasBloque(b)) lineas.push(`${f.etiqueta}: ${f.valor}${f.sub ? ` (${f.sub})` : ''}`)
    if (b.urlConfirmar) {
      lineas.push(`\nConfirmar (un toque, sin iniciar sesión):\n${b.urlConfirmar}`)
      if (b.urlNoPuedo) lineas.push(`\nNo puedo (abre Global Connect para escribir el motivo):\n${b.urlNoPuedo}`)
    }
    lineas.push(`\n${b.urlConfirmar ? 'Ver en Global Connect' : 'Ver el servicio en Global Connect'}:\n${b.urlVer}`)
    partes.push(lineas.filter(Boolean).join('\n'))
    if (b.orden && b.orden.filas.length > 0) {
      const encabezado = `ORDEN DEL SERVICIO (${b.orden.hora}${b.orden.otros.length > 0 ? `; a las ${enLista(b.orden.otros)} es el mismo orden` : ''})`
      const filas = b.orden.filas.map(
        (f) => `${(f.hora ?? '').padStart(5)}  ${f.titulo}${f.detalle ? ` · ${f.detalle}` : ''}${f.duracion ? ` (${f.duracion})` : ''}${f.mia ? '   ← TÚ' : ''}`,
      )
      partes.push([LINEA, encabezado, ...filas].join('\n'))
    }
    if (b.equipo) {
      partes.push([LINEA, 'QUIÉNES SIRVEN CONTIGO', resumenEquipo(b.equipo), direcciones(b.equipo), `Ver quiénes sirven contigo:\n${b.urlVer}`].filter(Boolean).join('\n'))
    }
  }
  partes.push(`${LINEA}\n${c.ayuda.join('\n\n')}`)
  partes.push(`${LINEA}\nYo Soy Global · Campus Barquisimeto\n${c.pie.join('\n')}`)
  return partes.join('\n\n')
}

const llegadaGrande = { fontSize: '22px', fontWeight: '700' as const, color: colores.marca, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }
const celdaOrden = { fontSize: '14px', color: colores.titulo, padding: '6px 8px 6px 0', verticalAlign: 'top' as const, borderTop: `1px solid ${colores.borde}` }
const marcaTu = {
  display: 'inline-block' as const,
  marginLeft: '6px',
  padding: '1px 6px',
  borderRadius: '6px',
  fontSize: '11px',
  fontWeight: '700' as const,
  color: '#ffffff',
  backgroundColor: colores.marca,
}

function Servicio({ b }: { b: BloqueRecordatorio }): ReactElement {
  const confirmado = b.estado === 'confirmo'
  const ctx = contexto(b)
  return (
    <Section style={estilos.bloque}>
      <Text style={{ ...estilos.estado, color: confirmado ? colores.exito : colores.aviso }}>{`● ${confirmado ? 'Confirmaste' : 'Pendiente de respuesta'}`}</Text>
      <Text style={estilos.fecha}>{fechaLarga(b.fecha)}</Text>
      {ctx ? <Text style={estilos.serie}>{ctx}</Text> : null}
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {filasBloque(b).map((f) => (
            <tr key={f.etiqueta}>
              <th scope="row" style={{ ...estilos.etiqueta, textAlign: 'left', fontWeight: 400 }}>
                {f.etiqueta}
              </th>
              <td style={estilos.valor}>
                {f.destacada ? <span style={llegadaGrande}>{f.valor}</span> : f.valor}
                {f.sub ? <span style={estilos.sub}>{f.sub}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {b.urlConfirmar ? (
        <Section style={{ margin: '16px 0 0' }}>
          <Row>
            <Column style={{ width: '50%', paddingRight: '6px' }}>
              <Button href={b.urlConfirmar} style={estilos.botonPrimario}>
                Confirmar
              </Button>
            </Column>
            {b.urlNoPuedo ? (
              <Column style={{ width: '50%', paddingLeft: '6px' }}>
                <Button href={b.urlNoPuedo} style={estilos.botonSecundario}>
                  No puedo
                </Button>
              </Column>
            ) : null}
          </Row>
          <Text style={estilos.pista}>Confirmas con un toque, sin iniciar sesión.</Text>
        </Section>
      ) : null}
      <Text style={{ margin: '14px 0 0' }}>
        <Link href={b.urlVer} style={estilos.enlace}>
          {`${b.urlConfirmar ? 'Ver en Global Connect' : 'Ver el servicio en Global Connect'} ›`}
        </Link>
      </Text>
    </Section>
  )
}

function Orden({ o }: { o: OrdenRecordatorio }): ReactElement {
  return (
    <Section style={estilos.bloque}>
      <Text style={estilos.fecha}>Orden del servicio</Text>
      <Text style={estilos.serie}>{`Servicio de las ${o.hora}.${o.otros.length > 0 ? ` ${otrosServicios(o)}` : ''}`}</Text>
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {o.filas.map((f, i) => (
            <tr key={`${f.titulo}-${i}`}>
              <td style={{ ...celdaOrden, width: '52px', color: colores.tenue, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{f.hora ?? ''}</td>
              <td style={celdaOrden}>
                {f.mia ? <b>{f.titulo}</b> : f.titulo}
                {f.mia ? <span style={marcaTu}>Tú</span> : null}
                {f.detalle ? <span style={estilos.sub}>{f.detalle}</span> : null}
              </td>
              <td style={{ ...celdaOrden, textAlign: 'right', color: colores.tenue, whiteSpace: 'nowrap' }}>{f.duracion ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}

function Equipo({ e, url }: { e: EquipoRecordatorio; url: string }): ReactElement {
  return (
    <Section style={estilos.bloque}>
      <Text style={estilos.fecha}>Quiénes sirven contigo</Text>
      <Text style={{ ...estilos.texto, margin: '4px 0 2px', color: colores.titulo }}>{resumenEquipo(e)}</Text>
      {e.direcciones.length > 0 ? <Text style={{ ...estilos.serie, margin: '0' }}>{direcciones(e)}</Text> : null}
      <Text style={{ margin: '12px 0 0' }}>
        <Link href={url} style={estilos.enlace}>
          Ver quiénes sirven contigo ›
        </Link>
      </Text>
    </Section>
  )
}

export function RecordatorioEmail(props: RecordatorioEmailProps): ReactElement {
  const c = contenidoRecordatorio(props)
  const bloques = [...props.bloques].sort((a, b) => a.fecha.localeCompare(b.fecha))
  return (
    <EmailLayout
      preview={c.preview}
      avisoRespuesta={props.respondeA && props.remitente ? `Si respondes este correo, tu respuesta le llega a ${props.remitente}.` : undefined}
    >
      <Text style={estilos.marca}>{MARCA}</Text>
      <Text style={estilos.titulo}>{c.titulo}</Text>
      {c.parrafos.map((p) => (
        <Text key={p} style={estilos.texto}>
          {p}
        </Text>
      ))}
      {bloques.map((b, i) => (
        <Section key={`${b.fecha}-${i}`}>
          <Servicio b={b} />
          {b.orden && b.orden.filas.length > 0 ? <Orden o={b.orden} /> : null}
          {b.equipo ? <Equipo e={b.equipo} url={b.urlVer} /> : null}
        </Section>
      ))}
      <Section style={{ borderTop: `1px solid ${colores.borde}`, paddingTop: '16px', marginTop: '8px' }}>
        {c.ayuda.map((a) => (
          <Text key={a} style={estilos.ayuda}>
            {a}
          </Text>
        ))}
      </Section>
      {c.pie.map((p) => (
        <Text key={p} style={estilos.pie}>
          {p}
        </Text>
      ))}
    </EmailLayout>
  )
}
