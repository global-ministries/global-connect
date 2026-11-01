'use client'

/**
 * The one-screen registration at the desk (odd/tasks/ninos-v2.md N4b,
 * prototype 04): the same sections as the parent's phone inside the check-in
 * "Nueva familia" panel, Familias and the pre-registration review. With a
 * service (`ingreso`) the primary action is "Registrar y dar ingreso · N"
 * (registration, then the check-in of the new children) and "Solo registrar"
 * is secondary; without one it is "Registrar familia" / "Agregar niño" as
 * before. Every check of the former desk form stays (use-registro-mesa); the
 * ficha extras live in "Para después".
 */
import { useState } from 'react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { BotonSistema, InputSistema, PieAccionesSistema } from '@/components/ui/sistema-diseno'
import type { OcupacionSalon } from '@/lib/platform/ninos/checkin-vista'
import type { FamiliaForm } from '@/lib/platform/ninos/familia'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import type { SalonNivel } from '@/lib/platform/ninos/nivel'
import { datosIniciales, familiaMesa, idRapido } from '@/lib/platform/ninos/registro-rapido'

import { CamposNino } from '../campos-nino'
import { CasillaConyuge, CoincidenciasPadre, HijosRepetidos, RepresentanteConocido } from './avisos-mesa'
import { ResumenFaltantes } from './piezas'
import { ResultadoMesaVista } from './resultado-mesa'
import { SeccionesRegistro } from './secciones-registro'
import { useFormularioRapido } from './use-formulario-rapido'
import { useRegistroMesa, type Guardar, type IngresoMesa } from './use-registro-mesa'

export type RegistroMesaProps = {
  /** When set, the form only adds children to this parent. */
  padreExistente?: { id: string; nombre: string }
  /** consulta: "Nombre Apellido" of the first child, to find the family again. */
  onRegistrada: (padreId: string, consulta: string) => void
  onCancelar: () => void
  /** Prefilled form (a pre-registration under review). */
  inicial?: FamiliaForm
  /** Replaces the direct RPC (e.g. confirming a pre-registration through its route). */
  guardar?: Guardar
  textoGuardar?: string
  /** The rooms that define the child's level and its suggestion. */
  salones?: readonly SalonNivel[]
  /** Opens another family that already has one of these children (consulta: the child's name). */
  onAbrirFamilia?: (padreId: string, consulta: string) => void
  /** The check-in service: enables "Registrar y dar ingreso". */
  ingreso?: IngresoMesa
  /** Today's occupancy by salón id, next to each child's salón. */
  ocupacion?: ReadonlyMap<string, OcupacionSalon>
  /** "Siguiente familia" after the code (reload the desk). */
  onIngresado?: () => void
}

