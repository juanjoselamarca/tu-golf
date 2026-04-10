# Integración FedeGolf — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar datos de canchas de la Federación Chilena de Golf en Golfers+, rediseñar la selección de cancha, y preparar sync de índice WHS para la sesión del PM.

**Architecture:** Migración SQL para extender tablas existentes (courses, course_tees) con campos de fedegolf. Script de descarga única que llama a los endpoints AJAX de fedegolf.cl para obtener las ~54 canchas con slope/rating por tee. Nuevo componente CourseSelector que reemplaza el autocomplete actual con una UX de dos niveles (club > cancha) para canchas federadas + fallback de búsqueda libre. API route proxy para consultar índice WHS en tiempo real usando sesión almacenada.

**Tech Stack:** Next.js 14, Supabase (PostgreSQL), TypeScript, Tailwind CSS

---

## File Map

### Nuevos archivos:
- `supabase/migrations/021_fedegolf_integration.sql` — migración BD
- `scripts/fedegolf-sync.ts` — script descarga única de canchas
- `src/lib/fedegolf/client.ts` — cliente HTTP para fedegolf.cl
- `src/lib/fedegolf/types.ts` — tipos de la integración
- `src/components/CourseSelector.tsx` — nuevo componente de selección de cancha
- `src/app/api/fedegolf/sync-indice/route.ts` — proxy índice WHS
- `src/app/api/fedegolf/vincular/route.ts` — vincular cuenta fedegolf
- `src/tests/fedegolf-client.test.ts` — tests del cliente
- `src/tests/course-selector.test.ts` — tests del componente

### Archivos a modificar:
- `src/app/ronda-libre/nueva/page.tsx` — reemplazar selección de cancha
- `src/golf/courses/types.ts` — agregar tipos fedegolf
- `src/golf/courses/data.ts` — agregar query de canchas federadas

---

## Task 1: Migración SQL — Extender schema para FedeGolf

**Files:**
- Create: `supabase/migrations/021_fedegolf_integration.sql`

- [ ] **Step 1: Crear la migración**

```sql
-- ============================================================
-- 021 — Integración FedeGolf
-- Extiende courses y course_tees con datos de la Federación
-- Agrega tabla indice_historial para tracking de índice WHS
-- Agrega tabla fedegolf_credentials para vinculación de cuenta
-- ============================================================

-- 1. Campos fedegolf en courses
ALTER TABLE courses ADD COLUMN IF NOT EXISTS fedegolf_club_id INTEGER;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS fedegolf_cancha_id INTEGER;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS fedegolf_synced_at TIMESTAMPTZ;

-- Índice para buscar canchas por club fedegolf
CREATE INDEX IF NOT EXISTS idx_courses_fedegolf_club
  ON courses(fedegolf_club_id) WHERE fedegolf_club_id IS NOT NULL;

-- 2. Campo fuente en course_tees (course_holes ya se maneja con fuente en courses)
ALTER TABLE course_tees ADD COLUMN IF NOT EXISTS fuente TEXT DEFAULT 'manual';

-- 3. Tabla historial de índice WHS
CREATE TABLE IF NOT EXISTS indice_historial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  indice DECIMAL(4,1) NOT NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  fuente TEXT NOT NULL DEFAULT 'manual'
    CHECK (fuente IN ('manual', 'fedegolf_sync', 'import')),
  UNIQUE(user_id, fecha, fuente)
);

CREATE INDEX IF NOT EXISTS idx_indice_historial_user
  ON indice_historial(user_id, fecha DESC);

-- RLS: usuario solo ve su propio historial
ALTER TABLE indice_historial ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own indice_historial"
  ON indice_historial FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Service role inserts indice_historial"
  ON indice_historial FOR INSERT
  WITH CHECK (true);

-- 4. Tabla credenciales fedegolf (encriptadas)
CREATE TABLE IF NOT EXISTS fedegolf_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  rut_encrypted TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  ultimo_sync TIMESTAMPTZ,
  ultimo_indice DECIMAL(4,1),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: usuario solo ve/modifica su propia vinculación
ALTER TABLE fedegolf_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own fedegolf_credentials"
  ON fedegolf_credentials FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 2: Ejecutar migración contra Supabase**

Run: `npx supabase db push` o ejecutar SQL directo via dashboard/CLI.
Expected: 4 ALTER TABLE + 1 CREATE INDEX + 2 CREATE TABLE exitosos, 0 errores.

- [ ] **Step 3: Verificar schema**

Run SQL en Supabase:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'courses' AND column_name LIKE 'fedegolf%';
```
Expected: 3 filas (fedegolf_club_id, fedegolf_cancha_id, fedegolf_synced_at).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/021_fedegolf_integration.sql
git commit -m "feat(db): migración 021 — schema para integración FedeGolf"
```

---

## Task 2: Cliente HTTP FedeGolf

**Files:**
- Create: `src/lib/fedegolf/types.ts`
- Create: `src/lib/fedegolf/client.ts`

- [ ] **Step 1: Crear tipos**

```typescript
// src/lib/fedegolf/types.ts

export interface FedegolfClub {
  id: number
  nombre: string
}

