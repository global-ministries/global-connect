"use client"

/**
 * The panel of one notice's text (R4b of odd/tasks/talleres-rediseno.md,
 * S10 S11; design/talleres-avisos 02–04). `DetalleResponsivo`: a 640px side
 * panel from md, a bottom sheet below with «Texto» / «Vista previa».
 *
 * - Editors (the same people who switch notices on and off): subject,
 *   message, chips, live preview of the email and the bell with sample data,
 *   client validation (Guardar disabled while there is an error), server
 *   errors, «Restaurar texto predeterminado» (asks first) and «Enviarme una
 *   prueba».
 * - Readers: the text and its preview, nothing to change.
 * - «Recordatorio de clase» of a taller with plantilla clases (any taller,
 *   L13): «Por clase» lists each clase as «Texto propio» or «Usa el texto
 *   general» and opens its own editor; «Texto general» edits the text
 *   without clase. Each save is one text (one clase or the general one).
 */
import { ArrowLeft, Check, Eye, Link2, Pencil, Plus, Send, Undo2 } from 'lucide-react'
import { useState, useTransition, type ReactNode } from 'react'

import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { DetalleResponsivo, useEsEscritorio } from '@/components/ui/detalle-responsivo'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { TabsContent, TabsList, TabsSistema, TabsTrigger } from '@/components/ui/TabsSistema'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import type { AvisoCatalogo } from '@/lib/platform/talleres/avisos-catalogo'
import {
  datosEjemplo,
  fechaCorta,
  quitarVariable,
  renderTextoAviso,
  TEXTOS_PREDETERMINADOS,
  validarTextoAviso,
  type DefinicionVariables,
  type PlantillaAviso,
  type TextoAvisoGuardado,
  type TipoAvisoEditable,
} from '@/lib/platform/talleres/avisos-textos'
import { enviarPruebaAvisoAction, guardarTextoAvisoAction, restaurarTextoAvisoAction } from '@/lib/platform/talleres/avisos-textos-actions'

import { EditorTextoAviso } from './editor-texto-aviso'
import { EtiquetaTexto } from './etiqueta-texto'
import { VistaPreviaAviso } from './vista-previa-aviso'

export interface ClasePlantillaAviso {
  readonly id: string
  readonly numero: number
  readonly tema: string
}

export interface PanelTextoAvisoProps {
  readonly abierto: boolean
  readonly onCerrar: () => void
  readonly aviso: AvisoCatalogo
  readonly tallerId: string
  readonly tallerNombre: string
  readonly definicion: DefinicionVariables
  /** The custom texts of this kind (general and per clase). */
  readonly textos: readonly TextoAvisoGuardado[]
  /** Active plantilla clases (only used by «Recordatorio de clase»). */
  readonly clases: readonly ClasePlantillaAviso[]
  readonly puedeEditar: boolean
}

interface Borrador {
  readonly asunto: string
  readonly mensaje: string
}

type Pestana = 'clases' | 'general'

function editadoPor(texto: TextoAvisoGuardado): string {
  const cuando = fechaCorta(texto.editadoEn)
  return ['editado', texto.editadoPor ? `por ${texto.editadoPor}` : null, cuando ? `el ${cuando}` : null].filter(Boolean).join(' ')
}

function nombreClase(clase: ClasePlantillaAviso): string {
  return `Clase ${clase.numero} · ${clase.tema}`
}

function Titulo({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
      {children}
    </h3>
  )
}

function TextoLectura({ borrador }: { borrador: Borrador }) {
  return (
    <div className="grid gap-3 rounded-xl border border-border bg-muted/40 px-3.5 py-3 text-sm">
      <p>
        <span className="block text-xs text-muted-foreground">Asunto del correo</span>
        {borrador.asunto}
      </p>
      <p className="whitespace-pre-line">
        <span className="block text-xs text-muted-foreground">Mensaje</span>
        {borrador.mensaje}
      </p>
    </div>
  )
}

