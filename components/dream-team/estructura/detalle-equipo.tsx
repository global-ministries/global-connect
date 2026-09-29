'use client'

/**
 * Estructura — the detail of the selected team: path, name and badges, the
 * actions that belong to the team itself, the three summary cards and the
 * teams inside it.
 *
 * The actions only exist for someone who can edit the structure AND for a
 * real team: a virtual Grupos de Vida node is a read-only projection, so it
 * never gets them whatever the viewer's capability.
 */
import { Fragment, useState, useTransition, type ReactElement } from 'react'
import { Plus } from 'lucide-react'

import { BotonFlotante } from '@/components/ui/BotonFlotante'
import { BadgeSistema, BotonSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { ConfirmationModal } from '@/components/modals/ConfirmationModal'
import { cambiarActivoEquipo, crearEquipo, renombrarEquipo } from '@/app/(auth)/admin/dream-team/estructura/actions'
import type { DetalleEquipo } from '@/lib/platform/dream-team/estructura-vista'

import { DialogoNombre } from './dialogo-nombre'
import { ListaSubequipos } from './lista-subequipos'
import { reportarResultado, type Toast } from './mensajes'
import { RolesEquipo } from './roles-equipo'
import { TarjetasResumen } from './tarjetas-resumen'

export interface DetalleEquipoProps {
  readonly detalle: DetalleEquipo
  readonly direccionId: string
  readonly puedeEditar: boolean
  readonly onSeleccionar: (equipoId: string) => void
  /** Called after any successful change so the page reloads its data. */
  readonly onActualizado: () => void
  readonly toast: Toast
}

function Ruta({ ruta }: { readonly ruta: readonly string[] }): ReactElement {
  return (
    <nav aria-label="Ruta del equipo">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
        {ruta.map((paso, indice) => (
          <Fragment key={`${indice}-${paso}`}>
            {indice > 0 && (
              <li aria-hidden="true">›</li>
            )}
            <li>
              <span aria-current={indice === ruta.length - 1 ? 'page' : undefined}>{paso}</span>
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  )
}

export function DetalleEquipoVista({
  detalle,
  direccionId,
  puedeEditar,
  onSeleccionar,
  onActualizado,
  toast,
}: DetalleEquipoProps): ReactElement {
  const [isPending, startTransition] = useTransition()
  const [renombrando, setRenombrando] = useState(false)
  const [agregandoSubequipo, setAgregandoSubequipo] = useState(false)
  const [confirmandoDesactivar, setConfirmandoDesactivar] = useState(false)
  const puedeEditarEste = puedeEditar && detalle.editable

  function cambiarActivo(activo: boolean): void {
    startTransition(async () => {
      const resultado = await cambiarActivoEquipo({ id: detalle.id, activo })
      setConfirmandoDesactivar(false)
      if (reportarResultado(toast, resultado, activo ? 'Equipo activado.' : 'Equipo desactivado.')) onActualizado()
    })
  }

  return (
    <>
      <section aria-label="Detalle del equipo" className="flex min-w-0 flex-1 flex-col gap-6">
        <header className="flex flex-col gap-3">
          <Ruta ruta={detalle.ruta} />
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 flex-col gap-2.5">
              <TituloSistema nivel={2} className="text-2xl sm:text-3xl">
                {detalle.label}
              </TituloSistema>
              <div className="flex flex-wrap items-center gap-2">
                <BadgeSistema variante="info" tamaño="sm">
                  {detalle.experienciaLabel}
                </BadgeSistema>
                <BadgeSistema variante={detalle.activo ? 'success' : 'default'} tamaño="sm">
                  {detalle.activo ? 'Activo' : 'Inactivo'}
                </BadgeSistema>
              </div>
            </div>

            {puedeEditarEste && (
              <div className="flex shrink-0 flex-wrap items-center gap-2.5">
                <BotonSistema type="button" variante="outline" tamaño="sm" disabled={isPending} onClick={() => setRenombrando(true)}>
                  Renombrar
                </BotonSistema>
                {detalle.activo ? (
                  <BotonSistema
                    type="button"
                    variante="outline"
                    tamaño="sm"
                    disabled={isPending}
                    onClick={() => setConfirmandoDesactivar(true)}
                  >
                    Desactivar
                  </BotonSistema>
                ) : (
                  <BotonSistema type="button" variante="outline" tamaño="sm" disabled={isPending} onClick={() => cambiarActivo(true)}>
                    Activar
                  </BotonSistema>
                )}
                <BotonSistema
                  type="button"
                  tamaño="sm"
                  icono={Plus}
                  className="hidden md:inline-flex"
                  disabled={isPending}
                  onClick={() => setAgregandoSubequipo(true)}
                >
                  Agregar sub-equipo
                </BotonSistema>
              </div>
            )}
          </div>
        </header>

        <TarjetasResumen detalle={detalle} direccionId={direccionId} puedeAsignar={puedeEditarEste} />

        <div className="grid items-start gap-6 2xl:grid-cols-2">
          <ListaSubequipos hijos={detalle.hijos} puedeAgregar={puedeEditarEste} onSeleccionar={onSeleccionar} />
          {detalle.editable && (
            <RolesEquipo
              equipoId={detalle.id}
              roles={detalle.roles}
              puedeEditar={puedeEditar}
              onActualizado={onActualizado}
              toast={toast}
            />
          )}
        </div>

        {renombrando && (
          <DialogoNombre
            titulo="Renombrar equipo"
            descripcion="El nuevo nombre se verá en todas las pantallas de Dream Team."
            etiquetaCampo="Nombre del equipo"
            valorInicial={detalle.label}
            textoBoton="Guardar"
            exito="Equipo renombrado correctamente."
            guardar={(label) => renombrarEquipo({ id: detalle.id, label })}
            onClose={() => setRenombrando(false)}
            onHecho={onActualizado}
            toast={toast}
          />
        )}

        {agregandoSubequipo && (
          <DialogoNombre
            titulo="Agregar sub-equipo"
            descripcion={`Se creará dentro de "${detalle.label}".`}
            etiquetaCampo="Nombre del sub-equipo"
            valorInicial=""
            textoBoton="Crear"
            exito="Sub-equipo creado correctamente."
            guardar={(label) => crearEquipo({ parentEquipoId: detalle.id, label })}
            onClose={() => setAgregandoSubequipo(false)}
            onHecho={onActualizado}
            toast={toast}
          />
        )}

        <ConfirmationModal
          isOpen={confirmandoDesactivar}
          onClose={() => setConfirmandoDesactivar(false)}
          onConfirm={() => cambiarActivo(false)}
          title={`Desactivar "${detalle.label}"`}
          message="El equipo pasará a estar inactivo. Podrás reactivarlo luego desde esta misma pantalla. ¿Deseas continuar?"
          isLoading={isPending}
          confirmLabel="Sí, desactivar"
        />
      </section>

    {puedeEditarEste && <BotonFlotante icono={Plus} label="Agregar sub-equipo" onClick={() => setAgregandoSubequipo(true)} />}
    </>
  )
}
