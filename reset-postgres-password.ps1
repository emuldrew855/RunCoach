# Reset PostgreSQL Postgres User Password
# Run this script as Administrator

$ErrorActionPreference = "Stop"

$pgDataPath = "C:\Program Files\PostgreSQL\18\data"
$pgHbaPath = "$pgDataPath\pg_hba.conf"
$pgHbaBackup = "$pgDataPath\pg_hba.conf.backup"
$serviceName = "postgresql-x64-18"

Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Reset PostgreSQL Postgres Password" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "❌ ERROR: This script must be run as Administrator!" -ForegroundColor Red
    pause
    exit 1
}

Write-Host "This script will temporarily modify pg_hba.conf to allow password reset." -ForegroundColor Yellow
Write-Host "Press any key to continue or Ctrl+C to cancel..." -ForegroundColor Yellow
pause
Write-Host ""

# Step 1: Backup pg_hba.conf
Write-Host "Step 1: Backing up pg_hba.conf..." -ForegroundColor Yellow
try {
    Copy-Item $pgHbaPath $pgHbaBackup -Force
    Write-Host "✓ Backup created: $pgHbaBackup" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to backup pg_hba.conf: $_" -ForegroundColor Red
    pause
    exit 1
}
Write-Host ""

# Step 2: Modify pg_hba.conf to use trust authentication
Write-Host "Step 2: Modifying pg_hba.conf for temporary trust authentication..." -ForegroundColor Yellow
try {
    $content = Get-Content $pgHbaPath
    $newContent = $content -replace '^(host\s+all\s+all\s+127\.0\.0\.1/32\s+)\w+', '$1trust'
    $newContent = $newContent -replace '^(host\s+all\s+all\s+::1/128\s+)\w+', '$1trust'
    $newContent | Set-Content $pgHbaPath
    Write-Host "✓ pg_hba.conf modified" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to modify pg_hba.conf: $_" -ForegroundColor Red
    Copy-Item $pgHbaBackup $pgHbaPath -Force
    pause
    exit 1
}
Write-Host ""

# Step 3: Restart PostgreSQL
Write-Host "Step 3: Restarting PostgreSQL service..." -ForegroundColor Yellow
try {
    Restart-Service -Name $serviceName -Force
    Start-Sleep -Seconds 3
    Write-Host "✓ PostgreSQL restarted" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to restart PostgreSQL: $_" -ForegroundColor Red
    Copy-Item $pgHbaBackup $pgHbaPath -Force
    pause
    exit 1
}
Write-Host ""

# Step 4: Reset password
Write-Host "Step 4: Enter new password for postgres user..." -ForegroundColor Yellow
$newPassword = Read-Host "New password" -AsSecureString
$newPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($newPassword))

if ([string]::IsNullOrWhiteSpace($newPasswordPlain)) {
    Write-Host "❌ Password cannot be empty!" -ForegroundColor Red
    Copy-Item $pgHbaBackup $pgHbaPath -Force
    Restart-Service -Name $serviceName -Force
    pause
    exit 1
}

try {
    & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5438 -U postgres -d postgres -c "ALTER USER postgres WITH PASSWORD '$newPasswordPlain';" 2>&1 | Out-Null
    Write-Host "✓ Password updated successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to update password: $_" -ForegroundColor Red
    Copy-Item $pgHbaBackup $pgHbaPath -Force
    Restart-Service -Name $serviceName -Force
    pause
    exit 1
}
Write-Host ""

# Step 5: Restore pg_hba.conf
Write-Host "Step 5: Restoring original pg_hba.conf..." -ForegroundColor Yellow
try {
    Copy-Item $pgHbaBackup $pgHbaPath -Force
    Write-Host "✓ pg_hba.conf restored" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to restore pg_hba.conf: $_" -ForegroundColor Red
    pause
    exit 1
}
Write-Host ""

# Step 6: Restart PostgreSQL again
Write-Host "Step 6: Restarting PostgreSQL with original settings..." -ForegroundColor Yellow
try {
    Restart-Service -Name $serviceName -Force
    Start-Sleep -Seconds 3
    Write-Host "✓ PostgreSQL restarted" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to restart PostgreSQL: $_" -ForegroundColor Red
    pause
    exit 1
}
Write-Host ""

# Step 7: Test new password
Write-Host "Step 7: Testing new password..." -ForegroundColor Yellow
$env:PGPASSWORD = $newPasswordPlain
$testResult = & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5438 -U postgres -d postgres -c "SELECT version();" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Password reset successful!" -ForegroundColor Green
} else {
    Write-Host "⚠️  Password was set but test connection failed" -ForegroundColor Yellow
    Write-Host $testResult
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ✅ Password Reset Complete!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "New postgres password: $newPasswordPlain" -ForegroundColor White
Write-Host ""
Write-Host "Next: Create vector extension by running:" -ForegroundColor Yellow
Write-Host '& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5438 -U postgres -d runcoach -c "CREATE EXTENSION IF NOT EXISTS vector;"' -ForegroundColor White
Write-Host ""
pause
