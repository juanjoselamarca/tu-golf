# Máquina de Verdad — spec de ejecución

**Fecha:** 15 de julio de 2026
**Autor:** Claude (CTO) · diseñado con Juanjo en sesión del 15-jul
**Estado:** APROBADO POR JUANJO — listo para disparar, no ejecutado aún
**Autorización:** Juanjo autorizó explícitamente el uso del tool `Workflow` (fan-out multi-agente) para esta corrida.

---

## Qué es y por qué existe

Una máquina que produce **verdad**, no código. Recorre la app en producción y contesta una sola pregunta:
**¿qué funciona hoy y qué no?**

**El diagnóstico que la originó (15-jul, medido, no opinado):**

- 107.580 LOC productivas, 774 archivos, 103 endpoints, 93 migraciones — para **2 usuarios externos**.
- 329 commits en 60 días. El ritmo de producción NO es el cuello de botella.
- El cuello de botella es **incertidumbre**: Juanjo no sabe qué funciona, y por eso no lanza.
- Más agentes escribiendo código empeoran esto. Esta máquina ataca lo otro.

**Principio rector:** la máquina que mide NO arregla. Report-only en la primera corrida. Un agente que
arregla tiene incentivo a declarar que quedó bien.

---

## Los seis niveles, en tres familias

### ¿Funciona?
1. **¿Carga?** — sin crash, sin 500, sin pantalla blanca.
2. **¿Se completa?** — el flujo entero de punta a punta.

### ¿Es correcto?
3. **¿El número está bien?** — el resultado en prod vs. el cálculo correcto.
   **CRÍTICO:** el agente de nivel 3 NO usa nuestro motor para calcular el esperado. Lo calcula desde las
   reglas de golf, independiente. Si usara nuestro motor, un motor equivocado se confirma a sí mismo — que
   es exactamente cómo se nos escaparon #244, #246, #250 y #252 (stroke index sin normalizar en 9h sobre
   cancha de 18: el leaderboard renderizaba perfecto y el neto estaba mal).
4. **¿El concepto de golf está bien planteado?** — HCP correspondiente al recorrido (hoy en 9h muestra el
   de 18), tee por jugador → slope/CR correcto, damas/varones misma cancha distinto CR/slope, stroke index
   como permutación, vocabulario (menos palos = mejor, no mezclar dirección con calidad).
   **Incluye contradicciones entre pantallas:** si el índice sale 12.4 en perfil y 12.7 en leaderboard, el
   golfista no vuelve nunca. Ningún test actual mira esto.

### ¿Está bien presentado?
5. **¿Se ve bien?** — contra DESIGN.md + las 7 decisiones reconciliadas. Donde DESIGN.md no diga nada, se
   reporta como hueco. NO se inventa criterio.
6. **¿Todo lo que se ve, sirve?** — inventario de botones (abajo).

---

## El inventario de botones

Origen: el PR #264 ("cierra el punto de entrada muerto") fue exactamente esto — el backend de vinculación
FedeGolf existía completo y ningún botón llevaba ahí. Lo encontró Nicolás por Telegram, no nosotros.

Por cada pantalla: inventariar **todo** elemento interactivo (botón, link, tab, toggle, menú, ícono, card
clickeable) y apretarlo. Clasificar en cinco:

- ✅ Hace lo que promete
- 💀 No hace nada (muerto)
- 💥 Tira error
- 🕳️ Lleva a pantalla vacía o incompleta
- 👻 Promete algo que no existe

**Política de Juanjo para lo que falle:** esconder / eliminar / marcar "próximamente disponible". La máquina
clasifica y recomienda; no ejecuta.

**Límite honesto — NO se puede medir "no se usa".** Con 2 usuarios externos no hay datos de uso con
significancia. Que Nicolás no haya apretado un botón no prueba nada. Se mide "no funciona" y "no lleva a
ninguna parte", que sí son objetivos. El "no se usa" lo decide Juanjo con la lista completa en la mano.

---

## Arquitectura: TRES CARRILES, no un fan-out

**Esta es la decisión más importante del spec.** El diseño original (90 agentes en paralelo contra prod)
ESTABA MAL y se descartó. Motivos verificados el 15-jul:

- **`playwright.config.ts:23` dice `workers: 1, // single worker para estado compartido predecible`.** Hay
  UN usuario E2E y UN archivo de sesión compartido (`e2e/.auth/user.json`). Agentes en paralelo se pisan:
  uno finaliza una ronda mientras otro la lee, un tercero cierra sesión y mata el login de los demás.
  Resultado: tablero lleno de rojos falsos, que es PEOR que no correr nada.
- **La máquina de Juanjo tenía 2.5 GB libres de 16.4 GB**, con 6 node + 16 chrome ya vivos. 16 Chromium más
  ≈ 5 GB → OOM. Este PC ya se cayó por OOM antes (ver `reference_oom_procesos_acumulados`).

