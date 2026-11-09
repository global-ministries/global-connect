'use client'

/**
 * DPS › Configuración › Listas de la programación (T14b of
 * odd/tasks/dps-asistencia-pco.md; S12.2, S12.3; L56, L57): who may be
 * picked in the Productor, Host, Comunicador and Cantantes columns of the
 * programming sheet. One block per list with who keeps it, its people and,
 * when the caller edits it (dps_lista_puede_editar, from the page), «Quitar»
 * per person and a person search (dps_buscar_personas) to add one; whoever
 * is already on the list is not offered again. Productores: the DPS
 * direction and the Producción Creativa one; Hosts and Comunicadores: the
 * DPS direction; Cantantes are read-only here, they are whoever serves in
 * Dream Team › Global Music › Cantantes. Each change is saved at once and
 * rolled back on failure; the parent shows the autosave status.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Search } from 'lucide-react'

import { BotonSistema, InputSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { agregarAListaDps, buscarPersonasListaDps, quitarDeListaDps } from '@/lib/actions/dps-configuracion.actions'
import { LISTAS_DPS, type DefListaDps, type ListaDps, type ListaPersonasDps, type ListasDps } from '@/lib/platform/dps/listas'
import { textoParaBuscar, type PersonaBuscada } from '@/lib/platform/dps/personas'

const ESPERA_BUSQUEDA_MS = 250
const CLASE_FILA = 'flex min-h-11 items-center gap-3 border-b border-border/60 py-1.5 last:border-b-0'

type Resultado = { readonly ok: true; readonly data: ListaPersonasDps } | { readonly ok: false; readonly message: string }

export interface ListasConfiguracionProps {
  readonly listas: ListasDps
  /** A save starts. */
  readonly onEmpezar: () => void
  /** A save ended; a failure carries its reason. */
  readonly onTerminar: (ok: boolean, mensaje?: string) => void
}

interface BloqueListaProps {
  readonly def: DefListaDps
  readonly lista: ListaPersonasDps
  readonly onCambiar: (lista: ListaDps, cambio: () => Promise<Resultado>, optimista: ListaPersonasDps) => void
}

function BloqueLista({ def, lista, onCambiar }: BloqueListaProps): ReactElement {
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<readonly PersonaBuscada[]>([])
  const [error, setError] = useState<string | null>(null)
  const pedidoRef = useRef(0)
  const texto = textoParaBuscar(busqueda)

  useEffect(() => {
    const pedido = ++pedidoRef.current
    // Under two letters the results are hidden (see the render), not cleared.
    if (texto === null || !lista.puedeEditar) return
    const espera = setTimeout(() => {
      void buscarPersonasListaDps({ texto }).then((r) => {
        if (pedido !== pedidoRef.current) return
        setResultados(r.ok ? r.data : [])
        setError(r.ok ? null : r.message)
      })
    }, ESPERA_BUSQUEDA_MS)
    return () => clearTimeout(espera)
  }, [texto, lista.puedeEditar])

  const yaEstan = new Set(lista.personas.map((p) => p.personaId))
  const candidatos = resultados.filter((r) => !yaEstan.has(r.personaId))

  function agregar(persona: PersonaBuscada): void {
    setBusqueda('')
    onCambiar(def.id, () => agregarAListaDps({ lista: def.id, personaId: persona.personaId }), { ...lista, personas: [...lista.personas, persona] })
  }

  function quitar(persona: PersonaBuscada): void {
    onCambiar(def.id, () => quitarDeListaDps({ lista: def.id, personaId: persona.personaId }), {
      ...lista,
      personas: lista.personas.filter((p) => p.personaId !== persona.personaId),
    })
  }

  return (
    <div className="min-w-0 space-y-2">
      <div className="space-y-0.5">
        <h3 className="text-sm font-[650] text-foreground">{def.etiqueta}</h3>
        <p className="text-[13px] text-muted-foreground">{def.quienEdita}</p>
      </div>
      {lista.personas.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nadie en esta lista todavía.</p>
      ) : (
        <ul aria-label={def.etiqueta}>
          {lista.personas.map((p) => (
            <li key={p.personaId} className={CLASE_FILA}>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.nombre}</span>
              {lista.puedeEditar && (
                <BotonSistema type="button" variante="ghost" tamaño="sm" aria-label={`Quitar a ${p.nombre} de ${def.etiqueta}`} onClick={() => quitar(p)}>
                  Quitar
                </BotonSistema>
              )}
            </li>
          ))}
        </ul>
      )}
      {lista.puedeEditar && (
        <div className="space-y-2">
          <InputSistema
            type="search"
            label={`Agregar a ${def.etiqueta}`}
            placeholder="Buscar por nombre"
            icono={Search}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          {texto !== null && error && <p className="text-[13px] text-danger-text">{error}</p>}
          {texto !== null && !error && candidatos.length > 0 && (
            <ul aria-label={`Resultados para ${def.etiqueta}`}>
              {candidatos.map((c) => (
                <li key={c.personaId} className={CLASE_FILA}>
                  <span className="min-w-0 flex-1 truncate text-sm">{c.nombre}</span>
                  <BotonSistema type="button" variante="outline" tamaño="sm" aria-label={`Agregar a ${c.nombre} en ${def.etiqueta}`} onClick={() => agregar(c)}>
                    Agregar
                  </BotonSistema>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export function ListasConfiguracion({ listas: listasIniciales, onEmpezar, onTerminar }: ListasConfiguracionProps): ReactElement {
  const [listas, setListas] = useState<ListasDps>(listasIniciales)

  async function cambiar(lista: ListaDps, cambio: () => Promise<Resultado>, optimista: ListaPersonasDps): Promise<void> {
    const antes = listas[lista]
    setListas((l) => ({ ...l, [lista]: optimista }))
    onEmpezar()
    const r = await cambio()
    setListas((l) => ({ ...l, [lista]: r.ok ? r.data : antes }))
    onTerminar(r.ok, r.ok ? undefined : r.message)
  }

  return (
    <TarjetaSistema>
      <section aria-labelledby="dps-config-listas" className="space-y-4">
        <div className="space-y-1">
          <h2 id="dps-config-listas" className="text-base font-[650] text-foreground">
            Listas de la programación
          </h2>
          <p className="text-[13px] text-muted-foreground">
            En la hoja de programación, cada columna sugiere solo a las personas de su lista. Si alguien no está, se puede escribir su nombre a mano y
            queda sin cuenta.
          </p>
        </div>
        <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
          {LISTAS_DPS.map((def) => (
            <BloqueLista key={def.id} def={def} lista={listas[def.id]} onCambiar={(l, c, o) => void cambiar(l, c, o)} />
          ))}
        </div>
      </section>
    </TarjetaSistema>
  )
}
