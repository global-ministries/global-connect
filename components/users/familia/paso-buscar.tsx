'use client'

/**
 * "Sí, buscarlo" (S15 decisions 4 and 11; prototype `cuerpoBuscar`): the
 * masked search in the caller's campus (3 letters, up to 8 results with
 * name and campus only), "Agregarlo sin cuenta" when nothing matches, and,
 * for a homonym, one datum only a relative knows (birth day + month or the
 * last 4 cédula digits) that the server answers with match / no match.
 */
import { AlertCircle, Check, Search, UserPlus } from 'lucide-react'
import type { ReactElement } from 'react'

import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { BotonSistema, InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { MIN_LETRAS_BUSQUEDA, letrasDe, nombreCandidato } from '@/lib/platform/usuarios/familia-vista'
import { cn } from '@/lib/utils'

import { AvatarFicha } from '../ficha/partes-ficha'

import type { HojaFamiliar } from './use-hoja-familiar'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const OPCIONES_DIA = Array.from({ length: 31 }, (_, i) => ({ valor: String(i + 1), etiqueta: String(i + 1) }))
const OPCIONES_MES = MESES.map((m, i) => ({ valor: String(i + 1), etiqueta: m }))

export const CLASE_PULSADO = 'aria-pressed:border-brand aria-pressed:bg-brand-tint'

function MensajeError({ id, texto }: { readonly id?: string; readonly texto: string }): ReactElement {
  return (
    <p id={id} role="alert" className="flex items-start gap-1.5 text-[13px] leading-[1.35] text-danger-text">
      <AlertCircle aria-hidden="true" className="mt-px size-4 shrink-0" />
      <span>{texto}</span>
    </p>
  )
}

function Verificacion({ h }: { readonly h: HojaFamiliar }): ReactElement {
  return (
    <section aria-labelledby="mf-verif-t" className="grid gap-3 rounded-xl border border-border p-3.5">
      <div>
        <p id="mf-verif-t" className="text-[15px] font-semibold text-foreground">Hay varias personas con este nombre</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Para saber que es tu familiar, dinos un dato que solo un familiar sabe. Solo te diremos si coincide; no se lo mostramos a nadie.
        </p>
      </div>
      <ControlSegmentado
        etiqueta="Dato para confirmar"
        opciones={[{ valor: 'fecha', etiqueta: 'Su cumpleaños' }, { valor: 'cedula', etiqueta: 'Su cédula' }]}
        valor={h.verif.modo}
        onCambio={(modo) => h.cambiarVerif({ modo })}
        className="justify-self-start"
      />
      {h.verif.modo === 'fecha' ? (
        <div className="grid grid-cols-2 gap-3">
          <SelectSistema label="Día" placeholder="Día" opciones={OPCIONES_DIA} value={h.verif.dia} onValueChange={(dia) => h.cambiarVerif({ dia })} />
          <SelectSistema label="Mes" placeholder="Mes" opciones={OPCIONES_MES} value={h.verif.mes} onValueChange={(mes) => h.cambiarVerif({ mes })} />
        </div>
      ) : (
        <InputSistema
          label="Últimos 4 dígitos de su cédula"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={h.verif.ultimos4}
          onChange={(e) => h.cambiarVerif({ ultimos4: e.target.value.replace(/\D/g, '') })}
        />
      )}
      {h.errorVerif && <MensajeError texto={h.errorVerif} />}
      {h.noCoincide && (
        <div className="grid gap-2">
          {!h.errorVerif && <MensajeError texto="Ese dato no coincide con esta persona." />}
          <p className="text-[13px] text-muted-foreground">Si estás seguro de que es tu familiar, agrégalo sin cuenta y tu campus lo revisa.</p>
          <BotonSistema type="button" variante="outline" tamaño="sm" icono={UserPlus} onClick={h.sinCuentaDesdeCandidato} className="justify-self-start">
            Agregarlo sin cuenta
          </BotonSistema>
        </div>
      )}
      <BotonSistema type="button" variante="outline" tamaño="sm" cargando={h.verificando} onClick={() => void h.verificar()} className="justify-self-start">
        Comprobar
      </BotonSistema>
    </section>
  )
}

export function PasoBuscar({ h, campus }: { readonly h: HojaFamiliar; readonly campus: string | null }): ReactElement {
  const r = h.resultados
  const corto = letrasDe(h.q) < MIN_LETRAS_BUSQUEDA
  const vacio = r !== null && r.length === 0 && !h.error
  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <InputSistema
          label={campus ? `Busca por nombre en Campus ${campus}` : 'Busca por nombre en tu campus'}
          type="search"
          icono={Search}
          placeholder="Nombre y apellido"
          autoComplete="off"
          autoFocus
          value={h.q}
          onChange={(e) => h.cambiarQ(e.target.value)}
          aria-describedby="mf-q-m"
        />
        {!vacio && (
          <p id="mf-q-m" className="text-[13px] text-muted-foreground">
            Escribe al menos 3 letras. Solo verás nombre y campus, nunca teléfono ni cédula.
          </p>
        )}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {h.buscando ? 'Buscando' : r === null || corto ? '' : `${r.length} ${r.length === 1 ? 'resultado' : 'resultados'}`}
      </p>
      {r && r.length > 0 && (
        <ul aria-label="Resultados" className="grid">
          {r.map((c) => {
            const pulsado = h.elegido?.token === c.token
            return (
              <li key={c.token} className="[&+&]:border-t [&+&]:border-border/60">
                <button
                  type="button"
                  aria-pressed={pulsado}
                  onClick={() => h.elegir(c)}
                  className={cn('focus-ring flex min-h-[60px] w-full items-center gap-3 rounded-xl px-1 py-2 text-left transition-colors hover:bg-accent', pulsado && 'bg-brand-tint')}
                >
                  <AvatarFicha nombre={c.nombres} apellido={c.primerApellido} fotoUrl={null} />
                  <span className="grid min-w-0 flex-1 gap-px">
                    <span className="truncate text-[15px] font-semibold text-foreground">{nombreCandidato(c)}</span>
                    <span className="text-[13px] text-muted-foreground">Campus {c.campus}</span>
                  </span>
                  {pulsado && <Check aria-hidden="true" className="size-4 shrink-0 text-brand-text" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {vacio && (
        <EstadoVacioSistema
          icono={Search}
          className="py-5"
          titulo={`No encontramos «${h.q.trim()}» en tu campus`}
          subtitulo="Revisa cómo se escribe o agrégalo sin cuenta."
          accion={
            <BotonSistema type="button" variante="outline" tamaño="sm" icono={UserPlus} onClick={h.sinCuentaDesdeBusqueda}>
              Agregarlo sin cuenta
            </BotonSistema>
          }
        />
      )}
      {h.elegido && h.necesitaVerificar && <Verificacion h={h} />}
      {h.elegido?.homonimo && !h.necesitaVerificar && <PuntoEstado tono="success" etiqueta="Dato confirmado" />}
    </div>
  )
}