### Carril A — análisis de código, SIN browser
Conceptos de golf, contradicciones entre pantallas, inventario de botones leído desde el fuente, huecos de
DESIGN.md. No toca la app: es leer código. **30+ agentes en paralelo, barato, riesgo cero.** Acá vive la
mitad del valor.

### Carril B — browser de SOLO LECTURA
¿Carga? ¿Se ve bien? Screenshots móvil 390px (así se usa en la cancha). Sin escribir nada, así que pueden
compartir sesión sin pisarse. **3-4 en paralelo, máximo.**

### Carril C — escritura, EN SERIE
Crear ronda, cargar score individual, score en grupo, crear torneo, inscribir, scoring de torneo. **Uno a la
vez.** Usuario E2E, limpieza verificada. ~6 flujos, ~20-25 min. No se puede apurar.

A y B corren mientras C avanza en serie → más rápido y más barato que el plan original, y **funciona**.

---

## Los seis fallos predichos y sus mitigaciones

Salieron de una fase de predicción hecha ANTES de gastar (idea de Juanjo — ahorró ~1 hora y mató el diseño
original). Por eso la fase 0 queda incorporada permanentemente.

| # | Fallo predicho | Mitigación |
|---|---|---|
| 1 | **OOM a mitad de corrida** (2.5 GB libres) | Limpiar procesos huérfanos antes de arrancar (`LIMPIAR-PROCESOS-VIEJOS.bat`). Cap de 3-4 browsers, no 16. |
| 2 | **Colisión de estado por cuenta compartida** | Carriles. Escritura en serie. |
| 3 | **Rojos falsos por carrera de datos** | Ídem. Ningún flujo de escritura concurrente. |
| 4 | **El nivel 3 se equivoca de golf** (LLM calculando WHS de memoria) | Cada agente cita la regla concreta y muestra la aritmética. El escéptico la rehace por su cuenta. Si no coinciden → NO es hallazgo, es **duda**, y se marca como duda. Ver `feedback_golf_conceptos`. |
| 5 | **El verde falso del agente muerto** | **TRES ESTADOS, NO DOS: verificado OK / roto / no se pudo probar.** El tercero se pinta tan feo como el rojo. "No lo sé" JAMÁS se disfraza de "está bien". Este es literalmente el miedo de Juanjo. |
| 6 | **Parálisis por informe** (200 hallazgos a la 1am) | El tablero abre con el veredicto y **máximo 10 P0**. El resto plegado abajo. |

---

## El escéptico (fase de refutación)

Cada veredicto pasa por un agente independiente que intenta refutarlo, en **las dos direcciones**:

- Dice "funciona" → intentar romperlo. **Los falsos verdes son el enemigo**: son los que te hacen lanzar
  con confianza y estrellarte.
- Dice "roto" → verificar que sea bug real y no artefacto de la prueba. Los falsos rojos paralizan por nada.

---

## Los 18 flujos

**Jugador:** login/registro · dashboard · crear ronda libre · score individual · score en grupo · resultados
de ronda · historial · stats · importar foto/Garmin · coach tAIger+ · compartir tarjeta · índices · ranking

**Torneo:** crear torneo · inscribirse · jugadores/salida · scoring de torneo · leaderboard en vivo

**Apuntar a las ESQUINAS, no al camino feliz.** El camino feliz siempre funciona — por eso la demo se ve
bien y el miedo persiste igual. Las esquinas donde vivió cada P0 real: 9 hoyos sobre cancha de 18, formatos
por equipo con handicap, empates que exigen countback, jugadores con tees distintos, damas y varones en la
misma cancha, índices altos con más golpes que hoyos.

---

## Seguridad en producción

- Flujos de lectura: sobre data real, **sin tocarla**.
- Flujos de escritura: usuario E2E (`E2E_TEST_USER_EMAIL` / `E2E_TEST_USER_PASSWORD` en `.env.local`), con
  prefijo identificable, limpieza al final **verificada**.
- **NUNCA tocar data de Nicolás ni de Ernesto.** Son los 2 usuarios reales. Intocables.
- Ojo: las rondas del usuario E2E pueden contaminar superficies globales (`/ranking`, `/indices`). Verificar
  que no aparezcan.
- Si un cleanup falla → el reporte dice qué quedó y dónde. No se oculta.

---

## Pre-vuelo (antes de la corrida)

1. **Limpiar procesos huérfanos.** RAM libre objetivo > 8 GB.
2. **Reconciliar las 7 decisiones de diseño a DESIGN.md** (~20 min, sin Juanjo). Ver sección de diseño abajo.
3. **Fase 0 — red team:** un agente predice cómo va a fallar la corrida antes de gastar los demás. 5 min.
4. Opcional: `codex challenge` sobre este spec (modelo distinto, sin mis sesgos, ~3 min).

---

