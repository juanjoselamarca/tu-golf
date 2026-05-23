# Drill Studio — prototipo standalone

Cada plan que el coach asigna viene con una **animación 3D editorial** del drill ejecutado correctamente. Aprendés haciendo, no leyendo.

**NO se deploya, solo localhost:3002.** No toca la app principal. La validación es presencial con golfistas reales antes de migrar a la app real (cuando confirmes que les pega).

## Qué hay acá (Fase A)

Un drill bien hecho de punta a punta — **putting 1.5m**:

- **Avatar low-poly stylized** estilo Polygon Runway (clay material gold, gorra burgundy)
- **Animación procedural** del putting stroke: setup → backswing → impact → follow-through
- **Pelota animada** que sale del impacto y rueda hacia el cup con física suave
- **Cámara cinematográfica** con 7 shots interpolados (top-down → oblique → lateral zoom → low-angle → follow ball → reset → outro). 18s por loop.
- **Lighting golden hour** (directional cálida + rim burgundy + ambient leve)
- **Post-processing cinematográfico** (Bloom + Chromatic Aberration + Vignette)
- **Voz del coach** con Web Speech API en español ($0, Mónica voice en macOS/iOS)
- **UI editorial** Playfair Display + gold/burgundy: header del drill, schedule semanal, progress ring, briefing, diagnosis del patrón

## Cómo correrlo

Desde la raíz del repo `tu-golf/`:

```bash
cd prototypes/drill-studio
npm install     # primera vez, ~2 min
npm run dev     # abre http://localhost:3002
```

**Puerto 3002** — la app principal está en :3000 y el prototipo anterior (descartado) era :3001. Cero colisión.

## Stack 100% gratis ($0 USD)

| Capa | Tecnología |
|---|---|
| 3D engine | Three.js + React Three Fiber + drei |
| Post-processing | @react-three/postprocessing (Bloom, Vignette, Chromatic Aberration) |
| Animaciones | Procedural keyframed con `useFrame` + interpolación cinematográfica |
| Avatar | Primitives Three.js compuestas (geometría low-poly editorial) |
| Voz | Web Speech API browser (gratis, español, sin servidor) |
| UI overlays | Framer Motion + Tailwind |
| Tipografía | Playfair Display + Inter (Google Fonts gratis) |

Cero assets pagados. Cero suscripciones. Cuando migre a app real, podemos cambiar voz a OpenAI TTS por calidad ($0.05/ronda) — opcional.

## Lo que NO tiene aún (intencionalmente)

- **Otros drills** (approach, bunker, iron, tee shot, mental routine) — Fase B, ~2 semanas.
- **Datos de Supabase real.** Hardcoded en `lib/sample-drill.ts`.
- **Integration con `coach_plans`** — cuando el coach detecte un patrón → renderiza el drill correcto automáticamente. Fase C.
- **Avatar más detallado.** Para Fase A elegimos primitives composables (control total + cero deps). Si valida, en Fase B swap a Mixamo character con anatomía completa.
- **Tracking real de compliance** (botón "hice 20 putts hoy") — Fase D.

Cada uno de esos pasos está enchufable porque la arquitectura es modular:
- `PlayerAvatar` reemplazable por `<MixamoCharacter />`
- `PuttingGreen` reemplazable por `<BunkerScene />` / `<ApproachScene />` / etc.
- `CoachVoice` reemplazable por `<OpenAITTS />`
- `choreography.ts` reutilizable para cualquier drill (cambia las phases)

## Decisiones de diseño documentadas

### ¿Por qué primitives en lugar de Mixamo?
- $0 absoluto + cero deps externos para Fase A.
- Control total sobre estética low-poly editorial.
- Si la validación pasa, en Fase B subimos a Mixamo skinned mesh.

### ¿Por qué cámara pasiva (sin OrbitControls)?
- WOW pasivo > manipulación. Apple Fitness+ y Polygon Runway hacen exactly esto.
- Los 7 shots están coreografiados — feeling de "demo profesional", no "viewer de modelo".

### ¿Por qué Web Speech en lugar de OpenAI TTS?
- Fase A es validar el formato, no la voz. Web Speech con "Mónica" (macOS/iOS) suena premium.
- Cuando migremos a app real, OpenAI TTS por $0.05/ronda da calidad universal — pero esa decisión se toma DESPUÉS de validar.

### ¿Por qué color gold/burgundy?
- Alineado con DESIGN.md de la app principal — coherencia editorial.
- Cero competencia en golf usa esto (todos son sport-tech gris/neón).

## Próximo paso

1. Vos abrís localhost:3002 y mirás el loop completo (18s).
2. Reaccion primaria:
   - ¿El avatar se ve premium o juguete?
   - ¿La cámara cinematográfica genera WOW o se siente abrupta?
   - ¿La voz suma o resta?
   - ¿La UI editorial se siente Golfers+ o genérica?
3. Si pasa la primera mirada → mostrarlo a 3-5 golfistas reales en clubhouse (Fase 2 de validación).
4. Si 3+ de 5 dicen *"esto sí lo voy a hacer mañana"* → seguimos a Fase B (library de 5-6 drills core).
5. Si no → iteramos antes de quemar 2 semanas más.

## Hermana en el repo

`prototypes/` es para validaciones standalone que NO afectan la app principal. Si esta valida bien, sus componentes se migran a `src/components/coach/` con datos reales de Supabase + integration con el motor.

Si no valida, esta carpeta se borra sin afectar nada.
