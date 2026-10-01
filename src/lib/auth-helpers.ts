// src/lib/auth-helpers.ts
export function sanitizeNext(next: string | null): string {
  if (!next || next.trim() === '') return '/dashboard'
  if (!next.startsWith('/') || next.startsWith('//')) return '/dashboard'
  try {
    const parsed = new URL(next, 'https://placeholder.internal')
    if (parsed.hostname !== 'placeholder.internal') return '/dashboard'
    const out = parsed.pathname + parsed.search
    // El parser colapsa '/..//host' (y '/.//host', '/%2e%2e//host', '/..\host') en
    // '//host': el hostname ya se validó, pero el router del cliente lee '//host'
    // como URL externa. Lo que tras normalizar sigue siendo protocol-relative, no.
    if (out.startsWith('//')) return '/dashboard'
    return out
  } catch {
    return '/dashboard'
  }
}
