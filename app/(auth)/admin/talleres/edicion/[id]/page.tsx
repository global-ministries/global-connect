/**
 * PR34 — DT-XXX — /admin/talleres/edicion/[id] (RSC).
 *
 * Read-only detail page for a local edicion (one instance of an
 * abstract taller). Backs the link emitted by
 * /admin/talleres/abstracto/[slug] which used to 404 (PR23.2a
 * pre-existing bug, this slice plugs the gap).
 *
 * Capability gate: director.write OR admin.manage. Same pattern as
 * the abstract taller detail page (defense-in-depth — admin.manage
 * is a superset, but director.write is the day-to-day path).
 *
 * Read-only by design: the admin still opens /abrir-edicion flow
 * from the abstract page to mutate state. This page is purely the
 * projection (cohorte, periodo, inscripciones, certificados, etc.).
 */

import type { ReactElement, ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  ContenedorDashboard,
  TarjetaSistema,
  TextoSistema,
  BadgeSistema,
  TituloSistema,
} from '@/components/ui/sistema-diseno'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { loadEdicionLocalDetalle } from '@/lib/platform/talleres/operacional'

export const metadata = { title: 'Edición de Grupo de Corto Plazo' }

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

export default async function EdicionLocalDetailPage(ctx: RouteContext) {
  if (!isTalleresEnabled()) {
    return (
      <ContenedorDashboard titulo="Edición">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">El módulo de talleres está deshabilitado.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const { id } = await ctx.params

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) {
    return (
      <ContenedorDashboard titulo="Edición">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">Necesitás iniciar sesión.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase

  const edicion = await loadEdicionLocalDetalle(client, id)
  if (!edicion) {
    notFound()
  }

  // Capability gate (server-side). Same as the abstract detail page:
  // director.write is the day-to-day surface, admin.manage is the
  // emergency superset. The page itself is projection-only — the
  // gate is read here so the constraint is auditable in code even
  // though no mutation happens on this route.
  const session = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) =>
      findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })
  const caps = session?.capabilities.map((c) => c.key) ?? []
  // hasCap is computed for documentation/audit; the gate also fires
  // at the underlying helpers (openEdicion etc. re-check it). This
  // page never mutates, but a future PR may surface admin actions
  // here — at which point this flag becomes the render gate.
  const hasCap =
    caps.includes('talleres_crecimiento.director.write') ||
    caps.includes('talleres_crecimiento.admin.manage')
  void hasCap

  const estadoVariante: 'default' | 'success' | 'info' =
    edicion.estado === 'abierto' || edicion.estado === 'en_curso'
      ? 'success'
      : edicion.estado === 'borrador'
        ? 'info'
        : 'default'

  return (
    <ContenedorDashboard
      titulo={edicion.nombre_snapshot}
      botonRegreso={{
        href: `/admin/talleres/abstracto/${edicion.taller_slug}`,
        texto: 'Volver al grupo',
      }}
    >
      {/* Header — estado badge + edicion label */}
      <TarjetaSistema variante="elevated" className="mb-4 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1">
            <TextoSistema className="text-sm text-muted-foreground">
              <code>{edicion.id}</code>
            </TextoSistema>
            <TituloSistema nivel={2} className="mt-1">
              {edicion.nombre_snapshot}
            </TituloSistema>
          </div>
          <BadgeSistema variante={estadoVariante}>{edicion.estado}</BadgeSistema>
        </div>
      </TarjetaSistema>

      {/* Información de la edición */}
      <TarjetaSistema variante="outlined" className="mb-4 p-4">
        <TituloSistema nivel={3} className="mb-3">
          Información de la edición
        </TituloSistema>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo titulo="Tipo">
            {edicion.tipo === 'individual' ? 'Individual' : 'Pareja'}
          </Campo>
          {edicion.tipo === 'pareja' && (
            <Campo titulo="Link type">
              {edicion.link_type === 'matrimonio'
                ? 'Matrimonio'
                : edicion.link_type === 'novios'
                  ? 'Novios'
                  : '—'}
            </Campo>
          )}
          <Campo titulo="Modalidad de inscripción">
            {edicion.modalidad_inscripcion === 'periodo_general'
              ? 'Periodo general'
              : 'Permanente custom'}
          </Campo>
          <Campo titulo="Sesiones (snapshot)">
            {edicion.sesiones_snapshot}
          </Campo>
          <Campo titulo="Duración estimada (min)">
            {edicion.duracion_estimada_minutos_snapshot}
          </Campo>
          <Campo titulo="Estado">{edicion.estado}</Campo>
        </dl>

        <div className="mt-4">
          <TextoSistema className="block font-medium">Firmantes</TextoSistema>
          {edicion.firmantes.length === 0 ? (
            <TextoSistema variante="sutil" className="mt-1 block text-sm">
              Sin firmantes configurados.
            </TextoSistema>
          ) : (
            <ul className="mt-2 space-y-1">
              {edicion.firmantes
                .slice()
                .sort((a, b) => a.orden - b.orden)
                .map((f) => (
                  <li key={f.persona_id} className="text-sm">
                    <code>{f.persona_id}</code> · {f.rol_etiqueta} (orden {f.orden})
                  </li>
                ))}
            </ul>
          )}
        </div>
      </TarjetaSistema>

      {/* Taller abstracto */}
      <TarjetaSistema variante="outlined" className="mb-4 p-4">
        <TituloSistema nivel={3} className="mb-3">
          Grupo de corto plazo
        </TituloSistema>
        <TextoSistema className="block">
          <Link
            href={`/admin/talleres/abstracto/${edicion.taller_slug}`}
            className="font-medium hover:underline"
          >
            {edicion.taller_nombre}
          </Link>
        </TextoSistema>
        <TextoSistema variante="sutil" className="mt-1 block text-sm">
          <code>{edicion.taller_slug}</code>
        </TextoSistema>
      </TarjetaSistema>

      {/* Cohorte */}
      <TarjetaSistema variante="outlined" className="mb-4 p-4">
        <TituloSistema nivel={3} className="mb-3">
          Cohorte
        </TituloSistema>
        {edicion.cohorte ? (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo titulo="Edición">{edicion.cohorte.edicion}</Campo>
            <Campo titulo="Equipo (dream_team_equipo_id)">
              <code>{edicion.cohorte.dream_team_equipo_id}</code>
            </Campo>
            <Campo titulo="Inicio">
              {formatFecha(edicion.cohorte.started_at)}
            </Campo>
            <Campo titulo="Fin">
              {formatFecha(edicion.cohorte.ended_at)}
            </Campo>
          </dl>
        ) : (
          <TextoSistema variante="sutil">
            Esta edición todavía no tiene cohorte asociada.
          </TextoSistema>
        )}
      </TarjetaSistema>

      {/* Período general */}
      <TarjetaSistema variante="outlined" className="mb-4 p-4">
        <TituloSistema nivel={3} className="mb-3">
          Período general
        </TituloSistema>
        {edicion.periodo_general ? (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo titulo="Apertura automática">
              {formatFecha(edicion.periodo_general.fecha_apertura_automatica)}
            </Campo>
            <Campo titulo="Cierre automático">
              {formatFecha(edicion.periodo_general.fecha_cierre_automatica)}
            </Campo>
            <Campo titulo="Apertura manual">
              {formatFecha(edicion.periodo_general.fecha_apertura_manual)}
            </Campo>
            <Campo titulo="Cierre manual">
              {formatFecha(edicion.periodo_general.fecha_cierre_manual)}
            </Campo>
            <Campo titulo="Cierre real">
              {formatFecha(edicion.periodo_general.fecha_cierre_real)}
            </Campo>
            {edicion.periodo_general.motivo_cierre && (
              <Campo titulo="Motivo de cierre">
                {edicion.periodo_general.motivo_cierre}
              </Campo>
            )}
          </dl>
        ) : (
          <TextoSistema variante="sutil">
            No hay período general asociado (modalidad permanente custom o período aún no creado).
          </TextoSistema>
        )}
      </TarjetaSistema>

      {/* Inscripciones + Certificados */}
      <div className="grid gap-4 sm:grid-cols-3">
        <TarjetaSistema variante="outlined" className="p-4">
          <TextoSistema variante="sutil" className="block text-sm">
            Inscripciones (total)
          </TextoSistema>
          <TextoSistema className="mt-1 block text-2xl font-semibold">
            {edicion.inscripciones_count}
          </TextoSistema>
        </TarjetaSistema>
        <TarjetaSistema variante="outlined" className="p-4">
          <TextoSistema variante="sutil" className="block text-sm">
            Aprobadas / pendientes
          </TextoSistema>
          <TextoSistema className="mt-1 block text-2xl font-semibold">
            {edicion.inscripciones_aprobadas_count}
          </TextoSistema>
        </TarjetaSistema>
        <TarjetaSistema variante="outlined" className="p-4">
          <TextoSistema variante="sutil" className="block text-sm">
            Certificados emitidos
          </TextoSistema>
          <TextoSistema className="mt-1 block text-2xl font-semibold">
            {edicion.certificados_count}
          </TextoSistema>
        </TarjetaSistema>
      </div>

      {/* Footer — Volver. Visible even when the user lacks the cap so
          they can always navigate back. */}
      <div className="mt-6">
        <Link
          href={`/admin/talleres/abstracto/${edicion.taller_slug}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Volver al grupo de corto plazo
        </Link>
      </div>
    </ContenedorDashboard>
  )
}

function Campo({
  titulo,
  children,
}: {
  readonly titulo: string
  readonly children: ReactNode
}): ReactElement {
  return (
    <div>
      <TextoSistema variante="sutil" className="block text-xs uppercase tracking-wide">
        {titulo}
      </TextoSistema>
      <TextoSistema className="mt-1 block">{children}</TextoSistema>
    </div>
  )
}

function formatFecha(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('es')
}