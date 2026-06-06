/**
 * TESTS CANARIO — Estabilidad de la app
 *
 * Creados post-incidente 25 Mar 2026.
 * Detectan los patrones exactos que causaron la caída:
 * - Navbar con auth que bloquea render
 * - Componentes compartidos con loops infinitos
 * - Imports rotos en páginas críticas
 *
 * Si alguno de estos tests falla, NO se puede pushear.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const SRC = path.resolve(__dirname, '..')

// Helper: leer archivo y retornar contenido
function readFile(relativePath: string): string {
  const fullPath = path.join(SRC, relativePath)
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Archivo crítico no existe: ${relativePath}`)
  }
  return fs.readFileSync(fullPath, 'utf-8')
}

describe('Canario: Archivos críticos existen', () => {
  const criticalFiles = [
    'components/Navbar.tsx',
    'app/perfil/page.tsx',
    'app/perfil/historial/page.tsx',
    'app/perfil/stats/page.tsx',
    'app/dashboard/page.tsx',
    'app/layout.tsx',
    'lib/supabase.ts',
    'middleware.ts',
  ]

  criticalFiles.forEach(file => {
    it(`${file} existe`, () => {
      const fullPath = path.join(SRC, file)
      expect(fs.existsSync(fullPath), `Archivo crítico falta: ${file}`).toBe(true)
    })
  })
})

describe('Canario: Navbar no tiene patrones peligrosos', () => {
  it('no usa async en onAuthStateChange callback', () => {
    const navbar = readFile('components/Navbar.tsx')
    // El patrón "onAuthStateChange(async" causó la caída del 25-mar
    // El callback puede tener .then() internos pero NO debe ser async
    const hasAsyncCallback = /onAuthStateChange\(\s*async\s/.test(navbar)
    expect(hasAsyncCallback,
      'PELIGRO: onAuthStateChange con callback async causó caída el 25-mar. Usar .then() en su lugar.'
    ).toBe(false)
  })

  it('no tiene await directo en useEffect de auth', () => {
    const navbar = readFile('components/Navbar.tsx')
    // Buscar patrón: useEffect con función async directa que llama await getUser
    // El patrón seguro es .then(), no async/await en el nivel superior del effect
    const lines = navbar.split('\n')
    let inUseEffect = false
    let useEffectHasAsyncDef = false

    for (const line of lines) {
      if (line.includes('useEffect(')) inUseEffect = true
      if (inUseEffect && /async\s+function\s+\w+.*getUser|async.*=>\s*{[\s\S]*getUser/.test(line)) {
        useEffectHasAsyncDef = true
      }
      if (inUseEffect && line.trim() === '}, [])') inUseEffect = false
    }

    // Nota: async functions DENTRO del effect pueden ser seguras si se manejan bien,
    // pero en Navbar específicamente causaron problemas. Si necesitas async, hazlo
    // en un componente separado, no en el Navbar global.
    expect(useEffectHasAsyncDef,
      'PELIGRO: Navbar con async function en useEffect de auth. Esto causó la caída del 25-mar.'
    ).toBe(false)
  })

  it('tiene cleanup de listener', () => {
    const navbar = readFile('components/Navbar.tsx')
    expect(navbar).toContain('unsubscribe()')
  })
})

describe('Canario: Páginas client-side tienen timeout de seguridad o loading controlado', () => {
  it('perfil page tiene loading state con fallback', () => {
    const perfil = readFile('app/perfil/page.tsx')
    expect(perfil).toContain('loading')
    expect(perfil).toContain('setLoading(false)')
  })

  it('historial page tiene loading state con fallback', () => {
    // Post-refactor: loading state lives in useHistorialRounds hook, not page.tsx.
    // The page imports and uses the hook; the canary validates the pattern exists.
    const historial = readFile('app/perfil/historial/page.tsx')
      + '\n' + readFile('app/perfil/historial/hooks/useHistorialRounds.ts')
    expect(historial).toContain('loading')
    expect(historial).toContain('setLoading(false)')
  })
})

describe('Canario: API routes tienen force-dynamic', () => {
  it('todas las API routes con supabase/server tienen force-dynamic', () => {
    const apiDir = path.join(SRC, 'app/api')
    const missingDynamic: string[] = []

    function scanDir(dir: string) {
      if (!fs.existsSync(dir)) return
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          scanDir(fullPath)
        } else if (entry.name === 'route.ts') {
          const content = fs.readFileSync(fullPath, 'utf-8')
          if (content.includes('supabase/server') && !content.includes('force-dynamic')) {
            missingDynamic.push(fullPath.replace(apiDir, 'api'))
          }
        }
      }
    }

    scanDir(apiDir)
    expect(missingDynamic,
      `Rutas API sin force-dynamic: ${missingDynamic.join(', ')}`
    ).toHaveLength(0)
  })
})

describe('Canario: Layout no importa componentes pesados que puedan bloquear', () => {
  it('layout.tsx tiene imports seguros', () => {
    const layout = readFile('app/layout.tsx')
    // Verificar que los imports del layout son componentes ligeros conocidos
    expect(layout).toContain('Navbar')
    // El layout NO debe importar componentes que hagan fetches pesados server-side
    expect(layout).not.toContain('getServerSideProps')
    expect(layout).not.toContain('fetch(')
  })
})

/**
 * Canario post-incidente tAIger+ (2026-05-06): chat se cortaba a mitad de
 * SSE, "Error de conexión" en mobile, footer global tapaba el input bar,
 * pill "Gracias por tu feedback" persistía, no había botón Reintentar.
 * Estos tests bloquean push si alguien revierte cualquiera de los 5 fixes.
 */
