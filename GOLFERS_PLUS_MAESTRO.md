# GOLFERS+ — ARCHIVO MAESTRO DE DESARROLLO
## Documento único de referencia para Claude Code
### Versión 2.0 · 25 marzo 2026 · Auditado contra producción real

> **INSTRUCCIÓN CRÍTICA PARA CLAUDE CODE:**
> Este es el documento más importante del proyecto.
> Léelo COMPLETO antes de ejecutar cualquier sprint.
> Contiene verdades verificadas en producción — no suposiciones.
> Antes de tocar cualquier archivo: GREP primero. Nunca adivinar.

---

# PARTE 1 — CONTEXTO DEL PROYECTO

## Identidad
App web progresiva (PWA) de golf para el jugador amateur serio de Chile y LatAm.
Scoring en tiempo real, estadísticas con GWI™, torneos, y coaching con tAIger+.

**Producción:** https://tu-golf.vercel.app
**Repo local:** C:\Users\Juan Jose Lamarca\OneDrive\Escritorio\Proyectos IA\tu-golf
**Supabase project ID:** hoswfwhvcgqlqdmzpnce
**Abrir Claude Code:** claude --dangerously-skip-permissions

## Stack
```
Frontend:   Next.js 14 (App Router) + TypeScript + Tailwind CSS
Backend:    Next.js API Routes (serverless en Vercel)
BD:         Supabase Postgres + RLS + Realtime
Auth:       Supabase Auth (OAuth Google + magic link)
IA:         Anthropic Claude API — claude-sonnet-4-20250514
Deploy:     Vercel (auto-deploy en push a main)
```

## Convenciones ABSOLUTAS — nunca violar
```
Producto:         Golfers+ (nunca "Tu Golf" ni "TuGolf")
Coach IA:         tAIger+ (con +, con I mayúscula, SIN artículo "el")
Campo handicap:   profiles.indice (NUNCA handicap, NUNCA handicap_index)
Campo rol:        profiles.role = 'player'|'organizer'|'admin'
                  (NUNCA .rol, NUNCA 'usuario', NUNCA 'organizador' en español)
Status rondas:    SOLO 'in_progress'|'closed'|'official' (NUNCA 'completed')
Cancha columna:   courses.nombre (NUNCA name)
Hoyo columna:     course_holes.numero (NUNCA hole_number)
Arrays Supabase:  SIEMPRE (data ?? []).map() — NUNCA data.map()
Mobile-first:     390px base, touch targets 44px mínimo
Idioma UI:        Español — nunca inglés visible al usuario
Formato fechas:   "24 mar 2026" (NUNCA "2026-03-24")
Scores en UI:     vs par: -2 · E · +1 (NUNCA gross absoluto)
Yardajes:         en yardas (NUNCA metros)
Commits:          npm run build exitoso ANTES de hacer commit
Docs:             node scripts/update-docs.js al finalizar cada sprint
```

## Estructura de carpetas confirmada
```
tu-golf/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Layout global (navbar, fonts, CSS vars)
│   │   ├── globals.css             # CSS variables + keyframes
│   │   ├── leaderboard/            # Demo leaderboard simulación en vivo
│   │   ├── demo/                   # Perfil público Carlos Méndez
│   │   ├── dashboard/
│   │   ├── perfil/                 # /perfil · /perfil/stats · /perfil/historial
│   │   ├── coach/                  # /coach · /sesion/nueva · /sesion/[id]
│   │   ├── ronda-libre/            # /ronda-libre/[codigo]/score
│   │   ├── torneo/[slug]/          # Leaderboard de torneo
│   │   ├── admin/                  # ✅ YA EXISTE: /admin · /admin/qa · /admin/sistema
│   │   ├── auth/callback/
│   │   └── api/
│   │       ├── demo/               # profile + players (públicas)
│   │       ├── game/               # POST scoring en vivo
│   │       ├── gwi/torneo/[slug]/
│   │       ├── taiger/             # chat · context · patterns
│   │       ├── push/               # subscribe · preferences
│   │       └── admin/health/       # ✅ YA EXISTE — proteger con auth
│   ├── components/
│   │   ├── Navbar.tsx
│   │   ├── Footer.tsx
│   │   ├── GWIDisplay.tsx          # ✅ YA EXISTE
│   │   └── HoleColorBar.tsx        # ✅ YA EXISTE
│   ├── hooks/
│   │   └── useDemoSimulation.ts    # ✅ YA EXISTE
│   ├── lib/
│   │   ├── admin.ts                # ✅ isAdmin() helper
│   │   ├── scoring.ts              # ✅ Stableford + strokes
│   │   ├── demo-simulation.ts      # ✅ generateHoleScore()
│   │   └── supabase.ts             # ✅ tipos BD + clientes
│   ├── scripts/
│   │   └── seed-demo-data.ts       # ✅ YA EXISTE
│   └── utils/supabase/
│       ├── client.ts               # ✅ Browser client
│       └── server.ts               # ✅ Server client
├── supabase/migrations/
├── scripts/update-docs.js          # ✅ YA EXISTE
├── middleware.ts                   # ✅ YA EXISTE — protege rutas
└── next.config.js                  # ✅ YA EXISTE — headers seguridad
```

## Schema de base de datos — COMPLETO Y VERIFICADO

### Rondas Libres (feature casual)
```sql
rondas_libres (
  id UUID, codigo TEXT UNIQUE,
  course_name TEXT, course_id UUID,
  tees TEXT, holes INTEGER DEFAULT 18,
  fecha TIMESTAMPTZ, estado TEXT,  -- 'in_progress'|'closed'
  modo_juego TEXT, hoyo_inicio INTEGER DEFAULT 1
)
ronda_libre_jugadores (
  id UUID, ronda_libre_id UUID REFERENCES rondas_libres(id),
  nombre TEXT, user_id UUID,
  scores JSONB  -- { "1": 4, "2": 5, ... "18": 4 }
)
```

### Torneos (feature competición)
```sql
tournaments (
  id UUID, nombre TEXT,  -- ⚠️ NO 'name'
  slug TEXT UNIQUE, fecha DATE, cancha TEXT,
  formato TEXT, holes INTEGER DEFAULT 18,
  status TEXT,  -- 'draft'|'active'|'completed'
  created_by UUID REFERENCES profiles(id)
)
players (
  id UUID, tournament_id UUID, user_id UUID,
  nombre TEXT, indice DECIMAL(4,1),
  categoria TEXT, pais TEXT
)
rounds (
  id UUID, tournament_id UUID, numero INTEGER,
  status TEXT  -- ⚠️ SOLO: 'in_progress'|'closed'|'official'
)
hole_scores (
  id UUID, round_id UUID, player_id UUID,
  hole_number INTEGER, gross_score INTEGER,
  par INTEGER, neto_score INTEGER,
  UNIQUE(round_id, player_id, hole_number)
)
```

