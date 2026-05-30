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

$body = @{
    csrf_token = $tokenMatch.Groups[1].Value
    display_name = "Spam Test"
    message = "helloooooooooooooooooooo"
    x_percent = "12"
    y_percent = "12"
    color = "#9fc5a8"
    shape = "circle"
}

try {
    Invoke-RestMethod -Method Post -WebSession $session -Uri "$AppUrl/api/marks.php" -Body $body | Out-Null
    throw "Spam post unexpectedly succeeded."
} catch {
    if ($_.ErrorDetails.Message -like "*repeated character spam*") {
        Write-Host "PASS: spam message was rejected."
        exit 0
    }

    throw
}
