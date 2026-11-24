---
description: Consejo para decisiones grandes de producto, marketing o negocio, y para simplificar pantallas que espantan usuarios (modo pantalla). Asesores independientes con miradas opuestas, un usuario de primera vez que prueba la pantalla real, y un presidente que da un veredicto con un paso claro antes de llevarle la decisión a Juanjo.
---

# /consejo — decisiones grandes sin el sesgo del "sí a todo"

Un solo Claude tiende a darle la razón a quien lo empuja (lección del link "Claude Council" que mandó
Juanjo, ficha `scripts/rrss/referencias/reel-Df41R_HpUxD.json`). En código eso ya se resolvió con un
revisor independiente; en decisiones de producto no había nada. Este comando lo cubre.

## Cuándo se usa

- Juanjo lo pide ("consulta al consejo", "/consejo <pregunta>").
- **Claude lo usa solo**, antes de llevarle a Juanjo una decisión de producto, marketing o negocio de
  **alto impacto o difícil de revertir**: abrir una función a todos (p. ej. la Timba), precios o paywall,
  qué priorizar en un sprint completo, la estrategia de RRSS, sumar o sacar un formato, cambiar cómo se
  ve el hándicap. Una por decisión, no por cada detalle.
- **No se usa de noche** (agentes nocturnos): la decisión final es de Juanjo y el presidente corre en
  Fable, que de noche no se usa (`scripts/ceo-prompts/night-rules.md`). Queda anotada para la mañana.
- **No se usa** para decisiones técnicas (las decide Claude como CTO, con `revisor-fable` si aplica),
  copy menor, ni cuando hay un torneo inminente (velocidad manda).

## Dos modos

- **Modo decisión** (el original): una pregunta de producto, marketing o negocio con opciones. PASOS 1 a 4.
- **Modo pantalla**: «¿esta pantalla o flujo espanta usuarios, y qué le sacamos?». Mismos pasos, pero el
  expediente parte de la pantalla real medida y se suma un usuario de primera vez (ver «Modo pantalla» abajo).

Lo que el consejo **no** hace, porque ya existe: generar variantes de diseño (`design-shotgun`), revisar
contraste, accesibilidad y checklist visual (`revisor-fable`), pulir lo implementado (`design-review`, `/qa`),
diseñar código o refactors (`refactor-arquitecto`) ni revisar código. El consejo decide **qué y si** cambiar,
y sobre todo **qué sacar**; lo demás se lo entrega a esas herramientas.

## PASO 1 — Expediente de la decisión (lo escribe el hilo principal)

`.claude/expedientes/consejo-<YYYY-MM-DD>-<slug>/expediente.md`, máximo ~800 palabras:

1. **La pregunta** en una línea.
2. **Opciones** (2-4), cada una en 2-3 líneas. Incluir "no hacer nada / esperar" si es real.
3. **Datos con fuente y fecha** (métricas, reportes del inbox, uso real). Si no hay datos, decirlo.
4. **Restricciones**: directiva CERO FALLOS, costo y tiempo.
5. **Decisiones previas de Juanjo** sobre el tema, pegadas tal cual desde
   `node scripts/consejo/decisiones-previas.mjs <palabras clave>` (memoria + `docs/design-decisions/`). Así el
   consejo no recomienda lo que ya se descartó, y si contradice una decisión tiene que decirlo.
6. **Lo que el autor cree** (su opción favorita y por qué), marcado como tal. Va al final para que los
   asesores lo puedan contradecir, no para que lo sigan.

## PASO 2 — Asesores en paralelo (un solo mensaje, agentes NUEVOS)

Lanzar en **un mismo mensaje** un `Agent` con `subagent_type: "asesor-consejo"` por rol. Cada prompt
lleva solo la ruta del expediente y el rol; ninguno ve lo que dijo otro. Los roles están descritos en el
agente; acá va cuál usar. Cualquier asesor puede proponer una opción que no estaba en el expediente.

| Rol | Mira desde |
|---|---|
| **Socio de club** | Golfista chileno, hándicap 10-20, juega el torneo mensual de su club con el celular en una mano. ¿Lo usaría? ¿Lo entiende sin explicación? |
| **Organizador de torneos** | Quien lleva la competencia del club y responde si algo falla. Cero fallos, cero trabajo extra el día del evento. |
| **Negocio y crecimiento** | Adopción de clubes, boca a boca en el golf chileno, monetización, marca. |
| **Pre-mortem** | Ya pasó y salió mal: cómo falló, paso a paso, qué se dejó de hacer por esto y qué bug conocido sigue abierto. |
| **Simplificador** (siempre en modo pantalla; en modo decisión si hay algo que sacar) | Solo propone sacar, fusionar o esconder, pesado con el costo en código. |
| **Reglas de golf** (solo si la decisión toca reglas, hándicap, formatos o scoring) | WHS, R&A/USGA y FedeGolf, contra la regla real. |

