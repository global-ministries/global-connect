"use client"

import { useId, useState, type ReactNode } from "react"
import { X, Filter as FilterIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { BotonSistema } from "./sistema-diseno"
import { PanelLateralSistema } from "./panel-lateral-sistema"

export interface FiltrosUsuarios {
  roles: string[]
  conEmail: boolean | null
  conTelefono: boolean | null
  enGrupo: boolean | null
  estado: string[]
}

interface FiltrosUsuariosProps {
  filtros: FiltrosUsuarios
  onFiltrosChange: (filtros: FiltrosUsuarios) => void
  rolesDisponibles: { nombre_interno: string; nombre_visible: string }[]
  onLimpiarFiltros: () => void
}

const ANILLO =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"

/** Toggle chip (control radius, 44px). Pressed chips take the brand tint. */
function ChipFiltro({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 items-center rounded-xl border px-4 text-sm font-medium transition-colors touch-manipulation",
        activo
          ? "border-[var(--brand-primary)] bg-[var(--brand-accent-strong)] text-foreground"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
        ANILLO,
      )}
    >
      {children}
    </button>
  )
}

/** Active filter summary: the whole pill removes the filter. */
function ChipActivo({ etiqueta, onQuitar }: { etiqueta: string; onQuitar: () => void }) {
  return (
    <button
      type="button"
      onClick={onQuitar}
      aria-label={`Quitar filtro: ${etiqueta}`}
      className={cn(
        "inline-flex h-9 pointer-coarse:h-11 items-center gap-1.5 rounded-full border border-border bg-muted pl-3 pr-2 text-sm text-foreground transition-colors hover:bg-accent touch-manipulation",
        ANILLO,
      )}
    >
      {etiqueta}
      <X className="size-3.5 text-muted-foreground" aria-hidden="true" />
    </button>
  )
}

function GrupoFiltro({ titulo, children }: { titulo: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h3 id={id} className="text-sm font-medium text-foreground">{titulo}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  )
}

