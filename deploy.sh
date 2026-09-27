#!/usr/bin/env bash
# ==============================================================================
# 🌌 Singularity Bridge — Script de Deploy e Inicialização para VPS / Servidores
# ==============================================================================
set -e

# Cores para feedback no terminal
GREEN="\033[1;32m"
BLUE="\033[1;34m"
YELLOW="\033[1;33m"
RED="\033[1;31m"
CYAN="\033[1;36m"
BOLD="\033[1m"
RESET="\033[0m"

echo -e "${CYAN}"
cat << "EOF"
  ___ _                   _            _ _         
 / __(_)_ __  __ _ _   _| | __ _ _ __(_) |_ _   _ 
 \__ \ | '_ \ / _` | | | | |/ _` | '__| | __| | | |
 ___/ / | | | | (_| | | | | | (_| | |  | | |_| |_| |
|____/|_|_| |_|\__, |\__,_|_|\__,_|_|  |_|\__|\__, |
               |___/                          |___/ 
      Autonomous Ambient CLI Bridge for Discord
EOF
echo -e "${RESET}"
echo -e "${BOLD}Iniciando assistente de configuração e deploy do Singularity...${RESET}\n"

# ------------------------------------------------------------------------------
# 1. Verificação de Dependências do Sistema (Pre-flight checks)
# ------------------------------------------------------------------------------
echo -e "${BLUE}[1/5] Verificando dependências do host...${RESET}"

if ! command -v docker >/dev/null 2>&1; then
    echo -e "${RED}✖ Docker não encontrado no sistema!${RESET}"
    echo -e "Por favor, instale o Docker na sua VPS antes de prosseguir:"
    echo -e "  curl -fsSL https://get.docker.com | sh"
    echo -e "  sudo usermod -aG docker \$USER"
    exit 1
fi

# Detectar Docker Compose (v2 plugin ou v1 standalone)
DOCKER_COMPOSE_CMD=""
if docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    echo -e "${RED}✖ Docker Compose não encontrado!${RESET}"
    echo -e "Instale o plugin compose via 'sudo apt-get install docker-compose-plugin'."
    exit 1
fi

# Verificar se o daemon do Docker está rodando
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}✖ O serviço do Docker não está em execução ou o usuário não tem permissão.${RESET}"
    echo -e "Execute com 'sudo' ou adicione seu usuário ao grupo docker: 'sudo usermod -aG docker \$USER'."
    exit 1
fi

echo -e "${GREEN}✔ Docker e ${DOCKER_COMPOSE_CMD} validados com sucesso!${RESET}\n"

# ------------------------------------------------------------------------------
# 2. Configuração Interativa das Variáveis de Ambiente (.env)
# ------------------------------------------------------------------------------
echo -e "${BLUE}[2/5] Configurando variáveis de ambiente (.env)...${RESET}"

ENV_FILE=".env"
RECONFIGURE=true

if [ -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}ℹ Arquivo .env já existente detectado.${RESET}"
    read -rp "Deseja reconfigurar as variáveis de ambiente agora? [s/N]: " RESP
    case "$RESP" in
        [sS][iI][mM]|[sS])
            RECONFIGURE=true
            ;;
        *)
            RECONFIGURE=false
            echo -e "${GREEN}✔ Mantendo configurações existentes do .env.${RESET}"
            ;;
    esac
fi

if [ "$RECONFIGURE" = true ]; then
    echo -e "\n${BOLD}Por favor, responda aos prompts abaixo:${RESET}"

    # 1. DISCORD_TOKEN
    while true; do
        read -rp "🔑 Discord Bot Token (Developer Portal): " INPUT_DISCORD_TOKEN
        if [ -n "$INPUT_DISCORD_TOKEN" ]; then
            break
        fi
        echo -e "${RED}O Token do bot é obrigatório! Tente novamente.${RESET}"
    done

    # 2. ALLOWED_USER_ID
    while true; do
        read -rp "👤 Seu Discord User ID (Snowflake numérico de 17-21 dígitos): " INPUT_ALLOWED_USER_ID
        if [[ "$INPUT_ALLOWED_USER_ID" =~ ^[0-9]{17,21}$ ]]; then
            break
        fi
        echo -e "${RED}ID inválido! Deve ser um número de 17 a 21 dígitos (ative o Developer Mode no Discord e copie seu ID).${RESET}"
    done

    # 3. ALLOWED_CATEGORY_ID (Recomendado para auto-sandboxes)
    read -rp "📁 ID da Categoria do Discord para Auto-Sandboxes (Recomendado, ou Enter para pular): " INPUT_ALLOWED_CATEGORY_ID
    if [ -n "$INPUT_ALLOWED_CATEGORY_ID" ] && ! [[ "$INPUT_ALLOWED_CATEGORY_ID" =~ ^[0-9]{17,21}$ ]]; then
        echo -e "${YELLOW}Aviso: ID de categoria fora do padrão, mas será salvo conforme informado.${RESET}"
    fi

    # 4. COMMAND_PREFIX_BIN
    read -rp "⚡ Comando prefixo da CLI [Padrão: agy -p]: " INPUT_COMMAND_PREFIX
    COMMAND_PREFIX_BIN="${INPUT_COMMAND_PREFIX:-agy -p}"

    # 5. WORKSPACE_MAPPINGS
    read -rp "🗺️ Mapeamentos fixos de workspace JSON [Padrão: {}]: " INPUT_WORKSPACE_MAPPINGS
    WORKSPACE_MAPPINGS="${INPUT_WORKSPACE_MAPPINGS:-{}}"

    # 6. AUTO_WORKSPACES_ROOT
    read -rp "📂 Diretório raiz para Auto-Sandboxes [Padrão: workspaces]: " INPUT_AUTO_ROOT
    AUTO_WORKSPACES_ROOT="${INPUT_AUTO_ROOT:-workspaces}"

    # 7. EXECUTION_TIMEOUT_MS
    read -rp "⏱️ Timeout de execução em milissegundos [Padrão: 600000 = 10min]: " INPUT_TIMEOUT
    EXECUTION_TIMEOUT_MS="${INPUT_TIMEOUT:-600000}"

    # Gravar arquivo .env com permissões restritas
    cat > "$ENV_FILE" << EOF
