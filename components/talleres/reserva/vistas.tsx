'use client'

/**
 * The steps of the reservation flow (design/talleres-reserva/03, 04, 06):
 * horario, cédula, code, identity confirmed, por verificar, new person and
 * the partner (Parejas, S12). Each renders inside the flow's one form; the
 * primary action lives in the flow's footer.
 */
import { useState } from 'react'
import { CheckCircle2, Info, ShieldCheck, UserRound } from 'lucide-react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { estadoCupo, fechaDiaMes, formatoCedula, tituloEdicion, type EdicionPublica, type Vinculo } from '@/lib/platform/talleres/reserva-publica'
import { cn } from '@/lib/utils'

import { CampoCedula, CampoCodigo, CamposFicha, CampoTrampa, CasillaConsentimiento, ContextoEdicion, ListaPasos } from './piezas'
import type { FlujoReserva } from './use-flujo-reserva'

function Encabezado({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <h3 className="text-[22px] font-bold leading-tight tracking-tight text-foreground">{titulo}</h3>
      {children && <p className="text-[15px] text-muted-foreground">{children}</p>}
    </div>
  )
}

const edicionDe = (f: FlujoReserva) => f.taller.ediciones.find((e) => e.id === f.edicionId) ?? f.taller.ediciones[0]

/** Horario cards as native radios (design 06 step 1). */
export function OpcionesEdicion({
  ediciones,
  valor,
  onCambio,
  nombre,
  compacta = false,
}: {
  ediciones: readonly EdicionPublica[]
  valor: string
  onCambio: (id: string) => void
  nombre: string
  compacta?: boolean
}) {
  return (
    <fieldset className="grid min-w-0 gap-3">
      <legend className="sr-only">{nombre}</legend>
      {ediciones.map((e) => {
        const cupo = estadoCupo(e)
        const elegida = e.id === valor
        return (
          <label
            key={e.id}
            className={cn(
              'relative grid cursor-pointer gap-2 rounded-2xl border bg-card p-4 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand',
              elegida ? 'border-brand bg-brand-tint' : 'border-border hover:bg-accent',
            )}
          >
            <input type="radio" name={nombre} value={e.id} checked={elegida} onChange={() => onCambio(e.id)} className="sr-only" />
            <span className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight text-foreground">{tituloEdicion(e)}</span>
              <span
                aria-hidden="true"
                className={cn('grid size-5 shrink-0 place-items-center rounded-full border-2', elegida ? 'border-brand' : 'border-border')}
              >
                {elegida && <span className="size-2.5 rounded-full bg-brand" />}
              </span>
            </span>
            <span className="text-[13px] text-muted-foreground">
              Del {fechaDiaMes(e.fechaInicio)}
              {e.fechaFin ? ` al ${fechaDiaMes(e.fechaFin)}` : ''}
              {e.lugar ? ` · ${e.lugar}` : ''}
              {!compacta && e.cierreInscripcion ? ` · cierra el ${fechaDiaMes(e.cierreInscripcion)}` : ''}
            </span>
            <PuntoEstado tono={cupo.tono} etiqueta={cupo.etiqueta} />
          </label>
        )
      })}
    </fieldset>
  )
}

export function VistaHorario({ f }: { f: FlujoReserva }) {
  return (
    <div className="grid gap-5">
      <Encabezado titulo="Elige tu horario">
        El grupo y {f.taller.generoRequerido === 'Femenino' ? 'la facilitadora' : 'el facilitador'} se asignan cuando la coordinación aprueba tu inscripción.
      </Encabezado>
      <OpcionesEdicion ediciones={f.taller.ediciones} valor={f.edicionId} onCambio={(id) => f.elegirEdicion(id)} nombre={`Horarios de ${f.taller.nombre}`} />
    </div>
  )
}

export function VistaCedula({ f }: { f: FlujoReserva }) {
  return (
    <div className="grid gap-5">
      <Encabezado titulo="¿Ya eres parte de Global?">Escribe tu cédula. Si ya estás en Global, te enviamos un código para confirmar que eres tú.</Encabezado>
      <ContextoEdicion taller={f.taller.nombre} edicion={edicionDe(f)} onCambiar={f.taller.ediciones.length > 1 ? () => f.ir('horario') : undefined} />
      <CampoCedula
        id="reserva-cedula"
        etiqueta="Cédula"
        tipo={f.tipoCedula}
        onTipo={f.setTipoCedula}
        valor={f.cedula}
        onCambio={f.setCedula}
        error={f.errorCedula}
      />
      <p className="flex gap-2 text-[13px] text-muted-foreground">
        <ShieldCheck aria-hidden="true" className="size-4 shrink-0 translate-y-0.5" />
        Solo la usamos para buscarte. No mostramos ningún dato tuyo hasta que confirmes el código.
      </p>
      <CampoTrampa valor={f.sitioWeb} onCambio={f.setSitioWeb} />
    </div>
  )
}

