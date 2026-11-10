"use client"

/**
 * The notices center of a taller (odd/tasks/talleres-reserva-publica.md T7,
 * S6 S11 S14; design/talleres-reserva/15): «Automáticos» lists each notice
 * with its switch, channels (Correo, En la app), when it goes and this
 * month's count; a row opens its detail with the message preview.
 * «Historial» shows the last 50 emails with their delivery state and, for
 * whoever could not be emailed, a manual «Abrir en WhatsApp». Read-mostly:
 * the texts are not editable here.
 */
import { useState, useTransition, type ReactElement } from 'react'
import { ChevronRight, Lock, Mail, MessageCircle, Smartphone } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Interruptor } from '@/components/ui/interruptor'
import { PanelLateralSistema } from '@/components/ui/panel-lateral-sistema'
import { PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import { BotonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { TabsContent, TabsList, TabsSistema, TabsTrigger } from '@/components/ui/TabsSistema'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { cuandoAviso } from '@/lib/platform/avisos/avisos-persona'
import { enlaceWhatsappConTexto } from '@/lib/platform/avisos/whatsapp'
import { guardarAvisoTallerAction } from '@/lib/platform/talleres/avisos-actions'
import { AVISOS_TALLER, avisoActivo, nombreAviso, type AvisoCatalogo } from '@/lib/platform/talleres/avisos-catalogo'
import type { EnvioHistorial, EstadoEnvio, PanelAvisos } from '@/lib/platform/talleres/avisos-panel'

export interface CentroAvisosProps {
  readonly tallerId: string
  readonly tallerNombre: string
  readonly panel: PanelAvisos
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
  puedeEditar,
  guardando,
  onCambio,
  onAbrir,
}: {
  aviso: AvisoCatalogo
  activo: boolean
  enMes: number
  puedeEditar: boolean
  guardando: boolean
  onCambio: (activo: boolean) => void
  onAbrir: () => void
}) {
  return (
    <li className="flex min-h-16 items-center gap-2 py-2 pr-2 pl-1 md:pr-4">
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
        aria-label={`Ver el aviso ${aviso.nombre}`}
        className="focus-ring grid min-h-11 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-xl px-2 py-1 text-left hover:bg-accent md:grid-cols-[minmax(0,1.6fr)_auto_minmax(0,2fr)_3rem_1rem]"
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
        <span className="col-span-2 line-clamp-2 text-[13px] text-muted-foreground md:col-span-1">{aviso.cuando}</span>
        <span className="hidden text-right font-mono text-sm tabular-nums md:block" aria-label={`${enMes} este mes`}>
          {enMes}
        </span>
        <ChevronRight aria-hidden="true" className="row-start-1 size-4 justify-self-end text-muted-foreground md:row-auto md:col-start-5" />
      </button>
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
        <p className="text-xs text-muted-foreground">El texto lo arma el sistema con los datos de cada persona. Por ahora no se puede editar.</p>
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

export function CentroAvisos({ tallerId, tallerNombre, panel }: CentroAvisosProps): ReactElement {
  const [config, setConfig] = useState<Readonly<Record<string, unknown>>>(panel.config)
  const [abierto, setAbierto] = useState<AvisoCatalogo | null>(null)
  const [guardando, iniciar] = useTransition()
  const notificar = useNotificaciones()

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
            {!panel.puedeEditar && ' Solo la coordinación o la dirección del taller puede encenderlos o apagarlos.'}
          </p>
          <TarjetaSistema variante="outlined" className="overflow-hidden p-0">
            <div className="flex min-h-9 items-center gap-2 border-b border-border bg-muted px-5 text-xs font-semibold">
              Para quien se inscribe <span className="font-medium text-muted-foreground">· Correo y en la app</span>
            </div>
            <ul className="divide-y divide-border/60">
              {AVISOS_TALLER.map((aviso) => (
                <FilaAviso
                  key={aviso.tipo}
                  aviso={aviso}
                  activo={avisoActivo(config, aviso.tipo)}
                  enMes={panel.mes[aviso.tipo] ?? 0}
                  puedeEditar={panel.puedeEditar}
                  guardando={guardando}
                  onCambio={(activo) => cambiar(aviso, activo)}
                  onAbrir={() => setAbierto(aviso)}
                />
              ))}
            </ul>
          </TarjetaSistema>
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
    </>
  )
}
