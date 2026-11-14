/**
 * DPS — the service notice by e-mail (odd/tasks/dps-asistencia-pco.md, T16b;
 * S14.1, S14.2, S14.5, S14.6; artboards design/dps-avisos-correo 01 and 02).
 * ONE e-mail per person and «Enviar avisos» with everything of that send:
 * invitations (one or several dates, each with its own «Confirmar» / «No
 * puedo»), «Cambió tu servicio» (before → after; hours only keep the
 * answer, another puesto or date asks again) and «Ya no estás programado».
 * Built on EmailLayout (dark, the Global logo); replying reaches the planner
 * who sent it (Reply-To), so the closing paragraph says so — EmailLayout's
 * own footer still says not to reply (reported, the layout is shared).
 * `contenidoAvisoServicio` computes every text once: the HTML and the plain
 * text (`textoAvisoServicio`) say the same.
 */
import { Button, Column, Link, Row, Section, Text } from '@react-email/components'
import type { ReactElement } from 'react'

import { EmailLayout } from '../components/EmailLayout'
import { ETIQUETA_TIPO, type TipoPlan } from '@/lib/platform/dps/planilla'

import {
  LINEA,
  MARCA,
  colores,
  diaCorto,
  enLista,
  esDomingo,
  estilos,
  fechaAbreviada,
  fechaLarga,
  hora,
  horarios,
  nombresRoles,
  rolesTexto,
  type RolEmail,
} from './formato'

export type TipoBloque = 'nueva' | 'cambio' | 'quitado'
export type EstadoBloque = 'pendiente' | 'confirmo' | 'no_puede'

/** One notice of the send, as the person was told it. */
export interface BloqueEmail {
  readonly aviso: TipoBloque
  /** 'YYYY-MM-DD'. */
  readonly fecha: string
  readonly tipo: string
  readonly titulo: string | null
  readonly serie: string | null
  readonly semana: number | null
  readonly roles: readonly RolEmail[]
  readonly horarios: readonly string[]
  readonly llegada: string
  readonly estado: EstadoBloque
  /** What the last change replaced (null when that part did not change). */
  readonly antes: {
    readonly roles: readonly RolEmail[] | null
    readonly fecha: string | null
    readonly horarios: readonly string[] | null
    readonly llegada: string | null
  }
  /** The one-tap link; null when the notice asks for nothing. */
  readonly urlConfirmar: string | null
  /** The service in the app with «No puedo» open. */
  readonly urlNoPuedo: string | null
  readonly urlVer: string
}

export interface AvisoServicioEmailProps {
  /** First name; empty when unknown. */
  readonly nombre: string
  /** Who sent the notices (full name), or null. */
  readonly remitente: string | null
  /** Replies reach the planner (they have an e-mail: the Reply-To). */
  readonly respondeA: boolean
  readonly bloques: readonly BloqueEmail[]
}

type Tono = 'aviso' | 'exito' | 'peligro' | 'neutro'

export interface FilaVista {
  readonly etiqueta: string
  readonly ahora: string
  readonly antes: string | null
  readonly tachado: boolean
  readonly sub: string | null
}

export interface BloqueVista {
  readonly estado: { readonly texto: string; readonly tono: Tono } | null
  readonly fecha: string
  readonly contexto: string
  readonly filas: readonly FilaVista[]
  readonly botones: { readonly confirmar: string; readonly noPuedo: string | null; readonly pista: string } | null
  readonly enlace: { readonly texto: string; readonly url: string }
}

export interface ContenidoAviso {
  readonly asunto: string
  readonly preview: string
  readonly titulo: string
  readonly parrafos: readonly string[]
  readonly secciones: readonly { readonly titulo: string | null; readonly bloques: readonly BloqueVista[] }[]
  readonly ayuda: readonly string[]
  readonly pie: readonly string[]
}

const ORDEN: Record<TipoBloque, number> = { nueva: 0, cambio: 1, quitado: 2 }
const NUMEROS = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco']

