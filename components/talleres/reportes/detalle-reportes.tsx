'use client'

/**
 * R3g (odd/tasks/talleres-rediseno.md) — the one read-only detail of
 * /talleres/reportes (artboard 25's drawer): a side panel from md, a bottom
 * sheet on phones (`DetalleResponsivo`). A taller shows its figures and its
 * ediciones in the range; an edición its estado, dates and figures; a grupo
 * report its estado, signature and the reason it was reopened. The footer
 * links to the taller, edición or grupo when its route is known.
 */
import Link from 'next/link'
import type { ReactElement } from 'react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { rutaEdicion, rutaGrupo, rutaTaller } from '@/lib/platform/talleres/rutas'
import {
  fechaCorta,
  fechasEdicion,
  terminadaSinCerrar,
  type EdicionReporte,
  type ReporteGrupo,
  type TallerReporte,
} from '@/lib/platform/talleres/reportes-vista'

import { Cifra, DatosClave, EstadoEdicion, EstadoReporte } from './partes-reportes'

export type SeleccionReporte =
  | { readonly tipo: 'taller'; readonly taller: TallerReporte }
  | { readonly tipo: 'edicion'; readonly edicion: EdicionReporte }
  | { readonly tipo: 'grupo'; readonly grupo: ReporteGrupo; readonly edicion: EdicionReporte | null }

const CLASE_H3 = 'mb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground'

const plural = (n: number, uno: string, varios: string): string => `${n.toLocaleString('es-VE')} ${n === 1 ? uno : varios}`

export function nombreGrupo(g: Pick<ReporteGrupo, 'grupoNombre' | 'grupoId'>): string {
  return g.grupoNombre ?? `Grupo ${g.grupoId.slice(0, 8)}…`
}

function completaronPista(completaron: number | null, conResultado: number): string {
  if (completaron === null) return 'Se cuentan al cerrar la edición'
  return `de ${conResultado.toLocaleString('es-VE')} con resultado`
}

