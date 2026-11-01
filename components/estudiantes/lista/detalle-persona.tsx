'use client'

/**
 * Estudiantes — the row detail of the leader list (artboards 01 / 05,
 * `#ficha=…`): one `DetalleResponsivo` (side panel from md, bottom sheet
 * below). Identity (avatar, name, año or age, phone in mono), WhatsApp /
 * Llamar, the visitor callouts, "Hoy" (The Living Room: "Reunión") with
 * Presente / Ausente (a second tap clears), the Representante card (Transit /
 * Inside Out only, Q3), the "Año escolar" row with its editor (Transit /
 * Inside Out only, S16; it reads the año final and the scale itself) and the
 * key data.
 */
import type { ReactElement } from 'react'
import { MessageCircle, Phone, Star } from 'lucide-react'

import { BotonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { AvatarServidor } from '@/components/dream-team/servidores/lista-servidores'
import { edadEn } from '@/lib/platform/estudiantes/gestion-grupo'
import type { GrupoLista, Marca } from '@/lib/platform/estudiantes/lista-datos'
import { horaDeInstante, type FilaVista, type PuntosHistorial } from '@/lib/platform/estudiantes/lista-vista'
import { enlaceWhatsapp, formatearTelefono, normalizarTelefono } from '@/lib/utils/telefono'

import { AnioEscolar } from './anio-escolar'
import { TONO_ESTADO } from './estado-fila'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const

const PARENTESCO: Readonly<Record<string, string>> = {
  padre: 'Madre o padre',
  tutor: 'Tutor',
  abuelo: 'Abuela o abuelo',
  tio: 'Tía o tío',
  hermano: 'Hermana o hermano',
  otro_familiar: 'Familiar',
}

function partesFecha(fecha: string | null): { readonly anio: number; readonly mes: number; readonly dia: number } | null {
  const m = fecha?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? { anio: Number(m[1]), mes: Number(m[2]) - 1, dia: Number(m[3]) } : null
}

/** "14 de marzo". */
const cumpleanos = (fecha: string | null): string => {
  const p = partesFecha(fecha)
  return p ? `${p.dia} de ${MESES[p.mes]}` : '—'
}

/** "sep 2025". */
const mesAnio = (fecha: string | null): string => {
  const p = partesFecha(fecha)
  return p ? `${MESES_CORTOS[p.mes]} ${p.anio}` : '—'
}

function Contacto({ telefono, nombre }: { readonly telefono: string | null; readonly nombre: string }): ReactElement | null {
  const whatsapp = enlaceWhatsapp(telefono)
  const tel = normalizarTelefono(telefono)
  if (!whatsapp && !tel) return null
  return (
    <div className="grid grid-cols-2 gap-2">
      {whatsapp && (
        <BotonSistema asChild variante="outline" icono={MessageCircle}>
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp a ${nombre}`}>
            WhatsApp
          </a>
        </BotonSistema>
      )}
      {tel && (
        <BotonSistema asChild variante="outline" icono={Phone}>
          <a href={`tel:${tel}`} aria-label={`Llamar a ${nombre}`}>
            Llamar
          </a>
        </BotonSistema>
      )}
    </div>
  )
}

function Dato({ etiqueta, valor, mono = false }: { readonly etiqueta: string; readonly valor: string; readonly mono?: boolean }): ReactElement {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className={`mt-0.5 truncate text-sm font-medium text-foreground ${mono ? 'font-mono tabular-nums' : ''}`}>{valor}</dd>
    </div>
  )
}

export interface DetallePersonaProps {
  readonly fila: FilaVista | null
  readonly grupo: GrupoLista
  /** "Domingo 25 oct · 9:00" / "Jueves 29 oct · Casa de Adrián". */
  readonly reunion: string
  readonly historial: PuntosHistorial | null
  readonly hoy: Date
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  readonly onMarcar: (toque: Marca) => void
  readonly onConfirmar: () => void
  readonly confirmando: boolean
}

export function DetallePersona({
  fila,
  grupo,
  reunion,
  historial,
  hoy,
  abierto,
  onCambioAbierto,
  onMarcar,
  onConfirmar,
  confirmando,
}: DetallePersonaProps): ReactElement | null {
  if (!fila) return null
  const { persona, estado } = fila
  const tlr = grupo.experiencia === 'the_living_room'
  const edad = edadEn(persona.fechaNacimiento, hoy)
  const detalle = tlr ? (edad === null ? grupo.nombre : `${edad} años · ${grupo.nombre}`) : (persona.anioEtiqueta ?? 'Sin año escolar')
  const tono = TONO_ESTADO[estado]
  const unidad = tlr ? 'reuniones' : 'domingos'

  return (
    <DetalleResponsivo abierto={abierto} onCambioAbierto={onCambioAbierto} titulo={persona.nombre} descripcion={detalle}>
      <div className="space-y-5">
        <div className="flex min-w-0 items-center gap-3">
          <AvatarServidor nombre={persona.nombre} grande />
          <div className="min-w-0">
            <p className="truncate text-sm text-muted-foreground">{detalle}</p>
            {persona.telefono && <p className="font-mono text-sm tabular-nums text-foreground">{formatearTelefono(persona.telefono)}</p>}
          </div>
        </div>
        <Contacto telefono={persona.telefono} nombre={persona.nombre} />

        {persona.estado === 'visitante' && estado !== 'nueva' && (
          <AvisoFormulario tono="info" className="flex gap-3">
            <Star aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info-text" />
            <div className="min-w-0 space-y-2">
              <p>
                <b className="font-semibold">Visitante</b>
                {` · vino ${tlr ? 'a ' : ''}${persona.visitas} ${persona.visitas === 1 ? (tlr ? 'reunión' : 'domingo') : unidad}. Cuando lo confirmes pasa a ser integrante del grupo.`}
              </p>
              <BotonSistema type="button" tamaño="sm" cargando={confirmando} disabled={confirmando} onClick={onConfirmar}>
                Confirmar como miembro
              </BotonSistema>
            </div>
          </AvisoFormulario>
        )}
        {estado === 'nueva' && (
          <AvisoFormulario tono="info">
            {fila.marcadoAt
              ? `Se registró hoy a las ${horaDeInstante(fila.marcadoAt)}. Queda como visitante del grupo.`
              : 'Se registró hoy. Queda como visitante del grupo.'}
          </AvisoFormulario>
        )}

        <TarjetaSistema className="space-y-3 p-4">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground">{tlr ? 'Reunión' : 'Hoy'}</h3>
              <p className="truncate text-[13px] text-muted-foreground">{reunion}</p>
            </div>
            <PuntoEstado tono={tono.tono} etiqueta={tono.etiqueta} />
          </div>
          {estado !== 'nueva' && (
            <ControlSegmentado<Marca | ''>
              etiqueta="Asistencia de hoy"
              opciones={[
                { valor: 'presente', etiqueta: 'Presente' },
                { valor: 'ausente', etiqueta: 'Ausente' },
              ]}
              valor={fila.marca ?? ''}
              onCambio={(v) => v && onMarcar(v)}
              className="grid w-full grid-cols-2"
            />
          )}
          {fila.marca && fila.marcadoAt && <p className="text-[13px] text-muted-foreground">{`Marcado a las ${horaDeInstante(fila.marcadoAt)}`}</p>}
        </TarjetaSistema>

        {!tlr && persona.representantes.length > 0 && (
          <section aria-labelledby="persona-representante" className="space-y-2">
            <h3 id="persona-representante" className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Representante
            </h3>
            {persona.representantes.map((r) => (
              <TarjetaSistema key={r.personaId} className="space-y-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{r.nombre}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {PARENTESCO[r.tipo] ?? 'Representante'}
                    {r.telefono && (
                      <>
                        {' · '}
                        <span className="font-mono tabular-nums">{formatearTelefono(r.telefono)}</span>
                      </>
                    )}
                  </p>
                </div>
                <Contacto telefono={r.telefono} nombre={r.nombre} />
              </TarjetaSistema>
            ))}
            <p className="text-[13px] text-muted-foreground">{`Solo los líderes del grupo, su entrenador y la dirección de ${grupo.ambito} ven este contacto.`}</p>
          </section>
        )}

        {!tlr && <AnioEscolar personaId={persona.personaId} nombre={persona.nombre} />}

        <section aria-labelledby="persona-datos" className="space-y-2">
          <h3 id="persona-datos" className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Datos
          </h3>
          <dl className="grid grid-cols-2 gap-3">
            <Dato etiqueta="Cumpleaños" valor={cumpleanos(persona.fechaNacimiento)} />
            {tlr ? <Dato etiqueta="Zona" valor={grupo.zona ?? '—'} /> : <Dato etiqueta="Edad" valor={edad === null ? '—' : `${edad} años`} mono />}
            <Dato etiqueta="Asistencia" valor={historial && historial.total > 0 ? `${historial.presentes} de ${historial.total} ${unidad}` : '—'} mono />
            <Dato etiqueta="En el grupo desde" valor={mesAnio(persona.desde)} />
          </dl>
        </section>
      </div>
    </DetalleResponsivo>
  )
}
