# Démarre tout : PostgreSQL portable, API (3001), front (5173). Usage : .\scripts\start.ps1
$root = Split-Path $PSScriptRoot -Parent
& "$PSScriptRoot\db.ps1" start
Start-Process -WindowStyle Hidden -WorkingDirectory "$root\apps\api" -FilePath "cmd.exe" -ArgumentList '/c','npx tsx src/server.ts >> ..\..\data\api.log 2>&1'
Start-Process -WindowStyle Hidden -WorkingDirectory "$root\apps\web" -FilePath "cmd.exe" -ArgumentList '/c','npx vite >> ..\..\data\web.log 2>&1'
Write-Host 'API : http://127.0.0.1:3001   Interface : http://localhost:5173'
Start-Process 'http://localhost:5173'
