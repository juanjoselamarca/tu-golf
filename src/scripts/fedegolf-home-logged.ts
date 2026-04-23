/**
 * Navegar la home y páginas como usuario regular logueado, descubrir
 * todos los módulos accesibles. Objetivo: encontrar módulo con data
 * de hoyos/yardajes/tarjetón.
 */
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

async function main() {
  const { fedegolfLogin } = await import('../lib/fedegolf/client')
  const rut = process.env.FEDEGOLF_RUT!
  const pass = process.env.FEDEGOLF_PASSWORD!
  const session = await fedegolfLogin(rut, pass)

  const BASE = 'https://www.fedegolf.cl'
  // Home loggeada + paginas probables
  const paths = [
    '/sistema/',
    '/sistema/index.php',
    '/sistema/home/',
    '/sistema/home/index.php',
    '/sistema/usuario/',
    '/sistema/usuario/index.php',
    '/sistema/club/',
    '/sistema/publico/index.php',
  ]
  for (const p of paths) {
    const res = await fetch(`${BASE}${p}`, {
      headers: { 'Cookie': session.cookie },
      redirect: 'manual',
    })
    const text = await res.text()
    console.log(`\n=== ${p} [${res.status}] (${text.length} bytes) ===`)
    if (text.length > 500) {
      // buscar links a módulos
      const modLinks = new Set<string>()
      const re = /href\s*=\s*['"]([^'"]*\/mod[A-Z][^'"]*)['"]/g
      let m
      while ((m = re.exec(text))) modLinks.add(m[1])
      console.log(`módulos (${modLinks.size}):`, Array.from(modLinks).slice(0, 30))

      // buscar cualquier referencia a "cancha", "hoyo", "tarjeton"
      const interesting = text.match(/href\s*=\s*['"]([^'"]*(?:cancha|hoyo|tarjeton|distanc|yarda)[^'"]*)['"]/gi)?.slice(0, 15)
      if (interesting && interesting.length > 0) console.log('  interesantes:', interesting)
    }
  }
}
main().catch(console.error)