export function VistaCodigo({ f, valor, onCambio }: { f: FlujoReserva; valor: string; onCambio: (v: string) => void }) {
  const [sinAcceso, setSinAcceso] = useState(false)
  return (
    <div className="grid gap-5">
      <Encabezado titulo="Revisa tu correo">
        Te enviamos un código de 6 dígitos a {f.codigo?.emailMascara ? <b className="font-semibold text-foreground">{f.codigo.emailMascara}</b> : 'tu correo'} y a
        tus avisos de la app Global. Vence en 10 minutos.
      </Encabezado>
      <CampoCodigo
        id="reserva-codigo"
        etiqueta="Código de 6 dígitos"
        valor={valor}
        onCambio={onCambio}
        reenviarDesde={f.codigo?.reenviarDesde ?? null}
        onReenviar={f.reenviar}
        deshabilitado={f.cargando}
      />
      {sinAcceso ? (
        <AvisoFormulario tono="info" className="grid gap-3">
          <b className="text-[15px]">¿Sin acceso al correo?</b>
          <p>
            Si tampoco ves el código en tus avisos de la app, puedes seguir sin código. Tu solicitud llegará como <b>por verificar</b> y la coordinación
            confirmará que eres tú antes de aprobarla. No cambiamos ningún dato de tu ficha.
          </p>
          <div className="flex flex-wrap gap-2">
            <BotonSistema type="button" variante="outline" onClick={() => setSinAcceso(false)}>
              Volver
            </BotonSistema>
            <BotonSistema type="button" variante="secundario" onClick={f.seguirSinCodigo}>
              Seguir sin código
            </BotonSistema>
          </div>
        </AvisoFormulario>
      ) : (
        <button
          type="button"
          onClick={() => setSinAcceso(true)}
          className="focus-ring flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left"
        >
          <span>
            <b className="block text-[15px] font-semibold text-foreground">No tengo acceso a ese correo</b>
            <span className="block text-[13px] text-muted-foreground">Ni a la app. Puedes seguir sin código.</span>
          </span>
        </button>
      )}
    </div>
  )
}

/** Identity confirmed (design 03 step 2): only the first name, never the ficha. */
export function VistaConfirmado({ f }: { f: FlujoReserva }) {
  const nombre = f.identidad?.tipo === 'token' ? f.identidad.nombre : ''
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <PuntoEstado tono="success" etiqueta="Identidad confirmada" />
        <Encabezado titulo={nombre ? `¡Hola, ${nombre}!` : '¡Hola!'}>Usamos los datos de tu ficha. No tienes que escribir nada más.</Encabezado>
      </div>
      <ContextoEdicion taller={f.taller.nombre} edicion={edicionDe(f)} />
      <p className="flex gap-2 text-[13px] text-muted-foreground">
        <Info aria-hidden="true" className="size-4 shrink-0 translate-y-0.5" />
        ¿Cambió tu teléfono o tu correo? Actualízalo en la app después de reservar.
      </p>
      {f.taller.pareja && <p className="text-[15px] text-foreground">En {f.taller.nombre} se inscriben los dos. Sigue con los datos de {f.quien}.</p>}
    </div>
  )
}

/** Without a code (no email on file, or no access to it): design 03 2a′. */
export function VistaPorVerificar({ f }: { f: FlujoReserva }) {
  const sinCorreo = f.identidad?.tipo === 'por_verificar' && f.identidad.motivo === 'sin_correo'
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <PuntoEstado tono="info" etiqueta="Por verificar" />
        <Encabezado titulo="Sigue sin código">
          {sinCorreo
            ? 'Tu ficha de Global no tiene correo, así que no podemos enviarte un código. '
            : ''}
          Tu solicitud llega a la coordinación marcada «por verificar». Te contactan para confirmar que eres tú antes de aprobarla.
        </Encabezado>
      </div>
      <ContextoEdicion taller={f.taller.nombre} edicion={edicionDe(f)} />
      <AvisoFormulario tono="info">Esto no cambia tu ficha de Global. Si tu correo o tu teléfono cambiaron, la coordinación los actualiza cuando te contacte.</AvisoFormulario>
      {f.taller.pareja && <p className="text-[15px] text-foreground">En {f.taller.nombre} se inscriben los dos. Sigue con los datos de {f.quien}.</p>}
    </div>
  )
}

