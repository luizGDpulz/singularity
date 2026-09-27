import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { env } from '../config/env.js';
import {
  AVAILABLE_MODELS,
  aiSettingsService,
  type PermissionMode,
  type ReasoningEffort,
} from '../services/ai-settings.service.js';
import { workspaceService } from '../services/workspace.service.js';

export const singularityCommand = new SlashCommandBuilder()
  .setName('singularity')
  .setDescription('Manage Singularity bridge workspaces, AI models, and operational settings')
  // Subcommand: info
  .addSubcommand((sub) =>
    sub
      .setName('info')
      .setDescription('View current channel workspace path, mode, and CLI configuration')
  )
  // Subcommand: config (Unified AI, effort, and permissions panel with autocomplete)
  .addSubcommand((sub) =>
    sub
      .setName('config')
      .setDescription('Configure AI model, reasoning effort, and interactive permission modes')
      .addStringOption((opt) =>
        opt
          .setName('model')
          .setDescription('Select AI model (autocomplete enabled)')
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('effort')
          .setDescription('Set reasoning effort (Low, Medium, High, Max)')
          .setRequired(false)
          .addChoices(
            { name: '⚡ Low (Ultra-fast / lightweight)', value: 'low' },
            { name: '⚖️ Medium (Balanced speed & depth)', value: 'medium' },
            { name: '🧠 High (Deep reasoning & code analysis - Recommended)', value: 'high' },
            { name: '🚀 Max (Maximum reasoning budget)', value: 'max' }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName('permissions')
          .setDescription('Execution permission mode')
          .setRequired(false)
          .addChoices(
            { name: '🟢 Auto-Approve (Autonomous / No prompt)', value: 'auto' },
            { name: '🟡 Ask First (Interactive Discord confirmation buttons)', value: 'ask' }
          )
      )
  )
  // Subcommand: map
  .addSubcommand((sub) =>
    sub
      .setName('map')
      .setDescription('Explicitly bind the current channel to an existing project directory')
      .addStringOption((opt) =>
        opt
          .setName('path')
          .setDescription('Absolute or relative directory path on the host')
          .setRequired(true)
      )
  )
  // Subcommand: unmap
  .addSubcommand((sub) =>
    sub
      .setName('unmap')
      .setDescription('Remove explicit mapping from current channel and restore auto-sandbox mode')
  )
  // Subcommand: list
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('List all configured channel-to-workspace mappings')
  );

/**
 * Handles autocomplete requests for /singularity config model:<query>.
 */
export async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (interaction.user.id !== env.allowedUserId) {
    await interaction.respond([]);
    return;
  }

  const focusedOption = interaction.options.getFocused(true);

  if (focusedOption.name === 'model') {
    const query = focusedOption.value.toLowerCase();
    const filtered = AVAILABLE_MODELS.filter(
      (m) => m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query)
    ).slice(0, 25);

    await interaction.respond(
      filtered.map((m) => ({
        name: `${m.name} (${m.id})`.slice(0, 100),
        value: m.id,
      }))
    );
  }
}

/**
 * Generates the rich interactive visual panel for AI model, reasoning effort, and permission mode.
 */
