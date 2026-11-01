'use client'

/**
 * Entry of the public registration page (odd/tasks/ninos-registro-pasos.md R2).
 * Account holders already see their children in /perfil, so they are sent there
 * instead of creating a new pre-registration (a duplicate when the phone
 * differs and no cédula is given). A signed-out visitor gets the one-screen
 * registration (odd/tasks/ninos-v2.md N4b) with a secondary sign-in link; a
 * signed-in one gets a short card, and may still register another family.
 */
import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, UserCheck } from 'lucide-react'

import { RegistroPublico } from '@/components/ninos/registro-rapido/registro-publico'
import { BotonSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import type { SalonNivel } from '@/lib/platform/ninos/nivel'

/** The login lives at `/`; `redirect` is the param the middleware already uses. Internal path only. */
export const LOGIN_A_PERFIL = `/?redirect=${encodeURIComponent('/perfil')}`

type Props = {
  conSesion: boolean
  campus: { id: string; nombre: string }[]
  campusInicial?: string
  salones?: readonly (SalonNivel & { campusId: string })[]
}

const enlace = 'inline-flex min-h-11 items-center rounded-md px-1 font-semibold text-brand-text underline-offset-4 hover:underline focus-ring'

export function EntradaRegistro({ conSesion, campus, campusInicial, salones }: Props) {
  const [registrarOtra, setRegistrarOtra] = useState(false)

  if (conSesion && !registrarOtra) {
    return (
      <TarjetaSistema className="grid gap-5 p-5 text-center">
        <section aria-labelledby="reg-sesion-titulo" className="grid gap-5">
          <UserCheck className="mx-auto size-10 text-brand" aria-hidden />
          <div className="grid gap-1">
            <h2 id="reg-sesion-titulo" className="text-xl font-bold tracking-tight text-foreground">
              Ya tienes sesión iniciada
            </h2>
            <TextoSistema variante="sutil">En tu perfil ves a tus niños y sus datos.</TextoSistema>
          </div>
          <BotonSistema asChild tamaño="lg" icono={ArrowRight} iconoPosicion="derecha" className="w-full">
            <Link href="/perfil">Ir a mi perfil</Link>
          </BotonSistema>
          <button type="button" onClick={() => setRegistrarOtra(true)} className={`justify-self-center text-sm ${enlace}`}>
            Registrar otra familia
          </button>
        </section>
      </TarjetaSistema>
    )
  }

  return (
    <RegistroPublico
      campus={campus}
      campusInicial={campusInicial}
      salones={salones}
      aviso={
        conSesion ? undefined : (
          <p className="text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{' '}
            <Link href={LOGIN_A_PERFIL} className={enlace}>
              Inicia sesión
            </Link>
          </p>
        )
      }
    />
  )
}
