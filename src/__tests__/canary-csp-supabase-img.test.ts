/**
 * TEST CANARIO — CSP debe permitir <img> desde Supabase Storage
 *
 * Inbox 99500ba6 + 35f4ee89 (27-may-2026): la foto de portada subida al bucket
 * `tournament-covers` se guardaba bien en BD y el URL público funcionaba (curl
 * → 200), pero el browser mostraba icono de imagen rota tanto en el wizard
 * como en el viewer público.
 *
 * Root cause: `next.config.js` definía el header
 *   `Content-Security-Policy: ...; img-src 'self' data: blob: https://images.unsplash.com https://flagcdn.com https://lh3.googleusercontent.com; ...`
 * — sin `https://*.supabase.co`. El browser bloqueaba silenciosamente todas
 * las <img> con `src` apuntando a Supabase Storage.
 *
 * Este canario verifica:
 * 1. `img-src` directive del CSP incluye `https://*.supabase.co`.
 * 2. `connect-src` también lo incluye (regresión separada — fetch/XHR a
 *    Supabase debe funcionar igual).
 * 3. `images.remotePatterns` permite Supabase para que `next/image` funcione
 *    si en el futuro migrasemos del `<img>` plain.
 *
 * Si alguno falla, el browser bloqueará portadas de torneos (y cualquier
 * imagen futura servida desde Storage) sin error visible — solo icono roto
 * que el usuario reporta al inbox una y otra vez.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const NEXT_CONFIG = path.resolve(__dirname, '../../next.config.js')

describe('CSP + remotePatterns permiten Supabase Storage', () => {
  const content = fs.readFileSync(NEXT_CONFIG, 'utf8')

  it('img-src CSP incluye https://*.supabase.co (inbox 99500ba6/35f4ee89)', () => {
    // Busca la línea del array que define img-src.
    const imgSrcLine = content
      .split('\n')
      .find(line => /^\s*"img-src/.test(line))
    expect(imgSrcLine, 'next.config.js debe tener una entrada "img-src" en el CSP').toBeTruthy()
    expect(
      imgSrcLine!.includes('https://*.supabase.co'),
      'img-src CSP DEBE incluir https://*.supabase.co — sin esto el browser bloquea las portadas de torneos y avatares servidos desde Supabase Storage (inbox 99500ba6 + 35f4ee89). Patrón: el <img> renderiza con src válido pero el browser muestra icono roto.',
    ).toBe(true)
  })

  it('connect-src CSP incluye https://*.supabase.co (regresión defensiva)', () => {
    const connectSrcLine = content
      .split('\n')
      .find(line => /^\s*"connect-src/.test(line))
    expect(connectSrcLine, 'next.config.js debe tener "connect-src" en CSP').toBeTruthy()
    expect(
      connectSrcLine!.includes('https://*.supabase.co'),
      'connect-src CSP DEBE incluir https://*.supabase.co — toda fetch/XHR a Supabase (auth, RPC, REST) lo necesita. Si esto cae, la app entera deja de funcionar.',
    ).toBe(true)
  })

  it('images.remotePatterns incluye Supabase para next/image', () => {
    expect(
      /hostname:\s*['"]\*\.supabase\.co['"]/.test(content),
      'next.config.js > images.remotePatterns DEBE incluir { hostname: "*.supabase.co" } — sin esto, si algún día reemplazamos <img> por <Image>, fallará el Image Optimization de Next con un 400.',
    ).toBe(true)
  })
})