### Perfil y Estadísticas
```sql
profiles (
  id UUID PRIMARY KEY,
  name TEXT, email TEXT,
  indice DECIMAL(4,1),
  role TEXT DEFAULT 'player'  -- ⚠️ 'player'|'organizer'|'admin'
)
historical_rounds (
  id UUID, user_id UUID,
  course_name TEXT, played_at TIMESTAMPTZ,
  total_gross INTEGER, total_neto INTEGER,
  scores JSONB, holes_played INTEGER DEFAULT 18,
  metadata JSONB
)
courses (
  id UUID, nombre TEXT,  -- ⚠️ NO 'name'
  par_total INTEGER, yardaje_total INTEGER,
  slope INTEGER, rating DECIMAL(4,1)
)
course_holes (
  id UUID, course_id UUID,
  numero INTEGER,  -- ⚠️ NO 'hole_number'
  par INTEGER, stroke_index INTEGER,
  hdcp INTEGER, yardaje_negro INTEGER
)
taiger_sessions (
  id UUID, user_id UUID,
  session_type TEXT, messages JSONB
)
```

### UUIDs fijos de demo — NUNCA cambiar
```typescript
const CARLOS_MENDEZ_ID = '10000000-0000-0000-0000-000000000001'
const TOURNAMENT_ID    = '20000000-0000-0000-0000-000000000001'
const ROUND_ID         = '30000000-0000-0000-0000-000000000001'
const JUANJO_ID        = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
```

## Cómo ejecutar SQL (Claude Code tiene permiso total)
```bash
# Verificar qué método funciona:
npx supabase --version

# Método 1 — CLI (preferido)
npx supabase db push --project-ref hoswfwhvcgqlqdmzpnce

# Método 2 — Via DB URL
npx supabase db execute --project-ref hoswfwhvcgqlqdmzpnce \
  --db-url "$SUPABASE_DB_URL" -f supabase/migrations/NNN.sql

# Si ninguno funciona, reportar el error. NO ejecutar manualmente.
# Verificar variables: cat .env.local | grep SUPABASE
```

## Comandos esenciales
```bash
curl https://tu-golf.vercel.app/api/admin/health  # health check
npx tsc --noEmit                                   # TypeScript check
npm run build                                      # build
git add . && git commit -m "..." && git push       # deploy
node scripts/update-docs.js                        # actualizar docs
```

---

# PARTE 2 — DESIGN SYSTEM OFICIAL
## Verificado de globals.css + DOM en producción el 25 marzo 2026

## 2.1 CSS VARIABLES — La fuente de verdad

CRÍTICO: Usar siempre las CSS variables. No hardcodear valores cuando existe variable.

```css
/* FONDOS */
--bg:            #070d18    /* fondo principal — dark navy */
--bg-surface:    #0e1c2f    /* superficies secundarias */
--bg-deep:       #08120f    /* secciones deep — tono verdoso oscuro */
--bg-deep-2:     #0d1b17
--bg-card:       #12231e    /* cards en zonas stats */
--bg-card-2:     #173129
--bg-card-light: #0e1c2f    /* cards en dashboard/perfil */

/* TEXTO */
--ivory:   #f3efe6          /* títulos, display */
--text:    #edeae4          /* texto principal */
--text-2:  #94a8c0          /* texto secundario */
--text-3:  #5a6a7a          /* apagado / placeholders */
--sage:    #9fb4aa          /* texto con tono verde */

/* DORADO — dos tonos distintos */
--brand:        #c4992a     /* ← botones CTAs, acciones de marca */
--brand-hover:  #a67d1e     /* hover del brand */
--brand-dark:   #070d18     /* texto sobre fondo dorado */
--brand-light:  #fdf6e3     /* fondos muy suaves dorados */
--gold:         #c8a55a     /* ← accents, datos, GWI, stats */
--gold-soft:    rgba(200,165,90,.18)  /* fondos gold muy sutiles */

/* BORDES */
--border:    rgba(196,153,42,.12)   /* borde estándar */
--border-md: rgba(196,153,42,.20)   /* borde más visible */
--line:      rgba(200,165,90,.18)   /* divisores */

/* INPUTS */
--input-bg:     hsla(0,0%,100%,.04)
--input-border: rgba(196,153,42,.2)
--input-focus:  #c4992a

/* SOMBRAS */
--shadow-sm:   0 1px 3px rgba(0,0,0,.3)
--shadow-md:   0 4px 12px rgba(0,0,0,.4)
--shadow-lg:   0 8px 24px rgba(0,0,0,.5)
--shadow-card: 0 2px 8px rgba(0,0,0,.3)

/* SISTEMA DE SCORE — ⚠️ NO CONVENCIONAL — NO CAMBIAR */
--eagle:  #3b82f6   /* AZUL — eagle y mejor */
--birdie: #ef4444   /* ROJO — birdie (bajo par) */
--par:    #6b7280   /* GRIS — par */
--bogey:  #c4992a   /* DORADO — bogey (+1) */
--double: #dc2626   /* ROJO OSCURO — doble+ */
```

## 2.2 SISTEMA DE SCORE — NO CONVENCIONAL A PROPÓSITO

⚠️ ADVERTENCIA CRÍTICA:
El golf tradicional usa verde=bajo par, rojo=sobre par.
Golfers+ usa un sistema DIFERENTE por decisión de diseño intencional.
Claude Code NO debe "corregirlo". Es correcto así.

```
SCORE       COLOR     CSS VAR    HEX
Eagle(-2):  AZUL      --eagle    #3b82f6
Birdie(-1): ROJO      --birdie   #ef4444
Par(0):     GRIS      --par      #6b7280
Bogey(+1):  DORADO    --bogey    #c4992a
Doble(+2):  ROJO OSC  --double   #dc2626
Triple+:    ROJO OSC  --double   #dc2626
```

HoleColorBar (componente EXISTENTE — no reimplementar):
```
Eagle/Albatros: #93C5FD | Birdie: #FCA5A5 | Par: #86EFAC
Bogey: #FCD34D | Doble: #F87171 | Triple+: #DC2626
Sin score: rgba(0,0,0,0.08)
```

