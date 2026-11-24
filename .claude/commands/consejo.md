---
description: Consejo para decisiones grandes de producto, marketing o negocio. Varios asesores independientes con miradas opuestas y un presidente que da un veredicto con un paso claro, antes de llevarle la decisión a Juanjo.
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

## PASO 1 — Expediente de la decisión (lo escribe el hilo principal)

`.claude/expedientes/consejo-<YYYY-MM-DD>-<slug>/expediente.md`, máximo ~800 palabras:

1. **La pregunta** en una línea.
2. **Opciones** (2-4), cada una en 2-3 líneas. Incluir "no hacer nada / esperar" si es real.
3. **Datos con fuente y fecha** (métricas, reportes del inbox, uso real). Si no hay datos, decirlo.
4. **Restricciones**: directiva CERO FALLOS, decisiones previas de Juanjo que apliquen (memoria y docs),
   costo y tiempo.
5. **Lo que el autor cree** (su opción favorita y por qué), marcado como tal. Va al final para que los
   asesores lo puedan contradecir, no para que lo sigan.

## PASO 2 — Asesores en paralelo (un solo mensaje, agentes NUEVOS)

Lanzar en **un mismo mensaje** un `Agent` con `subagent_type: "asesor-consejo"` por rol. Cada prompt
lleva solo la ruta del expediente y el rol; ninguno ve lo que dijo otro.

| Rol | Mira desde |
|---|---|
| **Socio de club** | Golfista chileno, hándicap 10-20, juega el torneo mensual de su club con el celular en una mano. ¿Lo usaría? ¿Lo entiende sin explicación? |
| **Organizador de torneos** | Quien lleva la competencia del club y responde si algo falla. Cero fallos, cero trabajo extra el día del evento. |
| **Negocio y crecimiento** | Adopción de clubes, boca a boca en el golf chileno, monetización, marca. |
| **Abogado del diablo** | Qué sale mal, qué se deja de hacer por esto (costo de oportunidad), qué bug conocido sigue abierto. |
| **Reglas de golf** (solo si la decisión toca reglas, hándicap, formatos o scoring) | WHS, R&A/USGA y FedeGolf, contra la regla real. |

## PASO 3 — Presidente

Guardar las opiniones juntas en `.../opiniones.md` (literal, una sección por rol) y lanzar un `Agent`
NUEVO con `subagent_type: "presidente-consejo"` y las dos rutas. Si el cupo de Fable está agotado:
el mismo agente con `model: "opus"`, y se avisa en una línea.

## PASO 4 — Llevárselo a Juanjo

- `AskUserQuestion` con la pregunta del presidente: la opción recomendada primero con "(Recomendado)",
  y en la descripción de cada opción lo que dijo el consejo. Si hubo disidencia fuerte, se nombra.
- Lo que Juanjo decida se guarda en la memoria o el doc que corresponda (como cualquier decisión de producto).
- Si la decisión aplica una lección de método, marcarla: `node scripts/rrss/referencias.mjs --aplicada <id> "<dónde>"`.

## Costo

4-5 asesores en Opus con expediente corto + 1 presidente en Fable: del orden de una revisión de código.
Por eso es solo para decisiones grandes. Nunca reanudar un asesor ni el presidente (releen todo).
