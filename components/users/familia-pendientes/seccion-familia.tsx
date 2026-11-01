"use client"

import { Check, X } from "lucide-react"
import { BotonSistema } from "@/components/ui/sistema-diseno"
import {
  detalleSolicitudFamilia,
  etiquetaAprobar,
  textoSolicitudFamilia,
  type SolicitudFamiliaPendiente,
} from "@/lib/platform/usuarios/familia-pendientes-vista"

interface SeccionFamiliaProps {
  readonly solicitudes: readonly SolicitudFamiliaPendiente[]
  readonly enCurso: string | null
  readonly onResolver: (solicitud: SolicitudFamiliaPendiente, aprobar: boolean) => void
}

/**
 * The «Familia» section of the Vínculos pendientes panel (S15 decision 10;
 * prototype 07-mi-familia-escritorio.html, `abrirVinculos`): who asks, the
 * relation, the person added or the data typed for one without an account,
 * and Aprobar / Aprobar y crear ficha / Rechazar. The typed cédula and
 * teléfono come from familia_pendientes_listar, which only answers to people
 * who may resolve the request.
 */
export function SeccionFamilia({ solicitudes, enCurso, onResolver }: SeccionFamiliaProps) {
  if (solicitudes.length === 0) return null
  return (
    <section aria-labelledby="vinculos-familia" className="space-y-1">
      <h3 id="vinculos-familia" className="text-[13px] font-semibold text-muted-foreground">
        Familia
      </h3>
      <ul className="divide-y divide-border">
        {solicitudes.map((s) => (
          <li key={s.id} className="flex flex-col gap-2 py-3">
            <div className="min-w-0">
              <p className="font-medium text-foreground">{textoSolicitudFamilia(s)}</p>
              <p className="text-[13px] text-muted-foreground">{detalleSolicitudFamilia(s)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <BotonSistema tamaño="sm" variante="primario" disabled={enCurso === s.id} onClick={() => onResolver(s, true)} icono={Check}>
                {etiquetaAprobar(s)}
              </BotonSistema>
              <BotonSistema tamaño="sm" variante="outline" disabled={enCurso === s.id} onClick={() => onResolver(s, false)} icono={X}>
                Rechazar
              </BotonSistema>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