Indicadores de forma (shapes):
```
HIO:      círculo dorado relleno + doble outline
Albatros: círculo azul relleno + doble circle
Eagle:    doble círculo azul vacío
Birdie:   círculo rojo simple vacío
Par:      sin indicador
Bogey:    cuadrado dorado simple vacío
Doble:    doble cuadrado rojo vacío
Triple+:  cuadrado rojo oscuro relleno, número blanco
```

## 2.3 TIPOGRAFÍA — 4 FUENTES CON ROLES ESPECÍFICOS

```
FUENTE 1: Playfair Display — var(--font-playfair)
  Pesos: 700, 900
  Usar: títulos H1 de página, nombres de torneos, secciones hero
  Tamaños: H1 28-36px desktop / 22-26px mobile

FUENTE 2: DM Sans — var(--font-dm-sans) [DEFAULT del body]
  Pesos: 400, 500, 600
  Usar: TODA la UI — labels, botones, nav, párrafos, inputs

FUENTE 3: DM Mono
  Pesos: 300, 400, 500
  Usar: métricas/códigos — SIEMPRE uppercase + letter-spacing: 0.08em
  Ejemplos: "GWI™" · "CAT. A" · "PAR 72" · "HOYO 1"
  Tamaños: 9-11px labels / 13px valores

FUENTE 4: Cormorant Garamond
  Pesos: 300, 400, 600
  Usar: SOLO números grandes impactantes (GWI gauge, hero stats)
  NUNCA en párrafos, labels, ni botones
  Tamaños: GWI gauge 52px / hero stats 32px / data cards 22px

NUNCA usar: Inter (fue reemplazada) · Arial · system-ui
```

## 2.4 COMPONENTES — ESPECIFICACIONES

### Botón primario
```css
background:    var(--brand)       /* #c4992a */
color:         var(--brand-dark)  /* #070d18 */
border-radius: 10px
height:        44px               /* MÍNIMO — estándar iOS */
font-size:     13px; font-weight: 600
font-family:   var(--font-dm-sans)
padding:       12px 20px
hover-bg:      var(--brand-hover) /* #a67d1e */
```

### Card oscura estándar
```css
background:    var(--bg-card-light)  /* #0e1c2f */
border:        1px solid var(--border)
border-radius: 14px
padding:       20px
box-shadow:    var(--shadow-card)
```

### Card destacada (Ronda Libre)
```css
background:    var(--gold-soft)
border:        1px solid var(--border-md)
border-radius: 14px; padding: 20px
```

### Card formulario claro
```css
background:    rgb(249, 250, 251)
border:        1px solid rgb(229, 231, 235)
border-radius: 16px; padding: 16px
```

### Input
```css
background:    var(--input-bg)
border:        1px solid var(--input-border)
color:         var(--text)
border-radius: 10px; padding: 10px 14px
font-size:     16px  /* CRÍTICO: 16px evita zoom iOS */
```

### Bottom Bar
```css
position: fixed; bottom: 0; left: 0; right: 0
padding-bottom: env(safe-area-inset-bottom, 0px)  /* SIEMPRE en iPhones */
height: ~80px
```

### Badge LIVE
```css
background: rgba(74,222,128,.15); color: #4ade80
border: 1px solid rgba(74,222,128,.3)
border-radius: 4px; font-size: 9px; font-weight: 700
letter-spacing: 0.08em; padding: 2px 6px
```

### Badge IA/dorado
```css
background: rgba(196,153,42,.15); color: var(--brand)
border: 1px solid rgba(196,153,42,.3)
border-radius: 4px; font-size: 9px; font-weight: 700
padding: 2px 6px
```

## 2.5 DOS MODOS VISUALES

MODO OSCURO (usar en):
  Dashboard, Menú, Importar, Perfil, Stats, Leaderboard,
  tAIger+, Feed en vivo, Historial, Coach, Score page activa.
  Fondo: var(--bg) #070d18

MODO CLARO (usar en):
  Formularios: Nueva Ronda, editar perfil, configuración.
  Pantalla resultado de ronda finalizada.
  Fondo: rgb(255,255,255) o rgb(243,244,246)

## 2.6 ESPACIADO
```
Padding lateral:          16px
Gap entre secciones:      24px
Gap entre cards:          12px
Card radius (dark):       14px
Card radius (light):      16px
Botón radius:             10px
Padding inferior scroll:  80px (no tapar con bottom bar)
Font inputs:              16px (evitar zoom iOS)
Touch targets:            mínimo 44x44px
Safe area iPhone:         env(safe-area-inset-bottom, 0px) en todo fixed
```

## 2.7 REGLAS DE DISEÑO QUE NUNCA SE VIOLAN
```
❌ NUNCA Cormorant Garamond en párrafos o labels
❌ NUNCA Inter — fue reemplazada
❌ NUNCA hardcodear colores si existe CSS variable equivalente
❌ NUNCA cambiar el sistema de colores de score (es no-convencional a propósito)
❌ NUNCA botones de menos de 44px de altura
❌ NUNCA inputs con font-size < 16px (zoom iOS)
❌ NUNCA omitir env(safe-area-inset-bottom) en fixed bottom
❌ NUNCA "Handicap" visible — es "Índice"
❌ NUNCA "el tAIger+" — sin artículo
❌ NUNCA "Golfers +" con espacio
❌ NUNCA textos en inglés visibles al usuario
❌ NUNCA data.map() sin ?? [] defensivo
❌ NUNCA scores como número absoluto en UI — siempre vs par
❌ NUNCA yardajes en metros — siempre en yardas
❌ NUNCA fechas "2026-03-24" — siempre "24 mar 2026"
```

---

# PARTE 3 — PROTOCOLO DE EJECUCIÓN EN 3 CAPAS

## Por qué capas
Un sprint ejecutado de golpe mezcla errores de estructura + diseño + lógica.
Con capas, cada tipo de error se detecta en el momento correcto.

```
CAPA 1 — ESTRUCTURA (sin diseño final)
  Crear archivos, tipos TypeScript, rutas vacías.
  CRITERIO: npx tsc --noEmit sin errores.

CAPA 2 — DISEÑO Y UI (sin datos reales)
  Aplicar design system. Usar datos mock para visualizar.
  CRITERIO: se ve correcto en navegador a 390px.

CAPA 3 — FUNCIONALIDAD Y DATOS
  Conectar Supabase, lógica, SQL, Realtime.
  CRITERIO: npm run build + prueba funcional en celular.
```

