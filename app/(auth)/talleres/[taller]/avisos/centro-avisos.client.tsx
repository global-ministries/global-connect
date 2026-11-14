"use client"

/**
 * The notices center of a taller (odd/tasks/talleres-reserva-publica.md T7,
 * S6 S11 S14; design/talleres-reserva/15): «Automáticos» lists each notice
 * with its switch, channels (Correo, En la app), when it goes and this
 * month's count; a row opens its detail with the message preview.
 * «Historial» shows the last 50 emails with their delivery state and, for
 * whoever could not be emailed, a manual «Abrir en WhatsApp».
 *
 * R4b (odd/tasks/talleres-rediseno.md, S10; design/talleres-avisos 01–04):
 * the «Texto» column (Texto predeterminado / Personalizado · quién ·
 * cuándo; the class reminder also counts its clases with a text of their
 * own), «Editar texto» for editors and «Ver texto» for readers, which open
 * the text panel (PanelTextoAviso), and the «Todos / Personalizados» filter
 * (?texto=personalizados). «Cambio de fecha» stays fixed: its text is
 * written by whoever moves the date.
 */
import { useState, useTransition, type ReactElement } from 'react'
import { ChevronRight, Eye, Lock, Mail, MessageCircle, Pencil, Smartphone } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Interruptor } from '@/components/ui/interruptor'
import { PanelLateralSistema } from '@/components/ui/panel-lateral-sistema'
import { PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import { BotonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { EtiquetaTexto } from '@/components/talleres/avisos/etiqueta-texto'
import { PanelTextoAviso, type ClasePlantillaAviso } from '@/components/talleres/avisos/panel-texto-aviso'
import { TabsContent, TabsList, TabsSistema, TabsTrigger } from '@/components/ui/TabsSistema'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { cuandoAviso } from '@/lib/platform/avisos/avisos-persona'
import { enlaceWhatsappConTexto } from '@/lib/platform/avisos/whatsapp'
import { guardarAvisoTallerAction } from '@/lib/platform/talleres/avisos-actions'
import { AVISOS_TALLER, avisoActivo, nombreAviso, type AvisoCatalogo } from '@/lib/platform/talleres/avisos-catalogo'
import type { EnvioHistorial, EstadoEnvio, PanelAvisos } from '@/lib/platform/talleres/avisos-panel'
import { fechaCorta, type TextoAvisoGuardado, type VariablesAvisos } from '@/lib/platform/talleres/avisos-textos'

export type FiltroTexto = 'todos' | 'personalizados'

export interface CentroAvisosProps {
  readonly tallerId: string
  readonly tallerNombre: string
  readonly panel: PanelAvisos
  /** talleres_aviso_variables(); null when it could not be read (texts then open read-only examples). */
  readonly variables: VariablesAvisos | null
  /** Active plantilla clases of the taller (per-clase class reminder). */
  readonly clases: readonly ClasePlantillaAviso[]
  readonly filtroInicial?: FiltroTexto
}

/** What the «Texto» column says about one notice. */
interface EstadoTexto {
  readonly personalizado: boolean
  readonly detalle: readonly string[]
}

function estadoTexto(aviso: AvisoCatalogo, textos: readonly TextoAvisoGuardado[], clases: readonly ClasePlantillaAviso[]): EstadoTexto {
  const propios = textos.filter((t) => t.tipo === aviso.tipo)
  const general = propios.find((t) => t.claseId === null)
  const conClase = aviso.tipo === 'recordatorio_clase' ? clases.filter((c) => propios.some((t) => t.claseId === c.id)).length : 0
  const detalle: string[] = []
  if (general) {
    const cuando = fechaCorta(general.editadoEn)
    detalle.push([general.editadoPor, cuando].filter(Boolean).join(' · '))
  }
  if (conClase > 0) detalle.push(`${conClase} de ${clases.length} clases con texto propio`)
  return { personalizado: Boolean(general) || conClase > 0, detalle: detalle.filter((d) => d !== '') }
}

function CeldaTexto({ aviso, estado }: { aviso: AvisoCatalogo; estado: EstadoTexto }) {
  if (aviso.fijo) return <EtiquetaTexto className="h-auto min-h-[22px] py-0.5 whitespace-normal">Lo escribe quien mueve la fecha</EtiquetaTexto>
  if (!estado.personalizado) return <EtiquetaTexto>Texto predeterminado</EtiquetaTexto>
  return (
    <span className="grid min-w-0 justify-items-start gap-0.5">
      <EtiquetaTexto tono="marca">Personalizado</EtiquetaTexto>
      {estado.detalle.map((linea) => (
        <span key={linea} className="max-w-full text-xs text-muted-foreground">
          {linea}
        </span>
      ))}
    </span>
  )
}

const ESTADO_ENVIO: Record<EstadoEnvio, { readonly tono: TonoEstado; readonly etiqueta: string }> = {
  enviado: { tono: 'success', etiqueta: 'Entregado' },
  pendiente: { tono: 'info', etiqueta: 'Programado' },
  fallido: { tono: 'danger', etiqueta: 'Sin entregar' },
  sin_correo: { tono: 'warning', etiqueta: 'Sin correo' },
}

function Canales() {
  return (
    <span className="flex flex-wrap gap-1">
      <span className="inline-flex h-[22px] items-center gap-1 rounded-md border border-border bg-muted px-1.5 text-xs">
        <Mail aria-hidden="true" className="size-3" />
        Correo
      </span>
      <span className="inline-flex h-[22px] items-center gap-1 rounded-md border border-border bg-muted px-1.5 text-xs">
        <Smartphone aria-hidden="true" className="size-3" />
        En la app
      </span>
    </span>
  )
}

function FilaAviso({
  aviso,
  activo,
  enMes,
  estado,
  puedeEditar,
  editable,
  guardando,
  onCambio,
  onAbrir,
}: {
  aviso: AvisoCatalogo
  activo: boolean
  enMes: number
  estado: EstadoTexto
  puedeEditar: boolean
  /** The text can be edited here (not «Cambio de fecha», variables loaded). */
  editable: boolean
  guardando: boolean
  onCambio: (activo: boolean) => void
  onAbrir: () => void
}) {
  const editar = editable && puedeEditar
  return (
    <li aria-label={aviso.nombre} className="flex min-h-16 items-center gap-2 py-2 pr-2 pl-1 md:pr-4">
      <Interruptor
        activo={aviso.fijo || activo}
        onCambio={onCambio}
        aria-label={aviso.nombre}
        disabled={aviso.fijo || !puedeEditar || guardando}
        title={aviso.fijo ? 'Siempre activo: de él dependen las respuestas' : undefined}
      />
      <button
        type="button"
        onClick={onAbrir}
        aria-label={`Abrir ${aviso.nombre}`}
        className="focus-ring grid min-h-11 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-xl px-2 py-1 text-left hover:bg-accent md:grid-cols-[minmax(0,1.5fr)_auto_minmax(0,1.3fr)_minmax(0,1.6fr)_3rem]"
      >
        <span className="min-w-0">
          <span className={cn('block truncate text-[15px] font-semibold', !activo && !aviso.fijo && 'text-muted-foreground')}>
            {aviso.nombre}
          </span>
          <span className="flex items-center gap-1 text-[13px] text-muted-foreground">
            {aviso.fijo ? (
              <>
                <Lock aria-hidden="true" className="size-3" />
                Siempre activo
              </>
            ) : activo ? (
              'Activo'
            ) : (
              'Apagado'
            )}
          </span>
        </span>
        <span className="hidden md:block">
          <Canales />
        </span>
        <span className="col-span-2 min-w-0 md:col-span-1">
          <CeldaTexto aviso={aviso} estado={estado} />
        </span>
        <span className="col-span-2 line-clamp-2 hidden text-[13px] text-muted-foreground md:col-span-1 md:block">{aviso.cuando}</span>
        <span className="hidden text-right font-mono text-sm tabular-nums md:block" aria-label={`${enMes} este mes`}>
          {enMes}
        </span>
        <ChevronRight aria-hidden="true" className="col-start-2 row-start-1 size-4 justify-self-end text-muted-foreground md:hidden" />
      </button>
      <span className="hidden w-36 shrink-0 justify-end md:flex">
        {editar ? (
          <BotonSistema variante="outline" tamaño="sm" icono={Pencil} aria-label={`Editar texto: ${aviso.nombre}`} onClick={onAbrir}>
            Editar texto
          </BotonSistema>
        ) : (
          <BotonSistema
            variante={aviso.fijo ? 'ghost' : 'outline'}
            tamaño="sm"
            icono={Eye}
            aria-label={`Ver texto: ${aviso.nombre}`}
            onClick={onAbrir}
          >
            Ver texto
          </BotonSistema>
        )}
      </span>
    </li>
  )
}

function DetalleAviso({ aviso, tallerNombre }: { aviso: AvisoCatalogo; tallerNombre: string }) {
  const ejemplo = {
    asunto: aviso.ejemplo.asunto.replaceAll('Mujer de Hoy', tallerNombre),
    titulo: aviso.ejemplo.titulo,
    cuerpo: aviso.ejemplo.cuerpo.replaceAll('Mujer de Hoy', tallerNombre),
  }
  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h3 className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Cuándo</h3>
        <p className="text-sm">{aviso.cuando}</p>
      </section>
      <section className="grid gap-2">
        <h3 className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Canales</h3>
        <ul className="divide-y divide-border/60 rounded-xl border border-border">
          <li className="grid gap-0.5 px-3.5 py-3">
            <span className="text-sm font-semibold">Correo</span>
            <span className="text-xs text-muted-foreground">Sale solo. Si no se pudo enviar, aparece en Historial como «Sin entregar».</span>
          </li>
          <li className="grid gap-0.5 px-3.5 py-3">
            <span className="text-sm font-semibold">En la app</span>
            <span className="text-xs text-muted-foreground">En la campana de notificaciones; quien aún no activó su cuenta lo ve al activarla.</span>
          </li>
        </ul>
        <div className="flex gap-3 rounded-xl border border-dashed border-border px-3.5 py-3 text-[13px] text-muted-foreground">
          <MessageCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            <b className="block text-sm font-semibold text-foreground">WhatsApp: solo a mano</b>
            No se envía solo. En Historial, quien no tiene correo muestra «Abrir en WhatsApp» con este texto listo para que lo envíes tú.
          </span>
        </div>
      </section>
      <section className="grid gap-2">
        <h3 className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Vista previa · ejemplo</h3>
        <div className="overflow-hidden rounded-2xl border border-border bg-background">
          <div className="flex items-center gap-1.5 border-b border-border px-3.5 py-2.5 text-xs text-muted-foreground">
            <Mail aria-hidden="true" className="size-3" />
            <span className="min-w-0 truncate">{ejemplo.asunto}</span>
          </div>
          <div className="grid gap-1 px-4 py-3.5 text-sm leading-relaxed">
            <b className="font-semibold">{ejemplo.titulo}</b>
            <p>{ejemplo.cuerpo}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {aviso.fijo
            ? 'Este aviso no se edita aquí: el mensaje lo escribe quien mueve la fecha de la edición.'
            : 'El texto lo arma el sistema con los datos de cada persona. Recarga la página para poder editarlo.'}
        </p>
      </section>
    </div>
  )
}

function FilaHistorial({ envio }: { envio: EnvioHistorial }) {
  const estado = ESTADO_ENVIO[envio.estado]
  const whatsapp = envio.telefono ? enlaceWhatsappConTexto(envio.telefono, envio.texto) : null
  return (
    <li className="grid min-h-16 gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:px-5">
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-semibold">{envio.persona}</span>
        <span className="block truncate text-[13px] text-muted-foreground">{nombreAviso(envio.tipo)}</span>
      </span>
      <span className="min-w-0">
        <PuntoEstado tono={estado.tono} etiqueta={estado.etiqueta} />
        {envio.error && envio.estado !== 'enviado' && (
          <span className="block truncate text-xs text-muted-foreground" title={envio.error}>
            {envio.error}
          </span>
        )}
      </span>
      <span className="text-[13px] text-muted-foreground">
        {envio.leidoEn ? 'Leído en la app' : envio.enApp ? 'En la app, sin leer' : 'Solo correo'}
      </span>
      <span className="font-mono text-[13px] text-muted-foreground tabular-nums">{cuandoAviso(envio.creadoEn)}</span>
      <span className="md:justify-self-end">
        {whatsapp && (
          <BotonSistema asChild variante="outline" tamaño="sm" icono={MessageCircle}>
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`Abrir en WhatsApp: ${envio.persona}`}>
              Abrir en WhatsApp
            </a>
          </BotonSistema>
        )}
      </span>
    </li>
  )
}

