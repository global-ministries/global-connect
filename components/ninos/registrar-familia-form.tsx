'use client'

import { useEffect, useState } from 'react'

import { BotonSistema, InputSistema, SelectSistema, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { createClient } from '@/lib/supabase/client'
import {
  avisoHijoCoincidencia,
  hijoVacio,
  mensajeDeErrorFamilia,
  parseCoincidencias,
  parseConyuge,
  parseHijosCoincidencias,
  rolDeConyuge,
  validarFamilia,
  type Conyuge,
  type FamiliaForm,
  type FamiliaPayload,
  type HijoCoincidencia,
  type HijoForm,
  type PadreCoincidencia,
} from '@/lib/platform/ninos/familia'
import type { SalonNivel } from '@/lib/platform/ninos/nivel'
import type { Json } from '@/lib/supabase/database.types'

import { CamposAutorizados, OPCIONES_GENERO } from './campos-nino'
import { InvitarFamiliaNueva } from './invitar-familia-nueva'
import { PieFormulario } from './pie-formulario'
import { TarjetasHijos } from './tarjetas-hijos'

type Props = {
  /** When set, the form only adds children to this parent. */
  padreExistente?: { id: string; nombre: string }
  /** consulta: "Nombre Apellido" of the first child, to find the family again. */
  onRegistrada: (padreId: string, consulta: string) => void
  onCancelar: () => void
  /** Prefilled form (a pre-registration under review). */
  inicial?: FamiliaForm
  /** Replaces the direct RPC (e.g. confirming a pre-registration through its route). */
  guardar?: (payload: FamiliaPayload) => Promise<{ padreId: string } | { error: string }>
  textoGuardar?: string
  /** The rooms that define the child's level and its suggestion. */
  salones?: readonly SalonNivel[]
  /** Opens another family that already has one of these children (consulta: the child's name). */
  onAbrirFamilia?: (padreId: string, consulta: string) => void
}

/** The adult's recorded spouse, or null when there is none or the lookup fails. */
async function buscarConyuge(id: string): Promise<Conyuge | null> {
  try {
    const res = await createClient().rpc('ninos_conyuge_de', { p_usuario_id: id })
    return res?.error ? null : parseConyuge(res?.data)
  } catch {
    // Without the lookup the form still registers the children for the adult alone.
    return null
  }
}

/**
 * Children of the payload that already exist in another family of the caller's scope.
 * A warning only: a failed lookup (or one not deployed yet) never blocks the registration.
 */
async function buscarHijosEnOtraFamilia(payload: FamiliaPayload): Promise<HijoCoincidencia[]> {
  try {
    // Not in database.types.ts yet (regenerated after the migration).
    const res = await createClient().rpc('ninos_hijos_coincidencias' as never, {
      p_hijos: payload.hijos,
      p_padre_id: 'id' in payload.padre ? payload.padre.id : null,
    } as never)
    return res?.error ? [] : parseHijosCoincidencias(res?.data)
  } catch {
    return []
  }
}

/** Registers a new family (or adds children to a known parent) in one RPC call. */
export function RegistrarFamiliaForm({ padreExistente, onRegistrada, onCancelar, inicial, guardar, textoGuardar, salones, onAbrirFamilia }: Props) {
  const [form, setForm] = useState<FamiliaForm>(inicial ?? {
    padre: { id: padreExistente?.id, nombre: '', apellido: '', telefono: '', cedula: '', genero: '' },
    hijos: [hijoVacio()],
    autorizados: [],
  })
  const [errores, setErrores] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)
  const [coincidencias, setCoincidencias] = useState<PadreCoincidencia[]>([])
  // An existing adult the anfitrión confirmed from the duplicate check of a new family.
  const [padreConfirmado, setPadreConfirmado] = useState<PadreCoincidencia | null>(null)
  // The existing adult's recorded spouse: offered as second parent, never linked without an explicit check.
  // `de` is the adult it belongs to, so a spouse is never sent for a different adult.
  const [conyuge, setConyuge] = useState<{ de: string; persona: Conyuge } | null>(null)
  const [vincularConyuge, setVincularConyuge] = useState(false)
  // Children that already exist in another family: the anfitrión opens it or continues on purpose.
  const [repetidos, setRepetidos] = useState<{ payload: FamiliaPayload; lista: HijoCoincidencia[] } | null>(null)

  const padreExistenteId = padreExistente?.id
  useEffect(() => {
    if (!padreExistenteId || guardar) return
    let vigente = true
    void buscarConyuge(padreExistenteId).then((c) => {
      if (vigente && c) setConyuge({ de: padreExistenteId, persona: c })
    })
    return () => {
      vigente = false
    }
  }, [padreExistenteId, guardar])

  /** A NEW parent was just created here: offer the account invitation before going on. */
  const [registrada, setRegistrada] = useState<{ padreId: string; consulta: string } | null>(null)

  const setPadre = (campo: keyof FamiliaForm['padre'], v: string) => setForm((f) => ({ ...f, padre: { ...f.padre, [campo]: v } }))
  const setHijo = (i: number, h: HijoForm) => {
    setRepetidos(null)
    setForm((f) => ({ ...f, hijos: f.hijos.map((x, j) => (j === i ? h : x)) }))
  }

  async function registrar(payload: FamiliaPayload) {
    setGuardando(true)
    if (guardar) {
      const r = await guardar(payload)
      setGuardando(false)
      if ('error' in r) setErrores([r.error])
      else onRegistrada(r.padreId, payload.hijos[0] ? `${payload.hijos[0].nombre} ${payload.hijos[0].apellido}` : '')
      return
    }
    const conConyuge: FamiliaPayload =
      conyuge && vincularConyuge && 'id' in payload.padre && payload.padre.id === conyuge.de
        ? { ...payload, conyuge_id: conyuge.persona.id }
        : payload
    // A new parent goes through the table's RPC, which records who created it (for the invitation).
    const nuevo = !('id' in payload.padre)
    const { data, error } = await createClient().rpc(nuevo ? 'ninos_registrar_familia_mesa' : 'ninos_registrar_familia', {
      p: conConyuge as unknown as Json,
    })
    setGuardando(false)
    if (error) {
      setErrores([mensajeDeErrorFamilia(error)])
      return
    }
    const res = data as { padre_id?: string; padre_nuevo?: boolean } | null
    const primero = payload.hijos[0]
    const consulta = primero ? `${primero.nombre} ${primero.apellido}` : ''
    if (!res?.padre_id) return
    if (res.padre_nuevo) setRegistrada({ padreId: res.padre_id, consulta })
    else onRegistrada(res.padre_id, consulta)
  }

  /** Registers unless a child already exists in another family; then waits for the anfitrión. */
  async function registrarRevisando(payload: FamiliaPayload) {
    // A pre-registration confirmed through its route keeps its own review.
    if (!guardar) {
      setGuardando(true)
      const lista = await buscarHijosEnOtraFamilia(payload)
      setGuardando(false)
      if (lista.length > 0) {
        setRepetidos({ payload, lista })
        return
      }
    }
    await registrar(payload)
  }

  async function registrarDeTodosModos() {
    if (!repetidos) return
    const { payload } = repetidos
    setRepetidos(null)
    await registrar(payload)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const r = validarFamilia(form)
    if (!r.ok) {
      setErrores(r.errores)
      return
    }
    setErrores([])
    setRepetidos(null)
    if ('id' in r.payload.padre) {
      await registrarRevisando(r.payload)
      return
    }
    // A known phone or cédula is never reused silently: the anfitrión confirms it first.
    setGuardando(true)
    const { data, error } = await createClient().rpc('ninos_buscar_padre', {
      p_cedula: form.padre.cedula.trim(),
      p_telefono: form.padre.telefono.trim(),
    })
    setGuardando(false)
    if (error) {
      setErrores([mensajeDeErrorFamilia(error)])
      return
    }
    const encontrados = parseCoincidencias(data)
    if (encontrados.length > 0) {
      setCoincidencias(encontrados)
      return
    }
    await registrarRevisando(r.payload)
  }

  async function confirmar(padre: PadreCoincidencia) {
    const r = validarFamilia({ ...form, padre: { ...form.padre, id: padre.id } })
    setCoincidencias([])
    if (!r.ok) {
      setErrores(r.errores)
      return
    }
    if (!guardar) {
      setGuardando(true)
      const c = await buscarConyuge(padre.id)
      setGuardando(false)
      if (c) {
        // Stop so the anfitrión decides about the spouse before registering.
        setForm((f) => ({ ...f, padre: { ...f.padre, id: padre.id } }))
        setPadreConfirmado(padre)
        setConyuge({ de: padre.id, persona: c })
        setVincularConyuge(false)
        return
      }
    }
    await registrarRevisando(r.payload)
  }

  function cambiarRepresentante() {
    setForm((f) => ({ ...f, padre: { ...f.padre, id: undefined } }))
    setPadreConfirmado(null)
    setConyuge(null)
    setVincularConyuge(false)
  }

  const textoBoton = textoGuardar ?? (padreExistente ? (form.hijos.length > 1 ? `Agregar ${form.hijos.length} niños` : 'Agregar niño') : 'Registrar familia')

  if (registrada) {
    return <InvitarFamiliaNueva padreId={registrada.padreId} onContinuar={() => onRegistrada(registrada.padreId, registrada.consulta)} />
  }

  return (
    <form onSubmit={enviar} className="space-y-6" noValidate>
      {padreExistente ? (
        <TextoSistema variante="sutil" tamaño="sm">
          Representante: <span className="font-medium text-foreground">{padreExistente.nombre}</span>
        </TextoSistema>
      ) : padreConfirmado ? (
        <TarjetaSistema className="space-y-3 p-4 md:p-6">
          <TituloSistema nivel={3}>Representante</TituloSistema>
          <TextoSistema variante="sutil" tamaño="sm">
            Persona existente:{' '}
            <span className="font-medium text-foreground">
              {`${padreConfirmado.nombre} ${padreConfirmado.apellido}`.trim()}
            </span>
          </TextoSistema>
          <TextoSistema variante="sutil" className="text-xs">
            Revisa la opción del cónyuge más abajo y pulsa «Registrar familia».
          </TextoSistema>
          <BotonSistema type="button" variante="outline" tamaño="sm" onClick={cambiarRepresentante}>
            Cambiar representante
          </BotonSistema>
        </TarjetaSistema>
      ) : (
        <TarjetaSistema className="space-y-4 p-4 md:p-6">
          <TituloSistema nivel={3}>Representante</TituloSistema>
          <div className="grid gap-4 sm:grid-cols-2">
            <InputSistema
              id="padre-nombre"
              label="Nombre"
              aria-label="Nombre del representante"
              value={form.padre.nombre}
              onChange={(e) => setPadre('nombre', e.target.value)}
            />
            <InputSistema
              id="padre-apellido"
              label="Apellido"
              aria-label="Apellido del representante"
              value={form.padre.apellido}
              onChange={(e) => setPadre('apellido', e.target.value)}
            />
            <InputSistema
              id="padre-telefono"
              label="Teléfono"
              type="tel"
              inputMode="tel"
              value={form.padre.telefono}
              onChange={(e) => setPadre('telefono', e.target.value)}
            />
            <InputSistema
              id="padre-cedula"
              label="Cédula (opcional)"
              inputMode="numeric"
              value={form.padre.cedula}
              onChange={(e) => setPadre('cedula', e.target.value)}
            />
            <SelectSistema
              id="padre-genero"
              label="Género"
              aria-label="Género del representante"
              opciones={OPCIONES_GENERO}
              value={form.padre.genero}
              onValueChange={(v) => setPadre('genero', v)}
            />
          </div>
          <TextoSistema variante="sutil" className="text-xs">
            Si el teléfono o la cédula ya existen, te pediremos confirmar a esa persona.
          </TextoSistema>
          {coincidencias.length > 0 && (
            <div role="alert" className="space-y-3 rounded-xl border border-warning/30 bg-warning/10 p-4">
              <p className="text-sm font-medium text-warning-text">
                Ya existe una persona con estos datos. ¿Es el representante?
              </p>
              <ul className="space-y-2">
                {coincidencias.map((c) => (
                  <li key={c.id} className="space-y-3 rounded-xl border border-border bg-card p-3 text-foreground">
                    <p className="text-sm">
                      <span className="font-medium">
                        {c.nombre} {c.apellido}
                      </span>
                      {c.telefono && <> · Tel. {c.telefono}</>}
                      {c.cedula && <> · Cédula {c.cedula}</>}
                    </p>
                    <BotonSistema type="button" className="w-full" disabled={guardando} onClick={() => void confirmar(c)}>
                      Sí, es esta persona
                    </BotonSistema>
                  </li>
                ))}
              </ul>
              <BotonSistema type="button" variante="outline" className="w-full" onClick={() => setCoincidencias([])}>
                No, corregir datos
              </BotonSistema>
            </div>
          )}
        </TarjetaSistema>
      )}

      <TarjetasHijos
        hijos={form.hijos}
        salones={salones}
        onCambiar={setHijo}
        onQuitar={(i) => setForm((f) => ({ ...f, hijos: f.hijos.filter((_, j) => j !== i) }))}
        onAgregar={() => setForm((f) => ({ ...f, hijos: [...f.hijos, { ...hijoVacio(), apellido: f.hijos[0]?.apellido ?? '' }] }))}
      />

      {conyuge && (
        <TarjetaSistema className="space-y-2 p-4 md:p-6">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-3 font-medium text-foreground">
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 rounded accent-[var(--brand-primary)]"
              checked={vincularConyuge}
              onChange={(e) => setVincularConyuge(e.target.checked)}
            />
            ¿Vincular también a {`${conyuge.persona.nombre} ${conyuge.persona.apellido}`.trim()} como{' '}
            {rolDeConyuge(conyuge.persona.genero)}?
          </label>
          <TextoSistema variante="sutil" className="text-xs">
            Figura como cónyuge del representante. Márcalo solo si también es padre o madre de estos niños.
          </TextoSistema>
        </TarjetaSistema>
      )}

      <TarjetaSistema className="space-y-4 p-4 md:p-6">
        <TituloSistema nivel={3}>Personas autorizadas para retirar</TituloSistema>
        <CamposAutorizados autorizados={form.autorizados} onChange={(a) => setForm((f) => ({ ...f, autorizados: a }))} />
      </TarjetaSistema>

      {repetidos && (
        <div role="alert" className="space-y-3 rounded-xl border border-warning/30 bg-warning/10 p-4">
          <p className="text-sm font-medium text-warning-text">Posible niño duplicado</p>
          <ul className="space-y-2">
            {repetidos.lista.map((c) => (
              <li key={`${c.indice}-${c.ninoId}`} className="space-y-3 rounded-xl border border-border bg-card p-3 text-foreground">
                <p className="text-sm">{avisoHijoCoincidencia(c)}</p>
                {onAbrirFamilia && (
                  <BotonSistema
                    type="button"
                    variante="outline"
                    tamaño="sm"
                    onClick={() => onAbrirFamilia(c.padreId, `${c.nombre} ${c.apellido}`.trim())}
                  >
                    Abrir esa familia
                  </BotonSistema>
                )}
              </li>
            ))}
          </ul>
          <TextoSistema variante="sutil" className="text-xs">
            Si es otro niño con el mismo nombre y fecha, puedes registrarlo igual.
          </TextoSistema>
          <div className="flex flex-col gap-2 sm:flex-row">
            <BotonSistema type="button" className="flex-1" disabled={guardando} onClick={() => void registrarDeTodosModos()}>
              Registrar de todos modos
            </BotonSistema>
            <BotonSistema type="button" variante="outline" className="flex-1" onClick={() => setRepetidos(null)}>
              Corregir datos
            </BotonSistema>
          </div>
        </div>
      )}

      {errores.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-xl border border-danger/20 bg-danger/10 p-3 text-sm text-danger-text">
          {errores.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <PieFormulario>
        <BotonSistema type="button" variante="outline" className="flex-1 sm:flex-none" onClick={onCancelar}>
          Cancelar
        </BotonSistema>
        <BotonSistema type="submit" className="flex-1 sm:flex-none" disabled={guardando}>
          {guardando ? 'Guardando…' : textoBoton}
        </BotonSistema>
      </PieFormulario>
    </form>
  )
}