## Checklist universal antes de cada capa
```bash
git pull origin main
grep -rn "TÉRMINO_RELEVANTE" src/ --include="*.tsx" --include="*.ts"
# NUNCA asumir nombres — siempre grep primero
npx tsc --noEmit
```

---

# PARTE 4 — LOS 9 SPRINTS

Prerequisito antes de cualquier sprint:
```bash
curl https://tu-golf.vercel.app/api/admin/health
git log --oneline -5
npx tsc --noEmit 2>&1 | tail -10
```

---

## SPRINT 1 — Arreglos urgentes post-prueba en cancha
Tiempo estimado: 2-3 horas

### S1 · CAPA 1 — Mapeo
```bash
grep -rn "hoyo_inicio\|hoyoInicio" src/ --include="*.tsx" --include="*.ts"
grep -rn "Thru\|thru\|H\.1\|H\.X" src/app/ronda-libre/ --include="*.tsx"
grep -rn "sanitizeNext\|next.*param\|redirectTo\|next=" \
  src/app/auth/ src/middleware.ts --include="*.tsx" --include="*.ts"
grep -rn "partidaSimultanea\|generarOrden\|hoyo.*inicio" \
  src/app/ronda-libre/nueva/ --include="*.tsx"
grep -rn "hoyo_inicio" supabase/migrations/ --include="*.sql"
```
Reportar archivos encontrados antes de continuar.
npx tsc --noEmit

### S1 · CAPA 2 — Diseño
```
T1 — Header score page
  Agregar "H.X" (DM Sans, 12px, 600, var(--brand)) y
  "Thru X/18" (DM Sans, 10px, 400, var(--text-2)) en esquina superior derecha

T2 — Layout score page (evitar solapamientos)
  Estructura: flex + flexDirection:column + height:100dvh + overflow:hidden
  Zona central: flex:1 + minHeight:0 + overflowY:auto
  Sin position:absolute en el bloque de score+botones

T3 — Input decimal iOS
  Verificar/agregar inputMode="decimal" en área de ingreso de golpes

T4 — Toggle partida simultánea
  Si no existe en /ronda-libre/nueva → agregar
  Checkbox: "Partida simultánea — Empieza en hoyo distinto al 1"
  Mostrar selector hoyo 1-18 solo cuando esté activado
```
npx tsc --noEmit

### S1 · CAPA 3 — Funcionalidad
```
T1 — Deep link post-auth
  grep -rn "callbackUrl\|next=\|redirectTo" src/middleware.ts src/app/login/ --include="*.tsx"
  Al redirigir sin auth: redirect('/login?next=' + encodeURIComponent(pathname))
  En login, después de auth exitoso: router.push(next ?? '/dashboard')

T2 — hoyo_inicio en BD + lógica de orden
  SQL:
  ALTER TABLE rondas_libres ADD COLUMN IF NOT EXISTS hoyo_inicio INTEGER DEFAULT 1;

  Función de orden (agregar a scoring.ts o inline):
  function generarOrdenHoyos(inicio: number, total: number): number[] {
    return Array.from({ length: total }, (_, i) => ((inicio - 1 + i) % total) + 1)
  }
```
```bash
npm run build
node scripts/update-docs.js
git add . && git commit -m "fix: header Thru/H.X, layout score, input decimal, deep link, partida simultánea"
git push origin main
```
VERIFICACIÓN:
- Header score page muestra H.X y Thru X/18
- Sin solapamientos entre score y botones en 390px
- Teclado numérico en iOS
- Toggle partida simultánea visible en nueva ronda
- Deep link funciona post-login
- TypeScript: 0 errores | Build: exitoso

---

## SPRINT 2 — Celebración + Share Card + Mini Leaderboard
Tiempo estimado: 3-4 horas

### S2 · CAPA 1 — Estructura
```bash
grep -rn "CelebracionRonda\|celebraci\|shareCard\|share-card\|MiniLeaderboard" \
  src/ --include="*.tsx" --include="*.ts"
grep -rn "closed\|finaliz\|todosCompletos\|allScored" \
  src/app/ronda-libre/ --include="*.tsx" --include="*.ts"
ls src/components/
```
Crear archivos vacíos:
- src/components/CelebracionRonda.tsx
- src/lib/share-card.ts
- src/components/MiniLeaderboard.tsx

npx tsc --noEmit

### S2 · CAPA 2 — Diseño
```
T1 — CelebracionRonda.tsx (modo CLARO — overlay sobre score page)
  Fondo: rgb(255,255,255)
  🏆 (64px) + "¡Ronda completada!" (Playfair 24px 700 rgb(17,24,39))
  Nombre ganador: DM Sans 20px 600 var(--brand)
  Score: Cormorant Garamond 48px vs par
  Botón "Compartir resultado →": brand button, ancho completo
  Animación entrada: fade in 0.3s

T2 — MiniLeaderboard.tsx (compacto ~60px alto)
  Fondo sutil sobre score page
  Posición + nombre + score vs par por jugador
  Líder: fondo var(--gold-soft), peso 600
  Recibe datos por props (no hace fetch propio)

T3 — Preview visual del share card (div estilizado 9:16)
  Fondo var(--bg) con borde var(--brand)
  "Golfers+" + nombre + score + cancha
```
npx tsc --noEmit

### S2 · CAPA 3 — Funcionalidad
```
T1 — Detección ronda completada
  const todosCompletos = jugadores.every(j => {
    const scores = j.scores ?? {}
    return Object.values(scores)
      .filter(s => s != null && Number(s) > 0).length >= totalHoyos
  })
  Si true: mostrar CelebracionRonda + actualizar estado a 'closed'

T2 — Canvas API share-card.ts (imagen 1080x1920)
  Usar el sistema de colores del proyecto para el score:
  diff <= -2: var(--eagle) #3b82f6 (azul)
  diff === -1: var(--birdie) #ef4444 (rojo)
  diff === 0:  var(--par) #6b7280 (gris)
  diff === 1:  var(--bogey) #c4992a (dorado)
  diff >= 2:   var(--double) #dc2626 (rojo oscuro)

T3 — Web Share API + fallback descarga
  if (navigator.share && navigator.canShare({ files })) → share
  else → URL.createObjectURL + link.click()

T4 — MiniLeaderboard con Realtime
  grep -rn "channel\|postgres_changes\|subscribe" src/app/ronda-libre/ --include="*.tsx"
  Reusar canal existente si hay uno, o crear nuevo.
```
```bash
npm run build
node scripts/update-docs.js
git add . && git commit -m "feat: celebración ronda, share card Canvas, mini leaderboard realtime"
git push origin main
```
VERIFICACIÓN:
- Celebración aparece al completar 18 hoyos
- Imagen 1080x1920 generada con colores correctos del design system
- Web Share API en iOS, descarga en desktop
- Mini leaderboard visible y se actualiza sin recargar
- TypeScript: 0 errores | Build: exitoso

