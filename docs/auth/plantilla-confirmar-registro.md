# Plantilla «Confirm signup» de Supabase (código de 6 dígitos + enlace)

La página pública `/proximo-paso` confirma el correo con un **código de 6
dígitos** que la persona escribe en la misma pantalla
(`confirmarCodigoProximoPaso` en `app/proximo-paso/actions.ts`, T2c de
`odd/tasks/proximo-paso.md`). El código sale en el correo sólo si la plantilla
«Confirm signup» de Supabase muestra `{{ .Token }}`.

La plantilla sigue llevando el enlace `{{ .ConfirmationURL }}`, así que:

- `/signup` sigue funcionando igual (la persona abre el enlace).
- En `/proximo-paso` el enlace es el plan B: vuelve a `/proximo-paso?edicion=…`
  con la sesión abierta y un toque en «Inscribirme» termina.

## Dónde se cambia

Hazlo primero en **staging** y, cuando esté probado, en **producción**.

1. Supabase Dashboard → **Authentication → Email Templates → Confirm signup**.
2. **Subject**: `Tu código para confirmar tu cuenta de Global`.
3. **Message body**: pega el HTML de abajo (pestaña «Source» si el editor la
   tiene) y guarda.
4. Revisa el largo del código: **Authentication → Sign In / Providers → Email
   → Email OTP Length** (en algunas versiones del panel aparece en los ajustes
   de Auth como «Email OTP length»). Debe ser **6**: la página acepta
   exactamente 6 dígitos. En el entorno local ya es 6
   (`supabase/config.toml`, `[auth.email]`: `otp_length = 6`,
   `otp_expiry = 3600`, o sea que el código vence en 1 hora).

Supabase limita cuántas veces se puede pedir y probar un código (Rate Limits
de Auth). La página espera 60 segundos antes de dejar reenviar y muestra
«Hiciste muchos intentos. Espera un momento y vuelve a intentarlo.» cuando
Supabase corta.

## HTML

```html
<div style="font-family: Arial, Helvetica, sans-serif; color: #1f2937; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h2 style="margin: 0 0 16px; font-size: 22px;">Confirma tu correo</h2>
  <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.5;">
    ¡Hola! Para terminar de crear tu cuenta en Global, escribe este código en la página donde te registraste:
  </p>
  <p style="margin: 0 0 16px; text-align: center;">
    <span style="display: inline-block; padding: 12px 20px; font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: bold; letter-spacing: 8px; border: 1px solid #d1d5db; border-radius: 12px;">{{ .Token }}</span>
  </p>
  <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.5; color: #4b5563;">
    El código vence en 1 hora. Si pides uno nuevo, usa siempre el del último correo.
  </p>
  <p style="margin: 0 0 8px; font-size: 16px; line-height: 1.5;">
    También puedes confirmar tu cuenta con este botón:
  </p>
  <p style="margin: 0 0 24px;">
    <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 12px 20px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 10px; font-size: 16px;">Confirmar mi correo</a>
  </p>
  <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #6b7280;">
    Si no creaste una cuenta en Global, puedes ignorar este correo.
  </p>
</div>
```

Los colores van escritos a mano porque es un correo (los clientes de correo no
leen los tokens del sistema de diseño).

## Cómo probarlo

1. En staging, registra un correo nuevo en `/proximo-paso`.
2. Debe llegar un correo con el código grande y el botón.
3. Escribe el código en la página: debe decir «Quedaste inscrito…» (o
   «Recibimos tu inscripción…» si no había cupo automático).
4. Con otro correo nuevo, abre el botón en vez del código: debe volver a
   `/proximo-paso` con la sesión abierta.
5. Registra un correo en `/signup`: el enlace del correo debe seguir
   funcionando.
