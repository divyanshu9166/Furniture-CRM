$src = "$env:TEMP\pgvector-pg18"
$pgRoot = "C:\Program Files\PostgreSQL\18"

Write-Host "Copying pgvector files to $pgRoot..."

try {
    Copy-Item "$src\lib\vector.dll" "$pgRoot\lib\" -Force
    Copy-Item "$src\share\extension\*" "$pgRoot\share\extension\" -Force

    $hdrDest = "$pgRoot\include\server\extension\vector"
    if (-not (Test-Path $hdrDest)) { New-Item $hdrDest -ItemType Directory -Force | Out-Null }
    Copy-Item "$src\include\server\extension\vector\*" $hdrDest -Force

    Write-Host "Installation complete successfully!" -ForegroundColor Green
    Write-Host "vector.dll: $(Test-Path "$pgRoot\lib\vector.dll")"
} catch {
    Write-Host "Error occurred during installation: $_" -ForegroundColor Red
}

Write-Host "Press any key to close this window..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