---

## SPRINT 3 — Menú + Importar + Branding
Tiempo estimado: 2-3 horas

### S3 · CAPA 1 — Mapeo
```bash
grep -rn "Leaderboard\|hamburger\|sidebar\|drawer\|setIsOpen\|setOpen\|menuOpen" \
  src/app/layout.tsx src/components/ --include="*.tsx"
grep -rn "bottom.*bar\|BottomBar\|Coach\|href.*coach" \
  src/app/layout.tsx src/components/ --include="*.tsx"
grep -rn '"Handicap"\|>Handicap<\|label.*Handicap' \
  src/ --include="*.tsx" | grep -v "//\|interface\|type"
grep -rn "handleGarmin\|handlePhoto\|handleCSV\|handleFile\|onUpload" \
  src/app/importar/ --include="*.tsx" --include="*.ts"
grep -rn "setIsOpen.*false\|closeMenu\|setMenuOpen.*false\|onClose" \
  src/app/layout.tsx src/components/ --include="*.tsx"
```
npx tsc --noEmit

### S3 · CAPA 2 — Diseño
```
T1 — Menú hamburguesa — 3 bloques

Header existente + debajo del email agregar badge nivel:
  background: var(--gold-soft), color: var(--gold)
  border: 1px solid var(--border-md), border-radius: 20px
  font: DM Mono 11px uppercase

Separadores: hr con rgba(255,255,255,0.06)

BLOQUE COMUNIDAD (DM Mono 10px uppercase rgba(255,255,255,0.3)):
  🟢 En Vivo  [badge LIVE verde]  →  /en-vivo
  🏆 Leaderboard                  →  /leaderboard

BLOQUE MI JUEGO:
  📊 Mi CPI™                      →  /perfil/stats
  📋 Mis rondas                    →  /perfil/historial
  🐯 tAIger+ Coach  [badge IA]    →  /coach
  📥 Importar historial            →  /importar

BLOQUE CUENTA:
  ⚙️ Admin (solo role='admin')    →  /admin
  🔔 Notificaciones  [handler existente]
  🚪 Cerrar sesión   [handler existente]

Estilo ítems: padding 10px 8px, radius 8px
hover: rgba(255,255,255,0.05)
ícono: 18px ancho fijo 24px
label: DM Sans 14px 500 var(--text)

T2 — Bottom bar: "Coach" → "tAIger+" + ícono 🐯
  href="/coach" NO cambia

T3 — "Handicap" → "Índice" (SOLO texto visible, no variables)

T4 — Pantalla Importar (modo OSCURO, no reimplementar handlers)
  Value prop: "Traer tu historial"
  Sub: "activan tu CPI™ y le dan contexto real a tAIger+"
  Pregunta: "¿Con qué juegas?" → [⌚ Garmin] [📱 Otro/papel]
  Flujo Garmin: 4 steps numerados + "~30 segundos"
  Flujo Otro: 2 opciones con tiempos estimados
  Conectar handlers EXISTENTES a los botones nuevos
```
npx tsc --noEmit

### S3 · CAPA 3 — Funcionalidad
```
T1 — Nivel del usuario en menú
  grep -rn "\.nivel\b\|nivel.*profiles" src/ supabase/migrations/ --include="*.tsx" --include="*.ts" --include="*.sql"
  Si no existe: ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nivel INTEGER DEFAULT 1;
  Mapear: {1:'Rookie', 2:'En Cancha', 3:'Jugador Activo', 4:'Scratch+', 5:'Golfer+'}

T2 — GWI estado vacío
  Cuando GWI === 0 o null → mostrar:
  📊 + "GWI se activa con 3+ rondas" + "Juega o importa para ver tu índice"
  NO mostrar el número "0"
```
```bash
npm run build
node scripts/update-docs.js
git add . && git commit -m "feat: menú 3 bloques, importar con guía, Coach→tAIger+, Handicap→Índice, GWI vacío"
git push origin main
```
VERIFICACIÓN:
- Menú: COMUNIDAD / MI JUEGO / CUENTA
- Badge LIVE verde y badge IA dorado visibles
- Badge nivel en header del menú
- Bottom bar: "tAIger+" con 🐯
- Perfil: "Índice" en todas partes
- Importar: pregunta diagnóstica → flujos con tiempos
- GWI=0: estado vacío con contexto
- TypeScript: 0 errores | Build: exitoso

---

## SPRINT 4 — Feed en vivo /en-vivo
Tiempo estimado: 3-4 horas

### S4 · CAPA 1 — Estructura
```bash
curl -s -o /dev/null -w "%{http_code}" https://tu-golf.vercel.app/en-vivo
# → debe ser 404

grep -rn "createClient\|postgres_changes\|realtime" \
  src/app/api/ src/utils/ --include="*.ts" | head -10
```

Habilitar Realtime (SQL a ejecutar):
```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'rondas_libres'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE rondas_libres; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ronda_libre_jugadores'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE ronda_libre_jugadores; END IF;
END $$;
```

Crear vacíos:
- src/app/api/en-vivo/route.ts
- src/app/en-vivo/page.tsx
- src/components/EnVivoWidget.tsx

npx tsc --noEmit

### S4 · CAPA 2 — Diseño
```
T1 — /en-vivo (modo OSCURO, fondo var(--bg))

Header sticky:
  Dot pulsante: #4ade80 cuando hay rondas
  "En Vivo": Playfair 18px 700 var(--ivory)
  Badge count: verde
  Hora: DM Mono 11px var(--text-3)
  Buscador (aparece con 3+ rondas): estilos var(--input-*)

RondaCard:
  Card: rgba(255,255,255,0.04), borde var(--border), radius 16px
  Cancha: DM Sans 15px 700 var(--ivory)
  Info: DM Sans 11px var(--text-3)
  Badge "Thru H.X": var(--gold)
  Jugador #1: fondo var(--gold-soft)
  Posición: DM Mono 12px var(--gold) para #1
  Score: usuario registrado → ver número con color de score
         no registrado → badge "Ver →" dorado
  CTA "Ver en vivo →": botón secundario sutil

Estado vacío: ⛳ + Playfair + DM Sans + botón brand

CTA no registrados: card var(--gold-soft) + botón brand "Crear cuenta"

T2 — EnVivoWidget (dashboard, compacto)
  return null si no hay rondas (no rompe el layout)
  "EN VIVO AHORA" (DM Mono, uppercase, 12px) + "Ver todas →"
  Máximo 3 tarjetas compactas
```
npx tsc --noEmit

