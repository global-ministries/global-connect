'use client'

import { Pencil } from 'lucide-react'

import { BotonSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { resumenAlergias, textoEdad, textoOtrosPadres, type MiHijo } from '@/lib/platform/ninos/mis-hijos'

type Props = {
  hijo: MiHijo
  onEditar: () => void
}

/** One child in "Mis hijos": name, age, allergies and the other parents' names. */
export function TarjetaMiHijo({ hijo, onEditar }: Props) {
  const edad = textoEdad(hijo.edad)
  const alergias = resumenAlergias(hijo.alergias)
  const otros = textoOtrosPadres(hijo.otros_padres)

  return (
    <TarjetaSistema data-testid="mi-hijo" className="h-full space-y-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-[15px] font-semibold text-foreground">
            {hijo.nombre} {hijo.apellido}
          </p>
          {edad && (
            <TextoSistema variante="sutil" tamaño="sm">
              {edad}
            </TextoSistema>
          )}
        </div>
        <BotonSistema
          type="button"
          variante="outline"
          tamaño="sm"
          icono={Pencil}
          className="shrink-0"
          aria-label={`Editar datos de ${hijo.nombre}`}
          onClick={onEditar}
        >
          Editar
        </BotonSistema>
      </div>
      {alergias ? (
        <p className="break-words text-sm font-medium text-destructive">Alergias: {alergias}</p>
      ) : (
        <TextoSistema variante="sutil" tamaño="sm">
          Sin alergias registradas
        </TextoSistema>
      )}
      {otros && (
        <TextoSistema variante="sutil" tamaño="sm" className="break-words">
          Otros representantes: {otros}
        </TextoSistema>
      )}
    </TarjetaSistema>
  )
}
