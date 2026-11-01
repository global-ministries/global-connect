'use client'

/**
 * Estudiantes › Grupos — the main view of the group drawer (artboards 06 / 07,
 * `#grupo=…`): Editar, the "no leader" callout, the key figures, Líderes
 * (with "Asignar líder" and a "Quitar" per leader), Líderes anteriores
 * (C6a, read only; hidden when there are none), the entrenador and
 * director de grupo of the sub-área (read only: they come from the Dream
 * Team node, Q3), Por confirmar, the other visitors, Integrantes (with
 * "Agregar integrante"; each row opens the member view) and Desactivar with
 * an inline confirmation. A deactivated group shows only "Reactivar grupo".
 *
 * "Ver la lista" opens the group's leader list (C3b) with "‹ Grupos" back
 * here. The Sunday figures ("Domingo 25 oct", "Últimos 4") still wait (L23);
 * "WhatsApp" to the leaders waits for a leader phone in the data.
 */
import { useState, type ReactElement } from 'react'
import Link from 'next/link'
import { ListChecks, Pencil, Power, Star } from 'lucide-react'

import { BotonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { AvatarServidor } from '@/components/dream-team/servidores/lista-servidores'
import { activarGrupo, confirmarMiembro, fijarLideres } from '@/lib/actions/estudiantes-grupos.actions'
import { edadEn } from '@/lib/platform/estudiantes/gestion-grupo'
import type { GrupoGestion, Integrante, SubareaGestionable } from '@/lib/platform/estudiantes/grupos-datos'
import {
  horarioTexto,
  miembrosDe,
  porConfirmarDe,
  textoVisita,
  visitantesDe,
} from '@/lib/platform/estudiantes/grupos-vista'

import { FilaAgregar, FilaInset, FilaNavegable, ListaInset, TituloSeccion } from '../filas-inset'
import { LideresAnteriores } from './lideres-anteriores'
import type { AccionGrupo } from './use-accion-grupo'

export function DatoClave({ etiqueta, valor, mono = false }: { readonly etiqueta: string; readonly valor: string; readonly mono?: boolean }): ReactElement {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className={`mt-0.5 truncate text-sm font-medium text-foreground ${mono ? 'font-mono tabular-nums' : ''}`}>{valor}</dd>
    </div>
  )
}

/** "2do año" in Transit / Inside Out, "21 años" in The Living Room. */
export function subtituloIntegrante(grupo: GrupoGestion, integrante: Integrante, hoy: Date): string {
  if (grupo.experiencia === 'the_living_room') {
    const edad = edadEn(integrante.fechaNacimiento, hoy)
    return edad === null ? 'Sin fecha de nacimiento' : `${edad} años`
  }
  return integrante.anioEtiqueta ?? 'Sin año escolar'
}

export interface VistaGrupoProps {
  readonly grupo: GrupoGestion
  readonly subareas: readonly SubareaGestionable[]
  readonly accion: AccionGrupo
  readonly onIntegrante: (personaId: string) => void
  readonly onAgregar: () => void
  readonly onLideres: () => void
  readonly onEditar: () => void
}

