/**
 * Runner de auditoría de modalidades de juego.
 *
 * Uso:
 *   npx tsx scripts/run-audit.ts [modalidad]
 *   npx tsx scripts/run-audit.ts all
 *
 * Ejemplos:
 *   npx tsx scripts/run-audit.ts stroke-play
 *   npx tsx scripts/run-audit.ts all
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const FORMATS = [
  'stroke-play',
  'stableford',
  'match-play',
  'best-ball',
  'scramble',
  'foursome',
]

function runCanary(formato: string): boolean {
  try {
    console.log(`\n🐤 Canary tests: ${formato}`)
    execSync(`npx vitest run src/__tests__/canary/${formato}.canary.test.ts`, {
      stdio: 'inherit',
    })
    return true
  } catch {
    console.error(`❌ Canary fallido para ${formato}`)
    return false
  }
}

function showChecklist(formato: string): void {
  const checklistPath = path.join('docs', 'audit', `checklist-${formato}.md`)
  if (fs.existsSync(checklistPath)) {
    console.log(`\n📋 Checklist manual pendiente:`)
    console.log(`   ${checklistPath}`)
    console.log(`   Abrir en editor y ejecutar paso por paso en producción.`)
  } else {
    console.warn(`⚠️  Sin checklist para ${formato}`)
  }
}

async function main() {
  const arg = process.argv[2] || 'all'
  const targets = arg === 'all' ? FORMATS : [arg]

  if (arg !== 'all' && !FORMATS.includes(arg)) {
    console.error(`❌ Modalidad desconocida: ${arg}`)
    console.error(`   Disponibles: ${FORMATS.join(', ')}, all`)
    process.exit(1)
  }

  let allPassed = true
  for (const f of targets) {
    const ok = runCanary(f)
    if (!ok) allPassed = false
    showChecklist(f)
  }

  console.log('\n' + '─'.repeat(50))
  if (allPassed) {
    console.log('✅ Todos los canarios pasaron.')
    console.log('👉 Ejecutar checklists manuales en producción.')
  } else {
    console.error('❌ Hay canarios fallidos. Arreglar antes de continuar.')
    process.exit(1)
  }
}

main()
