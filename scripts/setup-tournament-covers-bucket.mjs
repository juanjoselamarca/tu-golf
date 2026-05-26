#!/usr/bin/env node
/**
 * Crea el bucket `tournament-covers` en Supabase Storage (idempotente).
 *
 * - Público (cualquiera con la URL puede ver — las portadas se sirven en cards
 *   de torneos y en la página /torneo/[slug] sin requerir auth).
 * - Límite 5MB por archivo, MIMEs limitados a image/jpeg|png|webp.
 * - INSERT se restringe vía API route (que usa service role); no hace falta
 *   exponer storage al cliente.
 *
 * Correr una vez: `node --env-file=.env.local scripts/setup-tournament-covers-bucket.mjs`
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const sb = createClient(url, key)

const BUCKET = 'tournament-covers'
const OPTS = {
  public: true,
  fileSizeLimit: 5 * 1024 * 1024, // 5MB
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
}

const { data: existing } = await sb.storage.getBucket(BUCKET)
if (existing) {
  console.log(`Bucket ${BUCKET} ya existe — actualizando opciones`)
  const { error } = await sb.storage.updateBucket(BUCKET, OPTS)
  if (error) { console.error(error); process.exit(1) }
} else {
  console.log(`Creando bucket ${BUCKET}`)
  const { error } = await sb.storage.createBucket(BUCKET, OPTS)
  if (error) { console.error(error); process.exit(1) }
}

console.log(`✅ Bucket ${BUCKET} listo (público, 5MB, jpeg/png/webp)`)