export function buildAiSettingsPanel() {
  const settings = aiSettingsService.getSettings();
  const currentModelName = aiSettingsService.getModelName();

  const permissionModeLabel =
    settings.permissionMode === 'ask'
      ? '🟡 **Pedir Confirmação no Chat** *(Botões de aprovação antes de executar)*'
      : '🟢 **Autônomo (Auto-Approve)** *(Execução imediata sem interrupções)*';

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('⚙️ Singularity — Painel de Configurações de IA & Permissões')
    .setDescription(
      'Gerencie o modelo, o esforço cognitivo do agente e as regras de confirmação de comandos no Discord.'
    )
    .addFields(
      {
        name: '🤖 Modelo Ativo',
        value: `**${currentModelName}**\n\`ID: ${settings.model}\``,
        inline: true,
      },
      {
        name: '🧠 Nível de Raciocínio (Effort)',
        value: `\`${settings.effort.toUpperCase()}\``,
        inline: true,
      },
      {
        name: '🛡️ Modo de Permissões',
        value: permissionModeLabel,
        inline: false,
      }
    )
    .setFooter({ text: 'Selecione abaixo para alternar qualquer configuração instantaneamente.' })
    .setTimestamp();

  // Select Menu 1: Models
  const modelSelect = new StringSelectMenuBuilder()
    .setCustomId('singularity_select_model')
    .setPlaceholder('Escolha um modelo de IA...')
    .addOptions(
      AVAILABLE_MODELS.map((m) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(m.name.slice(0, 100))
          .setDescription(m.description.slice(0, 100))
          .setValue(m.id)
          .setDefault(m.id === settings.model)
      )
    );

  // Select Menu 2: Reasoning Effort
  const effortSelect = new StringSelectMenuBuilder()
    .setCustomId('singularity_select_effort')
    .setPlaceholder('Escolha o nível de raciocínio (Effort)...')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('⚡ Low (Baixo / Respostas Rápidas)')
        .setDescription('Menor latência, ideal para perguntas simples')
        .setValue('low')
        .setDefault(settings.effort === 'low'),
      new StringSelectMenuOptionBuilder()
        .setLabel('⚖️ Medium (Médio / Equilibrado)')
        .setDescription('Equilíbrio padrão entre velocidade e análise')
        .setValue('medium')
        .setDefault(settings.effort === 'medium'),
      new StringSelectMenuOptionBuilder()
        .setLabel('🧠 High (Alto / Raciocínio Profundo - Recomendado)')
        .setDescription('Análise aprofundada de código, arquivos e arquitetura')
        .setValue('high')
        .setDefault(settings.effort === 'high'),
      new StringSelectMenuOptionBuilder()
        .setLabel('🚀 Max (Máximo / Capacidade Extrema)')
        .setDescription('Máximo orçamento de pensamento para tarefas complexas')
        .setValue('max')
        .setDefault(settings.effort === 'max')
    );

  // Select Menu 3: Permission Mode
  const permissionSelect = new StringSelectMenuBuilder()
    .setCustomId('singularity_select_permissions')
    .setPlaceholder('Escolha o modo de permissões de execução...')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('🟢 Autônomo (Auto-Approve)')
        .setDescription('Executa comandos diretamente sem pedir confirmação no chat')
        .setValue('auto')
        .setDefault(settings.permissionMode === 'auto'),
      new StringSelectMenuOptionBuilder()
        .setLabel('🟡 Pedir Confirmação no Chat (Ask First)')
        .setDescription('Envia botões [Aprovar] e [Cancelar] no Discord antes de rodar')
        .setValue('ask')
        .setDefault(settings.permissionMode === 'ask')
    );

  const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(modelSelect);
  const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(effortSelect);
  const row3 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(permissionSelect);

  return {
    embeds: [embed],
    components: [row1, row2, row3],
    ephemeral: true,
  };
}

/**
 * Handles interactions from the visual select menus.
 */
export async function handleAiSelectInteraction(
  interaction: StringSelectMenuInteraction
): Promise<void> {
  if (interaction.user.id !== env.allowedUserId) {
    await interaction.reply({
      content: '⛔ Acesso negado.',
      ephemeral: true,
    });
    return;
  }

  const selectedValue = interaction.values[0];
  if (!selectedValue) return;

  if (interaction.customId === 'singularity_select_model') {
    aiSettingsService.setModel(selectedValue);
  } else if (interaction.customId === 'singularity_select_effort') {
    aiSettingsService.setEffort(selectedValue as ReasoningEffort);
  } else if (interaction.customId === 'singularity_select_permissions') {
    aiSettingsService.setPermissionMode(selectedValue as PermissionMode);
  }

  // Update visual message in place
  await interaction.update(buildAiSettingsPanel());
}

/**
 * Handles /singularity slash command interactions.
 */