/** New person (design 03 2b + 04): the ficha, and the partner in Parejas. */
export function VistaNuevo({ f }: { f: FlujoReserva }) {
  const notaGenero = f.taller.generoRequerido
    ? `${f.taller.nombre} es un taller para ${f.taller.generoRequerido === 'Femenino' ? 'mujeres' : 'hombres'}.`
    : null
  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Encabezado titulo="Aún no estás en Global">
          No encontramos la cédula <b className="font-mono font-semibold text-foreground">{formatoCedula(f.cedulaNormalizada ?? f.cedula)}</b>. Con estos datos
          creamos tu ficha y sigues con tu reserva.
        </Encabezado>
        <ContextoEdicion taller={f.taller.nombre} edicion={edicionDe(f)} />
      </div>
      <section aria-labelledby="reserva-tus-datos" className="grid gap-4">
        <h4 id="reserva-tus-datos" className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Tus datos
        </h4>
        <CamposFicha
          prefijo="reserva-tu"
          ficha={f.ficha}
          errores={f.errores}
          onCambio={f.setFicha}
          conContacto
          notaGenero={notaGenero}
          cedulaFija={formatoCedula(f.cedulaNormalizada ?? f.ficha.cedula)}
          onCambiarCedula={() => f.ir('cedula')}
        />
      </section>
      {f.taller.pareja && <SeccionPareja f={f} />}
      <CasillaConsentimiento marcada={f.aceptado} onCambio={f.setAceptado} error={f.errorAceptado} />
      <CampoTrampa valor={f.sitioWeb} onCambio={f.setSitioWeb} />
    </div>
  )
}

/** The partner step after a code or "por verificar" (Parejas). */
export function VistaPareja({ f }: { f: FlujoReserva }) {
  return (
    <div className="grid gap-6">
      <Encabezado titulo={`Los datos de ${f.quien}`}>En {f.taller.nombre} se inscriben los dos en una sola solicitud.</Encabezado>
      <SeccionPareja f={f} />
      {f.pideConsentimiento && <CasillaConsentimiento marcada={f.aceptado} onCambio={f.setAceptado} error={f.errorAceptado} />}
      <CampoTrampa valor={f.sitioWeb} onCambio={f.setSitioWeb} />
    </div>
  )
}

const VINCULOS: readonly { valor: Vinculo; etiqueta: string }[] = [
  { valor: 'matrimonio', etiqueta: 'Matrimonio' },
  { valor: 'novios', etiqueta: 'Novios' },
]

/**
 * Partner by cédula (S12): an existing person confirms with their own code
 * (or stays pending for the coordination), a new one gets a ficha without
 * having to open an account now.
 */
