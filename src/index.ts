import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  ComponentType,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  Message,
  MessageFlags,
  Partials,
} from 'discord.js';
import { env } from './config/env.js';
import { discordService } from './services/discord.service.js';
import { runnerService } from './services/runner.service.js';
import { workspaceService } from './services/workspace.service.js';
import { aiSettingsService } from './services/ai-settings.service.js';
import {
  handleAiButtonInteraction,
  handleAiSelectInteraction,
  handleAutocomplete,
  handleMapModalSubmit,
  handleSingularityCommand,
  singularityCommand,
} from './commands/singularity.command.js';

console.log('🌌 [Singularity] Initializing daemon bridge...');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log('================================================================================');
  console.log(`🚀 [Singularity] Bridge is active and listening as ${readyClient.user.tag}`);
  console.log(`🔒 [Security] Authorized User ID: ${env.allowedUserId}`);
  if (env.allowedCategoryId) {
    console.log(`📁 [Category Restriction] Active Category ID: ${env.allowedCategoryId}`);
  }
  console.log(`⚡ [Command Prefix] "${env.commandPrefixBin}"`);

  // Register /singularity slash commands instantly across all connected guilds
  for (const guild of readyClient.guilds.cache.values()) {
    try {
      await guild.commands.set([singularityCommand]);
      console.log(`⚡ [Slash Commands] Registered /singularity for guild: "${guild.name}"`);
    } catch (err) {
      console.error(`⚠️ [Slash Commands] Failed to register commands for guild "${guild.name}":`, err);
    }
  }
  console.log('================================================================================');
});

// Slash Command, Autocomplete, and Component Dispatcher
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete() && interaction.commandName === 'singularity') {
      await handleAutocomplete(interaction);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'singularity') {
      await handleSingularityCommand(interaction);
    } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('singularity_select_')) {
      await handleAiSelectInteraction(interaction);
    } else if (interaction.isButton() && interaction.customId.startsWith('singularity_btn_')) {
      await handleAiButtonInteraction(interaction);
    } else if (
      interaction.isButton() &&
      (interaction.customId === 'confirm_exec' || interaction.customId === 'cancel_exec')
    ) {
      if (interaction.user.id !== env.allowedUserId) {
        await interaction.reply({
          content: '⛔ Apenas o proprietário autorizado pode aprovar ou cancelar execuções.',
          flags: MessageFlags.Ephemeral,
        });
      }
      // Note: Authorized user clicks are collected by promptMsg.awaitMessageComponent
    } else if (interaction.isModalSubmit() && interaction.customId === 'singularity_map_modal') {
      await handleMapModalSubmit(interaction);
    }
  } catch (err) {
    console.error('❌ [Interaction Error]', err);
    try {
      if (interaction.isRepliable()) {
        const errorMsg = '🚨 Ocorreu um erro ao processar a interação.';
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMsg, flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: errorMsg, flags: MessageFlags.Ephemeral });
        }
      }
    } catch {
      // Ignore secondary error if unable to respond to interaction
    }
  }
});

// Automatic synchronization of folder names on channel rename in Discord
client.on(Events.ChannelUpdate, (oldChannel, newChannel) => {
  if ('name' in oldChannel && 'name' in newChannel && oldChannel.name !== newChannel.name) {
    workspaceService.handleChannelRename(newChannel.id, oldChannel.name, newChannel.name);
  }
});

client.on(Events.ThreadUpdate, (oldThread, newThread) => {
  if (oldThread.name !== newThread.name) {
    workspaceService.handleChannelRename(newThread.id, oldThread.name, newThread.name);
  }
});

