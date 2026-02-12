# Fix PostgreSQL Service - Restore backup and restart
# Run as Administrator

$pgDataPath = "C:\Program Files\PostgreSQL\18\data"
$pgHbaPath = "$pgDataPath\pg_hba.conf"
$pgHbaBackup = "$pgDataPath\pg_hba.conf.backup"
$serviceName = "postgresql-x64-18"

Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Fix PostgreSQL Service" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check if backup exists
if (Test-Path $pgHbaBackup) {
    Write-Host "Restoring pg_hba.conf from backup..." -ForegroundColor Yellow
    Copy-Item $pgHbaBackup $pgHbaPath -Force
    Write-Host "✓ pg_hba.conf restored" -ForegroundColor Green
} else {
    Write-Host "⚠️  No backup found, pg_hba.conf not modified" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Starting PostgreSQL service..." -ForegroundColor Yellow
try {
    Start-Service -Name $serviceName -ErrorAction Stop
    Write-Host "✓ PostgreSQL service started successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to start: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Try starting manually from Services (services.msc)" -ForegroundColor Yellow
}

Write-Host ""
pause
