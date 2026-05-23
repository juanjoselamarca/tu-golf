#!/usr/bin/env node
/**
 * scripts/setup-e2e-user.mjs
 *
 * Crea (o confirma que existe) el test user persistente para E2E autenticados.
 * Idempotente: corre varias veces sin duplicar.
 *
 * El user vive en producción pero tiene un email reservado que indica su
 * naturaleza de test: e2e-test@golfersplus-test.local. Los tests autenticados
 * hacen login con este user. Cualquier data que los tests creen debe ser
 * limpiada por el mismo test (afterAll).
 *
 * Uso:
 *   node --env-file=.env.local scripts/setup-e2e-user.mjs
 *
 * Env requeridos:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (server-side only — bypassa RLS)
 *
 * Output:
 *   - Email del test user
 *   - Password (generada solo si es un user nuevo; sino reporta que existe)
 *   - Instrucción de cómo guardar credenciales en .env.local
 */

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('ERROR: Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const E2E_EMAIL = 'e2e-test@golfersplus-test.local'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  // 1. Buscar si ya existe (listar + filtrar por email)
  console.log(`[e2e-setup] Verificando si existe user: ${E2E_EMAIL}`)
  const { data: users, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) {
    console.error('ERROR listando users:', listErr.message)
    process.exit(1)
  }
  const existing = users?.users.find(u => u.email === E2E_EMAIL)

  if (existing) {
    console.log(`[e2e-setup] ✅ Test user ya existe (id=${existing.id.slice(0, 8)}...)`)
    console.log('')
    console.log('Si perdiste la password, la guardada en .env.local debería seguir siendo válida.')
    console.log('Si necesitás resetearla, borrá el user primero desde el dashboard de Supabase')
    console.log('y corré este script de nuevo.')
    // Aun si el user existe, asegurar seed del torneo previo (idempotente).
    await ensureSeedTournament(existing.id)
    return
  }

  // 2. Crear user con password generada
  const password = randomBytes(24).toString('base64url')
  console.log(`[e2e-setup] User no existe — creando...`)

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: E2E_EMAIL,
    password,
    email_confirm: true, // skip verification link
    user_metadata: {
      name: 'E2E Test User',
      e2e: true,
    },
  })

  if (createErr) {
    console.error('ERROR creando user:', createErr.message)
    process.exit(1)
  }

  // 3. Crear perfil básico (si la app requiere profiles.id = auth.users.id)
  const userId = created.user.id
  const { error: profileErr } = await admin
    .from('profiles')
    .upsert({
      id: userId,
      email: E2E_EMAIL,
      name: 'E2E Test',
      role: 'player',
    }, { onConflict: 'id' })

  if (profileErr) {
    console.warn(`[e2e-setup] Aviso: no se pudo upsert profile (${profileErr.message}) — continuando`)
  }

  // 4. Seed: asegurar 1 torneo previo existe (necesario para el test
  //    organizar-campeonato-modal-duplicar.spec.ts, que skipea si el user
  //    no tiene torneos previos). Audit 2026-05-17 gap.
  await ensureSeedTournament(userId)

  console.log('')
  console.log('┌─────────────────────────────────────────────────────────────────┐')
  console.log('│ ✅ Test user creado                                             │')
  console.log('├─────────────────────────────────────────────────────────────────┤')
  console.log(`│ Email:    ${E2E_EMAIL.padEnd(52)} │`)
  console.log(`│ Password: ${password.padEnd(52)} │`)
  console.log('│                                                                 │')
  console.log('│ Agregar a .env.local:                                           │')
  console.log('│   E2E_TEST_USER_EMAIL=' + E2E_EMAIL.padEnd(40) + '  │')
  console.log(`│   E2E_TEST_USER_PASSWORD=${password.padEnd(37)}  │`)
  console.log('└─────────────────────────────────────────────────────────────────┘')
}

/**
 * Idempotente: chequea que el test user tenga al menos 1 torneo previo.
 * Si no, crea uno mínimo marcado es_demo=true para que el modal
 * "Duplicar desde torneo previo" tenga algo que mostrar.
 *
 * Cierra el gap del audit 2026-05-17 §5 (modal-duplicar.spec.ts:29 skipeaba
 * porque el test user no tenía torneos previos).
 */
async function ensureSeedTournament(userId) {
  const { data: existing, error: queryErr } = await admin
    .from('tournaments')
    .select('id, slug')
    .eq('organizer_id', userId)
    .limit(1)

  if (queryErr) {
    console.warn(`[e2e-setup] Aviso: no se pudo verificar torneos previos (${queryErr.message}) — saltando seed`)
    return
  }

  if (existing && existing.length > 0) {
    console.log(`[e2e-setup] ✅ Test user ya tiene ${existing.length} torneo(s) previo(s) — seed no necesario`)
    return
  }

  // Crear torneo mínimo viable, marcado es_demo=true para no contaminar stats reales.
  const slug = `e2e-seed-torneo-${randomBytes(4).toString('hex')}`
  const { error: insertErr } = await admin
    .from('tournaments')
    .insert({
      name: 'Torneo Seed E2E',
      slug,
      organizer_id: userId,
      date_start: new Date().toISOString().slice(0, 10),
      format: 'stroke_play',
      formato_juego: 'stroke_play',
      modo_juego: 'gross',
      hole_count: 18,
      status: 'draft',
      es_demo: true,
    })

  if (insertErr) {
    console.warn(`[e2e-setup] Aviso: no se pudo crear seed tournament (${insertErr.message}) — el test modal-duplicar seguirá skipeando`)
    return
  }

  console.log(`[e2e-setup] ✅ Seed tournament creado (slug=${slug})`)
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
