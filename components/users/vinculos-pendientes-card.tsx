"use client"

import { useEffect, useState } from "react"
import { Check, Link2, X } from "lucide-react"
import {
  listarVinculosPendientes,
  resolverVinculoPendiente,
  type VinculoPendiente,
} from "@/lib/actions/auth.actions"
import { listarFamiliaPendientes, resolverFamiliaPendiente } from "@/lib/actions/familia-pendientes.actions"
import { AvisoFormulario } from "@/components/forms/aviso-formulario"
import { DetalleResponsivo } from "@/components/ui/detalle-responsivo"
import { EstadoVacioSistema } from "@/components/ui/estado-vacio-sistema"
import { BotonSistema } from "@/components/ui/sistema-diseno"
import { SeccionFamilia } from "@/components/users/familia-pendientes/seccion-familia"
import {
  quitaFilaFamilia,
  resultadoFamilia,
  resumenAviso,
  type SolicitudFamiliaPendiente,
} from "@/lib/platform/usuarios/familia-pendientes-vista"

/**
 * Signups matched by cédula to a ficha that holds a service role. Only the
 * people who may resolve them (director de etapa, director general, pastor,
 * admin) get rows back, so for everybody else this renders nothing.
 *
 * On /users (S13; prototype 01-lista-escritorio.html, `renderVinculos`) it is
 * a brand notice with the count and "Revisar", which opens a panel (side
 * panel from md, bottom sheet below) with each masked request and its
 * Aprobar / Rechazar actions. The panel stays open after the last one, with
 * its empty state.
 *
 * S15 decision 10 adds the family requests (familia_pendientes_listar): the
 * notice counts both kinds ("N vínculos pendientes" + "X cuentas por cédula ·
 * Y de familia") and the panel lists a «Familia» section above the cédula one.
 */
export function VinculosPendientesCard() {
  const [solicitudes, setSolicitudes] = useState<VinculoPendiente[]>([])
  const [familia, setFamilia] = useState<SolicitudFamiliaPendiente[]>([])
  const [enCurso, setEnCurso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState("")
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    let activo = true
    listarVinculosPendientes().then((res) => {
      if (activo) setSolicitudes(res.solicitudes)
    })
    listarFamiliaPendientes().then((res) => {
      if (activo) setFamilia(res.solicitudes)
    })
    return () => {
      activo = false
    }
  }, [])

  async function resolver(solicitud: VinculoPendiente, aprobar: boolean) {
    setEnCurso(solicitud.id)
    setError(null)
    setMensaje("")
    const res = await resolverVinculoPendiente(solicitud.id, aprobar)
    setEnCurso(null)
    if (res.ok) {
      setSolicitudes((actuales) => actuales.filter((s) => s.id !== solicitud.id))
      setMensaje(`${aprobar ? "Aprobado" : "Rechazado"}: ${solicitud.nombre_enmascarado}`)
    } else {
      setError(res.message)
    }
  }

  async function resolverFamilia(solicitud: SolicitudFamiliaPendiente, aprobar: boolean) {
    setEnCurso(solicitud.id)
    setError(null)
    setMensaje("")
    const res = await resolverFamiliaPendiente(solicitud.id, aprobar)
    setEnCurso(null)
    const quitar = () => setFamilia((actuales) => actuales.filter((s) => s.id !== solicitud.id))
    if (res.ok) {
      quitar()
      setMensaje(resultadoFamilia(solicitud, res.codigo, res.fichaCreada))
    } else {
      if (quitaFilaFamilia(res.codigo)) quitar()
      setError(res.mensaje)
    }
  }

  const cantidad = solicitudes.length
  const resumen = resumenAviso(cantidad, familia.length)
  if (!resumen && !abierto) return null

  return (
    <>
      {resumen && (
        <AvisoFormulario tono="marca" className="flex items-center gap-3 px-4 py-3">
          <Link2 className="size-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">
              <span className="font-mono tabular-nums">{resumen.total}</span> <span>{resumen.titulo}</span>
            </p>
            <p className="text-[13px] text-muted-foreground">{resumen.desglose}</p>
            {familia.length === 0 && (
              <p className="text-[13px] text-muted-foreground">Se registraron con la cédula de una ficha con servicio.</p>
            )}
          </div>
          <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => setAbierto(true)}>
            Revisar
          </BotonSistema>
        </AvisoFormulario>
      )}

      <DetalleResponsivo
        abierto={abierto}
        onCambioAbierto={setAbierto}
        titulo="Vínculos pendientes"
        descripcion="Cuentas por cédula y familias de tu campus"
      >
        <div className="space-y-4">
          <AvisoFormulario tono="info">
            Apruébalo solo si conoces a las personas. Una cuenta aprobada queda unida a la ficha y a sus servicios; una familia
            aprobada aparece en Mi familia de los dos, y una ficha sin cuenta queda a cargo de quien la agregó y de tu campus.
          </AvisoFormulario>
          <p role="status" className="text-sm text-muted-foreground empty:hidden">
            {mensaje}
          </p>
          {error && (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          )}
          <SeccionFamilia solicitudes={familia} enCurso={enCurso} onResolver={resolverFamilia} />
          {cantidad > 0 && (
            <section aria-labelledby="vinculos-cuentas" className="space-y-1">
              <h3 id="vinculos-cuentas" className="text-[13px] font-semibold text-muted-foreground">
                Cuentas por cédula
              </h3>
              <ul className="divide-y divide-border">
                {solicitudes.map((s) => (
                  <li key={s.id} className="flex flex-col gap-2 py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {s.nombre_enmascarado} · Cédula <span className="font-mono tabular-nums">{s.cedula_enmascarada}</span>
                      </p>
                      {s.correo_solicitante && (
                        <p className="truncate text-[13px] text-muted-foreground">Solicitado por {s.correo_solicitante}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <BotonSistema tamaño="sm" variante="primario" disabled={enCurso === s.id} onClick={() => resolver(s, true)} icono={Check}>
                        Aprobar
                      </BotonSistema>
                      <BotonSistema tamaño="sm" variante="outline" disabled={enCurso === s.id} onClick={() => resolver(s, false)} icono={X}>
                        Rechazar
                      </BotonSistema>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!resumen && (
            <EstadoVacioSistema icono={Link2} titulo="No quedan vínculos pendientes" subtitulo="Te avisaremos cuando llegue otro." />
          )}
        </div>
      </DetalleResponsivo>
    </>
  )
}
