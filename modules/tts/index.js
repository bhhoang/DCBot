// modules/tts/index.js — thin orchestrator. Heavy logic lives in the sibling files.
const { EmbedBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const engine = require('./ttsEngine');
const { replyOrEdit } = require('./reply');
const { QueueManager } = require('./queueManager');
const { VoiceManager } = require('./voiceManager');

const TTS_TEMP_DIR = path.join(process.cwd(), 'temp', 'tts');
let ffmpegAvailable = false;
const queue = new QueueManager();
const voice = new VoiceManager();

// Module-scope orchestrator (NOT a method — called directly, not via `this`).
async function executeTTS(source, text, language) {
  if (!text) {
    return replyOrEdit(source, { content: 'Please provide text to convert to speech.' });
  }
  if (text.length > engine.MAX_INPUT_LENGTH) {
    return replyOrEdit(source, { content: `Text too long (max ${engine.MAX_INPUT_LENGTH} characters).` });
  }
  if (!ffmpegAvailable) {
    return replyOrEdit(source, { content: '⚠️ FFmpeg not found! Run `node scripts/install-voice-deps.js`.' });
  }
  if (!engine.isSupportedLanguage(language)) {
    const codes = Object.keys(engine.getSupportedLanguages()).join(', ');
    return replyOrEdit(source, { content: `Unsupported language. Supported: ${codes}` });
  }

  const member = source.member || source.author;
  const voiceChannel = member?.voice?.channel;
  if (!voiceChannel) {
    return replyOrEdit(source, { content: 'You must be in a voice channel to use this command.' });
  }

  const displayName = source.member?.displayName || source.author?.username || 'Someone';
  const announcedText = `${displayName}: ${text}`;
  const guildId = voiceChannel.guild.id;

  voice.cancelIdleDisconnect(guildId);

  // Disconnect ~10s after this guild's queue drains; a new enqueue cancels it (above).
  queue.onDrain(guildId, () => voice.scheduleIdleDisconnect(guildId));

  queue.enqueue(guildId, async () => {
    const filepath = path.join(TTS_TEMP_DIR, `tts_${Date.now()}.mp3`);
    const audio = await engine.generate(announcedText, language);
    fs.writeFileSync(filepath, audio);
    try {
      await voice.playFile(voiceChannel, filepath); // resolves when the clip finishes
    } finally {
      try { fs.unlinkSync(filepath); } catch { /* already gone */ }
    }
  });

  const names = engine.getSupportedLanguages();
  const embed = new EmbedBuilder()
    .setTitle('🔊 Text-to-Speech')
    .setDescription(`Queued message from ${displayName} in ${names[language]}`)
    .addFields({ name: 'Text', value: text.length > 1024 ? text.slice(0, 1021) + '...' : text })
    .setColor('#3498db');
  return replyOrEdit(source, { embeds: [embed] });
}

async function executeDiagnostic(source) {
  const member = source.member || source.author;
  const voiceChannel = member?.voice?.channel;
  const embed = new EmbedBuilder()
    .setTitle('🔍 TTS Diagnostic Results')
    .setColor('#3498db')
    .setTimestamp()
    .addFields(
      { name: `FFmpeg: ${ffmpegAvailable ? '✅ Available' : '❌ Not Found'}`,
        value: ffmpegAvailable ? 'FFmpeg is installed' : 'Run `node scripts/install-voice-deps.js`' },
      { name: `Voice Channel: ${voiceChannel ? '✅ Connected' : '⚠️ Not Connected'}`,
        value: voiceChannel ? `In: ${voiceChannel.name}` : 'Join a voice channel to use TTS' },
      { name: 'System', value: `Platform: ${process.platform}\nNode: ${process.version}\nVoice: ^0.19.2 (DAVE)` },
    );
  return replyOrEdit(source, { embeds: [embed] });
}

const LANGUAGE_CHOICES = Object.entries(engine.getSupportedLanguages())
  .map(([value, name]) => ({ name, value }));

module.exports = {
  meta: {
    name: 'tts',
    type: 'utility',
    version: '2.0.0',
    description: 'Convert text to speech and play in voice channel',
    dependencies: [],
  },

  async init(client, bot) {
    if (!fs.existsSync(TTS_TEMP_DIR)) fs.mkdirSync(TTS_TEMP_DIR, { recursive: true });
    ffmpegAvailable = await engine.checkFfmpeg();
    console.log(ffmpegAvailable ? '✅ TTS module initialized!' : '⚠️ TTS init: FFmpeg not found.');
  },

  async shutdown() {
    voice.cleanupAll();
    try {
      for (const f of fs.readdirSync(TTS_TEMP_DIR)) {
        if (f.endsWith('.mp3')) fs.unlinkSync(path.join(TTS_TEMP_DIR, f));
      }
    } catch { /* temp dir may not exist */ }
    console.log('TTS module shut down!');
  },

  commands: [
    {
      name: 'tts',
      description: 'Convert text to speech and play in your voice channel',
      data: {
        name: 'tts',
        description: 'Convert text to speech and play in your voice channel',
        options: [
          { name: 'text', description: 'Text to convert to speech', type: 3, required: true },
          { name: 'language', description: 'Language code (default: vi-VN)', type: 3, required: false,
            choices: LANGUAGE_CHOICES },
        ],
      },
      slash: true,
      async execute(interaction, bot) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await executeTTS(interaction, interaction.options.getString('text'),
                         interaction.options.getString('language') || 'vi-VN');
      },
      legacy: true,
      async legacyExecute(message, args, bot) {
        let text = args.join(' ');
        let language = 'vi-VN';
        if (engine.isSupportedLanguage(args[0])) { language = args[0]; text = args.slice(1).join(' '); }
        await executeTTS(message, text, language);
      },
    },
    {
      name: 'tts-diagnostic',
      description: 'Check TTS module dependencies and voice connectivity',
      data: { name: 'tts-diagnostic', description: 'Check TTS module dependencies and voice connectivity', options: [] },
      slash: true,
      async execute(interaction, bot) { await executeDiagnostic(interaction); },
      legacy: true,
      async legacyExecute(message, args, bot) { await executeDiagnostic(message); },
    },
  ],
};
