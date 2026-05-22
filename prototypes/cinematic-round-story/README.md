# Cinematic Round Story — prototipo standalone

Prototipo de validación para el WOW visual del nuevo módulo de coach de Golfers+.
**NO se deploya, solo localhost.** No toca la app principal. Cuando los golfistas
reales digan "WOW esto cambia el juego", migramos a la app real (Fase 3).

## Qué hay acá

- **1 hoyo en 3D esquemático** (par 4, 348 yds, top-down/oblique con cámara
  orbital cinematográfica que desciende los primeros 4 segundos).
- **Línea pulsante tee → green** que traza el path del jugador.
- **Overlay editorial** con Playfair Display + paleta gold/burgundy (alineado
  a DESIGN.md de la app principal).
- **Curva mental como sparkline lateral** mostrando los últimos 5 hoyos —
  el birdie del 6 se ve y la caída del 7 también.
- **Narrativa staggered** del coach con animaciones de entrada Framer Motion.

## Cómo correrlo

Desde la raíz del repo `tu-golf/`:

```bash
cd prototypes/cinematic-round-story
npm install     # primera vez, ~2 min
npm run dev     # abre http://localhost:3001
```

**Puerto 3001** para no chocar con la app principal en :3000.

## Decisiones técnicas

- **R3F + drei** sobre Three.js puro — declarativo, encaja con React.
- **Esquemático low-poly**, no foto-realista. Razones:
  1. No tenemos topología real de FedeGolf (yards+par sí; calle/bunker/green NO).
  2. Corre suave en cualquier mobile chileno (iPhone 11+ y Android equivalente).
  3. La estética editorial Playfair/gold se ve MEJOR sobre geometría limpia
     que sobre texturas — esto choca el blind spot estético del sector
     (todas las apps top son sport-tech gris/neón).
- **Cámara orbital pasiva** sin OrbitControls — buscamos WOW pasivo (el
  usuario mira, no controla). Los `OrbitControls` los reservamos para una
  versión "explorar el hoyo" si los jugadores la piden en validación.
- **Datos hardcoded** en `lib/sample-round.ts`. Cuando migremos a la app
  principal, vienen de Supabase (`historical_rounds` + `plan_outcomes`
  via `/api/coach/plan-outcome` — el endpoint que se cerró en PR #34).

## Lo que NO tiene aún (intencionalmente)

- **18 hoyos navegables.** Solo 1 — validar el wow primero, escalar después.
- **TTS / Coach Voice.** Reservado para Fase 4 (ya tengo plan: OpenAI TTS, $0.05/ronda).
- **Datos de Supabase real.** Reservado para Fase 3 (migración a app).
- **Shareable Card export.** Reservado para Fase 5.
- **VR / Spatial computing.** Reservado para 2027-2028.

Cada uno de esos pasos está enchufable porque la arquitectura es modular:
`<Hole3DScene>` puede reemplazarse por `<SoraVideoScene>` en 2027 sin
tocar el resto del producto.

## Próximo paso

Cuando esté corriendo en localhost:
1. Sesión presencial con 3-5 golfistas premium en clubhouse.
2. Observar reacción primaria en los primeros 10 segundos.
3. Preguntas:
   - ¿Lo abrirías cada ronda?
   - ¿Pagarías $20/mes por esto?
   - ¿Qué le falta para que sea un "must-have"?
4. Si 3+ de 5 dicen WOW → seguimos a Fase 3.
5. Si no → iteramos visualmente antes de gastar 6 semanas en migración.

## Carpeta hermana en el repo

`prototypes/` es para validaciones standalone que NO afectan la app
principal. Si esta valida bien, sus componentes se migran a `src/components/`
con tests + integración con Supabase + soporte 18 hoyos.

Si no valida, esta carpeta se borra sin afectar nada.