function contexto(b: BloqueEmail): string {
  if (b.titulo) return b.titulo
  if (b.serie) return b.semana ? `${b.serie} · Parte ${b.semana}` : b.serie
  return b.tipo && b.tipo !== 'domingo' ? (ETIQUETA_TIPO[b.tipo as TipoPlan] ?? '') : ''
}

/** «domingos 15, 22 y 29» in one month, else «15 nov y 6 dic». */
function fechasCortas(fechas: readonly string[]): string {
  const unicas = [...new Set(fechas)].sort()
  const mismoMes = new Set(unicas.map((f) => f.slice(0, 7))).size === 1
  if (mismoMes && unicas.every(esDomingo)) return `${unicas.length === 1 ? 'domingo' : 'domingos'} ${enLista(unicas.map((f) => String(Number(f.slice(8)))))}`
  return enLista(unicas.map(fechaAbreviada))
}

const cambioPuesto = (b: BloqueEmail): boolean => b.aviso === 'cambio' && b.antes.roles !== null
const cambioFecha = (b: BloqueEmail): boolean => b.aviso === 'cambio' && b.antes.fecha !== null

function estadoBloque(b: BloqueEmail, mezclado: boolean): BloqueVista['estado'] {
  if (b.aviso === 'quitado') return { texto: 'Ya no estás programado', tono: 'neutro' }
  if (b.aviso === 'nueva' && !mezclado) return null
  if (b.estado === 'confirmo') return { texto: 'Sigues confirmado', tono: 'exito' }
  if (b.estado === 'no_puede') return { texto: 'Dijiste que no puedes', tono: 'peligro' }
  return { texto: 'Pendiente de respuesta', tono: 'aviso' }
}

function filasBloque(b: BloqueEmail): FilaVista[] {
  const fila = (etiqueta: string, ahora: string, antes: string | null = null, tachado = false, sub: string | null = null): FilaVista => ({ etiqueta, ahora, antes, tachado, sub })
  const varios = b.roles.length > 1
  if (b.aviso === 'quitado') {
    return [fila(varios ? 'Puestos' : 'Puesto', rolesTexto(b.roles), null, true), fila('Servicios', horarios(b.horarios), null, true)].filter((f) => f.ahora)
  }
  const filas: FilaVista[] = []
  if (b.antes.fecha) filas.push(fila('Fecha', fechaLarga(b.fecha), fechaLarga(b.antes.fecha)))
  if (b.antes.roles) {
    const equipos = [...new Set(b.roles.map((r) => r.equipo).filter(Boolean))]
    filas.push(fila(varios ? 'Tus puestos' : 'Tu puesto', equipos.length <= 1 ? nombresRoles(b.roles) : rolesTexto(b.roles), nombresRoles(b.antes.roles), false, equipos.length === 1 ? (equipos[0] ?? null) : null))
  } else {
    filas.push(fila(varios ? 'Tus puestos' : 'Tu puesto', rolesTexto(b.roles)))
  }
  filas.push(fila('Servicios', horarios(b.horarios), b.antes.horarios ? horarios(b.antes.horarios) : null))
  if (b.llegada) filas.push(fila('Llegada', hora(b.llegada), b.antes.llegada ? hora(b.antes.llegada) : null))
  return filas.filter((f) => f.ahora)
}

function vistaBloque(b: BloqueEmail, mezclado: boolean): BloqueVista {
  const n = b.roles.length
  const pista =
    n > 1
      ? `Confirmas con un toque, sin iniciar sesión. Una respuesta vale para tus ${NUMEROS[n] ?? n} puestos de ese día.`
      : 'Confirmas con un toque, sin iniciar sesión.'
  const enlace =
    b.aviso === 'quitado'
      ? 'Ver mis servicios'
      : b.aviso === 'cambio' && b.urlConfirmar === null
        ? 'Ver o cambiar mi respuesta'
        : 'Ver en Global Connect'
  return {
    estado: estadoBloque(b, mezclado),
    fecha: fechaLarga(b.fecha),
    contexto: contexto(b),
    filas: filasBloque(b),
    botones: b.urlConfirmar ? { confirmar: b.urlConfirmar, noPuedo: b.urlNoPuedo, pista } : null,
    enlace: { texto: enlace, url: b.urlVer },
  }
}

