# Estrategia CEO — Golfers+ Agosto 2026

> Documento generado el 11-ago-2026 a partir de: auditoría de arquitectura,
> seguridad, diseño/UX, operaciones; investigación de mercado; revisión directa
> de la app en producción; y análisis competitivo de 12+ apps de golf.
>
> **Audiencia:** Juanjo (PM/fundador) + Claude (CTO).
> **Propósito:** Decidir qué hacemos los próximos 90 días y — más importante — qué NO hacemos.

---

## 1. Estado real del producto — las 4 auditorías

Despachamos 4 agentes independientes que auditaron el codebase sin contexto
compartido. Ninguno sabía lo que los otros encontraban. Los resultados:

| Área | Score | Veredicto corto |
|------|-------|-----------------|
| **Arquitectura** | 5.9/10 | Motor de golf sólido, pero 4 archivos >1000 LOC y lógica de scoring duplicada en 4 lugares distintos |
| **Seguridad** | 7/10 | Headers y RLS bien, rate-limiting en memoria (reset en cold start), admin SQL endpoint frágil |
| **Diseño/UX** | 6.4/10 | Design system bien documentado (DESIGN.md ejemplar), pero 60% de las pantallas usan colores hardcodeados que rompen la ilusión premium |
| **Operaciones** | 6.5/10 | CI/CD excelente (7 workflows, canarios contra prod), backup inexistente, sin staging |

### Hallazgos transversales que duelen