function SeccionPareja({ f }: { f: FlujoReserva }) {
  const p = f.pareja
  const [codigo, setCodigo] = useState('')
  const titulo = f.quien.charAt(0).toUpperCase() + f.quien.slice(1)
  return (
    <section aria-labelledby="reserva-pareja" className="grid gap-4">
      <h4 id="reserva-pareja" className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {titulo}
      </h4>
      {!f.taller.vinculo && (
        <div className="grid gap-2">
          <span className="text-sm font-medium text-foreground">¿Son matrimonio o novios?</span>
          <ControlSegmentado<Vinculo | ''>
            etiqueta="Vínculo"
            opciones={VINCULOS}
            valor={f.vinculo ?? ''}
            onCambio={(v) => v && f.setVinculo(v)}
            className="flex w-full [&>button]:min-h-[2.375rem] [&>button]:flex-1"
          />
          {f.errorVinculo && (
            <p role="alert" className="text-sm text-danger-text">
              {f.errorVinculo}
            </p>
          )}
        </div>
      )}

      {p.modo === 'buscar' && (
        <div className="flex min-w-0 items-end gap-2">
          <div className="min-w-0 flex-1">
            <CampoCedula
              id="reserva-pareja-cedula"
              etiqueta={`Cédula de ${f.quien}`}
              tipo={p.cedula.startsWith('E') ? 'E' : 'V'}
              onTipo={(t) => f.setParejaCampo({ cedula: t === 'E' ? `E${p.cedula.replace(/^E/, '')}` : p.cedula.replace(/^E/, '') })}
              valor={p.cedula.replace(/^E/, '')}
              onCambio={(v) => f.setParejaCampo({ cedula: `${p.cedula.startsWith('E') ? 'E' : ''}${v}`, error: null })}
              onEnter={f.buscarPareja}
            />
          </div>
          <BotonSistema type="button" variante="outline" onClick={f.buscarPareja} cargando={f.cargando}>
            Buscar
          </BotonSistema>
        </div>
      )}

      {p.modo === 'codigo' && (
        <div className="grid gap-3 rounded-2xl border border-border bg-card p-4">
          <FilaPareja
            icono={<UserRound className="size-5 text-muted-foreground" />}
            titulo={`Cédula ${formatoCedula(p.cedula)}`}
            detalle="Ya está en Global."
            onCambiar={f.cambiarCedulaPareja}
            sinBorde
          />
          <p className="text-[14px] text-foreground">
            {titulo} confirma con su propio código: se lo enviamos
            {p.codigo?.emailMascara ? (
              <>
                {' '}
                a <b className="font-semibold">{p.codigo.emailMascara}</b>
              </>
            ) : null}{' '}
            y a sus avisos de la app Global.
          </p>
          <CampoCodigo
            id="reserva-pareja-codigo"
            etiqueta={`Código de ${f.quien}`}
            valor={codigo}
            onCambio={setCodigo}
            reenviarDesde={p.codigo?.reenviarDesde ?? null}
            onReenviar={f.reenviarPareja}
            onEnter={() => f.verificarPareja(codigo)}
            deshabilitado={f.cargando}
          />
          <div className="flex flex-wrap gap-2">
            <BotonSistema type="button" variante="secundario" onClick={() => f.verificarPareja(codigo)} cargando={f.cargando}>
              Confirmar código
            </BotonSistema>
            <BotonSistema type="button" variante="ghost" onClick={f.parejaNoPuede}>
              No puede confirmar ahora
            </BotonSistema>
          </div>
        </div>
      )}

      {p.modo === 'confirmada' && (
        <FilaPareja
          icono={<CheckCircle2 className="size-5 text-success-text" />}
          titulo={p.nombre ? `${p.nombre} confirmó con su código` : 'Confirmó con su código'}
          detalle={`Cédula ${formatoCedula(p.cedula)}`}
          onCambiar={f.cambiarCedulaPareja}
        />
      )}

      {p.modo === 'pendiente' && (
        <div className="grid gap-3">
          <FilaPareja
            icono={<UserRound className="size-5 text-info-text" />}
            titulo={`Cédula ${formatoCedula(p.cedula)}`}
            detalle={
              p.motivoPendiente === 'sin_correo'
                ? 'Ya está en Global, pero su ficha no tiene correo para enviarle un código.'
                : 'Confirmará después: le dejamos un aviso en la app.'
            }
            onCambiar={f.cambiarCedulaPareja}
          />
          <ListaPasos
            pasos={[
              { titulo: 'Envías la solicitud', detalle: 'No mostramos sus datos aquí.' },
              { titulo: 'La coordinación confirma con los dos', detalle: 'La solicitud llega marcada «por verificar».' },
              { titulo: 'La coordinación la aprueba', detalle: 'Los dos reciben el aviso.' },
            ]}
          />
        </div>
      )}

      {p.modo === 'nueva' && (
        <div className="grid gap-4">
          <AvisoFormulario tono="info">Esta cédula no está en Global. Le creamos su ficha; puede activar su cuenta cuando quiera y ya tendrá su historial.</AvisoFormulario>
          <CamposFicha
            prefijo="reserva-pareja"
            ficha={p.ficha}
            errores={p.errores}
            onCambio={f.setParejaFicha}
            conContacto={false}
            cedulaFija={formatoCedula(p.cedula)}
            onCambiarCedula={f.cambiarCedulaPareja}
          />
        </div>
      )}

      {p.error && (
        <p role="alert" className="text-sm text-danger-text">
          {p.error}
        </p>
      )}
    </section>
  )
}

function FilaPareja({
  icono,
  titulo,
  detalle,
  onCambiar,
  sinBorde = false,
}: {
  icono: React.ReactNode
  titulo: string
  detalle: string
  onCambiar: () => void
  sinBorde?: boolean
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3', !sinBorde && 'rounded-2xl border border-border bg-card p-3')}>
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-muted">
        {icono}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[15px] font-semibold text-foreground">{titulo}</b>
        <span className="block text-[13px] text-muted-foreground">{detalle}</span>
      </span>
      <button type="button" onClick={onCambiar} className="focus-ring inline-flex min-h-11 shrink-0 items-center rounded-xl px-2 text-[15px] font-medium text-brand-text">
        Cambiar
      </button>
    </div>
  )
}
