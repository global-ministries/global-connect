'use client'

/** Step 6 (review) and the confirmation screen of the public registration wizard. */
import type { ReactNode } from 'react'
import { CheckCircle2, Pencil } from 'lucide-react'

import { TituloSistema, TextoSistema } from '@/components/ui/sistema-diseno'

import { autorizadoEnBlanco, type DatosRegistro, type Paso } from './logica'

function fechaLegible(iso: string): string {
  const [a, m, d] = iso.split('-')
  return a && m && d ? `${d}/${m}/${a}` : iso
}

function Seccion({ titulo, editar, onEditar, children }: { titulo: string; editar: string; onEditar: () => void; children: ReactNode }) {
  return (
    <section className="space-y-1 border-b border-border py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground">{titulo}</h3>
        <button
          type="button"
          aria-label={editar}
          onClick={onEditar}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-orange-600 hover:bg-orange-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-orange-400"
        >
          <Pencil className="h-4 w-4" aria-hidden />
          Editar
        </button>
      </div>
      <div className="space-y-1 text-base text-foreground">{children}</div>
    </section>
  )
}

const siTexto = (tiene: boolean | null, texto: string) => (tiene ? texto.trim() : 'No')

export function PasoRevisar({ datos, campus, onEditar }: { datos: DatosRegistro; campus?: string; onEditar: (p: Paso) => void }) {
  const { padre, hijos } = datos
  const autorizados = datos.autorizados.filter((a) => !autorizadoEnBlanco(a))
  return (
    <div className="rounded-2xl border border-border bg-card/60 px-4 shadow-sm sm:px-5">
      <Seccion titulo="Tus datos" editar="Editar tus datos" onEditar={() => onEditar(1)}>
        <p className="font-medium">
          {padre.nombre.trim()} {padre.apellido.trim()}
        </p>
        <p>{padre.telefono}</p>
        {padre.cedula.trim() && <p>Cédula {padre.cedula.trim()}</p>}
        {campus && <p className="text-sm text-muted-foreground">Campus {campus}</p>}
      </Seccion>
      <Seccion titulo="Tus niños" editar="Editar tus niños" onEditar={() => onEditar(2)}>
        {hijos.map((h, i) => (
          <p key={i}>
            <span className="font-medium">
              {h.nombre.trim()} {h.apellido.trim()}
            </span>{' '}
            · {h.genero === 'Femenino' ? 'Niña' : 'Niño'} · {fechaLegible(h.fechaNacimiento)}
          </p>
        ))}
      </Seccion>
      <Seccion titulo="Salud" editar="Editar salud" onEditar={() => onEditar(3)}>
        {hijos.map((h, i) => (
          <p key={i}>
            <span className="font-medium">{h.nombre.trim()}:</span> alergias: {siTexto(h.tieneAlergias, h.alergias)}; necesidades especiales:{' '}
            {siTexto(h.tieneNecesidades, h.necesidadesEspeciales)}
          </p>
        ))}
      </Seccion>
      <Seccion titulo="Quién más puede retirarlos" editar="Editar personas autorizadas" onEditar={() => onEditar(4)}>
        {autorizados.length === 0 ? (
          <p className="text-muted-foreground">Solo tú</p>
        ) : (
          autorizados.map((a, i) => (
            <p key={i}>
              {a.nombre.trim()}
              {a.relacion.trim() && ` (${a.relacion.trim()})`}
            </p>
          ))
        )}
      </Seccion>
      <Seccion titulo="Tu cuenta" editar="Editar tu cuenta" onEditar={() => onEditar(5)}>
        <p className={padre.email.trim() ? '' : 'text-muted-foreground'}>{padre.email.trim() || 'Sin correo'}</p>
      </Seccion>
    </div>
  )
}

export function RegistroExito({ conCorreo }: { conCorreo: boolean }) {
  return (
    <div role="status" className="space-y-5 rounded-3xl border border-success/20 bg-card/70 p-6 text-center shadow-lg sm:p-8">
      <CheckCircle2 className="mx-auto h-16 w-16 text-success" aria-hidden />
      <TituloSistema nivel={1}>¡Listo, gracias!</TituloSistema>
      <TextoSistema tamaño="lg">Acércate a la mesa de check-in con tus niños; solo confirmamos tus datos.</TextoSistema>
      {conCorreo && (
        <TextoSistema variante="sutil">Te enviaremos un correo para crear tu cuenta cuando confirmemos en la mesa.</TextoSistema>
      )}
    </div>
  )
}
