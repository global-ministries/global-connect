/**
 * "Mis hijos" on the dashboard (R3b of odd/tasks/ninos-roles-validacion.md):
 * an adult parent finds their children without knowing Mi Perfil, and during
 * a precheck window "Voy en camino" is right here. The data comes from
 * cargarMisHijosDashboard, which already hides it from minors.
 */
import { Baby } from 'lucide-react'

import { VoyEnCamino } from '@/components/perfil/voy-en-camino'
import { EnlaceSistema, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { DESTINO_MIS_HIJOS } from '@/lib/auth/destino-mis-hijos'
import type { MiHijo } from '@/lib/platform/ninos/mis-hijos'
import type { MisPrechecks } from '@/lib/platform/ninos/precheck'

type Props = {
  hijos: MiHijo[]
  prechecks: MisPrechecks
}

function listaDeNombres(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

export function TarjetaMisHijosDashboard({ hijos, prechecks }: Props) {
  if (hijos.length === 0) return null

  return (
    <TarjetaSistema className="p-4 md:p-5">
      <section aria-labelledby="mis-hijos-dashboard" className="space-y-3">
        <div className="flex items-start gap-3">
          <Baby className="mt-1 h-5 w-5 shrink-0 text-[var(--brand-primary)]" aria-hidden />
          <div className="min-w-0 space-y-1">
            <TituloSistema id="mis-hijos-dashboard" nivel={2}>
              Mis hijos
            </TituloSistema>
            <TextoSistema variante="sutil" tamaño="sm" className="break-words">
              {listaDeNombres(hijos.map((h) => h.nombre))} · Waumba Land / UpStreet
            </TextoSistema>
          </div>
        </div>
        <VoyEnCamino hijos={hijos} prechecks={prechecks} />
        <EnlaceSistema variante="marca" href={DESTINO_MIS_HIJOS} className="inline-flex min-h-[44px] items-center text-sm">
          Ver a mis hijos
        </EnlaceSistema>
      </section>
    </TarjetaSistema>
  )
}
