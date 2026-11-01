'use client'

/**
 * The sections of the one-screen registration, the same in both modes
 * (prototypes 01 and 04): Tú / Representante · Tus niños · ¿Quién los retira?
 * · Para después. The public page folds complete sections; the desk keeps
 * them open and adds its own slots (a known parent, the duplicate check, the
 * spouse, the ficha extras).
 */
import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'

import { BotonSistema, InputSistema } from '@/components/ui/sistema-diseno'
import type { OcupacionSalon } from '@/lib/platform/ninos/checkin-vista'
import type { SalonNivel } from '@/lib/platform/ninos/nivel'
import { idRapido, personasRetiran, resumenSeccion, type ModoRegistro } from '@/lib/platform/ninos/registro-rapido'

import { CamposPadre } from './campos-padre'
import { Eleccion, SeccionRapida, siNoValor } from './piezas'
import { CamposRetiran, ParaDespues } from './retiran-y-despues'
import { TarjetaNino } from './tarjeta-nino'
import type { FormularioRapido } from './use-formulario-rapido'

type Props = {
  form: FormularioRapido
  modo: ModoRegistro
  hoy: string
  campus?: readonly { id: string; nombre: string }[]
  salones: readonly SalonNivel[]
  ocupacion?: ReadonlyMap<string, OcupacionSalon>
  maximoHijos?: number
  maximoAutorizados?: number
  /** Desk: replaces the parent fields (an existing or confirmed parent). */
  padreConocido?: ReactNode
  /** Desk: under the phone (the duplicate check and its matches). */
  debajoTelefono?: ReactNode
  /** Desk: between the children and the pickup people (the spouse). */
  antesDeRetiran?: ReactNode
  /** Desk: the content of "Para después" (cédula, ficha extras). */
  despues?: ReactNode
}

export function SeccionesRegistro(props: Props) {
  const { form, modo, hoy, salones } = props
  const { datos, errores, contexto } = form
  const pub = modo === 'publico'
  const seccion = (s: 'tu' | 'ninos' | 'retiran', primerCampo: string) => ({
    completa: form.completa(s),
    plegada: form.plegada(s),
    resumen: resumenSeccion(datos, s, contexto),
    onEditar: () => form.editar(s, primerCampo),
    onSalir: () => form.salir(s),
  })
  const lleno = props.maximoHijos !== undefined && datos.hijos.length >= props.maximoHijos

  return (
    <>
      <SeccionRapida id="rr-tu" numero={1} titulo={pub ? 'Tú' : 'Representante'} editar="Editar tus datos" {...seccion('tu', idRapido.padre('nombre'))}>
        {props.padreConocido ?? (
          <CamposPadre
            modo={modo}
            padre={datos.padre}
            errores={errores}
            onPadre={form.setPadre}
            campus={props.campus}
            campusId={datos.campusId}
            onCampus={(campusId) => form.setDatos((d) => ({ ...d, campusId }))}
            debajoTelefono={props.debajoTelefono}
          />
        )}
      </SeccionRapida>

      <SeccionRapida
        id="rr-ninos"
        numero={2}
        titulo={pub ? 'Tus niños' : 'Niños'}
        ayuda={pub ? 'Con la fecha de nacimiento sabemos a qué salón va cada uno.' : 'El apellido se copia del representante.'}
        editar="Editar tus niños"
        {...seccion('ninos', idRapido.hijo(0, 'nombre'))}
      >
        {datos.hijos.map((h, i) => (
          <TarjetaNino
            key={i}
            indice={i}
            hijo={h}
            modo={modo}
            hoy={hoy}
            errores={errores}
            salones={salones}
            ocupacion={props.ocupacion}
            puedeQuitar={datos.hijos.length > 1}
            onCambiar={(c) => form.setHijo(i, c)}
            onFecha={(f) => form.setFecha(i, f)}
            onQuitar={() => form.quitarHijo(i)}
          />
        ))}
        {!lleno && (
          <BotonSistema
            id={idRapido.agregarHijo}
            type="button"
            variante="outline"
            icono={Plus}
            className="w-full sm:w-auto sm:justify-self-start"
            onClick={() => {
              form.agregarHijo()
              form.enfocarLuego(idRapido.hijo(datos.hijos.length, 'nombre'))
            }}
          >
            Agregar otro niño
          </BotonSistema>
        )}
      </SeccionRapida>

      {props.antesDeRetiran}

      <SeccionRapida
        id="rr-retiran"
        numero={3}
        titulo={pub ? '¿Quién los retira?' : 'Pueden retirar'}
        ayuda="Solo entregamos a los niños a estas personas, con el código de retiro."
        editar="Editar quién los retira"
        {...seccion('retiran', idRapido.autorizado(0))}
      >
        <CamposRetiran
          personas={personasRetiran(datos, contexto)}
          autorizados={datos.autorizados}
          errores={errores}
          maximo={props.maximoAutorizados}
          etiquetaRelacion={pub ? '¿Qué es de tus niños? (opcional)' : 'Relación (opcional)'}
          onCambiar={(i, campo, valor) => form.setAutorizados((as) => as.map((a, j) => (j === i ? { ...a, [campo]: valor } : a)))}
          onAgregar={() => {
            form.setAutorizados((as) => [...as, { nombre: '', telefono: '', relacion: '' }])
            form.enfocarLuego(idRapido.autorizado(datos.autorizados.length))
          }}
          onQuitar={(i) => form.setAutorizados((as) => as.filter((_, j) => j !== i))}
        />
      </SeccionRapida>

      <ParaDespues
        abierto={form.despuesAbierto}
        onAbierto={form.setDespuesAbierto}
        contenido={pub ? 'Correo para tu cuenta, cédula, fotos' : 'Cédula, grado o nivel, merienda, pañal, fotos, hábitos, notas'}
      >
        {props.despues ?? (
          <>
            <InputSistema
              id={idRapido.padre('email')}
              label="Tu correo (opcional)"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="maria@correo.com"
              value={datos.padre.email}
              onChange={(e) => form.setPadre('email', e.target.value)}
              error={errores[idRapido.padre('email')]}
            />
            <p className="-mt-2 text-sm text-muted-foreground">Te enviamos el enlace para crear tu cuenta cuando confirmemos en la mesa.</p>
            <InputSistema
              id={idRapido.padre('cedula')}
              label="Cédula (opcional)"
              inputMode="numeric"
              placeholder="Solo números"
              className="font-mono tabular-nums"
              aria-describedby="rr-cedula-ayuda"
              value={datos.padre.cedula}
              onChange={(e) => form.setPadre('cedula', e.target.value)}
            />
            <p id="rr-cedula-ayuda" className="-mt-2 text-sm text-muted-foreground">
              Si la escribes, el equipo puede encontrarte y no registrarte dos veces.
            </p>
            <Eleccion
              id="rr-fotos"
              pregunta="¿Autorizas fotos de tus niños en las actividades?"
              nombre="¿Autorizas fotos de tus niños en las actividades?"
              opciones={[
                { valor: 'no', etiqueta: 'No' },
                { valor: 'si', etiqueta: 'Sí' },
              ]}
              valor={siNoValor(datos.fotos)}
              onCambio={(v) => form.setDatos((d) => ({ ...d, fotos: v === 'si' }))}
            />
            <p className="text-sm text-muted-foreground">Grado, merienda y pañal también se completan en la mesa o desde tu cuenta.</p>
          </>
        )}
      </ParaDespues>
    </>
  )
}
