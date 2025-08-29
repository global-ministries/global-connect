import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

// Refresca la sesión del usuario en cada petición
export async function middleware(request: Request) {
  const response = NextResponse.next()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => request.headers.get("cookie")?.split("; ").find(c => c.startsWith(name + "="))?.split("=")[1] ?? "",
        set: () => {},
        remove: () => {},
      }
    }
  )
  await supabase.auth.getUser()
  return response
}

export const config = {
  matcher: [
    "/((?!api|_next|static|favicon.ico|robots.txt|sitemap.xml).*)"
  ]
}
