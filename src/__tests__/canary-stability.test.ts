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
