import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
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
  // Subcommand: usage (Real-time quota monitoring)
  .addSubcommand((sub) =>
    sub
      .setName('usage')
      .setDescription('View live Antigravity API quotas and rate limits (Gemini, Claude, GPT)')
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
          .setDescription('Set reasoning effort (Low, Medium, High)')
          .setRequired(false)
          .addChoices(
            { name: '⚡ Low (Ultra-fast / lightweight)', value: 'low' },
            { name: '⚖️ Medium (Balanced speed & depth)', value: 'medium' },
            { name: '🧠 High (Deep reasoning & code analysis - Recommended)', value: 'high' }
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
  // Subcommand: map (Native Discord Modal popup, Select Menu, or Autocomplete)
  .addSubcommand((sub) =>
    sub
      .setName('map')
      .setDescription('Vincular este canal a uma pasta de projeto do host ou caminho customizado')
      .addStringOption((opt) =>
        opt
          .setName('path')
          .setDescription('Selecione um projeto do host ou digite o caminho')
          .setRequired(false)
          .setAutocomplete(true)
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
 * Handles autocomplete requests for /singularity config model:<query> and /singularity map path:<query>.
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
    return;
  }

  if (focusedOption.name === 'path') {
    const query = focusedOption.value.toLowerCase();
    const projects = workspaceService.getAvailableHostProjects();
    const filtered = projects
      .filter((p) => p.name.toLowerCase().includes(query) || p.path.toLowerCase().includes(query))
      .slice(0, 25);

    await interaction.respond(
      filtered.map((p) => ({
        name: `📁 ${p.name} (${p.path})`.slice(0, 100),
        value: p.path,
      }))
    );
    return;
  }
}

/**
 * Generates the rich interactive visual panel for AI model, reasoning effort, and permission mode.
 */
export function buildAiSettingsPanel() {
  const settings = aiSettingsService.getSettings();
  const currentModelName = aiSettingsService.getModelName();
  const { visual: effortVisual, description: effortDesc } = aiSettingsService.renderEffortSlider();
  const supportedEfforts = aiSettingsService.getSupportedEfforts();

  const permissionModeLabel =
    settings.permissionMode === 'ask'
      ? '🟡 **Pedir Confirmação no Chat** *(Botões de aprovação antes de executar)*'
      : '🟢 **Autônomo (Auto-Approve)** *(Execução imediata sem interrupções)*';

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('⚙️ Singularity — Painel de Configurações de IA & Permissões')
    .setDescription(
      'Gerencie o modelo, o nível de raciocínio cognitivo e as regras de confirmação no Discord.'
    )
    .addFields(
      {
        name: '🤖 Modelo Ativo',
        value: `**${currentModelName}**\n\`ID: ${settings.model}\``,
        inline: true,
      },
      {
        name: '🧠 Raciocínio (Reasoning Effort)',
        value: `${effortVisual}\n*${effortDesc}*`,
        inline: false,
      },
      {
        name: '🛡️ Modo de Permissões',
        value: permissionModeLabel,
        inline: false,
      }
    )
    .setFooter({ text: 'Selecione o modelo acima ou use as setas ◀ ▶ para alterar o esforço estilo agy.' })
    .setTimestamp();

  // Row 1: Model Select Menu (Base models)
  const normalizedCurrent = aiSettingsService.normalizeModel(settings.model).modelId;
  const modelSelect = new StringSelectMenuBuilder()
    .setCustomId('singularity_select_model')
    .setPlaceholder('Escolha um modelo de IA...')
    .addOptions(
      AVAILABLE_MODELS.map((m) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(m.name.slice(0, 100))
          .setDescription(m.description.slice(0, 100))
          .setValue(m.id)
          .setDefault(m.id === normalizedCurrent)
      )
    );

  const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(modelSelect);

  // Row 2: Effort Stepper Buttons (◀ / ▶) + Perm Toggle + Quotas (Max 5 buttons)
  const isEffortSupported = supportedEfforts.length > 1;
  const currentIndex = supportedEfforts.indexOf(settings.effort);
  const canStepPrev = isEffortSupported && currentIndex > 0;
  const canStepNext = isEffortSupported && currentIndex >= 0 && currentIndex < supportedEfforts.length - 1;

  const prevBtn = new ButtonBuilder()
    .setCustomId('singularity_btn_effort_prev')
    .setLabel('◀ Menos')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!canStepPrev);

  const statusBtn = new ButtonBuilder()
    .setCustomId('singularity_btn_effort_status')
    .setLabel(isEffortSupported ? `🧠 ${settings.effort.toUpperCase()}` : '🔒 Fixo')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true);

  const nextBtn = new ButtonBuilder()
    .setCustomId('singularity_btn_effort_next')
    .setLabel('Mais ▶')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!canStepNext);

  const permBtn = new ButtonBuilder()
    .setCustomId('singularity_btn_perm_toggle')
    .setLabel(settings.permissionMode === 'ask' ? '🛡️ Perguntar' : '⚡ Auto')
    .setStyle(settings.permissionMode === 'ask' ? ButtonStyle.Primary : ButtonStyle.Success);

  const usageBtn = new ButtonBuilder()
    .setCustomId('singularity_btn_usage')
    .setLabel('📊 Quotas')
    .setStyle(ButtonStyle.Secondary);

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    prevBtn,
    statusBtn,
    nextBtn,
    permBtn,
    usageBtn
  );

  return {
    embeds: [embed],
    components: [row1, row2],
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
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Acknowledge interaction immediately (<50ms) to avoid Discord 3s timeout
  await interaction.deferUpdate();

  const selectedValue = interaction.values[0];
  if (selectedValue && interaction.customId === 'singularity_select_model') {
    aiSettingsService.setModel(selectedValue);
  }

  // Update visual message in place
  await interaction.editReply(buildAiSettingsPanel());
}

