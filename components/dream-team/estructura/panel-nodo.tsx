'use client'

/**
 * Estructura — the detail panel of one org chart box (S12 of
 * odd/tasks/sistema-diseno-v2.md; prototype prototipos/estructura/07-b-escritorio.html
 * and 08-b-celular.html). One `DetalleResponsivo`: side panel from md, bottom
 * sheet below. Identity (name, path, experiencia, estado, how many things to
 * review), the quick actions Subequipo · Renombrar · Desactivar/Activar, and
 * the tabs Resumen · Roles · Turnos · Taller.
 *
 * Who edits: `puedeEditar` (org.manage) on a real equipo. A director reads the
 * same panel without any editor; a Grupos de Vida node is a read-only
 * projection for everyone and only gets the Resumen. Data and callbacks come
 * in; the mutations are the server actions in
 * app/(auth)/admin/dream-team/estructura/{actions,turnos-actions}.ts.
 */
import { useState, useTransition, type ReactElement } from 'react'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import { Ban, Pencil, Plus, Power } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { FONDO_TONO, PuntoEstado } from '@/components/ui/punto-estado'
import { BadgeSistema, BotonSistema } from '@/components/ui/sistema-diseno'
import { TabsContent, TabsList, TabsSistema, TabsTrigger } from '@/components/ui/TabsSistema'
import { cn } from '@/lib/utils'
import { cambiarActivoEquipo, crearEquipo, renombrarEquipo } from '@/app/(auth)/admin/dream-team/estructura/actions'
import type { DetalleEquipo } from '@/lib/platform/dream-team/estructura-vista'

import { DialogoNombre } from './dialogo-nombre'
import { reportarResultado, type Toast } from './mensajes'
import { PanelNodoResumen, type ProblemaNodo } from './panel-nodo-resumen'
import { PanelNodoRoles } from './panel-nodo-roles'
import { PanelNodoTaller } from './panel-nodo-taller'
import { PanelNodoTurnos, type TurnosNodo } from './panel-nodo-turnos'

export type { ProblemaNodo } from './panel-nodo-resumen'
export { SALUD_PROBLEMA } from './panel-nodo-resumen'
export type { TurnosNodo } from './panel-nodo-turnos'

export type PestanaNodo = 'resumen' | 'roles' | 'turnos' | 'taller'

const PESTANAS: readonly { readonly valor: PestanaNodo; readonly etiqueta: string }[] = [
  { valor: 'resumen', etiqueta: 'Resumen' },
  { valor: 'roles', etiqueta: 'Roles' },
  { valor: 'turnos', etiqueta: 'Turnos' },
  { valor: 'taller', etiqueta: 'Taller' },
]

const ACCION_RAPIDA = 'h-[66px] min-w-0 flex-col gap-1 px-2 text-[13px]'

export interface PanelNodoProps {
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  readonly detalle: DetalleEquipo
  /** Root dirección above the node, for "Ver su gente en Mi equipo". */
  readonly direccionId: string
  /** The node's own health problems, in display order. */
  readonly problemas: readonly ProblemaNodo[]
  /** The problems of a subequipo, for its row in Resumen. */
  readonly problemasDe?: (equipoId: string) => readonly ProblemaNodo[]
  /** org.manage: edits real equipos. A director (read-only on their branch) passes false. */
  readonly puedeEditar: boolean
  /**
   * The node's shifts once the server answered for this very node; while
   * absent, the Turnos tab says they are loading.
   */
  readonly turnos?: TurnosNodo
  /** Controlled tab (e.g. kept in the URL); internal, starting at Resumen, when absent. */
  readonly pestana?: PestanaNodo
  readonly onCambioPestana?: (pestana: PestanaNodo) => void
  /** A subequipo row was tapped: open that node. */
  readonly onAbrirNodo: (equipoId: string) => void
  /** Any change went through: reload the page data. */
  readonly onActualizado: () => void
  /** Opens the "Turnos del campus" page tab from the Turnos tab. */
  readonly onVerTurnosCampus?: () => void
  readonly toast: Toast
}

function esPestana(valor: string): valor is PestanaNodo {
  return PESTANAS.some((pestana) => pestana.valor === valor)
}