## La decisión sobre DESIGN.md y la entrevista

**Juanjo preguntó dos veces si convenía que el agente lo entrevistara para afinar estándares. La respuesta
acordada fue NO al principio, SÍ al final — y el motivo importa.**

**Verificado el 15-jul:** DESIGN.md tiene **un solo commit, 22-abril, nunca modificado**. Cronológicamente es
viejo. PERO las 7 decisiones posteriores (15-may a 28-jun) **lo citan como autoridad** — la del 28-jun dice
textual *"Jerarquía de botones mapea EXACTO a DESIGN.md §5"*; la del 19-may verifica WCAG AA contra sus
tokens. **Ninguna lo contradice.** No está congelado porque se abandonó: está congelado **porque aguanta**.
Es una constitución, no un changelog.

**El hueco real:** la jurisprudencia nunca se recogió. Un agente que lee solo DESIGN.md se lleva la
constitución pero se pierde 7 precedentes. → Se reconcilia en el pre-vuelo. No necesita tiempo de Juanjo.

**Por qué NO entrevistar antes:** las 7 decisiones tienen todas estructura "Variantes consideradas A/B/C" con
una elegida y su motivo. **Ese ya es el mecanismo de extracción, y funciona.** Una entrevista sería una
versión peor de un loop que ya está andando. Y las entrevistas de diseño en abstracto no producen señal:
"¿qué tan importante es el espaciado?" no tiene respuesta útil. Las 24 iteraciones de coach-home no pasaron
por desconocer el gusto de Juanjo — pasaron porque **el diseño no se puede saber antes de verlo**, ni él lo
sabía. Ninguna entrevista arregla eso; solo ver lo arregla.

**Por qué SÍ entrevistar después:** el tablero trae 18 pantallas reales con hallazgos marcados y la lista
explícita de **dónde DESIGN.md no dice nada**. Esos silencios, sobre pantallas concretas que Juanjo está
mirando, son las únicas preguntas de entrevista que valen. Su reacción ahí vale diez veces más. Y lo que
salga se escribe **de vuelta en DESIGN.md** — la fuente mejora en vez de bifurcarse.

Los niveles 1-4 y el 6 no dependen de DESIGN.md: "¿funciona?", "¿el número está bien?" y "¿este botón hace
algo?" son objetivos.

---

## Entregables

1. **Tablero visual** (Artifact — página web, se abre en el teléfono, se comparte). 18 flujos × 3 familias.
   Semáforo de tres estados. Sin jerga. **Entregable principal** — contesta la pregunta de un vistazo.
2. **Evidencia por flujo** — screenshot móvil 390px + número que mostró prod vs. número correcto. Juanjo no
   tiene que creerme: ve la foto y los dos números.
3. **Lista de lanzamiento** — P0 (no se lanza con esto) / P1 (se lanza avisando) / cosmético. Ordenada.
   Máximo 10 P0 arriba.
4. **Veredicto único** — ¿se puede lanzar? Sí / no / "sí, sin la feature X". Esto saca a Juanjo del
   "ninguna feature funciona 100%" y lo mete en "estas 12 funcionan, estas 4 no, estas 2 a medias".
5. **La máquina guardada** — workflow reutilizable en `.claude/workflows/`, NO un script muerto más. Se
   re-corre y **compara contra la corrida anterior**: "estos 3 se arreglaron, este se rompió nuevo".
   Trayectoria, no foto. **Esto es lo que la convierte en máquina en vez de informe.**

---

## Hallazgos del repo que la máquina debe respetar

- **`e2e/` ya tiene 16 specs** + `global-setup.ts` + `helpers/`. Cubren ronda, scoring, campeonatos, import
  de fotos, páginas públicas. **REUSAR, no reescribir.** Los niveles 1-2 tienen cimientos.
- **28 scripts sueltos en `scripts/`** (`smoke-*`, `qa-*`, `test-e2e-*`) = cementerio. Cada uno contestó una
  pregunta una vez y se pudrió. **NO crear el script 29.** Esa es la razón del entregable 5.
- **38 worktrees activos** en `.claude/worktrees/`, muchos de ramas ya mergeadas (#262, #122, #183). Basura
  acumulada, ocupa disco en OneDrive, riesgo de contaminación. **NO tocar en esta corrida** — puede haber
  trabajo sin commitear. Limpieza aparte, revisando una por una.

---

## Costo esperado

~45-60 min. Es la corrida más cara que hayamos hecho. Se justifica una vez: el output no es código, es que
Juanjo deje de decidir con sensaciones. Las corridas siguientes son mucho más baratas (solo verifican lo que
cambió).

---

## Lo que la máquina NO hace

- **No arregla nada.** Report-only.
- No borra worktrees.
- No inventa criterio visual donde DESIGN.md calla.
- No afirma "no se usa" (no es medible con 2 usuarios).
- No convierte "no se pudo probar" en verde.
