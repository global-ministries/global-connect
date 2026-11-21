'use client'

/**
 * Estudiantes › Grupos — «Agregar representante» in the member view (S2 of
 * odd/tasks/representante-buscador.md), inline in the drawer: the
 * search-first picker (search → pick, or «No está, registrarlo» with the
 * typed fields), the parentesco once someone is picked or typed, and
 * «Guardar» / «Cancelar». The typed path is required here (nombre, teléfono,
 * sexo: `validarRepresentante(r, true)`) and the payload is the visitor
 * form's (`datosRepresentante`). Saving goes through the drawer's
 * `accion.ejecutar` (toast, Spanish error); only whoever manages the group
 * reaches this view, and the database checks it (S3).
 */
import { useState, type ReactElement } from 'react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { agregarRepresentante } from '@/lib/actions/estudiantes-grupos.actions'
import {
  buscarRepresentante,
  datosRepresentante,
  elegirRepresentante,
  modoRepresentante,
  nombreRepresentante,
  registrarRepresentante,
  validarRepresentante,
  type ErroresRepresentante,
  type RepresentanteFormulario,
} from '@/lib/platform/estudiantes/visitante'

import type { AccionGrupo } from '../grupos/use-accion-grupo'
import { CampoParentesco, CamposRepresentante } from './campos-representante'
import { SelectorRepresentante } from './selector-representante'

const INICIAL: RepresentanteFormulario = { nombre: '', apellido: '', telefono: '', cedula: '', genero: '', tipo: 'padre' }

export interface AgregarRepresentanteProps {
  readonly grupoId: string
  readonly personaId: string
  /** The student's full name, for the toast. */
  readonly estudiante: string
  readonly accion: AccionGrupo
  /** «Cancelar», and after saving. */
  readonly onCerrar: () => void
}

export function AgregarRepresentante({ grupoId, personaId, estudiante, accion, onCerrar }: AgregarRepresentanteProps): ReactElement {
  const [r, setR] = useState<RepresentanteFormulario>(INICIAL)
  const [errores, setErrores] = useState<ErroresRepresentante>({})
  const { pendiente, ejecutar } = accion
  const modo = modoRepresentante(r)

  function cambiarModo(siguiente: RepresentanteFormulario): void {
    setR(siguiente)
    setErrores({})
  }

  async function guardar(): Promise<void> {
    const encontrados = validarRepresentante(r, true)
    setErrores(encontrados)
    const representante = datosRepresentante(r)
    if (Object.keys(encontrados).length > 0 || representante === null) return
    const ok = await ejecutar(
      'representante',
      () => agregarRepresentante({ grupoId, personaId, representante }),
      `${nombreRepresentante(r)} es ahora representante de ${estudiante}`,
    )
    if (ok) onCerrar()
  }

  return (
    <div className="space-y-3">
      <SelectorRepresentante
        id="integrante-rep"
        grupoId={grupoId}
        elegido={r.personaId ? { personaId: r.personaId, nombre: r.personaNombre ?? '' } : null}
        nuevo={modo === 'nuevo'}
        onElegir={(persona) => cambiarModo(elegirRepresentante(r, persona))}
        onCambiar={() => cambiarModo(buscarRepresentante(r))}
        onRegistrar={() => cambiarModo(registrarRepresentante(r))}
      >
        <CamposRepresentante id="integrante-rep" valor={r} errores={errores} onCambio={(parche) => setR((actual) => ({ ...actual, ...parche }))} />
      </SelectorRepresentante>
      {modo !== 'buscar' && <CampoParentesco valor={r.tipo} onCambio={(tipo) => setR((actual) => ({ ...actual, tipo }))} />}
      <div className="flex flex-wrap gap-2 pt-1">
        <BotonSistema type="button" variante="outline" disabled={pendiente !== null} onClick={onCerrar}>
          Cancelar
        </BotonSistema>
        {modo !== 'buscar' && (
          <BotonSistema type="button" cargando={pendiente === 'representante'} disabled={pendiente !== null} onClick={guardar}>
            Guardar
          </BotonSistema>
        )}
      </div>
    </div>
  )
}
