'use client'

/**
 * Entry of the public registration page (odd/tasks/ninos-registro-pasos.md R2).
 * Account holders already see their children in /perfil, so they are sent there
 * instead of creating a new pre-registration (a duplicate when the phone
 * differs and no cédula is given). A signed-out visitor gets the wizard with a
 * secondary sign-in link; a signed-in one gets a short card, and may still
 * open the wizard to register another family.
 */
import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, UserCheck } from 'lucide-react'

import { TextoSistema } from '@/components/ui/sistema-diseno'

import { RegistroFamilia } from './registro-familia'

/** The login lives at `/`; `redirect` is the param the middleware already uses. Internal path only. */
export const LOGIN_A_PERFIL = `/?redirect=${encodeURIComponent('/perfil')}`

type Props = {
  conSesion: boolean
  campus: { id: string; nombre: string }[]
  campusInicial?: string
}

const enlace =
  'rounded-md font-semibold text-orange-600 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 dark:text-orange-400'

export function EntradaRegistro({ conSesion, campus, campusInicial }: Props) {
  const [registrarOtra, setRegistrarOtra] = useState(false)

  if (conSesion && !registrarOtra) {
    return (
      <section aria-labelledby="reg-sesion-titulo" className="space-y-5 rounded-2xl border border-border bg-card/60 p-5 text-center shadow-sm">
        <UserCheck className="mx-auto h-10 w-10 text-orange-500" aria-hidden />
        <div className="space-y-1">
          <h2 id="reg-sesion-titulo" className="text-xl font-bold tracking-tight text-foreground">
            Ya tienes sesión iniciada
          </h2>
          <TextoSistema variante="sutil">En tu perfil ves a tus niños y sus datos.</TextoSistema>
        </div>
        <Link
          href="/perfil"
          className="inline-flex min-h-[52px] w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-6 text-lg font-medium text-white shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Ir a mi perfil
          <ArrowRight className="h-5 w-5" aria-hidden />
        </Link>
        <button type="button" onClick={() => setRegistrarOtra(true)} className={`min-h-[44px] px-2 text-sm ${enlace}`}>
          Registrar otra familia
        </button>
      </section>
    )
  }

  return (
    <RegistroFamilia
      campus={campus}
      campusInicial={campusInicial}
      aviso={
        conSesion ? undefined : (
          <p className="pt-1 text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{' '}
            <Link href={LOGIN_A_PERFIL} className={`inline-block py-2 ${enlace}`}>
              Inicia sesión
            </Link>
          </p>
        )
      }
    />
  )
}
