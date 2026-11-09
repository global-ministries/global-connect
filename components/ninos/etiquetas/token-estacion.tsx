'use client'

/**
 * Niños › Etiquetas — the token of a station, right after creating it or
 * rotating it (T3b, S10). The database keeps only its hash, so it is shown
 * this once: read-only field, «Copiar token» and the three steps to put it in
 * the print agent of the desk laptop, with a link to the full guide
 * (tools/agente-impresion/README.md).
 */
import { useState, type ReactElement } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { BotonSistema, InputSistema } from '@/components/ui/sistema-diseno'
import type { TokenEstacion as Token } from '@/lib/platform/ninos/impresion-vista'

export const GUIA_AGENTE = 'https://github.com/global-ministries/global-connect/blob/main/tools/agente-impresion/README.md'

export function TokenEstacion({ token, onListo }: { readonly token: Token; readonly onListo: () => void }): ReactElement {
  const [copiado, setCopiado] = useState(false)
  const [errorCopia, setErrorCopia] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(token.token)
      setCopiado(true)
      setErrorCopia(false)
    } catch {
      setErrorCopia(true)
    }
  }

  return (
    <div className="grid min-w-0 gap-4">
      <AvisoFormulario tono="marca">
        <b className="font-semibold">Cópialo ahora: no se vuelve a mostrar.</b> Si se pierde, crea uno nuevo desde esta estación.
      </AvisoFormulario>
      <InputSistema label="Token de la estación" readOnly value={token.token} className="font-mono text-sm" onFocus={(e) => e.currentTarget.select()} />
      <BotonSistema type="button" variante="outline" icono={copiado ? Check : Copy} onClick={() => void copiar()}>
        {copiado ? 'Copiado' : 'Copiar token'}
      </BotonSistema>
      {errorCopia && <p className="text-sm text-danger-text">No se pudo copiar. Selecciona el token y cópialo a mano.</p>}

      <div className="grid min-w-0 gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Cómo conectar «{token.nombre}»</h3>
        <ol className="grid list-decimal gap-1.5 pl-5 text-sm text-foreground">
          <li>En la laptop de la mesa, conecta la impresora 4B-2054N por USB.</li>
          <li>
            Abre el archivo de configuración del agente de impresión y pega este token en <span className="font-mono">token</span>.
          </li>
          <li>Deja el agente abierto. Cuando se conecte, esta estación dice «Conectada».</li>
        </ol>
        <a
          href={GUIA_AGENTE}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring inline-flex min-h-11 items-center gap-1.5 self-start rounded-md text-sm font-medium text-brand-text underline-offset-4 hover:underline"
        >
          Guía del agente de impresión, paso a paso
          <ExternalLink aria-hidden="true" className="size-3.5" />
        </a>
      </div>

      <BotonSistema type="button" className="w-full" onClick={onListo}>
        Listo
      </BotonSistema>
    </div>
  )
}