describe('Canario tAIger+: chat coach (fixes 2026-05-06)', () => {
  it('route.ts del coach mantiene maxDuration en 300s', () => {
    const route = readFile('app/api/taiger/chat/route.ts')
    expect(
      /export\s+const\s+maxDuration\s*=\s*300\b/.test(route),
      'maxDuration debe ser 300s. Si lo bajan a 30s, el SSE se corta cuando ' +
      'el coach hace tool-calling largo y el cliente cae en "Error de conexión".',
    ).toBe(true)
  })

  it('route.ts del coach emite heartbeat SSE periódico', () => {
    // El motor del stream (heartbeat + tool-loop) se extrajo a chat-engine.ts (PR1 refactor).
    const route = readFile('golf/coach/chat-engine.ts')
    // Debe haber un comment frame `: keepalive\n\n` y un setInterval/clearInterval que lo dispare.
    expect(
      route.includes(': keepalive') && /setInterval\s*\(/.test(route) && /clearInterval\s*\(/.test(route),
      'El stream del coach necesita heartbeat (`: keepalive`) cada N segundos ' +
      'para evitar que proxies CDN/móvil cierren conexiones idle entre tool calls.',
    ).toBe(true)
  })

  it('chat container usa 100dvh (no 100vh) para respetar teclado virtual', () => {
    const page = readFile('app/coach/sesion/[id]/page.tsx')
    expect(
      page.includes('100dvh'),
      'El shell del chat debe usar `100dvh`. Con `100vh` en mobile el input ' +
      'queda detrás del teclado virtual o de la URL bar dinámica.',
    ).toBe(true)
    expect(
      /height:\s*['"`]calc\(100vh\b/.test(page),
      'No usar `calc(100vh - X)` en mobile — preferir `100dvh`.',
    ).toBe(false)
  })

  it('GlobalFooter oculta el footer global en /coach/sesion/*', () => {
    const footer = readFile('components/GlobalFooter.tsx')
    expect(
      footer.includes("'/coach/sesion'") || footer.includes('"/coach/sesion"'),
      'GlobalFooter debe contener `/coach/sesion` en sus prefijos ocultos. ' +
      'Sin esto el footer aparece debajo del input bar del chat en mobile ' +
      '(barra de "Escribe tu mensaje" queda flotando incómoda).',
    ).toBe(true)
  })

  it('chat coach renderiza botón Reintentar en errores de conexión', () => {
    const page = readFile('app/coach/sesion/[id]/page.tsx')
    expect(
      page.includes('Reintentar') && /handleRetry/.test(page),
      'El banner de error del chat debe tener botón "Reintentar" cableado ' +
      'a un handler que rellame sendFollowUp con el último turno del usuario.',
    ).toBe(true)
  })

  it('SSE reader del coach buffera chunks (multi-byte UTF-8 + frames partidos)', () => {
    const page = readFile('app/coach/sesion/[id]/page.tsx')
    // 1. decoder.decode debe usarse con {stream: true} para evitar romper
    //    acentos/emojis cuando un byte multi-byte UTF-8 cae al final del chunk.
    expect(
      /decoder\.decode\(value,\s*\{\s*stream:\s*true\s*\}\)/.test(page),
      'TextDecoder.decode debe llamarse con {stream:true} en el loop del SSE ' +
      'para acumular bytes multi-byte UTF-8 incompletos entre reads. Sin esto, ' +
      'acentos y emojis del coach se rompen al azar.',
    ).toBe(true)

    // 2. Debe haber un buffer string que se acumule entre reads y se parta por \n\n
    //    (separador SSE real). Sin buffer, frames partidos entre chunks TCP caen
    //    en el catch silencioso y el cliente pierde tokens.
    expect(
      /let\s+buffer\s*=\s*['"]['"]/i.test(page) && /buffer\s*\+=\s*decoder\.decode/.test(page),
      'El loop del SSE debe acumular en un buffer string entre reads ' +
      '(let buffer = ""; buffer += decoder.decode(...)). Sin esto un frame ' +
      'partido a mitad de JSON falla parse silencioso y se pierde texto.',
    ).toBe(true)
  })
})

describe('Canario: Scorer ronda-libre — sin use-before-declaration en TDZ', () => {
  // Bug 12-may-2026 (Juanjo en cancha): hasStrokeAdvantage hacía closure sobre
  // modoJuego/formatoJuego que estaban declarados MÁS ABAJO en la misma función.
  // Al invocarse sincrónicamente right después de su definición → TDZ
  // ReferenceError → error boundary → pantalla blanca en cancha.
  //
  // Fix estructural (13-may-2026, Task 3 scorer-refactor): los cálculos derivados
  // se extrajeron a useScoreboardCalc. modoJuego/formatoJuego se declaran al TOP
  // del hook, antes de la closure, garantizado por esta suite.
  // El canario ahora verifica el HOOK (fuente de verdad) en vez de page.tsx.
  //
  // Cleanup 17-may-2026 (Nit 8): patrones tightened para sobrevivir refactors
  // — aceptan `const`/`let`/`var`, type annotations (`: ModoJuego`), y los dos
  // nombres del callback (`hasStrokeAdvantage` legacy, `strokeAdvantageOn` actual).
  const HOOK = 'app/ronda-libre/[codigo]/score/hooks/useScoreboardCalc.ts'

  // `const modoJuego = ...`, `let modoJuego = ...`, `const modoJuego: ModoJuego = ...`.
  const MODO_DECL_RE = /\b(?:const|let|var)\s+modoJuego\b\s*(?::[^=]+)?=/
  const FORMATO_DECL_RE = /\b(?:const|let|var)\s+formatoJuego\b\s*(?::[^=]+)?=/
  // Acepta ambos nombres históricos del callback. Si futuros refactors renombran
  // de nuevo, agregar el alias acá — no aflojar el patrón.
  const CLOSURE_RE = /\b(?:const|let|var)\s+(?:hasStrokeAdvantage|strokeAdvantageOn)\b\s*(?::[^=]+)?=/

  it('modoJuego declarado ANTES de la closure que captura sobre él', () => {
    const src = readFile(HOOK)
    const decl = src.search(MODO_DECL_RE)
    const closure = src.search(CLOSURE_RE)
    expect(decl, 'No encuentro declaración de modoJuego en useScoreboardCalc (regex MODO_DECL_RE)').toBeGreaterThan(-1)
    expect(closure, 'No encuentro closure strokeAdvantageOn/hasStrokeAdvantage en useScoreboardCalc (regex CLOSURE_RE)').toBeGreaterThan(-1)
    expect(decl,
      'TDZ: modoJuego debe declararse ANTES de la closure que lo captura. Fix estructural del bug 12-may.'
    ).toBeLessThan(closure)
  })

  it('formatoJuego declarado ANTES de la closure que captura sobre él', () => {
    const src = readFile(HOOK)
    const decl = src.search(FORMATO_DECL_RE)
    const closure = src.search(CLOSURE_RE)
    expect(decl, 'No encuentro declaración de formatoJuego en useScoreboardCalc (regex FORMATO_DECL_RE)').toBeGreaterThan(-1)
    expect(decl,
      'TDZ: formatoJuego debe declararse ANTES de la closure que lo captura. Mismo patrón que el bug 12-may.'
    ).toBeLessThan(closure)
  })
})

/**
 * Canario: API endpoints + componentes del nuevo flow "Organizar Campeonato"
 * (Waves 1-3 de feat/organizar-campeonato — 2026-05-11).
 *
 * Bloquea que alguien elimine por accidente cualquiera de los endpoints
 * del editor de torneos, las simulaciones de formato, o el shell del live
 * polimórfico. Si alguno desaparece, el flow entero se rompe en prod.
 *
 * Usamos paths relativos al root del proyecto (no a src/) — `ROOT` apunta
 * a la raíz, no al directorio src/ que usa el `readFile()` de arriba.
 */
const ROOT = path.resolve(__dirname, '..', '..')

function rootExists(relativePath: string): boolean {
  return fs.existsSync(path.join(ROOT, relativePath))
}

function rootRead(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf-8')
}

describe('Canary: tournament drafts API + frontend (feat/organizar-campeonato)', () => {
  it('endpoint create draft existe', () => {
    expect(rootExists('src/app/api/torneos/draft/route.ts')).toBe(true)
  })

  it('endpoint [id] handlers existe', () => {
    expect(rootExists('src/app/api/torneos/draft/[id]/route.ts')).toBe(true)
  })

  it('endpoint assistant existe', () => {
    expect(rootExists('src/app/api/torneos/draft/[id]/assistant/route.ts')).toBe(true)
  })

  it('endpoint preview existe', () => {
    expect(rootExists('src/app/api/torneos/draft/[id]/preview/route.ts')).toBe(true)
  })

  it('endpoint create-tournament existe', () => {
    expect(rootExists('src/app/api/torneos/draft/[id]/create-tournament/route.ts')).toBe(true)
  })

  it('endpoint duplicate-from existe', () => {
    expect(rootExists('src/app/api/torneos/draft/duplicate-from/[tournamentId]/route.ts')).toBe(true)
  })

  it('cron cleanup-drafts existe', () => {
    expect(rootExists('src/app/api/cron/cleanup-drafts/route.ts')).toBe(true)
  })

  it('schema zod del config exporta tournamentConfigSchema y partial', () => {
    const content = rootRead('src/lib/draft/schema.ts')
    expect(content).toMatch(/export const tournamentConfigSchema/)
    expect(content).toMatch(/export const tournamentConfigPartialSchema/)
  })

  it('upgrade-config define CURRENT_SCHEMA_VERSION', () => {
    const content = rootRead('src/lib/draft/upgrade-config.ts')
    expect(content).toMatch(/CURRENT_SCHEMA_VERSION/)
  })

  it('vercel.json tiene cron de cleanup', () => {
    const content = rootRead('vercel.json')
    expect(content).toMatch(/cleanup-drafts/)
  })

  it('TournamentDraftEditor componente raiz existe', () => {
    expect(rootExists('src/app/organizador/nuevo/TournamentDraftEditor.tsx')).toBe(true)
  })

  it('NuevoTorneoForm legacy fue eliminado', () => {
    expect(rootExists('src/app/organizador/nuevo/NuevoTorneoForm.tsx')).toBe(false)
  })

  it('AssistantPanel existe', () => {
    expect(rootExists('src/components/tournament-draft/AssistantPanel.tsx')).toBe(true)
  })

  it('Live polimorfico existe (page + LiveView)', () => {
    expect(rootExists('src/app/torneo/[slug]/en-vivo/page.tsx')).toBe(true)
    expect(rootExists('src/app/torneo/[slug]/en-vivo/LiveView.tsx')).toBe(true)
  })

  it('Los 7 simuladores de formato existen', () => {
    const sims = [
      'individual-stroke',
      'individual-stableford',
      'team-best-ball',
      'team-scramble',
      'team-foursome',
      'match-play-bracket',
      'match-play-1v1',
    ]
    for (const s of sims) {
      expect(
        rootExists(`src/lib/draft/simulators/${s}.ts`),
        `Simulador faltante: src/lib/draft/simulators/${s}.ts`,
      ).toBe(true)
    }
  })
})

/**
 * Post-incidente 19-may-2026: /coach crasheaba con TypeError porque
 * `historical_rounds.par_per_hole` es JSONB objeto (`{"1":4,...}`), NO array.
 * `lastRound?.par_per_hole?.reduce(...)` lanzaba "reduce is not a function" y
 * el error boundary mostraba "Algo salió mal" sin loguear nada.
 *
 * Estos canarios bloquean cualquier regresión que vuelva a llamar métodos de
 * Array (.reduce/.slice/.map/.length) directo sobre par_per_hole en
 * /coach/page.tsx, y exigen que ambos error boundaries del módulo capturen
 * el error vía captureError().
 */
describe('Canary: /coach no rompe con par_per_hole como JSONB objeto (19-may-2026)', () => {
  it('coach/page.tsx importa parPerHoleArray para normalizar par_per_hole', () => {
    const content = rootRead('src/app/coach/page.tsx')
    expect(
      /from\s+['"]@\/golf\/core\/compare['"]/.test(content) && /parPerHoleArray/.test(content),
      'coach/page.tsx debe importar parPerHoleArray — par_per_hole en BD es objeto, no array',
    ).toBe(true)
  })

  it('coach/page.tsx no llama métodos de Array directo sobre par_per_hole', () => {
    const content = rootRead('src/app/coach/page.tsx')
    // .reduce/.slice/.map/.length sobre par_per_hole crashean cuando el valor
    // es {"1":4,"2":4,...}. Forzar normalización vía parPerHoleArray primero.
    const badPatterns = [
      /par_per_hole\??\.reduce\b/,
      /par_per_hole\??\.slice\b/,
      /par_per_hole\??\.map\b/,
      /par_per_hole\??\.length\b/,
    ]
    for (const pat of badPatterns) {
      expect(
        pat.test(content),
        `PELIGRO: coach/page.tsx usa ${pat.source} directo sobre par_per_hole — crashea con JSONB objeto. Normalizar con parPerHoleArray primero.`,
      ).toBe(false)
    }
  })

  it('coach/error.tsx usa RouteErrorBoundary (captura vía componente compartido)', () => {
    const content = rootRead('src/app/coach/error.tsx')
    expect(content).toMatch(/RouteErrorBoundary/)
  })

  it('coach/sesion/[id]/error.tsx usa RouteErrorBoundary', () => {
    const content = rootRead('src/app/coach/sesion/[id]/error.tsx')
    expect(content).toMatch(/RouteErrorBoundary/)
  })
})

/**
 * Post-sweep 19-may-2026: TODOS los app/**\/error.tsx deben delegar a
 * <RouteErrorBoundary>, que es el único lugar donde llamamos a captureError().
 *
 * Antes del sweep, 13 de 14 boundaries descartaban el `error` prop con
 * `function Error({ reset })` y la app entera era ciega a crashes en producción
 * (error_logs vacía por 7+ días a pesar del incidente real de /coach).
 *
 * Estos canarios bloquean cualquier regresión a ese patrón:
 *  1. Todo error.tsx debe importar RouteErrorBoundary.
 *  2. Ningún error.tsx debe destructurar `{ reset }` solo (descarta el error).
 *  3. RouteErrorBoundary mismo debe llamar captureError — si alguien lo
 *     "simplifica" rompiendo la observabilidad, el canario lo bloquea.
 */
describe('Canary: error.tsx app-wide usan RouteErrorBoundary (19-may-2026)', () => {
  const ALL_ERROR_BOUNDARIES = [
    'src/app/error.tsx',
    'src/app/admin/error.tsx',
    'src/app/coach/error.tsx',
    'src/app/coach/sesion/[id]/error.tsx',
    'src/app/dashboard/error.tsx',
    'src/app/importar/error.tsx',
    'src/app/organizador/[slug]/jugadores/error.tsx',
    'src/app/organizador/[slug]/scoring/error.tsx',
    'src/app/perfil/error.tsx',
    'src/app/perfil/historial/error.tsx',
    'src/app/perfil/stats/error.tsx',
    'src/app/ronda-libre/[codigo]/error.tsx',
    'src/app/ronda-libre/[codigo]/score/error.tsx',
    'src/app/torneo/[slug]/error.tsx',
  ]

  for (const file of ALL_ERROR_BOUNDARIES) {
    it(`${file} usa RouteErrorBoundary con context único`, () => {
      const content = rootRead(file)
      expect(
        /RouteErrorBoundary/.test(content),
        `${file} debe delegar a <RouteErrorBoundary> — único componente que llama captureError. Patrón: 3 líneas, ver src/app/error.tsx`,
      ).toBe(true)
      expect(
        /context\s*=\s*['"]/.test(content),
        `${file} debe pasar un context="..." literal (ej: 'dashboard.render') — sin esto los crashes no se categorizan en error_logs/PostHog`,
      ).toBe(true)
    })

    it(`${file} NO descarta el error prop (patrón ciego anterior)`, () => {
      const content = rootRead(file)
      // Patrón roto: `function Error({ reset })` o `function Error({ reset }: ...)`
      // — destructura solo reset y descarta error. Causó 7+ días sin telemetría.
      const blindPattern = /function\s+Error\s*\(\s*\{\s*reset\s*\}/
      expect(
        blindPattern.test(content),
        `PELIGRO: ${file} destructura solo { reset } — descarta el error prop. Usar el patrón de RouteErrorBoundary con {...props}.`,
      ).toBe(false)
    })
  }

  it('RouteErrorBoundary llama captureError (única fuente de telemetría)', () => {
    const content = rootRead('src/components/ui/RouteErrorBoundary.tsx')
    expect(
      /captureError/.test(content) && /error-tracking/.test(content),
      'RouteErrorBoundary DEBE llamar captureError — es el único lugar donde la app captura crashes de render. Si esto se rompe, los 14 boundaries quedan ciegos otra vez.',
    ).toBe(true)
  })
})

/**
 * Canario: frontera de confianza de getPageUser (06-jun-2026)
 *
 * getPageUser() lee getSession() (decodifica el JWT de la cookie SIN validarlo
 * contra el servidor de Supabase). Solo es seguro en rutas que el middleware
 * REDIRIGE a /login si no hay user válido (las de `protectedRoutes`): ahí un
 * token forjado/expirado nunca llega a renderizar la página. En rutas PÚBLICAS
 * (torneo, tarjeta) getSession() podría devolver un viewer forjado → usar
 * getUser(). Este canario convierte esa regla en garantía ejecutable: si alguien
 * usa getPageUser en una ruta no protegida, el test falla y no se puede pushear.
 *
 * Debe mantenerse sincronizado con `protectedRoutes` en src/middleware.ts.
 */
describe('Canario: getPageUser solo en rutas protegidas (frontera de confianza)', () => {
  // Mismos prefijos que protectedRoutes en src/middleware.ts (sin la barra inicial).
  const PROTECTED_PREFIXES = ['dashboard', 'perfil', 'coach', 'organizador', 'admin', 'importar', 'ronda-libre/nueva']
  const APP_DIR = path.join(SRC, 'app')

  function walk(dir: string): string[] {
    const out: string[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) out.push(...walk(full))
      else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) out.push(full)
    }
    return out
  }

  // Ruta app-relativa con separadores POSIX (ej: 'organizador/[slug]/editar/page.tsx').
  const appRel = (full: string) => path.relative(APP_DIR, full).split(path.sep).join('/')
  const importsHelper = (full: string) => /from ['"]@\/lib\/auth\/getPageUser['"]/.test(fs.readFileSync(full, 'utf-8'))

  const filesUsingHelper = walk(APP_DIR).filter(importsHelper)

  it('hay al menos una página usando getPageUser (sanity del propio canario)', () => {
    expect(filesUsingHelper.length).toBeGreaterThan(0)
  })

  filesUsingHelper.forEach((full) => {
    const rel = appRel(full)
    it(`app/${rel} está bajo una ruta protegida`, () => {
      const ok = PROTECTED_PREFIXES.some((p) => rel === p || rel.startsWith(p + '/'))
      expect(
        ok,
        `PELIGRO: app/${rel} usa getPageUser() pero su ruta NO está en protectedRoutes. ` +
          `En una ruta no redirigida a /login, getSession() puede devolver un usuario forjado. ` +
          `Usar supabase.auth.getUser() ahí, o agregar el prefijo a protectedRoutes en middleware.ts.`,
      ).toBe(true)
    })
  })

  // Rutas públicas conocidas: NUNCA deben usar getPageUser.
  const PUBLIC_PAGES = ['torneo/[slug]/page.tsx', 'tarjeta/[id]/page.tsx']
  PUBLIC_PAGES.forEach((rel) => {
    it(`ruta pública app/${rel} NO usa getPageUser`, () => {
      const full = path.join(APP_DIR, rel)
      if (!fs.existsSync(full)) return // si se renombra/elimina, no romper el canario
      expect(
        importsHelper(full),
        `PELIGRO: app/${rel} es ruta pública (no redirige a /login) y usa getPageUser(). ` +
          `Debe usar supabase.auth.getUser() — es la frontera de confianza real ahí.`,
      ).toBe(false)
    })
  })
})
