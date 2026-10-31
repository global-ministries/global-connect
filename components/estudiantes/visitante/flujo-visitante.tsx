'use client'

/**
 * Estudiantes — the body and the footer of "Agregar visitante" (artboard 02
 * of design/estudiantes-asistencia), driven by `useFlujoVisitante`. The
 * search results are inset rows with a trailing badge or "Agregar" (gaps G3
 * and G7, composed in ../filas-inset.tsx); the form is `InputSistema`,
 * `SelectSistema` (Año escolar, Parentesco) and `ControlSegmentado` (Sexo)
 * inside the sheet body, sections "Estudiante" / "Representante" (The Living
 * Room: "Visitante", no representante).
 */
import type { ReactElement } from 'react'
import { Search } from 'lucide-react'

import { BadgeSistema, BotonSistema, InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { AvatarServidor } from '@/components/dream-team/servidores/lista-servidores'
import { argumentosBusqueda } from '@/lib/platform/estudiantes/gestion-grupo'
import { sexoDeSubarea } from '@/lib/platform/estudiantes/nombre-grupo'
import { OPCIONES_PARENTESCO, opcionEncontrada, type Genero, type TipoRepresentante } from '@/lib/platform/estudiantes/visitante'
import type { PersonaEncontrada } from '@/lib/actions/estudiantes-grupos.actions'

import { FilaInset, ListaInset, TituloSeccion } from '../filas-inset'
import type { FlujoVisitante } from './use-flujo-visitante'

export const FORM_VISITANTE = 'form-visitante'

const SEXOS: readonly { readonly valor: Genero; readonly etiqueta: string }[] = [
  { valor: 'Femenino', etiqueta: 'Femenino' },
  { valor: 'Masculino', etiqueta: 'Masculino' },
]

/** "a" for Grupos de Chicas, "o" otherwise ("Búscala" / "Búscalo"). */
const letra = (subarea: string): 'a' | 'o' => (sexoDeSubarea(subarea).toLocaleLowerCase('es') === 'chicas' ? 'a' : 'o')

function Resultados({ flujo, filas, titulo }: { readonly flujo: FlujoVisitante; readonly filas: readonly PersonaEncontrada[]; readonly titulo: string }): ReactElement {
  return (
    <>
      <TituloSeccion id="visitante-coincidencias" texto={titulo} />
      <ListaInset etiqueta={titulo}>
        {filas.map((persona) => {
          const opcion = opcionEncontrada(persona)
          return (
            <FilaInset
              key={persona.personaId}
              avatar={<AvatarServidor nombre={persona.nombre} />}
              titulo={persona.nombre}
              subtitulo={persona.grupo ?? 'Sin grupo en este ámbito'}
              accion={
                opcion.tipo === 'agregable' ? (
                  <BotonSistema
                    type="button"
                    variante="ghost"
                    tamaño="sm"
                    aria-label={`Agregar a ${persona.nombre} como visitante`}
                    cargando={flujo.pendiente === `agregar:${persona.personaId}`}
                    disabled={flujo.pendiente !== null}
                    onClick={() => flujo.agregar(persona)}
                  >
                    Agregar
                  </BotonSistema>
                ) : (
                  <BadgeSistema variante="default" tamaño="sm">
                    {opcion.etiqueta}
                  </BadgeSistema>
                )
              }
            />
          )
        })}
      </ListaInset>
    </>
  )
}

function PasoBuscar({ flujo }: { readonly flujo: FlujoVisitante }): ReactElement {
  const { grupo, consulta, busqueda, duplicados } = flujo
  const l = letra(grupo.subarea)

  if (duplicados) {
    return (
      <div className="space-y-4">
        <AvisoFormulario tono="info">
          {`Encontramos personas parecidas a ${`${flujo.form.nombre} ${flujo.form.apellido}`.trim()}. Si es una de ellas, agrégala; si no, toca «Es otra persona».`}
        </AvisoFormulario>
        <Resultados flujo={flujo} filas={duplicados} titulo="¿Es alguna de ellas?" />
      </div>
    )
  }

  const texto = consulta.trim()
  const buscando = argumentosBusqueda(texto) !== null
  const actual = busqueda && busqueda.consulta === texto ? busqueda : null

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <InputSistema
          type="search"
          autoComplete="off"
          icono={Search}
          label={`Búscal${l} primero`}
          placeholder="Cédula, teléfono o nombre"
          value={consulta}
          onChange={(evento) => flujo.setConsulta(evento.target.value)}
        />
        <p className="text-[13px] text-muted-foreground">{`Buscamos en toda la iglesia para no crearl${l} dos veces.`}</p>
      </div>
      <div aria-live="polite" className="space-y-2">
        {!buscando && <p className="text-sm text-muted-foreground">Escribe al menos 3 letras o números.</p>}
        {buscando && (actual === null || actual.tipo === 'cargando') && (
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
            <SkeletonLista filas={2} />
          </div>
        )}
        {buscando && actual?.tipo === 'error' && <AvisoFormulario tono="error">{actual.mensaje}</AvisoFormulario>}
        {buscando && actual?.tipo === 'listo' && actual.filas.length === 0 && (
          <p className="text-sm text-muted-foreground">{`Nadie coincide con «${texto}». Toca «Crear nueva» para registrarl${l}.`}</p>
        )}
        {buscando && actual?.tipo === 'listo' && actual.filas.length > 0 && <Resultados flujo={flujo} filas={actual.filas} titulo={`¿Es alguno de ellos?`} />}
      </div>
    </div>
  )
}

