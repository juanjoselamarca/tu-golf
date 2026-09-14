@echo off
REM CEO Autonomo v2 — registra 3 tareas nocturnas en Windows Task Scheduler.
REM El resumen-ceo (agente 4) se auto-dispara al terminar el agente 3.
REM Ejecutar UNA VEZ con permisos de administrador.

set REPO_DIR=C:\Users\juanj\OneDrive\Escritorio\Proyectos IA\tu-golf
set SCRIPT=%REPO_DIR%\scripts\ceo-autonomo.mjs

echo Registrando tareas del CEO Autonomo v2 (horario nocturno)...
echo Repo: %REPO_DIR%
echo.

REM Eliminar tareas viejas (v1 y v2)
schtasks /Delete /TN "GolfersPlus-CEO-Autonomo" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-1-FlowE2E" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-2-DeadEndHunter" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-3-RefactorSecurity" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-4-QADesign" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-5-ResumenCEO" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-1-DeadEndHunter" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-2-DataQuality" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-3-E2EWriter" /F 2>nul

REM 3 agentes nocturnos. Timeout 2h = 30min de margen entre cada uno.
REM Resumen-ceo se auto-dispara al terminar agente 3 (~07:30, listo a las 8am).

powershell -Command ^
  "$repo = '%REPO_DIR%'; $script = '%SCRIPT%'; " ^
  "$agents = @(" ^
  "  @{Name='GolfersPlus-CEO-1-DeadEndHunter'; Time='00:00'; Id='1'}," ^
  "  @{Name='GolfersPlus-CEO-2-DataQuality';   Time='02:30'; Id='2'}," ^
  "  @{Name='GolfersPlus-CEO-3-E2EWriter';     Time='05:00'; Id='3'}" ^
  "); " ^
  "foreach ($a in $agents) {" ^
  "  $action = New-ScheduledTaskAction -Execute 'node' -Argument ('\"' + $script + '\" --now ' + $a.Id) -WorkingDirectory $repo; " ^
  "  $trigger = New-ScheduledTaskTrigger -Daily -At $a.Time; " ^
  "  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -WakeToRun; " ^
  "  Register-ScheduledTask -TaskName $a.Name -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null; " ^
  "  Write-Host ('  OK: ' + $a.Name + ' a las ' + $a.Time)" ^
  "}"

echo.
echo Listo. 3 tareas nocturnas registradas (resumen-ceo se auto-dispara tras agente 3).
echo Horario: 00:00 ^> 02:30 ^> 05:00 ^> resumen ~07:30 (listo a las 8am)
echo.
echo NOTA: -WakeToRun habilitado. El PC se despierta para correr los agentes.
echo Para verificar: powershell -Command "Get-ScheduledTask | Where { $_.TaskName -like 'GolfersPlus*' }"
pause
