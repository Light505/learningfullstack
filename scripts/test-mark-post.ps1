param(
    [string] $AppUrl = "http://localhost:8080"
)

$ErrorActionPreference = "Stop"

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$page = Invoke-WebRequest -UseBasicParsing -WebSession $session -Uri "$AppUrl/"
$tokenMatch = [regex]::Match($page.Content, 'name="csrf_token" value="([^"]+)"')

if (!$tokenMatch.Success) {
    throw "CSRF token was not found on the page."
}

$result = $null

for ($attempt = 0; $attempt -lt 20; $attempt++) {
    $body = @{
        csrf_token = $tokenMatch.Groups[1].Value
        display_name = "CSRF Test"
        message = "Posted with a token."
        x_percent = (Get-Random -Minimum 5 -Maximum 96).ToString()
        y_percent = (Get-Random -Minimum 5 -Maximum 96).ToString()
        color = "#9fc5a8"
        shape = "circle"
    }

    try {
        $result = Invoke-RestMethod -Method Post -WebSession $session -Uri "$AppUrl/api/marks.php" -Body $body
        break
    } catch {
        if ($_.ErrorDetails.Message -notlike "*too close*") {
            throw
        }
    }
}

if ($null -eq $result -or !$result.ok) {
    throw "Mark API did not return ok=true."
}

Write-Host "PASS: mark API accepted a POST with a valid CSRF token."

$undoBody = @{
    csrf_token = $tokenMatch.Groups[1].Value
    action = "undo"
}

$undoResult = Invoke-RestMethod -Method Post -WebSession $session -Uri "$AppUrl/api/marks.php" -Body $undoBody

if (!$undoResult.ok) {
    throw "Mark API did not return ok=true for undo."
}

Write-Host "PASS: mark API undid the latest mark for this session."
