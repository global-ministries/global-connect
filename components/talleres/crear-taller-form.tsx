'use client'

/**
 * T3 — Create taller abstracto form (client wrapper).
 *
 * T2 (odd/tasks/talleres-consolidar-pantallas.md) — moved here from
 * app/(auth)/admin/talleres/abstracto/nuevo/crear-form.tsx so the new
 * /talleres catalog can reuse it without importing across an app/ route
 * folder. The old abstracto/page.tsx and abstracto/nuevo/page.tsx now
 * import it from this shared location too — this is a move, not a copy,
 * so there is exactly one implementation. The server action it calls
 * (createTallerAbstract) stays in its original location; only the
 * client form component moved.
 *
 * Renders an inline form to create a new abstract taller. The equipo
 * choice is mandatory: "vincular" picks one of the eligible existing
 * org-chart nodes (`opciones.vincular`), "nuevo" mints a fresh one
 * under a chosen active parent (`opciones.crearBajo`) — see
 * lib/platform/talleres/equipo-organigrama.ts for how both lists are
 * built and odd/tasks/talleres-equipo-en-organigrama.md for why the
 * choice is required.
 *
 * Field-level problems (nombre too short, no equipo chosen) show as
 * inline errors under each control; the RPC's own result (success or
 * failure) is the only thing that goes through useNotificaciones() —
 * matches the pattern in app/(auth)/admin/dream-team/servidores/
 * servidores-client.tsx.
 */

import { useState, useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'

import {
  BotonSistema,
  InputSistema,
  SelectSistema,
  TarjetaSistema,
  TextareaSistema,
  TextoSistema,
} from '@/components/ui/sistema-diseno'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import type { OpcionesEquipoTaller } from '@/lib/platform/talleres/equipo-organigrama'

import { createTallerAbstract } from '@/app/(auth)/admin/talleres/abstracto/nuevo/actions'

type ModoEquipo = 'vincular' | 'nuevo'

const MODO_OPCIONES = [
  { valor: 'vincular', etiqueta: 'Vincular un equipo que ya existe' },
  { valor: 'nuevo', etiqueta: 'Crear un equipo nuevo bajo…' },
]

interface Props {
  readonly opciones: OpcionesEquipoTaller
}

export function CrearTallerAbstractoForm({ opciones }: Props): ReactElement {
  const router = useRouter()
  const toast = useNotificaciones()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [modalidad, setModalidad] = useState<'periodo_general' | 'permanente_custom'>('periodo_general')
  const [slug, setSlug] = useState('')
  const [modo, setModo] = useState<ModoEquipo>('vincular')
  const [equipoId, setEquipoId] = useState('')
  const [parentEquipoId, setParentEquipoId] = useState('')

  const [erroresCampo, setErroresCampo] = useState<Record<string, string>>({})

  function validar(): Record<string, string> {
    const errores: Record<string, string> = {}
    if (nombre.trim().length < 2) {
      errores.nombre = 'El nombre debe tener al menos 2 caracteres.'
    }
    if (modo === 'vincular' && !equipoId) {
      errores.equipoId = 'Elegí un nodo del árbol.'
    }
    if (modo === 'nuevo' && !parentEquipoId) {
      errores.parentEquipoId = 'Elegí bajo qué nodo colgarlo.'
    }
    return errores
  }

  function limpiar(): void {
    setNombre('')
    setDescripcion('')
    setSlug('')
    setModo('vincular')
    setEquipoId('')
    setParentEquipoId('')
    setErroresCampo({})
  }

  function submit(): void {
    const errores = validar()
    setErroresCampo(errores)
    if (Object.keys(errores).length > 0) return

    startTransition(async () => {
      const result = await createTallerAbstract({
        nombre,
        descripcion: descripcion.trim() === '' ? null : descripcion,
        modalidad_default: modalidad,
        slug: slug.trim() === '' ? undefined : slug,
        equipoId: modo === 'vincular' ? equipoId : undefined,
        parentEquipoId: modo === 'nuevo' ? parentEquipoId : undefined,
      })
      if (result.ok) {
        toast.success('Taller creado.')
        router.refresh()
        limpiar()
        setOpen(false)
      } else {
        toast.error(result.message ?? 'No se pudo crear el taller.')
      }
    })
  }

  if (!open) {
    return (
      <BotonSistema type="button" icono={Plus} onClick={() => setOpen(true)}>
        Crear grupo de corto plazo
      </BotonSistema>
    )
  }

  return (
    <TarjetaSistema variante="elevated" className="p-5">
      <TextoSistema className="text-lg font-medium">Nuevo grupo de corto plazo</TextoSistema>
      <TextoSistema variante="sutil" className="mt-1 block text-sm">
        El slug se genera automáticamente del nombre si lo dejás vacío. Elegí
        dónde vive este taller en el organigrama de Dream Team — es
        obligatorio y no se puede cambiar después desde acá.
      </TextoSistema>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <InputSistema
          label="Nombre *"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. Matrimonio sobre la Roca"
          error={erroresCampo.nombre}
        />
        <InputSistema
          label="Slug (opcional)"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="auto: matrimonio-sobre-la-roca"
          className="font-mono text-sm"
        />
        <div className="md:col-span-2">
          <TextareaSistema
            label="Descripción (opcional)"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Descripción del taller, objetivos, público objetivo..."
          />
        </div>
        <SelectSistema
          label="Modalidad default"
          opciones={[
            { valor: 'periodo_general', etiqueta: 'Periodo general' },
            { valor: 'permanente_custom', etiqueta: 'Permanente custom' },
          ]}
          value={modalidad}
          onValueChange={(v) => setModalidad(v as 'periodo_general' | 'permanente_custom')}
        />

        <SelectSistema
          label="Dónde vive en el organigrama *"
          opciones={MODO_OPCIONES}
          value={modo}
          onValueChange={(v) => setModo(v as ModoEquipo)}
        />

        {modo === 'vincular' && (
          <div className="md:col-span-2">
            <SelectSistema
              label="Equipo *"
              opciones={opciones.vincular.map((o) => ({ valor: o.id, etiqueta: o.ruta }))}
              placeholder={
                opciones.vincular.length === 0 ? 'No hay nodos disponibles para vincular' : 'Elegí un nodo del árbol'
              }
              value={equipoId}
              onValueChange={setEquipoId}
              error={erroresCampo.equipoId}
              disabled={opciones.vincular.length === 0}
            />
          </div>
        )}

        {modo === 'nuevo' && (
          <div className="md:col-span-2">
            <SelectSistema
              label="Crear bajo *"
              opciones={opciones.crearBajo.map((o) => ({ valor: o.id, etiqueta: o.ruta }))}
              placeholder="Elegí el padre del nuevo equipo"
              value={parentEquipoId}
              onValueChange={setParentEquipoId}
              error={erroresCampo.parentEquipoId}
            />
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <BotonSistema
          type="button"
          variante="outline"
          onClick={() => {
            setOpen(false)
            setErroresCampo({})
          }}
        >
          Cancelar
        </BotonSistema>
        <BotonSistema type="button" onClick={submit} cargando={pending}>
          Crear taller
        </BotonSistema>
      </div>
    </TarjetaSistema>
  )
}
