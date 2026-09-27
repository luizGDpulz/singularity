# 🚀 Guia de Execução e Deploy: Singularity

Este guia detalha como preparar o ambiente, configurar as variáveis e executar o **Singularity** localmente (para desenvolvimento) ou em uma VPS remota utilizando Docker Compose.

---

## Índice

1. [Pré-Requisitos](#1-pré-requisitos)
2. [Configuração do Ambiente (`.env`)](#2-configuração-do-ambiente-env)
3. [Execução Local (Node.js & TypeScript)](#3-execução-local-nodejs--typescript)
4. [Execução em Produção com Docker Compose](#4-execução-em-produção-com-docker-compose)
5. [Dinâmica de Uso no Discord](#5-dinâmica-de-uso-no-discord)
6. [Resolução de Problemas (Troubleshooting)](#6-resolução-de-problemas-troubleshooting)

---

## 1. Pré-Requisitos

- **Ambiente Local:**
  - Node.js 20 ou superior (`node -v`).
  - pnpm 9 ou superior (`pnpm -v`).
  - Git configurado.
  - A ferramenta CLI que você planeja executar (ex: Antigravity CLI `agy`, `git`, etc.) instalada e acessível no seu `PATH`.
- **Ambiente Docker (VPS):**
  - Docker Engine 24+ e Docker Compose plugin (`docker compose version`).

---

## 2. Configuração do Ambiente (`.env`)

Copie o template de exemplo na raiz do projeto:

```bash
cp .env.example .env
```

Abra o arquivo `.env` e configure as variáveis:

```ini
# Token obtido no Discord Developer Portal
DISCORD_TOKEN=MTE5OTk4NzY1NDMyMTA5ODc2NQ.GxYz...

# Seu Discord Snowflake ID (Apenas mensagens deste ID serão processadas)
ALLOWED_USER_ID=123456789012345678

# Mapeamento estrito: ID do Canal/Thread Pai -> Caminho Absoluto do Workspace
# No Linux / Docker:
WORKSPACE_MAPPINGS={"123456789012345678":"/workspace/meu-projeto"}
# No Windows local (use barras normais ou escapadas):
# WORKSPACE_MAPPINGS={"123456789012345678":"C:/Projects/meu-projeto"}

# Binário/Comando prefixo a ser invocado no diretório do projeto (padrão: antigravity run ou agy -p)
COMMAND_PREFIX_BIN=agy -p

# Opcional: Timeout máximo de subprocesso em milissegundos (padrão: 600000 = 10 minutos)
EXECUTION_TIMEOUT_MS=600000

# Opcional: Limite do buffer de saída em bytes (padrão: 15728640 = 15MB)
MAX_BUFFER_BYTES=15728640

# Opcional: Intervalo do indicador de digitação no Discord (padrão: 7000 = 7 segundos)
TYPING_INTERVAL_MS=7000
```

> 💡 **Nota de Segurança:** O Singularity conta com validação *fail-fast*. Se qualquer variável obrigatória estiver ausente ou o JSON de mapeamento for inválido, o daemon se recusará a subir, emitindo um banner com o erro exato no terminal.

---

## 3. Execução Local (Node.js & TypeScript)

### Instalação de Dependências
```bash
pnpm install
```

### Modo de Desenvolvimento (Hot-Reload)
Utiliza `tsx` para escutar alterações em tempo real nos arquivos TypeScript:
```bash
pnpm dev
```

### Checagem de Tipos Estrita
```bash
pnpm typecheck
```

### Testes Automatizados de Validação
Executa a suíte de testes de chunking e formatação de cabeçalhos:
```bash
pnpm test
```

### Build e Execução de Produção Local
```bash
# Compila TypeScript para a pasta dist/
pnpm build

# Executa o build compilado com Node
pnpm start
```

---

## 4. Execução em Produção com Docker Compose

A forma recomendada de manter o Singularity rodando 24/7 na sua VPS remota é através do Docker.

### Estrutura do `docker-compose.yml`
O arquivo `docker-compose.yml` já vem configurado com:
- Multi-stage build baseado em Alpine Linux (super leve e rápido).
- Política de reinício automático `restart: unless-stopped`.
- `init: true` para tratamento gracioso de processos filhos e sinais SIGTERM.
- Rede sem portas abertas (apenas tráfego de saída WebSocket).

### Mapeando os Workspaces
No `docker-compose.yml`, aponte os volumes para os diretórios onde seus projetos reais vivem no host da VPS:

```yaml
services:
  singularity-bridge:
    build: .
    container_name: singularity-bridge
    restart: unless-stopped
    init: true
    env_file:
      - .env
    volumes:
      # Monta seus projetos da VPS dentro do diretório /workspace do container:
      - /home/ubuntu/meus-projetos:/workspace:rw
```

E no seu `.env`, ajuste o `WORKSPACE_MAPPINGS` para refletir os caminhos internos do container:
```json
{"123456789012345678": "/workspace/projeto-alpha"}
```

### Comandos de Operação Docker

```bash
# Iniciar o daemon em segundo plano (com build)
docker compose up -d --build

# Acompanhar os logs em tempo real
docker compose logs -f

# Verificar status do container
docker compose ps

# Reiniciar o serviço
docker compose restart

# Parar o serviço
docker compose down
```

---

## 5. Dinâmica de Uso no Discord

Uma vez que o bot esteja online (você verá o status no terminal e o bot verde no Discord):

### Uso em Canais Regulares
- Entre no canal cujo ID foi cadastrado em `WORKSPACE_MAPPINGS`.
- Digite uma instrução:
  > *"Adicione validação de email no endpoint de login e rode os testes"*
- O bot ativará o indicador **"digitando..."** a cada 7 segundos enquanto a CLI roda no workspace correspondente.
- Assim que o comando finalizar, a resposta aparecerá formatada no chat.

### Uso Avançado com Threads (Recomendado)
- Abra uma nova **Thread** dentro do canal mapeado para criar uma sessão de trabalho isolada (ex: `fix-auth-tokens`).
- O Singularity automaticamente detectará o canal pai da Thread para saber em qual pasta trabalhar.
- **Histórico Inteligente:** Dentro da Thread, o bot coleta as últimas 8 mensagens *apenas daquela thread*, montando o contexto da conversa (`[User]` e `[Singularity]`). Isso permite que você continue refinando o código:
  - Mensagem 1: *"Crie a migration para a tabela users"*
  - Mensagem 2: *"Agora adicione o campo avatar_url"* (a CLI saberá o que foi feito na mensagem anterior).
- Não há vazamento de contexto entre threads irmãs!

### Gerenciamento de Saídas Longas
- **Até 1.900 caracteres:** O resultado é entregue em bloco ````bash ... ```` limpo.
- **De 1.901 a 6.000 caracteres:** O bot divide a saída em chunks consecutivos sem quebrar linhas de log no meio.
- **Mais de 6.000 caracteres:** O bot anexa o log completo em um arquivo `.txt` para download e envia um preview das últimas linhas, evitando poluir o canal no celular.

---

## 6. Resolução de Problemas (Troubleshooting)

### O bot não responde no canal
1. Verifique se o seu usuário é exatamente o `ALLOWED_USER_ID` configurado no `.env`.
2. Verifique se o ID do canal (ou canal pai da thread) consta no `WORKSPACE_MAPPINGS`.
3. Verifique se a opção **Message Content Intent** está ativada no Discord Developer Portal.

### Erro de inicialização `Malformed WORKSPACE_MAPPINGS JSON`
Certifique-se de que o valor é uma string JSON válida com aspas duplas:
```ini
WORKSPACE_MAPPINGS={"123456789012345678":"/workspace/app"}
```

### O comando CLI falha com `Command not found`
Certifique-se de que o executável especificado em `COMMAND_PREFIX_BIN` está instalado no sistema onde o daemon está rodando (ou dentro da imagem Docker, se estiver usando container).
