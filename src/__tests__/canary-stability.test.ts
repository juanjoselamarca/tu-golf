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
    const historial = readFile('app/perfil/historial/page.tsx')
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
    const route = readFile('app/api/taiger/chat/route.ts')
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
  // del hook, antes de hasStrokeAdvantage, garantizado por esta suite.
  // El canario ahora verifica el HOOK (fuente de verdad) en vez de page.tsx.
  const HOOK = 'app/ronda-libre/[codigo]/score/hooks/useScoreboardCalc.ts'

  it('const modoJuego está declarado ANTES de hasStrokeAdvantage en el hook', () => {
    const src = readFile(HOOK)
    const decl = src.indexOf('const modoJuego = ')
    const callback = src.indexOf('const hasStrokeAdvantage')
    expect(decl, 'No encuentro `const modoJuego` en useScoreboardCalc').toBeGreaterThan(-1)
    expect(callback, 'No encuentro `const hasStrokeAdvantage` en useScoreboardCalc').toBeGreaterThan(-1)
    expect(decl,
      'TDZ: modoJuego debe declararse ANTES de hasStrokeAdvantage en el hook. Fix estructural del bug 12-may.'
    ).toBeLessThan(callback)
  })

  it('const formatoJuego está declarado ANTES de hasStrokeAdvantage en el hook', () => {
    const src = readFile(HOOK)
    const decl = src.indexOf('const formatoJuego = ')
    const callback = src.indexOf('const hasStrokeAdvantage')
    expect(decl, 'No encuentro `const formatoJuego` en useScoreboardCalc').toBeGreaterThan(-1)
    expect(decl,
      'TDZ: formatoJuego debe declararse ANTES de hasStrokeAdvantage en el hook. Mismo patrón que el bug 12-may.'
    ).toBeLessThan(callback)
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

describe('Canario: Scorer ronda-libre — sin use-before-declaration en TDZ', () => {
  // Bug 12-may-2026 (Juanjo en cancha): hasStrokeAdvantage hacía closure sobre
  // modoJuego/formatoJuego que estaban declarados MÁS ABAJO en la misma función.
  // Al invocarse sincrónicamente right después de su definición → TDZ
  // ReferenceError → error boundary → pantalla blanca en cancha. Este canario
  // garantiza que las dos declaraciones quedan SIEMPRE arriba.
  const SCORER = 'app/ronda-libre/[codigo]/score/page.tsx'

  it('const modoJuego está declarado ANTES de hasStrokeAdvantage', () => {
    const src = readFile(SCORER)
    const decl = src.indexOf('const modoJuego = ronda.modo_juego')
    const callback = src.indexOf('const hasStrokeAdvantage')
    expect(decl, 'No encuentro `const modoJuego = ronda.modo_juego` en el scorer').toBeGreaterThan(-1)
    expect(callback, 'No encuentro `const hasStrokeAdvantage` en el scorer').toBeGreaterThan(-1)
    expect(decl,
      'TDZ: modoJuego debe declararse ANTES de hasStrokeAdvantage. Si lo mueves más abajo, el scorer crashea en cancha.'
    ).toBeLessThan(callback)
  })

  it('const formatoJuego está declarado ANTES de hasStrokeAdvantage', () => {
    const src = readFile(SCORER)
    const decl = src.indexOf('const formatoJuego = ronda.formato_juego')
    const callback = src.indexOf('const hasStrokeAdvantage')
    expect(decl, 'No encuentro `const formatoJuego = ronda.formato_juego` en el scorer').toBeGreaterThan(-1)
    expect(decl,
      'TDZ: formatoJuego debe declararse ANTES de hasStrokeAdvantage. Mismo patrón que el bug 12-may.'
    ).toBeLessThan(callback)
  })
})
