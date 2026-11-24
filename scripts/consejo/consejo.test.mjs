import { describe, it, expect } from 'vitest'
import { areaDe, costoEnTexto, enZonaCritica, extraerImports, leerPrefijos, rutaDeLaApp } from './costo-pantalla.mjs'
import { buscarDecisiones, leerArgs, normalizar, pesosPorRareza, puntuar, slugDeProyecto } from './decisiones-previas.mjs'

describe('costo-pantalla', () => {
  it('extrae imports estáticos, dinámicos, de efecto y re-exports, sin los comentados', () => {
    const codigo = [
      "import { a } from '@/lib/a'",
      "import type { B } from './b'",
      "export { c } from '../c'",
      "import './estilos.css'",
      "const D = dynamic(() => import('./d'))",
      "// import { x } from './comentado'",
      "/* import { y } from './bloque' */",
    ].join('\n')
    expect(extraerImports(codigo).sort()).toEqual(['../c', './b', './d', './estilos.css', '@/lib/a'])
  })

  it('la zona crítica calza por prefijo y por archivo exacto', () => {
    const prefijos = leerPrefijos('# comentario\nsrc/golf/core/\n\nsrc/proxy.ts\n')
    expect(prefijos).toEqual(['src/golf/core/', 'src/proxy.ts'])
    expect(enZonaCritica('src/golf/core/stroke-index.ts', prefijos)).toBe(true)
    expect(enZonaCritica('src/proxy.ts', prefijos)).toBe(true)
    expect(enZonaCritica('src/golf/courses/vueltas.ts', prefijos)).toBe(false)
  })

  it('deshace la conversión de rutas de Git Bash y deja intactas las de la app', () => {
    expect(rutaDeLaApp('C:/Program Files/Git/ronda-libre/nueva')).toBe('/ronda-libre/nueva')
    expect(rutaDeLaApp('/torneo/x/unirse')).toBe('/torneo/x/unirse')
  })

  it('agrupa por área: la API no cuenta como pantalla', () => {
    expect(areaDe('src/app/api/torneo/route.ts')).toBe('API')
    expect(areaDe('src/app/torneo/page.tsx')).toBe('pantalla (src/app)')
    expect(areaDe('src/golf/core/x.ts')).toBe('motor de golf (src/golf)')
  })

  it('el texto separa lo que usa solo esta pantalla de lo compartido y marca la zona crítica', () => {
    const texto = costoEnTexto({
      ruta: '/x',
      pagina: 'src/app/x/page.tsx',
      prefijos: ['src/golf/core/'],
      tests: ['src/x.test.ts'],
      filas: [
        { archivo: 'src/golf/core/motor.ts', lineas: 500, paginas: 20 },
        { archivo: 'src/app/x/page.tsx', lineas: 120, paginas: 1 },
        { archivo: 'src/app/x/Paso.tsx', lineas: 80, paginas: 1 },
      ],
    })
    expect(texto).toContain('arrastra 3 archivos, 700 líneas')
    expect(texto).toContain('Solo esta pantalla: 2 archivos, 200 líneas.')
    expect(texto).toContain('1 en zona crítica (500 líneas)')
    expect(texto).toContain('- ★ `src/golf/core/motor.ts` — 500 (en 20 pantallas)')
    expect(texto).not.toMatch(/★ `src\/app\/x\/page\.tsx`/)
  })
})

describe('decisiones-previas', () => {
  it('lee todas las palabras, con y sin --max', () => {
    expect(leerArgs(['inscripción', 'invitado', 'whatsapp'])).toEqual({ palabras: ['inscripción', 'invitado', 'whatsapp'], max: 10 })
    expect(leerArgs(['indice'])).toEqual({ palabras: ['indice'], max: 10 })
    expect(leerArgs(['a', '--max', '3', 'b'])).toEqual({ palabras: ['a', 'b'], max: 3 })
  })

  it('normaliza tildes y mayúsculas', () => {
    expect(normalizar('Inscripción ÍNDICE')).toBe('inscripcion indice')
  })

  it('arma el slug de la carpeta de proyecto como Claude Code', () => {
    expect(slugDeProyecto('C:\\Users\\juanj\\Proyectos IA\\tu-golf')).toBe('C--Users-juanj-Proyectos-IA-tu-golf')
    expect(slugDeProyecto('C:/Users/juanj/Proyectos IA/tu-golf')).toBe('C--Users-juanj-Proyectos-IA-tu-golf')
  })

  it('ignora el encabezado y pone primero las líneas que suenan a decisión', () => {
    const texto = [
      '---',
      'name: inscripcion',
      'description: inscripción de invitados',
      '---',
      'La inscripción tiene tres pasos.',
      'Juanjo decidió que la inscripción no pide índice al invitado.',
      'Otra cosa sin relación.',
    ].join('\n')
    const r = puntuar(texto, ['inscripcion'])
    expect(r.lineas).toEqual([
      'Juanjo decidió que la inscripción no pide índice al invitado.',
      'La inscripción tiene tres pasos.',
    ])
  })

  it('sin ninguna palabra no hay resultado; más palabras distintas pesan más que repetir una', () => {
    expect(puntuar('nada que ver', ['torneo'])).toBeNull()
    const docs = [
      { origen: 'repite', texto: 'torneo torneo torneo torneo torneo' },
      { origen: 'ambas', texto: 'torneo e inscripción' },
      { origen: 'ninguna', texto: 'ronda libre' },
    ]
    expect(buscarDecisiones(['torneo', 'inscripción'], docs).map((d) => d.origen)).toEqual(['ambas', 'repite'])
  })

  it('una palabra rara pesa más que una que está en todos lados', () => {
    const docs = [
      { origen: 'comun-1', texto: 'organizador organizador organizador' },
      { origen: 'comun-2', texto: 'organizador' },
      { origen: 'comun-3', texto: 'organizador' },
      { origen: 'rara', texto: 'quién anota' },
    ]
    const pesos = pesosPorRareza(['organizador', 'quién anota'], docs)
    expect(pesos['quien anota']).toBeGreaterThan(pesos.organizador)
    expect(pesos.organizador).toBeGreaterThan(0)
    expect(buscarDecisiones(['organizador', 'quién anota'], docs)[0].origen).toBe('rara')
  })
})
