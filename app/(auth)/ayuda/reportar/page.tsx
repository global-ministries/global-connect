import { createSupportTicket } from '@/lib/actions/support.actions'
import { BotonSistema, ContenedorDashboard, InputSistema, TarjetaSistema, TextareaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

export default async function ReportarPage() {
  async function submitTicket(formData: FormData) {
    'use server'
    await createSupportTicket(formData)
  }

  return (
    <ContenedorDashboard titulo="Report a problem" botonRegreso={{ href: '/ayuda', texto: 'Back to Help' }}>
      <TarjetaSistema>
        <form action={submitTicket} className="space-y-5">
          <InputSistema name="title" label="Title" minLength={5} maxLength={160} required placeholder="Example: Cannot open group map" />
          <TextareaSistema name="description" label="Steps and expected result" filas={6} minLength={10} maxLength={8000} required placeholder="Tell us what happened, what you expected, and how to reproduce it." />
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Category</span>
              <select name="category" defaultValue="bug" className="block w-full min-h-[44px] rounded-xl border border-border bg-card/50 px-3 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20">
                <option value="bug">Bug</option><option value="access">Access</option><option value="data">Data</option><option value="other">Other</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-foreground">
              <span>Severity</span>
              <select name="severity" defaultValue="normal" className="block w-full min-h-[44px] rounded-xl border border-border bg-card/50 px-3 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20">
                <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select>
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <InputSistema name="currentRoute" label="Route" placeholder="/dashboard" />
            <InputSistema name="viewport" label="Viewport" placeholder="390x844" />
            <InputSistema name="browserName" label="Browser" placeholder="Chrome, Safari, Edge" />
            <InputSistema name="osName" label="Operating system" placeholder="macOS, iOS, Android" />
          </div>
          <InputSistema name="sentryEventId" label="Sentry event ID" placeholder="Optional reference" />
          <input type="hidden" name="appBuildVersion" value={process.env.NEXT_PUBLIC_APP_VERSION ?? ''} />
          <label className="flex items-start gap-3 text-sm text-foreground">
            <input type="checkbox" name="diagnosticsConsent" value="true" className="mt-1 h-4 w-4 rounded border-border" />
            <span><strong>Allow safe diagnostics</strong><br /><span className="text-muted-foreground">Only route, browser, OS, viewport, app version, and Sentry reference are stored. Cookies, passwords, localStorage, and raw payloads are never collected.</span></span>
          </label>
          <TextoSistema variante="muted" tamaño="sm">Attachments are uploaded after ticket creation from the private attachment flow.</TextoSistema>
          <BotonSistema type="submit">Submit ticket</BotonSistema>
        </form>
      </TarjetaSistema>
    </ContenedorDashboard>
  )
}