export function CentroAvisos({
  tallerId,
  tallerNombre,
  panel,
  variables,
  clases,
  filtroInicial = 'todos',
}: CentroAvisosProps): ReactElement {
  const [config, setConfig] = useState<Readonly<Record<string, unknown>>>(panel.config)
  const [abierto, setAbierto] = useState<AvisoCatalogo | null>(null)
  const [aperturas, setAperturas] = useState(0)
  const [filtro, setFiltro] = useState<FiltroTexto>(filtroInicial)
  const [guardando, iniciar] = useTransition()
  const notificar = useNotificaciones()

  const estados = new Map(AVISOS_TALLER.map((aviso) => [aviso.tipo, estadoTexto(aviso, panel.textos, clases)]))
  const personalizados = AVISOS_TALLER.filter((aviso) => estados.get(aviso.tipo)?.personalizado).length
  const visibles = filtro === 'todos' ? AVISOS_TALLER : AVISOS_TALLER.filter((aviso) => estados.get(aviso.tipo)?.personalizado)
  const definicion = abierto && !abierto.fijo ? variables?.[abierto.tipo] : undefined

  function cambiar(aviso: AvisoCatalogo, activo: boolean) {
    const anterior = config
    setConfig({ ...config, [aviso.tipo]: activo ? undefined : false })
    iniciar(async () => {
      const resultado = await guardarAvisoTallerAction({ tallerId, tipo: aviso.tipo, activo })
      if (resultado.ok) notificar.success(`${aviso.nombre}: ${activo ? 'encendido' : 'apagado'}.`)
      else {
        setConfig(anterior)
        notificar.error(resultado.mensaje ?? 'No se pudo guardar.')
      }
    })
  }

  function filtrar(valor: FiltroTexto) {
    setFiltro(valor)
    const url = new URL(window.location.href)
    if (valor === 'personalizados') url.searchParams.set('texto', 'personalizados')
    else url.searchParams.delete('texto')
    window.history.replaceState(window.history.state, '', url)
  }

  function abrir(aviso: AvisoCatalogo) {
    setAperturas((n) => n + 1)
    setAbierto(aviso)
  }

  return (
    <>
      <TabsSistema defaultValue="automaticos">
        <TabsList aria-label="Avisos">
          <TabsTrigger value="automaticos">Automáticos</TabsTrigger>
          <TabsTrigger value="historial">
            Historial <span className="ml-1 font-mono text-xs tabular-nums opacity-70">{panel.historial.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="automaticos" className="grid gap-3">
          <p className="text-[13px] text-muted-foreground">
            Valen para todas las ediciones de {tallerNombre}. Un aviso apagado no sale para nadie.
            {panel.puedeEditar
              ? ' Cada aviso sale con su texto predeterminado hasta que lo personalizas.'
              : ' Solo la coordinación o la dirección del taller puede encenderlos, apagarlos o cambiar su texto.'}
            {variables === null && ' No pudimos cargar los datos de los avisos: recarga la página para editar sus textos.'}
          </p>
          <ControlSegmentado
            etiqueta="Mostrar"
            opciones={[
              { valor: 'todos', etiqueta: `Todos ${AVISOS_TALLER.length}` },
              { valor: 'personalizados', etiqueta: `Personalizados ${personalizados}` },
            ]}
            valor={filtro}
            onCambio={filtrar}
            className="justify-self-start"
          />
          <TarjetaSistema variante="outlined" className="overflow-hidden p-0">
            <div className="flex min-h-9 items-center gap-2 border-b border-border bg-muted px-5 text-xs font-semibold">
              Para quien se inscribe <span className="font-medium text-muted-foreground">· Correo y en la app</span>
            </div>
            {visibles.length === 0 ? (
              <EstadoVacioSistema
                icono={Mail}
                titulo="Ningún aviso tiene texto personalizado"
                subtitulo="Todos salen con su texto predeterminado."
                accion={
                  <BotonSistema variante="outline" onClick={() => filtrar('todos')}>
                    Ver todos
                  </BotonSistema>
                }
                className="py-12"
              />
            ) : (
              <ul className="divide-y divide-border/60">
                {visibles.map((aviso) => (
                  <FilaAviso
                    key={aviso.tipo}
                    aviso={aviso}
                    activo={avisoActivo(config, aviso.tipo)}
                    enMes={panel.mes[aviso.tipo] ?? 0}
                    estado={estados.get(aviso.tipo) ?? { personalizado: false, detalle: [] }}
                    puedeEditar={panel.puedeEditar}
                    editable={!aviso.fijo && Boolean(variables?.[aviso.tipo])}
                    guardando={guardando}
                    onCambio={(activo) => cambiar(aviso, activo)}
                    onAbrir={() => abrir(aviso)}
                  />
                ))}
              </ul>
            )}
          </TarjetaSistema>
          <p className="flex justify-between px-1 text-xs text-muted-foreground">
            <span>{panel.puedeEditar ? '«Editar texto» abre el texto del aviso con su vista previa.' : '«Ver texto» abre el texto del aviso con su vista previa.'}</span>
          </p>
        </TabsContent>

        <TabsContent value="historial" className="grid gap-3">
          <p className="text-[13px] text-muted-foreground">Los últimos 50 correos de {tallerNombre}, del más reciente al más antiguo.</p>
          <TarjetaSistema variante="outlined" className="overflow-hidden p-0">
            {panel.historial.length === 0 ? (
              <EstadoVacioSistema
                icono={Mail}
                titulo="Todavía no salió ningún aviso"
                subtitulo="Cuando alguien se inscriba, lo apruebes o tenga clase mañana, lo verás aquí."
                className="py-12"
              />
            ) : (
              <ul className="divide-y divide-border/60">
                {panel.historial.map((envio) => (
                  <FilaHistorial key={envio.id} envio={envio} />
                ))}
              </ul>
            )}
          </TarjetaSistema>
        </TabsContent>
      </TabsSistema>

      {abierto && definicion ? (
        <PanelTextoAviso
          key={`${abierto.tipo}-${aperturas}`}
          abierto
          onCerrar={() => setAbierto(null)}
          aviso={abierto}
          tallerId={tallerId}
          tallerNombre={tallerNombre}
          definicion={definicion}
          textos={panel.textos.filter((t) => t.tipo === abierto.tipo)}
          clases={clases}
          puedeEditar={panel.puedeEditar}
        />
      ) : (
        <PanelLateralSistema
          abierto={abierto !== null}
          onAbiertoChange={(valor) => {
            if (!valor) setAbierto(null)
          }}
          titulo={abierto?.nombre ?? 'Aviso'}
          descripcion={abierto ? `${panel.mes[abierto.tipo] ?? 0} este mes` : undefined}
        >
          {abierto && <DetalleAviso aviso={abierto} tallerNombre={tallerNombre} />}
        </PanelLateralSistema>
      )}
    </>
  )
}
