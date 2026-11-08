'use client'

/**
 * Planner — "Ubicar" / "Mover" (S2, S11; artboard 05 `#ubicar`): the keyboard
 * and touch path for what dragging does. Pick the group (only the groups the
 * actor edits, S10; a member can also go back to the bank) and the role; the
 * spouse rule shows before confirming: into Matrimonios the couple goes
 * together, elsewhere a couple row asks who goes and the note says where the
 * spouse stays (mensajeConyugeQueSeQueda). The dialog traps the focus and
 * returns it to the button that opened it. On a phone (T8c) it is a bottom
 * sheet: the touch path, since nothing is dragged there. Planning style
 * (S25): the 420px dialog with the 17px title; its fields keep 44px.
 */
import { useId, useState, type FormEvent, type ReactElement } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { HojaInferior } from '@/components/ui/hoja-inferior'
import { useEsEscritorio } from '@/components/ui/detalle-responsivo'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { esMatrimonios, etiquetaGrupo, nombrePersona, personasDelGrupo, type GrupoTablero, type PersonaBanco } from '@/lib/platform/grupos-vida/planner'

import { CLASE_DIALOGO, CLASE_TITULO_DIALOGO } from './estilo-planner'
import { ETIQUETA_ROL, planearMovimiento, type RolDestino } from './modelo'
import type { PeticionUbicar } from './contexto-pasos'

export const DESTINO_BANCO = 'banco'

export interface DialogoUbicarProps {
  readonly peticion: PeticionUbicar | null
  /** The groups the actor edits, in display order. */
  readonly grupos: readonly GrupoTablero[]
  readonly fichas: ReadonlyMap<string, PersonaBanco>
  readonly onCerrar: () => void
  readonly onConfirmar: (usuarioIds: readonly string[], grupoId: string | null, rol: RolDestino, aviso: string | null) => void
}

const ROLES: readonly RolDestino[] = ['miembro', 'aprendiz', 'lider']

const DESCRIPCION = 'Queda sin guardar hasta que toques «Guardar».'

const tituloDe = (peticion: PeticionUbicar): string => `${peticion.carga.desdeGrupo ? 'Mover' : 'Ubicar'} a ${peticion.carga.nombre}`

function Formulario({
  peticion,
  grupos,
  fichas,
  onCerrar,
  onConfirmar,
  enHoja = false,
}: DialogoUbicarProps & { readonly peticion: PeticionUbicar; readonly enHoja?: boolean }): ReactElement {
  const { carga } = peticion
  const idForm = useId()
  const [destino, setDestino] = useState<string>(peticion.grupoId ?? '')
  const [rol, setRol] = useState<RolDestino>(peticion.rol)
  const [quien, setQuien] = useState<string | null>(null)

  const verbo = carga.desdeGrupo ? 'Mover' : 'Ubicar'
  const alBanco = destino === DESTINO_BANCO
  const grupo = grupos.find((g) => g.grupo_id === destino) ?? null
  const plan = grupo || alBanco ? planearMovimiento(carga.ids, grupo, fichas, quien) : null
  const pareja = carga.ids.length > 1
  const pideQuien = pareja && grupo !== null && !esMatrimonios(grupo.segmento_nombre)
  const listo = plan?.tipo === 'mover'

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (plan?.tipo !== 'mover') return
    onConfirmar(plan.usuarioIds, grupo?.grupo_id ?? null, rol, plan.aviso)
  }

  const opciones = [
    ...grupos.map((g) => ({ valor: g.grupo_id, etiqueta: `${g.nombre.trim() || etiquetaGrupo(g)} · ${etiquetaGrupo(g)} · ${personasDelGrupo(g).length}` })),
    ...(carga.desdeGrupo ? [{ valor: DESTINO_BANCO, etiqueta: 'Banco de personas (sin grupo)' }] : []),
  ]

  const botones = (
    <>
      <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={onCerrar}>
        Cancelar
      </BotonSistema>
      <BotonSistema type="submit" form={idForm} tamaño="sm" disabled={!listo}>
        {verbo}
      </BotonSistema>
    </>
  )

  return (
    <>
      {!enHoja && (
        // Clear of the dialog's 44px close button.
        <DialogHeader className="pr-9">
          <DialogTitle className={CLASE_TITULO_DIALOGO}>{tituloDe(peticion)}</DialogTitle>
          <DialogDescription>{DESCRIPCION}</DialogDescription>
        </DialogHeader>
      )}
      <form id={idForm} onSubmit={enviar} className="space-y-4">
        <SelectSistema label="Grupo" opciones={opciones} placeholder="Elige un grupo" value={destino} onValueChange={(v) => setDestino(v)} />
        {!alBanco && (
          <SelectSistema
            label="Rol"
            opciones={ROLES.map((r) => ({ valor: r, etiqueta: ETIQUETA_ROL[r] }))}
            value={rol}
            onValueChange={(v) => setRol(ROLES.find((r) => r === v) ?? 'miembro')}
          />
        )}
        {pideQuien && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">¿Quién va?</p>
            <ControlSegmentado<string>
              etiqueta="¿Quién va?"
              opciones={carga.ids.map((id) => ({ valor: id, etiqueta: fichas.get(id) ? nombrePersona(fichas.get(id)!) : id }))}
              valor={quien ?? ''}
              onCambio={setQuien}
            />
            <p className="text-xs text-muted-foreground">Fuera de Matrimonios cada uno va a su grupo.</p>
          </div>
        )}
        {plan?.tipo === 'mover' && (plan.nota || plan.aviso) && (
          <AvisoFormulario tono="info" role="status" className="py-3">
            {plan.nota ?? plan.aviso}
          </AvisoFormulario>
        )}
      </form>
      {enHoja ? <div className="mt-5 grid grid-cols-2 gap-2.5">{botones}</div> : <DialogFooter>{botones}</DialogFooter>}
    </>
  )
}

export function DialogoUbicar(props: DialogoUbicarProps): ReactElement {
  const { peticion, onCerrar } = props
  const telefono = useEsEscritorio() === false
  if (telefono) {
    return (
      <HojaInferior abierta={peticion !== null} onCambioAbierta={(abierta) => !abierta && onCerrar()} titulo={peticion ? tituloDe(peticion) : 'Ubicar'} descripcion={DESCRIPCION}>
        {peticion && <Formulario key={`${peticion.carga.ids.join('|')}:${peticion.grupoId ?? ''}`} {...props} peticion={peticion} enHoja />}
      </HojaInferior>
    )
  }
  return (
    <Dialog open={peticion !== null} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className={CLASE_DIALOGO}>
        {/* Keyed so every request starts from its own group and role. */}
        {peticion && <Formulario key={`${peticion.carga.ids.join('|')}:${peticion.grupoId ?? ''}`} {...props} peticion={peticion} />}
      </DialogContent>
    </Dialog>
  )
}
