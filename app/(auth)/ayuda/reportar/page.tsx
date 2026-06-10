import { createSupportTicket } from '@/lib/actions/support.actions'
import { BotonSistema, ContenedorDashboard, InputSistema, TarjetaSistema, TextareaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

export default async function ReportarPage() {
  async function submitTicket(formData: FormData) {
    'use server'
    await createSupportTicket(formData)
  }

  return (
    <ContenedorDashboard titulo="Reportar un problema" botonRegreso={{ href: '/ayuda', texto: 'Volver a Ayuda' }}>
      <TarjetaSistema>
        <form action={submitTicket} className="space-y-5">
          <InputSistema name="title" label="Titulo" minLength={5} maxLength={160} required placeholder="Ejemplo: No puedo abrir el mapa del grupo" />
          <TextareaSistema name="description" label="Pasos y resultado esperado" filas={6} minLength={10} maxLength={8000} required placeholder="Cuentanos que ocurrio, que esperabas y como reproducirlo." />
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Categoria</span>
              <select name="category" defaultValue="bug" className="block w-full min-h-[44px] rounded-xl border border-border bg-card/50 px-3 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20">
                <option value="bug">Error</option><option value="access">Acceso</option><option value="data">Datos</option><option value="other">Otro</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Severidad</span>
              <select name="severity" defaultValue="normal" className="block w-full min-h-[44px] rounded-xl border border-border bg-card/50 px-3 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20">
                <option value="low">Baja</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option>
              </select>
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <InputSistema name="currentRoute" label="Ruta" placeholder="/dashboard" />
            <InputSistema name="viewport" label="Viewport" placeholder="390x844" />
            <InputSistema name="browserName" label="Navegador" placeholder="Chrome, Safari, Edge" />
            <InputSistema name="osName" label="Sistema operativo" placeholder="macOS, iOS, Android" />
          </div>
          <InputSistema name="sentryEventId" label="ID de evento de Sentry" placeholder="Referencia opcional" />
          <input type="hidden" name="appBuildVersion" value={process.env.NEXT_PUBLIC_APP_VERSION ?? ''} />
          <label className="flex items-start gap-3 text-sm text-foreground">
            <input type="checkbox" name="diagnosticsConsent" value="true" className="mt-1 h-4 w-4 rounded border-border" />
            <span><strong>Permitir diagnosticos seguros</strong><br /><span className="text-muted-foreground">Solo se guardan ruta, navegador, sistema operativo, viewport, version de la app y referencia de Sentry. Nunca recopilamos cookies, contrasenas, localStorage ni payloads sin procesar.</span></span>
          </label>
          <TextoSistema variante="muted" tamaño="sm">Los adjuntos se suben despues de crear el ticket desde el flujo privado de adjuntos.</TextoSistema>
          <BotonSistema type="submit">Enviar ticket</BotonSistema>
        </form>
      </TarjetaSistema>
    </ContenedorDashboard>
  )
}
