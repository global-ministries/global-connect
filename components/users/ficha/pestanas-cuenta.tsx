'use client'

/**
 * The Familia and Cuenta tabs of the ficha (prototype 03-ficha-escritorio.html,
 * `renderPanel`). Familia: the existing relations; editors add (the existing
 * AgregarFamiliarModal) and remove (with a confirmation); a relative opens
 * their own ficha. Cuenta: access state, invite / re-send, "Asignar
 * contraseña" (admin, as on the edit page), role and permissions, and the
 * single-person role change (admin; /api/usuarios/cambiar-rol checks it again).
 */
import Link from 'next/link'
import { KeyRound, Plus, Trash2, Users } from 'lucide-react'
import { useState, type ReactElement, type ReactNode } from 'react'

import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { BotonSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { obtenerNombreRelacion, tipoRelacionParaVista } from '@/lib/config/relaciones-familiares'
import type { PersonaFicha } from '@/lib/platform/usuarios/ficha-persona'
import { PERMISOS_ROL } from '@/lib/platform/usuarios/ficha-vista'
import { ETIQUETA_CUENTA, ETIQUETA_ROL, ROLES_SISTEMA, type CuentaEstado } from '@/lib/platform/usuarios/lista-vista'
import { formatearTelefono } from '@/lib/utils/telefono'

import { AvatarFicha, EtiquetaNeutra, ListaDatos, SeccionesFicha, TarjetaFicha } from './partes-ficha'

export function PestanaFamilia({
  persona,
  puedeEditar,
  onAgregar,
  onQuitar,
}: {
  readonly persona: PersonaFicha
  readonly puedeEditar: boolean
  readonly onAgregar: () => void
  readonly onQuitar: (relacionId: string) => void
}): ReactElement {
  const agregar = puedeEditar ? (
    <BotonSistema type="button" variante="outline" tamaño="sm" icono={Plus} onClick={onAgregar}>
      Agregar familiar
    </BotonSistema>
  ) : undefined
  return (
    <TarjetaFicha titulo="Familia" accion={agregar}>
      {persona.relaciones.length === 0 ? (
        <EstadoVacioSistema
          icono={Users}
          titulo="No hay familiares registrados"
          subtitulo={puedeEditar ? 'Usa «Agregar familiar» para vincular a su familia.' : 'Todavía no tiene familiares vinculados.'}
          className="py-7"
        />
      ) : (
        <ul className="m-0 list-none p-0">
          {persona.relaciones.map((r) => {
            const f = r.familiar
            const nombre = `${f.nombre} ${f.apellido}`.trim()
            const contacto = [f.telefono ? formatearTelefono(f.telefono) : 'Sin teléfono', f.email].filter(Boolean).join(' · ')
            return (
              <li key={r.id} className="flex min-h-[68px] items-center gap-3 border-t border-border/60 py-2 first:border-t-0">
                <AvatarFicha nombre={f.nombre} apellido={f.apellido} fotoUrl={f.foto_perfil_url} />
                <div className="grid min-w-0 flex-1 gap-px">
                  <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                    {obtenerNombreRelacion(tipoRelacionParaVista(r, persona.id), f)}
                    {r.es_principal && (
                      <span className="rounded-full bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand-text">Principal</span>
                    )}
                  </span>
                  {f.id ? (
                    <Link href={`/users/${f.id}`} className="focus-ring truncate rounded-md text-[15px] font-semibold text-foreground hover:underline pointer-coarse:min-h-11 pointer-coarse:leading-[2.75rem]">
                      {nombre}
                    </Link>
                  ) : (
                    <span className="truncate text-[15px] font-semibold">{nombre}</span>
                  )}
                  <span className="truncate text-[13px] text-muted-foreground">{contacto}</span>
                </div>
                {puedeEditar && (
                  <BotonSistema
                    type="button"
                    soloIcono
                    icono={Trash2}
                    variante="ghost"
                    aria-label={`Quitar relación con ${nombre}`}
                    onClick={() => onQuitar(r.id)}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </TarjetaFicha>
  )
}

export interface PestanaCuentaProps {
  readonly persona: PersonaFicha
  readonly cuenta: CuentaEstado | null
  /** "Enviada el …", "Sin enviar", "Aceptada"; null when unknown. */
  readonly invitacion: string | null
  /** Invite / re-send, when the viewer may invite. */
  readonly accionInvitar: ReactNode
  readonly esAdmin: boolean
  /** The person's auth id (admin only); null without an account. */
  readonly authIdPersona: string | null | undefined
  readonly onAsignarContrasena: () => void
  readonly onGuardarRol: (rol: string) => Promise<void>
}

export function PestanaCuenta(props: PestanaCuentaProps): ReactElement {
  const { persona, cuenta, invitacion, accionInvitar, esAdmin, authIdPersona } = props
  const [rol, setRol] = useState(persona.rol.interno)
  const [guardando, setGuardando] = useState(false)
  const guardar = async () => {
    setGuardando(true)
    try {
      await props.onGuardarRol(rol)
    } finally {
      setGuardando(false)
    }
  }
  const contrasena =
    esAdmin && authIdPersona ? (
      <BotonSistema type="button" variante="outline" tamaño="sm" icono={KeyRound} onClick={props.onAsignarContrasena}>
        Asignar contraseña
      </BotonSistema>
    ) : null

  return (
    <SeccionesFicha>
      <TarjetaFicha titulo="Acceso a la plataforma">
        <ListaDatos
          datos={[
            { etiqueta: 'Estado', valor: cuenta ? <PuntoEstado tono={ETIQUETA_CUENTA[cuenta].tono} etiqueta={ETIQUETA_CUENTA[cuenta].etiqueta} /> : null },
            { etiqueta: 'Correo de acceso', valor: cuenta === 'si' && persona.email ? <span className="break-all">{persona.email}</span> : null },
            { etiqueta: 'Invitación', valor: invitacion },
          ]}
        />
        {(accionInvitar || contrasena) && (
          <div className="flex flex-wrap gap-2">
            {accionInvitar}
            {contrasena}
          </div>
        )}
        {esAdmin && authIdPersona === null && (
          <p className="text-[13px] text-muted-foreground">Sin cuenta todavía, así que no tiene contraseña.</p>
        )}
      </TarjetaFicha>
      <TarjetaFicha titulo="Rol y permisos">
        <p>
          <EtiquetaNeutra>{persona.rol.etiqueta}</EtiquetaNeutra>
        </p>
        {PERMISOS_ROL[persona.rol.interno] && <p className="text-[13px] text-muted-foreground">{PERMISOS_ROL[persona.rol.interno]}</p>}
        {esAdmin ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-[1_1_200px]">
              <SelectSistema
                label="Cambiar rol"
                value={rol}
                onValueChange={setRol}
                opciones={ROLES_SISTEMA.map((r) => ({ valor: r, etiqueta: ETIQUETA_ROL[r] }))}
              />
            </div>
            <BotonSistema type="button" variante="outline" onClick={guardar} cargando={guardando} disabled={guardando || rol === persona.rol.interno}>
              Guardar rol
            </BotonSistema>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">Solo un administrador del sistema cambia roles.</p>
        )}
      </TarjetaFicha>
    </SeccionesFicha>
  )
}
