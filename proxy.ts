import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decrypt } from '@/lib/session'

const publicPaths = ['/login', '/api/auth', '/api/webhooks', '/walkin-form', '/api/walkin', '/api/email-track', '/api/calls/log', '/api/calls/schedule-callback', '/api/appointments/create']

// Role-based route restrictions
const routePermissions: Record<string, string[]> = {
  '/settings': ['ADMIN'],
  '/staff': ['ADMIN', 'MANAGER'],
  '/payroll': ['ADMIN', 'MANAGER'],
  '/billing': ['ADMIN', 'MANAGER'],
  '/drafts': ['ADMIN', 'MANAGER'],
  '/marketing': ['ADMIN', 'MANAGER'],
  '/email-marketing': ['ADMIN', 'MANAGER'],
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public paths
  if (publicPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Check custom session cookie
  const sessionCookie = req.cookies.get('session')?.value
  const session = await decrypt(sessionCookie)

  // Redirect unauthenticated users to login
  if (!session) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const role = session.role as string

  // Check route-level permissions
  for (const [route, allowedRoles] of Object.entries(routePermissions)) {
    if (pathname.startsWith(route)) {
      if (!allowedRoles.includes(role)) {
        return NextResponse.redirect(new URL('/', req.url))
      }
      break
    }
  }

  // Inject user role into request headers for server components
  const response = NextResponse.next()
  response.headers.set('x-user-role', role)
  response.headers.set('x-user-id', session.id || '')
  response.headers.set('x-user-name', (session.name as string) || '')

  return response
}

export const proxyConfig = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
