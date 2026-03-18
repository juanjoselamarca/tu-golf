// src/lib/auth-helpers.ts
export function sanitizeNext(next: string | null): string {
  if (!next || next.trim() === '') return '/dashboard'
  if (!next.startsWith('/') || next.startsWith('//')) return '/dashboard'
  try {
    const parsed = new URL(next, 'https://placeholder.internal')
    if (parsed.hostname !== 'placeholder.internal') return '/dashboard'
    return parsed.pathname + parsed.search
  } catch {
    return '/dashboard'
  }
}