export interface FedegolfCancha {
  id: number
  nombre: string
  club_id: number
  par: number | null
}

export interface FedegolfTee {
  color: string        // 'azul' | 'blanco' | 'rojo' | 'negro' | 'dorado'
  slope: number | null
  rating: number | null
  handicap: number | null
}

export interface FedegolfCanchaCompleta {
  cancha: FedegolfCancha
  tees: FedegolfTee[]
}

export interface FedegolfIndice {
  rut: string
  nombre: string
  indice: number
}

export interface FedegolfSession {
  cookie: string
}

// Los 54 clubes federados con sus IDs en el sistema fedegolf
export const FEDEGOLF_CLUBES: FedegolfClub[] = [
  { id: 31, nombre: 'A.A. Antofagasta' },
  { id: 72, nombre: 'C.C. Bellavista' },
  { id: 41, nombre: 'C.C. Coya' },
  { id: 18, nombre: 'C.C. Granadilla' },
  { id: 43, nombre: 'C.C. La Posada' },
  { id: 49, nombre: 'C.C. Osorno' },
  { id: 23, nombre: 'C.C. Pan De Azucar' },
  { id: 51, nombre: 'C.G. 7 Rios' },
  { id: 57, nombre: 'C.G. Angostura' },
  { id: 79, nombre: 'C.G. Bahía Coique' },
  { id: 36, nombre: 'C.G. Barquito Chanaral' },
  { id: 21, nombre: 'C.G. Cachagua' },
  { id: 27, nombre: 'C.G. Costa Cachagua' },
  { id: 50, nombre: 'C.G. El Alba' },
  { id: 26, nombre: 'C.G. Huinganal' },
  { id: 3, nombre: 'C.G. La Dehesa' },
  { id: 24, nombre: 'C.G. La Serena' },
  { id: 12, nombre: 'C.G. Las Araucarias' },
  { id: 6, nombre: 'C.G. Las Brisas De Chicureo' },
  { id: 16, nombre: 'C.G. Las Brisas De Santo Domingo' },
  { id: 7, nombre: 'C.G. Lomas De La Dehesa' },
  { id: 5, nombre: 'C.G. Los Leones' },
  { id: 14, nombre: 'C.G. Los Lirios Rancagua' },
  { id: 58, nombre: 'C.G. Mapocho' },
  { id: 25, nombre: 'C.G. Papudo' },
  { id: 53, nombre: 'C.G. Rinconada De Chillán' },
  { id: 28, nombre: 'C.G. Rio Blanco' },
  { id: 33, nombre: 'C.G. Rio Lluta' },
  { id: 38, nombre: 'C.G. Rio Loa' },
  { id: 17, nombre: 'C.G. Rocas De Santo Domingo' },
  { id: 22, nombre: 'C.G. Santa Augusta' },
  { id: 2, nombre: 'C.G. Sport Francés' },
  { id: 37, nombre: 'C.G. Tocopilla' },
  { id: 8, nombre: 'C.G. Valle Escondido' },
  { id: 56, nombre: 'C.G.P. El Principal' },
  { id: 19, nombre: 'C.N.C. Las Salinas' },
  { id: 44, nombre: 'C.N.C. Tumbes' },
  { id: 15, nombre: 'Cancha Internacional' },
  { id: 1, nombre: 'Club De Polo y Equitacion S.C.' },
  { id: 9, nombre: 'Hacienda Chicureo C.G.' },
  { id: 10, nombre: 'Hacienda Santa Martina' },
  { id: 35, nombre: 'Iquique C.C.' },
  { id: 54, nombre: 'Magallanes G.C.' },
  { id: 20, nombre: 'Marbella C.C.' },
  { id: 30, nombre: 'Marina Golf Rapel' },
  { id: 75, nombre: 'Nevados de Villarica' },
  { id: 46, nombre: 'Nueva Frontera C.C.' },
  { id: 73, nombre: 'Patagonia Virgin Frutillar' },
  { id: 4, nombre: 'Prince Of Wales C.C.' },
  { id: 34, nombre: 'Quinteros Golf C.C.' },
  { id: 42, nombre: 'Talca C.C.' },
  { id: 48, nombre: 'Valdivia G.C.' },
]

// Excluir categorías especiales del sistema fedegolf
// (52=Fallecidos, 59=Federación, 60=Jugador Federado, 61=Profesionales, 66=Inactivos)
```

- [ ] **Step 2: Crear cliente HTTP**

```typescript
// src/lib/fedegolf/client.ts

import type {
  FedegolfSession,
  FedegolfCancha,
  FedegolfCanchaCompleta,
  FedegolfTee,
  FedegolfIndice,
} from './types'

const BASE_URL = 'https://www.fedegolf.cl'

/**
 * Login a fedegolf.cl — retorna cookie de sesión
 */