### S4 · CAPA 3 — Funcionalidad
```
T1 — API /api/en-vivo/route.ts
  export const dynamic = 'force-dynamic'
  export const revalidate = 0
  GET: query rondas_libres WHERE estado='in_progress'
  JOIN ronda_libre_jugadores(id, nombre, user_id, scores)
  Calcular holesCompleted y totalGross por jugador
  Filtro ?cancha= con .ilike()
  Devolver: { rondas, total, timestamp }

T2 — /en-vivo funcionalidad
  'use client' — verificar sesión → setIsLoggedIn
  cargarFeed() + polling cada 20s
  Realtime: escuchar UPDATE en rondas_libres y ronda_libre_jugadores
  Buscador con debounce 400ms

T3 — EnVivoWidget
  fetch('/api/en-vivo').slice(0,3)
  Polling cada 30s
  return null si vacío

T4 — Índices BD
  CREATE INDEX IF NOT EXISTS idx_rondas_libres_estado_fecha ON rondas_libres(estado, fecha DESC);
  CREATE INDEX IF NOT EXISTS idx_ronda_libre_jugadores_ronda_id ON ronda_libre_jugadores(ronda_libre_id);

T5 — "En Vivo" en menú (si Sprint 3 ya aplicado)
  Verificar: grep -rn "COMUNIDAD\|En Vivo" src/app/layout.tsx --include="*.tsx"
  Si S3 aplicado → ya está en COMUNIDAD
  Si no → agregar antes de Leaderboard
```
```bash
npm run build
node scripts/update-docs.js
git add . && git commit -m "feat: /en-vivo Realtime + widget dashboard + API rondas activas + índices"
git push origin main
```
VERIFICACIÓN:
- /en-vivo carga sin 404
- Dot verde pulsante con rondas activas
- Estado vacío con CTA nueva ronda
- No registrado: ve rondas sin scores completos
- Realtime: nueva ronda aparece sin recargar
- Widget en dashboard solo si hay rondas activas
- TypeScript: 0 errores | Build: exitoso

---

## SPRINT 5 — Seguridad
Tiempo estimado: 1-2 horas

### S5 · CAPA 3 (este sprint no tiene capas 1/2)
```bash
curl -s -o /dev/null -w "%{http_code}" https://tu-golf.vercel.app/api/admin/health
grep -rn "admin/health\|admin.*health" src/app/api/ --include="*.ts"
grep -rn "push/preferences" src/app/api/ --include="*.ts"
grep -rn "X-Frame\|X-XSS\|headers()" next.config.*
grep -rn "getUser\|getSession" src/app/api/ --include="*.ts" | head -5
```

T1 — Proteger /api/admin/health
```typescript
const authHeader = request.headers.get('x-admin-key')
const adminKey = process.env.ADMIN_SECRET_KEY
if (!adminKey || authHeader !== adminKey) {
  return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
}
```
Agregar ADMIN_SECRET_KEY=golfers-admin-2026 al .env.local
Agregar a Vercel: npx vercel env add ADMIN_SECRET_KEY production

T2 — Proteger /api/push/preferences
  Usar patrón de auth existente en el proyecto (grep T anterior)
  Agregar verificación getUser() al inicio de GET y POST

T3 — X-XSS-Protection en next.config
  Agregar { key: 'X-XSS-Protection', value: '1; mode=block' }
  a la sección headers() existente

T4 — CORS en /api/en-vivo (si Sprint 4 aplicado)
  Cambiar Access-Control-Allow-Origin: * por dominio específico

```bash
npm run build
node scripts/update-docs.js
git add . && git commit -m "security: admin/health protegido, push/preferences auth, XSS header, CORS"
git push origin main
```
VERIFICACIÓN:
- /api/admin/health sin header → 401
- /api/admin/health con 'x-admin-key: golfers-admin-2026' → 200
- /api/push/preferences sin login → 401
- X-XSS-Protection en headers HTTP
- App funciona normalmente (sin regresiones)
- TypeScript: 0 errores | Build: exitoso

---

## SPRINT 6 — Infraestructura
Tiempo estimado: 2-3 horas

### S6 · CAPA 1
```bash
grep -rn "sentry\|posthog" package.json src/ --include="*.tsx" --include="*.ts"
grep -rn "supabase\|Promise.all\|await supabase" src/app/dashboard/ --include="*.tsx"
```

### S6 · CAPA 2
Crear src/components/PostHogProvider.tsx (wrapper invisible)
Crear sentry.client.config.ts y sentry.server.config.ts (estructura vacía)
npx tsc --noEmit

### S6 · CAPA 3
```
T1 — Sentry
  npm install @sentry/nextjs
  sentry.client.config.ts:
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      enabled: process.env.NODE_ENV === 'production',
      tracesSampleRate: 0.1,
      beforeSend(event) {
        if (event.user) { delete event.user.email; delete event.user.username }
        return event
      }
    })
  Envolver next.config con withSentryConfig
  Agregar NEXT_PUBLIC_SENTRY_DSN= al .env.local (Juanjo completa con sentry.io)

T2 — PostHog
  npm install posthog-js
  PostHogProvider: posthog.init(key, { autocapture:false, capture_pageview:true, ip:false })
  Envolver body del layout con <PostHogProvider>
  Agregar NEXT_PUBLIC_POSTHOG_KEY= al .env.local (Juanjo completa con posthog.com)

T3 — Velocidad del dashboard
  export const revalidate = 30
  Convertir queries secuenciales a Promise.all paralelas
  Verificar .limit() en cada query

T4 — Endpoint diagnóstico /api/admin/backup-check
  Protegido con ADMIN_SECRET_KEY
  Devuelve conteos de tablas con Promise.all
```
```bash
npm run build
node scripts/update-docs.js
git add . && git commit -m "infra: Sentry, PostHog, dashboard performance, backup-check"
git push origin main
```
VERIFICACIÓN:
- Dashboard carga más rápido (medir con DevTools Network)
- PostHogProvider sin errores de consola
- Build exitoso con @sentry/nextjs
- TypeScript: 0 errores | Build: exitoso

---

## SPRINT 7 — Legal
Tiempo estimado: 2-3 horas
ROL: Abogado experto en derecho chileno — Ley 19.628 y Ley 19.496.