/** Every text of the e-mail, once: subject, preview, title, paragraphs, blocks, help and closing. */
export function contenidoAvisoServicio({ nombre, remitente, respondeA, bloques: entrada }: AvisoServicioEmailProps): ContenidoAviso {
  const bloques = [...entrada].sort((a, b) => ORDEN[a.aviso] - ORDEN[b.aviso] || a.fecha.localeCompare(b.fecha))
  const tipos = new Set(bloques.map((b) => b.aviso))
  const solo = bloques.length === 1 ? bloques[0] : null
  const soloNuevas = tipos.size === 1 && tipos.has('nueva')
  const mezclado = !solo && !soloNuevas
  const domingos = bloques.every((b) => esDomingo(b.fecha))
  const saludo = nombre ? `¡Hola, ${nombre}!` : '¡Hola!'
  const quien = (conRemitente: string, sinRemitente: string) => (remitente ? `${remitente} ${conRemitente}` : sinRemitente)

  let asunto: string
  let titulo: string
  let preview: string
  let parrafos: string[]
  if (solo && solo.aviso === 'nueva') {
    const dia = diaCorto(solo.fecha)
    asunto = `Te invitamos a servir el ${dia} · ${nombresRoles(solo.roles)}`
    titulo = `Te invitamos a servir el ${dia}`
    preview = `Servicios ${horarios(solo.horarios)} · llegada ${hora(solo.llegada)}. Confirma con un toque.`
    parrafos = [`${saludo} ${quien('te programó', 'Te programaron')} para servir ${esDomingo(solo.fecha) ? 'este domingo' : `el ${dia}`}. Revisa los detalles y dinos si puedes.`]
  } else if (solo && solo.aviso === 'cambio') {
    const dia = diaCorto(solo.fecha)
    if (cambioPuesto(solo)) {
      asunto = `Cambió tu puesto del ${dia} · ahora ${nombresRoles(solo.roles)}`
      titulo = `Cambió tu puesto del ${dia}`
      preview = `Pasas de ${nombresRoles(solo.antes.roles ?? [])} a ${nombresRoles(solo.roles)}. Confírmanos de nuevo con un toque.`
      parrafos = [`${saludo} ${quien('te cambió', 'Te cambiaron')} de puesto. Como es otro puesto, necesitamos que confirmes de nuevo.`]
    } else {
      asunto = `Cambió tu servicio del ${dia} · ${nombresRoles(solo.roles)}`
      titulo = `Cambió tu servicio del ${dia}`
      const que = cambioFecha(solo) ? 'la fecha' : 'la hora'
      const cierre =
        cambioFecha(solo) || solo.estado === 'pendiente'
          ? cambioFecha(solo)
            ? 'Necesitamos que confirmes de nuevo.'
            : 'Revisa los detalles y dinos si puedes.'
          : solo.estado === 'confirmo'
            ? 'Como tu puesto es el mismo, sigues confirmado: no tienes que hacer nada.'
            : 'Ya nos dijiste que no puedes: no tienes que hacer nada.'
      preview =
        solo.estado === 'confirmo' && !cambioFecha(solo)
          ? `Ahora: servicios ${horarios(solo.horarios)} · llegada ${hora(solo.llegada)}. Sigues confirmado.`
          : `Ahora: ${diaCorto(solo.fecha)}, servicios ${horarios(solo.horarios)} · llegada ${hora(solo.llegada)}.`
      parrafos = [`${saludo} ${quien('cambió', 'Cambiaron')} ${que} de tu servicio. ${cierre}`]
    }
  } else if (solo) {
    const dia = diaCorto(solo.fecha)
    const roles = nombresRoles(solo.roles)
    asunto = `Ya no estás programado el ${dia}${roles ? ` · ${roles}` : ''}`
    titulo = `Ya no estás programado el ${dia}`
    preview = 'Quien planifica cambió el equipo. No tienes que hacer nada.'
    parrafos = [
      `${saludo} ${quien('ajustó', 'Ajustaron')} el equipo del ${dia} y ese día ya no te toca servir${roles ? ` como ${roles}` : ''}.`,
      'No tienes que hacer nada. Gracias por tu disposición; te avisaremos cuando te toque de nuevo.',
    ]
  } else if (soloNuevas) {
    const cuantos = `${bloques.length} ${domingos ? 'domingos' : 'fechas'}`
    asunto = `Te invitamos a servir ${cuantos} · ${enLista([...new Set(bloques.map((b) => b.fecha))].sort().map(fechaAbreviada))}`
    titulo = `Te invitamos a servir ${cuantos}`
    preview = `${enLista([...new Set(bloques.map((b) => nombresRoles(b.roles)))])}. Responde cada ${domingos ? 'domingo' : 'fecha'} con un toque.`
    parrafos = [
      `${saludo} ${quien('te programó', 'Te programaron')} para ${domingos ? 'estos domingos' : 'estas fechas'}. Responde cada uno por separado: puedes confirmar unos y decir que no a otros.`,
    ]
  } else {
    asunto = `Novedades de tus servicios · ${fechasCortas(bloques.map((b) => b.fecha))}`
    titulo = 'Novedades de tus servicios'
    const del = (tipo: TipoBloque) => fechasCortas(bloques.filter((b) => b.aviso === tipo).map((b) => b.fecha)).replace(/^domingos? /, '')
    preview = mayusculaInicial(
      enLista([
        tipos.has('nueva') ? `te invitamos el ${del('nueva')}` : '',
        tipos.has('cambio') ? `cambió el ${del('cambio')}` : '',
        tipos.has('quitado') ? `ya no estás el ${del('quitado')}` : '',
      ]) + '.',
    )
    parrafos = [`${saludo} ${quien('actualizó', 'Actualizamos')} tus servicios. Esto cambia para ti:`]
  }

  const grupo = (tipo: TipoBloque) => bloques.filter((b) => b.aviso === tipo)
  const secciones: { titulo: string | null; bloques: BloqueVista[] }[] = mezclado
    ? (
        [
          ['nueva', (n: number) => (n === 1 ? 'Nueva invitación · responde' : 'Nuevas invitaciones · responde')],
          ['cambio', (n: number) => (n === 1 ? 'Cambió tu servicio' : 'Cambios en tus servicios')],
          ['quitado', () => 'Ya no estás programado'],
        ] as const
      )
        .map(([tipo, nombreSeccion]) => ({ titulo: nombreSeccion(grupo(tipo).length), bloques: grupo(tipo).map((b) => vistaBloque(b, true)) }))
        .filter((s) => s.bloques.length > 0)
    : [{ titulo: null, bloques: bloques.map((b) => vistaBloque(b, false)) }]

  const ayuda: string[] = []
  if (bloques.some((b) => b.urlConfirmar)) ayuda.push('También puedes responder desde tu panel en Global Connect, en «Mis servicios».')
  if (tipos.has('nueva')) ayuda.push('¿Hay fechas que no puedes servir? Márcalas en «Fechas que no puedo servir» y quien planifica lo verá antes de programarte.')
  if (bloques.some((b) => b.aviso === 'cambio' && b.estado === 'confirmo')) ayuda.push('Si con este cambio ya no puedes, avísalo desde el servicio en Global Connect con «Cambiar respuesta».')
  ayuda.push(respondeA && remitente ? `¿Dudas? Responde este correo y le llega a ${remitente}.` : '¿Dudas? Escríbele a quien planifica tu equipo.')

  const pie = [
    'Recibes este correo porque sirves en el Dream Team de Global.',
  ]

  return { asunto, preview, titulo, parrafos, secciones, ayuda, pie }
}

