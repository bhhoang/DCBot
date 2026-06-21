// modules/music/commands/providers.js — /providers slash command. Lists every
// music extractor currently registered with the player, with each one's
// credential requirements. Useful for operators verifying multi-provider
// support without reading the bot's boot logs.
const { EmbedBuilder, MessageFlags } = require('discord.js');
const player = require('../player');

function providersCommand() {
  return {
    name: 'providers',
    description: 'List music providers and their credential status',
    data: { name: 'providers', description: 'List music providers and their credential status', options: [] },
    slash: true,
    cooldown: 5,
    permissions: ['@everyone'],
    async execute(interaction) {
      const list = player.listProviders();
      if (!list.length) {
        return interaction.reply({ content: '❌ No providers loaded — music module may not be initialized.', flags: MessageFlags.Ephemeral });
      }
      const lines = list.map((p) => {
        const status = p.needsCredentials ? '⚠️ Needs credentials' : '✅ Ready';
        const note = p.note ? `\n   ${p.note}` : '';
        return `**${p.label}** — ${status}${note}`;
      });
      const embed = new EmbedBuilder()
        .setTitle('🎵 Music providers')
        .setDescription(lines.join('\n'))
        .setColor(0x1DB954) // Spotify green, theme-neutral
        .setFooter({ text: 'Use /play <query or URL> — URLs from these providers are auto-detected.' });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },
    legacy: true,
    async legacyExecute(message) {
      const list = player.listProviders();
      if (!list.length) {
        return message.reply('❌ No providers loaded — music module may not be initialized.');
      }
      const lines = list.map((p) => {
        const status = p.needsCredentials ? '⚠️ Needs credentials' : '✅ Ready';
        const note = p.note ? `\n   ${p.note}` : '';
        return `**${p.label}** — ${status}${note}`;
      });
      const embed = new EmbedBuilder()
        .setTitle('🎵 Music providers')
        .setDescription(lines.join('\n'))
        .setColor(0x1DB954)
        .setFooter({ text: 'Use !play <query or URL> — URLs from these providers are auto-detected.' });
      return message.reply({ embeds: [embed] });
    },
  };
}

module.exports = { getCommand: providersCommand };
