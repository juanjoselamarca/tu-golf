import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { sanitizeNext, loginUrl, registerUrl, DEFAULT_NEXT } from '@/lib/auth/login-url'

describe('DEFAULT_NEXT', () => {
  it('es /dashboard', () => {
    expect(DEFAULT_NEXT).toBe('/dashboard')
  })
})

describe('sanitizeNext', () => {
  it('permite rutas internas válidas', () => {
    expect(sanitizeNext('/dashboard')).toBe('/dashboard')
    expect(sanitizeNext('/perfil')).toBe('/perfil')
    expect(sanitizeNext('/torneo/slug-torneo')).toBe('/torneo/slug-torneo')
    expect(sanitizeNext('/ronda-libre/ABC123?tab=score')).toBe('/ronda-libre/ABC123?tab=score')
  })
  it('bloquea URLs externas y esquemas (open redirect)', () => {
    for (const v of [
      'https://phishing.com',
      'http://attacker.com/path',
      '//evil.com',
      '/\\evil.com',
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'evil.com',
    ]) {
      expect(sanitizeNext(v), v).toBe(DEFAULT_NEXT)
    }
  })
  it('lo que pasa la validación nunca sale del sitio (ni tras normalizar)', () => {
    const ORIGEN = 'https://golfersplus.vercel.app'
    for (const v of ['/..//evil.com', '/.//evil.com', '/%2e%2e//evil.com', '/..\\evil.com', '/%2F%2Fevil.com', '/\t/evil.com']) {
      const out = sanitizeNext(v)
      expect(out.startsWith('/'), v).toBe(true)
      expect(out.startsWith('//') || out.startsWith('/\\'), v).toBe(false)
      expect(new URL(out, ORIGEN).origin, v).toBe(ORIGEN)
    }
  })
  it('devuelve DEFAULT_NEXT para inputs nulos o vacíos', () => {
    expect(sanitizeNext(null)).toBe(DEFAULT_NEXT)
    expect(sanitizeNext(undefined)).toBe(DEFAULT_NEXT)
    expect(sanitizeNext('')).toBe(DEFAULT_NEXT)
    expect(sanitizeNext('  ')).toBe(DEFAULT_NEXT)
  })
})

describe('loginUrl', () => {
  it('sin next o con el default → /login pelado', () => {
    expect(loginUrl()).toBe('/login')
    expect(loginUrl(null)).toBe('/login')
    expect(loginUrl('')).toBe('/login')
    expect(loginUrl(DEFAULT_NEXT)).toBe('/login')
  })
  it('no manda a volver a la landing ni a las pantallas de auth', () => {
    expect(loginUrl('/')).toBe('/login')
    expect(loginUrl('/login')).toBe('/login')
    expect(loginUrl('/register')).toBe('/login')
    expect(loginUrl('/login?next=%2Fperfil')).toBe('/login')
  })
  it('no manda a volver a /auth/* ni a /recuperar (pantallas de auth con Navbar visible)', () => {
    expect(loginUrl('/auth/auth-code-error')).toBe('/login')
    expect(loginUrl('/auth/auth-code-error?error=otp_expired')).toBe('/login')
    expect(loginUrl('/auth/callback?code=x')).toBe('/login')
    expect(loginUrl('/recuperar')).toBe('/login')
    expect(loginUrl('/recuperar?email=a%40b.cl')).toBe('/login')
    expect(registerUrl('/auth/auth-code-error')).toBe('/register')
    expect(registerUrl('/recuperar')).toBe('/register')
  })
  it('no confunde rutas que solo empiezan parecido', () => {
    expect(loginUrl('/authors')).toBe('/login?next=%2Fauthors')
    expect(loginUrl('/recuperar-ronda')).toBe('/login?next=%2Frecuperar-ronda')
  })
  it('encodea la ruta de vuelta', () => {
    expect(loginUrl('/torneo/copa-2026/unirse')).toBe('/login?next=%2Ftorneo%2Fcopa-2026%2Funirse')
    expect(loginUrl('/ronda-libre/AB12?tab=a&b=c')).toBe('/login?next=%2Fronda-libre%2FAB12%3Ftab%3Da%26b%3Dc')
  })
  it('ida y vuelta: lo que lee /login es exactamente la ruta original', () => {
    const ruta = '/ronda-libre/AB12/score-grupo?hoyo=7&x=a b'
    const url = new URL(loginUrl(ruta), 'https://golfersplus.vercel.app')
    expect(url.pathname).toBe('/login')
    expect(sanitizeNext(url.searchParams.get('next'))).toBe('/ronda-libre/AB12/score-grupo?hoyo=7&x=a%20b')
  })
  it('valida antes de armar: un next externo nunca viaja en el link', () => {
    for (const v of ['//evil.com', '/\\evil.com', 'http://evil.com', 'javascript:alert(1)', 'https://evil.com/torneo']) {
      expect(loginUrl(v), v).toBe('/login')
    }
  })
})