function mayusculaInicial(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase('es') + texto.slice(1)
}

export const asuntoAvisoServicio = (props: AvisoServicioEmailProps): string => contenidoAvisoServicio(props).asunto

/** The plain-text version (clients without HTML). */
export function textoAvisoServicio(props: AvisoServicioEmailProps): string {
  const c = contenidoAvisoServicio(props)
  const partes: string[] = [MARCA.toUpperCase(), c.titulo, ...c.parrafos]
  for (const s of c.secciones) {
    if (s.titulo) partes.push(`\n${s.titulo.toUpperCase()}`)
    for (const b of s.bloques) {
      const lineas = [LINEA, b.fecha.toUpperCase(), b.contexto, b.estado ? `Estado: ${b.estado.texto}` : '']
      for (const f of b.filas) {
        const valor = f.antes ? `antes ${f.antes} → ahora ${f.ahora} (cambió)` : f.tachado ? `${f.ahora} (ya no)` : f.ahora
        lineas.push(`${f.etiqueta}: ${valor}${f.sub ? ` · ${f.sub}` : ''}`)
      }
      if (b.botones) {
        lineas.push(`\nConfirmar (un toque, sin iniciar sesión):\n${b.botones.confirmar}`)
        if (b.botones.noPuedo) lineas.push(`\nNo puedo (abre Global Connect para escribir el motivo):\n${b.botones.noPuedo}`)
      }
      lineas.push(`\n${b.enlace.texto}:\n${b.enlace.url}`)
      partes.push(lineas.filter(Boolean).join('\n'))
    }
  }
  partes.push(`${LINEA}\n${c.ayuda.join('\n\n')}`)
  partes.push(`${LINEA}\nYo Soy Global · Campus Barquisimeto\n${c.pie.join('\n')}`)
  return partes.join('\n\n')
}

