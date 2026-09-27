<#
.SYNOPSIS
    Singularity Bridge - Script interativo de Deploy e Inicialização com Docker
.DESCRIPTION
    Verifica Docker/Compose, solicita variáveis de ambiente caso ausentes,
    prepara diretórios e sobe o container em segundo plano.
#>

$ErrorActionPreference = "Stop"

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "  🌌 Singularity Bridge — Assistente de Deploy com Docker" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

# 1. Checagem de Docker
Write-Host "`n[1/5] Verificando Docker e Docker Compose..." -ForegroundColor Blue
if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    Write-Host "✖ Docker não encontrado no PATH! Instale o Docker Desktop." -ForegroundColor Red
    exit 1
}

$composeCmd = "docker compose"
try {
    & docker compose version | Out-Null
} catch {
    Write-Host "✖ Docker Compose v2 não encontrado. Certifique-se de ter o plugin do compose." -ForegroundColor Red
    exit 1
}
Write-Host "✔ Docker e Docker Compose operacionais." -ForegroundColor Green

# 2. Configuração do .env
Write-Host "`n[2/5] Configurando variáveis de ambiente (.env)..." -ForegroundColor Blue
$envPath = Join-Path $PSScriptRoot ".env"
$reconfigure = $true

if (Test-Path $envPath) {
    Write-Host "ℹ Arquivo .env já existe." -ForegroundColor Yellow
    $ans = Read-Host "Deseja reconfigurar as variáveis agora? (s/N)"
    if ($ans -ne "s" -and $ans -ne "S") {
        $reconfigure = $false
        Write-Host "✔ Mantendo configurações existentes do .env." -ForegroundColor Green
    }
}

if ($reconfigure) {
    Write-Host "`nPor favor, responda às perguntas abaixo:" -ForegroundColor White

    # Token
    do {
        $discordToken = Read-Host "🔑 Discord Bot Token (Developer Portal)"
    } while ([string]::IsNullOrWhiteSpace($discordToken))

    # User ID
    do {
        $allowedUserId = Read-Host "👤 Seu Discord User ID (Snowflake numérico de 17-21 dígitos)"
    } while ($allowedUserId -notmatch "^\d{17,21}$")

    # Category ID
    $categoryId = Read-Host "📁 ID da Categoria do Discord para Auto-Sandboxes (Recomendado, ou Enter para pular)"

    # Command prefix
    $cmdPrefix = Read-Host "⚡ Comando prefixo da CLI [Padrão: agy -p]"
    if ([string]::IsNullOrWhiteSpace($cmdPrefix)) { $cmdPrefix = "agy -p" }

    # Mappings
    $mappings = Read-Host "🗺️ Mapeamentos fixos JSON [Padrão: {}]"
    if ([string]::IsNullOrWhiteSpace($mappings)) { $mappings = "{}" }

    # Timeout
    $timeout = Read-Host "⏱️ Timeout de execução em ms [Padrão: 600000 = 10min]"
    if ([string]::IsNullOrWhiteSpace($timeout)) { $timeout = "600000" }

    $envContent = @"
# ==============================================================================
# Singularity Daemon Environment Configuration
# ==============================================================================
DISCORD_TOKEN=$discordToken
ALLOWED_USER_ID=$allowedUserId
ALLOWED_CATEGORY_ID=$categoryId
WORKSPACE_MAPPINGS=$mappings
COMMAND_PREFIX_BIN=$cmdPrefix
EXECUTION_TIMEOUT_MS=$timeout
MAX_BUFFER_BYTES=15728640
TYPING_INTERVAL_MS=7000
AUTO_WORKSPACES_ROOT=workspaces
"@

    Set-Content -Path $envPath -Value $envContent -Encoding UTF8
    Write-Host "✔ Arquivo .env gerado com sucesso." -ForegroundColor Green
}

# 3. Preparação das Pastas
Write-Host "`n[3/5] Preparando pastas persistentes..." -ForegroundColor Blue
New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot "workspaces") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot "data") | Out-Null
$geminiDir = Join-Path $env:USERPROFILE ".gemini"
if (-not (Test-Path $geminiDir)) {
    New-Item -ItemType Directory -Force -Path $geminiDir | Out-Null
}
Write-Host "✔ Pastas ./workspaces e ./data preparadas." -ForegroundColor Green

# 4. Build e Up
Write-Host "`n[4/5] Construindo e subindo container com Docker Compose..." -ForegroundColor Blue
& docker compose down 2>$null
& docker compose up -d --build
Write-Host "✔ Container iniciado!" -ForegroundColor Green

# 5. Status e Logs
Write-Host "`n[5/5] Status do container:" -ForegroundColor Blue
Start-Sleep -Seconds 2
& docker compose ps
Write-Host "`nÚltimos logs:" -ForegroundColor Cyan
& docker compose logs --tail=15 singularity-bridge

Write-Host "`n🚀 DEPLOY CONCLUÍDO COM SUCESSO!" -ForegroundColor Green
