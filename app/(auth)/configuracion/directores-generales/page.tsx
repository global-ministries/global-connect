import { redirect } from "next/navigation"

/**
 * The general directors moved to /grupos-vida/directores (the "Directores"
 * page of Grupos de Vida). The old route only forwards, so existing links and
 * bookmarks keep working; the destination checks the role.
 */
export default function DirectoresGeneralesPage() {
  redirect("/grupos-vida/directores")
}