## PASO 3 — Presidente

Guardar las opiniones juntas en `.../opiniones.md` (literal, una sección por rol) y lanzar un `Agent`
NUEVO con `subagent_type: "presidente-consejo"` y las dos rutas. Si el cupo de Fable está agotado:
el mismo agente con `model: "opus"`, y se avisa en una línea.

## Modo pantalla

Para pantallas o flujos que hoy son enredados. Se corre sobre la app **local contra la base de pruebas**,
nunca contra prod.

1. **Recorrido medido.** Cada flujo tiene un recorrido en `e2e/consejo/<nombre>.recorrido.ts` (hoy: `nueva-ronda`,
   `crear-torneo`, `inscripcion`). Si el flujo no tiene, se escribe uno con `e2e/helpers/consejo-captura.ts`:
   `pantalla()` captura y mide, `tocar()`/`escribir()` registran el camino. Los recorridos **nunca** aprietan el
   botón final (crear, inscribirse, pagar) ni escriben contraseñas.
   ```bash
   rm -f e2e/.auth/user.json
   node --env-file=.env.local scripts/test-db/e2e-local.mjs -- --config=playwright.consejo.config.ts [nombre]
   ```
   Deja en `.claude/expedientes/consejo-recorridos/<nombre>/` las capturas (390 px, lo que se ve y la página
   entera) y `recorrido.md`: pantallas, toques, campos, palabras, botones visibles, objetivos táctiles bajo 44 px
   y escrituras a la base.
2. **Costo en código:** `node scripts/consejo/costo-pantalla.mjs <ruta>` (cuántas líneas usa *solo* esa pantalla
   y cuánto está en zona crítica).
3. **Decisiones previas:** `node scripts/consejo/decisiones-previas.mjs <palabras>`.
4. **Expediente** (`.claude/expedientes/consejo-<fecha>-<slug>/expediente.md`): la pregunta («¿qué sacamos de
   X para que un socio nuevo lo logre sin ayuda?»), el `recorrido.md` y las salidas de los dos scripts pegados,
   los datos de uso si los hay y lo que cree el autor al final.
5. **Usuario de primera vez + asesores, en el mismo mensaje.** Un `Agent` con `subagent_type:
   "usuario-primera-vez"`: su prompt lleva solo la tarea y las rutas de las capturas de lo que se ve (no las
   `-entera`), en orden, cada una con su objetivo, y **nada** del recorrido ni del expediente. En paralelo, los
   asesores: simplificador, socio de club, organizador y pre-mortem (negocio solo si toca precio o adopción).
6. **Prueba de primer clic.** El hilo principal compara, pantalla por pantalla, lo que el usuario dijo que
   tocaría contra `tocoParaAvanzar` del recorrido. Cada diferencia es un **primer clic fallido** y va a
   `opiniones.md` con la captura, junto a la seguridad que declaró y lo que no entendió.
7. **Presidente** (PASO 3), que en este modo devuelve además mantener / sacar o fusionar / cambiar, la dirección
   para el rediseño y la medida de éxito.
8. **Después del sí de Juanjo:** si hay rediseño, la dirección del presidente es la entrada de `design-shotgun`
   (las variantes y su revisión siguen el pipeline de diseño de siempre); si es sacar o fusionar, es un PR normal.
   Al terminar, se corre el mismo recorrido y se compara contra la medida de éxito.

## PASO 4 — Llevárselo a Juanjo

- `AskUserQuestion` con la pregunta del presidente: la opción recomendada primero con "(Recomendado)",
  y en la descripción de cada opción lo que dijo el consejo. Si hubo disidencia fuerte, se nombra.
- Lo que Juanjo decida se guarda en la memoria o el doc que corresponda (como cualquier decisión de producto).
- Si la decisión aplica una lección de método, marcarla: `node scripts/rrss/referencias.mjs --aplicada <id> "<dónde>"`.

## Costo

4-5 asesores en Opus con expediente corto + 1 presidente en Fable: del orden de una revisión de código. En
modo pantalla se suma el usuario de primera vez y las capturas (cada imagen pesa), así que se elige UN flujo
por consejo; los recorridos y scripts no gastan modelo.
Por eso es solo para decisiones grandes. Nunca reanudar un asesor ni el presidente (releen todo).
