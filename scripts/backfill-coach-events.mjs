#!/usr/bin/env node
/**
 * Backfill coach_events para que el Admin Brain muestre historia coherente
 * desde la primera ronda de cada usuario, no solo desde que el cerebro v2
 * empezó a operar.
 *
 * Para cada usuario con >0 rondas:
 *   - 1 evento 'round_processed' por cada historical_round y ronda_libre finalizada.
 *   - 1 evento 'pattern_detected' por cada player_pattern activo.
 *
 * Idempotente: usa ON CONFLICT DO NOTHING basado en hash de payload+timestamp.
 * (Como coach_events tiene BIGSERIAL PK, no hay UPSERT natural — usamos
 * exists check antes de insertar para evitar duplicados al re-correr.)
 *
 * Uso: node --env-file=.env.local scripts/backfill-coach-events.mjs [--dry-run] [--limit=N]
 *
 * Spec: docs/superpowers/plans/2026-05-05-cerebro-v2.md §6.4
 */

import { createClient } from '@supabase/supabase-js'

const args = new Set(process.argv.slice(2))
const DRY = args.has('--dry-run')
const limitArg = process.argv.find(a => a.startsWith('--limit='))
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : null

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}
const supabase = createClient(url, key)

console.log(`[backfill] start ${DRY ? '(DRY RUN)' : '(WRITE)'} limit=${LIMIT ?? 'all'}`)

const { data: users, error: usersErr } = await supabase
  .from('profiles')
  .select('id, name')
  .order('created_at')
if (usersErr) { console.error('error users:', usersErr); process.exit(1) }

let totalInserts = 0
let processed = 0

for (const u of users ?? []) {
  if (LIMIT && processed >= LIMIT) break
  processed++

  const inserts = []

  // historical_rounds
  const { data: hrs } = await supabase
    .from('historical_rounds')
    .select('id, played_at, course_name, total_gross')
    .eq('user_id', u.id)
  for (const r of hrs ?? []) {
    inserts.push({
      user_id: u.id,
      type: 'round_processed',
      payload: {
        round_source: 'historical_round',
        historical_round_id: r.id,
        course_name: r.course_name,
        total_gross: r.total_gross,
        played_at: r.played_at,
        backfilled: true,
      },
      created_at: r.played_at ?? new Date().toISOString(),
    })
  }

  // rondas_libres finalizadas
  const { data: rls } = await supabase
    .from('rondas_libres')
    .select('id, fecha, course_name, estado')
    .eq('estado', 'finalizada')
  for (const rl of rls ?? []) {
    // Solo si el usuario participó
    const { data: jug } = await supabase
      .from('ronda_libre_jugadores')
      .select('id, scores')
      .eq('ronda_id', rl.id)
      .eq('user_id', u.id)
      .maybeSingle()
    if (!jug) continue
    inserts.push({
      user_id: u.id,
      type: 'round_processed',
      payload: {
        round_source: 'ronda_libre',
        ronda_libre_id: rl.id,
        course_name: rl.course_name,
        played_at: rl.fecha,
        backfilled: true,
      },
      created_at: rl.fecha ?? new Date().toISOString(),
    })
  }

  // player_patterns activos
  const { data: pats } = await supabase
    .from('player_patterns')
    .select('id, pattern_type, confidence, data_points, created_at')
    .eq('user_id', u.id)
    .eq('status', 'active')
  for (const p of pats ?? []) {
    inserts.push({
      user_id: u.id,
      type: 'pattern_detected',
      payload: {
        pattern_id: p.pattern_type,
        confidence: p.confidence,
        data_points: p.data_points,
        backfilled: true,
      },
      created_at: p.created_at,
    })
  }

  if (inserts.length === 0) continue

  // Idempotencia: verificar si ya existen eventos backfilled para este usuario
  const { count: existing } = await supabase
    .from('coach_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', u.id)
    .filter('payload->>backfilled', 'eq', 'true')
  if (existing && existing > 0) {
    console.log(`  ${u.name ?? u.id}: ya tiene ${existing} eventos backfilled, skip`)
    continue
  }

  if (DRY) {
    console.log(`  ${u.name ?? u.id}: ${inserts.length} eventos pendientes (dry)`)
    totalInserts += inserts.length
    continue
  }

  // Insertar en batches de 100 para no saturar
  for (let i = 0; i < inserts.length; i += 100) {
    const batch = inserts.slice(i, i + 100)
    const { error } = await supabase.from('coach_events').insert(batch)
    if (error) {
      console.error(`  ${u.name ?? u.id}: error batch ${i}: ${error.message}`)
      break
    }
  }
  console.log(`  ${u.name ?? u.id}: insertados ${inserts.length} eventos`)
  totalInserts += inserts.length
}

console.log(`[backfill] done. processed=${processed} usuarios, total_inserts=${totalInserts}${DRY ? ' (dry)' : ''}`)