export async function handleSingularityCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  // 1. Strict Security Barrier
  if (interaction.user.id !== env.allowedUserId) {
    await interaction.reply({
      content: '⛔ **Access Denied:** Only the authorized owner can execute Singularity administration commands.',
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const channel = interaction.channel;

  if (!channel) {
    await interaction.reply({
      content: '❌ Unable to resolve channel for this interaction.',
      ephemeral: true,
    });
    return;
  }

  const channelId = channel.id;
  const channelName = 'name' in channel ? channel.name : channelId;

  switch (subcommand) {
    case 'config': {
      const explicitModel = interaction.options.getString('model');
      const explicitEffort = interaction.options.getString('effort') as ReasoningEffort | null;
      const explicitPermissions = interaction.options.getString('permissions') as PermissionMode | null;

      let changedSomething = false;
      if (explicitModel) {
        aiSettingsService.setModel(explicitModel);
        changedSomething = true;
      }
      if (explicitEffort) {
        aiSettingsService.setEffort(explicitEffort);
        changedSomething = true;
      }
      if (explicitPermissions) {
        aiSettingsService.setPermissionMode(explicitPermissions);
        changedSomething = true;
      }

      const panel = buildAiSettingsPanel();
      if (changedSomething) {
        await interaction.reply({
          content: '✅ **Configurações atualizadas com sucesso!**',
          ...panel,
        });
      } else {
        await interaction.reply(panel);
      }
      break;
    }

    case 'info': {
      const resolution = workspaceService.resolveWorkspace({
        id: channel.id,
        name: 'name' in channel && typeof channel.name === 'string' ? channel.name : undefined,
        parentId: 'parentId' in channel ? channel.parentId : undefined,
        isThread: () => channel.isThread(),
      });

      const modeBadge = resolution.isAutoSandbox
        ? '🤖 **Auto-Sandbox** (Criado automaticamente em `./workspaces/`)'
        : '🔗 **Projeto Mapeado Manualmente**';

      const aiSettings = aiSettingsService.getSettings();
      const permLabel =
        aiSettings.permissionMode === 'ask'
          ? '🟡 Pedir Confirmação no Chat (Ask First)'
          : '🟢 Autônomo (Auto-Approve)';

      const response = [
        '### 🌌 Singularity Channel Status',
        `• **Canal:** \`#${channelName}\` (\`${channelId}\`)`,
        `• **Modo de Workspace:** ${modeBadge}`,
        `• **Diretório Ativo:** \`${resolution.path}\``,
        `• **Modelo Ativo:** \`${aiSettingsService.getModelName()}\` (\`${aiSettings.model}\`)`,
        `• **Nível de Esforço (Effort):** \`${aiSettings.effort.toUpperCase()}\``,
        `• **Modo de Permissões:** ${permLabel}`,
        env.allowedCategoryId ? `• **Categoria Autorizada:** \`${env.allowedCategoryId}\`` : null,
      ]
        .filter(Boolean)
        .join('\n');

      await interaction.reply({ content: response, ephemeral: true });
      break;
    }

    case 'map': {
      const targetPath = interaction.options.getString('path', true).trim();
      const resolved = workspaceService.setManualMapping(channelId, targetPath);

      await interaction.reply({
        content: `✅ **Canal Mapeado com Sucesso!**\n• **Canal:** \`#${channelName}\`\n• **Diretório Vinculado:** \`${resolved}\`\n\nTodos os comandos neste canal/thread serão executados nesta pasta.`,
        ephemeral: true,
      });
      break;
    }

    case 'unmap': {
      const removed = workspaceService.removeManualMapping(channelId);
      if (removed) {
        const auto = workspaceService.resolveWorkspace({
          id: channel.id,
          name: 'name' in channel && typeof channel.name === 'string' ? channel.name : undefined,
          parentId: 'parentId' in channel ? channel.parentId : undefined,
          isThread: () => channel.isThread(),
        });
        await interaction.reply({
          content: `🔓 **Canal Desvinculado!**\nRetornou para o modo **Auto-Sandbox**.\n• **Diretório Ativo:** \`${auto.path}\``,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: `ℹ️ **O canal não estava mapeado manualmente.** Já está operando no modo Auto-Sandbox.`,
          ephemeral: true,
        });
      }
      break;
    }

    case 'list': {
      const mappings = workspaceService.listManualMappings();
      const entries = Object.entries(mappings);

      if (entries.length === 0) {
        await interaction.reply({
          content: `📁 **Nenhum mapeamento manual registrado.**\nTodos os canais na categoria operam em modo **Auto-Sandbox** (sob \`${env.autoWorkspacesRoot}\`).`,
          ephemeral: true,
        });
        return;
      }

      const formatted = entries
        .map(([cId, dir]) => `• <#${cId}> (\`${cId}\`) $\\rightarrow$ \`${dir}\``)
        .join('\n');

      await interaction.reply({
        content: `### 📋 Mapeamentos Manuais de Workspace (${entries.length})\n${formatted}\n\n*Os demais canais na categoria autorizada operam em modo Auto-Sandbox.*`,
        ephemeral: true,
      });
      break;
    }

    default:
      await interaction.reply({
        content: '❓ Subcomando desconhecido.',
        ephemeral: true,
      });
  }
}
