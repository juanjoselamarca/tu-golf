# Escáner nocturno: qué detecta y qué no

> Leer antes de tocar `scripts/ceo/failure.mjs` o de proponer "una regex más" para cerrar un hueco.

## Qué es

`scanViolations()` / `lineViolation()` (`scripts/ceo/failure.mjs`) leen el stream de un agente nocturno, comando
por comando, y lo detienen en el acto cuando reconocen una forma conocida de romper una regla 🔒 de
`scripts/ceo-prompts/night-rules.md`. Es **detección léxica**: no ejecuta nada y no sigue lo que pasa dentro de
otro proceso. No es un candado completo, y ningún escáner léxico puede serlo.

Lo que sí entiende (vuelta 16 del #665): líneas continuadas (barra en Bash, backtick en PowerShell), comentarios,
`env` y `VAR=` delante del comando, flags cortas agrupadas (`-dl`), el método HTTP de `gh api` (GET no escribe),
`--input` juzgado por la ruta, cmdlets y alias de PowerShell en posición de comando, `[IO.File]::` y variables
asignadas dentro del mismo comando (`$p='ruta'; Remove-Item $p`).

## El control duro está en el servidor

Lo que de verdad impide el daño no depende de cómo escriba el comando el agente:

| Riesgo | Control server-side |
|---|---|
| Editar un guard del CI o un archivo de zona crítica | Check "Zona crítica requiere review de Fable" (exige la etiqueta `fable-reviewed`) |
| Editar, borrar o repetir una migración mergeada | Check "Migraciones mergeadas intactas" (`pull_request_target`: corre el código de main, no el del PR) |
| Aplicar SQL a prod | Workflow `migraciones-prod` con aprobación humana del environment |
| Ponerse una etiqueta que apaga un guard | Las etiquetas solo se ponen en el PR y quedan en su timeline con autor: es auditable |
| Pushear a main | Protección de rama con checks obligatorios y `enforce_admins` |

El escáner sirve para cortar temprano (ahorra cupo y deja la alerta P0 con el comando exacto); el servidor es el
que decide.

## Límites conocidos (no se persiguen con regex)

- **Ejecución indirecta.** El agente escribe un script (`fix.mjs`, `x.ps1`, un `package.json` script) y lo corre
  en otro paso. El escáner ve `node fix.mjs`, no lo que hace por dentro.
- **Un cuerpo escrito en un paso anterior.** `gh api … --input body.json` hacia rutas de issues o graphql desde
  archivo se detiene por fallar cerrado (`etiqueta-sin-ver`), pero un archivo escrito antes y usado por otra
  herramienta que no está en la lista no se ve.
- **Pipelines de objetos de PowerShell.** `Get-ChildItem … | Remove-Item`: la ruta viaja como objeto, no como
  texto en el comando.
- **Construcción de strings y evaluación.** Rutas armadas por concatenación (`'.git'+'hub/…'`), `Invoke-Expression`,
  `eval`, `bash -c "$(…)"`, base64, variables definidas en otro comando o en el entorno.
- **Comentarios de bloque** de PowerShell (`<# … #>`) y opciones de `env` que llevan valor (`env -u NOMBRE`).
- **Otras vías a GitHub:** `curl` directo a la API, otro cliente, o la herramienta MCP de GitHub si algún día se
  habilita.

Perseguir estas formas con más regex agrega falsos positivos (agentes legítimos muertos a mitad de un PR) sin
cerrar el hueco: siempre hay una forma más. Si un límite se vuelve un riesgo real, el arreglo va en el servidor
(un check, un permiso o una protección de rama), no en el escáner.

## Cómo agregar una forma

Solo si es una forma que un agente usaría de buena fe (la forma "normal" de escribir el comando). Test que falle
antes del fix en `scripts/ceo/__tests__/escaner-formas.test.mjs` (o `guard-etiquetas.test.mjs`), y un caso de
"leer no es editar" para el falso positivo que podría abrir.