const TONOS: Record<Tono, string> = { aviso: colores.aviso, exito: colores.exito, peligro: colores.peligro, neutro: colores.neutro }

function Bloque({ b }: { b: BloqueVista }): ReactElement {
  return (
    <Section style={estilos.bloque}>
      {b.estado ? <Text style={{ ...estilos.estado, color: TONOS[b.estado.tono] }}>● {b.estado.texto}</Text> : null}
      <Text style={estilos.fecha}>{b.fecha}</Text>
      {b.contexto ? <Text style={estilos.serie}>{b.contexto}</Text> : null}
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {b.filas.map((f) => (
            <tr key={f.etiqueta}>
              <th scope="row" style={{ ...estilos.etiqueta, textAlign: 'left', fontWeight: 400 }}>
                {f.etiqueta}
                {f.antes ? <span style={estilos.cambio}>Cambió</span> : null}
              </th>
              <td style={estilos.valor}>
                {f.antes ? (
                  <>
                    <span style={estilos.antes}>{f.antes}</span> → <b>{f.ahora}</b>
                  </>
                ) : f.tachado ? (
                  <span style={estilos.antes}>{f.ahora}</span>
                ) : (
                  f.ahora
                )}
                {f.sub ? <span style={estilos.sub}>{f.sub}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {b.botones ? (
        <Section style={{ margin: '16px 0 0' }}>
          <Row>
            <Column style={{ width: '50%', paddingRight: '6px' }}>
              <Button href={b.botones.confirmar} style={estilos.botonPrimario}>
                Confirmar
              </Button>
            </Column>
            {b.botones.noPuedo ? (
              <Column style={{ width: '50%', paddingLeft: '6px' }}>
                <Button href={b.botones.noPuedo} style={estilos.botonSecundario}>
                  No puedo
                </Button>
              </Column>
            ) : null}
          </Row>
          <Text style={estilos.pista}>{b.botones.pista}</Text>
        </Section>
      ) : null}
      <Text style={{ margin: '14px 0 0' }}>
        <Link href={b.enlace.url} style={estilos.enlace}>
          {b.enlace.texto} ›
        </Link>
      </Text>
    </Section>
  )
}

export function AvisoServicioEmail(props: AvisoServicioEmailProps): ReactElement {
  const c = contenidoAvisoServicio(props)
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
      {c.secciones.map((s, i) => (
        <Section key={s.titulo ?? i}>
          {s.titulo ? <Text style={estilos.seccion}>{s.titulo}</Text> : null}
          {s.bloques.map((b, j) => (
            <Bloque key={`${b.fecha}-${j}`} b={b} />
          ))}
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
