import { Suspense } from "react"
import ResetPasswordForm from "./ResetPasswordForm"

export const dynamic = 'force-dynamic'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <ResetPasswordForm />
    </Suspense>
  )
}
