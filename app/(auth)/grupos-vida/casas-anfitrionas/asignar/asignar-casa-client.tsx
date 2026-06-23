"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle, Home, Search } from "lucide-react"
import { asignarCasaAnfitrionaAGrupo } from "@/lib/actions/casas-anfitrionas.actions"
import { useNotificaciones } from "@/hooks/use-notificaciones"
import { BadgeSistema, BotonSistema, InputSistema, SelectSistema, TarjetaSistema, TextoSistema, TituloSistema } from "@/components/ui/sistema-diseno"

export type AssignmentGroupOption = {
  id: string
  name: string
  details: string
}

export type AssignmentCasaOption = {
  id: string
  name: string
  details: string
}

const diacriticRegex = /[\u0300-\u036f]/g

type AsignarCasaAnfitrionaClientProps = {
  casas: AssignmentCasaOption[]
  grupos: AssignmentGroupOption[]
  initialGroupId?: string
}

export function AsignarCasaAnfitrionaClient({ casas, grupos, initialGroupId }: AsignarCasaAnfitrionaClientProps) {
  const [groupId, setGroupId] = useState(() => getInitialGroupId(initialGroupId, grupos))
  const [casaId, setCasaId] = useState("")
  const [groupSearch, setGroupSearch] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const syncedInitialGroupId = useRef(getInitialGroupId(initialGroupId, grupos))
  const submitInFlight = useRef(false)
  const router = useRouter()
  const toast = useNotificaciones()
  const canSubmit = Boolean(groupId && casaId && !isSubmitting)
  const normalizedGroupSearch = normalizeSearchText(groupSearch)
  const filteredGroups = normalizedGroupSearch
    ? grupos.filter((grupo) => matchesGroupSearch(grupo, normalizedGroupSearch))
    : grupos
  const selectableGroups = includeSelectedGroup(filteredGroups, grupos, groupId)
  const hasGroupSearch = normalizedGroupSearch.length > 0
  const hasNoGroupSearchMatches = hasGroupSearch && filteredGroups.length === 0
  const groupSelectPlaceholder = getGroupSelectPlaceholder(grupos.length, hasNoGroupSearchMatches)
  const groupSummaryEmpty = hasNoGroupSearchMatches
    ? "No hay grupos que coincidan con la búsqueda."
    : "No hay grupos activos sin Casa Anfitriona."

  useEffect(() => {
    const nextInitialGroupId = getInitialGroupId(initialGroupId, grupos)
    const previousInitialGroupId = syncedInitialGroupId.current
    syncedInitialGroupId.current = nextInitialGroupId

    setGroupId((currentGroupId) => {
      if (nextInitialGroupId && previousInitialGroupId !== nextInitialGroupId) return nextInitialGroupId
      if (!nextInitialGroupId && previousInitialGroupId && currentGroupId === previousInitialGroupId) return ""
      return currentGroupId
    })
  }, [initialGroupId, grupos])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitInFlight.current || !groupId || !casaId) return

    if (!grupos.some((grupo) => grupo.id === groupId) || !casas.some((casa) => casa.id === casaId)) {
      const message = "La selección ya no está disponible. Actualiza la cola y vuelve a intentarlo."
      setSuccessMessage("")
      setFormError(message)
      toast.error(message)
      return
    }

    submitInFlight.current = true
    setIsSubmitting(true)
    setFormError("")
    setSuccessMessage("")
    try {
      const result = await asignarCasaAnfitrionaAGrupo({ groupId, casaId })
      if (result.success) {
        const message = "Asignación guardada. El grupo salió de la cola de grupos sin Casa Anfitriona."
        setGroupId("")
        setCasaId("")
        setSuccessMessage(message)
        toast.success("Casa Anfitriona asignada correctamente")
        router.refresh()
        return
      }
      const message = withRetryGuidance(result.error ?? "No pudimos asignar la Casa Anfitriona")
      setFormError(message)
      toast.error(message)
    } catch {
      const message = "No pudimos asignar la Casa Anfitriona. Actualiza la cola y vuelve a intentarlo."
      setFormError(message)
      toast.error(message)
    } finally {
      submitInFlight.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
      <TarjetaSistema className="p-4 sm:p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <TituloSistema nivel={3}>Seleccionar asignación</TituloSistema>
            <TextoSistema variante="sutil" tamaño="sm">
              La asignación se valida en el servidor. Solo se listan Casas visibles, aprobadas y activas.
            </TextoSistema>
          </div>

          <InputSistema
            label="Buscar grupo"
            icono={Search}
            placeholder="Busca por grupo, líderes, segmento o temporada"
            value={groupSearch}
            onChange={(event) => setGroupSearch(event.target.value)}
            disabled={grupos.length === 0 || isSubmitting}
          />

          <SelectSistema
            label="Grupo de Vida"
            opciones={selectableGroups.map((grupo) => ({ valor: grupo.id, etiqueta: formatAssignmentOptionLabel(grupo) }))}
            placeholder={groupSelectPlaceholder}
            value={groupId}
            onValueChange={(value) => {
              setGroupId(value)
              setFormError("")
            }}
            disabled={selectableGroups.length === 0 || isSubmitting}
          />

          <SelectSistema
            label="Casa Anfitriona"
            opciones={casas.map((casa) => ({ valor: casa.id, etiqueta: formatAssignmentOptionLabel(casa) }))}
            placeholder={casas.length > 0 ? "Selecciona una Casa..." : "No hay Casas aprobadas disponibles"}
            value={casaId}
            onValueChange={(value) => {
              setCasaId(value)
              setFormError("")
            }}
            disabled={casas.length === 0 || isSubmitting}
          />

          {formError && (
            <div role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-400">
              {formError}
            </div>
          )}

          {successMessage && (
            <div role="status" className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
              {successMessage}
            </div>
          )}

          <BotonSistema type="submit" icono={CheckCircle} cargando={isSubmitting} disabled={!canSubmit}>
            Asignar Casa Anfitriona
          </BotonSistema>
        </form>
      </TarjetaSistema>

      <div className="space-y-4">
        <AssignmentSummaryCard title="Grupos en cola" empty={groupSummaryEmpty} items={filteredGroups} />
        <AssignmentSummaryCard title="Casas disponibles" empty="No hay Casas aprobadas y activas disponibles." items={casas} />
        <TarjetaSistema variante="outlined" className="p-4">
          <div className="flex items-start gap-3">
            <Home className="mt-0.5 h-4 w-4 text-orange-500" aria-hidden="true" />
            <TextoSistema variante="sutil" tamaño="sm">
              Para una Casa nueva, regístrala primero. Cuando esté aprobada, vuelve a esta cola para asignarla al grupo.
            </TextoSistema>
          </div>
        </TarjetaSistema>
      </div>
    </div>
  )
}