### S7 · CAPA 1
```bash
curl -s -o /dev/null -w "%{http_code}" https://tu-golf.vercel.app/terminos
curl -s -o /dev/null -w "%{http_code}" https://tu-golf.vercel.app/privacidad
grep -rn "register\|registro\|sign.*up" src/app/ --include="*.tsx" | grep -v ".next"
grep -rn "footer\|Footer\|2026 Golfers" src/ --include="*.tsx" | grep -v ".next"
```

### S7 · CAPA 2 — Diseño común
```
Modo OSCURO: fondo var(--bg), max-width 680px centrado, padding 24px 16px 80px
H1: Playfair Display 28px 700 var(--ivory)
Secciones H2: DM Sans 17px 600 var(--gold)
Body: DM Sans 14px 400 var(--text), line-height 1.7
Separadores: border-top 1px solid var(--line)
```
npx tsc --noEmit

### S7 · CAPA 3 — Contenido y funcionalidad
```
T1 — /terminos/page.tsx
  Incluir: identificación del titular, objeto del servicio,
  condiciones de uso (mayores 13 años), cuenta de usuario,
  IMPORTANTE — tAIger+: "análisis orientativos, NO asesoramiento profesional",
  propiedad intelectual ("Golfers+", "tAIger+" y "CPI™" son marcas de Golfers+),
  limitación de responsabilidad, modificación (30 días de aviso),
  ley chilena — tribunales de Santiago

T2 — /privacidad/page.tsx (Ley 19.628 Chile)
  Incluir: responsable del tratamiento, qué datos se recopilan y para qué,
  consentimiento (Art. 4 Ley 19.628), con quién se comparte
  (Supabase/Vercel/Anthropic — NO se vende a anunciantes),
  transferencia internacional, retención (30 días tras eliminar cuenta),
  derechos del usuario (Art. 12 Ley 19.628),
  SERNAC como autoridad de reclamos

T3 — /reembolsos/page.tsx (Ley 19.496 Chile Art. 3° bis)
  Derecho a retracto: 10 días hábiles (compras online Chile)
  Solicitud por email asunto "REEMBOLSO"
  Exclusiones: períodos consumidos, análisis tAIger+ ya entregados

T4 — Checkbox en formulario de registro
  required + label con links a /terminos y /privacidad en target="_blank"
  accentColor: 'var(--brand)'
  El form no puede enviarse sin marcar

T5 — Footer con links legales
  DM Sans 11px var(--text-3)
  · Términos · Privacidad · Reembolsos
```
```bash
npm run build
node scripts/update-docs.js
git add . && git commit -m "legal: términos, privacidad, reembolsos Chile, checkbox registro, footer links"
git push origin main
```
VERIFICACIÓN:
- /terminos · /privacidad · /reembolsos cargan sin 404
- Diseño oscuro con Playfair Display en títulos
- /privacidad menciona Ley 19.628 y SERNAC
- /reembolsos menciona Art. 3° bis Ley 19.496
- Checkbox bloquea envío del formulario
- TypeScript: 0 errores | Build: exitoso

---

## SPRINT 8 — Plan de trabajo nocturno autónomo
Tiempo estimado: 1 hora

### S8 · CAPA 3 — Solo documentación
```
T1 — .claude/commands/health.md
  mkdir -p .claude/commands
  Instrucción que al escribir /health ejecuta:
  1. curl /api/admin/health
  2. git log --oneline -3
  3. npx tsc --noEmit | tail -5
  Reporta estado ✅/❌

T2 — docs/TRABAJO_NOCTURNO.md
  Regla de oro: rama separada siempre
  Categoría A (OK de noche): pantallas nuevas, componentes nuevos,
    cambios de texto, APIs nuevas, correcciones de estilo
  Categoría B (PROHIBIDO de noche): auth/login, middleware.ts,
    layout principal, score page en vivo, eliminar archivos
  Checklist antes de dormir (5 min)
  Checklist al despertar (10 min)

T3 — docs/WRAPPER_NOCTURNO.md
  Wrapper listo para copiar:
  ---
  MODO NOCTURNO — SIN SUPERVISIÓN
  Lee GOLFERS_PLUS_MAESTRO.md antes de empezar.
  1. RAMA: git checkout main && git pull && git checkout -b sprint/[nombre]-$(date +%Y%m%d)
  2. SCOPE: solo toca lo pedido. Si necesitas algo fuera → PARA y reporta.
  3. TYPESCRIPT: npx tsc --noEmit después de cada tarea. Corregir errores.
  4. BUILD: npm run build antes del commit. Si falla → no hacer push.
  5. SIN DECISIONES: texto/color/flujo ambiguo → imitar lo existente + comentario // TODO: Juanjo decide
  6. REPORTE: docs/REPORTE_[FECHA].md con qué se hizo, qué se tocó, cómo probar, qué quedó bloqueado.
  7. SOLO PUSH A RAMA — nunca merge a main.
  ---

T4 — docs/CALENDARIO_NOCHES.md
  Noche 1: Historial expandible (RondaDetalle.tsx — componente nuevo)
  Noche 2: Sistema de niveles — SQL + lógica backend
  Noche 3: Sistema de niveles — UI (prereq: Noche 2 mergeada)
  Noche 4: Modo organizador en cancha (/organizador/[slug]/live)
  Noche 5: Share card del torneo (extensión del Sprint 2)
```
```bash
npm run build
node scripts/update-docs.js
git add . && git commit -m "docs: slash command /health, trabajo nocturno, wrapper, calendario noches"
git push origin main
```
VERIFICACIÓN:
- .claude/commands/health.md existe y válido
- docs/TRABAJO_NOCTURNO.md con reglas claras
- docs/WRAPPER_NOCTURNO.md con wrapper listo para copiar
- docs/CALENDARIO_NOCHES.md con 5 noches
- Build: exitoso

---

## SPRINT 9 — Escalabilidad
Tiempo estimado: 4-5 horas
⚠️ /admin, /admin/qa, /admin/sistema YA EXISTEN. EXTENDER, no crear desde cero.

### S9 · CAPA 1 — Diagnóstico
```bash
ls src/app/admin/
grep -rn "isAdmin\|role.*admin\|profiles.*role" \
  src/lib/admin.ts src/app/admin/ --include="*.tsx" --include="*.ts"
grep -rn "upsert\|update.*scores\|supabase.*ronda_libre" \
  src/app/ronda-libre/ --include="*.tsx" --include="*.ts" | head -10
grep -rn "\.role\b\|role.*player\|role.*organizer" \
  src/ --include="*.tsx" --include="*.ts" | head -10
ls docs/ 2>/dev/null || echo "docs no existe"
```
Crear vacíos: src/hooks/useScoreSync.ts · src/hooks/usePermisos.ts
npx tsc --noEmit

