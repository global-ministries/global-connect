/**
 * The sections of "Mis 1 a 1" (odd/tasks/uno-a-uno.md, T4): Próximos,
 * Realizados and Cancelados. Each card names the other side (couples
 * together). Only the leader side sees the actions and, once realizado, the
 * resumen and the private note (mis_uno_a_uno already nulls them for the
 * dirigido side). Rendered on the server; the dialogs are client islands.
 */

import type { ReactElement, ReactNode } from 'react'
import { CalendarDays, Lock, MapPin } from 'lucide-react'

import { BadgeSistema, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { formatearFechaHora } from '@/lib/uno-a-uno/fecha'
import { agruparUnoAUno, nombresDe, type UnoAUno } from '@/lib/uno-a-uno/vista'

import { CancelarUnoAUnoDialog } from './cancelar-uno-a-uno'
import { RegistrarUnoAUnoDialog } from './registrar-uno-a-uno'
import { ReprogramarUnoAUnoDialog } from './reprogramar-uno-a-uno'

function conQuien(u: UnoAUno): string {
  return nombresDe(u.miLado === 'lider' ? u.dirigidos : u.lideres)
}

function etiquetaLado(u: UnoAUno): string {
  if (u.miLado === 'lider') return 'Tú lideras'
  return u.lideres.length > 1 ? 'Te lideran' : 'Te lidera'
}

function Detalle({ icono: Icono, children }: { icono: typeof MapPin; children: ReactNode }): ReactElement {
  return (
    <TextoSistema variante="sutil" tamaño="sm" className="flex items-center gap-1.5">
      <Icono className="h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </TextoSistema>
  )
}

function TarjetaUnoAUno({ u }: { u: UnoAUno }): ReactElement {
  const nombres = conQuien(u)
  const esLider = u.miLado === 'lider'
  return (
    <TarjetaSistema variante="outlined" className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <TituloSistema nivel={3} className="text-base">
          {nombres}
        </TituloSistema>
        <BadgeSistema variante={esLider ? 'info' : 'default'} tamaño="sm">
          {etiquetaLado(u)}
        </BadgeSistema>
      </div>

      <div className="space-y-1">
        <Detalle icono={CalendarDays}>{formatearFechaHora(u.fechaHora)}</Detalle>
        {u.lugar ? <Detalle icono={MapPin}>{u.lugar}</Detalle> : null}
      </div>

      {u.estado === 'realizado' && esLider && u.resumen ? (
        <div className="space-y-2">
          <TextoSistema tamaño="sm" className="whitespace-pre-line">
            {u.resumen}
          </TextoSistema>
          {u.notaPrivada ? (
            <div className="rounded-lg bg-muted/50 p-3">
              <Detalle icono={Lock}>Nota privada</Detalle>
              <TextoSistema tamaño="sm" className="mt-1 whitespace-pre-line">
                {u.notaPrivada}
              </TextoSistema>
            </div>
          ) : null}
        </div>
      ) : null}

      {u.estado === 'cancelado' && u.motivoCancelacion ? (
        <TextoSistema variante="sutil" tamaño="sm">{`Motivo: ${u.motivoCancelacion}`}</TextoSistema>
      ) : null}

      {u.estado === 'agendado' && esLider ? (
        <div className="flex flex-wrap items-center gap-2">
          <RegistrarUnoAUnoDialog unoAUnoId={u.id} conQuien={nombres} />
          <ReprogramarUnoAUnoDialog unoAUnoId={u.id} fechaHora={u.fechaHora} />
          <CancelarUnoAUnoDialog unoAUnoId={u.id} conQuien={nombres} />
        </div>
      ) : null}
    </TarjetaSistema>
  )
}

function Seccion({
  titulo,
  lista,
  vacio,
}: {
  titulo: string
  lista: readonly UnoAUno[]
  vacio: string
}): ReactElement {
  return (
    <section className="space-y-3" aria-label={titulo}>
      <TituloSistema nivel={2} className="text-lg">
        {`${titulo} (${lista.length})`}
      </TituloSistema>
      {lista.length === 0 ? (
        <TextoSistema variante="sutil">{vacio}</TextoSistema>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {lista.map((u) => (
            <TarjetaUnoAUno key={u.id} u={u} />
          ))}
        </div>
      )}
    </section>
  )
}

interface Props {
  readonly lista: readonly UnoAUno[]
  /** Whether the user leads someone (they get the "Agendar" hint). */
  readonly lideraAAlguien: boolean
}

export function ListaUnoAUno({ lista, lideraAAlguien }: Props): ReactElement {
  const { proximos, realizados, cancelados } = agruparUnoAUno(lista)
  return (
    <div className="space-y-8">
      <Seccion
        titulo="Próximos"
        lista={proximos}
        vacio={
          lideraAAlguien
            ? 'No tienes 1 a 1 agendados. Usa «Agendar 1 a 1» para programar el próximo.'
            : 'No tienes 1 a 1 agendados.'
        }
      />
      <Seccion titulo="Realizados" lista={realizados} vacio="Todavía no hay 1 a 1 registrados." />
      {cancelados.length > 0 ? <Seccion titulo="Cancelados" lista={cancelados} vacio="" /> : null}
    </div>
  )
}