function CuerpoTaller({ taller }: { readonly taller: TallerReporte }): ReactElement {
  const conResultado = taller.ediciones.reduce((s, e) => s + e.conResultado, 0)
  return (
    <div className="space-y-5">
      <DatosClave
        datos={[
          { etiqueta: 'Inscripciones', valor: taller.inscripciones },
          { etiqueta: 'Ediciones', valor: taller.ediciones.length },
          { etiqueta: 'Completaron', valor: taller.completaron, pista: completaronPista(taller.completaron, conResultado) },
          { etiqueta: 'Certificados', valor: taller.certificados },
        ]}
      />
      <section aria-labelledby="detalle-taller-ediciones">
        <h3 id="detalle-taller-ediciones" className={CLASE_H3}>
          Por edición
        </h3>
        <ul className="overflow-hidden rounded-2xl border border-border/60 bg-card">
          {taller.ediciones.map((e, i) => (
            <li
              key={e.id}
              className={
                i > 0
                  ? 'relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5 before:absolute before:top-0 before:right-0 before:left-3.5 before:h-px before:bg-border/60'
                  : 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5'
              }
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{e.nombre}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  <EstadoEdicion edicion={e} />
                </span>
              </span>
              <span className="text-right text-xs text-muted-foreground">
                <span className="block">
                  <Cifra valor={e.inscripciones} /> inscr.
                </span>
                <span className="block">
                  <Cifra valor={e.certificados} /> cert.
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function CuerpoEdicion({ edicion }: { readonly edicion: EdicionReporte }): ReactElement {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <EstadoEdicion edicion={edicion} />
        <span>{fechasEdicion(edicion) ?? 'Sin fechas'}</span>
      </div>
      {terminadaSinCerrar(edicion) && (
        <AvisoFormulario tono="info">
          Terminó, pero nadie la ha cerrado: completaron y certificados se calculan al cerrarla desde la edición.
        </AvisoFormulario>
      )}
      <DatosClave
        datos={[
          { etiqueta: 'Inscripciones', valor: edicion.inscripciones },
          { etiqueta: 'Completaron', valor: edicion.completaron, pista: completaronPista(edicion.completaron, edicion.conResultado) },
          { etiqueta: 'Certificados', valor: edicion.certificados },
        ]}
      />
    </div>
  )
}

function CuerpoGrupo({ grupo, edicion }: { readonly grupo: ReporteGrupo; readonly edicion: EdicionReporte | null }): ReactElement {
  return (
    <div className="space-y-5">
      <dl className="grid gap-3 text-sm">
        <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
          <dt className="text-muted-foreground">Estado</dt>
          <dd>
            <EstadoReporte estado={grupo.estado} />
          </dd>
        </div>
        <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
          <dt className="text-muted-foreground">Firmado</dt>
          <dd className="text-foreground">{grupo.firmaLiderFecha ? fechaCorta(grupo.firmaLiderFecha) : 'Todavía no'}</dd>
        </div>
        <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
          <dt className="text-muted-foreground">Taller</dt>
          <dd className="min-w-0 truncate text-foreground">{grupo.tallerNombre ?? '—'}</dd>
        </div>
        <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
          <dt className="text-muted-foreground">Edición</dt>
          <dd className="min-w-0 truncate text-foreground">{edicion?.nombre ?? '—'}</dd>
        </div>
      </dl>
      {grupo.reabiertoMotivo && (
        <AvisoFormulario tono="info">
          <b>Se reabrió:</b> {grupo.reabiertoMotivo}
        </AvisoFormulario>
      )}
    </div>
  )
}

function titulo(sel: SeleccionReporte): string {
  if (sel.tipo === 'taller') return sel.taller.nombre
  if (sel.tipo === 'edicion') return sel.edicion.tallerNombre
  return nombreGrupo(sel.grupo)
}

function descripcion(sel: SeleccionReporte, rangoTexto: string): string {
  if (sel.tipo === 'taller') return `${rangoTexto} · ${plural(sel.taller.ediciones.length, 'edición', 'ediciones')}`
  if (sel.tipo === 'edicion') return sel.edicion.nombre
  return 'Reporte final del grupo'
}

function enlace(sel: SeleccionReporte): { href: string; texto: string } | null {
  if (sel.tipo === 'taller') return sel.taller.slug ? { href: rutaTaller(sel.taller.slug), texto: 'Ver taller' } : null
  if (sel.tipo === 'edicion') {
    return sel.edicion.tallerSlug ? { href: rutaEdicion(sel.edicion.tallerSlug, sel.edicion.id), texto: 'Ver edición' } : null
  }
  const e = sel.edicion
  return e?.tallerSlug ? { href: rutaGrupo(e.tallerSlug, e.id, sel.grupo.grupoId), texto: 'Ver grupo' } : null
}

export function DetalleReportes({
  seleccion,
  abierto,
  onCambioAbierto,
  rangoTexto,
}: {
  readonly seleccion: SeleccionReporte | null
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  readonly rangoTexto: string
}): ReactElement | null {
  if (!seleccion) return null
  const ir = enlace(seleccion)
  return (
    <DetalleResponsivo
      abierto={abierto}
      onCambioAbierto={onCambioAbierto}
      titulo={titulo(seleccion)}
      descripcion={descripcion(seleccion, rangoTexto)}
      pie={
        <>
          <BotonSistema type="button" variante="outline" onClick={() => onCambioAbierto(false)}>
            Cerrar
          </BotonSistema>
          {ir && (
            <BotonSistema asChild variante="primario">
              <Link href={ir.href}>{ir.texto}</Link>
            </BotonSistema>
          )}
        </>
      }
    >
      {seleccion.tipo === 'taller' ? (
        <CuerpoTaller taller={seleccion.taller} />
      ) : seleccion.tipo === 'edicion' ? (
        <CuerpoEdicion edicion={seleccion.edicion} />
      ) : (
        <CuerpoGrupo grupo={seleccion.grupo} edicion={seleccion.edicion} />
      )}
    </DetalleResponsivo>
  )
}