/**
 * Handles button interactions (Effort Stepper ◀ ▶, Permission toggle, and Quotas).
 */
export async function handleAiButtonInteraction(
  interaction: ButtonInteraction
): Promise<void> {
  if (interaction.user.id !== env.allowedUserId) {
    await interaction.reply({ content: '⛔ Acesso negado.', flags: MessageFlags.Ephemeral });
    return;
  }

  // Acknowledge interaction immediately (<50ms) to avoid Discord 3s timeout
  await interaction.deferUpdate();

  if (interaction.customId === 'singularity_btn_effort_prev') {
    aiSettingsService.stepEffort('prev');
    await interaction.editReply(buildAiSettingsPanel());
  } else if (interaction.customId === 'singularity_btn_effort_next') {
    aiSettingsService.stepEffort('next');
    await interaction.editReply(buildAiSettingsPanel());
  } else if (interaction.customId === 'singularity_btn_perm_toggle') {
    const currentMode = aiSettingsService.getSettings().permissionMode;
    aiSettingsService.setPermissionMode(currentMode === 'ask' ? 'auto' : 'ask');
    await interaction.editReply(buildAiSettingsPanel());
  } else if (interaction.customId === 'singularity_btn_usage') {
    const quotas = await aiSettingsService.fetchUsageQuota(env.commandPrefixBin);
    if (quotas.length === 0) {
      await interaction.followUp({
        content: '⚠️ Não foi possível obter as cotas do `agy` no momento.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const geminiQuotas = quotas.filter((q) => q.group.toLowerCase().includes('gemini'));
    const claudeGptQuotas = quotas.filter((q) => !q.group.toLowerCase().includes('gemini'));

    const formatQuota = (items: typeof quotas) =>
      items
        .map((item) => `• **${item.metric}:**\n  \`${aiSettingsService.renderProgressBar(item.percent)}\``)
        .join('\n');

    const quotaEmbed = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle('📊 Singularity — Quotas & Limites de Uso (Antigravity)')
      .addFields(
        { name: '🟢 Gemini Models', value: formatQuota(geminiQuotas) || 'N/A', inline: false },
        { name: '🟡 Claude & GPT Models', value: formatQuota(claudeGptQuotas) || 'N/A', inline: false }
      )
      .setTimestamp();

    await interaction.followUp({ embeds: [quotaEmbed], flags: MessageFlags.Ephemeral });
  }
}

/**
 * Handles submission of the /singularity map Modal popup.
 */
export async function handleMapModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  if (interaction.user.id !== env.allowedUserId) {
    await interaction.reply({ content: '⛔ Acesso negado.', flags: MessageFlags.Ephemeral });
    return;
  }

  const channelId = interaction.channelId;
  if (!channelId) {
    await interaction.reply({ content: '❌ Não foi possível identificar o canal.', flags: MessageFlags.Ephemeral });
    return;
  }

  const targetPath = interaction.fields.getTextInputValue('workspace_path').trim();
  const channel = interaction.channel;
  const channelName = channel && 'name' in channel ? channel.name : channelId;

  const resolved = workspaceService.setManualMapping(channelId, targetPath);

  await interaction.reply({
    content: `✅ **Workspace Mapeado com Sucesso via Modal!**\n• **Canal:** \`#${channelName}\`\n• **Diretório Vinculado:** \`${resolved}\`\n\nTodos os comandos neste canal/thread serão executados nesta pasta.`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Handles project selection from the /singularity map dropdown menu.
 */
export async function handleProjectSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (interaction.user.id !== env.allowedUserId) {
    await interaction.reply({ content: '⛔ Acesso negado.', flags: MessageFlags.Ephemeral });
    return;
  }

  const selectedPath = interaction.values[0];
  const channelId = interaction.channelId;
  const channel = interaction.channel;
  const channelName = channel && 'name' in channel ? channel.name : channelId;

  if (!selectedPath || !channelId) {
    await interaction.reply({ content: '❌ Projeto ou canal inválido.', flags: MessageFlags.Ephemeral });
    return;
  }

  const resolved = workspaceService.setManualMapping(channelId, selectedPath);

  await interaction.update({
    content: `✅ **Workspace Mapeado com Sucesso!**\n• **Canal:** <#${channelId}> (\`${channelName}\`)\n• **Diretório Vinculado:** \`${resolved}\`\n\nTodos os comandos neste canal serão executados diretamente nesta pasta do projeto.`,
    components: [],
  });
}

/**
 * Handles the "Digitar Caminho Manualmente" button to open the modal.
 */
export async function handleMapManualButton(interaction: ButtonInteraction): Promise<void> {
  if (interaction.user.id !== env.allowedUserId) {
    await interaction.reply({ content: '⛔ Acesso negado.', flags: MessageFlags.Ephemeral });
    return;
  }

  const channelId = interaction.channelId;
  const currentMapping = channelId ? workspaceService.listManualMappings()[channelId] || '' : '';

  const modal = new ModalBuilder()
    .setCustomId('singularity_map_modal')
    .setTitle('📁 Mapear Workspace do Projeto');

  const pathInput = new TextInputBuilder()
    .setCustomId('workspace_path')
    .setLabel('Caminho do Diretório (Host / VPS)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ex: /srv/src/secullum-vms ou C:/Projects/meu-app')
    .setValue(currentMapping)
    .setRequired(true);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(pathInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
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
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const channel = interaction.channel;

  if (!channel) {
    await interaction.reply({
      content: '❌ Unable to resolve channel for this interaction.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channelId = channel.id;
  const channelName = 'name' in channel ? channel.name : channelId;

  switch (subcommand) {
    case 'usage': {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const quotas = await aiSettingsService.fetchUsageQuota(env.commandPrefixBin);

      if (quotas.length === 0) {
        await interaction.editReply({
          content: '⚠️ Não foi possível obter os dados de cota no momento. Verifique se o `agy` está online.',
        });
        return;
      }

      // Group quotas by model family
      const geminiQuotas = quotas.filter((q) => q.group.toLowerCase().includes('gemini'));
      const claudeGptQuotas = quotas.filter((q) => !q.group.toLowerCase().includes('gemini'));

      const formatQuotaField = (items: typeof quotas) => {
        return items
          .map((item) => {
            const bar = aiSettingsService.renderProgressBar(item.percent);
            const resetInfo = item.resetDate ? `\n  *(Reseta em: <t:${Math.floor(new Date(item.resetDate).getTime() / 1000)}:R>)*` : '';
            return `• **${item.metric}:**\n  \`${bar}\`${resetInfo}`;
          })
          .join('\n\n');
      };

      const embed = new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle('📊 Singularity — Quotas & Limites de Uso (Antigravity)')
        .setDescription('Acompanhamento em tempo real das cotas semanais e da janela de 5 horas.')
        .setTimestamp();

      if (geminiQuotas.length > 0) {
        embed.addFields({
          name: '🟢 Gemini Models Quota',
          value: formatQuotaField(geminiQuotas),
          inline: false,
        });
      }

      if (claudeGptQuotas.length > 0) {
        embed.addFields({
          name: '🟡 Claude & GPT Models Quota',
          value: formatQuotaField(claudeGptQuotas),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
      break;
    }

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
          embeds: panel.embeds,
          components: panel.components,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          embeds: panel.embeds,
          components: panel.components,
          flags: MessageFlags.Ephemeral,
        });
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

      await interaction.reply({ content: response, flags: MessageFlags.Ephemeral });
      break;
    }

    case 'map': {
      const explicitPath = interaction.options.getString('path')?.trim();
      if (explicitPath) {
        const resolved = workspaceService.setManualMapping(channelId, explicitPath);
        await interaction.reply({
          content: `✅ **Workspace Mapeado com Sucesso!**\n• **Canal:** <#${channelId}> (\`${channelName}\`)\n• **Diretório Vinculado:** \`${resolved}\`\n\nTodos os comandos e mensagens neste canal serão executados diretamente nesta pasta do projeto.`,
          flags: MessageFlags.Ephemeral,
        });
        break;
      }

      // Check available projects in host projects folder
      const availableProjects = workspaceService.getAvailableHostProjects();

      if (availableProjects.length > 0) {
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('singularity_select_project')
          .setPlaceholder('📂 Escolha um projeto para vincular...')
          .addOptions(
            availableProjects.slice(0, 25).map((p) => ({
              label: p.name.slice(0, 100),
              description: p.path.slice(0, 100),
              value: p.path,
              emoji: '📁',
            }))
          );

        const manualBtn = new ButtonBuilder()
          .setCustomId('singularity_btn_map_manual')
          .setLabel('✏️ Digitar Caminho Manualmente')
          .setStyle(ButtonStyle.Secondary);

        const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
        const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(manualBtn);

        await interaction.reply({
          content: [
            '### 📁 Vincular Projeto a este Canal',
            `Projetos detectados no diretório host (\`${env.hostProjectsPath || '/srv/src'}\`):`,
            'Escolha um projeto na lista abaixo ou clique para digitar um caminho manual:',
          ].join('\n'),
          components: [row1, row2],
          flags: MessageFlags.Ephemeral,
        });
        break;
      }

      // If no host projects discovered, open modal directly
      const currentMapping = workspaceService.listManualMappings()[channelId] || '';

      const modal = new ModalBuilder()
        .setCustomId('singularity_map_modal')
        .setTitle('📁 Mapear Workspace do Projeto');

      const pathInput = new TextInputBuilder()
        .setCustomId('workspace_path')
        .setLabel('Caminho do Diretório (Host / VPS)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: /srv/src/secullum-vms ou C:/Projects/meu-app')
        .setValue(currentMapping)
        .setRequired(true);

      const row = new ActionRowBuilder<TextInputBuilder>().addComponents(pathInput);
      modal.addComponents(row);

      await interaction.showModal(modal);
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
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          content: `ℹ️ **O canal não estava mapeado manualmente.** Já está operando no modo Auto-Sandbox.`,
          flags: MessageFlags.Ephemeral,
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
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const formatted = entries
        .map(([cId, dir]) => `• <#${cId}> (\`${cId}\`) $\\rightarrow$ \`${dir}\``)
        .join('\n');

      await interaction.reply({
        content: `### 📋 Mapeamentos Manuais de Workspace (${entries.length})\n${formatted}\n\n*Os demais canais na categoria autorizada operam em modo Auto-Sandbox.*`,
        flags: MessageFlags.Ephemeral,
      });
      break;
    }

    default:
      await interaction.reply({
        content: '❓ Subcomando desconhecido.',
        flags: MessageFlags.Ephemeral,
      });
  }
}
