'use client'

/**
 * T9 (odd/tasks/talleres-consolidar-pantallas.md) — the interactive half of
 * /talleres/mi-recorrido. `page.tsx` (RSC) resolves the participant
 * context and calls the three ORIGINAL loaders unchanged
 * (loadParticipanteActiveTalleres / loadParticipanteHistorial /
 * loadParticipanteCertificados — this is a presentation merge, not a data
 * merge, per the parent's inventory) and hands their rows down here.
 *
 * TAB STATE — chosen mechanism: a `?tab=` search param, same house pattern
 * as components/grupos/GruposList.client.tsx (URL-synced tabs,
 * `router.replace()` on change so the URL always reflects the active tab).
 * This makes the active tab survive a reload AND be linkable/bookmarkable
 * — e.g. a participant can share `/talleres/mi-recorrido?tab=certificados`
 * and land straight on their certificates. `router.replace` (not `push`)
 * so switching tabs doesn't spam the browser history stack, same as
 * GruposList. Unlike GruposList, the active tab here is DERIVED directly
 * from `useSearchParams()` on every render — no local `useState` mirroring
 * it — since `useSearchParams()` is already reactive to `router.replace`
 * in the App Router: one source of truth (the URL), no local/URL state
 * that can drift apart, and no `useEffect` synchronizing one into the
 * other.
 *
 * ESTADOS — every estado/unit_estado badge goes through
 * components/talleres/labels.ts (edicionEstado helpers for estado_taller,
 * inscripcionEstado/unitEstado helpers — added in this same task — for
 * estado_inscripcion/unit_estado). Never a raw key, per that file's own
 * header rule (T2/T7/T8 already established it for their own domains).
 *
 * EMPTY STATES — one EstadoVacio per tab, each with its own icon and
 * honest copy: a participant with zero active talleres is not "loading"
 * or "an error", and "no talleres activos" is a different fact from "no
 * historial" or "no certificados".
 */
import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Award, Clock, GraduationCap } from 'lucide-react'