export function FiltrosUsuarios({
  filtros,
  onFiltrosChange,
  rolesDisponibles,
  onLimpiarFiltros,
}: FiltrosUsuariosProps) {
  const [isOpen, setIsOpen] = useState(false)

  const toggleRol = (rolInterno: string) => {
    const nuevosRoles = filtros.roles.includes(rolInterno)
      ? filtros.roles.filter(r => r !== rolInterno)
      : [...filtros.roles, rolInterno]

    onFiltrosChange({ ...filtros, roles: nuevosRoles })
  }

  const setConEmail = (valor: boolean) => {
    const nuevoValor: boolean | null = filtros.conEmail === valor ? null : valor
    onFiltrosChange({ ...filtros, conEmail: nuevoValor })
  }

  const setConTelefono = (valor: boolean) => {
    const nuevoValor: boolean | null = filtros.conTelefono === valor ? null : valor
    onFiltrosChange({ ...filtros, conTelefono: nuevoValor })
  }

  const setEnGrupo = (valor: boolean) => {
    const nuevoValor: boolean | null = filtros.enGrupo === valor ? null : valor
    onFiltrosChange({ ...filtros, enGrupo: nuevoValor })
  }

  const toggleEstado = (estado: string) => {
    const nuevosEstados = filtros.estado.includes(estado)
      ? filtros.estado.filter(e => e !== estado)
      : [...filtros.estado, estado]

    onFiltrosChange({ ...filtros, estado: nuevosEstados })
  }

  const cantidadActivos =
    filtros.roles.length +
    (filtros.conEmail !== null ? 1 : 0) +
    (filtros.conTelefono !== null ? 1 : 0) +
    (filtros.enGrupo !== null ? 1 : 0) +
    filtros.estado.length
  const tieneFiltrosActivos = cantidadActivos > 0

  const obtenerTextoFiltroEmail = () => {
    if (filtros.conEmail === true) return "Con email"
    if (filtros.conEmail === false) return "Sin email"
    return "Email"
  }

  const obtenerTextoFiltroTelefono = () => {
    if (filtros.conTelefono === true) return "Con teléfono"
    if (filtros.conTelefono === false) return "Sin teléfono"
    return "Teléfono"
  }

  const obtenerTextoFiltroEnGrupo = () => {
    if (filtros.enGrupo === true) return "En grupo"
    if (filtros.enGrupo === false) return "Sin grupo"
    return "Grupos"
  }

  return (
    <>
      <BotonSistema
        variante="outline"
        onClick={() => setIsOpen(true)}
        icono={FilterIcon}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        Filtros
        {tieneFiltrosActivos && (
          <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--brand-primary)] px-1.5 text-xs font-semibold tabular-nums text-white">
            {cantidadActivos}
          </span>
        )}
      </BotonSistema>

      <PanelLateralSistema
        abierto={isOpen}
        onAbiertoChange={setIsOpen}
        titulo="Filtros"
        pie={
          <>
            {tieneFiltrosActivos && (
              <BotonSistema variante="outline" onClick={onLimpiarFiltros}>
                Limpiar
              </BotonSistema>
            )}
            <BotonSistema variante="primario" onClick={() => setIsOpen(false)}>
              Ver resultados
            </BotonSistema>
          </>
        }
      >
        <div className="space-y-6">
          <GrupoFiltro titulo="Roles">
            {rolesDisponibles.map((rol) => (
              <ChipFiltro
                key={rol.nombre_interno}
                activo={filtros.roles.includes(rol.nombre_interno)}
                onClick={() => toggleRol(rol.nombre_interno)}
              >
                {rol.nombre_visible}
              </ChipFiltro>
            ))}
          </GrupoFiltro>

          <GrupoFiltro titulo="Estado del Email">
            <ChipFiltro activo={filtros.conEmail === true} onClick={() => setConEmail(true)}>Con email</ChipFiltro>
            <ChipFiltro activo={filtros.conEmail === false} onClick={() => setConEmail(false)}>Sin email</ChipFiltro>
          </GrupoFiltro>

          <GrupoFiltro titulo="Estado del Teléfono">
            <ChipFiltro activo={filtros.conTelefono === true} onClick={() => setConTelefono(true)}>Con teléfono</ChipFiltro>
            <ChipFiltro activo={filtros.conTelefono === false} onClick={() => setConTelefono(false)}>Sin teléfono</ChipFiltro>
          </GrupoFiltro>

          <GrupoFiltro titulo="Pertenencia a Grupos">
            <ChipFiltro activo={filtros.enGrupo === true} onClick={() => setEnGrupo(true)}>En grupo</ChipFiltro>
            <ChipFiltro activo={filtros.enGrupo === false} onClick={() => setEnGrupo(false)}>Sin grupo</ChipFiltro>
          </GrupoFiltro>

          <GrupoFiltro titulo="Estado del Usuario">
            <ChipFiltro activo={filtros.estado.includes('activo')} onClick={() => toggleEstado('activo')}>Activo</ChipFiltro>
            <ChipFiltro activo={filtros.estado.includes('inactivo')} onClick={() => toggleEstado('inactivo')}>Inactivo</ChipFiltro>
          </GrupoFiltro>

          {/* Filtros Activos */}
          {tieneFiltrosActivos && (
            <div className="border-t border-border pt-4">
              <GrupoFiltro titulo="Filtros Activos">
                {filtros.roles.map((rol) => {
                  const rolInfo = rolesDisponibles.find(r => r.nombre_interno === rol)
                  return <ChipActivo key={rol} etiqueta={rolInfo?.nombre_visible || rol} onQuitar={() => toggleRol(rol)} />
                })}

                {filtros.conEmail !== null && (
                  <ChipActivo
                    etiqueta={obtenerTextoFiltroEmail()}
                    onQuitar={() => setConEmail(filtros.conEmail === true ? true : false)}
                  />
                )}

                {filtros.conTelefono !== null && (
                  <ChipActivo
                    etiqueta={obtenerTextoFiltroTelefono()}
                    onQuitar={() => setConTelefono(filtros.conTelefono === true ? true : false)}
                  />
                )}

                {filtros.enGrupo !== null && (
                  <ChipActivo
                    etiqueta={obtenerTextoFiltroEnGrupo()}
                    onQuitar={() => setEnGrupo(filtros.enGrupo === true ? true : false)}
                  />
                )}

                {filtros.estado.map((estado) => (
                  <ChipActivo
                    key={estado}
                    etiqueta={estado === 'activo' ? 'Activo' : 'Inactivo'}
                    onQuitar={() => toggleEstado(estado)}
                  />
                ))}
              </GrupoFiltro>
            </div>
          )}
        </div>
      </PanelLateralSistema>
    </>
  )
}
