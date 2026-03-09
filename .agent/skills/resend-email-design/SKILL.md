---
name: resend-email-design
description: React Email templates and email design best practices for GlobalConnect. Use when building transactional email templates (invitaciones, notificaciones, bienvenida) with React Email + Resend. Covers layout patterns, responsive design, cross-client compatibility, and accessibility for email.
metadata:
  author: global-connect
  scope: global
  auto_invoke:
    - Creating or updating email templates
    - Building HTML emails in React
    - Designing transactional email layouts
    - Styling emails for cross-client compatibility
    - Setting up React Email components
    - Implementing email with Resend in Next.js
    - Adding email notifications or alerts
    - Designing welcome, reset-password, or invitation emails
    - Making emails responsive for mobile
    - Using Tailwind in React Email
---

# Email Design — React Email + Resend (GlobalConnect)

## Stack
- **React Email** (`@react-email/components`) — Componentes JSX para emails
- **Resend** — Proveedor de envío
- **Design system** — Glassmorphism/VisionOS de GlobalConnect adaptado a email

## Setup
```bash
pnpm add resend @react-email/components
```

## Estructura de templates
```
emails/
  components/           # Componentes reutilizables
    EmailLayout.tsx     # Layout base con header/footer
    EmailButton.tsx     # CTA buttons
  invitacion.tsx        # Invitación a grupo
  bienvenida.tsx        # Bienvenida a GlobalConnect
  reset-password.tsx    # Restablecimiento de contraseña
  notificacion.tsx      # Notificaciones genéricas
```

## Template Base (React Email)
```tsx
import {
  Html, Body, Head, Preview,
  Container, Section, Text, Button, Img, Hr
} from '@react-email/components'

interface InvitacionEmailProps {
  nombreUsuario: string
  nombreGrupo: string
  urlAceptar: string
}

export function InvitacionEmail({ nombreUsuario, nombreGrupo, urlAceptar }: InvitacionEmailProps) {
  return (
    <Html lang="es" dir="ltr">
      <Head />
      <Preview>Tienes una invitación para unirte a {nombreGrupo}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          {/* Header */}
          <Section style={styles.header}>
            <Img src="https://tudominio.com/logo.png" width="48" height="48" alt="GlobalConnect" />
            <Text style={styles.brandName}>GlobalConnect</Text>
          </Section>

          {/* Content */}
          <Section style={styles.content}>
            <Text style={styles.title}>¡Hola, {nombreUsuario}!</Text>
            <Text style={styles.body}>
              Fuiste invitado a unirte al grupo <strong>{nombreGrupo}</strong>.
              Acepta tu invitación para comenzar.
            </Text>
            <Button style={styles.button} href={urlAceptar}>
              Aceptar invitación
            </Button>
            <Text style={styles.hint}>
              Este enlace expira en 48 horas. Si no esperabas esta invitación, ignora este correo.
            </Text>
          </Section>

          <Hr style={styles.divider} />

          {/* Footer */}
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              GlobalConnect · Organización Eclesiástica
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const styles = {
  body: { backgroundColor: '#0f0f13', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  container: { maxWidth: '560px', margin: '40px auto', backgroundColor: '#1a1a24', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' },
  header: { padding: '32px 40px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '12px' },
  brandName: { fontSize: '18px', fontWeight: '600', color: '#ffffff', margin: 0 },
  content: { padding: '40px' },
  title: { fontSize: '24px', fontWeight: '700', color: '#ffffff', margin: '0 0 16px' },
  text: { fontSize: '15px', lineHeight: '1.6', color: '#a0a0b0', margin: '0 0 24px' },
  button: { backgroundColor: '#6366f1', color: '#ffffff', padding: '14px 28px', borderRadius: '10px', fontWeight: '600', fontSize: '15px', textDecoration: 'none', display: 'inline-block' },
  hint: { fontSize: '13px', color: '#6b7280', marginTop: '20px' },
  divider: { borderColor: 'rgba(255,255,255,0.06)', margin: '0' },
  footer: { padding: '24px 40px' },
  footerText: { fontSize: '12px', color: '#4b5563', textAlign: 'center' as const, margin: 0 },
}
```

## Enviar desde Server Action (Next.js 15)
```ts
import { Resend } from 'resend'
import { render } from '@react-email/render'
import { InvitacionEmail } from '@/emails/invitacion'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function enviarInvitacion(params: {
  email: string
  nombreUsuario: string
  nombreGrupo: string
  token: string
}) {
  const urlAceptar = `${process.env.NEXT_PUBLIC_URL}/invitacion/${params.token}`

  const { data, error } = await resend.emails.send({
    from: 'GlobalConnect <noreply@globalconnect.org>',
    to: [params.email],
    subject: `Invitación para unirte a ${params.nombreGrupo}`,
    html: await render(InvitacionEmail({
      nombreUsuario: params.nombreUsuario,
      nombreGrupo: params.nombreGrupo,
      urlAceptar,
    })),
  }, {
    idempotencyKey: `invitacion-${params.token}`, // evita duplicados
  })

  if (error) throw new Error(`Error enviando email: ${error.message}`)
  return data
}
```

## Design Rules — Email vs Web

| Web (Tailwind) | Email (React Email) |
|----------------|---------------------|
| Flexbox / Grid | Tables internas (usa `Row`/`Column`) |
| CSS variables | Estilos inline siempre |
| `oklch()` colors | Hex colors solamente |
| SVG icons | Imágenes PNG / texto |
| `backdrop-filter` blur | No soportado — usa bg-color sólido |
| Fuentes Google | Solo web-safe fonts o fallbacks |

## Reglas de diseño para emails de GlobalConnect

1. **Fondo**: `#0f0f13` (dark, consistente con el app)
2. **Contenedor**: max 560px, border-radius 16px, border sutil
3. **Color primario**: `#6366f1` (indigo) para CTAs
4. **Tipografía**: `-apple-system` como primera opción → fallback sans-serif
5. **Un solo CTA principal** por email — nunca varios botones iguales
6. **Preview text** siempre (≤90 chars) — es lo primero que ve el usuario en la bandeja
7. **Texto alternativo en imágenes** — accesibilidad y clientes que bloquean imágenes
8. **Footer** siempre con nombre de la organización

## Tipos de email de GlobalConnect

| Email | Trigger | Template |
|-------|---------|----------|
| Bienvenida | Registro de usuario | `bienvenida.tsx` |
| Invitación a grupo | Admin invita miembro | `invitacion.tsx` |
| Reset de contraseña | Supabase Auth | `reset-password.tsx` (personalizar via Supabase) |
| Notificación | Eventos del sistema | `notificacion.tsx` |

## Preview en desarrollo
```bash
pnpm i -D @react-email/render
npx react-email dev --dir emails
# http://localhost:3000
```
