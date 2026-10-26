# Prompt — Juego personalizado (La Colombiana, el 2-0-2 y "Armar el mío")

> Definido en conversación con Juanjo el 26-oct-2026. Pegar completo en una sesión nueva de Claude Code.
> Juanjo **autorizó explícitamente** partir con esta feature ahora (excepción a "cero features nuevas").
> **Alcance de este prompt: solo Etapa 0 (prototipo + motor) y Etapa 1 (prueba interna, solo admins).**
> Abrirlo a más usuarios, el plan Pro y las plantillas compartidas vienen después, con otro prompt.

---

Hola. Vas a construir una modalidad nueva en Golfers+: **"Juego personalizado"**, para los juegos que se
juegan entre amigos y no están regulados por ninguna federación (La Colombiana, el 2-0-2 y los que invente
cada grupo). Todas las decisiones de producto ya están tomadas y están abajo: no las vuelvas a preguntar.
Lo que sí queda abierto está marcado como **[CHECKPOINT JUANJO]**. Ahí te detienes y le muestras opciones.

Sigue `CLAUDE.md` al pie de la letra (inicio de sesión, worktree propio, "el que toca, ordena", "un concepto,
una fuente", revisión con `revisor-fable`, `/pre-push`, evento en vivo). Esta feature toca **zona crítica**
(`src/golf/formats/`, scoring, migraciones, paywall), así que cada PR que la toque lleva revisión Fable y el label
`fable-reviewed`.

## 0. Contexto del código (ya investigado, verifícalo, no lo redescubras desde cero)

- Formatos: registry en `src/golf/formats/index.ts` (`FORMATS`, `KNOWN_FORMAT_KEYS`, predicados canónicos
  `isTeamFormat`, `isSharedBallFormat`, `isMatchPlayFormat`…). Metadatos de UI en `FORMAT_META`
  (`src/golf/core/rules.ts`). El selector de la ronda libre (`src/app/ronda-libre/nueva/components/SelectorFormato.tsx`)
  sale de `KNOWN_FORMAT_KEYS`.
- La base de datos limita `formato_juego` con CHECK en `rondas_libres`, `historical_rounds` y `tournaments`
  (`supabase/migrations/20261019200001_baseline.sql`). El modo es `gross | neto`.
- Ronda libre: hasta 4 jugadores (`src/app/api/ronda-libre/create/route.ts`), equipos en `ronda_equipos` /
  `ronda_equipo_jugadores`. El validador compartido entre la UI y la API es `src/golf/ronda-libre/validar-nueva-ronda.ts`.
- El scorer guarda **solo golpes** por jugador (`ronda_libre_jugadores.scores` jsonb `{hoyo: golpes}`) mediante
  RPCs con delta, `validate_score_delta`, `FOR UPDATE`, `puede_anotar_ronda`, y bloqueos por `estado` y
  `es_demo`. Tiene cola offline (`score/hooks/useOfflineResync.ts`). No existe nada para bunker, chip-in ni greenie.
- Handicap: piezas canónicas en `src/golf/core/` (`course-handicap.ts`, `hole-scoring.ts`, `stroke-index.ts` con
  `normalizedStrokeIndexByHole()` para 9 hoyos, `playing-handicap.ts`). "A la diferencia del más bajo" ya
  existe como `calcularDiferenciaHandicap` en `src/golf/formats/match-play.ts`. **Reutilizar, nunca reescribir.**
- Paywall: `FEATURE_MIN_TIER` en `src/golf/billing/plans.ts`, gate server-side en `src/golf/billing/require-feature.ts`.

## 1. Decisiones de producto (cerradas)

| Tema | Decisión |
|---|---|
| Dónde | Solo **ronda libre** (hasta 4 jugadores). No torneos en v1. |
| Entrada | Al elegir "Juego personalizado": **catálogo corto** (La Colombiana, El 2-0-2) y al final **"Armar el mío"**. El catálogo se diseña para crecer (Skins, Nassau, etc. después), pero eso no entra en v1. |
| Ajustes | **Frase tocable**: las reglas se muestran como una frase y cada palabra destacada es un botón que abre 2-4 alternativas (bottom sheet, ≥44px). Debajo, un **ejemplo en vivo** de un hoyo que se recalcula al tocar. Los detalles finos van plegados en **"Más reglas"**. |
| Puntitos | Existen **solo dentro del juego personalizado** (no se agregan a otras modalidades). |
| Plantillas | Decidido para después: guardar con nombre y compartir por link. **Fuera de este prompt.** Diseñar la config para que se pueda guardar tal cual más adelante. |
| **Bloqueo** | **Solo los admins** (rol `admin` en `profiles`: Juanjo y Max) ven y pueden **crear** un juego personalizado. Para el resto de los usuarios **no aparece** en el selector, y la API de creación lo rechaza (403) aunque le llegue a mano. Los jugadores invitados a una ronda que creó un admin **sí** pueden verla y anotar en ella, porque así se prueba con amigos de verdad. Toda la regla vive en **una** función canónica (por ejemplo `puedeCrearJuegoPersonalizado()` en `src/golf/billing/` o `src/lib/`), que se usa en la UI y en el servidor. Abrirlo a todos más adelante es cambiar esa función, nada más. |
| Plata | **Solo puntos, sin plata.** No hay valor por punto ni liquidación. |
| Neto | Por defecto **a la diferencia del más bajo**: el de menor handicap juega con 0 y los demás reciben la diferencia, con palo en los hoyos según el stroke index. Handicap completo (100 %) queda como opción en "Más reglas". |
| Plan | Cuando se abra: todo gratis al inicio y después todo Pro. **No se implementa en este prompt**; en esta etapa manda el bloqueo de admins. |
| Cambiar reglas a mitad de ronda | **Sí, solo el creador.** Todo se recalcula (los puntos nunca se guardan, se derivan) y el grupo ve un aviso. |
| Índice | La ronda **cuenta para el índice** con las reglas WHS de siempre: cada uno juega su bola y anota sus golpes reales. Los puntitos y la diferencia de handicap del juego no tocan el índice. |
| Scorer | **Anotar golpes sigue exactamente igual** que hoy, para no enredar al que lleva la tarjeta. Cómo se muestra "cómo va la competencia" es una tarea de diseño **[CHECKPOINT JUANJO]**. |

## 2. Reglas de los juegos (fuente: Juanjo)

### La Colombiana (4 jugadores, parejas que rotan)
- **Parejas que rotan cada 6 hoyos** (en 9 hoyos, cada 3), así que salen las **3 combinaciones posibles**
  (AB-CD, AC-BD, AD-BC) y todos juegan con todos. El **orden de las 3 combinaciones lo sortea la app** con un
  botón al crear la ronda. El resultado del sorteo **se guarda** y no se recalcula. La rotación sigue el
  **orden en que se juegan los hoyos** desde `hoyo_inicio` (shotgun), no el número del hoyo.
- En cada hoyo se juegan **3 duelos entre las parejas**; los valores son personalizables:
  - **Mejor bola** contra mejor bola: 2 pts por defecto.
  - **Peor bola** contra peor bola: 1 pt.
  - **Suma** de la pareja contra suma: 1 pt.
- Quien pierde un duelo **no resta**: el ganador suma y el perdedor queda en 0.
- Cuando una pareja gana un duelo, **cada integrante recibe el total** en su cuenta individual (Juan +2 y
  Pedro +2). La razón: así un duelo y un puntito quedan en la misma escala, y el ranking final no cambia
  porque todos juegan 6 hoyos con cada compañero. "Dividir entre los dos" queda como opción en "Más reglas".
- Gross o neto (ver §1).
- **Resultado final:** además de la tarjeta, los **puntos individuales** de cada jugador después de las 3
  parejas (ese es el ranking), con el marcador de cada tramo como detalle.

### El 2-0-2 (individual, 3 o 4 jugadores)
- Con 3 jugadores, en cada hoyo: el mejor **+2**, el del medio **0** y el peor **−2**.
- Con 4 jugadores: **+2, 0, 0, −2**.
- Gross o neto.

### Regla de empate única (para todo el motor, incluidos los juegos que armen los usuarios)
> **Los empatados se reparten la suma de los puestos que ocupan. Si no se puede dividir en enteros, nadie se
> lleva nada** (todos los empatados reciben 0 en ese duelo).

Casos obligatorios en los tests:

| Caso | Cuenta | Resultado |
|---|---|---|
| 2-0-2 de 3, empatan los mejores | (2+0)/2 | +1, +1, −2 |
| 2-0-2 de 3, empatan los peores | (0−2)/2 | +2, −1, −1 |
| 2-0-2 de 3, empatan los tres | (2+0−2)/3 | 0, 0, 0 |
| 2-0-2 de 4, empatan los dos del medio | (0+0)/2 | +2, 0, 0, −2 |
| 2-0-2 de 4, empatan los tres mejores | (2+0+0)/3, no es entero | 0, 0, 0, −2 (documentar: ese hoyo no suma cero) |
| Colombiana, empate en un duelo de 2 pts | 2/2 | 1 y 1 |
| Colombiana, empate en un duelo de 1 pt | 0,5, no es entero | 0 y 0 |

Nunca aparecen decimales en la UI.

### Puntitos especiales
En el scorer, un puntito es un **+N** por jugador y hoyo. Cada puntito tiene un **valor** (1 por defecto) y un
**destino**, que elige el grupo:
- **individual:** suma al jugador y al marcador de su pareja en ese tramo.
- **pareja:** suma también al total individual del compañero.

**[CHECKPOINT JUANJO]** Confirmar esta interpretación del destino con un ejemplo antes de implementarla.

Catálogo v1:

| Puntito | Cómo se registra | Regla de validación |
|---|---|---|
| **Birdie** | **Automático**, desde los golpes (no se marca). | Se mide en **gross**. Eagle = 2× birdie, hoyo en uno = 3×. |
| **Sandy** | Manual (un toque). | Cuenta solo si el jugador hace **par o mejor gross**. |
| **Chipingo** (embocar desde fuera del green) | Manual. | Vale **con cualquier score**. |
| **Greenie** | Manual, **solo en los par 3**, **uno por hoyo** (si se marca a otro jugador, se mueve). | Cuenta solo si el ganador termina con **par o mejor gross**. |
| **Puntito propio** ("Armar el mío") | Manual, con nombre y valor que define el usuario. | Ninguna. |

- Las validaciones se aplican **al calcular**, nunca borran datos. Si un puntito deja de cumplir su regla
  (por ejemplo, se corrige el score a bogey), queda visible como "no cuenta" junto a la razón.
- En el scorer solo aparecen los botones de los puntitos activos en esa ronda.

## 3. Arquitectura

**Principio:** los juegos no se programan uno por uno. Hay **un motor genérico** que entiende piezas, y La
Colombiana y el 2-0-2 son **plantillas** (datos) armadas con esas piezas. Un juego inventado por un usuario no
puede romper el motor.

1. **Config del juego** (`src/golf/formats/personalizado/`): un esquema zod **versionado** (`version: 1`), con
   límites en cada perilla. Las piezas:
   - `unidad`: `individual` | `parejas_fijas` | `parejas_rotativas`. Las rotativas exigen 4 jugadores, se
     sortean y cambian cada `holes/3` hoyos.
   - `modo`: `gross` | `neto`, con `handicap`: `diferencia_mas_bajo` (por defecto) | `completo`.
   - `duelos[]`, uno o varios por hoyo:
     - `por_puesto` (individual): tabla de valores por puesto según la cantidad de jugadores.
     - `mejor_bola` | `peor_bola` | `suma` (parejas): valor al ganador, y en "Más reglas" si el perdedor resta.
   - `reparto_pareja`: `total_a_cada_uno` (por defecto) | `dividir`.
   - `puntitos[]`: tipo, valor, destino y si está activo.
   - El validador rechaza combinaciones imposibles (Colombiana con 3 jugadores, parejas con número impar,
     tabla por puesto que no calza con la cantidad de jugadores, valores fuera de rango) con un mensaje
     humano. **El mismo validador corre en la UI y en la API** (extender `validar-nueva-ronda.ts`).
2. **Motor puro:** `calcularJuegoPersonalizado(config, jugadores, hoyos, scores, puntitos)`, que devuelve el
   detalle por hoyo y duelo, los puntitos válidos e inválidos con su razón, el marcador por tramo, los totales
   individuales y el ranking. Sin I/O. Un hoyo **incompleto** (falta el score de alguien que participa) no se
   puntúa todavía y se marca como pendiente. Reutiliza los canónicos de handicap y stroke index de §0.
3. **Datos** (migraciones por PR → workflow `migraciones-prod`, nunca SQL de escritura directo):
   - Agregar `'personalizado'` a los CHECK de `formato_juego` en `rondas_libres` y `historical_rounds`.
   - Columna `rondas_libres.reglas_juego jsonb`, con la config y el resultado del sorteo.
   - Tabla de puntitos manuales (por ejemplo `ronda_libre_puntitos`: ronda, jugador, hoyo, tipo, autor,
     timestamps) con unicidad (un greenie por hoyo, un puntito de cada tipo por jugador y hoyo), RLS, y un
     RPC con **las mismas guardas** que el RPC de scores (estado, `es_demo`, `puede_anotar_ronda`, lock).
     Funciona offline con la misma cola que los golpes.
   - **Los puntos nunca se persisten**: siempre se derivan, y por eso cambiar las reglas recalcula todo.
   - Todo lo que cambia en la base **solo agrega** (CHECK ampliado, columna nullable, tabla nueva) y no altera
     nada existente. Por eso es seguro en prod aunque la feature esté bloqueada.
   - Capa de datos en `src/lib/data/<dominio>.ts`. Nada de `supabase.from()` en `src/app/`.
4. **Registro:** `personalizado` en `FORMATS`, con su categoría y `FORMAT_META`. Revisa **cada** call-site que
   ramifica por formato (grep de `formato_juego`, `FORMAT_META`, `isTeamFormat`, etc.): historial, vista en
   vivo de espectadores, compartir, `cuentaParaIndice` y coach. Ninguno puede caer al fallback de stroke_play
   en silencio.

## 4. Casos borde obligatorios (cada uno con test)
- 9, 18 y 27 hoyos.
- `hoyo_inicio` ≠ 1, con la rotación por orden jugado.
- Jugador sin handicap en neto: lo bloquea el validador con un mensaje claro.
- Hoyo sin anotar, jugador que se retira a mitad de ronda, score corregido después.
- Greenie marcado en un par 4 (imposible por UI y por servidor) y greenie reasignado.
- Puntito marcado offline y sincronizado después.
- Dos personas anotando a la vez.
- Cambio de reglas con la ronda empezada: recálculo y aviso.
- Plantilla compartida que se abre sin sesión o con 3 jugadores cuando pide 4.
- **Tests de propiedades:** generar miles de configs y tarjetas válidas al azar y comprobar que el motor
  nunca tira error, nunca devuelve decimales y que los totales cuadran con el detalle por hoyo.

## 5. Cómo se trabaja: nada llega a los usuarios hasta que Juanjo termine de probar

No se usa una rama larga que se sube de golpe al final. Cada PR se mergea a `main` normal, pero **ningún
usuario lo ve**: el motor no tiene pantalla, los prototipos viven fuera de la app y la integración está
detrás del bloqueo de admins (§1).

### Etapa 0: motor y prototipo, en paralelo
1. **Spec + casos dorados** en `docs/specs/formato-personalizado.md`, con el formato de los specs existentes:
   las reglas, todas las tablas de §2 y unos 10 hoyos de ejemplo escritos como "con estos golpes, esto
   suma cada uno", incluido el ejemplo de destino de los puntitos. **[CHECKPOINT JUANJO]**: aprueba los
   casos dorados antes de escribir el motor.
2. **PR A: motor + config + tests** (zona crítica, `revisor-fable`). Sin UI ni base de datos. Los casos
   dorados son tests, más los tests de propiedades de §4. Invisible para los usuarios.
3. **Prototipo navegable, en paralelo al PR A, fuera de la app:** una página publicada como Artifact (o un
   HTML estático) con datos de mentira, que no toca la app ni la base de datos. Juanjo la abre en el celular
   y la prueba en la cancha. Incluye:
   - el catálogo, la frase tocable con el ejemplo en vivo y "Más reglas";
   - **al menos 3 variantes** del scorer mostrando "cómo va la competencia" **sin cambiar la forma de anotar
     golpes**. Ideas para arrancar, no obligatorias: una barra fija "Tramo 2 · Juan+Pedro 5 – 3 Diego+Tomás",
     chips "+2" por jugador al cerrar cada hoyo, una hoja deslizable "Cómo va";
   - el resultado final: puntos individuales tras las 3 parejas + marcador por tramo.

   **[CHECKPOINT JUANJO]**: elige una variante, o pide otra vuelta. Sin esa elección no se programa ninguna
   pantalla real.

### Etapa 1: prueba interna, solo admins
4. **PR B: migraciones + capa de datos + RPC de puntitos + offline + bloqueo de admins** (zona crítica).
5. **PR C: pantallas reales** según la variante elegida: crear el juego (catálogo, frase, sorteo), el scorer
   con puntitos e indicador, el resultado final, la vista en vivo y el historial. Flujo de diseño de
   `CLAUDE.md` con screenshots de celular, y verificación con una cuenta **no admin** de que el juego no
   aparece y de que la API lo rechaza.
6. Juanjo y Max juegan rondas reales con amigos. Cada bug que encuentren se arregla con causa raíz y test.

**Fin de este prompt:** la Etapa 1 queda funcionando para admins. Abrirla a más usuarios lo decide Juanjo
cuando termine sus pruebas, y es otro prompt.

Criterios de uso en cancha para toda la UI: botones ≥44px, una mano, legible al sol, WCAG 2.2 AA, estados
completos (cargando, vacío, error, sin señal) y `DESIGN.md`. Copy en español chileno simple, sin jerga técnica.

## 6. Definición de terminado (Etapas 0 y 1)
- Casos dorados aprobados por Juanjo y variante de diseño elegida por él.
- Un admin crea La Colombiana o el 2-0-2 (de 3 y de 4) en ≤3 toques y los juega completos en gross y en neto,
  con puntitos. Los invitados de esa ronda anotan sin problema.
- "Armar el mío" combina las piezas de §3 y ninguna combinación válida rompe el motor.
- Un usuario no admin no ve el juego personalizado, y la API le responde 403. Hay un test para cada cosa.
- tsc, tests (incluidos los de propiedades y canarios) y build en verde; `/pre-push`; revisión Fable con
  APROBADO en cada PR de zona crítica; health check sin FAIL.
- Entrada en `docs/SPRINT_LOG.md` y `node scripts/update-docs.js`.
