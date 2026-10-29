'use client'

/**
 * Estudiantes › Grupos — "Agregar integrante" inside the group drawer
 * (artboards 06 / 07, `#vista=agregar`; gap G3 / G7). Without a query it
 * lists who was in a group of this sub-área and campus and has none now
 * (estudiantes_sin_grupo); from three characters it searches the whole
 * church by cédula, teléfono or full name (estudiantes_buscar_personas).
 * Each row ends in "Agregar", "Mover aquí" (already in another group of the
 * ámbito) or "Ya está en este grupo". A director adds people as members
 * (A12). "Registrar nuevo" (the visitor form of artboard 02) arrives with C3.
 */
import { useEffect, useState, type ReactElement } from 'react'
import { Search } from 'lucide-react'

import { BadgeSistema, BotonSistema, InputSistema } from '@/components/ui/sistema-diseno'
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { AvatarServidor } from '@/components/dream-team/servidores/lista-servidores'
import {
  agregarIntegrante,
  buscarPersonas,
  moverIntegrante,
  sinGrupo,
  type PersonaEncontrada,
  type PersonaSinGrupo,
} from '@/lib/actions/estudiantes-grupos.actions'
import { argumentosBusqueda } from '@/lib/platform/estudiantes/gestion-grupo'
import type { GrupoGestion } from '@/lib/platform/estudiantes/grupos-datos'
import { sexoDeSubarea } from '@/lib/platform/estudiantes/nombre-grupo'

import { FilaInset, ListaInset, TituloSeccion } from '../filas-inset'
import type { AccionGrupo } from './use-accion-grupo'

const RETRASO_BUSQUEDA_MS = 300

type Carga<T> = { readonly tipo: 'listo'; readonly filas: readonly T[] } | { readonly tipo: 'error'; readonly mensaje: string }

interface Fila {
  readonly personaId: string
  readonly nombre: string
  readonly subtitulo: string
  /** Their active group in the ámbito: "Mover aquí". */
  readonly enOtroGrupo: boolean
  readonly enEsteGrupo: boolean
}

const deSinGrupo = (p: PersonaSinGrupo): Fila => ({
  personaId: p.personaId,
  nombre: p.nombre,
  subtitulo: [p.anioEtiqueta, p.ultimoGrupo ? `Antes en ${p.ultimoGrupo}` : null].filter(Boolean).join(' · ') || 'Sin grupo',
  enOtroGrupo: false,
  enEsteGrupo: false,
})

const deBusqueda = (p: PersonaEncontrada): Fila => ({
  personaId: p.personaId,
  nombre: p.nombre,
  subtitulo: p.enEsteGrupo ? 'En este grupo' : p.grupo ? `En ${p.grupo}` : 'Sin grupo en este ámbito',
  enOtroGrupo: !p.enEsteGrupo && p.grupoId !== null,
  enEsteGrupo: p.enEsteGrupo,
})

export interface VistaAgregarProps {
  readonly grupo: GrupoGestion
  readonly accion: AccionGrupo
}