function getInitialGroupId(initialGroupId: string | undefined, grupos: AssignmentGroupOption[]): string {
  if (!initialGroupId) return ""
  return grupos.some((grupo) => grupo.id === initialGroupId) ? initialGroupId : ""
}

function formatAssignmentOptionLabel(option: AssignmentGroupOption | AssignmentCasaOption): string {
  return `${option.name} — ${option.details}`
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(diacriticRegex, "").toLowerCase().trim()
}

function matchesGroupSearch(group: AssignmentGroupOption, normalizedSearch: string): boolean {
  const haystack = normalizeSearchText(`${group.name} ${group.details}`)
  return normalizedSearch.split(/\s+/).every((token) => haystack.includes(token))
}

function includeSelectedGroup(
  filteredGroups: AssignmentGroupOption[],
  allGroups: AssignmentGroupOption[],
  selectedGroupId: string
): AssignmentGroupOption[] {
  if (!selectedGroupId || filteredGroups.some((grupo) => grupo.id === selectedGroupId)) return filteredGroups

  const selectedGroup = allGroups.find((grupo) => grupo.id === selectedGroupId)
  return selectedGroup ? [selectedGroup, ...filteredGroups] : filteredGroups
}

function getGroupSelectPlaceholder(totalGroups: number, hasNoGroupSearchMatches: boolean): string {
  if (totalGroups === 0) return "No hay grupos pendientes"
  if (hasNoGroupSearchMatches) return "No hay coincidencias"
  return "Selecciona un grupo..."
}

function withRetryGuidance(error: string): string {
  return error.toLowerCase().includes("actualiza") ? error : `${error} Actualiza la cola y vuelve a intentarlo.`
}

function AssignmentSummaryCard({ empty, items, title }: { empty: string; items: Array<AssignmentGroupOption | AssignmentCasaOption>; title: string }) {
  return (
    <TarjetaSistema className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <TituloSistema nivel={4}>{title}</TituloSistema>
        <BadgeSistema variante="info" tamaño="sm">{items.length}</BadgeSistema>
      </div>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl bg-muted/50 p-3">
              <div className="text-sm font-semibold text-foreground">{item.name}</div>
              <TextoSistema variante="sutil" tamaño="sm">{item.details}</TextoSistema>
            </div>
          ))}
        </div>
      ) : (
        <TextoSistema variante="sutil" tamaño="sm">{empty}</TextoSistema>
      )}
    </TarjetaSistema>
  )
}
