'use client'

/**
 * Estudiantes — the search-first picker of a student's representante (S1 of
 * odd/tasks/representante-buscador.md), shared by the visitor form and the
 * member view of the Grupos panel. Three states, all driven by props:
 *
 * - buscar: the church-wide search (`useBusquedaPersonas`: cédula, teléfono
 *   or full name, 3+ characters, 300 ms) with each result's match and group;
 *   anyone can be picked, also a person who is in a group. «No está,
 *   registrarlo» switches to the typed fields.
 * - elegido: the chosen person with «Cambiar» (back to the search).
 * - nuevo: the host's fields (`children`) with «Volver a buscar».
 *
 * The parentesco and the saving belong to the host. Rows are the inset rows
 * of ../filas-inset.tsx; the rest is `InputSistema` / `BotonSistema`.
 */
import type { KeyboardEvent, ReactElement, ReactNode } from 'react'
import { useState } from 'react'
import { Search } from 'lucide-react'

import { BotonSistema, InputSistema } from '@/components/ui/sistema-diseno'
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { AvatarServidor } from '@/components/dream-team/servidores/lista-servidores'
import { argumentosBusqueda } from '@/lib/platform/estudiantes/gestion-grupo'
import { textoCoincidencia } from '@/lib/platform/estudiantes/visitante'

import { FilaInset, ListaInset } from '../filas-inset'
import { useBusquedaPersonas } from './use-busqueda-personas'

export interface PersonaElegida {
  readonly personaId: string
  readonly nombre: string
}

export interface SelectorRepresentanteProps {
  /** Base of the element ids (unique in the page). */
  readonly id: string
  /** The group the search runs for (`buscarPersonas` checks access with it). */
  readonly grupoId: string
  /** The picked person; `null` while searching or typing. */
  readonly elegido: PersonaElegida | null
  /** `true` after «No está, registrarlo» (ignored while someone is picked). */
  readonly nuevo: boolean
  readonly onElegir: (persona: PersonaElegida) => void
  /** «Cambiar» and «Volver a buscar»: back to the search. */
  readonly onCambiar: () => void
  /** «No está, registrarlo». */
  readonly onRegistrar: () => void
  /** The typed fields of «nuevo». */
  readonly children?: ReactNode
}

/** Enter in the search must not submit the host form. */
function sinEnviar(evento: KeyboardEvent<HTMLInputElement>): void {
  if (evento.key === 'Enter') evento.preventDefault()
}

export function SelectorRepresentante({ id, grupoId, elegido, nuevo, onElegir, onCambiar, onRegistrar, children }: SelectorRepresentanteProps): ReactElement {
  const [consulta, setConsulta] = useState('')
  const busqueda = useBusquedaPersonas(grupoId, consulta)

  if (elegido) {
    return (
      <ListaInset etiqueta="Representante elegido">
        <FilaInset
          avatar={<AvatarServidor nombre={elegido.nombre} />}
          titulo={elegido.nombre}
          subtitulo="Ya está en el sistema"
          accion={
            <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={onCambiar}>
              Cambiar
            </BotonSistema>
          }
        />
      </ListaInset>
    )
  }

  if (nuevo) {
    return (
      <div className="space-y-3">
        {children}
        <BotonSistema type="button" variante="ghost" icono={Search} onClick={onCambiar}>
          Volver a buscar
        </BotonSistema>
      </div>
    )
  }

  const texto = consulta.trim()
  const buscando = argumentosBusqueda(texto) !== null
  const actual = busqueda && busqueda.consulta === texto ? busqueda : null

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <InputSistema
          id={`${id}-buscar`}
          type="search"
          autoComplete="off"
          icono={Search}
          label="Buscar por cédula, teléfono o nombre"
          value={consulta}
          onKeyDown={sinEnviar}
          onChange={(evento) => setConsulta(evento.target.value)}
        />
        <p className="text-[13px] text-muted-foreground">Búscalo primero para no registrarlo dos veces.</p>
      </div>
      <div aria-live="polite" className="space-y-2">
        {!buscando && <p className="text-sm text-muted-foreground">Escribe al menos 3 letras o números.</p>}
        {buscando && (actual === null || actual.tipo === 'cargando') && (
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
            <SkeletonLista filas={2} />
          </div>
        )}
        {buscando && actual?.tipo === 'error' && <AvisoFormulario tono="error">{actual.mensaje}</AvisoFormulario>}
        {buscando && actual?.tipo === 'listo' && actual.filas.length === 0 && (
          <p className="text-sm text-muted-foreground">{`Nadie coincide con «${texto}». Toca «No está, registrarlo» para escribir sus datos.`}</p>
        )}
        {buscando && actual?.tipo === 'listo' && actual.filas.length > 0 && (
          <ListaInset etiqueta="Posibles representantes">
            {actual.filas.map((persona) => (
              <FilaInset
                key={persona.personaId}
                avatar={<AvatarServidor nombre={persona.nombre} />}
                titulo={persona.nombre}
                subtitulo={[textoCoincidencia(texto, persona.coincide), persona.grupo].filter(Boolean).join(' · ')}
                accion={
                  <BotonSistema
                    type="button"
                    variante="ghost"
                    tamaño="sm"
                    aria-label={`Elegir a ${persona.nombre} como representante`}
                    onClick={() => onElegir({ personaId: persona.personaId, nombre: persona.nombre })}
                  >
                    Elegir
                  </BotonSistema>
                }
              />
            ))}
          </ListaInset>
        )}
      </div>
      <BotonSistema type="button" variante="outline" onClick={onRegistrar}>
        No está, registrarlo
      </BotonSistema>
    </div>
  )
}