import { TabsSistema, TabsList, TabsTrigger, TabsContent } from '@/components/ui/TabsSistema'
import { TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import {
  edicionEstadoLabel,
  edicionEstadoBadgeVariante,
  inscripcionEstadoLabel,
  inscripcionEstadoBadgeVariante,
  unitEstadoLabel,
  unitEstadoBadgeVariante,
} from '@/components/talleres/labels'
import { rutaCertificado } from '@/lib/platform/talleres/rutas'
import type {
  ParticipanteTallerSummary,
  ParticipanteHistorialRow,
  ParticipanteCertificado,
} from '@/lib/platform/talleres/participante'

export type MiRecorridoTab = 'en-curso' | 'historial' | 'certificados'

const TABS: readonly MiRecorridoTab[] = ['en-curso', 'historial', 'certificados']

function isMiRecorridoTab(value: string | null | undefined): value is MiRecorridoTab {
  return value != null && (TABS as readonly string[]).includes(value)
}

function formatFecha(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

interface Props {
  readonly talleres: readonly ParticipanteTallerSummary[]
  readonly historial: readonly ParticipanteHistorialRow[]
  readonly certificados: readonly ParticipanteCertificado[]
}

export function MiRecorridoTabs({ talleres, historial, certificados }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const tabParam = sp?.get('tab') ?? null
  const pestanaActiva: MiRecorridoTab = isMiRecorridoTab(tabParam) ? tabParam : 'en-curso'

  const onTabChange = useCallback(
    (v: string) => {
      if (!isMiRecorridoTab(v)) return
      const params = new URLSearchParams(sp?.toString() || '')
      params.set('tab', v)
      router.replace(`${pathname}?${params.toString()}`)
    },
    [pathname, router, sp],
  )

  return (
    <TabsSistema value={pestanaActiva} onValueChange={onTabChange}>
      <TabsList>
        <TabsTrigger value="en-curso">
          En curso
          {talleres.length > 0 && (
            <span className="ml-1.5 text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
              {talleres.length}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="historial">Historial</TabsTrigger>
        <TabsTrigger value="certificados">
          Certificados
          {certificados.length > 0 && (
            <span className="ml-1.5 text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
              {certificados.length}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="en-curso">
        <TabEnCurso talleres={talleres} />
      </TabsContent>
      <TabsContent value="historial">
        <TabHistorial historial={historial} />
      </TabsContent>
      <TabsContent value="certificados">
        <TabCertificados certificados={certificados} />
      </TabsContent>
    </TabsSistema>
  )
}

// ─── En curso ───────────────────────────────────────────────────────────

function TabEnCurso({ talleres }: { talleres: readonly ParticipanteTallerSummary[] }) {
  if (talleres.length === 0) {
    return (
      <EstadoVacio
        icono={GraduationCap}
        titulo="No tienes talleres activos"
        subtitulo="Visitá Explorar para inscribirte en uno."
      />
    )
  }

  return (
    <>
      {/* Desktop — table */}
      <div className="hidden md:block overflow-hidden">
        <TarjetaSistema className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Taller</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Inscripción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {talleres.map((t) => (
                <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">{t.nombre}</span>
                      <span className="text-xs text-muted-foreground">{t.edicion}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {t.tipo === 'pareja' ? 'Pareja' : 'Individual'}
                  </td>
                  <td className="px-4 py-3">
                    <BadgeSistema variante={edicionEstadoBadgeVariante(t.estado_taller)} tamaño="sm">
                      {edicionEstadoLabel(t.estado_taller)}
                    </BadgeSistema>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <BadgeSistema variante={inscripcionEstadoBadgeVariante(t.estado_inscripcion)} tamaño="sm">
                        {inscripcionEstadoLabel(t.estado_inscripcion)}
                      </BadgeSistema>
                      {t.unit_estado && (
                        <BadgeSistema variante={unitEstadoBadgeVariante(t.unit_estado)} tamaño="sm">
                          {unitEstadoLabel(t.unit_estado)}
                        </BadgeSistema>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TarjetaSistema>
      </div>

      {/* Mobile — cards */}
      <div className="md:hidden space-y-3">
        {talleres.map((t) => (
          <TarjetaSistema key={t.id} variante="outlined" className="p-4">
            <div className="flex items-start gap-3">
              <GraduationCap className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <TextoSistema className="text-sm font-medium">{t.nombre}</TextoSistema>
                <TextoSistema variante="sutil" className="mt-1 block text-xs">
                  {t.edicion} · {t.tipo === 'pareja' ? 'Pareja' : 'Individual'}
                </TextoSistema>
                <div className="mt-2 flex flex-wrap gap-2">
                  <BadgeSistema variante={edicionEstadoBadgeVariante(t.estado_taller)} tamaño="sm">
                    {edicionEstadoLabel(t.estado_taller)}
                  </BadgeSistema>
                  <BadgeSistema variante={inscripcionEstadoBadgeVariante(t.estado_inscripcion)} tamaño="sm">
                    {inscripcionEstadoLabel(t.estado_inscripcion)}
                  </BadgeSistema>
                  {t.unit_estado && (
                    <BadgeSistema variante={unitEstadoBadgeVariante(t.unit_estado)} tamaño="sm">
                      {unitEstadoLabel(t.unit_estado)}
                    </BadgeSistema>
                  )}
                </div>
              </div>
            </div>
          </TarjetaSistema>
        ))}
      </div>
    </>
  )
}

// ─── Historial ──────────────────────────────────────────────────────────

function TabHistorial({ historial }: { historial: readonly ParticipanteHistorialRow[] }) {
  if (historial.length === 0) {
    return <EstadoVacio icono={Clock} titulo="Aún no tienes inscripciones registradas" />
  }

  return (
    <>
      {/* Desktop — table */}
      <div className="hidden md:block overflow-hidden">
        <TarjetaSistema className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Taller</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Inscripto el</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Completado</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {historial.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">{row.nombre}</span>
                      <span className="text-xs text-muted-foreground">{row.edicion}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{formatFecha(row.fecha_inscripcion)}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{formatFecha(row.fecha_completitud)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <BadgeSistema variante={inscripcionEstadoBadgeVariante(row.estado_inscripcion)} tamaño="sm">
                        {inscripcionEstadoLabel(row.estado_inscripcion)}
                      </BadgeSistema>
                      {row.unit_estado && (
                        <BadgeSistema variante={unitEstadoBadgeVariante(row.unit_estado)} tamaño="sm">
                          {unitEstadoLabel(row.unit_estado)}
                        </BadgeSistema>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TarjetaSistema>
      </div>

      {/* Mobile — cards */}
      <div className="md:hidden space-y-3">
        {historial.map((row) => (
          <TarjetaSistema key={row.id} variante="outlined" className="p-4">
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <TextoSistema className="text-sm font-medium">{row.nombre}</TextoSistema>
                <TextoSistema variante="sutil" className="mt-1 block text-xs">
                  {row.edicion} · Inscripto {formatFecha(row.fecha_inscripcion)}
                </TextoSistema>
                {row.fecha_completitud && (
                  <TextoSistema variante="sutil" className="mt-1 block text-xs">
                    Completado {formatFecha(row.fecha_completitud)}
                  </TextoSistema>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <BadgeSistema variante={inscripcionEstadoBadgeVariante(row.estado_inscripcion)} tamaño="sm">
                    {inscripcionEstadoLabel(row.estado_inscripcion)}
                  </BadgeSistema>
                  {row.unit_estado && (
                    <BadgeSistema variante={unitEstadoBadgeVariante(row.unit_estado)} tamaño="sm">
                      {unitEstadoLabel(row.unit_estado)}
                    </BadgeSistema>
                  )}
                </div>
              </div>
            </div>
          </TarjetaSistema>
        ))}
      </div>
    </>
  )
}

// ─── Certificados ───────────────────────────────────────────────────────

function TabCertificados({ certificados }: { certificados: readonly ParticipanteCertificado[] }) {
  if (certificados.length === 0) {
    return (
      <EstadoVacio
        icono={Award}
        titulo="Aún no tienes certificados emitidos"
        subtitulo="Se emiten automáticamente al completar un taller."
      />
    )
  }

  return (
    <>
      {/* Desktop — table */}
      <div className="hidden md:block overflow-hidden">
        <TarjetaSistema className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Taller</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Completado</th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {certificados.map((cert) => (
                <tr key={cert.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={rutaCertificado(cert.id)}
                      className="text-sm font-medium text-foreground hover:underline"
                    >
                      {cert.nombre_taller_snapshot}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{formatFecha(cert.fecha_completitud)}</td>
                  <td className="px-4 py-3">
                    {cert.revocado_at ? (
                      <BadgeSistema variante="error" tamaño="sm">Revocado</BadgeSistema>
                    ) : (
                      <BadgeSistema variante="success" tamaño="sm">Vigente</BadgeSistema>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TarjetaSistema>
      </div>

      {/* Mobile — cards */}
      <div className="md:hidden space-y-3">
        {certificados.map((cert) => (
          <Link key={cert.id} href={rutaCertificado(cert.id)} className="block">
            <TarjetaSistema variante="outlined" className="p-4 min-h-[44px]">
              <div className="flex items-start gap-3">
                <Award className="mt-0.5 h-5 w-5 text-primary" />
                <div className="flex-1">
                  <TextoSistema className="text-sm font-medium">{cert.nombre_taller_snapshot}</TextoSistema>
                  <TextoSistema variante="sutil" className="mt-1 block text-xs">
                    Completado {formatFecha(cert.fecha_completitud)}
                  </TextoSistema>
                  <div className="mt-2">
                    {cert.revocado_at ? (
                      <BadgeSistema variante="error" tamaño="sm">Revocado</BadgeSistema>
                    ) : (
                      <BadgeSistema variante="success" tamaño="sm">Vigente</BadgeSistema>
                    )}
                  </div>
                </div>
              </div>
            </TarjetaSistema>
          </Link>
        ))}
      </div>
    </>
  )
}