export function VistaGrupo({ grupo, subareas, accion, onIntegrante, onAgregar, onLideres, onEditar }: VistaGrupoProps): ReactElement {
  const [confirmarDesactivar, setConfirmarDesactivar] = useState(false)
  const { pendiente, ejecutar } = accion
  const miembros = miembrosDe(grupo)
  const visitantes = visitantesDe(grupo)
  const porConfirmar = porConfirmarDe(grupo)
  const otrosVisitantes = visitantes.filter((v) => !v.sugerirConfirmar)
  const tlr = grupo.experiencia === 'the_living_room'
  const hoy = new Date()

  if (!grupo.activo) {
    return (
      <div className="space-y-5">
        <AvisoFormulario tono="info">
          Este grupo está desactivado. No aparece en la lista del líder ni en En vivo; su asistencia se conserva.
        </AvisoFormulario>
        <BotonSistema
          type="button"
          variante="outline"
          icono={Power}
          cargando={pendiente === 'reactivar'}
          disabled={pendiente !== null}
          onClick={() => ejecutar('reactivar', () => activarGrupo({ grupoId: grupo.id, activo: true }), `${grupo.nombre} está activo otra vez`)}
        >
          Reactivar grupo
        </BotonSistema>
      </div>
    )
  }

  const responsables = subareas
    .filter((s) => s.subareaId === grupo.subareaId && s.campusId === grupo.campusId)
    .flatMap((s) => s.responsables)
  const horario = horarioTexto(grupo.diaSemana, grupo.hora)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <BotonSistema asChild variante="outline" tamaño="sm" icono={ListChecks}>
          <Link href={`/estudiantes/grupos/${encodeURIComponent(grupo.id)}?desde=grupos`}>Ver la lista</Link>
        </BotonSistema>
        <BotonSistema type="button" variante="outline" tamaño="sm" icono={Pencil} onClick={onEditar}>
          Editar grupo
        </BotonSistema>
      </div>

      {grupo.lideres.length === 0 && (
        <AvisoFormulario tono="marca" className="space-y-1">
          <p className="font-semibold text-foreground">Este grupo no tiene líder</p>
          <p className="text-foreground">{`Nadie puede marcar su asistencia. Asígnale uno de los voluntarios de ${grupo.subarea}.`}</p>
        </AvisoFormulario>
      )}

      <dl className="grid grid-cols-2 gap-3">
        <DatoClave etiqueta="Integrantes" valor={String(miembros.length)} mono />
        <DatoClave etiqueta="Visitantes" valor={String(visitantes.length)} mono />
        {tlr && <DatoClave etiqueta="Zona" valor={grupo.zona ?? '—'} />}
        {tlr && <DatoClave etiqueta="Se reúne" valor={horario ?? 'Sin día fijo'} />}
      </dl>

      <section aria-labelledby="grupo-lideres" className="space-y-2">
        <TituloSeccion id="grupo-lideres" texto="Líderes" cantidad={grupo.lideres.length} />
        <ListaInset etiqueta="Líderes">
          <FilaAgregar etiqueta="Asignar líder" onClick={onLideres} />
          {grupo.lideres.map((lider) => (
            <FilaInset
              key={lider.servicioId}
              avatar={<AvatarServidor nombre={lider.nombre} />}
              titulo={lider.nombre}
              subtitulo={lider.rol}
              accion={
                <BotonSistema
                  type="button"
                  variante="ghost"
                  tamaño="sm"
                  aria-label={`Quitar a ${lider.nombre} como líder`}
                  cargando={pendiente === `lider:${lider.servicioId}`}
                  disabled={pendiente !== null}
                  onClick={() =>
                    ejecutar(
                      `lider:${lider.servicioId}`,
                      () => fijarLideres({ grupoId: grupo.id, servicioIds: grupo.lideres.filter((l) => l.servicioId !== lider.servicioId).map((l) => l.servicioId) }),
                      `${lider.nombre} ya no lidera ${grupo.nombre}`,
                    )
                  }
                >
                  Quitar
                </BotonSistema>
              }
            />
          ))}
        </ListaInset>
      </section>

      {/* Reloads after the leaders change: a removed leader becomes a past one. */}
      <LideresAnteriores key={`${grupo.id}:${grupo.lideres.map((l) => l.servicioId).join(',')}`} grupoId={grupo.id} />

      <TarjetaSistema className="space-y-3 p-4">
        {responsables.length > 0 ? (
          <dl className="grid grid-cols-2 gap-3">
            {responsables.map((r) => (
              <DatoClave key={r.servicioId} etiqueta={r.rol} valor={r.nombre} />
            ))}
          </dl>
        ) : (
          <p className="text-sm text-foreground">Esta sub-área no tiene entrenador ni director de grupo.</p>
        )}
        <p className="text-[13px] text-muted-foreground">{`Se asignan en Dream Team › ${grupo.ambito} › ${grupo.subarea}.`}</p>
      </TarjetaSistema>

      {porConfirmar.length > 0 && (
        <section aria-labelledby="grupo-confirmar" className="space-y-2">
          <TituloSeccion id="grupo-confirmar" texto="Por confirmar" cantidad={porConfirmar.length} />
          {porConfirmar.map((visitante) => (
            <AvisoFormulario key={visitante.personaId} tono="info" className="flex gap-3">
              <Star aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info-text" />
              <div className="min-w-0 space-y-2">
                <p>
                  <b className="font-semibold">{visitante.nombre}</b>
                  {tlr ? ` vino a ${visitante.visitas} reuniones como visitante.` : ` vino ${visitante.visitas} domingos como visitante.`}
                </p>
                <BotonSistema
                  type="button"
                  tamaño="sm"
                  cargando={pendiente === `confirmar:${visitante.personaId}`}
                  disabled={pendiente !== null}
                  onClick={() =>
                    ejecutar(
                      `confirmar:${visitante.personaId}`,
                      () => confirmarMiembro({ grupoId: grupo.id, personaId: visitante.personaId }),
                      `${visitante.nombre} ya es integrante de ${grupo.nombre}`,
                    )
                  }
                >
                  Confirmar como miembro
                </BotonSistema>
              </div>
            </AvisoFormulario>
          ))}
        </section>
      )}

      {otrosVisitantes.length > 0 && (
        <section aria-labelledby="grupo-visitantes" className="space-y-2">
          <TituloSeccion id="grupo-visitantes" texto="Visitantes" cantidad={otrosVisitantes.length} />
          <ListaInset etiqueta="Visitantes">
            {otrosVisitantes.map((visitante) => (
              <FilaInset
                key={visitante.personaId}
                avatar={<AvatarServidor nombre={visitante.nombre} />}
                titulo={visitante.nombre}
                subtitulo={textoVisita(visitante.visitas)}
              />
            ))}
          </ListaInset>
        </section>
      )}

      <section aria-labelledby="grupo-integrantes" className="space-y-2">
        <TituloSeccion id="grupo-integrantes" texto="Integrantes" cantidad={miembros.length} />
        <ListaInset etiqueta="Integrantes">
          <FilaAgregar etiqueta="Agregar integrante" onClick={onAgregar} />
          {miembros.map((integrante) => (
            <FilaNavegable
              key={integrante.personaId}
              avatar={<AvatarServidor nombre={integrante.nombre} />}
              titulo={integrante.nombre}
              subtitulo={subtituloIntegrante(grupo, integrante, hoy)}
              etiqueta={`Abrir ${integrante.nombre}`}
              onAbrir={() => onIntegrante(integrante.personaId)}
            />
          ))}
        </ListaInset>
      </section>

      {confirmarDesactivar ? (
        <AvisoFormulario tono="error" className="space-y-2">
          <p className="font-semibold">{`¿Desactivar ${grupo.nombre}?`}</p>
          <p className="font-normal text-foreground">
            {miembros.length + visitantes.length > 0 &&
              `Sus ${miembros.length + visitantes.length} integrantes quedan sin grupo; muévelos antes si ya tienen otro. `}
            Deja de aparecer en la lista del líder y en En vivo. La asistencia se conserva y puedes reactivarlo.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => setConfirmarDesactivar(false)} disabled={pendiente !== null}>
              Cancelar
            </BotonSistema>
            <BotonSistema
              type="button"
              variante="peligro"
              tamaño="sm"
              cargando={pendiente === 'desactivar'}
              disabled={pendiente !== null}
              onClick={async () => {
                const ok = await ejecutar('desactivar', () => activarGrupo({ grupoId: grupo.id, activo: false }), `${grupo.nombre} quedó desactivado`)
                if (ok) setConfirmarDesactivar(false)
              }}
            >
              Desactivar
            </BotonSistema>
          </div>
        </AvisoFormulario>
      ) : (
        <TarjetaSistema className="space-y-3 p-4">
          <div>
            <h3 className="font-semibold text-foreground">Desactivar grupo</h3>
            <p className="text-sm text-muted-foreground">Para un grupo que ya no se reúne. No borra su historia.</p>
          </div>
          <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => setConfirmarDesactivar(true)}>
            Desactivar grupo
          </BotonSistema>
        </TarjetaSistema>
      )}
    </div>
  )
}
