param(
    [string] $AppUrl = "http://localhost:8080",
    [string] $PhpMyAdminUrl = "http://localhost:8081",
    [switch] $WithPost
)

$ErrorActionPreference = "Stop"

function Test-StatusCode {
    param(
        [string] $Url,
        [int] $ExpectedStatus = 200
    )

    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url
    if ($response.StatusCode -ne $ExpectedStatus) {
        throw "$Url returned $($response.StatusCode), expected $ExpectedStatus."
    }

    Write-Host "PASS: $Url returned $ExpectedStatus"
    return $response
}

$health = Test-StatusCode "$AppUrl/health.php"
if ($health.Content.Trim() -ne "ok") {
    throw "$AppUrl/health.php returned unexpected body: $($health.Content)"
}

Test-StatusCode "$AppUrl/" | Out-Null
Test-StatusCode "$PhpMyAdminUrl/" | Out-Null

if ($WithPost) {
    & (Join-Path $PSScriptRoot "test-mark-post.ps1") -AppUrl $AppUrl
}

Write-Host "Smoke checks passed."
