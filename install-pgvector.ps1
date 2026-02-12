# pgvector Installation Script for PostgreSQL 18
# Run this script as Administrator

$ErrorActionPreference = "Stop"

# Configuration
$extractedPath = "C:\Users\emuldrew\Downloads\vector.v0.8.1-pg18"
$pgInstallPath = "C:\Program Files\PostgreSQL\18"
$serviceName = "postgresql-x64-18"

Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  pgvector Installation for PostgreSQL 18" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "❌ ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "   Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    pause
    exit 1
}

# Check if extracted files exist
Write-Host "Checking extracted files..." -ForegroundColor Yellow
if (-not (Test-Path "$extractedPath\lib\vector.dll")) {
    Write-Host "❌ ERROR: vector.dll not found in $extractedPath\lib" -ForegroundColor Red
    Write-Host "   Please verify the extraction path." -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host "✓ Extracted files found" -ForegroundColor Green
Write-Host ""

# Step 1: Stop PostgreSQL service
Write-Host "Step 1: Stopping PostgreSQL service..." -ForegroundColor Yellow
try {
    Stop-Service -Name $serviceName -Force
    Start-Sleep -Seconds 2
    Write-Host "✓ PostgreSQL service stopped" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to stop service: $_" -ForegroundColor Red
    pause
    exit 1
}
Write-Host ""

# Step 2: Copy DLL file
Write-Host "Step 2: Copying vector.dll to lib directory..." -ForegroundColor Yellow
try {
    Copy-Item "$extractedPath\lib\vector.dll" "$pgInstallPath\lib\" -Force
    Write-Host "✓ vector.dll copied successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to copy DLL: $_" -ForegroundColor Red
    Start-Service -Name $serviceName
    pause
    exit 1
}
Write-Host ""

# Step 3: Copy control file
Write-Host "Step 3: Copying vector.control to extension directory..." -ForegroundColor Yellow
try {
    Copy-Item "$extractedPath\share\extension\vector.control" "$pgInstallPath\share\extension\" -Force
    Write-Host "✓ vector.control copied successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to copy control file: $_" -ForegroundColor Red
    Start-Service -Name $serviceName
    pause
    exit 1
}
Write-Host ""

# Step 4: Copy SQL files
Write-Host "Step 4: Copying SQL files to extension directory..." -ForegroundColor Yellow
try {
    $sqlFiles = Get-ChildItem "$extractedPath\share\extension\vector--*.sql"
    foreach ($file in $sqlFiles) {
        Copy-Item $file.FullName "$pgInstallPath\share\extension\" -Force
        Write-Host "  ✓ Copied $($file.Name)" -ForegroundColor Green
    }
    Write-Host "✓ All SQL files copied successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to copy SQL files: $_" -ForegroundColor Red
    Start-Service -Name $serviceName
    pause
    exit 1
}
Write-Host ""

# Step 5: Start PostgreSQL service
Write-Host "Step 5: Starting PostgreSQL service..." -ForegroundColor Yellow
try {
    Start-Service -Name $serviceName
    Start-Sleep -Seconds 3
    Write-Host "✓ PostgreSQL service started" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to start service: $_" -ForegroundColor Red
    pause
    exit 1
}
Write-Host ""

# Step 6: Test installation
Write-Host "Step 6: Creating pgvector extension..." -ForegroundColor Yellow
Write-Host "   Note: You'll need to enter the postgres superuser password" -ForegroundColor Cyan
Write-Host ""

try {
    # Create extension as postgres superuser
    $createResult = & "$pgInstallPath\bin\psql.exe" -h localhost -p 5438 -U postgres -d runcoach -c "CREATE EXTENSION IF NOT EXISTS vector; SELECT extversion FROM pg_extension WHERE extname = 'vector';" 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ pgvector extension created successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Extension details:" -ForegroundColor Cyan
        Write-Host $createResult
    } else {
        Write-Host "❌ Failed to create extension: $createResult" -ForegroundColor Red
        Write-Host ""
        Write-Host "You can manually create the extension later by running:" -ForegroundColor Yellow
        Write-Host "psql -h localhost -p 5438 -U postgres -d runcoach -c `"CREATE EXTENSION vector;`"" -ForegroundColor White
    }
} catch {
    Write-Host "❌ Failed to test installation: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "You can manually create the extension later by running:" -ForegroundColor Yellow
    Write-Host "psql -h localhost -p 5438 -U postgres -d runcoach -c `"CREATE EXTENSION vector;`"" -ForegroundColor White
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ✅ pgvector Installation Complete!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Navigate to backend directory: cd C:\Users\emuldrew\Dev\RunCoach\backend" -ForegroundColor White
Write-Host "2. Run migrations: npm run migrate" -ForegroundColor White
Write-Host ""
pause
