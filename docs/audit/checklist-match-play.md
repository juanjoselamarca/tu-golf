# Checklist Auditoría — Match Play

## Preparación
- [ ] `npm run test -- match-play` debe pasar
- [ ] Abrir producción en 2 dispositivos (jugador A y jugador B)

## Test 1: Match play 18h neto (Chile por default)
- [ ] Crear ronda, formato Match Play
- [ ] **Verificar:** modo = Neto automáticamente
- [ ] 2 jugadores: yo (HCP 12) + invitado (HCP 18)
- [ ] Iniciar
- [ ] **Verificar:** diferencia = 6 golpes para el invitado
- [ ] **Verificar:** app muestra en qué hoyos recibe golpes el invitado (SI 1-6)

## Test 2: Flujo de match state
- [ ] Hoyo 1: yo par, invitado bogey neto → estado "1 UP Juanjo"
- [ ] Hoyo 2: empate → estado no cambia
- [ ] Hoyos 3-16: jugar hasta llegar a 2 UP en hoyo 16
- [ ] **Verificar:** cuando estás 2 UP con 2 restantes, aparece "Juanjo está dormie"
- [ ] **Verificar:** NO dice "no puede perder por strokes"
- [ ] **Verificar:** nombre capitalizado correctamente

## Test 3: Terminar match anticipadamente
- [ ] Hoyo 17: ganas → 3 UP con 1 restante
- [ ] **Verificar:** match termina automáticamente con "3&2" o "4&1"
- [ ] **Verificar:** share card muestra resultado final
- [ ] **Verificar:** ya no pide score del hoyo 18

## Test 4: Match termina AS
- [ ] Nueva ronda, llevar el match hasta hoyo 18 empatado
- [ ] **Verificar:** termina con "AS"
- [ ] **Verificar:** sin ganador declarado

## Test 5: Leaderboard hoyo por hoyo
- [ ] Verificar tabla estilo Ryder Cup:
  - [ ] Colores: verde si ganó el hoyo, rojo si lo perdió, gris si halved
  - [ ] Score neto entre paréntesis
  - [ ] Todos los hoyos visibles, incluyendo el 18

## Test 6: Momentos recientes
- [ ] Después de varios hoyos ganados
- [ ] Verificar cada card muestra perspectiva correcta
- [ ] **Verificar:** "hace X min" sin "~"
- [ ] **Verificar:** ganador del hoyo no se duplica en ambos cards

## Test 7: Share card
- [ ] Compartir resultado
- [ ] **Verificar:** resultado tipo "3&2" o "1 UP" o "AS"
- [ ] **Verificar:** nombres capitalizados
- [ ] **Verificar:** NO muestra golpes totales (match play es distinto)

## Test 8: Match play 9 hoyos
- [ ] Crear match de 9h
- [ ] **Verificar:** badge "9 HOYOS" visible
- [ ] Jugar hasta ganar "3&2" (9 hoyos - 2 restantes = hoyo 7)
- [ ] **Verificar:** termina en hoyo 7 con 3&2

## Bugs encontrados
- [ ] ___________
