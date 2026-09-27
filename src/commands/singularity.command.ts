import {
  ActionRowBuilder,
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
  // Subcommand: model (Interactive Model & Effort Panel)
  .addSubcommand((sub) =>
    sub
      .setName('model')
      .setDescription('Open the visual AI Model and Reasoning Effort management panel')
      .addStringOption((opt) =>
        opt
          .setName('set')
          .setDescription('Directly set the active model ID')
          .setRequired(false)
          .addChoices(
            ...AVAILABLE_MODELS.slice(0, 25).map((m) => ({
              name: `${m.name} (${m.id})`.slice(0, 100),
              value: m.id,
            }))
          )
      )
  )
  // Subcommand: effort (Quick Effort Switch)
  .addSubcommand((sub) =>
    sub
      .setName('effort')
      .setDescription('Configure AI reasoning effort level (Low, Medium, High, Max)')
      .addStringOption((opt) =>
        opt
          .setName('level')
          .setDescription('Target reasoning effort')
          .setRequired(true)
          .addChoices(
            { name: '⚡ Low (Ultra-fast / lightweight)', value: 'low' },
            { name: '⚖️ Medium (Balanced speed & depth)', value: 'medium' },
            { name: '🧠 High (Deep reasoning & code analysis - Recommended)', value: 'high' },
            { name: '🚀 Max (Maximum reasoning budget)', value: 'max' }
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
 * Generates the rich interactive visual panel for AI model and reasoning effort.
 */
export function buildAiSettingsPanel() {
  const settings = aiSettingsService.getSettings();
  const currentModelName = aiSettingsService.getModelName();

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🧠 Singularity — Gestão de Modelo de IA & Raciocínio')
    .setDescription(
      'Configure o modelo de inteligência artificial e o orçamento de raciocínio lógico utilizados pelo **Antigravity CLI** nas execuções deste bridge.'
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
        name: '🔓 Permissões Headless',
        value: '`Auto-Aprovadas (--dangerously-skip-permissions)`',
        inline: false,
      }
    )
    .setFooter({ text: 'Selecione abaixo para alternar instantaneamente.' })
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
        .setDescription('Menor tempo de latência, ideal para perguntas simples')
        .setValue('low')
        .setDefault(settings.effort === 'low'),
      new StringSelectMenuOptionBuilder()
        .setLabel('⚖️ Medium (Médio / Equilibrado)')
        .setDescription('Equilíbrio ótimo entre velocidade e análise')
        .setValue('medium')
        .setDefault(settings.effort === 'medium'),
      new StringSelectMenuOptionBuilder()
        .setLabel('🧠 High (Alto / Raciocínio Profundo - Recomendado)')
        .setDescription('Análise detalhada de código, arquivos e arquitetura')
        .setValue('high')
        .setDefault(settings.effort === 'high'),
      new StringSelectMenuOptionBuilder()
        .setLabel('🚀 Max (Máximo / Capacidade Extrema)')
        .setDescription('Máximo orçamento de pensamento para refatorações pesadas')
        .setValue('max')
        .setDefault(settings.effort === 'max')
    );

  const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(modelSelect);
  const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(effortSelect);

  return {
    embeds: [embed],
    components: [row1, row2],
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
    case 'model': {
      const explicitModel = interaction.options.getString('set');
      if (explicitModel) {
        aiSettingsService.setModel(explicitModel);
      }
      const panel = buildAiSettingsPanel();
      await interaction.reply(panel);
      break;
    }

    case 'effort': {
      const effortLevel = interaction.options.getString('level', true) as ReasoningEffort;
      aiSettingsService.setEffort(effortLevel);
      await interaction.reply({
        content: `🧠 **Reasoning Effort atualizado para:** \`${effortLevel.toUpperCase()}\``,
        ephemeral: true,
      });
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

      const response = [
        '### 🌌 Singularity Channel Status',
        `• **Canal:** \`#${channelName}\` (\`${channelId}\`)`,
        `• **Modo de Workspace:** ${modeBadge}`,
        `• **Diretório Ativo:** \`${resolution.path}\``,
        `• **Modelo Ativo:** \`${aiSettingsService.getModelName()}\` (\`${aiSettings.model}\`)`,
        `• **Nível de Esforço (Effort):** \`${aiSettings.effort.toUpperCase()}\``,
        `• **Permissões Headless:** \`--dangerously-skip-permissions\` ✅`,
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
