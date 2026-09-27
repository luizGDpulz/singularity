# 🤖 Guia: Como Criar e Configurar o Bot no Discord

Este guia passo a passo ensina como registrar uma aplicação no portal de desenvolvedores do Discord, habilitar as permissões e intents obrigatórias e coletar as credenciais necessárias para rodar o **Singularity**.

---

## Índice

1. [Criando a Aplicação](#1-criando-a-aplicação)
2. [Configurando o Bot e Gerando o Token](#2-configurando-o-bot-e-gerando-o-token)
3. [Habilitando Privileged Gateway Intents (Crítico)](#3-habilitando-privileged-gateway-intents-crítico)
4. [Configurando Permissões e Convidando o Bot](#4-configurando-permissões-e-convidando-o-bot)
5. [Coletando IDs (Developer Mode)](#5-coletando-ids-developer-mode)
6. [Resumo das Credenciais para o `.env`](#6-resumo-das-credenciais-para-o-env)

---

## 1. Criando a Aplicação

1. Acesse o [Discord Developer Portal](https://discord.com/developers/applications).
2. Faça login com sua conta do Discord.
3. No canto superior direito, clique em **New Application**.
4. Defina um nome (ex: `Singularity` ou `Singularity Bridge`) e confirme.

---

## 2. Configurando o Bot e Gerando o Token

1. No menu lateral esquerdo, clique na aba **Bot**.
2. Personalize o nome de exibição e adicione um avatar se desejar.
3. Na seção de autenticação, clique no botão **Reset Token** (ou **View Token**).
4. **Copie e guarde o Token gerado em um local seguro.**
   > ⚠️ **Atenção:** Nunca compartilhe nem suba este token para repositórios públicos. Ele concede acesso total ao seu bot. Esse valor será o seu `DISCORD_TOKEN`.

---

## 3. Habilitando Privileged Gateway Intents (Crítico)

O Singularity atua como um ouvinte ambiente em canais e threads. Para ler o conteúdo das mensagens e resgatar o histórico da conversa, o Discord exige autorização expressa:

1. Na mesma página **Bot**, role para baixo até a seção **Privileged Gateway Intents**.
2. Ative a chave:
   - ✅ **Message Content Intent** (Obrigatório para ler o texto enviado).
3. Opcionalmente, ative também:
   - ✅ **Server Members Intent** (Recomendado).
4. Clique em **Save Changes** na barra verde inferior.

---

## 4. Configurando Permissões e Convidando o Bot

1. No menu lateral, acesse **OAuth2** $\rightarrow$ **URL Generator**.
2. Na caixa **Scopes**, marque:
   - ✅ `bot`
   - ✅ `applications.commands` (Obrigatório para habilitar comandos slash como `/singularity`).
3. Na caixa **Bot Permissions** que se abre abaixo, selecione as seguintes permissões:
   - ✅ **View Channels** (`Visualizar canais`)
   - ✅ **Send Messages** (`Enviar mensagens`)
   - ✅ **Send Messages in Threads** (`Enviar mensagens em tópicos/threads`)
   - ✅ **Read Message History** (`Ler histórico de mensagens`)
   - ✅ **Attach Files** (`Anexar arquivos` — essencial para logs longos $> 6000$ caracteres)
4. No final da página, copie a **Generated URL**.
5. Cole essa URL no seu navegador, selecione o seu servidor privado do Discord e conclua a autorização.

---

## 5. Coletando IDs (Developer Mode)

O Singularity utiliza um modelo de segurança *Zero-Trust*, respondendo exclusivamente ao seu usuário e apenas em canais autorizados. Para obter os identificadores (Snowflakes):

### Ativando o Modo Desenvolvedor:
1. No seu aplicativo do Discord (Desktop ou Mobile), abra as **Configurações de Usuário** (ícone de engrenagem).
2. Vá em **Avançado** (na aba *Configurações do Aplicativo*).
3. Ative a opção **Modo Desenvolvedor** (*Developer Mode*).

### Pegando o seu `ALLOWED_USER_ID`:
1. Clique com o botão direito no seu próprio perfil (ou no seu avatar no chat).
2. Clique em **Copiar ID de Usuário** (*Copy User ID*).
3. Este número longo (ex: `123456789012345678`) é o seu `ALLOWED_USER_ID`.

### Pegando o ID da Categoria para `ALLOWED_CATEGORY_ID` (Recomendado - Modo Auto-Sandbox):
1. Crie uma categoria no seu servidor (ex: `✨Ai Chat` ou `Projetos`).
2. Clique com o botão direito sobre o título da categoria e selecione **Copiar ID da Categoria** (*Copy Category ID*).
3. Qualquer canal ou thread criado dentro desta categoria terá auto-sandbox gerado automaticamente em `./workspaces/<nome-do-canal>`, sem necessidade de configuração prévia.

### Pegando os IDs dos Canais para `WORKSPACE_MAPPINGS` (Projetos Pré-Existentes):
1. Se você tem pastas fixas no host que deseja vincular a canais específicos, clique com o botão direito sobre o canal e selecione **Copiar ID do Canal** (*Copy Channel ID*).
2. Este ID será a chave no JSON de mapeamento apontando para a pasta física do projeto na sua máquina ou VPS.

---

## 6. Resumo das Credenciais para o `.env`

Com as informações coletadas, preencha o seu arquivo `.env`:

```ini
# Token obtido na aba Bot
DISCORD_TOKEN=MTE5OTk4NzY1NDMyMTA5ODc2NQ.GxYz...

# Seu Snowflake ID pessoal
ALLOWED_USER_ID=123456789012345678

# (Recomendado) Categoria onde todos os novos chats criam workspaces automáticos
ALLOWED_CATEGORY_ID=987654321098765432

# Mapeamentos fixos opcionais (ID do canal -> Pasta absoluta do host)
WORKSPACE_MAPPINGS={"123456789012345678":"/workspace/project-alpha"}

# Comando padrão a executar no workspace (ou agy -p)
COMMAND_PREFIX_BIN=agy -p
```

Pronto! Seu bot está registrado, autorizado e pronto para ser conectado ao daemon do Singularity.
