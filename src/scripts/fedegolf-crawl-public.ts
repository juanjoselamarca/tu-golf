/**
 * Crawl público FedeGolf — explorar sitemap, canchas públicas, etc.
 * Sin login primero (ver qué es accesible).
 */
async function main() {
  const BASE = 'https://www.fedegolf.cl'
  const urls = [
    '/',
    '/canchas',
    '/canchas.php',
    '/sistema/publico/modCanchas/',
    '/sistema/publico/modCanchas/json.php',
    '/sistema/publico/modTarjeton/',
    '/sistema/publico/modTarjetones/',
    '/sistema/publico/modCanchasClub/',
    '/sistema/publico/',
    '/sistema/publico/index.php',
    '/sitemap.xml',
    '/robots.txt',
  ]
  for (const u of urls) {
    try {
      const res = await fetch(`${BASE}${u}`, { redirect: 'manual' })
      const text = await res.text()
      const hasYard = /yard|distan|hoyo|par\s*\d|metros/i.test(text)
      console.log(`${hasYard ? '🔍' : ' ✓'} [${res.status}] ${u} (${text.length} bytes)`)
      if (text.length > 100 && text.length < 3000) {
        console.log(`    preview: ${text.slice(0, 300).replace(/\s+/g, ' ')}`)
      }
      if (hasYard) {
        const m = text.match(/[^\s]*(yard|distan|hoyo|par\s*\d|metros)[^\s]*/gi)?.slice(0, 10)
        console.log(`    matches: ${m}`)
      }
    } catch (e) {
      console.log(` ✗ [err] ${u}: ${(e as Error).message}`)
    }
  }
}
main().catch(console.error)
