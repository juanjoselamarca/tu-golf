@echo off
REM Envoltorio del monitor de caidas para Task Scheduler (tarea GolfersPlus-Monitor-Caidas, cada 5 min).
REM Por que existe (22-oct-2026): la tarea corria `node ... uptime.mjs --local` directo con logon interactivo,
REM asi que cada 5 min se abria una ventana de consola en el escritorio y la salida se perdia con ella.
REM La tarea ahora lanza este archivo con `conhost.exe --headless cmd.exe /c ...` (sin ventana, misma sesion,
REM mismo perfil y mismas variables) y la salida queda en un log con rotacion:
REM   %LOCALAPPDATA%\GolfersPlus\monitor\uptime.log   (rota a .1 al pasar 1 MB; ~1 mes por archivo)
REM Lo registra scripts\setup-ceo-task.bat. Las alertas siguen saliendo por Telegram desde uptime.mjs.
cd /d "%~dp0..\.."
set LOG=%LOCALAPPDATA%\GolfersPlus\monitor\uptime.log
if not exist "%LOCALAPPDATA%\GolfersPlus\monitor" mkdir "%LOCALAPPDATA%\GolfersPlus\monitor"
for %%F in ("%LOG%") do if %%~zF GTR 1048576 move /Y "%LOG%" "%LOG%.1" >nul
node --env-file=.env.local scripts\monitor\uptime.mjs --local >> "%LOG%" 2>&1
