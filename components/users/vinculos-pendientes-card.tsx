"use client"

import { useEffect, useState } from "react"
import { Check, Link2, X } from "lucide-react"
import {
  listarVinculosPendientes,
  resolverVinculoPendiente,
  type VinculoPendiente,
} from "@/lib/actions/auth.actions"
import { BotonSistema, TarjetaSistema, TextoSistema, TituloSistema } from "@/components/ui/sistema-diseno"

/**
 * Signups matched by cédula to a ficha that holds a service role. Only the
 * people who may resolve them (director de etapa, director general, pastor,
 * admin) get rows back, so for everybody else the card renders nothing.
 */
export function VinculosPendientesCard() {
  const [solicitudes, setSolicitudes] = useState<VinculoPendiente[]>([])
  const [enCurso, setEnCurso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    listarVinculosPendientes().then((res) => {
      if (activo) setSolicitudes(res.solicitudes)
    })
    return () => {
      activo = false
    }
  }, [])

  async function resolver(id: string, aprobar: boolean) {
    setEnCurso(id)
    setError(null)
    const res = await resolverVinculoPendiente(id, aprobar)
    setEnCurso(null)
    if (res.ok) {
      setSolicitudes((actuales) => actuales.filter((s) => s.id !== id))
    } else {
      setError(res.message)
    }
  }

  if (solicitudes.length === 0) return null

  return (
    <TarjetaSistema className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-5 w-5 text-orange-500" aria-hidden="true" />
        <TituloSistema nivel={3}>Vínculos pendientes</TituloSistema>
      </div>
      <TextoSistema variante="sutil" tamaño="sm">
        Personas que se registraron con la cédula de una ficha con servicio. Aprueba solo si
        reconoces a quien lo pide.
      </TextoSistema>
      {error && (
        <TextoSistema tamaño="sm" className="text-red-600" role="alert">
          {error}
        </TextoSistema>
      )}
      <ul className="divide-y divide-border">
        {solicitudes.map((s) => (
          <li key={s.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <TextoSistema className="font-medium">
                {s.nombre_enmascarado} · Cédula {s.cedula_enmascarada}
              </TextoSistema>
              {s.correo_solicitante && (
                <TextoSistema variante="sutil" tamaño="sm" className="truncate">
                  Solicitado por {s.correo_solicitante}
                </TextoSistema>
              )}
            </div>
            <div className="flex gap-2">
              <BotonSistema
                tamaño="sm"
                variante="primario"
                disabled={enCurso === s.id}
                onClick={() => resolver(s.id, true)}
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                Aprobar
              </BotonSistema>
              <BotonSistema
                tamaño="sm"
                variante="outline"
                disabled={enCurso === s.id}
                onClick={() => resolver(s.id, false)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Rechazar
              </BotonSistema>
            </div>
          </li>
        ))}
      </ul>
    </TarjetaSistema>
  )
}
