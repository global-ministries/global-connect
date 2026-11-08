'use client'

/**
 * DPS › Programación — "Nueva serie" (the `dialog#dlg` of
 * prototipos/planificacion-dps/04-programacion-anual-hoja.html): the 420px
 * dialog of the planning style on `ui/dialog`. Name, first Sunday
 * (suggested: the Sunday after the year's last series Sunday) and weeks;
 * the button says the result ("Crear 4 domingos"). dps_serie_crear creates
 * the series and its Sundays one week apart, attaching a Sunday that has a
 * plan without a series; the special days in between are other plans and
 * stay. Before sending it warns about the Sundays another series already
 * holds and about a date that is not a Sunday; the RPC has the last word
 * (its refusal shows inside). The color is picked to differ from the
 * neighbouring series. An optional cover (L13) is uploaded afterwards on
 * the series' first plan with cambiarPortadaDps; if that fails the series
 * stays and a toast says why. While it creates, it cannot be closed.
 */
import { useRef, useState, type FormEvent, type ReactElement } from 'react'
import { ImageUp } from 'lucide-react'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema, InputSistema } from '@/components/ui/sistema-diseno'
import { CLASE_DIALOGO, CLASE_TITULO_DIALOGO } from '@/components/grupos-vida/planner/estilo-planner'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { cambiarPortadaDps } from '@/lib/actions/dps-plan.actions'
import { crearSerieDps } from '@/lib/actions/dps-programacion.actions'
import { MENSAJE_IMAGEN } from '@/lib/platform/dps/errores'
import { choquesSerie, colorNuevaSerie, esDomingo, fechaCorta, primerDomingoSugerido, type PlanHoja } from '@/lib/platform/dps/programacion'

/** The dps-series bucket (jpeg / png / webp, 5 MB); the server action checks again, by the bytes. */
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGEN = 5 * 1024 * 1024
const MAX_SEMANAS = 12

export interface DialogoNuevaSerieProps {
  readonly planes: readonly PlanHoja[]
  readonly anio: number
  readonly hoy: string
  readonly onCerrar: () => void
  /** The series exists: the parent reloads the year. */
  readonly onCreada: (nombre: string, semanas: number) => void
}

export function DialogoNuevaSerie({ planes, anio, hoy, onCerrar, onCreada }: DialogoNuevaSerieProps): ReactElement {
  const toast = useNotificaciones()
  const [nombre, setNombre] = useState('')
  const [primer, setPrimer] = useState(() => primerDomingoSugerido(planes, hoy, anio))
  const [semanasTexto, setSemanasTexto] = useState('4')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const archivoRef = useRef<HTMLInputElement>(null)

  const semanas = Number(semanasTexto)
  const semanasValidas = Number.isInteger(semanas) && semanas >= 1 && semanas <= MAX_SEMANAS
  const domingo = esDomingo(primer)
  const choques = domingo && semanasValidas ? choquesSerie(planes, primer, semanas) : []
  const puedeCrear = nombre.trim() !== '' && domingo && semanasValidas && choques.length === 0 && !enviando
  const aviso = !domingo
    ? 'Elige un domingo.'
    : choques.length > 0
      ? `El domingo ${fechaCorta(choques[0].fecha)} ya es de «${choques[0].serie}»${choques.length > 1 ? ` (y ${choques.length - 1} más)` : ''}. Elige otro primer domingo o menos semanas.`
      : null

  function elegirArchivo(lista: FileList | null): void {
    const elegido = lista?.[0] ?? null
    if (archivoRef.current) archivoRef.current.value = ''
    if (!elegido) return
    if (!TIPOS_IMAGEN.includes(elegido.type) || elegido.size === 0 || elegido.size > MAX_IMAGEN) {
      setError(MENSAJE_IMAGEN)
      return
    }
    setError(null)
    setArchivo(elegido)
  }

  async function crear(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!puedeCrear) return
    setEnviando(true)
    setError(null)
    const r = await crearSerieDps({ nombre: nombre.trim(), primerDomingo: primer, semanas, color: colorNuevaSerie(planes, primer, semanas) })
    if (!r.ok) {
      setEnviando(false)
      setError(r.message)
      return
    }
    const primerPlan = r.data.planIds[0]
    if (archivo && primerPlan) {
      const datos = new FormData()
      datos.set('planId', primerPlan)
      datos.set('imagen', archivo)
      const portada = await cambiarPortadaDps(datos)
      if (!portada.ok) toast.error(`La serie se creó, pero la portada no: ${portada.message}`)
    }
    setEnviando(false)
    onCreada(nombre.trim(), semanas)
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !enviando && onCerrar()}>
      <DialogContent className={CLASE_DIALOGO} showCloseButton={false}>
        <form onSubmit={(e) => void crear(e)} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle className={CLASE_TITULO_DIALOGO}>Nueva serie</DialogTitle>
            <DialogDescription>Creamos sus domingos en la hoja; los días especiales que caigan en medio se respetan.</DialogDescription>
          </DialogHeader>
          <InputSistema label="Nombre" value={nombre} maxLength={120} autoComplete="off" onChange={(e) => setNombre(e.target.value)} />
          <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2.5">
            <InputSistema label="Primer domingo" type="date" value={primer} onChange={(e) => setPrimer(e.target.value)} />
            <InputSistema
              label="Semanas"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_SEMANAS}
              value={semanasTexto}
              className="font-mono tabular-nums"
              onChange={(e) => setSemanasTexto(e.target.value)}
            />
          </div>
          {aviso && <p className="text-[13px] text-warning-text">{aviso}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={archivoRef}
              type="file"
              accept={TIPOS_IMAGEN.join(',')}
              aria-label="Portada de la serie (opcional)"
              hidden
              onChange={(e) => elegirArchivo(e.target.files)}
            />
            <BotonSistema type="button" variante="outline" tamaño="sm" icono={ImageUp} disabled={enviando} onClick={() => archivoRef.current?.click()}>
              {archivo ? 'Cambiar portada' : 'Agregar portada'}
            </BotonSistema>
            <span className="min-w-0 truncate text-xs text-muted-foreground">{archivo ? archivo.name : 'Opcional: JPG, PNG o WebP de hasta 5 MB'}</span>
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          )}
          <DialogFooter>
            <BotonSistema type="button" variante="ghost" tamaño="sm" disabled={enviando} onClick={onCerrar}>
              Cancelar
            </BotonSistema>
            <BotonSistema type="submit" tamaño="sm" cargando={enviando} disabled={!puedeCrear}>
              Crear <span className="font-mono tabular-nums">{semanasValidas ? semanas : 0}</span> {semanas === 1 ? 'domingo' : 'domingos'}
            </BotonSistema>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
