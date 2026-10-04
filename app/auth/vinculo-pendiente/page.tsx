import Link from 'next/link'

/**
 * Landing page after a confirmed signup whose ficha was matched by cédula and
 * holds a service role: a director must approve the link first.
 */
export default function PaginaVinculoPendiente() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">Correo confirmado</h1>
      <p className="text-muted-foreground">Tu cuenta está pendiente de aprobación por tu director</p>
      <Link href="/" className="text-primary underline underline-offset-4">
        Volver al inicio
      </Link>
    </main>
  )
}
