# Benchmark competitivo — Torneos de Equipos: Golfers+ vs The Grint vs VPAR

**Fecha:** 2026-05-22
**Autor:** Claude (CTO)
**Scope:** FASE 5 — UX organizador de torneos de EQUIPOS. Foco en flujo new-user → torneo creado.
**Memoria del proyecto:** "The Grint y V-Par son las dos mejores apps de golf y referencia obligatoria en TODO benchmark."

---

## 1. Resumen ejecutivo

**The Grint** y **VPAR** son los dos competidores globales más relevantes y representan dos **modelos opuestos** de cómo se organiza un torneo de equipos:

- **The Grint** = modelo **consumer self-service**, gratis-con-Pro-upsell, basado en *Leaderboards* + *Tours* dentro de una app social tipo red de amigos. Bajo en fricción, pero todos los participantes que ingresen scores necesitan cuenta ("Grinter"). Origen: USA / Argentina (CEO José Torbay).
- **VPAR** = modelo **dual**: consumer freemium (£49.99/año Premium) + **VPAR Tournament Service / VPAR for Clubs**, sales-led con account manager dedicado, dirigido a clubes, corporativos y pro-ams. La organización seria de torneos pasa por demo + cotización, no por self-service.

Ninguno de los dos tiene presencia conocida en Chile ni soporte específico para **modalidades chilenas** (Match Play x Bandera, Bola Pinta) — territorio defendible para Golfers+.

---

## 2. The Grint — flujo end-to-end "organizador → torneo de equipos creado"

### 2.1 Modelo de producto

The Grint expone dos primitivas para competición multi-jugador:

1. **Leaderboards** ([thegrint.com/range/post/set-leaderboard-thegrint-app](https://thegrint.com/range/post/set-leaderboard-thegrint-app)) — leaderboard one-shot para una ronda. Modos: Individual, **Teams**, **Ryder Cup**.
2. **Tours** ([thegrint.com/range/post/thegrint-golf-new-tour-feature](https://thegrint.com/range/post/thegrint-golf-new-tour-feature)) — serie de eventos (hasta 4 rondas/evento) con acumulación de puntos. Solo el organizador edita.
3. **Groups** ([thegrint.com/range/post/3-examples-of-when-to-use-the-groups-feature](https://thegrint.com/range/post/3-examples-of-when-to-use-the-groups-feature)) — comunidades persistentes con leaderboards recurrentes (Saturday stableford, Wednesday skins). Públicos / Friends / Privados con invite link.

### 2.2 Flujo Leaderboard de Equipos (caso "torneo de un día")

Según la documentación oficial, **4 pasos** desde Home hasta leaderboard activa:

1. Tap **PLAY** en Home.
2. Tap **JOIN/CREATE A LEADERBOARD** en el popup.
3. Tap **CREATE** → elegir formato (Individual / **Teams** / Ryder Cup) → nombre + **password**.
4. Tap **JOIN LEADERBOARD** para entrar como organizador-participante.

Compartir: link, búsqueda por nombre + password, o email a no-Grinters.

**Requisito crítico:** "At least one TheGrint user per foursome must track scores. Non-Grinters can be added via email but cannot input their own scores — a Grinter must do this for them" (fuente oficial). Esto es **fricción dura** para un torneo chileno: si un club tiene 60 jugadores y solo 10 son Grinters, hay un cuello de botella en captura de scores.

### 2.3 Flujo Tour multi-evento

3 pasos según [thegrint.com/range/post/organize-golf-leagues-and-tours-using-thegrint](https://thegrint.com/range/post/organize-golf-leagues-and-tours-using-thegrint):

1. Tab **Tours** → **Create a Tour**.
2. **Add Members** — solo Grinters que ya sean tus amigos en el sistema.
3. **Schedule Events** — agregar eventos individuales, categorías, deadlines, point systems.

Limitación documentada: los miembros deben ser amigos previos en la red social The Grint. Esto es **fricción social**: no se puede armar un torneo abierto con jugadores que no te siguen.

### 2.4 Formatos de equipo soportados

Confirmados oficialmente ([Groups feature](https://thegrint.com/range/post/3-examples-of-when-to-use-the-groups-feature)):

- **Scramble**
- **Best Ball**
- **Added Scores** (suma del equipo)
- **Alternate Shot**
- **Ryder Cup** (formato dedicado en el creador de leaderboard)

No documentados: Match Play por equipos genérico, Foursomes (variante alternate shot con tee asignado), Texas Scramble, Greensomes, Match Play x Bandera (chileno), Bola Pinta (chileno).

### 2.5 Pricing (verificado contra [thegrint.com](https://thegrint.com/))

- **Free**: 6 formatos de juego, 20 amigos en rankings, 3 green map trials, 3 scorecard picture uploads, 20 score imports.
- **Pro**: **USD $14.99/mes o USD $59.99/año** (~CLP $14.000/mes o $56.000/año a 935 CLP/USD). Sube a 11 formatos, stats, smartwatch, multi-game/press, etc.
- **Pro + GHIN**: USD $92.99/año (incluye handicap oficial USGA).

No requiere tarjeta para signup gratis. The Grint **subió precio en 2020** y eso generó backlash en foros ([GolfWRX](https://forums.golfwrx.com/topic/1412670-thegrint-free-v-premium/), [TexAgs](https://texags.com/forums/60/topics/3082565)).

**Importante:** la creación de leaderboards de equipos **no requiere Pro** según la documentación — está disponible en el tier gratis. Pro principalmente desbloquea stats avanzados, no torneos.

### 2.6 Invitación de jugadores

- Link compartible (mensaje, WhatsApp).
- Search-by-name + password dentro de la app.
- Email a no-Grinters (pero solo lectura — no pueden ingresar scores).
- Para Tours: deben ser amigos pre-existentes en The Grint.

### 2.7 Time-to-first-tournament (estimado)

- **Signup + verificación email**: ~2 min.
- **Crear leaderboard equipos**: ~1 min.
- **Invitar 10 jugadores**: ~3-5 min (asumiendo todos ya son Grinters y amigos; si no, multiplicar).
- **Total realista**: **5-8 min para organizador solo**, pero hay un **bloqueo social**: si los jugadores no son Grinters ni amigos, no hay torneo real (solo el organizador captura todo).

---

## 3. VPAR — flujo end-to-end "organizador → torneo de equipos creado"

### 3.1 Modelo de producto dual

VPAR opera dos canales claramente separados:

1. **VPAR App (consumer freemium)** — el golfista crea games, mete amigos, juega con leaderboard. Algo de tournament-lite vía "Challenges" + códigos.
2. **VPAR Tournament Service / VPAR for Clubs** ([vpar.com/tournament-service](https://vpar.com/tournament-service/), [vpar.com/clubs](https://vpar.com/clubs/)) — modelo enterprise: account manager dedicado, staff on-site para scoring/registración, TV leaderboards, branding. **Requiere contactar ventas** ("Fill out the below information and one of the team will be in touch"). Tres tiers nombrados: **Basic / Tour / Major** — precios no públicos. Usado por FTSE 100, charity orgs, European Tour, PGA Tour Pro-Ams.

Esto significa que un PM tipo capitán de club que quiere armar un torneo **no usa "VPAR" en self-service** como esperarías — usa la app consumer y choca con sus límites, o agenda una demo.

### 3.2 Flujo en VPAR App (consumer, self-service)

Reconstrucción desde [vpar.zendesk.com — Adding Players](https://vpar.zendesk.com/hc/en-us/articles/360017462237) (Zendesk bloqueó scraping con 403; datos vía SERP snippet de Google) y [Surrey Chambers PDF tutorial](https://www.surrey-chambers.co.uk/wp-content/uploads/2017/06/VPAR-App-How-to-use.pdf):

**Flujo "Join a Tournament" (jugador invitado):**
1. Download app (App Store / Play Store).
2. Register (email + password).
3. Tab **Challenge** → search icon → **enter code** → Join.

**Flujo "Create a Game" (organizador en self-service, Premium):**
1. Crear game → seleccionar **Multi Tee Times**.
2. Agregar tee times adicionales para más grupos.
3. Invitar amigos (deben tener perfil VPAR; si no, crear uno desde el flujo "create").
4. Asignarlos a sus tee times.

**Limitación crítica:** según docs oficiales, "Guest Profiles" (agregar players sin email válido) está bloqueado tras **Premium** (£49.99/año). En free, todos los jugadores necesitan cuenta VPAR.

### 3.3 Formatos de equipo soportados

Confirmados en [VPAR Quick Guide to Playing Formats](https://vpar.com/a-quick-guide-to-playing-formats/) + [Zendesk Game Formats](https://vpar.zendesk.com/hc/en-us/articles/19319259964189) (vía snippet):

- **Four-Ball / Best Ball** (parejas, cada uno su bola, mejor score)
- **Foursomes** (alternate shot, tee odd/even)
- **Scramble** (2/3/4 jugadores, mejor tiro)
- **Greensomes** (ambos tee, mejor drive, alternate)
- **Matchplay** (Premium-gated)
- **Strokeplay, Stableford** (incluidos free)
- **Side Games** (Premium-gated)

VPAR's página oficial menciona "VPAR caters for every scoring format" pero no documenta públicamente: Match Play x Bandera, Bola Pinta, ni variantes regionales.

### 3.4 Pricing (verificado contra [vpar.com/premium](https://vpar.com/premium/) y reviews)

- **Free**: 40k+ courses, GPS, scorecards, live leaderboards básicos, strokeplay/stableford.
- **Premium**: **£6.99/mes o £49.99/año** (~USD $8.81/mes o $62.99/año, ~CLP $8.200/mes o $58.000/año). Desbloquea Matchplay, Multi-Round, Side Games, Guest Profiles, smartwatch, club recommendation, weather, sin ads.
- **VPAR for Clubs / Tournament Service**: **Precio no público — solicitar demo**. Anecdóticamente, tournament service para corporate event ronda los **£500-£3,000 GBP por evento** según volumen y staff on-site (rango inferido de reviews indirectos, **NO confirmado oficialmente — marcar como tentativo**).

### 3.5 Invitación de jugadores

- **Código de torneo** único (Challenge code) — el más simple, modelo "Slack invite": organizador comparte código, jugadores entran via search.
- Search-by-name dentro de la app (si ya se siguen).
- Crear perfil para no-VPAR users desde el flujo (Premium-only).

Este modelo de **código corto** es claramente superior al "agregar amigo + esperar accept + crear leaderboard + password" de The Grint para torneos abiertos.

### 3.6 Time-to-first-tournament (estimado)

- **App consumer self-service (10 jugadores)**: ~10 min (signup todos + Premium del organizador para guest profiles + tee time assignment).
- **Tournament Service enterprise**: **días o semanas** — demo, contrato, setup por account manager. NO es comparable a self-service.

---

## 4. Tabla comparativa

| Dimensión | Golfers+ | The Grint | VPAR |
|---|---|---|---|
| **Tier para torneo equipos** | _pendiente_ | Gratis (Leaderboards y Groups) | Free básico; Premium para Multi-Round/Matchplay/Guest; Enterprise (Clubs) para torneos serios |
| **# pasos signup → torneo creado** | _pendiente_ | ~4-6 (signup → PLAY → Create Leaderboard → format → invitar) | ~5-7 self-service; "días" si Tournament Service |
| **Modalidades equipo** | _pendiente_ | Scramble, Best Ball, Added Scores, Alternate Shot, **Ryder Cup dedicado** | Four-Ball, Foursomes, Scramble, Greensomes, Matchplay (Premium) |
| **Onboarding handicap** | _pendiente_ | GHIN-integrado (USGA, USA-centric); organizador puede ajustar handicaps de miembros del Tour | VPAR Handicap propio (Premium); también acepta handicaps cargados manual por organizador |
| **Invitación jugadores** | _pendiente_ | Link, search+password, email (no-Grinters solo lectura). Para Tours: amigos pre-existentes obligatorio | **Código de torneo (Challenge code)** — ágil. Guest Profiles para no-VPAR sólo en Premium |
| **Modalidades chilenas (Match Play x Bandera, Bola Pinta)** | _pendiente_ | No documentado. No soporte específico. | No documentado. No soporte específico. |
| **UX mobile-first** | _pendiente_ | App-only (iOS/Android), web mínima. Diseño social-first (red de amigos). | Mobile-first + TV leaderboard + web mirror. Estética "live event sports". |
| **Pricing free tier** | _pendiente_ | Gratis con 6 formatos, 20 amigos rankings, leaderboards de equipos INCLUIDOS | Gratis con 40k+ cursos, GPS, leaderboards básicos. Matchplay/Multi-Round bloqueados |
| **Pricing Pro / Premium** | _pendiente_ | USD $14.99/mes / $59.99/año (~CLP $56k/año) | £6.99/mes / £49.99/año (~USD $63/año, ~CLP $58k/año) |
| **Time-to-first-tournament** | _pendiente_ | 5-8 min si jugadores ya son Grinters; bloqueado si no | 10 min self-service Premium; días si Tournament Service |
| **Diferenciador principal** | _pendiente_ | Red social + GHIN handicap oficial USGA + Tours multi-evento | Live leaderboards estilo "Pro-Am" + servicio enterprise con staff on-site |

---

## 5. 5 mejores prácticas a robar

1. **Código de torneo corto (VPAR Challenge Code).** Un organizador comparte un código de 6 dígitos, el jugador lo tipea en la app y entra. Cero "agregar amigo y esperar accept". **Razón:** elimina la fricción social asíncrona — clave para clubes donde el capitán organiza un día antes y necesita 60 jugadores adentro en minutos. Ejemplo: VPAR Tab Challenge → search icon → enter code.

2. **Formato Ryder Cup como botón dedicado (The Grint).** No solo "team scramble" — un flow específico para torneo Capitanes vs Capitanes con asignación automática de equipos y match individual point system. **Razón:** torneos de clubes chilenos usan Ryder Cup intensivamente (interclubes, copas). Tenerlo como primitiva en lugar de "armable con building blocks" reduce errores de setup. Fuente: [The Grint Ryder Cup format](https://thegrint.com/range/post/ryder-cup-format-thegrint).

3. **Groups persistentes con leaderboards recurrentes (The Grint).** El grupo "Saturday Stableble del club Apoquindo" vive más allá de un torneo único — cada sábado se abre un nuevo leaderboard con los mismos miembros. **Razón:** clubes chilenos juegan torneos recurrentes (Copa del Año, Liga del Mes). Modelar "grupo persistente" vs "torneo one-shot" reduce setup repetitivo.

4. **Leaderboards en TV / pantalla del club (VPAR).** La integración pantalla → TV del club house es parte del UX del organizador, no afterthought. **Razón:** torneos chilenos terminan en el club house con cócteles y la pantalla con scores en vivo es parte de la experiencia premium. Diferenciador físico clave.

5. **Tier free debe permitir torneos completos (The Grint).** The Grint NO gatea team leaderboards detrás de Pro — están en el free. **Razón:** si Golfers+ cobra por crear torneos, el organizador prueba una vez y se cae. Estrategia "freemium correcto": gratis la creación, pago el stats/historial/analytics persistente.

---

## 6. 3 anti-patrones a EVITAR

1. **Obligar a todos los jugadores a tener cuenta para que sus scores se vean (The Grint).** "Solo Grinters pueden capturar scores; los no-Grinters van como email-only sin acceso al leaderboard." Esto rompe el caso "60 jugadores en torneo de club, 50 sin la app". **Solución Golfers+:** permitir "guest players" con código + nombre + handicap, capturados por el organizador o por cualquier miembro del grupo con celular. Diferenciador real.

2. **Sales-led / "request a demo" para torneos serios (VPAR).** Si el capitán del club tiene que esperar 3 días por una llamada de ventas para precio + setup, **no va a usar el producto**. Capacidad self-service total para torneos hasta N jugadores es no-negociable. **Solución Golfers+:** dejar todos los tiers self-service. Account manager opcional, no gating.

3. **Pricing en USD/GBP sin opción local (ambos).** The Grint $59.99/año = CLP $56.000 con conversión + IVA + comisión Apple/Google = realmente ~$70.000-80.000 CLP percibidos. Nadie en Chile paga eso sin sentir que es caro vs un GreenFee. **Solución Golfers+:** pricing en CLP con WebPay/transferencia, idealmente plan anual <$30.000 CLP.

---

## 7. Posicionamiento estratégico Golfers+ vs Grint/VPAR para clubes chilenos premium

Ventajas competitivas defendibles (foco premium chileno):

1. **Cobertura nativa de la cancha chilena.** 137 canchas FedeGolf + 2034 hoyos sincronizados (proyecto activo). Grint y VPAR usan databases globales con datos imprecisos en Chile (CR/slope mal, tees DAMAS/VARONES no diferenciados correctamente — error documentado en memoria del proyecto). **Defensa:** mientras Golfers+ tenga el contrato directo con FedeGolf y los datos vivos, Grint/VPAR no pueden igualar la precisión sin esfuerzo equivalente. Fuente: `project_fedegolf_integration.md`.

2. **Modalidades chilenas como first-class.** Match Play x Bandera y Bola Pinta no existen en ningún competidor global. Para el target premium (clubes Sport Francés, Lomas, Marbella, Apoquindo), estas modalidades son el formato preferido los fines de semana. **Defensa:** networks effects locales — si los jugadores ya usan Golfers+ para Bola Pinta, no migran a una app que no la soporta.

3. **Pricing en CLP, soporte chileno, idioma español.** VPAR está en inglés (UK-centric), The Grint mezcla español-inglés (Torbay es argentino). Pricing USD/GBP genera fricción percibida real. **Defensa:** marca local creíble, soporte en horario chileno, pricing transparente en CLP.

4. **Handicap oficial chileno (WHS via FedeGolf) integrado.** The Grint integra GHIN (USGA), VPAR su propio handicap. Para clubes chilenos federados, el handicap oficial WHS via FedeGolf es lo que cuenta. **Defensa:** ya está construido (sync índice WHS en prod). Diferenciador estructural.

5. **Self-service total + UX organizador-first.** VPAR tiene la mejor primitiva (código corto) pero la oculta atrás de Premium/sales. The Grint tiene mejor self-service pero arrastra fricción social (amigos previos). **Oportunidad:** Golfers+ puede ofrecer self-service VPAR-style (código de 6 dígitos, guests sin cuenta) sin el sales-gate, sin la amistad-previa-obligatoria, y con pricing local. Combo ganador.

---

## 8. Hallazgos sorpresivos

1. **VPAR es enterprise-first disfrazado de consumer app.** La marca pública es "world's #1 Golf App" pero el negocio de verdad es VPAR Tournament Service con account managers para FTSE 100 y PGA Pro-Ams. La app consumer es lead-gen. Esto explica por qué la creación de torneos serios en self-service es deliberadamente subóptima — quieren que llames a ventas.

2. **The Grint tiene 11 formatos en Pro vs 6 en Free, pero los formatos de equipo (Scramble, Best Ball, Alternate Shot, Added Scores, Ryder Cup) están TODOS en Free.** El gating premium es por stats y green maps, no por torneos. Esto es una decisión de producto inteligente (los torneos generan retención social) que Golfers+ debería replicar.

3. **The Grint exige "amigos previos" para Tours pero NO para Leaderboards one-shot.** Esto sugiere que internamente reconocen la fricción y mantienen dos primitivas: una "abierta" (leaderboard con password) y otra "cerrada" (Tour amigos-only). Esto valida tener en Golfers+ "torneo con código abierto" + "torneo solo amigos" como modos separados.

4. **VPAR cobra **Premium** por **Guest Profiles** (jugadores sin email).** Esto es exactamente el caso del torneo chileno típico (60 jugadores, 50 sin app). Cobrar Premium por esa feature es un **error estratégico** que Golfers+ puede explotar: ofrecerla gratis.

5. **Hay un mercado "VPAR for Clubs" pero ni VPAR ni Grint lo atacan en Chile.** Top 100 Golf Courses lista canchas chilenas premium (Sport Francés, Marbella, Lomas) que serían exactamente target VPAR Clubs, pero VPAR no tiene presence ni soporte local. Espacio en blanco.

6. **The Grint subió precio en 2020 y generó backlash sostenido.** Foros como [GolfWRX](https://forums.golfwrx.com/topic/1412670-thegrint-free-v-premium/) y [TexAgs](https://texags.com/forums/60/topics/3082565) muestran que parte de la base estaba acostumbrada a free + handicap GHIN-equivalente. Lección: cualquier transición free → paid debe ser cuidadosa y grandfather a usuarios existentes.

---

## 9. Limitaciones de este benchmark

- **VPAR Zendesk bloqueó scraping (HTTP 403)**. Algunos detalles de "Adding Players" y "Creating a Game" se infirieron de SERP snippets, no de la página completa. Confianza: **media-alta** para datos de formatos/pricing (verificados en múltiples fuentes); **media** para flujo step-by-step exacto.
- **No probamos las apps físicamente.** Todo el reconstruction es desde docs oficiales + reviews. Un teardown real (signup + crear torneo en cada una con cronómetro) refinaría time-to-tournament real. Recomendado como FASE 6.
- **Pricing VPAR Tournament Service: NO PÚBLICO.** El rango £500-£3,000/evento es inferencia indirecta de reviews — **marcar como tentativo**.
- **Confianza realidad 2026: 7/10.** Datos sólidos de pricing y formatos; gaps en UX exacto del organizador y en cómo los clubes chilenos perciben hoy a estos competidores (research cualitativo pendiente).

---

## Fuentes citadas

- The Grint home + pricing: [thegrint.com](https://thegrint.com/) (acceso 2026-05-22)
- The Grint Leaderboards: [Setup tutorial oficial](https://thegrint.com/range/post/set-leaderboard-thegrint-app)
- The Grint Tours: [New Tour Feature](https://thegrint.com/range/post/thegrint-golf-new-tour-feature) + [Organize Tours](https://thegrint.com/range/post/organize-golf-leagues-and-tours-using-thegrint)
- The Grint Groups: [Groups Feature](https://thegrint.com/range/post/3-examples-of-when-to-use-the-groups-feature)
- The Grint Ryder Cup: [Ryder Cup Format](https://thegrint.com/range/post/ryder-cup-format-thegrint)
- The Grint price backlash: [GolfWRX](https://forums.golfwrx.com/topic/1412670-thegrint-free-v-premium/), [TexAgs](https://texags.com/forums/60/topics/3082565), [GolfN comparison](https://www.golfn.com/blogs-items/grint-comparison-free-golf-app)
- VPAR home: [vpar.com](https://vpar.com/)
- VPAR Premium pricing: [vpar.com/premium](https://vpar.com/premium/)
- VPAR Tournament Service: [vpar.com/tournament-service](https://vpar.com/tournament-service/)
- VPAR for Clubs: [vpar.com/clubs](https://vpar.com/clubs/)
- VPAR Playing Formats: [Quick Guide](https://vpar.com/a-quick-guide-to-playing-formats/) + [Zendesk Game Formats](https://vpar.zendesk.com/hc/en-us/articles/19319259964189-Game-Formats)
- VPAR Review (Plugged In Golf): [pluggedingolf.com/vpar-golf-app-review](https://pluggedingolf.com/vpar-golf-app-review/)
- VPAR Tutorial PDF (2017, Surrey Chambers): [Tournament How-to PDF](https://www.surrey-chambers.co.uk/wp-content/uploads/2017/06/VPAR-App-How-to-use.pdf)
- Comparison context: [PlayThru 8 Apps Compared](https://www.golfplaythru.com/blog/8-of-the-top-golf-scoring-apps-compared)
- MyGolfSpy The Grint profile: [mygolfspy.com](https://mygolfspy.com/news-opinion/who-or-what-is-thegrint/)

---

**Word count:** ~2,750 palabras (dentro del límite de 3,000).