export function RegistroMesa(props: RegistroMesaProps) {
  const { padreExistente, onRegistrada, onCancelar, guardar, salones = [], ingreso } = props
  const [hoy] = useState(hoyEnCaracas)
  const mesa = useRegistroMesa({ padreExistente, guardar, ingreso, salones, onRegistrada })
  const confirmado = mesa.padreConfirmado
  const padreNombre = padreExistente?.nombre ?? (confirmado ? `${confirmado.nombre} ${confirmado.apellido}`.trim() : undefined)
  const form = useFormularioRapido(
    () => datosIniciales({ form: props.inicial }),
    { modo: 'mesa', hoy, padreConocido: padreNombre !== undefined, padreNombre },
    salones,
  )
  const { datos } = form
  const n = datos.hijos.length
  const conIngreso = Boolean(ingreso) && !guardar

  function enviar(ingresar: boolean) {
    if (mesa.guardando || !form.intentar()) return
    void mesa.enviar(familiaMesa(datos, padreExistente?.id ?? confirmado?.id), ingresar)
  }

  if (mesa.resultado) {
    const r = mesa.resultado
    return (
      <ResultadoMesaVista
        resultado={r}
        salones={salones}
        representante={padreNombre ?? `${datos.padre.nombre} ${datos.padre.apellido}`.trim()}
        onSiguiente={props.onIngresado ?? onCancelar}
        onContinuar={() => onRegistrada(r.padreId, r.consulta)}
      />
    )
  }

  const textoBoton = props.textoGuardar ?? (padreExistente ? (n > 1 ? `Agregar ${n} niños` : 'Agregar niño') : 'Registrar familia')
  const conocido = padreNombre !== undefined && (
    <RepresentanteConocido existente={padreExistente} confirmado={confirmado} onCambiar={mesa.cambiarRepresentante} />
  )

  return (
    <form
      noValidate
      className="grid min-w-0 gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        enviar(conIngreso)
      }}
    >
      <SeccionesRegistro
        form={form}
        modo="mesa"
        hoy={hoy}
        salones={salones}
        ocupacion={props.ocupacion}
        padreConocido={conocido || undefined}
        debajoTelefono={
          <CoincidenciasPadre
            coincidencias={mesa.coincidencias}
            guardando={mesa.guardando}
            onConfirmar={(p) => void mesa.confirmar(familiaMesa(datos), p)}
            onDescartar={mesa.descartarCoincidencias}
          />
        }
        antesDeRetiran={
          mesa.conyuge && <CasillaConyuge conyuge={mesa.conyuge.persona} marcado={mesa.vincularConyuge} onMarcar={mesa.setVincularConyuge} />
        }
        despues={
          <>
            {padreNombre === undefined && (
              <InputSistema
                id={idRapido.padre('cedula')}
                label="Cédula (opcional)"
                inputMode="numeric"
                className="font-mono tabular-nums"
                value={datos.padre.cedula}
                onChange={(e) => form.setPadre('cedula', e.target.value)}
              />
            )}
            {datos.hijos.map((h, i) => (
              <section key={i} aria-label={`Ficha de ${h.nombre.trim() || `niño ${i + 1}`}`} className="grid min-w-0 gap-3 border-t border-border pt-4">
                <h3 className="text-sm font-semibold text-foreground">Ficha de {h.nombre.trim() || `niño ${i + 1}`}</h3>
                <CamposNino
                  indice={i}
                  hijo={h}
                  salones={salones}
                  soloFicha
                  onChange={(x) => {
                    const nivelCambiado = x.grado !== h.grado || x.salonPreferidoId !== h.salonPreferidoId
                    form.setHijo(i, { ...x, nivelAuto: nivelCambiado ? '' : h.nivelAuto })
                  }}
                />
              </section>
            ))}
          </>
        }
      />

      {mesa.repetidos && (
        <HijosRepetidos
          lista={mesa.repetidos.lista}
          guardando={mesa.guardando}
          onAbrirFamilia={props.onAbrirFamilia}
          onRegistrarIgual={() => void mesa.registrarDeTodosModos()}
          onCorregir={mesa.descartarRepetidos}
        />
      )}
      {form.intentado && <ResumenFaltantes faltan={form.faltan} />}
      {mesa.errores.length > 0 && (
        <AvisoFormulario tono="error">
          <ul className="grid gap-1">
            {mesa.errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </AvisoFormulario>
      )}

      <PieAccionesSistema>
        <BotonSistema type="button" variante="outline" onClick={onCancelar}>
          Cancelar
        </BotonSistema>
        {conIngreso && (
          <BotonSistema type="button" variante="outline" disabled={mesa.guardando} onClick={() => enviar(false)}>
            Solo registrar
          </BotonSistema>
        )}
        <BotonSistema type="submit" cargando={mesa.guardando}>
          {conIngreso ? (
            <>
              Registrar y dar ingreso · <span className="font-mono tabular-nums">{n}</span>
            </>
          ) : (
            textoBoton
          )}
        </BotonSistema>
      </PieAccionesSistema>
    </form>
  )
}
