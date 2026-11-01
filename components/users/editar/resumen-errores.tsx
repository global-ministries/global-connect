'use client'

/**
 * The error summary above the form (decision 8 of S14; prototype
 * `.aviso-f`): "Revisa N campos antes de guardar" and one link per field
 * that moves the focus to it. Shown after a save attempt or a server error.
 */
import { AlertCircle } from 'lucide-react'
import { forwardRef } from 'react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import type { CampoEdicion } from '@/lib/platform/usuarios/editar-validacion'

import { idCampo } from './campos-editar'

export const ResumenErrores = forwardRef<HTMLHeadingElement, { readonly errores: readonly { campo: CampoEdicion; texto: string }[] }>(
  function ResumenErrores({ errores }, ref) {
    if (errores.length === 0) return null
    return (
      <AvisoFormulario tono="error" className="grid gap-2 px-4 py-3.5 font-normal">
        <h2 ref={ref} tabIndex={-1} className="flex items-center gap-2 text-[15px] font-semibold text-danger-text outline-none focus-visible:outline-2 focus-visible:outline-brand">
          <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
          {errores.length === 1 ? 'Revisa 1 campo antes de guardar' : `Revisa ${errores.length} campos antes de guardar`}
        </h2>
        <ul className="grid list-disc gap-0.5 pl-[26px]">
          {errores.map((e) => (
            <li key={e.campo}>
              <a
                href={`#${idCampo(e.campo)}`}
                onClick={(ev) => {
                  ev.preventDefault()
                  document.getElementById(idCampo(e.campo))?.focus()
                }}
                className="inline-flex min-h-8 items-center text-foreground underline underline-offset-[3px] pointer-coarse:min-h-11"
              >
                {e.texto}
              </a>
            </li>
          ))}
        </ul>
      </AvisoFormulario>
    )
  },
)
