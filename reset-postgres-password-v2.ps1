# Reset PostgreSQL Postgres User Password - Version 2 (More Careful)
# Run this script as Administrator

$ErrorActionPreference = "Stop"

$pgDataPath = "C:\Program Files\PostgreSQL\18\data"
$pgHbaPath = "$pgDataPath\pg_hba.conf"
$pgHbaBackup = "$pgDataPath\pg_hba.conf.backup"
$serviceName = "postgresql-x64-18"

Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Reset PostgreSQL Postgres Password (v2)" -ForegroundColor Cyan
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
    Copy-Item $pgHbaPath "$pgHbaPath.backup2" -Force
    Write-Host "✓ Backup created: $pgHbaPath.backup2" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to backup pg_hba.conf: $_" -ForegroundColor Red
    pause
    exit 1
}
Write-Host ""

# Step 2: Read and carefully modify pg_hba.conf
Write-Host "Step 2: Modifying pg_hba.conf for trust authentication..." -ForegroundColor Yellow
try {
    $content = Get-Content $pgHbaPath -Raw

    # Make a targeted replacement - only change localhost IPv4 and IPv6 to trust
    $newContent = $content -replace '(host\s+all\s+all\s+127\.0\.0\.1/32\s+)\S+', '${1}trust'
    $newContent = $newContent -replace '(host\s+all\s+all\s+::1/128\s+)\S+', '${1}trust'

    # Save the modified content
    $newContent | Set-Content $pgHbaPath -NoNewline

    Write-Host "✓ pg_hba.conf modified" -ForegroundColor Green
    Write-Host ""
    Write-Host "Modified lines:" -ForegroundColor Cyan
    Get-Content $pgHbaPath | Select-String -Pattern "127.0.0.1|::1" | ForEach-Object { Write-Host "  $_" -ForegroundColor White }
} catch {
    Write-Host "❌ Failed to modify pg_hba.conf: $_" -ForegroundColor Red
    Copy-Item "$pgHbaPath.backup2" $pgHbaPath -Force
    pause
    exit 1
}
Write-Host ""

# Step 3: Reload PostgreSQL configuration (safer than restart)
Write-Host "Step 3: Reloading PostgreSQL configuration..." -ForegroundColor Yellow
try {
    # Use pg_ctl reload instead of service restart (safer)
    & "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" reload -D $pgDataPath
    Start-Sleep -Seconds 2
    Write-Host "✓ Configuration reloaded" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Reload command failed, trying service restart..." -ForegroundColor Yellow
    try {
        Restart-Service -Name $serviceName -Force
        Start-Sleep -Seconds 3
        Write-Host "✓ Service restarted" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to restart PostgreSQL: $_" -ForegroundColor Red
        Copy-Item "$pgHbaPath.backup2" $pgHbaPath -Force
        pause
        exit 1
    }
}
Write-Host ""

# Step 4: Test connection with trust auth
Write-Host "Step 4: Testing trust authentication..." -ForegroundColor Yellow
try {
    $testResult = & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5438 -U postgres -d postgres -c "SELECT version();" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Trust authentication working" -ForegroundColor Green
    } else {
        Write-Host "❌ Trust authentication failed: $testResult" -ForegroundColor Red
        Copy-Item "$pgHbaPath.backup2" $pgHbaPath -Force
        Restart-Service -Name $serviceName -Force
        pause
        exit 1
    }
} catch {
    Write-Host "❌ Failed to test connection: $_" -ForegroundColor Red
    Copy-Item "$pgHbaPath.backup2" $pgHbaPath -Force
    Restart-Service -Name $serviceName -Force
    pause
    exit 1
}
Write-Host ""

# Step 5: Reset password
Write-Host "Step 5: Enter new password for postgres user..." -ForegroundColor Yellow
$newPassword = Read-Host "New password" -AsSecureString
$newPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($newPassword))

if ([string]::IsNullOrWhiteSpace($newPasswordPlain)) {
    Write-Host "❌ Password cannot be empty!" -ForegroundColor Red
    Copy-Item "$pgHbaPath.backup2" $pgHbaPath -Force
    Restart-Service -Name $serviceName -Force
    pause
    exit 1
}

Write-Host ""
Write-Host "Setting password..." -ForegroundColor Yellow
try {
    $setPasswordResult = & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5438 -U postgres -d postgres -c "ALTER USER postgres WITH PASSWORD '$newPasswordPlain';" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Password updated successfully" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to update password: $setPasswordResult" -ForegroundColor Red
        Copy-Item "$pgHbaPath.backup2" $pgHbaPath -Force
        Restart-Service -Name $serviceName -Force
        pause
        exit 1
    }
} catch {
    Write-Host "❌ Failed to update password: $_" -ForegroundColor Red
    Copy-Item "$pgHbaPath.backup2" $pgHbaPath -Force
    Restart-Service -Name $serviceName -Force
    pause
    exit 1
}
Write-Host ""

# Step 6: Restore pg_hba.conf
Write-Host "Step 6: Restoring original pg_hba.conf..." -ForegroundColor Yellow
try {
    Copy-Item "$pgHbaPath.backup2" $pgHbaPath -Force
    Write-Host "✓ pg_hba.conf restored" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to restore pg_hba.conf: $_" -ForegroundColor Red
    pause
    exit 1
}
Write-Host ""

# Step 7: Reload configuration again
Write-Host "Step 7: Reloading configuration with restored settings..." -ForegroundColor Yellow
try {
    & "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" reload -D $pgDataPath
    Start-Sleep -Seconds 2
    Write-Host "✓ Configuration reloaded" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Reload failed, trying service restart..." -ForegroundColor Yellow
    Restart-Service -Name $serviceName -Force
    Start-Sleep -Seconds 3
    Write-Host "✓ Service restarted" -ForegroundColor Green
}
Write-Host ""

# Step 8: Test new password
Write-Host "Step 8: Testing new password..." -ForegroundColor Yellow
$env:PGPASSWORD = $newPasswordPlain
$testResult = & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5438 -U postgres -d postgres -c "SELECT version();" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Password reset successful!" -ForegroundColor Green
} else {
    Write-Host "⚠️ Password was set but test connection failed" -ForegroundColor Yellow
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