### S9 · CAPA 2 — Diseño extensión admin
```
Agregar sección métricas al /admin EXISTENTE (no reemplazar)
Grid 2x2: background var(--bg-card-light), border var(--border), radius 14px
Ícono (emoji) + número (Cormorant Garamond 28px var(--gold)) + label (DM Mono 11px uppercase)
Métricas: 👥 Usuarios · ⛳ Rondas activas · 📅 Rondas hoy · 🏆 Torneos activos
Botón actualizar: brand button ancho completo
```
npx tsc --noEmit

### S9 · CAPA 3 — Implementación
```
T1 — useScoreSync.ts (modo offline para scores)
  guardarLocal(scores): localStorage ANTES de enviar al servidor
  marcarSincronizado(): actualiza flag tras éxito
  obtenerLocal(): lee scores del localStorage (fallback offline)

  Integrar en score page:
  1. guardarLocal(nuevosScores)  ← siempre primero
  2. try { await supabase...update...; marcarSincronizado() }
     catch { console.warn('Score guardado localmente') }  ← NO mostrar error al usuario

T2 — Sistema de roles (verificar y extender)
  Si profiles.role NO existe con valores correctos:
  ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS role TEXT
    CHECK (role IN ('player', 'organizer', 'admin'))
    DEFAULT 'player' NOT NULL;
  UPDATE profiles SET role = 'player' WHERE role IS NULL;
  UPDATE profiles SET role = 'admin' WHERE email = 'juanjoselamarca@gmail.com';
  CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

  usePermisos.ts:
  Lee profiles.role del usuario actual
  Devuelve: { rol, esAdmin, esOrganizador, puedeVerAdmin, cargando }

T3 — Métricas en /admin existente
  Agregar sección con Promise.all de conteos
  Auto-refresh cada 60s + botón manual

T4 — Índices de BD
  CREATE INDEX IF NOT EXISTS idx_ronda_libre_jugadores_user_id ON ronda_libre_jugadores(user_id);
  CREATE INDEX IF NOT EXISTS idx_rondas_libres_fecha_desc ON rondas_libres(fecha DESC);
  CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
  CREATE INDEX IF NOT EXISTS idx_historical_rounds_user_played ON historical_rounds(user_id, played_at DESC);
  CREATE INDEX IF NOT EXISTS idx_hole_scores_round_player ON hole_scores(round_id, player_id);
  CREATE INDEX IF NOT EXISTS idx_players_tournament ON players(tournament_id);

T5 — docs/ARQUITECTURA.md
  Qué es Golfers+ (en 3 líneas simples)
  Stack (con por qué cada herramienta)
  Los DOS sistemas de rondas:
    Rondas Libres (casual) vs Torneos (competición formal)
  historical_rounds → GWI™ y CPI™
  Flujos principales paso a paso
  Reglas de negocio que nunca se rompen
  Variables de entorno necesarias (solo nombres)
```
```bash
npm run build
node scripts/update-docs.js
git add . && git commit -m "scale: offline scores, roles player/organizer/admin, métricas admin, índices BD, arquitectura"
git push origin main
```
VERIFICACIÓN:
- useScoreSync: score no se pierde si servidor falla
- /admin sigue funcionando (no se rompió al extender)
- Sección métricas visible con datos reales
- role='admin' asignado a juanjoselamarca@gmail.com
- usePermisos devuelve esAdmin=true para el founder
- Índices creados (verificar con SELECT indexname FROM pg_indexes)
- docs/ARQUITECTURA.md completo
- TypeScript: 0 errores | Build: exitoso

---

# PARTE 5 — CHECKLIST MAESTRO DE CALIDAD

Antes de considerar cualquier sprint completado:

```
TIPOGRAFÍA:
□ H1 páginas: Playfair Display
□ UI general: DM Sans (el default)
□ Métricas/códigos: DM Mono uppercase
□ Números grandes: Cormorant Garamond
□ NUNCA Inter ni otra fuente

COLORES (usar CSS variables):
□ Fondos: var(--bg) · var(--bg-card-light) · var(--bg-card)
□ Texto: var(--text) · var(--text-2) · var(--text-3)
□ Botones: var(--brand) #c4992a
□ Accents/data: var(--gold) #c8a55a
□ Bordes: var(--border) · var(--border-md)

SCORE (NO convencional — NO cambiar):
□ Eagle: var(--eagle) #3b82f6 AZUL
□ Birdie: var(--birdie) #ef4444 ROJO
□ Par: var(--par) #6b7280 GRIS
□ Bogey: var(--bogey) #c4992a DORADO
□ Doble+: var(--double) #dc2626 ROJO OSCURO

UX MOBILE:
□ Touch targets: mínimo 44x44px
□ Inputs: font-size 16px (evitar zoom iOS)
□ env(safe-area-inset-bottom) en todo fixed bottom
□ padding-bottom: 80px en contenido scrolleable
□ Funciona a 390px de ancho

CÓDIGO:
□ npx tsc --noEmit → 0 errores
□ (data ?? []).map() en arrays Supabase
□ 'use client' en componentes con hooks o Realtime
□ Textos en español, nunca inglés visible
□ "Índice" no "Handicap" · "tAIger+" · "Golfers+"

BD:
□ profiles.role (no .rol): 'player'|'organizer'|'admin'
□ courses.nombre (no name)
□ course_holes.numero (no hole_number)
□ rondas_libres.estado: 'in_progress'|'closed'

FLUJO:
□ npm run build exitoso
□ node scripts/update-docs.js ejecutado
□ Commit descriptivo
□ Probado en celular real en producción
```

---

# PARTE 6 — ORDEN DE EJECUCIÓN

```
SEMANA 1:  Sprint 1 → Sprint 2 → Sprint 3 → Sprint 4
SEMANA 2:  Sprint 5 → Sprint 6
SEMANA 3:  Sprint 7 → Sprint 8
SEMANA 4+: Sprint 9

PARALELO: Verificar inapi.cl — disponibilidad de
  "Golfers+" y "tAIger+" en categorías 41 y 42
```

---
Versión 2.0 · 25 marzo 2026
Auditado contra producción real, globals.css, SESION_24MAR2026_CONTEXTO_COMPLETO.md