# ==============================================================================
# Singularity Daemon Environment Configuration
# Gerado via deploy.sh em $(date)
# ==============================================================================

DISCORD_TOKEN=${INPUT_DISCORD_TOKEN}
ALLOWED_USER_ID=${INPUT_ALLOWED_USER_ID}
ALLOWED_CATEGORY_ID=${INPUT_ALLOWED_CATEGORY_ID}
WORKSPACE_MAPPINGS=${WORKSPACE_MAPPINGS}
COMMAND_PREFIX_BIN=${COMMAND_PREFIX_BIN}
EXECUTION_TIMEOUT_MS=${EXECUTION_TIMEOUT_MS}
MAX_BUFFER_BYTES=15728640
TYPING_INTERVAL_MS=7000
AUTO_WORKSPACES_ROOT=${AUTO_WORKSPACES_ROOT}
EOF

    chmod 600 "$ENV_FILE"
    echo -e "${GREEN}✔ Arquivo .env gerado com permissões seguras (chmod 600).${RESET}\n"
fi

# ------------------------------------------------------------------------------
# 3. Preparação das Pastas Persistentes no Host
# ------------------------------------------------------------------------------
echo -e "${BLUE}[3/5] Criando pastas persistentes e checando credenciais...${RESET}"

mkdir -p workspaces data
mkdir -p "${HOME}/.gemini"

if [ -f "${HOME}/.gemini/oauth_creds.json" ]; then
    echo -e "${GREEN}✔ Credenciais do Antigravity detectadas em ~/.gemini/oauth_creds.json!${RESET}"
    echo -e "  O container herdará o login da sua conta Google automaticamente via volume compartilhado."
else
    echo -e "${YELLOW}ℹ Nenhuma credencial encontrada em ~/.gemini/oauth_creds.json.${RESET}"
    echo -e "  Você poderá autenticar após subir o container com um comando simples."
fi

echo -e "${GREEN}✔ Pastas ./workspaces e ./data prontas e persistidas.${RESET}\n"

# ------------------------------------------------------------------------------
# 4. Build e Inicialização do Container
# ------------------------------------------------------------------------------
echo -e "${BLUE}[4/5] Construindo imagem Docker e iniciando container...${RESET}"

$DOCKER_COMPOSE_CMD down --remove-orphans >/dev/null 2>&1 || true
$DOCKER_COMPOSE_CMD up -d --build

echo -e "${GREEN}✔ Container iniciado com sucesso!${RESET}\n"

# ------------------------------------------------------------------------------
# 5. Verificação de Saúde e Logs Iniciais
# ------------------------------------------------------------------------------
echo -e "${BLUE}[5/5] Verificando status do daemon...${RESET}"
sleep 2

$DOCKER_COMPOSE_CMD ps

echo -e "\n${BOLD}Últimos logs da inicialização do Singularity:${RESET}"
echo -e "${CYAN}--------------------------------------------------------------------------------${RESET}"
$DOCKER_COMPOSE_CMD logs --tail=15 singularity-bridge
echo -e "${CYAN}--------------------------------------------------------------------------------${RESET}"

if [ ! -f "${HOME}/.gemini/oauth_creds.json" ]; then
    echo -e "\n${YELLOW}${BOLD}⚠️ AUTENTICAÇÃO DO ANTIGRAVITY PENDENTE NO HOST:${RESET}"
    echo -e "O Antigravity CLI precisa estar autenticado com sua conta Google para processar tarefas."
    echo -e "Escolha a forma mais conveniente:"
    echo -e "  ${BOLD}Opção A (Recomendada - Login interativo no container):${RESET}"
    echo -e "    ${CYAN}docker exec -it singularity-bridge agy${RESET}"
    echo -e "    (O terminal exibirá uma URL do Google. Abra no navegador do celular/PC, aprove o login e cole o código de volta)."
    echo -e "  ${BOLD}Opção B (Copiar do seu PC local para a VPS via SCP):${RESET}"
    echo -e "    ${CYAN}scp -r ~/.gemini/* usuario@sua-vps:~/.gemini/${RESET}"
fi

echo -e "\n${GREEN}${BOLD}🚀 DEPLOY DO SINGULARITY FINALIZADO COM SUCESSO!${RESET}"
echo -e "Seu bot está conectado ao Discord e pronto para processar tarefas."
echo -e "\n${BOLD}Comandos úteis para o dia a dia na VPS:${RESET}"
echo -e "  • Acompanhar logs em tempo real: ${CYAN}${DOCKER_COMPOSE_CMD} logs -f${RESET}"
echo -e "  • Entrar no terminal do container: ${CYAN}docker exec -it singularity-bridge bash${RESET}"
echo -e "  • Reiniciar o container:          ${CYAN}${DOCKER_COMPOSE_CMD} restart${RESET}"
echo -e "  • Parar o container:              ${CYAN}${DOCKER_COMPOSE_CMD} down${RESET}"
echo -e "  • Atualizar e rebuildar:          ${CYAN}git pull && ./deploy.sh${RESET}\n"
