/**
 * The "Supervisión" view of /mis-uno-a-uno (odd/tasks/uno-a-uno.md, T7):
 *
 *   - Líderes (S7.4): every leader of the user's chain with how many people
 *     they lead, realizados in the last 30 days, agendados and the last 1:1,
 *     in the database order (longest without a 1:1 first), flagged when they
 *     had none in 30 days;
 *   - 1 a 1 recientes (S7.2): the chain's 1:1s of the last 90 days.
 *
 * Read-only, and there is no private note to show: UnoAUnoSupervisado has
 * none. Rendered on the server.
 */

import type { ReactElement } from 'react'
import { CalendarDays, MapPin } from 'lucide-react'

import { BadgeSistema, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { formatearFechaHora } from '@/lib/uno-a-uno/fecha'
import {
  DIAS_SUPERVISION_LIDERES,
  DIAS_SUPERVISION_RECIENTES,
  nombresDe,
  type EstadoUnoAUno,
  type LiderSupervisado,
  type UnoAUnoSupervisado,
} from '@/lib/uno-a-uno/vista'

import { CelebracionUnoAUno, Detalle } from './detalles-uno-a-uno'

const ESTADOS: Record<EstadoUnoAUno, { etiqueta: string; variante: 'info' | 'success' | 'default' }> = {
  agendado: { etiqueta: 'Agendado', variante: 'info' },
  realizado: { etiqueta: 'Realizado', variante: 'success' },
  cancelado: { etiqueta: 'Cancelado', variante: 'default' },
}

function Dato({ termino, valor }: { termino: string; valor: string }): ReactElement {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{termino}</dt>
      <dd className="text-sm font-medium text-foreground">{valor}</dd>
    </div>
  )
}

function TarjetaLider({ lider }: { lider: LiderSupervisado }): ReactElement {
  const nombre = nombresDe([{ id: lider.usuarioId, nombre: lider.nombre, apellido: lider.apellido }])
  return (
    <li aria-label={nombre}>
      <TarjetaSistema variante="outlined" className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <TituloSistema nivel={3} className="text-base">
            {nombre}
          </TituloSistema>
          {lider.realizados === 0 ? (
            <BadgeSistema variante="warning" tamaño="sm">
              {`Sin 1 a 1 en ${DIAS_SUPERVISION_LIDERES} días`}
            </BadgeSistema>
          ) : null}
        </div>
        {lider.contextos.length > 0 ? (
          <TextoSistema variante="sutil" tamaño="sm">
            {lider.contextos.join(', ')}
          </TextoSistema>
        ) : null}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Dato termino="Dirigidos" valor={String(lider.dirigidos)} />
          <Dato termino={`Realizados (${DIAS_SUPERVISION_LIDERES} días)`} valor={String(lider.realizados)} />
          <Dato termino="Agendados" valor={String(lider.agendados)} />
          <Dato termino="Último 1 a 1" valor={formatearFechaHora(lider.ultimoRealizado) || 'Nunca'} />
        </dl>
      </TarjetaSistema>
    </li>
  )
}

function TarjetaSupervisada({ u }: { u: UnoAUnoSupervisado }): ReactElement {
  const estado = ESTADOS[u.estado]
  return (
    <TarjetaSistema variante="outlined" className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <TituloSistema nivel={3} className="text-base">
          {`${nombresDe(u.lideres)} → ${nombresDe(u.dirigidos)}`}
        </TituloSistema>
        <BadgeSistema variante={estado.variante} tamaño="sm">
          {estado.etiqueta}
        </BadgeSistema>
      </div>

      <div className="space-y-1">
        <Detalle icono={CalendarDays}>{formatearFechaHora(u.fechaHora)}</Detalle>
        {u.lugar ? <Detalle icono={MapPin}>{u.lugar}</Detalle> : null}
      </div>

      {u.resumen ? (
        <TextoSistema tamaño="sm" className="whitespace-pre-line">
          {u.resumen}
        </TextoSistema>
      ) : null}

      {u.celebracion ? <CelebracionUnoAUno texto={u.celebracion} /> : null}

      {u.estado === 'cancelado' && u.motivoCancelacion ? (
        <TextoSistema variante="sutil" tamaño="sm">{`Motivo: ${u.motivoCancelacion}`}</TextoSistema>
      ) : null}
    </TarjetaSistema>
  )
}

interface Props {
  readonly lideres: readonly LiderSupervisado[]
  readonly recientes: readonly UnoAUnoSupervisado[]
}

export function SupervisionUnoAUno({ lideres, recientes }: Props): ReactElement {
  return (
    <div className="space-y-8">
      <section className="space-y-3" aria-label="Líderes">
        <div className="space-y-1">
          <TituloSistema nivel={2} className="text-lg">
            {`Líderes (${lideres.length})`}
          </TituloSistema>
          <TextoSistema variante="sutil" tamaño="sm">
            Primero quien lleva más tiempo sin un 1 a 1.
          </TextoSistema>
        </div>
        {lideres.length === 0 ? (
          <TextoSistema variante="sutil">No hay líderes en tu cadena de supervisión.</TextoSistema>
        ) : (
          <ul aria-label="Líderes" className="grid gap-3 lg:grid-cols-2">
            {lideres.map((lider) => (
              <TarjetaLider key={lider.usuarioId} lider={lider} />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-label="1 a 1 recientes">
        <div className="space-y-1">
          <TituloSistema nivel={2} className="text-lg">
            {`1 a 1 recientes (${recientes.length})`}
          </TituloSistema>
          <TextoSistema variante="sutil" tamaño="sm">
            {`Los de tu cadena en los últimos ${DIAS_SUPERVISION_RECIENTES} días.`}
          </TextoSistema>
        </div>
        {recientes.length === 0 ? (
          <TextoSistema variante="sutil">{`No hay 1 a 1 en los últimos ${DIAS_SUPERVISION_RECIENTES} días.`}</TextoSistema>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {recientes.map((u) => (
              <TarjetaSupervisada key={u.id} u={u} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
