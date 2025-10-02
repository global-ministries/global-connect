import { redirect } from 'next/navigation'

export default function RootPage({ searchParams }: { searchParams: { code?: string } }) {
  // Si hay un código en la URL, redirigir al callback para procesarlo
  if (searchParams.code) {
    redirect(`/auth/callback?code=${searchParams.code}&type=recovery`)
  }

  // Si no hay código, redirigir al login
  redirect('/login')
}