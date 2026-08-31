@echo off
cd /d "%~dp0.."
schtasks /Create /TN "GolfersPlus-CEO-Autonomo" /TR "node --env-file=.env.local \"%~dp0ceo-autonomo.mjs\"" /SC ONLOGON /RL HIGHEST /F
echo Done. El CEO Autonomo se lanzara automaticamente al iniciar sesion.
pause
