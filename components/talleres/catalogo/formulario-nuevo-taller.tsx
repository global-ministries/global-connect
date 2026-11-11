'use client'

/**
 * R3c (odd/tasks/talleres-rediseno.md, S1, S2) — «Nuevo taller» of the v2
 * /talleres catálogo, in a DetalleResponsivo (side panel from md, bottom
 * sheet on phones) instead of the inline card of the old catálogo.
 *
 * Same fields, validation and write as CrearTallerAbstractoForm
 * (components/talleres/crear-taller-form.tsx): nombre, slug, descripción,
 * régimen and where the taller lives in the Dream Team org chart (link an
 * existing node or create one under a parent), sent to the existing server
 * action createTallerAbstract, which create_taller_abstract checks again.
 * Only the copy changes: neutral Spanish with «tú».
 */

import { useId, useState, useTransition, type FormEvent, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'

import {
  BotonSistema,
  CamposSistema,
  InputSistema,
  SelectSistema,
  TextareaSistema,
} from '@/components/ui/sistema-diseno'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { regimenLabel, type TallerRegimen } from '@/components/talleres/labels'
import type { OpcionesEquipoTaller } from '@/lib/platform/talleres/equipo-organigrama'

import { createTallerAbstract } from '@/app/(auth)/admin/talleres/abstracto/nuevo/actions'

type ModoEquipo = 'vincular' | 'nuevo'

const MODO_OPCIONES = [
  { valor: 'vincular', etiqueta: 'Vincular un equipo que ya existe' },
  { valor: 'nuevo', etiqueta: 'Crear un equipo nuevo bajo…' },
]

interface Props {
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  readonly opciones: OpcionesEquipoTaller
}

export function FormularioNuevoTaller({ abierto, onCambioAbierto, opciones }: Props): ReactElement {
  const router = useRouter()
  const toast = useNotificaciones()
  const idFormulario = useId()
  const [pendiente, startTransition] = useTransition()

  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [regimen, setRegimen] = useState<TallerRegimen>('temporada')
  const [slug, setSlug] = useState('')
  const [modo, setModo] = useState<ModoEquipo>('vincular')
  const [equipoId, setEquipoId] = useState('')
  const [parentEquipoId, setParentEquipoId] = useState('')
  const [errores, setErrores] = useState<Record<string, string>>({})

  function validar(): Record<string, string> {
    const encontrados: Record<string, string> = {}
    if (nombre.trim().length < 2) encontrados.nombre = 'El nombre debe tener al menos 2 caracteres.'
    if (modo === 'vincular' && !equipoId) encontrados.equipoId = 'Elige un nodo del árbol.'
    if (modo === 'nuevo' && !parentEquipoId) encontrados.parentEquipoId = 'Elige bajo qué nodo crearlo.'
    return encontrados
  }

  function limpiar(): void {
    setNombre('')
    setDescripcion('')
    setSlug('')
    setModo('vincular')
    setEquipoId('')
    setParentEquipoId('')
    setRegimen('temporada')
    setErrores({})
  }

  function enviar(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault()
    const encontrados = validar()
    setErrores(encontrados)
    if (Object.keys(encontrados).length > 0) return

    startTransition(async () => {
      const resultado = await createTallerAbstract({
        nombre,
        descripcion: descripcion.trim() === '' ? null : descripcion,
        // Derived 1:1 from régimen, as CrearTallerAbstractoForm does; p_regimen wins server-side.
        modalidad_default: regimen === 'cadencia' ? 'permanente_custom' : 'periodo_general',
        regimen,
        slug: slug.trim() === '' ? undefined : slug,
        equipoId: modo === 'vincular' ? equipoId : undefined,
        parentEquipoId: modo === 'nuevo' ? parentEquipoId : undefined,
      })
      if (resultado.ok) {
        toast.success('Taller creado.')
        limpiar()
        onCambioAbierto(false)
        router.refresh()
      } else {
        toast.error(resultado.message ?? 'No se pudo crear el taller.')
      }
    })
  }

  return (
    <DetalleResponsivo
      abierto={abierto}
      onCambioAbierto={(siguiente) => {
        if (!siguiente) setErrores({})
        onCambioAbierto(siguiente)
      }}
      titulo="Nuevo taller"
      descripcion="Elige dónde vive en el organigrama de Dream Team; es obligatorio y no se cambia después desde aquí."
      ancho="lg"
      pie={
        <>
          <BotonSistema type="button" variante="outline" onClick={() => onCambioAbierto(false)}>
            Cancelar
          </BotonSistema>
          <BotonSistema type="submit" form={idFormulario} cargando={pendiente}>
            Crear taller
          </BotonSistema>
        </>
      }
    >
      <form id={idFormulario} onSubmit={enviar} noValidate className="grid gap-4">
        <CamposSistema>
          <InputSistema
            label="Nombre *"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Matrimonio sobre la Roca"
            error={errores.nombre}
          />
          <InputSistema
            label="Slug (opcional)"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="Vacío: se genera del nombre"
            className="font-mono text-sm"
          />
        </CamposSistema>
        <TextareaSistema
          label="Descripción (opcional)"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Para quién es, qué se aprende…"
        />
        <CamposSistema>
          <SelectSistema
            label="Régimen"
            opciones={[
              { valor: 'temporada', etiqueta: regimenLabel('temporada') },
              { valor: 'cadencia', etiqueta: regimenLabel('cadencia') },
            ]}
            value={regimen}
            onValueChange={(v) => setRegimen(v as TallerRegimen)}
          />
          <SelectSistema
            label="Dónde vive en el organigrama *"
            opciones={MODO_OPCIONES}
            value={modo}
            onValueChange={(v) => setModo(v as ModoEquipo)}
          />
        </CamposSistema>
        {modo === 'vincular' ? (
          <SelectSistema
            label="Equipo *"
            opciones={opciones.vincular.map((o) => ({ valor: o.id, etiqueta: o.ruta }))}
            placeholder={opciones.vincular.length === 0 ? 'No hay nodos disponibles para vincular' : 'Elige un nodo del árbol'}
            value={equipoId}
            onValueChange={setEquipoId}
            error={errores.equipoId}
            disabled={opciones.vincular.length === 0}
          />
        ) : (
          <SelectSistema
            label="Crear bajo *"
            opciones={opciones.crearBajo.map((o) => ({ valor: o.id, etiqueta: o.ruta }))}
            placeholder="Elige el nodo padre del nuevo equipo"
            value={parentEquipoId}
            onValueChange={setParentEquipoId}
            error={errores.parentEquipoId}
          />
        )}
      </form>
    </DetalleResponsivo>
  )
}
