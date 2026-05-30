param(
    [string] $DatabaseName = $env:DB_NAME,
    [string] $RootPassword = $env:MYSQL_ROOT_PASSWORD,
    [string] $ComposeCommand = "docker compose"
)

$ErrorActionPreference = "Stop"

function Read-EnvFile {
    param([string] $Path)

    $values = @{}
    if (!(Test-Path -LiteralPath $Path)) {
        return $values
    }

    Get-Content -LiteralPath $Path |
        ForEach-Object {
            $line = $_.Trim()
            if ($line -eq "" -or $line.StartsWith("#") -or !$line.Contains("=")) {
                return
            }

            $parts = $line.Split("=", 2)
            $values[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'")
        }

    return $values
}

$envFile = Read-EnvFile (Join-Path $PSScriptRoot "..\.env")
if ([string]::IsNullOrWhiteSpace($DatabaseName)) {
    $DatabaseName = $envFile["DB_NAME"]
}
if ([string]::IsNullOrWhiteSpace($DatabaseName)) {
    $DatabaseName = $envFile["MYSQL_DATABASE"]
}
if ([string]::IsNullOrWhiteSpace($RootPassword)) {
    $RootPassword = $envFile["MYSQL_ROOT_PASSWORD"]
}

if ([string]::IsNullOrWhiteSpace($DatabaseName)) {
    throw "Database name is required. Set DB_NAME or MYSQL_DATABASE in .env, or pass -DatabaseName."
}

if ([string]::IsNullOrWhiteSpace($RootPassword)) {
    throw "MYSQL_ROOT_PASSWORD is required in .env, or pass -RootPassword."
}

$migrationDir = Join-Path $PSScriptRoot "..\database\migrations"
$migrations = Get-ChildItem -LiteralPath $migrationDir -Filter "*.sql" | Sort-Object Name

if ($migrations.Count -eq 0) {
    throw "No migration files found in $migrationDir."
}

$composeParts = $ComposeCommand -split "\s+"
$composeArgs = $composeParts[1..($composeParts.Length - 1)]

$migrations |
    ForEach-Object { Get-Content -LiteralPath $_.FullName } |
    & $composeParts[0] @composeArgs exec -T db mysql -uroot "-p$RootPassword" $DatabaseName
