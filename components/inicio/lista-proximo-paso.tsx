'use client'

/**
 * «Próximo Paso de tus voluntarios» (odd/tasks/home-por-rol.md S5;
 * design/home-por-rol 06): the volunteers of the area without the
 * milestone, each with a «Lo hizo» toggle. The press shows at once and the
 * action confirms it; on error it rolls back, with a toast and the status
 * line. A marked person stays in the list so the mark can be undone.
 */
import { useState, type ReactElement } from 'react'
import { Check } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { marcarProximoPasoVoluntario, type ResultadoProximoPaso } from '@/lib/actions/proximo-paso.actions'
import type { EstadoVoluntario, Voluntario } from '@/lib/inicio/cargar-a-cargo'

import { CLASE_LINEA_FILA, CLASE_LISTA_INSET, EncabezadoSeccion, Numero } from './partes-inicio'

const ESTADO: Record<EstadoVoluntario, string> = { postulado: 'Postulado', en_orientacion: 'En orientación', activo: 'Activo' }

const iniciales = (nombre: string): string =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

export function ListaProximoPaso({ voluntarios, id, ancla }: { readonly voluntarios: readonly Voluntario[]; readonly id: string; readonly ancla?: string }): ReactElement {
  const [hechos, setHechos] = useState<Record<string, boolean>>({})
  const [aviso, setAviso] = useState('')
  const [enCurso, setEnCurso] = useState<ReadonlySet<string>>(new Set())
  const notificar = useNotificaciones()
  const sinMarcar = voluntarios.filter((v) => !hechos[v.usuarioId]).length

  async function alternar(v: Voluntario): Promise<void> {
    // One mark at a time per person: a second press waits for the first answer.
    if (enCurso.has(v.usuarioId)) return
    const nuevo = !hechos[v.usuarioId]
    setHechos((h) => ({ ...h, [v.usuarioId]: nuevo }))
    setEnCurso((s) => new Set(s).add(v.usuarioId))
    let r: ResultadoProximoPaso
    try {
      r = await marcarProximoPasoVoluntario(v.usuarioId, nuevo)
    } catch {
      r = { ok: false, message: 'No pudimos guardar la marca. Inténtalo de nuevo.' }
    }
    setEnCurso((s) => {
      const resto = new Set(s)
      resto.delete(v.usuarioId)
      return resto
    })
    if (!r.ok) {
      setHechos((h) => ({ ...h, [v.usuarioId]: !nuevo }))
      setAviso(r.message)
      notificar.error(r.message)
      return
    }
    setHechos((h) => ({ ...h, [v.usuarioId]: r.hecho }))
    if (r.hecho) setAviso(nuevo ? `Marcado: ${v.nombre} hizo Próximo Paso.` : `${v.nombre} tiene el certificado del taller: sigue marcado.`)
    else setAviso(`Marca quitada a ${v.nombre}.`)
  }

  return (
    <div id={ancla} className="min-w-0 scroll-mt-24">
      <EncabezadoSeccion id={id} titulo="Próximo Paso de tus voluntarios" nivel={3}>
        <span className="shrink-0 text-[13px] text-muted-foreground">
          <Numero>{sinMarcar}</Numero> sin marcar
        </span>
      </EncabezadoSeccion>
      <ul aria-labelledby={id} className={CLASE_LISTA_INSET}>
        {voluntarios.map((v) => {
          const hecho = hechos[v.usuarioId] === true
          return (
            <li key={v.usuarioId} className={CLASE_LINEA_FILA}>
              <div className="flex min-h-16 min-w-0 items-center gap-3 px-3.5 py-2.5">
                <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                  {iniciales(v.nombre)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold text-foreground">{v.nombre}</span>
                  <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{[ESTADO[v.estado], v.equipo].filter(Boolean).join(' · ')}</span>
                </span>
                <BotonSistema
                  type="button"
                  variante={hecho ? 'secundario' : 'outline'}
                  icono={hecho ? Check : undefined}
                  aria-pressed={hecho}
                  aria-label={`${v.nombre} hizo Próximo Paso`}
                  onClick={() => void alternar(v)}
                >
                  Lo hizo
                </BotonSistema>
              </div>
            </li>
          )
        })}
      </ul>
      <p role="status" className="sr-only">
        {aviso}
      </p>
    </div>
  )
}
