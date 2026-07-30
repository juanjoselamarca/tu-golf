# Tests Canario

Estos tests son **barreras de regresión** para bugs que ya ocurrieron en
producción. Cada bug reportado por un usuario real debe convertirse en un
test canario antes de arreglarse.

## Política
- Nombre descriptivo: `it('Bug 9-abr-2026: +11 en 9 hoyos NO debe mostrar gross 83')`
- Incluir contexto del bug en el comentario
- Nunca eliminar canarios viejos (solo agregarlos)
- Los canarios corren en cada push (pre-push hook)

## Cobertura actual
- Stroke Play: 9 vs 18 hoyos (bug del cuñado, 9 abr)
- Match Play: dormie, capitalización de nombres
- Share card: par 72 hardcoded
- en-vivo API: sort por gross vs vsPar
- Board individual: paridad board↔tarjeta, "−36" mid-ronda, leaderboard al
  revés durante la ronda, neto leído de columna (barrido 27-jul)