function ErrorCampo({ id, mensaje }: { readonly id: string; readonly mensaje: string | undefined }): ReactElement | null {
  if (!mensaje) return null
  return (
    <p id={id} role="alert" className="text-sm font-medium text-danger-text">
      {mensaje}
    </p>
  )
}

function CampoSexo({
  id,
  valor,
  onCambio,
  error,
}: {
  readonly id: string
  readonly valor: Genero | ''
  readonly onCambio: (genero: Genero) => void
  readonly error: string | undefined
}): ReactElement {
  return (
    <div className="space-y-2">
      <span id={id} className="block text-sm font-medium text-foreground">
        Sexo
      </span>
      <ControlSegmentado<Genero | ''>
        etiqueta="Sexo"
        opciones={SEXOS}
        valor={valor}
        onCambio={(v) => v && onCambio(v)}
        className="grid w-full grid-cols-2"
      />
      <ErrorCampo id={`${id}-error`} mensaje={error} />
    </div>
  )
}

function PasoCrear({ flujo }: { readonly flujo: FlujoVisitante }): ReactElement {
  const { grupo, form, errores, cambiar } = flujo
  const tlr = grupo.experiencia === 'the_living_room'
  const r = form.representante
  const cambiarRep = (parche: Partial<typeof r>) => cambiar({ representante: { ...r, ...parche } })
  const anios = flujo.escala.filter((g) => g.ambitoId === grupo.ambitoId)
  const opcionesAnio = (anios.length > 0 ? anios : flujo.escala).map((g) => ({ valor: String(g.numero), etiqueta: g.etiqueta }))

  return (
    <form
      id={FORM_VISITANTE}
      noValidate
      className="space-y-5"
      onSubmit={(evento) => {
        evento.preventDefault()
        void flujo.enviar()
      }}
    >
      {flujo.errorGeneral && <AvisoFormulario tono="error">{flujo.errorGeneral}</AvisoFormulario>}

      <section aria-labelledby="visitante-datos" className="space-y-3">
        <TituloSeccion id="visitante-datos" texto={tlr ? 'Visitante' : 'Estudiante'} />
        <div className="grid gap-3 sm:grid-cols-2">
          <InputSistema label="Nombre" autoComplete="off" value={form.nombre} error={errores.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} />
          <InputSistema label="Apellido" autoComplete="off" value={form.apellido} error={errores.apellido} onChange={(e) => cambiar({ apellido: e.target.value })} />
          <div className="space-y-2">
            <InputSistema
              label="Cédula (opcional)"
              inputMode="numeric"
              autoComplete="off"
              placeholder="V-30123456"
              className="font-mono tabular-nums"
              value={form.cedula}
              error={flujo.errorCedula ?? undefined}
              onChange={(e) => cambiar({ cedula: e.target.value })}
            />
            {flujo.errorCedula && (
              <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={() => flujo.volverABuscar(form.cedula)}>
                Buscar por esa cédula
              </BotonSistema>
            )}
          </div>
          {tlr ? (
            <InputSistema
              label="Fecha de nacimiento (opcional)"
              type="date"
              max={flujo.hoy}
              value={form.fechaNacimiento}
              error={errores.fechaNacimiento}
              onChange={(e) => cambiar({ fechaNacimiento: e.target.value })}
            />
          ) : (
            <SelectSistema label="Año escolar" opciones={opcionesAnio} value={form.anio} onValueChange={(anio) => cambiar({ anio })} />
          )}
          <CampoSexo id="visitante-sexo" valor={form.genero} onCambio={(genero) => cambiar({ genero })} error={errores.genero} />
          <InputSistema
            label="Teléfono"
            type="tel"
            inputMode="tel"
            placeholder="0412 555 0000"
            className="font-mono tabular-nums"
            value={form.telefono}
            error={errores.telefono}
            onChange={(e) => cambiar({ telefono: e.target.value })}
          />
        </div>
      </section>

      {!tlr && (
        <section aria-labelledby="visitante-representante" className="space-y-3">
          <TituloSeccion id="visitante-representante" texto="Representante" pista="Si lo tienes a mano" />
          <div className="grid gap-3 sm:grid-cols-2">
            <InputSistema label="Nombre" autoComplete="off" value={r.nombre} error={errores.repNombre} onChange={(e) => cambiarRep({ nombre: e.target.value })} />
            <InputSistema label="Apellido (opcional)" autoComplete="off" value={r.apellido} onChange={(e) => cambiarRep({ apellido: e.target.value })} />
            <InputSistema
              label="Teléfono"
              type="tel"
              inputMode="tel"
              placeholder="0414 555 0000"
              className="font-mono tabular-nums"
              value={r.telefono}
              error={errores.repTelefono}
              onChange={(e) => cambiarRep({ telefono: e.target.value })}
            />
            <SelectSistema
              label="Parentesco"
              opciones={[...OPCIONES_PARENTESCO]}
              value={r.tipo}
              onValueChange={(tipo) => cambiarRep({ tipo: tipo as TipoRepresentante })}
            />
            <CampoSexo id="visitante-rep-sexo" valor={r.genero} onCambio={(genero) => cambiarRep({ genero })} error={errores.repGenero} />
          </div>
        </section>
      )}

      <AvisoFormulario tono="info">
        <p>
          {`Queda como `}
          <b className="font-semibold">visitante</b>
          {` de ${grupo.nombre}. Desde la 3.ª ${tlr ? 'reunión' : 'visita'} te sugerimos confirmarl${letra(grupo.subarea)} como miembro.`}
          {!tlr && ' El contacto del representante solo lo ven los líderes del grupo, su entrenador y la dirección.'}
        </p>
      </AvisoFormulario>
    </form>
  )
}

