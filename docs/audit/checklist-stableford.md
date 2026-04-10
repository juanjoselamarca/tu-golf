# Checklist Auditoría — Stableford

## Preparación
- [ ] Correr `npm run test -- stableford.canary` — debe pasar
- [ ] Abrir producción en celular

## Test 1: Ronda 18h stableford individual
- [ ] Crear ronda, formato Stableford
- [ ] **Verificar:** modo automáticamente queda en "Neto" (R&A 32.1b)
- [ ] **Verificar:** app pide handicap
- [ ] Ingresar HCP 15
- [ ] Tee blanco, Los Leones
- [ ] Iniciar
- [ ] Ingresar scores realistas (bogey mayoría, algunos pares)
- [ ] **Verificar:** leaderboard muestra "Pts" no gross ni vsPar
- [ ] **Verificar:** orden descendente (más puntos arriba)

## Test 2: 9 hoyos stableford
- [ ] Crear ronda 9h stableford
- [ ] HCP 10
- [ ] Jugar todos par → verificar 18 puntos (9 × 2)
- [ ] **Verificar:** badge "9 HOYOS" visible

## Test 3: Edge cases
- [ ] Triple bogey: verificar 0 puntos (no negativo)
- [ ] Eagle: verificar 4 puntos
- [ ] Pickup de hoyo (sin score): no penaliza

## Test 4: Múltiples jugadores
- [ ] 3 jugadores con HCPs distintos
- [ ] Verificar cada uno recibe golpes en los SI correctos
- [ ] Verificar ranking por puntos descendente

## Test 5: Vistas derivadas
- [ ] Espectador: "STABLEFORD" visible
- [ ] Share card: muestra puntos grandes, no golpes
- [ ] Historial: puntos guardados correctamente

## Bugs encontrados
- [ ] ___________
