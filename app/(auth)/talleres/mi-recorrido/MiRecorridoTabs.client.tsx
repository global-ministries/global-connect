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
 * EMPTY STATES — one EstadoVacioSistema per tab, each with its own icon and
 * honest copy: a participant with zero active talleres is not "loading"
 * or "an error", and "no talleres activos" is a different fact from "no
 * historial" or "no certificados".
 *
 * LISTS — T9 (odd/tasks/talleres-reserva-publica.md, S8): each tab is a
 * ListaResponsiva (one ARIA table; inset grouped rows on phones). A row of
 * En curso / Historial opens its detail (DetalleResponsivo: side panel from
 * md, bottom sheet below); a certificate row opens the certificate page.
 */
import { useCallback, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Award, Clock, GraduationCap } from 'lucide-react'

import { TabsSistema, TabsList, TabsTrigger, TabsContent } from '@/components/ui/TabsSistema'
import { BadgeSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { ListaResponsiva, type ColumnaLista } from '@/components/ui/lista-responsiva'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
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

// ─── Shared ─────────────────────────────────────────────────────────────

const tipoLabel = (tipo: ParticipanteTallerSummary['tipo']) => (tipo === 'pareja' ? 'Pareja' : 'Individual')

function TallerYEdicion({ nombre, edicion }: { readonly nombre: string; readonly edicion: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate text-sm font-medium text-foreground">{nombre}</span>
      <span className="truncate text-xs text-muted-foreground">{edicion}</span>
    </div>
  )
}

function Fecha({ iso }: { readonly iso: string | null }) {
  return <span className="font-mono text-sm tabular-nums text-muted-foreground">{formatFecha(iso)}</span>
}

function EstadoInscripcion({
  estado,
  unit,
}: {
  readonly estado: ParticipanteTallerSummary['estado_inscripcion']
  readonly unit: ParticipanteTallerSummary['unit_estado']
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <BadgeSistema variante={inscripcionEstadoBadgeVariante(estado)} tamaño="sm">
        {inscripcionEstadoLabel(estado)}
      </BadgeSistema>
      {unit && (
        <BadgeSistema variante={unitEstadoBadgeVariante(unit)} tamaño="sm">
          {unitEstadoLabel(unit)}
        </BadgeSistema>
      )}
    </div>
  )
}

interface DatoDetalle {
  readonly etiqueta: string
  readonly valor: ReactNode
}

/** The read-only detail of one inscription (side panel from md, bottom sheet below). */
function DetalleInscripcion({
  titulo,
  datos,
  onCerrar,
}: {
  readonly titulo: string | null
  readonly datos: readonly DatoDetalle[]
  readonly onCerrar: () => void
}) {
  return (
    <DetalleResponsivo abierto={titulo !== null} onCambioAbierto={(abierto) => !abierto && onCerrar()} titulo={titulo ?? ''}>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
        {datos.map((dato) => (
          <div key={dato.etiqueta} className="contents">
            <dt className="text-muted-foreground">{dato.etiqueta}</dt>
            <dd className="min-w-0 text-foreground">{dato.valor}</dd>
          </div>
        ))}
      </dl>
    </DetalleResponsivo>
  )
}

// ─── En curso ───────────────────────────────────────────────────────────

const COLUMNAS_EN_CURSO: readonly ColumnaLista[] = [
  { id: 'taller', titulo: 'Taller', ancho: 'minmax(220px,1.4fr)' },
  { id: 'tipo', titulo: 'Tipo', ancho: '120px', ocultarEnTablet: true },
  { id: 'estado', titulo: 'Estado', ancho: '150px' },
  { id: 'inscripcion', titulo: 'Inscripción', ancho: 'minmax(0,1fr)' },
]

function TabEnCurso({ talleres }: { talleres: readonly ParticipanteTallerSummary[] }) {
  const [abierto, setAbierto] = useState<ParticipanteTallerSummary | null>(null)

  return (
    <>
      <ListaResponsiva
        etiqueta="Talleres en curso"
        columnas={COLUMNAS_EN_CURSO}
        filas={talleres}
        claveFila={(t) => t.id}
        renderCelda={(t, columna) => {
          if (columna === 'taller') return <TallerYEdicion nombre={t.nombre} edicion={t.edicion} />
          if (columna === 'tipo') return <span className="text-sm text-muted-foreground">{tipoLabel(t.tipo)}</span>
          if (columna === 'estado') {
            return (
              <BadgeSistema variante={edicionEstadoBadgeVariante(t.estado_taller)} tamaño="sm">
                {edicionEstadoLabel(t.estado_taller)}
              </BadgeSistema>
            )
          }
          return <EstadoInscripcion estado={t.estado_inscripcion} unit={t.unit_estado} />
        }}
        renderFilaMovil={(t) => ({
          titulo: t.nombre,
          subtitulo: `${t.edicion} · ${tipoLabel(t.tipo)}`,
          meta: (
            <BadgeSistema variante={inscripcionEstadoBadgeVariante(t.estado_inscripcion)} tamaño="sm">
              {inscripcionEstadoLabel(t.estado_inscripcion)}
            </BadgeSistema>
          ),
        })}
        onAbrirFila={setAbierto}
        etiquetaFila={(t) => `Abrir ${t.nombre}`}
        vacio={
          <EstadoVacioSistema
            icono={GraduationCap}
            titulo="No tienes talleres activos"
            subtitulo="Visita Explorar para inscribirte en uno."
          />
        }
      />
      <DetalleInscripcion
        titulo={abierto?.nombre ?? null}
        onCerrar={() => setAbierto(null)}
        datos={
          abierto
            ? [
                { etiqueta: 'Edición', valor: abierto.edicion },
                { etiqueta: 'Tipo', valor: tipoLabel(abierto.tipo) },
                {
                  etiqueta: 'Estado',
                  valor: (
                    <BadgeSistema variante={edicionEstadoBadgeVariante(abierto.estado_taller)} tamaño="sm">
                      {edicionEstadoLabel(abierto.estado_taller)}
                    </BadgeSistema>
                  ),
                },
                {
                  etiqueta: 'Inscripción',
                  valor: <EstadoInscripcion estado={abierto.estado_inscripcion} unit={abierto.unit_estado} />,
                },
              ]
            : []
        }
      />
    </>
  )
}

// ─── Historial ──────────────────────────────────────────────────────────

const COLUMNAS_HISTORIAL: readonly ColumnaLista[] = [
  { id: 'taller', titulo: 'Taller', ancho: 'minmax(220px,1.4fr)' },
  { id: 'inscrito', titulo: 'Inscrito el', ancho: '130px', ocultarEnTablet: true },
  { id: 'completado', titulo: 'Completado', ancho: '130px' },
  { id: 'estado', titulo: 'Estado', ancho: 'minmax(0,1fr)' },
]

function TabHistorial({ historial }: { historial: readonly ParticipanteHistorialRow[] }) {
  const [abierto, setAbierto] = useState<ParticipanteHistorialRow | null>(null)

  return (
    <>
      <ListaResponsiva
        etiqueta="Historial"
        columnas={COLUMNAS_HISTORIAL}
        filas={historial}
        claveFila={(row) => row.id}
        renderCelda={(row, columna) => {
          if (columna === 'taller') return <TallerYEdicion nombre={row.nombre} edicion={row.edicion} />
          if (columna === 'inscrito') return <Fecha iso={row.fecha_inscripcion} />
          if (columna === 'completado') return <Fecha iso={row.fecha_completitud} />
          return <EstadoInscripcion estado={row.estado_inscripcion} unit={row.unit_estado} />
        }}
        renderFilaMovil={(row) => ({
          titulo: row.nombre,
          subtitulo: `${row.edicion} · Inscrito ${formatFecha(row.fecha_inscripcion)}`,
          meta: (
            <BadgeSistema variante={inscripcionEstadoBadgeVariante(row.estado_inscripcion)} tamaño="sm">
              {inscripcionEstadoLabel(row.estado_inscripcion)}
            </BadgeSistema>
          ),
        })}
        onAbrirFila={setAbierto}
        etiquetaFila={(row) => `Abrir ${row.nombre}`}
        vacio={<EstadoVacioSistema icono={Clock} titulo="Aún no tienes inscripciones registradas" />}
      />
      <DetalleInscripcion
        titulo={abierto?.nombre ?? null}
        onCerrar={() => setAbierto(null)}
        datos={
          abierto
            ? [
                { etiqueta: 'Edición', valor: abierto.edicion },
                { etiqueta: 'Inscrito el', valor: <Fecha iso={abierto.fecha_inscripcion} /> },
                { etiqueta: 'Completado', valor: <Fecha iso={abierto.fecha_completitud} /> },
                {
                  etiqueta: 'Estado',
                  valor: <EstadoInscripcion estado={abierto.estado_inscripcion} unit={abierto.unit_estado} />,
                },
              ]
            : []
        }
      />
    </>
  )
}

// ─── Certificados ───────────────────────────────────────────────────────

const COLUMNAS_CERTIFICADOS: readonly ColumnaLista[] = [
  { id: 'taller', titulo: 'Taller', ancho: 'minmax(220px,1.6fr)' },
  { id: 'completado', titulo: 'Completado', ancho: '140px' },
  { id: 'estado', titulo: 'Estado', ancho: 'minmax(0,1fr)' },
]

function EstadoCertificado({ revocado }: { readonly revocado: boolean }) {
  return revocado ? (
    <BadgeSistema variante="error" tamaño="sm">Revocado</BadgeSistema>
  ) : (
    <BadgeSistema variante="success" tamaño="sm">Vigente</BadgeSistema>
  )
}

function TabCertificados({ certificados }: { certificados: readonly ParticipanteCertificado[] }) {
  const router = useRouter()

  return (
    <ListaResponsiva
      etiqueta="Certificados"
      columnas={COLUMNAS_CERTIFICADOS}
      filas={certificados}
      claveFila={(cert) => cert.id}
      renderCelda={(cert, columna) => {
        if (columna === 'taller') {
          return (
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-foreground">{cert.nombre_taller_snapshot}</span>
              {/* T2b — a couple's certificate names the partner. */}
              {cert.nombre_pareja_snapshot && (
                <span className="truncate text-xs text-muted-foreground">{`junto a ${cert.nombre_pareja_snapshot}`}</span>
              )}
            </div>
          )
        }
        if (columna === 'completado') return <Fecha iso={cert.fecha_completitud} />
        return <EstadoCertificado revocado={Boolean(cert.revocado_at)} />
      }}
      renderFilaMovil={(cert) => ({
        titulo: cert.nombre_taller_snapshot,
        subtitulo: cert.nombre_pareja_snapshot
          ? `junto a ${cert.nombre_pareja_snapshot}`
          : `Completado ${formatFecha(cert.fecha_completitud)}`,
        meta: <EstadoCertificado revocado={Boolean(cert.revocado_at)} />,
      })}
      onAbrirFila={(cert) => router.push(rutaCertificado(cert.id))}
      etiquetaFila={(cert) => `Abrir certificado de ${cert.nombre_taller_snapshot}`}
      vacio={
        <EstadoVacioSistema
          icono={Award}
          titulo="Aún no tienes certificados emitidos"
          subtitulo="Se emiten automáticamente al completar un taller."
        />
      }
    />
  )
}
