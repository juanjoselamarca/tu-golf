@echo off
REM CEO Autonomo v3 — una sola tarea nocturna en cadena + warmup + deadman.
REM Los 4 agentes corren secuencialmente (~1h total) y el briefing se envía a las 7:30.
REM Ejecutar UNA VEZ con permisos de administrador.
REM
REM Pipeline nocturno:
REM   23:30  token warmup     (refresca OAuth antes de los agentes)
REM   00:00  --now all         (4 agentes en cadena + resumen a las 7:30)
REM   08:00  deadman switch   (alerta si algo falló)

set REPO_DIR=C:\Users\juanj\OneDrive\Escritorio\Proyectos IA\tu-golf
set SCRIPT=%REPO_DIR%\scripts\ceo-autonomo.mjs

echo Registrando tareas del CEO Autonomo v3 (cadena nocturna)...
echo Repo: %REPO_DIR%
echo.

REM Eliminar TODAS las tareas viejas (v1, v2, v2.1)
schtasks /Delete /TN "GolfersPlus-CEO-Autonomo" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-1-FlowE2E" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-2-DeadEndHunter" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-3-RefactorSecurity" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-4-QADesign" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-5-ResumenCEO" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-1-DeadEndHunter" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-2-DataQuality" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-3-E2EWriter" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-1-DataQuality" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-2-DeadEndHunter2" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-3-QADesign" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-4-E2EWriter" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-DeadmanSwitch" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-TokenWarmup" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-TokenWarmup2" /F 2>nul
schtasks /Delete /TN "GolfersPlus-CEO-NightPipeline" /F 2>nul

powershell -Command ^
  "$repo = '%REPO_DIR%'; $script = '%SCRIPT%'; " ^
  "$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -WakeToRun -DontStopOnIdleEnd -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) -ExecutionTimeLimit (New-TimeSpan -Hours 8); " ^
  "" ^
  "# Pipeline principal: 4 agentes en cadena + resumen a las 7:30" ^
  "$pipeAction = New-ScheduledTaskAction -Execute 'node' -Argument ('\"' + $script + '\" --now all') -WorkingDirectory $repo; " ^
  "$pipeTrigger = New-ScheduledTaskTrigger -Daily -At '00:00'; " ^
  "Register-ScheduledTask -TaskName 'GolfersPlus-CEO-NightPipeline' -Action $pipeAction -Trigger $pipeTrigger -Settings $settings -Force | Out-Null; " ^
  "Write-Host '  OK: GolfersPlus-CEO-NightPipeline a las 00:00 (cadena completa)'; " ^
  "" ^
  "# Deadman switch" ^
  "$dmAction = New-ScheduledTaskAction -Execute 'node' -Argument ('\"' + $script + '\" --deadman') -WorkingDirectory $repo; " ^
  "$dmTrigger = New-ScheduledTaskTrigger -Daily -At '08:00'; " ^
  "Register-ScheduledTask -TaskName 'GolfersPlus-CEO-DeadmanSwitch' -Action $dmAction -Trigger $dmTrigger -Settings $settings -Force | Out-Null; " ^
  "Write-Host '  OK: GolfersPlus-CEO-DeadmanSwitch a las 08:00'; " ^
  "" ^
  "# Token warmup (refrescar OAuth antes de la cadena)" ^
  "$wuAction = New-ScheduledTaskAction -Execute 'node' -Argument ('\"' + $script + '\" --warmup') -WorkingDirectory $repo; " ^
  "$wuTrigger = New-ScheduledTaskTrigger -Daily -At '23:30'; " ^
  "Register-ScheduledTask -TaskName 'GolfersPlus-CEO-TokenWarmup' -Action $wuAction -Trigger $wuTrigger -Settings $settings -Force | Out-Null; " ^
  "Write-Host '  OK: GolfersPlus-CEO-TokenWarmup a las 23:30'"

echo.
echo Listo. 3 tareas registradas (antes eran 7).
echo.
echo PIPELINE NOCTURNO:
echo   23:30  TokenWarmup      (refresca OAuth)
echo   00:00  NightPipeline    (4 agentes en cadena ~1h + briefing a las 7:30)
echo   08:00  DeadmanSwitch    (alerta si algo fallo)
echo.
echo Para verificar: powershell -Command "Get-ScheduledTask | Where { $_.TaskName -like 'GolfersPlus*' }"
pause