// Ambient Message Listener
client.on(Events.MessageCreate, async (message) => {
  try {
    // 1. Hard Security Barrier: Drop all bot messages
    if (message.author.bot) {
      return;
    }

    // 2. Hard Security Barrier: Drop any user that is not the ALLOWED_USER_ID
    if (message.author.id !== env.allowedUserId) {
      return;
    }

    // 3. Drop empty messages or system notifications
    const rawContent = message.content?.trim();
    if (!rawContent) {
      return;
    }

    if (!client.user) {
      return;
    }

    // 4. Resolve workspace, category restrictions, thread parent hierarchy, and conversational history
    const context = await discordService.resolveContext(message, client.user.id);
    if (!context) {
      // Channel is outside the allowed category or unmapped; ignore quietly
      return;
    }

    const modeLabel = context.isAutoSandbox ? 'Auto-Sandbox' : 'Mapped Project';
    console.log(
      `📥 [Inbound Task] Channel: #${context.channelName} (${context.channelId}) | Mode: ${modeLabel} | Workspace: ${context.targetWorkspace}`
    );

    // 5. Interactive Permission Check (if permissionMode is 'ask')
    const aiSettings = aiSettingsService.getSettings();
    let promptMsg: Message | null = null;

    if (aiSettings.permissionMode === 'ask') {
      const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_exec')
          .setLabel('Aprovar e Executar')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId('cancel_exec')
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('✖️')
      );

      const promptPreview = rawContent.length > 200 ? `${rawContent.slice(0, 197)}...` : rawContent;
      const confirmEmbed = new EmbedBuilder()
        .setColor(0xeab308)
        .setTitle('🛡️ Solicitação de Execução no Workspace')
        .setDescription(`**Prompt:**\n> ${promptPreview}`)
        .addFields(
          { name: '📁 Workspace', value: `\`${context.targetWorkspace}\``, inline: true },
          {
            name: '🤖 Modelo / Raciocínio',
            value: `\`${aiSettingsService.getModelName()}\` ${
              aiSettingsService.getSupportedEfforts().length > 0
                ? `(\`${aiSettings.effort.toUpperCase()}\`)`
                : '*(Extended Thinking)*'
            }`,
            inline: true,
          }
        )
        .setFooter({ text: 'Aguardando sua confirmação (expira em 60s)...' });

      promptMsg = await message.reply({
        embeds: [confirmEmbed],
        components: [confirmRow],
      });

      try {
        const confirmation = await promptMsg.awaitMessageComponent({
          filter: (i) => i.user.id === env.allowedUserId,
          componentType: ComponentType.Button,
          time: 60000,
        });

        // 1. Immediately acknowledge interaction to Discord Gateway to prevent 3s timeout
        await confirmation.deferUpdate();

        if (confirmation.customId === 'cancel_exec') {
          await promptMsg.edit({
            content: '❌ **Execução cancelada por você.**',
            embeds: [],
            components: [],
          });
          return;
        }

        // Approved! Update prompt message
        await promptMsg.edit({
          content: '⏳ **Execução aprovada! Processando...**',
          embeds: [],
          components: [],
        });
      } catch {
        // Timed out or expired
        await promptMsg.edit({
          content: '⏱️ **Tempo de confirmação expirado.** Tarefa cancelada.',
          embeds: [],
          components: [],
        }).catch(() => {});
        return;
      }
    }

    // 6. Execute task through the runner engine
    const result = await runnerService.runTask({
      channel: message.channel,
      prompt: context.aggregatedPrompt,
      targetWorkspace: context.targetWorkspace,
    });

    // 7. Update confirmation prompt card status if interactive approval was used
    if (promptMsg) {
      const durationSeconds = (result.durationMs / 1000).toFixed(1);
      if (result.failed) {
        await promptMsg
          .edit({
            content: `❌ **Falha na execução** (${durationSeconds}s)`,
            embeds: [],
            components: [],
          })
          .catch(() => {});
      } else {
        await promptMsg
          .edit({
            content: `⚡ **Executado em ${durationSeconds}s** (\`${context.targetWorkspace}\`)`,
            embeds: [],
            components: [],
          })
          .catch(() => {});
      }
    }

    // 8. Deliver output back to the specific thread or channel
    if (result.failed) {
      const header = runnerService.formatHeader(result, context.targetWorkspace);
      const content = result.stderr || result.stdout || '[Process exited with an error]';
      await discordService.sendExecutionOutput(message.channel, content, {
        isError: true,
        header,
      });
    } else {
      const content = result.stdout || result.stderr || '[No output produced by process]';
      await discordService.sendExecutionOutput(message.channel, content, {
        isError: false,
      });
    }

    console.log(
      `📤 [Task Complete] Succeeded: ${!result.failed} | Duration: ${(result.durationMs / 1000).toFixed(1)}s`
    );
  } catch (error) {
    console.error('❌ [Error] Unhandled exception during message processing:', error);
    try {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await message.channel.send(`🚨 **[Singularity Internal Error]** \`${errorMessage}\``);
    } catch {
      // Ignore secondary error if unable to send message back to Discord
    }
  }
});

client.on(Events.Error, (error) => {
  console.error('🚨 [Discord Gateway Error]', error);
});

// Graceful shutdown handling
const shutdown = (signal: string) => {
  console.log(`\n🛑 [Singularity] Received ${signal}. Shutting down cleanly...`);
  client.destroy();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Connect to Discord Gateway
client.login(env.discordToken).catch((err) => {
  console.error('🚨 [Singularity Fatal] Failed to authenticate with Discord Gateway:', err);
  process.exit(1);
});
