'use client'

/**
 * Planner — "Ubicar" / "Mover" (S2, S11; artboard 05 `#ubicar`): the keyboard
 * and touch path for what dragging does. Pick the group (only the groups the
 * actor edits, S10; a member can also go back to the bank) and the role; the
 * spouse rule shows before confirming: into Matrimonios the couple goes
 * together, elsewhere a couple row asks who goes and the note says where the
 * spouse stays (mensajeConyugeQueSeQueda). The dialog traps the focus and
 * returns it to the button that opened it.
 */
import { useId, useState, type FormEvent, type ReactElement } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { esMatrimonios, etiquetaGrupo, nombrePersona, personasDelGrupo, type GrupoTablero, type PersonaBanco } from '@/lib/platform/grupos-vida/planner'

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

function Formulario({ peticion, grupos, fichas, onCerrar, onConfirmar }: DialogoUbicarProps & { readonly peticion: PeticionUbicar }): ReactElement {
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

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {verbo} a {carga.nombre}
        </DialogTitle>
        <DialogDescription>Se guarda al confirmar y puedes deshacerlo.</DialogDescription>
      </DialogHeader>
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
      <DialogFooter>
        <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={onCerrar}>
          Cancelar
        </BotonSistema>
        <BotonSistema type="submit" form={idForm} tamaño="sm" disabled={!listo}>
          {verbo}
        </BotonSistema>
      </DialogFooter>
    </>
  )
}

export function DialogoUbicar(props: DialogoUbicarProps): ReactElement {
  const { peticion, onCerrar } = props
  return (
    <Dialog open={peticion !== null} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent>
        {/* Keyed so every request starts from its own group and role. */}
        {peticion && <Formulario key={`${peticion.carga.ids.join('|')}:${peticion.grupoId ?? ''}`} {...props} peticion={peticion} />}
      </DialogContent>
    </Dialog>
  )
}