export function VistaAgregar({ grupo, accion }: VistaAgregarProps): ReactElement {
  const [consulta, setConsulta] = useState('')
  const [libres, setLibres] = useState<Carga<PersonaSinGrupo> | null>(null)
  const [busqueda, setBusqueda] = useState<(Carga<PersonaEncontrada> & { readonly consulta: string }) | null>(null)
  // People added or moved here from this view: their row turns into "Ya está en este grupo".
  const [agregados, setAgregados] = useState<ReadonlySet<string>>(new Set())
  const { pendiente, ejecutar } = accion
  const argumentos = argumentosBusqueda(consulta)
  const buscando = argumentos !== null

  useEffect(() => {
    let vigente = true
    sinGrupo({ grupoId: grupo.id }).then((r) => {
      if (vigente) setLibres(r.ok ? { tipo: 'listo', filas: r.data } : { tipo: 'error', mensaje: r.message })
    })
    return () => {
      vigente = false
    }
  }, [grupo.id])

  useEffect(() => {
    const texto = consulta.trim()
    if (argumentosBusqueda(texto) === null) return
    let vigente = true
    const temporizador = setTimeout(() => {
      buscarPersonas({ grupoId: grupo.id, consulta: texto }).then((r) => {
        if (!vigente) return
        setBusqueda(r.ok ? { tipo: 'listo', filas: r.data, consulta: texto } : { tipo: 'error', mensaje: r.message, consulta: texto })
      })
    }, RETRASO_BUSQUEDA_MS)
    return () => {
      vigente = false
      clearTimeout(temporizador)
    }
  }, [consulta, grupo.id])

  const carga: Carga<Fila> | null = buscando
    ? busqueda?.consulta === consulta.trim()
      ? busqueda.tipo === 'listo'
        ? { tipo: 'listo', filas: busqueda.filas.map(deBusqueda) }
        : busqueda
      : null
    : libres?.tipo === 'listo'
      ? { tipo: 'listo', filas: libres.filas.map(deSinGrupo) }
      : libres

  async function incorporar(fila: Fila): Promise<void> {
    const ok = await ejecutar(
      `agregar:${fila.personaId}`,
      () => (fila.enOtroGrupo ? moverIntegrante : agregarIntegrante)({ grupoId: grupo.id, personaId: fila.personaId }),
      fila.enOtroGrupo ? `${fila.nombre} pasó a ${grupo.nombre}` : `${fila.nombre} ya es integrante de ${grupo.nombre}`,
    )
    if (ok) setAgregados((actual) => new Set(actual).add(fila.personaId))
  }

  const encabezado = buscando ? 'Coincidencias' : `Sin grupo en ${grupo.ambito} · ${sexoDeSubarea(grupo.subarea)}`

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <InputSistema
          type="search"
          autoComplete="off"
          icono={Search}
          label={grupo.experiencia === 'the_living_room' ? 'Busca a la persona' : 'Busca al estudiante'}
          placeholder="Cédula, teléfono o nombre completo"
          value={consulta}
          onChange={(evento) => setConsulta(evento.target.value)}
        />
        <p className="text-[13px] text-muted-foreground">Buscamos en toda la iglesia para no crearlo dos veces.</p>
      </div>

      <div aria-live="polite" className="space-y-2">
        {carga === null && (
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
            <SkeletonLista filas={3} />
          </div>
        )}
        {carga?.tipo === 'error' && <AvisoFormulario tono="error">{carga.mensaje}</AvisoFormulario>}
        {carga?.tipo === 'listo' && carga.filas.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {buscando
              ? `Nadie coincide con «${consulta.trim()}». Revisa el nombre completo, la cédula o el teléfono.`
              : 'No hay nadie sin grupo en esta sub-área. Busca por cédula, teléfono o nombre.'}
          </p>
        )}
        {carga?.tipo === 'listo' && carga.filas.length > 0 && (
          <>
            <TituloSeccion id="agregar-resultados" texto={encabezado} cantidad={carga.filas.length} />
            <ListaInset etiqueta={encabezado}>
              {carga.filas.map((fila) => {
                const aqui = fila.enEsteGrupo || agregados.has(fila.personaId)
                return (
                  <FilaInset
                    key={fila.personaId}
                    avatar={<AvatarServidor nombre={fila.nombre} />}
                    titulo={fila.nombre}
                    subtitulo={fila.subtitulo}
                    accion={
                      aqui ? (
                        <BadgeSistema variante="default" tamaño="sm">
                          Ya está en este grupo
                        </BadgeSistema>
                      ) : (
                        <BotonSistema
                          type="button"
                          variante="ghost"
                          tamaño="sm"
                          aria-label={`${fila.enOtroGrupo ? 'Mover aquí' : 'Agregar'} a ${fila.nombre}`}
                          cargando={pendiente === `agregar:${fila.personaId}`}
                          disabled={pendiente !== null}
                          onClick={() => incorporar(fila)}
                        >
                          {fila.enOtroGrupo ? 'Mover aquí' : 'Agregar'}
                        </BotonSistema>
                      )
                    }
                  />
                )
              })}
            </ListaInset>
          </>
        )}
      </div>

      <p id="agregar-registrar-pista" className="text-[13px] text-muted-foreground">
        «Registrar nuevo» llegará pronto, junto con la lista del líder.
      </p>
    </div>
  )
}