function PuntoPestana({ tono, texto }: { readonly tono: 'info' | 'danger'; readonly texto: string }): ReactElement {
  return (
    <>
      <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', FONDO_TONO[tono])} />
      <span className="sr-only">{`, ${texto}`}</span>
    </>
  )
}

export function PanelNodo({
  abierto,
  onCambioAbierto,
  detalle,
  direccionId,
  problemas,
  problemasDe,
  puedeEditar,
  turnos,
  pestana: pestanaControlada,
  onCambioPestana,
  onAbrirNodo,
  onActualizado,
  onVerTurnosCampus,
  toast,
}: PanelNodoProps): ReactElement {
  const [isPending, startTransition] = useTransition()
  // Tab and shift editing belong to the node they were chosen on: another node starts at Resumen.
  const [local, setLocal] = useState<{ readonly id: string; readonly pestana: PestanaNodo; readonly editandoTurnos: boolean }>({
    id: detalle.id,
    pestana: 'resumen',
    editandoTurnos: false,
  })
  const [dialogo, setDialogo] = useState<'renombrar' | 'subequipo' | 'desactivar' | null>(null)

  const delNodo = local.id === detalle.id ? local : { id: detalle.id, pestana: 'resumen' as const, editandoTurnos: false }
  const soloLectura = !detalle.editable
  const edita = puedeEditar && detalle.editable
  const pestana: PestanaNodo = soloLectura ? 'resumen' : (pestanaControlada ?? delNodo.pestana)
  const porRevisar = problemas.filter((problema) => problema !== 'inactivo').length
  const ruta = detalle.ruta.slice(0, -1).join(' › ')

  function irA(siguiente: PestanaNodo, editandoTurnos = false): void {
    setLocal({ id: detalle.id, pestana: siguiente, editandoTurnos })
    onCambioPestana?.(siguiente)
  }

  function editarTurnos(editandoTurnos: boolean): void {
    setLocal({ ...delNodo, pestana: 'turnos', editandoTurnos })
  }

  function cambiarActivo(activo: boolean): void {
    startTransition(async () => {
      const resultado = await cambiarActivoEquipo({ id: detalle.id, activo })
      setDialogo(null)
      if (reportarResultado(toast, resultado, activo ? 'Equipo activado.' : 'Equipo desactivado.')) onActualizado()
    })
  }

  const resumen = (
    <PanelNodoResumen
      detalle={detalle}
      direccionId={direccionId}
      problemas={problemas}
      problemasDe={problemasDe}
      turnos={turnos}
      edita={edita}
      ocupado={isPending}
      onVerRoles={() => irA('roles')}
      onElegirTurnos={() => irA('turnos', true)}
      onActivar={() => cambiarActivo(true)}
      onAgregarSubequipo={() => setDialogo('subequipo')}
      onAbrirNodo={onAbrirNodo}
    />
  )

  return (
    <DetalleResponsivo
      abierto={abierto}
      onCambioAbierto={onCambioAbierto}
      titulo={detalle.label}
      descripcion={ruta || undefined}
      ancho="estructura"
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <BadgeSistema tamaño="sm">{detalle.experienciaLabel}</BadgeSistema>
          <span data-estado="">
            {soloLectura ? (
              <PuntoEstado tono="muted" etiqueta="Solo lectura" />
            ) : (
              <PuntoEstado tono={detalle.activo ? 'success' : 'muted'} etiqueta={detalle.activo ? 'Activo' : 'Inactivo'} />
            )}
          </span>
          {porRevisar > 0 && (
            <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning-text">
              {porRevisar === 1 ? '1 cosa por revisar' : `${porRevisar} cosas por revisar`}
            </span>
          )}
        </div>

        {edita && (
          <div className="grid grid-cols-3 gap-2">
            <BotonSistema type="button" variante="outline" icono={Plus} className={ACCION_RAPIDA} disabled={isPending} onClick={() => setDialogo('subequipo')}>
              Subequipo
            </BotonSistema>
            <BotonSistema type="button" variante="outline" icono={Pencil} className={ACCION_RAPIDA} disabled={isPending} onClick={() => setDialogo('renombrar')}>
              Renombrar
            </BotonSistema>
            {detalle.activo ? (
              <BotonSistema type="button" variante="outline" icono={Ban} className={ACCION_RAPIDA} disabled={isPending} onClick={() => setDialogo('desactivar')}>
                Desactivar
              </BotonSistema>
            ) : (
              <BotonSistema type="button" variante="outline" icono={Power} className={ACCION_RAPIDA} disabled={isPending} onClick={() => cambiarActivo(true)}>
                Activar
              </BotonSistema>
            )}
          </div>
        )}

        {soloLectura ? (
          resumen
        ) : (
          <TabsSistema value={pestana} onValueChange={(valor) => esPestana(valor) && irA(valor)}>
            <TabsList aria-label="Secciones del equipo" className="flex w-full">
              {PESTANAS.map(({ valor, etiqueta }) => (
                <TabsTrigger key={valor} value={valor} className="flex-1 gap-1.5 px-2">
                  {etiqueta}
                  {valor === 'roles' && problemas.includes('roles_sin_asignar') && <PuntoPestana tono="info" texto="roles sin asignar" />}
                  {valor === 'turnos' && problemas.includes('sin_turno') && <PuntoPestana tono="danger" texto="sin turno" />}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="resumen">{resumen}</TabsContent>
            <TabsContent value="roles">
              <PanelNodoRoles
                equipoId={detalle.id}
                equipoLabel={detalle.label}
                roles={detalle.roles}
                puedeEditar={edita}
                onActualizado={onActualizado}
                toast={toast}
              />
            </TabsContent>
            <TabsContent value="turnos">
              {turnos ? (
                <PanelNodoTurnos
                  key={`${detalle.id}:${turnos.propios.join(',')}:${turnos.efectivos.join(',')}`}
                  equipoId={detalle.id}
                  equipoLabel={detalle.label}
                  datos={turnos}
                  puedeEditar={edita}
                  editando={delNodo.editandoTurnos}
                  onEditando={editarTurnos}
                  onActualizado={onActualizado}
                  onVerTurnosCampus={onVerTurnosCampus}
                  toast={toast}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Cargando los turnos de este equipo…</p>
              )}
            </TabsContent>
            <TabsContent value="taller">
              <PanelNodoTaller taller={detalle.taller} />
            </TabsContent>
          </TabsSistema>
        )}
      </div>

      {dialogo === 'renombrar' && (
        <DialogoNombre
          titulo="Renombrar equipo"
          descripcion="El nuevo nombre se verá en todas las pantallas de Dream Team."
          etiquetaCampo="Nombre del equipo"
          valorInicial={detalle.label}
          textoBoton="Guardar"
          exito="Equipo renombrado correctamente."
          guardar={(label) => renombrarEquipo({ id: detalle.id, label })}
          onClose={() => setDialogo(null)}
          onHecho={onActualizado}
          toast={toast}
        />
      )}

      {dialogo === 'subequipo' && (
        <DialogoNombre
          titulo="Agregar subequipo"
          descripcion={`Se creará dentro de «${detalle.label}».`}
          etiquetaCampo="Nombre del subequipo"
          valorInicial=""
          textoBoton="Crear"
          exito="Subequipo creado correctamente."
          guardar={(label) => crearEquipo({ parentEquipoId: detalle.id, label })}
          onClose={() => setDialogo(null)}
          onHecho={onActualizado}
          toast={toast}
        />
      )}

      <AlertDialog open={dialogo === 'desactivar'} onOpenChange={(abre) => !abre && !isPending && setDialogo(null)}>
        <AlertDialogContent className="rounded-2xl bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Desactivar «${detalle.label}»`}</AlertDialogTitle>
            <AlertDialogDescription>
              El equipo pasará a estar inactivo y no se le podrán asignar personas. Podrás reactivarlo luego desde esta misma pantalla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* Radix focuses Cancel on open: the safe choice is the default. */}
            <AlertDialogPrimitive.Cancel asChild>
              <BotonSistema type="button" variante="outline" disabled={isPending}>
                Cancelar
              </BotonSistema>
            </AlertDialogPrimitive.Cancel>
            <BotonSistema type="button" variante="peligro" cargando={isPending} onClick={() => cambiarActivo(false)}>
              Sí, desactivar
            </BotonSistema>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DetalleResponsivo>
  )
}