export function ContenidoVisitante({ flujo }: { readonly flujo: FlujoVisitante }): ReactElement {
  return flujo.paso === 'buscar' ? <PasoBuscar flujo={flujo} /> : <PasoCrear flujo={flujo} />
}

export function PieVisitante({ flujo }: { readonly flujo: FlujoVisitante }): ReactElement {
  const ocupado = flujo.pendiente !== null
  if (flujo.paso === 'crear') {
    return (
      <>
        <BotonSistema type="button" variante="outline" disabled={ocupado} onClick={() => flujo.volverABuscar()}>
          Atrás
        </BotonSistema>
        <BotonSistema type="submit" form={FORM_VISITANTE} cargando={flujo.pendiente === 'crear'} disabled={ocupado}>
          Registrar visitante
        </BotonSistema>
      </>
    )
  }
  if (flujo.duplicados) {
    return (
      <>
        <BotonSistema type="button" variante="outline" disabled={ocupado} onClick={flujo.irACrear}>
          Atrás
        </BotonSistema>
        <BotonSistema type="button" cargando={flujo.pendiente === 'crear'} disabled={ocupado} onClick={() => void flujo.enviar(true)}>
          Es otra persona
        </BotonSistema>
      </>
    )
  }
  return (
    <>
      <BotonSistema type="button" variante="outline" disabled={ocupado} onClick={flujo.cancelar}>
        Cancelar
      </BotonSistema>
      <BotonSistema type="button" disabled={ocupado} onClick={flujo.irACrear}>
        Crear nueva
      </BotonSistema>
    </>
  )
}
