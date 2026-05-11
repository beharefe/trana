import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") ?? ""
  const { pathname } = request.nextUrl

  if (hostname === "docs.trana.so" && !pathname.startsWith("/docs")) {
    const url = request.nextUrl.clone()
    url.pathname = pathname === "/" ? "/docs" : `/docs${pathname}`
    return NextResponse.rewrite(url)
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
}