export function PanelTextoAviso({
  abierto,
  onCerrar,
  aviso,
  tallerId,
  tallerNombre,
  definicion,
  textos,
  clases,
  puedeEditar,
}: PanelTextoAvisoProps) {
  const tipo = aviso.tipo as TipoAvisoEditable
  const plantilla: PlantillaAviso = TEXTOS_PREDETERMINADOS[tipo]
  const porClase = tipo === 'recordatorio_clase' && clases.length > 0
  const escritorio = useEsEscritorio() !== false
  const notificar = useNotificaciones()
  const [pendiente, iniciar] = useTransition()

  const [pestana, setPestana] = useState<Pestana>(porClase ? 'clases' : 'general')
  const [claseAbierta, setClaseAbierta] = useState<string | null>(null)
  const [borradores, setBorradores] = useState<Readonly<Record<string, Borrador>>>({})
  const [confirmando, setConfirmando] = useState(false)
  const [errorServidor, setErrorServidor] = useState<string | null>(null)
  const [vistaMovil, setVistaMovil] = useState<'texto' | 'vista'>('texto')
  const [sinLugar, setSinLugar] = useState(false)

  const general = textos.find((t) => t.claseId === null) ?? null
  const clase = porClase && pestana === 'clases' ? (clases.find((c) => c.id === claseAbierta) ?? null) : null
  const enLista = porClase && pestana === 'clases' && clase === null
  const claseId = clase?.id ?? null
  const guardado = textos.find((t) => t.claseId === claseId) ?? null
  const predeterminado: Borrador = { asunto: plantilla.asunto, mensaje: plantilla.mensaje }
  const textoGeneral: Borrador = general ?? predeterminado
  const inicial: Borrador = guardado ?? (clase ? textoGeneral : predeterminado)
  const clave = claseId ?? 'general'
  const borrador = borradores[clave] ?? inicial
  const errores = validarTextoAviso(borrador, definicion)
  const cambiado = borrador.asunto !== inicial.asunto || borrador.mensaje !== inicial.mensaje
  const esPredeterminado = borrador.asunto === predeterminado.asunto && borrador.mensaje === predeterminado.mensaje
  const datos = datosEjemplo(tipo, tallerNombre, { sinLugar, clase })
  const usaLugar = definicion.variables.includes('lugar') || definicion.variables.includes('indicaciones')

  function cambiar(parcial: Partial<Borrador>) {
    setBorradores((actual) => ({ ...actual, [clave]: { ...borrador, ...parcial } }))
    setErrorServidor(null)
    setConfirmando(false)
  }

  function olvidar(claveBorrador: string) {
    setBorradores((actual) => {
      const { [claveBorrador]: _omitido, ...resto } = actual
      return resto
    })
  }

  function abrirClase(id: string | null) {
    setClaseAbierta(id)
    setErrorServidor(null)
    setConfirmando(false)
    setVistaMovil('texto')
  }

  function guardar() {
    iniciar(async () => {
      const resultado = await guardarTextoAvisoAction({ tallerId, tipo, claseId, asunto: borrador.asunto, mensaje: borrador.mensaje })
      if (!resultado.ok) {
        setErrorServidor(resultado.mensaje)
        return
      }
      notificar.success(resultado.mensaje)
      if (clase) {
        abrirClase(null)
        return
      }
      onCerrar()
    })
  }

  function restaurar() {
    setConfirmando(false)
    if (!guardado) {
      setBorradores((actual) => ({ ...actual, [clave]: predeterminado }))
      return
    }
    iniciar(async () => {
      const resultado = await restaurarTextoAvisoAction({ tallerId, tipo, claseId })
      if (!resultado.ok) {
        setErrorServidor(resultado.mensaje)
        return
      }
      setBorradores((actual) => ({ ...actual, [clave]: predeterminado }))
      notificar.success(resultado.mensaje)
    })
  }

  function usarGeneral() {
    if (!clase) return
    const id = clase.id
    if (!guardado) {
      olvidar(id)
      abrirClase(null)
      return
    }
    iniciar(async () => {
      const resultado = await restaurarTextoAvisoAction({ tallerId, tipo, claseId: id })
      if (!resultado.ok) {
        setErrorServidor(resultado.mensaje)
        return
      }
      olvidar(id)
      notificar.success(resultado.mensaje)
      abrirClase(null)
    })
  }

  function enviarPrueba() {
    iniciar(async () => {
      const resultado = await enviarPruebaAvisoAction({
        tallerId,
        tipo,
        claseId,
        asunto: borrador.asunto,
        mensaje: borrador.mensaje,
        clase: clase ? { numero: clase.numero, tema: clase.tema } : null,
      })
      if (resultado.ok) notificar.success(resultado.mensaje)
      else notificar.error(resultado.mensaje)
    })
  }

  const confirmacion = (
    <div className="flex flex-1 flex-wrap items-center gap-2.5">
      <p className="min-w-0 flex-1 text-[13px]">
        <b className="block font-semibold">¿Volver al texto predeterminado?</b>
        <span className="text-muted-foreground">Se borra el texto personalizado de este aviso.</span>
      </p>
      <BotonSistema variante="outline" onClick={() => setConfirmando(false)}>
        Cancelar
      </BotonSistema>
      <BotonSistema variante="primario" icono={Undo2} cargando={pendiente} onClick={restaurar}>
        Restaurar
      </BotonSistema>
    </div>
  )

  const botonRestaurar = (
    <BotonSistema
      variante="ghost"
      icono={Undo2}
      disabled={pendiente || (!guardado && esPredeterminado)}
      onClick={() => setConfirmando(true)}
    >
      Restaurar texto predeterminado
    </BotonSistema>
  )

  const editando = puedeEditar && !enLista
  const pie = editando ? (
    escritorio && confirmando && !clase ? (
      confirmacion
    ) : (
      <div className="flex w-full items-center gap-2.5">
        {escritorio && !clase && botonRestaurar}
        <span className="flex-1" />
        <BotonSistema variante="outline" onClick={clase ? () => abrirClase(null) : onCerrar}>
          Cancelar
        </BotonSistema>
        <BotonSistema variante="primario" icono={Check} cargando={pendiente} disabled={errores.length > 0 || !cambiado} onClick={guardar}>
          Guardar
        </BotonSistema>
      </div>
    )
  ) : undefined

  function estado() {
    if (clase && !guardado && !cambiado) return <EtiquetaTexto>Usa el texto general</EtiquetaTexto>
    if (guardado) {
      return (
        <>
          <EtiquetaTexto tono="marca">{clase ? 'Texto propio' : 'Personalizado'}</EtiquetaTexto>
          <span>{cambiado ? 'cambios sin guardar' : editadoPor(guardado)}</span>
        </>
      )
    }
    if (esPredeterminado) return <EtiquetaTexto>Texto predeterminado</EtiquetaTexto>
    return (
      <>
        <EtiquetaTexto tono="marca">{clase ? 'Texto propio' : 'Personalizado'}</EtiquetaTexto>
        <span>sin guardar</span>
      </>
    )
  }

  const vistaPrevia = (
    <section aria-labelledby="titulo-vista-previa" className="grid gap-1">
      <div className="flex flex-wrap items-center gap-3">
        <Titulo id="titulo-vista-previa">
          <span className={!escritorio && puedeEditar ? 'sr-only' : undefined}>Vista previa</span>
        </Titulo>
        <span className="flex-1" />
        {usaLugar && (
          <ControlSegmentado
            etiqueta="Datos del ejemplo"
            opciones={[
              { valor: 'completo', etiqueta: 'Con todos los datos' },
              { valor: 'faltan', etiqueta: 'Sin lugar ni indicaciones' },
            ]}
            valor={sinLugar ? 'faltan' : 'completo'}
            onCambio={(valor) => setSinLugar(valor === 'faltan')}
          />
        )}
      </div>
      <VistaPreviaAviso
        asunto={borrador.asunto}
        mensaje={borrador.mensaje}
        plantilla={plantilla}
        variables={definicion.variables}
        datos={datos}
        tallerNombre={tallerNombre}
      />
      {puedeEditar && (
        <div className="mt-3.5 flex flex-wrap items-center gap-3">
          <BotonSistema variante="outline" icono={Send} disabled={pendiente || errores.length > 0} onClick={enviarPrueba}>
            Enviarme una prueba
          </BotonSistema>
          <span className="text-xs text-muted-foreground">Llega solo a tu correo, con «Prueba ·» en el asunto y estos datos de ejemplo.</span>
        </div>
      )}
    </section>
  )

  const editor = (
    <div className="grid gap-6">
      {clase && (
        <BotonSistema variante="ghost" tamaño="sm" icono={ArrowLeft} className="justify-self-start" onClick={() => abrirClase(null)}>
          Todas las clases
        </BotonSistema>
      )}
      <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
        {clase && <b className="font-semibold text-foreground">{nombreClase(clase)}</b>}
        {estado()}
      </p>
      {!escritorio && puedeEditar && (
        <ControlSegmentado
          etiqueta="Editor"
          opciones={[
            { valor: 'texto', etiqueta: 'Texto' },
            { valor: 'vista', etiqueta: 'Vista previa' },
          ]}
          valor={vistaMovil}
          onCambio={setVistaMovil}
          className="w-full [&>button]:flex-1"
        />
      )}
      {(escritorio || vistaMovil === 'texto' || !puedeEditar) && (
        <section aria-label="Texto" className="grid gap-3">
          {!escritorio && puedeEditar ? null : <Titulo>Texto</Titulo>}
          {puedeEditar ? (
            <EditorTextoAviso
              tipo={tipo}
              nombreAviso={aviso.nombre}
              definicion={definicion}
              asunto={borrador.asunto}
              mensaje={borrador.mensaje}
              onAsunto={(asunto) => cambiar({ asunto })}
              onMensaje={(mensaje) => cambiar({ mensaje })}
              errores={errores}
              errorServidor={errorServidor}
              onQuitar={(variable) =>
                cambiar({ asunto: quitarVariable(borrador.asunto, variable), mensaje: quitarVariable(borrador.mensaje, variable) })
              }
              etiquetaMensaje={clase ? `Mensaje para la clase ${clase.numero}` : 'Mensaje'}
              deshabilitado={pendiente}
            />
          ) : (
            <TextoLectura borrador={borrador} />
          )}
          {puedeEditar && clase && guardado && (
            <BotonSistema variante="outline" icono={Link2} className="justify-self-start" disabled={pendiente} onClick={usarGeneral}>
              Usar el texto general
            </BotonSistema>
          )}
          {puedeEditar && !escritorio && !clase && (confirmando ? confirmacion : <div className="justify-self-start">{botonRestaurar}</div>)}
        </section>
      )}
      {(escritorio || vistaMovil === 'vista' || !puedeEditar) && vistaPrevia}
    </div>
  )

  const listaClases = (
    <div className="grid gap-3">
      <p className="text-[13px] text-muted-foreground">
        Cada clase de {tallerNombre} puede tener su propio recordatorio. Si una clase no tiene texto propio, usa el texto general.
      </p>
      <ul aria-label="Clases de la plantilla" className="divide-y divide-border/60 rounded-2xl border border-border">
        {clases.map((c) => {
          const propio = textos.find((t) => t.claseId === c.id) ?? null
          const texto = propio ?? textoGeneral
          const primera = renderTextoAviso(texto.mensaje, datosEjemplo(tipo, tallerNombre, { clase: c })).split('\n')[0]
          const accion = !puedeEditar ? 'Ver' : propio ? 'Editar' : 'Escribir texto propio'
          return (
            <li key={c.id} className="flex min-h-16 items-center gap-3 px-3.5 py-3">
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-muted font-mono text-sm tabular-nums">
                {c.numero}
              </span>
              <span className="grid min-w-0 flex-1 gap-1">
                <b className="truncate text-sm font-semibold">{nombreClase(c)}</b>
                <span className="flex flex-wrap items-center gap-2">
                  {propio ? <EtiquetaTexto tono="marca">Texto propio</EtiquetaTexto> : <EtiquetaTexto>Usa el texto general</EtiquetaTexto>}
                </span>
                {primera && <span className="truncate text-xs text-muted-foreground">{primera}</span>}
              </span>
              <BotonSistema
                variante="outline"
                tamaño="sm"
                icono={!puedeEditar ? Eye : propio ? Pencil : Plus}
                aria-label={`${accion}: ${nombreClase(c)}`}
                onClick={() => abrirClase(c.id)}
                className="shrink-0"
              >
                <span className="max-md:sr-only">{accion}</span>
              </BotonSistema>
            </li>
          )
        })}
      </ul>
    </div>
  )

  const propias = clases.filter((c) => textos.some((t) => t.claseId === c.id)).length

  return (
    <DetalleResponsivo
      abierto={abierto}
      onCambioAbierto={(valor) => {
        if (!valor) onCerrar()
      }}
      titulo={aviso.nombre}
      descripcion={`${aviso.cuando} · Correo y en la app`}
      ancho="lg"
      pie={pie}
    >
      {porClase ? (
        <TabsSistema
          value={pestana}
          onValueChange={(valor) => {
            setPestana(valor as Pestana)
            setErrorServidor(null)
            setConfirmando(false)
          }}
        >
          <TabsList aria-label="Texto del recordatorio">
            <TabsTrigger value="clases">
              Por clase{' '}
              <span className="ml-1 font-mono text-xs tabular-nums opacity-70">
                {propias}/{clases.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="general">Texto general</TabsTrigger>
          </TabsList>
          <TabsContent value="clases">{enLista ? listaClases : editor}</TabsContent>
          <TabsContent value="general">{pestana === 'general' && editor}</TabsContent>
        </TabsSistema>
      ) : (
        editor
      )}
    </DetalleResponsivo>
  )
}