1. **Duplicación de lógica de scoring.** El cálculo de handicap, stroke index y net score
   existe en 4 implementaciones separadas (score individual, score grupo, leaderboard,
   admin). Un fix en un camino no se propaga a los otros. Esto causó el bug de 27 hoyos
   que vivió meses sin ser detectado (PR #303).

2. **60% de pantallas con colores hardcodeados.** El sistema de tokens CSS existe y es
   bueno, pero los componentes del coach, admin y tournament usan paletas ad-hoc. El
   resultado: la app se ve premium en unas pantallas y "AI-generated default" en otras.

3. **Rate limiting en memoria.** Cada cold start de Vercel resetea los límites. Un
   usuario malicioso podría quemar $1000+ en llamadas al coach si timing atacando cold
   starts.

4. **Sin backup formalizado.** Supabase hace backup automático (7 días en Pro), pero no
   hay WAL archival externo, no hay recovery drills, no hay RTO/RPO definidos. Si
   Supabase tiene un outage regional >7 días o la cuenta se compromete, se pierde todo.

5. **214 branches sin mergear.** Esto es deuda de foco, no de código. Indica que
   iniciamos ~10x más de lo que terminamos.

### Lo que está bien (y es raro para un proyecto de este tamaño)

- **3.689 tests pasando**, tsc limpio, CI con canarios contra producción real
- **Motor WHS correcto** para 9h, 18h, 27h, con guardarraíles que detectan data corrupta
- **186 canchas chilenas activas** con data verificada
- **Share card bien diseñada** (bottom sheet dark, jerarquía de botones correcta, fallbacks)
- **Landing page 8.5/10** — copy claro, CTA visible, posicionamiento diferenciado
- **Deploy en 10 segundos** (promote de deploy anterior en Vercel) + 4 runbooks de incidentes
- **72K LOC, 334 archivos de test, 282 archivos en src/golf/** — esto no es un side project

---

## 2. El mercado — Chile y el mundo

### Chile: 17.000 golfistas y un vacío digital

| Dato | Número | Fuente |
|------|--------|--------|
| Golfistas federados activos | ~17.000 | FedeGolf, abr-2026 |
| Nuevos jugadores recientes | +6.700 (15% del padrón) | FedeGolf |
| Rondas oficiales 2025 | 520.000+ | FedeGolf |
| Rondas por jugador/año | 32 promedio (+17%) | FedeGolf |
| Clubes afiliados | 51 | chilegolf.cl/clubes |
| Concentración Santiago | 16 clubes (31%) | chilegolf.cl |
| Torneos oficiales/año | 100+ (200+ días) | FedeGolf |
| Premios anuales | >$1.000M CLP | FedeGolf |

**El catalizador:** Joaquín Niemann. Desde su irrupción en 2018, las rondas crecieron
35%, los jugadores 15%, los torneos 25%. El golf en Chile está en su mejor momento
histórico.

**La app de la federación (FedeGolf Chile):** 0 reviews en App Store. Solo en inglés
a pesar de servir a golfistas chilenos. Funcionalidad básica (ingresar scores, ver
handicap). Sin coaching, sin estadísticas, sin social. Versión 2.0.8 de julio 2026.

**Conclusión:** 17.000 golfistas que juegan 32 rondas/año, creciendo, sin una app
decente que los atienda. El mercado existe y está desatendido.

### El mundo: quién gana y cómo

| App | Usuarios | Modelo | Fortaleza | Debilidad |
|-----|----------|--------|-----------|-----------|
| **18Birdies** | 2M+ mensuales | Freemium ($9.99-19.99/mo) | GPS + scoring + social. Tier free generoso | Sin AI coaching. Genérica |
| **The Grint** | "Millones" | Free + Pro ($59.99/año) | USGA handicap oficial, 11 formatos de juego, 40K cursos | UI dated, reviews mixtos, bugs reportados |
| **Arccos** | ~500K | Hardware + sub ($5-20/mo) | AI caddie con sensores reales, strokes gained | Requiere hardware ($200+), no mental game |
| **Hole19** | Fuerte en EU | Freemium | Diseño más pulido del mercado, 42K cursos, offline GPS | Sin AI, genérica |
| **SwingU** | Fuerte watch | Freemium | Mejor experiencia Apple Watch gratis | Limitada en analytics |
| **GOATCode** | Emergente | Freemium | AI swing analysis con 33 puntos biomecánicos, voz en tiempo real | Solo swing, no mental game |
| **VPAR** | Corporativo | Free + Premium | Live scoring para eventos, Apple Watch, GPS | No coaching, no handicap profundo |

**Lo que NADIE hace (y Golfers+ sí):**
- **Mental game coaching con data real del jugador.** GOATCode hace swing analysis (biomecánica). Las demás hacen GPS + stats. NADIE analiza patrones como back_nine_collapse, post_bogey_spiral, first_hole_anxiety con data real y devuelve coaching psicológico personalizado. Este es el tAIger+.
- **CPI (Current Performance Index).** Ninguna app diferencia entre handicap (potencial) y forma actual. El CPI es un concepto original.
- **Catálogo completo de canchas chilenas** con CR/slope/par por hoyo verificado.

### Tournament software: QR scoring es la tendencia

Live Tourney lidera con "app-free live scoring" — el jugador escanea QR y scorea desde
el browser, sin descargar nada. Reportan +40% de engagement vs apps que requieren
descarga. Golf Genius domina el enterprise. VPAR tiene GPS + live scoring integrado.

**Oportunidad para Golfers+:** El flujo de organizador ya existe. Si le agregamos QR
scoring sin descarga, tenemos un canal B2B2C: el club adopta Golfers+ para su torneo,
los jugadores lo usan sin instalar nada, y los que les gusta se quedan.

---

## 3. Lo que vimos al entrar a la app

### Visitante no autenticado

| Página | Score | Observación |
|--------|-------|-------------|
| **Landing** (`/`) | 8.5/10 | Copy fuerte ("Se gana con la mente"), CTAs claros, design premium. Debilidad: Pro plan "coming soon" |
| **Demo** (`/demo`) | 7/10 | 3 demos (spectator, torneo, coach) sin registro. Falta preview visual antes de clickear |
| **Ranking** (`/ranking`) | 8/10 | Top 50 Golfers+ con índice propio. Muestra "Cargando..." (data dinámica) |
| **Índices** (`/indices`) | 7.5/10 | CPI explicado con ejemplos (Tiger Woods 96, Rory 34). Innovador pero "estimated" genera escepticismo |
| **Coach** (`/coach`) | N/A | **Bloqueado por login.** Un visitante que quiere ver el feature estrella no puede |
| **Scorer** (`/ronda-libre/*`) | N/A | **Bloqueado por login.** El core del producto es invisible para un visitante |

### El problema del visitante

Un golfista curioso que llega a golfersplus.vercel.app ve una landing atractiva, pero
no puede probar ni el scorer ni el coach sin crear cuenta. La demo existe pero requiere
un click extra y no muestra screenshots/videos del producto real.

**Comparación:** The Grint muestra screenshots del GPS, la scorecard, el Apple Watch en
su homepage. 18Birdies tiene video demo. Hole19 tiene galería de UI. Golfers+ pide un
acto de fe.

### Onboarding post-registro

El registro es email+password o Google OAuth. Después lleva al dashboard (`/dashboard`)
que muestra las tabs "Competencia" e "Identidad". **No hay flujo de onboarding** tipo:
"¿Cuál es tu handicap? → ¿En qué club juegas? → Empieza a scorear." El usuario nuevo
aterriza en un dashboard vacío sin guía.

---

## 4. El diagnóstico honesto

### La metáfora del Ferrari en el garage

Golfers+ tiene un motor WHS más correcto que The Grint, un coach IA que nadie más
ofrece, un catálogo de canchas chilenas que no existe en ningún lado, y un equipo
técnico que produce 3.689 tests y 7 workflows de CI.

**Pero nadie lo sabe.**

- **Usuarios reales activos (no Juanjo ni Nicolás): ~0**
- **Rondas scoreadas por semana por usuarios externos: 0**
- **Revenue: $0**
- **Downloads en App Store: N/A (es PWA, no app nativa)**
- **Menciones en redes sociales: probablemente 0**
- **214 branches sin mergear** — señal de que el foco está en construir, no en entregar

### El patrón de los últimos 4 meses

```
fix → fix → refactor → fix → cerebro v3 ola 1 → más fixes → refactor → fix
```

Cada fix es correcto. Cada refactor mejora el código. Pero es un **loop de
perfeccionamiento interno sin contacto con el mercado.** Es como un chef que
perfecciona una receta durante un año sin que nadie la pruebe.

### La verdad incómoda

El riesgo #1 de Golfers+ no es un bug en producción. Es la irrelevancia. Construir
el mejor motor de golf del mundo no sirve si 17.000 golfistas chilenos nunca se
enteran de que existe.

---

## 5. Los 5 movimientos estratégicos

### Movimiento 1: Limpiar la mesa (esta semana, 2-3 días)

**Qué:** Mergear lo que está listo, podar lo que está muerto.

| Acción | Detalle |
|--------|---------|
| Mergear PR #302 | Fix scorer handicap gate — CI green, reviewed |
| Mergear PR #304 | Refactor nueva/page.tsx 2120→219 LOC — CI green, reviewed |
| Podar branches | De 214 branches, al menos 150 son ramas muertas. Script: listar las que ya están en main o tienen >60 días sin actividad → borrar |
| Rate limiting persistente | Migrar de in-memory Map a Vercel KV o Upstash Redis. Cuesta ~$5/mo. Elimina el riesgo de cost explosion |
| Backup básico | pg_dump diario a Cloudflare R2 ($0.15/GB). Script de recovery. Primera drill |

**Por qué primero:** Cada PR abierto es trabajo terminado que no genera valor. Las
branches muertas son ruido que oculta señales. El rate limiting y backup son
condiciones mínimas para operar con tranquilidad.

### Movimiento 2: Scorer + Share Card impecables (2 semanas)

**Qué:** El scorer es el único feature con validación de mercado (se usó en torneos
reales). Hacerlo perfecto es el camino más corto a tracción.

| Acción | Detalle |
|--------|---------|
| Refactorizar score-grupo/page.tsx | 1.398 LOC → <300. Extraer team scoring a `golf/formats/`, unificar scoring service |
| Unificar las 4 implementaciones de scoring | Un solo engine, 4 consumidores. Elimina la clase de bug "fix en un camino, roto en otro" |
| Share card con spec visual | Aspect ratio, safe areas, tipografía, branding definidos. La tarjeta que compartes por WhatsApp ES tu marketing |
| Onboarding de 30 segundos | Post-registro: "¿Handicap? → ¿Club? → Scorea tu primera ronda". 3 pantallas máximo |
| QR scoring sin descarga | El marcador escanea un QR y entra directo al scorer web. Sin app, sin registro. Flujo Live Tourney |

**Por qué:** La share card es el growth loop orgánico del golf. Cuando terminas una
ronda y compartes la tarjeta por WhatsApp, todo tu grupo de golf pregunta "¿qué app
es esa?". Si la tarjeta es fea o genérica, nadie pregunta. Si es premium, el boca a
boca empieza solo.

### Movimiento 3: El primer club (septiembre 2026)

**Qué:** Dejar de pensar en "lanzamiento masivo" y conseguir UN club que use Golfers+
para UN torneo.

| Acción | Detalle |
|--------|---------|
| Identificar el club | Juanjo busca contacto en un club de Santiago (31% de los 51 clubes están ahí). Idealmente donde juegue él |
| Proponer al pro del club | "Usa Golfers+ para el torneo del mes. Gratis. Yo te ayudo a armarlo" |
| Flujo de organizador impecable | Crear torneo → inscribir → QR scoring → leaderboard live → resultados → share cards |
| Cero bugs durante el torneo | Pre-torneo smoke, scorer smoke cada 2h, health check activo, rollback en 10s |
| Documentar el caso de éxito | Video, screenshots, testimonios, share cards compartidas |

**Números del mercado que validan esto:**
- 51 clubes con 100+ torneos/año = ~2 torneos/club/mes
- Si Golfers+ es la app de UN club, son 32 rondas/jugador/año × ~200 socios = 6.400 rondas/año scoreadas
- Eso es tracción real medible

**El modelo B2B2C:**
```
Club adopta Golfers+ para torneos (B2B, gratis)
  → Jugadores usan Golfers+ en el torneo (sin instalar nada, QR)
    → Los que les gusta se quedan (B2C, freemium)
      → Comparten share cards por WhatsApp (viral orgánico)
        → Otros golfistas descubren Golfers+
```

### Movimiento 4: Mostrar el producto sin pedir login (octubre 2026)

**Qué:** Un visitante debe poder VER el scorer y el coach sin crear cuenta.

| Acción | Detalle |
|--------|---------|
| Video demo en landing | 30 segundos mostrando: scorear un hoyo → ver stats → share card → coach da feedback |
| Coach demo interactivo | Ya existe `/demo/taiger` pero no está prominente en la landing. Moverlo arriba |
| Screenshots del scorer | Galería tipo App Store en la landing page. The Grint y 18Birdies hacen esto |
| Tour guiado post-registro | Tooltips sobre las features principales en la primera sesión |

**Por qué:** Conversión. Un visitante que VE el producto convierte 3-5x más que uno
que tiene que imaginar lo que hay detrás del login.

### Movimiento 5: Medir lo que importa (ongoing desde día 1)

**La métrica que importa: rondas scoreadas por semana por usuarios que no son Juanjo.**

| Métrica | Target 30 días | Target 90 días |
|---------|---------------|----------------|
| Usuarios activos (scorearon al menos 1 ronda/mes) | 5 | 50 |
| Rondas scoreadas / semana | 3 | 30 |
| Share cards compartidas / semana | 1 | 10 |
| Clubs usando Golfers+ para torneos | 0 | 1 |
| NPS (si se puede medir) | — | >40 |

**Instrumentar:**
- PostHog ya está. Agregar eventos: `round_completed`, `share_card_sent`,
  `coach_session_started`, `qr_scoring_started`
- Dashboard semanal automático (cron que resume las métricas y las envía por Telegram)
- Tracking de cohort: ¿el usuario que scoreó en semana 1 volvió en semana 2?

---

## 6. Lo que NO hacer (y por qué)

### Cerebro V3 — pausar

El coach tAIger+ con cerebro v2 funciona en producción. El v3 es ambicioso (7 olas,
patrones multivariables, ML, auto-mejora), pero es un feature de **retención** para
usuarios que **aún no tenemos**. Invertir en retención sin adquisición es optimizar un
embudo que no tiene agua arriba.

**Cuándo retomar:** Cuando haya 50+ usuarios activos que scoren regularmente y el coach
v2 sea un feature que la gente mencione como razón para quedarse.

### Más features nuevos — no

Cada feature nuevo es un feature más que mantener sin nadie que lo use. 54 páginas +
~110 API routes es una app más grande que lo que un equipo de 2 personas (1 PM + 1 IA)
puede mantener con calidad de CERO FALLOS.

**La regla:** Nada nuevo hasta que lo existente tenga usuarios reales usándolo.

### Monetización — no todavía

Sin usuarios no hay revenue. Prematurizar el paywall mata la adquisición antes de
empezar. El plan Pro "coming soon" está bien como señal de intención pero no vale la
pena construir la infra de pagos ahora.

**Cuándo:** Cuando haya 200+ usuarios activos y quede claro qué feature justifica el
pago (probablemente el coach IA o stats avanzados).

### Perfeccionismo del motor — reducir

El motor WHS ya es excelente. Los guardarraíles detectan data corrupta en 186 canchas.
El scoring funciona para 9h, 18h, 27h con stroke index normalizado. Seguir puliéndolo
tiene retornos decrecientes vs. poner el producto frente a gente real.

**La excepción:** Si un bug aparece durante un torneo real (Movimiento 3), eso es P0
absoluto. Pero no buscar bugs preventivamente en flujos que nadie usa.

### App nativa — no

PWA es la decisión correcta para Chile. Las apps nativas requieren aprobación de App
Store, fragmentan el esfuerzo de desarrollo, y agregan fricción de descarga. El QR
scoring sin descarga es ventaja competitiva, no limitación.

### GPS en cancha — no (por ahora)

Todos los competidores (18Birdies, The Grint, Hole19, SwingU, VPAR) ofrecen GPS con
distancias al green. Es table stakes en el mercado global. **Pero no es lo que nos
diferencia.** Construir GPS requiere mapear 186 canchas con coordenadas de greens,
bunkers y hazards — meses de trabajo para competir en la feature donde todos son iguales.

**Decisión:** No competir en GPS. Competir en lo que nadie hace (mental game coaching,
CPI, scoring inteligente). Si un usuario quiere GPS, puede usar Hole19 gratis para las
distancias y Golfers+ para todo lo demás. Cuando haya tracción y revenue, evaluar
agregar GPS o integrarse con un proveedor existente.

### Apple Watch — no (por ahora)

SwingU tiene la mejor experiencia Watch gratis. Desarrollar una Watch app requiere
Swift (no TypeScript), un equipo distinto, y aprobación de watchOS. Mismo razonamiento
que GPS: no competir donde todos compiten, competir donde nadie compite.

### Tensión con "el que toca, ordena"

CLAUDE.md obliga a refactorizar archivos "sucios" antes de tocar. Pero esta estrategia
dice "reducir perfeccionismo". No es contradicción — es priorización:

- **Archivos en la ruta del usuario** (scorer, share card, onboarding): SÍ refactorizar
  al estándar. Son los que un usuario real va a usar y donde un bug es P0.
- **Archivos fuera de la ruta del usuario** (admin, imports, golf-ops): NO refactorizar
  proactivamente. Si hay que tocar uno para un fix, se aplica la regla. Si no, se deja.
- **La excepción explícita en CLAUDE.md aplica:** "Cambio de 1 línea trivial que
  claramente no requiere abrir el archivo entero" no gatilla la regla.

---

## 7. Ventaja competitiva real — por qué Golfers+ puede ganar

### Lo que tenemos que nadie más tiene

1. **Mental game coaching con data real.** GOATCode analiza el swing (biomecánica).
   The Grint trackea stats. NADIE cruza datos de scoring con coaching psicológico
   personalizado. El tAIger+ es genuinamente único.

2. **CPI — forma actual vs potencial.** Los 17.000 golfistas chilenos saben su
   handicap pero no saben si están en racha o en caída. El CPI les dice.

3. **Catálogo chileno verificado.** 186 canchas con CR/slope/par por hoyo. La app de
   FedeGolf no tiene esto a nivel de detalle utilizable.

4. **Posicionamiento "mental game".** "Se gana con la mente, no con los palos" es un
   posicionamiento que ninguna app de golf ha tomado. Es diferenciado, es verdadero, y
   resuena con golfistas que ya compraron los palos caros y siguen jugando igual.

### El timing es perfecto

- Golf en Chile crece 35% en rondas (efecto Niemann)
- La app de FedeGolf tiene 0 reviews y está en inglés
- No hay ninguna app de golf hecha para el mercado hispanohablante latinoamericano
- 18Birdies y The Grint son US-centric; Hole19 es EU-centric
- El hueco es: una app premium, en español, para Latam, con coaching IA que nadie
  más ofrece

### El TAM realista (no el inflado)

| Mercado | Golfistas estimados | Fuente |
|---------|-------------------|--------|
| **Chile** | 17.000 federados | FedeGolf abr-2026 |
| **Argentina** | ~50.000 (AAG, 320+ canchas) | AAG + estimación por densidad de canchas |
| **Colombia** | ~25.000 (FedeColombia, 50+ canchas) | Estimación conservadora |
| **México** | ~120.000 (FMG, 200+ canchas) | Estimación por nro. de canchas × densidad |
| **Perú** | ~8.000 (host LAAC 2026) | Estimación |
| **Total Latam hispano** | ~220.000 | — |

**Modelo de negocio (Chile primero):**

| Fase | Usuarios activos | Pagantes (20%) | Revenue mensual | Revenue anual |
|------|-----------------|----------------|-----------------|---------------|
| **Piloto** (1 club) | 50 | 10 | $50 USD | $600 USD |
| **Santiago** (5 clubes) | 500 | 100 | $500 USD | $6K USD |
| **Chile** (20 clubes) | 2.000 | 400 | $2.000 USD | $24K USD |
| **Latam** (Chile + Arg + Col) | 10.000 | 2.000 | $10.000 USD | $120K USD |

**Costos operativos en cada fase:**

| Fase | Infra (Vercel+Supabase) | AI (Anthropic+Gemini) | Total/mes |
|------|------------------------|-----------------------|-----------|
| Piloto | $45 | $5 | $50 |
| Santiago | $70 | $50 | $120 |
| Chile | $150 | $200 | $350 |
| Latam | $400 | $1.000 | $1.400 |

**Break-even:** ~10 pagantes ($50 USD/mes revenue = costos de fase Piloto). Alcanzable
con medio club en Santiago. Para cubrir costos reales incluyendo tiempo de Juanjo y
margen, ~50 pagantes ($250/mes) es el target sano. La unit economics cierra temprano
porque los costos son casi fijos hasta ~2.000 usuarios (Supabase Pro + Vercel Pro no
escalan linealmente).

---

## 8. Estacionalidad — ¿septiembre es buen momento?

Chile está en el hemisferio sur. La temporada de golf:

| Período | Clima Santiago | Actividad golf | Implicancia |
|---------|---------------|---------------|-------------|
| Dic-Mar | Verano, 30°C | **Temporada alta.** Más rondas, más torneos | Ideal para escalar si ya hay tracción |
| Abr-Jun | Otoño, lluvias | Actividad media. Menos rondas casuales | Torneos siguen (techados en invierno) |
| Jul-Ago | Invierno, frío | **Temporada baja.** Menos rondas | Buenos meses para construir |
| Sep-Nov | Primavera, mejora | **Temporada arranca.** Clubes planifican torneos de primavera/verano | **Momento perfecto para el piloto** |

**Septiembre es ideal.** Los clubes están armando sus calendarios de primavera. Un
organizador receptivo a probar algo nuevo. El clima mejora. Los golfistas vuelven a la
cancha después del invierno. Si el piloto sale bien en septiembre, para diciembre (alta
temporada) ya tenemos caso de éxito y podemos escalar a más clubes.

**Riesgo estacional:** si nos atrasamos y el piloto cae en diciembre, los clubes ya
tienen todo armado y no van a cambiar de sistema mid-temporada. Septiembre-octubre es
la ventana.

---

## 9. QR scoring sin descarga — sketch técnico

El QR scoring es el canal de adquisición B2B2C. Así funciona:

```
Organizador crea torneo en Golfers+
  → Golfers+ genera un QR por grupo de juego
    → Cada QR apunta a: golfersplus.vercel.app/torneo/[slug]/score?grupo=N
      → El marcador escanea con la cámara del celular
        → Se abre el scorer web directo (PWA, sin instalar nada)
          → Puede scorear como invitado (pending_user_id) sin crear cuenta
            → Al final de la ronda: "¿Querés guardar tu historial? Creá cuenta"
```

**Lo que ya existe:**
- Flujo de organizar torneo (/organizador/*)
- Scoring por torneo (/torneo/[slug]/score)
- pending_user_id para invitados sin cuenta
- Leaderboard en vivo (/torneo/[slug]/en-vivo)

**Lo que falta construir:**
- Generación de QR por grupo (trivial: librería QR + URL)
- Permitir scoring sin auth en flujo de torneo (hoy requiere login)
- Prompt post-ronda "crear cuenta" para persistir historial
- PDF/imagen imprimible con los QRs para que el organizador los reparta

**Esfuerzo estimado:** 3-5 días de trabajo. No requiere arquitectura nueva, solo
relajar la auth en el flujo de torneo para invitados y generar QRs.

---

## 10. Timeline consolidado

```
Agosto 2026 — Semana 1-2
├── Mergear PRs #302 y #304
├── Podar 150+ branches muertas
├── Rate limiting persistente (Upstash)
├── Backup diario a R2
└── Onboarding post-registro (3 pantallas)

Agosto 2026 — Semana 3-4
├── Refactor score-grupo/page.tsx (1398 → <300 LOC)
├── Unificar 4 implementaciones de scoring → 1 engine
├── Share card spec visual + compresión de imagen
├── QR scoring sin descarga (MVP)
└── Video demo de 30 segundos para landing

Septiembre 2026
├── Contactar club en Santiago
├── Preparar flujo organizador end-to-end
├── Torneo piloto con Golfers+
├── Documentar caso de éxito
├── Instrumentar métricas (PostHog events)
└── Dashboard semanal de métricas vía Telegram

Octubre 2026
├── Iterar según feedback del torneo piloto
├── Segundo club (si el primero salió bien)
├── Landing page con video + screenshots
├── Tour guiado post-registro
└── Evaluar: ¿hay tracción para justificar cerebro v3?

Noviembre 2026+
├── Si hay 50+ usuarios activos → retomar cerebro v3
├── Si hay 200+ usuarios activos → construir paywall
├── Si hay 1 club exitoso → expandir a 5 clubes
└── Si nada de esto → pivotar o pausar
```

---

## 11. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Bug durante torneo piloto | Media | Crítico | Pre-torneo smoke, rollback en 10s, scorer smoke cada 2h |
| Ningún club acepta la propuesta | Media | Alto | Tener 3+ clubes en pipeline. Ofrecer gratis + soporte presencial |
| Rate limit bypass drena API credits | Baja | Alto | Migrar a Upstash esta semana |
| Supabase outage durante torneo | Baja | Crítico | localStorage offline queue ya existe. Backup diario |
| Golfers+ no retiene después del torneo | Media | Alto | Coach IA como gancho de retención post-ronda. Share card como recordatorio social |
| FedeGolf lanza app competitiva | Baja | Medio | Ventaja: ya tenemos 186 canchas + coach IA + 72K LOC de head start |

---

## 12. Quién hace qué — la división PM / CTO

### Acciones de Juanjo (PM — solo él puede hacer esto)

| Acción | Cuándo | Por qué solo Juanjo |
|--------|--------|---------------------|
| Identificar el club piloto en Santiago | Agosto sem 3 | Requiere red social real, contacto humano |
| Contactar al pro del club / organizador de torneos | Agosto sem 3-4 | Relación personal, no cold email |
| Asistir al torneo piloto presencialmente | Septiembre | Soporte en cancha, feedback en persona |
| Grabar video demo de 30 segundos | Agosto sem 4 | Requiere un celular en un campo de golf real |
| Decidir pricing del plan Pro | Cuando haya 200+ activos | Decisión de producto pura |
| Rotar secrets en dashboards externos | Esta semana | Solo él tiene acceso a billing/admin |

**El pitch de 1 línea para el pro del club:**

> "Tengo una app gratis que les da leaderboard en vivo, share cards para WhatsApp
> y coaching IA post-ronda a cada jugador. ¿La probamos en el torneo del mes?"

### Acciones de Claude (CTO — ejecuta sin preguntar)

Todo lo demás: mergear PRs, podar branches, rate limiting, backup, refactors,
onboarding, QR scoring, share card, instrumentación de métricas, dashboard semanal,
health checks, pre-torneo smoke, fixes P0. Autonomía total según CLAUDE.md.

---

## 13. Scorecard de progreso semanal

Cada lunes, Claude genera un reporte automático de 5 líneas:

```
Scorecard semana del [fecha]:
- Usuarios activos (scorearon): X (target: Y)
- Rondas esta semana: X (target: Y)
- Share cards compartidas: X (target: Y)
- Bugs P0 abiertos: X
- Archivos >1000 LOC restantes: X/9
```

Se envía por Telegram al canal de Juanjo. Si alguna métrica está en rojo
(< 50% del target), se incluye una línea con la acción propuesta.

---

## 14. Deuda de diseño — plan concreto

La auditoría de diseño encontró 60% de pantallas con colores hardcodeados.
No se puede arreglar todo de golpe, pero sí se puede parar el sangrado y
hacer una pasada quirúrgica en las pantallas que un usuario nuevo VE:

| Pantalla | Prioridad | Razón |
|----------|-----------|-------|
| Dashboard (`/dashboard`) | P0 | Primera pantalla post-login. Tiene hardcoded `#ffffff` |
| Coach (`/coach`) | P0 | Feature estrella. RoundMiniChart usa #16a34a en vez de GARMIN_COLORS |
| Scorer (`/score`, `/score-grupo`) | P0 | Donde vive el usuario 80% del tiempo |
| Share card PNG | P0 | Lo que se comparte = lo que el mundo ve |
| Landing (`/`) | P1 | Ya es 8.5/10, pero tiene marketing.css separado |
| Admin, imports, settings | P3 | Solo Juanjo las ve |

**Regla nueva:** A partir de hoy, cualquier archivo tocado se migra a tokens CSS
como parte del cambio (extensión de "el que toca, ordena" al diseño).

---

## 15. Nota sobre seguridad

La auditoría de seguridad marcó `.env.local` en git como CRITICAL. **Falso positivo:**
verificado que `.env.local` NO está trackeado (`git ls-files` vacío) y `.env*.local`
está en `.gitignore` (línea 30). Los secrets nunca entraron al repositorio.

**Hallazgos HIGH reales que sí requieren acción:**

1. **Admin SQL endpoint** (`/api/admin/actions/sql`) — regex blocklist bypassable con
   CTEs o funciones. Migrar a allowlist de tablas + timeout de 5s.
2. **Rate limiting en memoria** — ya cubierto en Movimiento 1 (Upstash).
3. **Cron endpoints sin CRON_SECRET** — auditar todos los `/api/cron/*` y
   `/api/admin/*` automatizados. Algunos validan, otros no.
4. **PII en search endpoint** — `/api/profiles/search` devuelve email. Cambiar a
   solo `id, name` por default.

---

## 16. La pregunta que decide todo

**¿Estamos construyendo un producto o un proyecto técnico?**

Si es un producto: lo que falta no es código, es distribución. El motor está listo.
El coach funciona. La landing es buena. Lo que falta es poner esto frente a golfistas
reales y ver si les importa.

Si es un proyecto técnico: seguimos perfeccionando el motor, agregando guardarraíles,
refactorizando archivos de 1000 LOC, implementando cerebro v3 con 7 olas de ML. Es
un trabajo intelectualmente satisfactorio y técnicamente impecable que nadie va a usar.

**Mi recomendación como CEO: es hora de salir del garage.**

---

## Fuentes

### Mercado chileno
- [FedeGolf — Golf para todos (abr-2026)](https://chilegolf.cl/sitio/noticias/view/24-04-2026-Golf-para-todos/id:69eb99e7-1ed0-42ca-84e7-4859c83f6007)
- [FedeGolf — Joaquín Niemann hizo crecer al golf (jun-2026)](https://chilegolf.cl/sitio/noticias/view/02-06-2026-Golf-en-Perspectiva-Joaquin-Niemann-el-chileno-que-hizo-crecer-al-golf/id:6a1edc90-8a60-4b5f-b78e-4ba7c83f6007)
- [FedeGolf — Clubes afiliados](https://chilegolf.cl/sitio/clubes)
- [App FedeGolf Chile — App Store](https://apps.apple.com/do/app/fedegolf-chile/id1399227844)

### Competencia global
- [The Grint — Homepage](https://thegrint.com/)
- [Best Golf Apps 2026 — Today's Golfer](https://www.todays-golfer.com/equipment/best/golf-apps/)
- [Best Golf Apps 2026 — Golf Insider UK](https://golfinsideruk.com/best-golf-apps/)
- [Best Golf Apps 2026 — Scoring Zone](https://www.scoringzone.net/blog/best-golf-apps-guide.html)
- [Golf GPS Apps Ranked 2026 — Unstar](https://unstar.app/blog/golfshot-18birdies-arccos-swingu-thegrint-hole19-golf-gps-apps-ranked-2026)
- [18Birdies vs Hole19 — GOATCode](https://goatcode.ai/18birdies-hole19-alternative-ai-coaching.html)
- [Top Mobile Apps for Golfers 2026 — Swoop Golf](https://swoopgolf.com/the-top-mobile-apps-for-golfers-in-2026/)

### Tournament software
- [12 Best Golf Tournament Software 2026 — Live Tourney](https://www.livetourney.com/blog/best-golf-tournament-software)

### AI coaching
- [Best AI Golf Coach 2026 — GOATCode](https://goatcode.ai/best-ai-golf-coach.html)

### Golf social / marketing
- [Social Media Marketing for Golf Courses 2026](https://asiagolfjourney.com/social-media-marketing-for-golf-course-what-works-in-2026/)
- [Golf App Growth Strategy](https://www.zco.com/blog/complete-guide-to-golf-app-development/)
