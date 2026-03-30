#!/usr/bin/env node
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

try {
  const lastCommit = execSync('git log -1 --format="%H|%s|%ad" --date=short')
    .toString().trim()
  const [hash, message, date] = lastCommit.split('|')
  const branch = execSync('git branch --show-current').toString().trim()
  const commitCount = execSync('git rev-list --count HEAD').toString().trim()

  // Detectar páginas existentes en src/app
  const appDir = path.join(__dirname, '../src/app')
  function getPages(dir, base = '') {
    const pages = []
    if (!fs.existsSync(dir)) return pages
    try {
      fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file)
        if (fs.statSync(fullPath).isDirectory()) {
          pages.push(...getPages(fullPath, base + '/' + file))
        } else if (file === 'page.tsx' && base) {
          pages.push(base)
        }
      })
    } catch(e) {}
    return pages
  }

  const pages = getPages(appDir)

  // Leer últimas líneas del Sprint Log
  const sprintLogPath = path.join(__dirname, '../docs/SPRINT_LOG.md')
  const sprintLogPreview = fs.existsSync(sprintLogPath)
    ? fs.readFileSync(sprintLogPath, 'utf8').split('\n').slice(0, 25).join('\n')
    : '*Sin entradas aún*'

  const now = new Date().toISOString().split('T')[0]

  const content = `# TU GOLF — ESTADO ACTUAL

> Auto-generado: ${now} | Commit: \`${hash.substring(0,7)}\`

## Último deploy

- **Commit:** \`${hash.substring(0,7)}\` — ${message}
- **Fecha:** ${date}
- **Branch:** ${branch} (${commitCount} commits total)
- **URL:** https://golfersplus.vercel.app

## Páginas en producción (${pages.length} páginas)

${pages.map(p => `- \`${p}\``).join('\n')}

## Documentación del proyecto

| Archivo | Contenido |
|---------|-----------|
| [SPRINT_LOG.md](./SPRINT_LOG.md) | Historial de sprints |
| [ROADMAP_COMPLETO.md](./ROADMAP_COMPLETO.md) | Sprints 9C→14 |
| [ARQUITECTURA.md](./ARQUITECTURA.md) | Schema BD + stack |
| [TAIGER_SYSTEM_PROMPT.md](./TAIGER_SYSTEM_PROMPT.md) | Coach IA |
| [GWI_MODELO.md](./GWI_MODELO.md) | Probabilidades de ganar |
| [SQL_PENDIENTE.md](./SQL_PENDIENTE.md) | SQL a ejecutar |

## Sprint Log reciente

${sprintLogPreview}

---

*Generado automáticamente por scripts/update-docs.js*
*Para actualizar: node scripts/update-docs.js*
`

  const docsDir = path.join(__dirname, '../docs')
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true })

  fs.writeFileSync(path.join(docsDir, 'ESTADO_ACTUAL.md'), content)

  console.log('✅ docs/ESTADO_ACTUAL.md actualizado')
  console.log(`   Commit: ${hash.substring(0,7)} — "${message}"`)
  console.log(`   Páginas detectadas: ${pages.length}`)
} catch(err) {
  console.error('❌ Error:', err.message)
}