describe('registerUrl', () => {
  it('misma regla que loginUrl, sobre /register', () => {
    expect(registerUrl()).toBe('/register')
    expect(registerUrl(DEFAULT_NEXT)).toBe('/register')
    expect(registerUrl('/coach')).toBe('/register?next=%2Fcoach')
    expect(registerUrl('//evil.com')).toBe('/register')
  })
})

// ── Canario: fuente única ───────────────────────────────────────────────────
// Nadie arma '/login?next=' (ni '?redirect=', ni '/register?next=') a mano: se
// usa loginUrl()/registerUrl(), que validan y encodean. Un literal suelto se
// salta la validación contra open redirect y el default compartido.
const SRC = path.resolve(__dirname, '..')
const FUENTE = path.join(SRC, 'lib', 'auth', 'login-url.ts')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      out.push(...walk(full))
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

describe('canario: links a login/registro solo vía loginUrl()/registerUrl()', () => {
  const archivos = walk(SRC).filter((f) => f !== FUENTE)

  it('el barrido ve archivos (no pasa en vacío)', () => {
    expect(archivos.length).toBeGreaterThan(200)
  })

  it("ningún literal '/login?next=' / '/login?redirect=' / '/register?next=' fuera de login-url.ts", () => {
    const patron = /\/(login|register)\?(next|redirect)=/
    const ofensores = archivos
      .flatMap((f) =>
        fs.readFileSync(f, 'utf8').split(/\r?\n/).map((linea, i) => ({ f, i, linea })),
      )
      .filter(({ linea }) => patron.test(linea))
      .map(({ f, i, linea }) => `${path.relative(SRC, f)}:${i + 1}  ${linea.trim()}`)
    expect(ofensores, `Usar loginUrl()/registerUrl() de @/lib/auth/login-url:\n${ofensores.join('\n')}`).toEqual([])
  })

  it("nadie arma el next con searchParams.set('next', ...) fuera de login-url.ts", () => {
    const ofensores = archivos.filter((f) => /searchParams\.set\(\s*['"]next['"]/.test(fs.readFileSync(f, 'utf8')))
    expect(ofensores.map((f) => path.relative(SRC, f))).toEqual([])
  })

  it('proxy.ts arma el redirect a /login con loginUrl()', () => {
    const proxy = fs.readFileSync(path.join(SRC, 'proxy.ts'), 'utf8')
    expect(proxy).toMatch(/loginUrl\(pathname\)/)
    expect(proxy).not.toMatch(/new URL\(\s*['"]\/login['"]/)
  })

  it('Navbar: Entrar / Iniciar sesión llevan la página actual (loginUrl(pathname))', () => {
    const navbar = fs.readFileSync(path.join(SRC, 'components', 'Navbar.tsx'), 'utf8')
    expect(navbar).not.toMatch(/href=["']\/login["']/)
    expect(navbar.match(/href=\{loginUrl\(pathname\)\}/g)?.length).toBe(2)
  })
})