export async function fedegolfLogin(
  rut: string,
  password: string
): Promise<FedegolfSession> {
  // El login es un POST al formulario PHP que setea una cookie de sesión
  const res = await fetch(`${BASE_URL}/sistema/publico/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ rut, pass: password }),
    redirect: 'manual', // No seguir redirect, capturar cookie
  })

  const setCookie = res.headers.get('set-cookie')
  if (!setCookie) {
    throw new Error('Login fedegolf fallido: no se recibió cookie de sesión')
  }

  // Extraer PHPSESSID
  const match = setCookie.match(/PHPSESSID=([^;]+)/)
  if (!match) {
    throw new Error('Login fedegolf fallido: PHPSESSID no encontrado')
  }

  return { cookie: `PHPSESSID=${match[1]}` }
}

/**
 * Obtener canchas de un club via AJAX service
 */
export async function fedegolfGetCanchas(
  session: FedegolfSession,
  clubId: number
): Promise<FedegolfCancha[]> {
  const res = await fetch(
    `${BASE_URL}/sistema/admin/modMantenedorCanchas/ajax.php`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: session.cookie,
      },
      body: new URLSearchParams({
        accion: 'getCanchas',
        club: String(clubId),
      }),
    }
  )

  if (!res.ok) throw new Error(`fedegolf getCanchas failed: ${res.status}`)
  const data = await res.json()

  // El response es un array de objetos con id/nombre
  return (data || []).map((c: Record<string, unknown>) => ({
    id: Number(c.id ?? c.id_cancha),
    nombre: String(c.nombre ?? c.cancha ?? ''),
    club_id: clubId,
    par: c.par ? Number(c.par) : null,
  }))
}

/**
 * Obtener info de cancha (slope, rating por tee)
 */
export async function fedegolfGetInfoCancha(
  session: FedegolfSession,
  canchaId: number
): Promise<FedegolfTee[]> {
  const res = await fetch(
    `${BASE_URL}/sistema/admin/modMantenedorCanchas/json.php`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: session.cookie,
      },
      body: new URLSearchParams({
        accion: 'getInfoCancha',
        cancha: String(canchaId),
      }),
    }
  )

  if (!res.ok) throw new Error(`fedegolf getInfoCancha failed: ${res.status}`)
  const data = await res.json()

  const colores = ['azul', 'blanco', 'rojo', 'negro', 'dorado'] as const
  const tees: FedegolfTee[] = []

  for (const color of colores) {
    const slope = data[`sl_${color === 'dorado' ? 'rojov' : color}`]
    const rating = data[`rt_${color === 'dorado' ? 'rojov' : color}`]
    if (slope || rating) {
      tees.push({
        color,
        slope: slope ? Number(slope) : null,
        rating: rating ? Number(rating) : null,
        handicap: null,
      })
    }
  }

  return tees
}

/**
 * Obtener índice WHS de un jugador por RUT
 */
export async function fedegolfGetIndice(
  session: FedegolfSession,
  rut: string
): Promise<FedegolfIndice | null> {
  const res = await fetch(
    `${BASE_URL}/sistema/publico/modVeinteMejoresPalos/json.php`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: session.cookie,
      },
      body: new URLSearchParams({
        accion: 'getIndice',
        rut,
      }),
    }
  )

  if (!res.ok) return null
  const data = await res.json()

  if (!data || data.error) return null

  return {
    rut,
    nombre: String(data.nombre ?? ''),
    indice: Number(data.indice ?? 0),
  }
}

/**
 * Descarga completa: todas las canchas de todos los clubes con sus tees
 */
export async function fedegolfDownloadAll(
  session: FedegolfSession,
  onProgress?: (club: string, done: number, total: number) => void
): Promise<FedegolfCanchaCompleta[]> {
  const { FEDEGOLF_CLUBES } = await import('./types')
  const results: FedegolfCanchaCompleta[] = []

  for (let i = 0; i < FEDEGOLF_CLUBES.length; i++) {
    const club = FEDEGOLF_CLUBES[i]
    onProgress?.(club.nombre, i + 1, FEDEGOLF_CLUBES.length)

    const canchas = await fedegolfGetCanchas(session, club.id)

    for (const cancha of canchas) {
      // Esperar 500ms entre requests para no sobrecargar
      await new Promise(r => setTimeout(r, 500))
      const tees = await fedegolfGetInfoCancha(session, cancha.id)
      results.push({ cancha, tees })
    }

    // Esperar 1s entre clubes
    await new Promise(r => setTimeout(r, 1000))
  }

  return results
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/fedegolf/types.ts src/lib/fedegolf/client.ts
git commit -m "feat(fedegolf): cliente HTTP + tipos para integración con Federación"
```

---

## Task 3: Script de descarga única de canchas

**Files:**
- Create: `scripts/fedegolf-sync.ts`

- [ ] **Step 1: Crear el script**

```typescript
// scripts/fedegolf-sync.ts
//
// Uso: npx tsx scripts/fedegolf-sync.ts
//
// Requiere en .env.local:
//   FEDEGOLF_RUT=12345678-9
//   FEDEGOLF_PASSWORD=xxxx
//   NEXT_PUBLIC_SUPABASE_URL=...
//   SUPABASE_SERVICE_ROLE_KEY=...

import { createClient } from '@supabase/supabase-js'
import {
  fedegolfLogin,
  fedegolfDownloadAll,
} from '../src/lib/fedegolf/client'
import { FEDEGOLF_CLUBES } from '../src/lib/fedegolf/types'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const RUT = process.env.FEDEGOLF_RUT!
const PASS = process.env.FEDEGOLF_PASSWORD!

async function main() {
  if (!RUT || !PASS) {
    console.error('ERROR: FEDEGOLF_RUT y FEDEGOLF_PASSWORD requeridos en .env.local')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // 1. Login a fedegolf
  console.log('🔐 Conectando a fedegolf.cl...')
  const session = await fedegolfLogin(RUT, PASS)
  console.log('✅ Sesión iniciada')

  // 2. Descargar todas las canchas
  console.log('📥 Descargando canchas de', FEDEGOLF_CLUBES.length, 'clubes...')
  const allCanchas = await fedegolfDownloadAll(session, (club, done, total) => {
    console.log(`  [${done}/${total}] ${club}`)
  })

  console.log(`📊 Total canchas encontradas: ${allCanchas.length}`)

  // 3. Insertar en Supabase
  let inserted = 0
  let skipped = 0

  for (const { cancha, tees } of allCanchas) {
    const clubInfo = FEDEGOLF_CLUBES.find(c => c.id === cancha.club_id)
    const nombreCompleto = clubInfo
      ? `${clubInfo.nombre} - ${cancha.nombre}`
      : cancha.nombre

    // Verificar si ya existe
    const { data: existing } = await supabase
      .from('courses')
      .select('id')
      .eq('fedegolf_club_id', cancha.club_id)
      .eq('fedegolf_cancha_id', cancha.id)
      .maybeSingle()

    if (existing) {
      // Actualizar
      await supabase
        .from('courses')
        .update({
          nombre: nombreCompleto,
          par_total: cancha.par,
          fuente: 'fedegolf',
          datos_verificados: true,
          fedegolf_synced_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      // Borrar tees viejos y reinsertar
      await supabase.from('course_tees').delete().eq('course_id', existing.id).eq('fuente', 'fedegolf')

      if (tees.length > 0) {
        await supabase.from('course_tees').insert(
          tees.filter(t => t.slope || t.rating).map(t => ({
            course_id: existing.id,
            nombre: t.color.charAt(0).toUpperCase() + t.color.slice(1),
            slope: t.slope,
            rating: t.rating,
            genero: t.color === 'rojo' ? 'F' : 'M',
            fuente: 'fedegolf',
          }))
        )
      }

      skipped++
    } else {
      // Insertar cancha nueva
      const { data: newCourse, error } = await supabase
        .from('courses')
        .insert({
          nombre: nombreCompleto,
          pais: 'Chile',
          par_total: cancha.par,
          fuente: 'fedegolf',
          fuente_id: String(cancha.id),
          activa: true,
          datos_verificados: true,
          tipo_recorrido: '18h',
          fedegolf_club_id: cancha.club_id,
          fedegolf_cancha_id: cancha.id,
          fedegolf_synced_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (error) {
        console.error(`  ❌ Error insertando ${nombreCompleto}:`, error.message)
        continue
      }

      // Insertar tees
      if (tees.length > 0 && newCourse) {
        await supabase.from('course_tees').insert(
          tees.filter(t => t.slope || t.rating).map(t => ({
            course_id: newCourse.id,
            nombre: t.color.charAt(0).toUpperCase() + t.color.slice(1),
            slope: t.slope,
            rating: t.rating,
            genero: t.color === 'rojo' ? 'F' : 'M',
            fuente: 'fedegolf',
          }))
        )
      }

      inserted++
    }
  }

  console.log('\n✅ Sync completado:')
  console.log(`   Nuevas: ${inserted}`)
  console.log(`   Actualizadas: ${skipped}`)
  console.log(`   Total en BD: ${inserted + skipped}`)
}

main().catch(err => {
  console.error('💥 Error fatal:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Agregar FEDEGOLF_RUT y FEDEGOLF_PASSWORD a .env.local**

Juanjo debe agregar sus credenciales:
```
FEDEGOLF_RUT=XXXXXXXX-X
FEDEGOLF_PASSWORD=XXXXXXXX
```

- [ ] **Step 3: Ejecutar el script y verificar**

Run: `npx tsx scripts/fedegolf-sync.ts`
Expected: Descarga progresiva de los 54 clubes, inserción exitosa en Supabase.

Verificar en Supabase:
```sql
SELECT nombre, fedegolf_club_id, fedegolf_synced_at
FROM courses WHERE fuente = 'fedegolf' LIMIT 10;

SELECT c.nombre, ct.nombre as tee, ct.slope, ct.rating
FROM courses c JOIN course_tees ct ON ct.course_id = c.id
WHERE c.fuente = 'fedegolf' LIMIT 20;
```

- [ ] **Step 4: Commit**

```bash
git add scripts/fedegolf-sync.ts
git commit -m "feat(fedegolf): script descarga única de canchas federadas"
```

---

## Task 4: API Routes — Vincular cuenta y sync de índice

**Files:**
- Create: `src/app/api/fedegolf/vincular/route.ts`
- Create: `src/app/api/fedegolf/sync-indice/route.ts`

- [ ] **Step 1: Crear endpoint de vinculación**

```typescript
// src/app/api/fedegolf/vincular/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { fedegolfLogin, fedegolfGetIndice } from '@/lib/fedegolf/client'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const ENCRYPTION_KEY = process.env.FEDEGOLF_ENCRYPTION_KEY || ''
const ALGORITHM = 'aes-256-gcm'

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')
  return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

export function decrypt(encrypted: string): string {
  const [ivHex, authTagHex, data] = encrypted.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(data, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

export async function POST(req: NextRequest) {
  if (!ENCRYPTION_KEY) {
    return NextResponse.json({ error: 'Encryption no configurada' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { rut, password } = await req.json()
  if (!rut || !password) {
    return NextResponse.json({ error: 'RUT y contraseña requeridos' }, { status: 400 })
  }

  try {
    // Verificar login en fedegolf
    const session = await fedegolfLogin(rut, password)

    // Obtener índice actual
    const indiceData = await fedegolfGetIndice(session, rut)

    // Guardar credenciales encriptadas
    const { error } = await supabase.from('fedegolf_credentials').upsert({
      user_id: user.id,
      rut_encrypted: encrypt(rut),
      password_encrypted: encrypt(password),
      activo: true,
      ultimo_sync: new Date().toISOString(),
      ultimo_indice: indiceData?.indice ?? null,
    }, { onConflict: 'user_id' })

    if (error) throw error

    // Actualizar indice en profiles
    if (indiceData?.indice != null) {
      await supabase
        .from('profiles')
        .update({ indice: indiceData.indice })
        .eq('id', user.id)

      // Registrar en historial
      await supabase.from('indice_historial').insert({
        user_id: user.id,
        indice: indiceData.indice,
        fuente: 'fedegolf_sync',
      })
    }

    return NextResponse.json({
      ok: true,
      indice: indiceData?.indice ?? null,
      nombre: indiceData?.nombre ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: `Login fedegolf fallido: ${message}` }, { status: 400 })
  }
}

// Desvincular
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  await supabase.from('fedegolf_credentials').delete().eq('user_id', user.id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Crear endpoint de sync de índice**

```typescript
// src/app/api/fedegolf/sync-indice/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { fedegolfLogin, fedegolfGetIndice } from '@/lib/fedegolf/client'
import { decrypt } from '@/app/api/fedegolf/vincular/route'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Obtener credenciales guardadas
  const { data: creds } = await supabase
    .from('fedegolf_credentials')
    .select('*')
    .eq('user_id', user.id)
    .eq('activo', true)
    .maybeSingle()

  if (!creds) {
    return NextResponse.json({ error: 'Cuenta fedegolf no vinculada' }, { status: 404 })
  }

  // Rate limit: no más de 1 sync cada 4 horas
  if (creds.ultimo_sync) {
    const lastSync = new Date(creds.ultimo_sync).getTime()
    const fourHours = 4 * 60 * 60 * 1000
    if (Date.now() - lastSync < fourHours) {
      return NextResponse.json({
        ok: true,
        indice: creds.ultimo_indice,
        cached: true,
      })
    }
  }

  try {
    const rut = decrypt(creds.rut_encrypted)
    const password = decrypt(creds.password_encrypted)

    const session = await fedegolfLogin(rut, password)
    const indiceData = await fedegolfGetIndice(session, rut)

    if (!indiceData) {
      return NextResponse.json({ error: 'No se pudo obtener índice' }, { status: 502 })
    }

    const indiceCambio = creds.ultimo_indice !== indiceData.indice

    // Actualizar credenciales con último sync
    await supabase
      .from('fedegolf_credentials')
      .update({
        ultimo_sync: new Date().toISOString(),
        ultimo_indice: indiceData.indice,
      })
      .eq('user_id', user.id)

    // Actualizar profiles.indice
    await supabase
      .from('profiles')
      .update({ indice: indiceData.indice })
      .eq('id', user.id)

    // Si cambió, registrar en historial
    if (indiceCambio) {
      await supabase.from('indice_historial').insert({
        user_id: user.id,
        indice: indiceData.indice,
        fuente: 'fedegolf_sync',
      })
    }

    return NextResponse.json({
      ok: true,
      indice: indiceData.indice,
      cambio: indiceCambio,
      cached: false,
    })
  } catch (err) {
    // Si falla el login, no desactivar automáticamente — podría ser error temporal
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json(
      { error: message, indice: creds.ultimo_indice },
      { status: 502 }
    )
  }
}
```

- [ ] **Step 3: Agregar FEDEGOLF_ENCRYPTION_KEY a .env.local**

Generar clave:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Agregar a .env.local: `FEDEGOLF_ENCRYPTION_KEY=<resultado>`

- [ ] **Step 4: Verificar TypeScript compila**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/fedegolf/
git commit -m "feat(fedegolf): API vincular cuenta + sync índice WHS"
```

---

## Task 5: Rediseño CourseSelector

**Files:**
- Create: `src/components/CourseSelector.tsx`

- [ ] **Step 1: Crear el componente**

El nuevo CourseSelector reemplaza completamente la UX actual de selección de cancha.
Diseño: Dos modos en tabs — "Canchas Oficiales" (federadas) y "Buscar cancha".

```typescript
// src/components/CourseSelector.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

interface CourseOption {
  id: string
  nombre: string
  ciudad: string | null
  par_total: number | null
  fuente: string | null
  datos_verificados: boolean | null
  fedegolf_club_id: number | null
}

interface CourseSelectorProps {
  onSelect: (course: {
    id: string | null
    nombre: string
    par_total: number | null
    fuente: string | null
  }) => void
  initialValue?: string
}

export default function CourseSelector({ onSelect, initialValue }: CourseSelectorProps) {
  const [mode, setMode] = useState<'oficial' | 'buscar'>('oficial')
  const [clubFilter, setClubFilter] = useState('')
  const [canchaFilter, setCanchaFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState(initialValue || '')

  // Datos
  const [clubes, setClubes] = useState<{ id: number; nombre: string; count: number }[]>([])
  const [canchasClub, setCanchasClub] = useState<CourseOption[]>([])
  const [searchResults, setSearchResults] = useState<CourseOption[]>([])
  const [selectedClub, setSelectedClub] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const searchTimeout = useRef<NodeJS.Timeout>()
  const supabase = createClient()

  // Cargar clubes federados agrupados
  useEffect(() => {
    async function loadClubes() {
      const { data } = await supabase
        .from('courses')
        .select('fedegolf_club_id, nombre')
        .not('fedegolf_club_id', 'is', null)
        .eq('activa', true)
        .order('nombre')

      if (!data) return

      // Agrupar por club
      const clubMap = new Map<number, { nombre: string; count: number }>()
      for (const row of data) {
        const clubId = row.fedegolf_club_id!
        // Extraer nombre del club (antes del " - ")
        const clubNombre = row.nombre.split(' - ')[0] || row.nombre
        const existing = clubMap.get(clubId)
        if (existing) {
          existing.count++
        } else {
          clubMap.set(clubId, { nombre: clubNombre, count: 1 })
        }
      }

      setClubes(
        Array.from(clubMap.entries())
          .map(([id, info]) => ({ id, ...info }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre))
      )
    }
    loadClubes()
  }, [])

  // Cargar canchas de un club
  const loadCanchasClub = useCallback(async (clubId: number) => {
    setLoading(true)
    setSelectedClub(clubId)
    const { data } = await supabase
      .from('courses')
      .select('id, nombre, ciudad, par_total, fuente, datos_verificados, fedegolf_club_id')
      .eq('fedegolf_club_id', clubId)
      .eq('activa', true)
      .order('nombre')

    setCanchasClub(data || [])
    setLoading(false)
  }, [])

  // Búsqueda libre con debounce
  useEffect(() => {
    if (mode !== 'buscar' || searchQuery.length < 2) {
      setSearchResults([])
      return
    }

    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      const { data } = await supabase
        .from('courses')
        .select('id, nombre, ciudad, par_total, fuente, datos_verificados, fedegolf_club_id')
        .eq('activa', true)
        .ilike('nombre', `%${searchQuery}%`)
        .order('datos_verificados', { ascending: false })
        .limit(15)

      setSearchResults(data || [])
    }, 300)

    return () => clearTimeout(searchTimeout.current)
  }, [searchQuery, mode])

  const selectCourse = (course: CourseOption) => {
    onSelect({
      id: course.id,
      nombre: course.nombre,
      par_total: course.par_total,
      fuente: course.fuente,
    })
  }

  const selectCustom = (nombre: string) => {
    onSelect({ id: null, nombre, par_total: null, fuente: null })
  }

  // Filtrar clubes
  const filteredClubes = clubFilter
    ? clubes.filter(c => c.nombre.toLowerCase().includes(clubFilter.toLowerCase()))
    : clubes

  // Filtrar canchas del club
  const filteredCanchas = canchaFilter
    ? canchasClub.filter(c => c.nombre.toLowerCase().includes(canchaFilter.toLowerCase()))
    : canchasClub

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-800 rounded-lg p-1">
        <button
          type="button"
          onClick={() => setMode('oficial')}
          className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
            mode === 'oficial'
              ? 'bg-emerald-600 text-white'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          🏌️ Canchas Oficiales
        </button>
        <button
          type="button"
          onClick={() => setMode('buscar')}
          className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
            mode === 'buscar'
              ? 'bg-emerald-600 text-white'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          🔍 Buscar cancha
        </button>
      </div>

      {/* Modo Oficial: Club > Cancha */}
      {mode === 'oficial' && !selectedClub && (
        <div>
          <input
            type="text"
            placeholder="Filtrar clubes..."
            value={clubFilter}
            onChange={e => setClubFilter(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg
                       text-white placeholder-zinc-500 focus:border-emerald-500
                       focus:ring-1 focus:ring-emerald-500 outline-none mb-2"
          />
          <div className="max-h-64 overflow-y-auto space-y-1 rounded-lg">
            {filteredClubes.map(club => (
              <button
                key={club.id}
                type="button"
                onClick={() => loadCanchasClub(club.id)}
                className="w-full text-left px-3 py-2.5 bg-zinc-800/50 hover:bg-zinc-700
                           rounded-lg transition-colors flex justify-between items-center"
              >
                <span className="text-white text-sm">{club.nombre}</span>
                <span className="text-zinc-500 text-xs">{club.count} cancha{club.count > 1 ? 's' : ''}</span>
              </button>
            ))}
            {filteredClubes.length === 0 && (
              <p className="text-zinc-500 text-sm text-center py-4">No se encontraron clubes</p>
            )}
          </div>
        </div>
      )}

      {/* Modo Oficial: Canchas del club seleccionado */}
      {mode === 'oficial' && selectedClub && (
        <div>
          <button
            type="button"
            onClick={() => { setSelectedClub(null); setCanchasClub([]); setCanchaFilter('') }}
            className="text-emerald-400 text-sm mb-2 flex items-center gap-1 hover:underline"
          >
            ← Volver a clubes
          </button>

          {canchasClub.length > 3 && (
            <input
              type="text"
              placeholder="Filtrar canchas..."
              value={canchaFilter}
              onChange={e => setCanchaFilter(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg
                         text-white placeholder-zinc-500 focus:border-emerald-500
                         focus:ring-1 focus:ring-emerald-500 outline-none mb-2"
            />
          )}

          {loading ? (
            <div className="text-center py-4">
              <div className="animate-spin h-5 w-5 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto" />
            </div>
          ) : (
            <div className="space-y-1">
              {filteredCanchas.map(cancha => (
                <button
                  key={cancha.id}
                  type="button"
                  onClick={() => selectCourse(cancha)}
                  className="w-full text-left px-3 py-3 bg-zinc-800/50 hover:bg-zinc-700
                             rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                    <span className="text-white text-sm font-medium">
                      {cancha.nombre.split(' - ').slice(1).join(' - ') || cancha.nombre}
                    </span>
                  </div>
                  {cancha.par_total && (
                    <span className="text-zinc-500 text-xs ml-4">Par {cancha.par_total}</span>
                  )}
                </button>
              ))}
              {filteredCanchas.length === 0 && (
                <p className="text-zinc-500 text-sm text-center py-4">
                  No hay canchas cargadas para este club
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modo Búsqueda libre */}
      {mode === 'buscar' && (
        <div>
          <input
            type="text"
            placeholder="Nombre de la cancha..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg
                       text-white placeholder-zinc-500 focus:border-emerald-500
                       focus:ring-1 focus:ring-emerald-500 outline-none"
          />

          {searchResults.length > 0 && (
            <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
              {searchResults.map(course => (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => selectCourse(course)}
                  className="w-full text-left px-3 py-2.5 bg-zinc-800/50 hover:bg-zinc-700
                             rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      course.datos_verificados ? 'bg-emerald-500' : 'bg-amber-500'
                    }`} />
                    <span className="text-white text-sm">{course.nombre}</span>
                  </div>
                  {course.ciudad && (
                    <span className="text-zinc-500 text-xs ml-4">{course.ciudad}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Usar nombre custom */}
          {searchQuery.length >= 2 && (
            <button
              type="button"
              onClick={() => selectCustom(searchQuery)}
              className="w-full mt-2 px-3 py-2.5 border border-dashed border-zinc-600
                         rounded-lg text-zinc-400 text-sm hover:border-zinc-500 hover:text-zinc-300
                         transition-colors text-left"
            >
              Usar &quot;{searchQuery}&quot; como nombre de cancha
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar TypeScript compila**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/CourseSelector.tsx
git commit -m "feat(ui): nuevo CourseSelector con tabs oficial/búsqueda"
```

---

## Task 6: Integrar CourseSelector en página de nueva ronda

**Files:**
- Modify: `src/app/ronda-libre/nueva/page.tsx`

- [ ] **Step 1: Reemplazar la selección de cancha en Step 2**

En `nueva/page.tsx`, buscar el bloque que contiene el `<input>` de `canchaSearch` y todo el dropdown custom (aprox líneas 670-790). Reemplazar con:

```typescript
// Al inicio del archivo, agregar import:
import CourseSelector from '@/components/CourseSelector'
```

Eliminar:
- La constante `CANCHAS_CHILE` (líneas 10-70 aprox)
- Los estados `canchaSearch`, `showCanchaDropdown`, `coursesDB` (mantener `cancha`, `courseId`)
- Todo el JSX del input de búsqueda y dropdown custom

Reemplazar el bloque de selección de cancha con:

```tsx
<div className="mb-4">
  <label className="block text-sm font-medium text-zinc-400 mb-2">
    Cancha
  </label>
  <CourseSelector
    initialValue={cancha}
    onSelect={(course) => {
      setCancha(course.nombre)
      setCourseId(course.id)
      // Trigger carga de tees y hoyos si tiene id
      if (course.id) {
        loadCourseDetails(course.id)
      } else {
        setCourseTees([])
        setCourseLoops([])
        setSelectedTee('')
      }
    }}
  />
  {cancha && (
    <div className="mt-2 flex items-center gap-2">
      <span className="text-emerald-400 text-sm">✓ {cancha}</span>
      <button
        type="button"
        onClick={() => { setCancha(''); setCourseId(null) }}
        className="text-zinc-500 text-xs hover:text-zinc-300"
      >
        cambiar
      </button>
    </div>
  )}
</div>
```

- [ ] **Step 2: Verificar que los flujos existentes siguen funcionando**

Run: `npx tsc --noEmit`
Expected: 0 errores.

Run: `npm run build`
Expected: Build exitoso.

- [ ] **Step 3: Commit**

```bash
git add src/app/ronda-libre/nueva/page.tsx
git commit -m "feat(ui): integrar CourseSelector en creación de ronda"
```

---

## Task 7: Sync silencioso al abrir la app

**Files:**
- Modify: `src/app/layout.tsx` o crear `src/components/FedegolfSync.tsx`

- [ ] **Step 1: Crear componente de sync silencioso**

```typescript
// src/components/FedegolfSync.tsx
'use client'

import { useEffect, useRef } from 'react'

/**
 * Componente invisible que sincroniza el índice de fedegolf
 * al cargar la app. Se monta una vez en el layout.
 */
export default function FedegolfSync() {
  const synced = useRef(false)

  useEffect(() => {
    if (synced.current) return
    synced.current = true

    // Fire and forget — no bloquea nada
    fetch('/api/fedegolf/sync-indice', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.cambio) {
          console.log(`[FedegolfSync] Índice actualizado: ${data.indice}`)
        }
      })
      .catch(() => {
        // Silencioso — si falla no pasa nada
      })
  }, [])

  return null
}
```

- [ ] **Step 2: Montar en layout — PROTOCOLO ARCHIVO PROTEGIDO**

`src/app/layout.tsx` es archivo protegido. Cambio mínimo: agregar `<FedegolfSync />` dentro del body, después del Navbar.

```tsx
import FedegolfSync from '@/components/FedegolfSync'

// Dentro del body, después de <Navbar />:
<FedegolfSync />
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 errores.

- [ ] **Step 4: Commit individual (archivo protegido)**

```bash
git add src/components/FedegolfSync.tsx
git commit -m "feat(fedegolf): componente sync silencioso de índice"

git add src/app/layout.tsx
git commit -m "feat(layout): montar FedegolfSync en layout raíz"
```

---

## Task 8: Verificación end-to-end

- [ ] **Step 1: Verificar TypeScript**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 2: Ejecutar tests existentes**

Run: `npm run test`
Expected: 140+ tests pasando, 0 fallos.

- [ ] **Step 3: Build de producción**

Run: `npm run build`
Expected: Build exitoso, todas las rutas compiladas.

- [ ] **Step 4: Test manual del script de descarga**

Run: `npx tsx scripts/fedegolf-sync.ts`
Expected: Canchas descargadas e insertadas en Supabase.

Verificar en Supabase Dashboard:
1. `courses` tiene filas con `fuente = 'fedegolf'`
2. `course_tees` tiene slope/rating para esas canchas

- [ ] **Step 5: Test manual de la API de vinculación**

Desde el browser (o curl):
```bash
curl -X POST http://localhost:3000/api/fedegolf/vincular \
  -H "Content-Type: application/json" \
  -H "Cookie: <session>" \
  -d '{"rut":"XXXXXXXX-X","password":"XXXXXXXX"}'
```
Expected: `{"ok":true,"indice":XX.X,"nombre":"..."}`

- [ ] **Step 6: Test manual del CourseSelector**

1. Ir a `/ronda-libre/nueva`
2. En Step 2, verificar que aparecen las tabs "Canchas Oficiales" y "Buscar cancha"
3. Tab oficial: seleccionar un club → ver canchas → seleccionar una → verificar que slope/rating aparecen en los tees
4. Tab búsqueda: escribir un nombre → ver resultados → seleccionar
5. Crear una ronda completa con una cancha federada

- [ ] **Step 7: Deploy a producción**

```bash
git push origin main
```

Verificar en https://golfersplus.vercel.app que:
1. La página de nueva ronda carga correctamente
2. El CourseSelector muestra canchas federadas
3. Crear una ronda funciona end-to-end

---

## Variables de entorno necesarias

Agregar a `.env.local` y a Vercel:

```
FEDEGOLF_RUT=XXXXXXXX-X              # Solo para script de sync
FEDEGOLF_PASSWORD=XXXXXXXX            # Solo para script de sync
FEDEGOLF_ENCRYPTION_KEY=<64-hex>      # Para encriptar credenciales de usuarios
```

Generar encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Orden de ejecución y dependencias

```
Task 1 (SQL)
    ↓
Task 2 (Cliente HTTP)   → Task 3 (Script descarga) → ejecutar script
    ↓
Task 4 (API routes)
    ↓
Task 5 (CourseSelector)  → Task 6 (Integrar en nueva)
    ↓
Task 7 (Sync silencioso)
    ↓
Task 8 (Verificación E2E)
```

Tasks 2+5 pueden ejecutarse en paralelo.
Tasks 3+4 dependen de Task 2.
Task 6 depende de Task 5.
Task 7 depende de Task 4.
Task 8 es secuencial al final.
