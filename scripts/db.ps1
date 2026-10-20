# Usage: .\scripts\db.ps1 init|start|stop|status|psql
param([Parameter(Mandatory=$true)][ValidateSet('init','start','stop','status','psql')][string]$Cmd)
$root = Split-Path $PSScriptRoot -Parent
$bin  = Join-Path $root 'tools\pgsql\bin'
$data = Join-Path $root 'data\pg'
$port = 54330
# pg_ctl -w garde les tubes du parent ouverts (bloque les shells/outils) : on détache le serveur et on attend avec pg_isready.
function Start-Db {
  Start-Process -WindowStyle Hidden -FilePath "$bin\pg_ctl.exe" -ArgumentList @('-D',"`"$data`"",'-l',"`"$(Join-Path $root 'data\pg.log')`"",'start')
  for ($i=0; $i -lt 60; $i++) { & "$bin\pg_isready.exe" -h 127.0.0.1 -p $port -q; if ($LASTEXITCODE -eq 0) { Write-Host 'PostgreSQL ready'; return }; Start-Sleep 1 }
  throw 'PostgreSQL did not start'
}
switch ($Cmd) {
  'init'   { if (Test-Path (Join-Path $data 'PG_VERSION')) { Write-Host 'already initialised'; break }
             New-Item -ItemType Directory -Force $data | Out-Null
             & "$bin\initdb.exe" -D $data -U rag -A trust -E UTF8 --locale=C
             Add-Content (Join-Path $data 'postgresql.conf') "`nport = $port`nlisten_addresses = '127.0.0.1'`nshared_buffers = 1GB`nwork_mem = 32MB`nmaintenance_work_mem = 512MB`neffective_cache_size = 8GB`nmax_wal_size = 4GB`nsynchronous_commit = off"
             Start-Db
             & "$bin\createdb.exe" -h 127.0.0.1 -p $port -U rag rag
             & "$bin\psql.exe" -h 127.0.0.1 -p $port -U rag -d rag -c "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS unaccent; CREATE EXTENSION IF NOT EXISTS pg_trgm;" }
  'start'  { Start-Db }
  'stop'   { & "$bin\pg_ctl.exe" -D $data -m fast -w stop }
  'status' { & "$bin\pg_ctl.exe" -D $data status }
  'psql'   { & "$bin\psql.exe" -h 127.0.0.1 -p $port -U rag -d rag }
}
