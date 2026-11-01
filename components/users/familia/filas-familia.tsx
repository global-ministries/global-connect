'use client'

/**
 * The rows of Mi familia (prototype `filaConfirmada`, `filaEnviada`,
 * `entrante`): a confirmed relative (relation label by gender, "Sin cuenta",
 * edit only for the ficha I created, Quitar, or "Ver en Mis hijos" for a
 * child under 13), a sent request (Pendiente, who it waits for, Cancelar),
 * and an incoming one ("X dice que es tu hermana", Confirmar / No es mi
 * familiar).
 */
import { Check, Pencil, Trash2, UserRound } from 'lucide-react'
import Link from 'next/link'
import type { ReactElement } from 'react'

import { PuntoEstado } from '@/components/ui/punto-estado'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import {
  etiquetaRelacion,
  nombreCompleto,
  notaFamiliar,
  textoEspera,
  textoRecibida,
  type Familiar,
  type SolicitudEnviada,
  type SolicitudRecibida,
} from '@/lib/platform/usuarios/familia-vista'

import { AvatarFicha, EtiquetaNeutra } from '../ficha/partes-ficha'

const CLASE_FILA = 'flex min-h-[68px] items-center gap-3 py-2 [&+&]:border-t [&+&]:border-border/60'

function Texto({ rel, nombre, sub }: { readonly rel: ReactElement; readonly nombre: string; readonly sub: string | null }): ReactElement {
  return (
    <div className="grid min-w-0 flex-1 gap-px">
      <span className="text-[13px] text-muted-foreground">{rel}</span>
      <span className="truncate text-[15px] font-semibold text-foreground">{nombre}</span>
      {sub && <span className="text-[13px] text-muted-foreground">{sub}</span>}
    </div>
  )
}

export interface FilaFamiliarProps {
  readonly familiar: Familiar
  readonly onQuitar: (f: Familiar) => void
  readonly onVerMisHijos: () => void
}

export function FilaFamiliar({ familiar: f, onQuitar, onVerMisHijos }: FilaFamiliarProps): ReactElement {
  const nombre = nombreCompleto(f)
  return (
    <li className={CLASE_FILA}>
      <AvatarFicha nombre={f.nombre} apellido={f.apellido} fotoUrl={null} />
      <Texto
        rel={
          <>
            {etiquetaRelacion(f.relacion, f.genero)}
            {!f.cuenta && !f.esNino && <EtiquetaNeutra className="ml-1.5 align-[1px]">Sin cuenta</EtiquetaNeutra>}
          </>
        }
        nombre={nombre}
        sub={notaFamiliar(f)}
      />
      <div className="flex shrink-0 gap-2">
        {f.esNino ? (
          <BotonSistema type="button" variante="outline" tamaño="sm" icono={UserRound} onClick={onVerMisHijos}>
            <span><span className="max-md:hidden">Ver en </span>Mis hijos</span>
          </BotonSistema>
        ) : (
          <>
            {f.puedoEditar && (
              <BotonSistema asChild variante="ghost" tamaño="sm" soloIcono icono={Pencil} aria-label={`Editar los datos de ${nombre}`}>
                <Link href={`/users/${f.usuarioId}/edit`} />
              </BotonSistema>
            )}
            <BotonSistema type="button" variante="ghost" tamaño="sm" soloIcono icono={Trash2} aria-label={`Quitar a ${nombre} de tu familia`} onClick={() => onQuitar(f)} />
          </>
        )}
      </div>
    </li>
  )
}

export function FilaEnviada({ solicitud: s, onCancelar }: { readonly solicitud: SolicitudEnviada; readonly onCancelar: (s: SolicitudEnviada) => void }): ReactElement {
  const nombre = nombreCompleto(s)
  return (
    <li className={CLASE_FILA}>
      <AvatarFicha nombre={s.nombre} apellido={s.apellido} fotoUrl={null} />
      <Texto
        rel={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            {etiquetaRelacion(s.tipo, s.genero)}
            <PuntoEstado tono="warning" etiqueta="Pendiente" />
          </span>
        }
        nombre={nombre}
        sub={textoEspera(s)}
      />
      <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => onCancelar(s)} aria-label={`Cancelar la solicitud a ${nombre}`}>
        Cancelar
      </BotonSistema>
    </li>
  )
}

export interface SolicitudEntranteProps {
  readonly solicitud: SolicitudRecibida
  readonly ocupado: boolean
  readonly onConfirmar: (s: SolicitudRecibida) => void
  readonly onRechazar: (s: SolicitudRecibida) => void
}

export function SolicitudEntrante({ solicitud: s, ocupado, onConfirmar, onRechazar }: SolicitudEntranteProps): ReactElement {
  const titulo = textoRecibida(s)
  return (
    <section aria-label={titulo} className="col-span-full flex items-start gap-3 rounded-2xl border border-brand/30 bg-brand-tint px-4 py-3.5">
      <span className="mt-0.5">
        <AvatarFicha nombre={s.nombre} apellido={s.apellido} fotoUrl={null} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-foreground [overflow-wrap:anywhere]">{titulo}</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Si confirmas, cada uno verá al otro en Mi familia con su nombre y la relación; nada más.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <BotonSistema type="button" tamaño="sm" icono={Check} cargando={ocupado} onClick={() => onConfirmar(s)}>
            Confirmar
          </BotonSistema>
          <BotonSistema type="button" variante="outline" tamaño="sm" disabled={ocupado} onClick={() => onRechazar(s)}>
            No es mi familiar
          </BotonSistema>
        </div>
      </div>
    </section>
  )
}
