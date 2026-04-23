import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

async function main() {
  const { fedegolfLogin } = await import('../lib/fedegolf/client')
  const rut = process.env.FEDEGOLF_RUT!
  const pass = process.env.FEDEGOLF_PASSWORD!
  const session = await fedegolfLogin(rut, pass)

  const paths = [
    '/sistema/admin/modMantenedorCanchas/',
    '/sistema/admin/modMantenedorCanchas/index.php',
    '/sistema/admin/modMantenedorCanchas/main.php',
    '/sistema/admin/',
  ]
  for (const p of paths) {
    const res = await fetch(`https://www.fedegolf.cl${p}`, {
      headers: { 'Cookie': session.cookie },
      redirect: 'manual',
    })
    const text = await res.text()
    console.log(`\n=== ${p} [${res.status}] (${text.length} bytes) ===`)
    const jsMatches = text.match(/(accion|action)\s*[=:]\s*['"]([a-zA-Z_]+)['"]/gi)?.slice(0, 30)
    console.log('acciones:', jsMatches)
    const phpLinks = text.match(/['"]([^'"\s]+\.php[^'"\s]*)['"]/g)?.slice(0, 30)
    console.log('php links:', phpLinks)
    const ajaxUrls = text.match(/url\s*:\s*['"]([^'"]+)['"]/gi)?.slice(0, 20)
    console.log('ajax urls:', ajaxUrls)
  }
}
main().catch(console.error)
