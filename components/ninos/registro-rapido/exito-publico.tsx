'use client'

/**
 * The end of the public registration (prototype 01, state E): the
 * pre-registration waits for the table. It repeats only what the parent just
 * typed on this phone; the server sends nothing of the family back.
 */
import { CheckCircle2 } from 'lucide-react'

import { TituloSistema, TextoSistema } from '@/components/ui/sistema-diseno'

type Props = {
  /** First names of the children, as typed. */
  ninos: readonly string[]
  /** First names of the other pickup people. */
  otrosRetiran: readonly string[]
  conCorreo: boolean
  /** The service the family told the table about in "¿Vienen hoy?". */
  llegada: string | null
}

function lista(nombres: readonly string[]): string {
  return nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}` : (nombres[0] ?? '')
}

export function ExitoPublico({ ninos, otrosRetiran, conCorreo, llegada }: Props) {
  return (
    <div role="status" className="grid gap-5 rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
      <CheckCircle2 className="mx-auto size-16 text-success-text" aria-hidden />
      <TituloSistema nivel={1}>¡Listo, gracias!</TituloSistema>
      {llegada && (
        <TextoSistema tamaño="lg">
          Le avisamos a la mesa que vienen a las <b className="font-mono tabular-nums">{llegada}</b>.
        </TextoSistema>
      )}
      <ol className="grid gap-3 text-left text-[15px] text-foreground">
        <li className="grid gap-0.5">
          <span>Acércate a la mesa de Niños{ninos.length > 0 ? ` con ${lista(ninos)}` : ' con tus niños'}.</span>
          <small className="text-[13px] text-muted-foreground">Di tu teléfono: tus datos ya están ahí.</small>
        </li>
        <li className="grid gap-0.5">
          <span>Confirmamos y te damos el código de retiro.</span>
          <small className="text-[13px] text-muted-foreground">Va en la etiqueta de cada niño y en la tuya.</small>
        </li>
        <li>Al terminar, retiras {otrosRetiran.length > 0 ? `tú o ${lista(otrosRetiran)}` : 'tú'} con ese código.</li>
      </ol>
      {conCorreo && (
        <TextoSistema variante="sutil">Te enviaremos un correo para crear tu cuenta cuando confirmemos en la mesa.</TextoSistema>
      )}
    </div>
  )
}
