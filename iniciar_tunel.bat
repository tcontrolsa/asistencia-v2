@echo off
title Tunel Cloudflare - Asistencia v2 Docker
echo ========================================================
echo   Iniciando Tunel Cloudflare para Asistencia v2
echo   Destino: http://192.168.10.129:3000
echo ========================================================
echo.
echo Copia la URL HTTPS que termine en .trycloudflare.com
echo y pegala en la configuracion de tu GitHub Pages.
echo.
"C:\Users\tcontrol\bin\cloudflared.exe" tunnel --url http://192.168.10.129:3000
pause
