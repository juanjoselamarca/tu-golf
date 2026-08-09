# Catálogo de canchas — pendientes (no 100% cerrados)

**Estado:** 193 canchas · 187 con hoyos · **23 anomalías** (antes del batch: 34).
**Cerrado hoy:** 11 recorridos DAMAS poblados (par copiado del hermano VARONES) + Bahía Coique DAMAS deduplicado. Fecha: 2026-07-02.

---

## A. Faltan los hoyos — necesito dato externo FedeGolf (4)

No tienen hermano del otro género con hoyos, así que no se pueden copiar. Tengo el `fedegolf_cancha_id`; falta el par hoyo-a-hoyo.

| Recorrido | fg_id | Qué falta |
|---|---|---|
| C.G. Barquito Chanaral (DAMAS) | — | par por hoyo |
| C.G. Barquito Chanaral (VARONES) | — | par por hoyo |
| Iquique C.C. (DAMAS) | 215 | par por hoyo |
| Iquique C.C. (VARONES) | 25 | par por hoyo |

**Siguiente paso:** traer el scorecard de FedeGolf por `fg_id`.

---

## B. Estructura mal etiquetada — Marbella + Olivos (5)

| Recorrido | BD dice | Verdad (fuente) | Fix |
|---|---|---|---|
| Club de Golf Marbella (padre) | 27h, 18 hoyos cargados | Club padre de 3 nueves | Sacar los 18 hoyos del padre (los hijos tienen los suyos) |
| Marbella – Andes Pro | 9h, 18 hoyos, par 71 | **Nueve, par 36** (Andes) | Reestructurar a 9 hoyos par 36 — **necesita scorecard PDF** para el orden |
| Marbella – Pacífico Norte | 9h, 18 hoyos, par 71 | **Nueve, par 36** (Norte) | idem |
| Marbella – Pacífico Sur | 9h, 18 hoyos, par 71 | **Nueve, par 36** (Sur) | idem |
| Olivos Golf Club | 9h, 18 hoyos, par 72 | Argentina, 27h (Blanca+Colorada+Azul) | Relabel a 18h par 72 (o reestructurar). Prioridad baja (argentina) |

**Confirmado con Juanjo + web.** Marbella necesita el scorecard hoyo-a-hoyo (par 36/nueve, composición 2×P3/5×P4/2×P5).

---

## C. Par declarado ≠ suma real de los hoyos (13) — verificar cuál par es el correcto

El coach usa el par POR HOYO (no el declarado), así que el vs-par sale bien si los hoyos están bien; el mismatch avisa que **o el par_total o algún hoyo está mal**. Hay que cruzar cada una con la tarjeta/FedeGolf.

### Chilenas (prioridad)
| Cancha | Declara | Suma hoyos |
|---|---|---|
| La Serena | 72 | 70 |
| Santa Augusta de Quintay | 72 | 69 |
| Granadilla | 72 | 71 |
| Angostura | 72 | 71 |
| Costa Cachagua | 72 | 73 |
| Los Lirios | 72 | 73 |
| Cancha Internacional (DAMAS) | 72 | 70 |
| Cancha Internacional (VARONES) | 71 | 70 |
| El Alba (VARONES) | 70 | 68 |
| **Rio Blanco (DAMAS + VARONES)** | 62 | 63 | **← SOSPECHOSA: par 62/63 en 18 hoyos es rarísimo (avg 3.5). Probable cancha de 9 mal cargada. Verificar antes que nada.** |

### Argentinas (prioridad baja)
| Cancha | Declara | Suma hoyos |
|---|---|---|
| Hurlingham Club | 70 | 71 |
| Nordelta Golf Club | 72 | 73 |

---

## D. Dedup + par (1)

| Cancha | Problema |
|---|---|
| Hacienda Santa Martina – Cancha Verde (DAMAS) | Filas duplicadas **con par en conflicto** (72 declara, 70 suma). No se puede dedup a ciegas — necesita la tarjeta real para saber el par correcto. |

---

## E. Rondas sin linkear (NO son anomalías de catálogo — son de import #4)

Rondas de usuarios reales sin `course_id`, con nombre de cancha **ambiguo** → no se pueden linkear sin adivinar el recorrido (CERO FALLOS: no adivino).

| Cancha (nombre en la ronda) | Rondas | Por qué ambiguo |
|---|---|---|
| "Club de Golf Chicureo" | 6 | Hay DOS clubes Chicureo (Las Brisas: El Valle/La Montaña; y Hacienda Chicureo). No dice cuál. |
| "Club de Golf Rocas de Santo Domingo" | 4 | Linkeadas al club padre; hay varios recorridos (Nueva, Roja-Azul, Roja-Blanca…). No dice cuál. |

**El fix robusto:** capturar `par_per_hole` en el import (la tarjeta trae el par real, sin depender de adivinar recorrido). Estas rondas viejas no lo tienen → quedan sin par hasta re-importar con tarjeta, o hasta que el jugador confirme el recorrido.

---

## Demo/fantasma (excluir del medidor, no son reales)

El Manzano (37 rondas, no existe en catálogo), Santiago Golf Club (6, no existe), Smoke Course (30, fixture de test). Todas de usuarios demo/test. Acción: separar demo del medidor de cobertura.
