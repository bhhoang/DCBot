// modules/music/index.js
const { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource,
  entersState,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  NoSubscriberBehavior
} = require('@discordjs/voice');

const { Player } = require('discord-player');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');

// Create separate folder to avoid package conflicts
const fs = require('fs');
const path = require('path');

// Player instance
let player;

module.exports = {
  meta: {
    name: "music",
    type: "entertainment",
    version: "1.2.0",
    description: "Play music from YouTube in voice channels",
    dependencies: [],
    npmDependencies: {
      "@discordjs/voice": "^0.16.1",
      "discord-player": "^6.6.6",
      "@discord-player/extractor": "^1.14.2",
      "ffmpeg-static": "^5.2.0",
      "@discordjs/opus": "^0.9.0",
      "sodium-native": "^4.0.4",
      "libsodium-wrappers": "^0.7.13"
    }
  },

  // Module initialization
  async init(client, bot) {
    console.log("Music module initializing...");

    try {
      // First try to require the opus library directly to see if it's available
      try {
        require('@discordjs/opus');
        console.log("@discordjs/opus loaded successfully!");
      } catch (error) {
        console.warn("Could not load @discordjs/opus, will try alternatives:", error.message);
        
        try {
          require('opusscript');
          console.log("opusscript loaded successfully!");
        } catch (opusError) {
          console.warn("Could not load opusscript either:", opusError.message);
          
          // Try to install opusscript directly
          console.log("Attempting to install opusscript directly...");
          try {
            const { execSync } = require('child_process');
            const moduleDir = path.dirname(__dirname);
            execSync('npm install opusscript --no-save', { 
              cwd: moduleDir,
              stdio: 'inherit'
            });
            console.log("opusscript installed successfully!");
          } catch (installError) {
            console.error("Failed to install opusscript:", installError);
          }
        }
      }

      // Use direct voice connection instead of letting discord-player manage it
      const createDirectVoiceConnection = (voiceChannel, options = {}) => {
        return joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: voiceChannel.guild.id,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
          selfDeaf: options.selfDeaf !== false,
          selfMute: options.selfMute === true
        });
      };

      // Initialize the Player with alternate extractor options
      player = new Player(client, {
        ytdlOptions: {
          quality: 'highestaudio',
          filter: 'audioonly',
          highWaterMark: 1 << 25,
          dlChunkSize: 0
        },
        skipFFmpeg: false,
        connectionTimeout: 15000,
        useLegacyFFmpeg: true
      });

      // Create a simple queue without requiring the player's complex node system
      const queues = new Map();

      console.log("Music module initialized successfully!");
      client.player = player;
    } catch (error) {
      console.error("Failed to initialize music module:", error);
    }
  },

  // Module shutdown
  async shutdown() {
    console.log("Music module shutting down...");

    // Destroy the player if it exists
    if (player) {
      try {
        await player.destroy();
      } catch (error) {
        console.error("Error during player destruction:", error);
      }
    }

    console.log("Music module shut down successfully!");
  },

  // Commands
  commands: [
    {
      name: "play",
      description: "Play a song from YouTube",
      data: {
        name: "play",
        description: "Play a song from YouTube",
        options: [
          {
            name: "query",
            description: "The song title or URL",
            type: 3, // STRING
            required: true
          }
        ]
      },
      slash: true,
      async execute(interaction, bot) {
        await interaction.deferReply();

        const query = interaction.options.getString("query");
        const member = interaction.member;
        const channel = interaction.channel;

        try {
          // Check if the user is in a voice channel
          const voiceChannel = member.voice.channel;
          if (!voiceChannel) {
            return interaction.editReply("❌ You need to be in a voice channel to use this command!");
          }

          // Check permissions to join and speak
          const permissions = voiceChannel.permissionsFor(bot.client.user);
          if (!permissions.has(PermissionsBitField.Flags.Connect) || !permissions.has(PermissionsBitField.Flags.Speak)) {
            return interaction.editReply("❌ I need permissions to join and speak in your voice channel!");
          }

          // Use simple direct audio playing approach
          try {
            const connection = joinVoiceChannel({
              channelId: voiceChannel.id,
              guildId: voiceChannel.guild.id,
              adapterCreator: voiceChannel.guild.voiceAdapterCreator,
              selfDeaf: true
            });

            // Create a basic audio player
            const player = createAudioPlayer({
              behaviors: {
                noSubscriber: NoSubscriberBehavior.Play
              }
            });

            // Subscribe the connection to the audio player
            const subscription = connection.subscribe(player);

            // Use YouTubeSearch to get video URL
            const { spawn } = require('child_process');
            const ytSearch = spawn('youtube-dl', ['ytsearch:' + query, '--get-id', '--get-title']);

            let videoId = '';
            let videoTitle = '';

            ytSearch.stdout.on('data', (data) => {
              const info = data.toString().trim().split('\n');
              if (info.length >= 2) {
                videoId = info[0];
                videoTitle = info[1];
              }
            });

            ytSearch.on('close', async (code) => {
              if (code !== 0 || !videoId) {
                return interaction.editReply(`❌ Could not find video for: ${query}`);
              }

              const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
              
              // Create a readable stream using youtube-dl
              const ytdl = spawn('youtube-dl', [
                '-o', '-',
                '-f', 'bestaudio',
                '--audio-format', 'opus',
                videoUrl
              ]);

              // Create audio resource from the stream
              const resource = createAudioResource(ytdl.stdout);
              
              // Play the audio
              player.play(resource);
              
              const embed = new EmbedBuilder()
                .setTitle('🎵 Now Playing')
                .setDescription(`**${videoTitle}**`)
                .setColor('#2ecc71')
                .addFields(
                  { name: 'Requested by', value: interaction.user.username, inline: true }
                );
              
              await interaction.editReply({ embeds: [embed] });
            });
          } catch (error) {
            console.error("Audio playback error:", error);
            return interaction.editReply(`❌ Error playing audio: ${error.message}`);
          }
        } catch (error) {
          console.error("Play command error:", error);
          return interaction.editReply(`❌ An error occurred: ${error.message}`);
        }
      },
      
      // Legacy command support
      legacy: true,
      async legacyExecute(message, args, bot) {
        // Get the query from arguments
        const query = args.join(' ');
        if (!query) {
          return message.reply("❌ Please provide a song name or URL!");
        }
        
        const member = message.member;
        const channel = message.channel;
        
        try {
          // Check if the user is in a voice channel
          const voiceChannel = member.voice.channel;
          if (!voiceChannel) {
            return message.reply("❌ You need to be in a voice channel to use this command!");
          }
          
          // Check permissions to join and speak
          const permissions = voiceChannel.permissionsFor(bot.client.user);
          if (!permissions.has(PermissionsBitField.Flags.Connect) || !permissions.has(PermissionsBitField.Flags.Speak)) {
            return message.reply("❌ I need permissions to join and speak in your voice channel!");
          }
          
          // Create status message
          const statusMsg = await message.reply("🔍 Searching...");
          
          try {
            const connection = joinVoiceChannel({
              channelId: voiceChannel.id,
              guildId: voiceChannel.guild.id,
              adapterCreator: voiceChannel.guild.voiceAdapterCreator,
              selfDeaf: true
            });

            // Create a basic audio player
            const player = createAudioPlayer({
              behaviors: {
                noSubscriber: NoSubscriberBehavior.Play
              }
            });

            // Subscribe the connection to the audio player
            const subscription = connection.subscribe(player);

            // Use YouTubeSearch to get video URL
            const { spawn } = require('child_process');
            const ytSearch = spawn('youtube-dl', ['ytsearch:' + query, '--get-id', '--get-title']);

            let videoId = '';
            let videoTitle = '';

            ytSearch.stdout.on('data', (data) => {
              const info = data.toString().trim().split('\n');
              if (info.length >= 2) {
                videoId = info[0];
                videoTitle = info[1];
              }
            });

            ytSearch.on('close', async (code) => {
              if (code !== 0 || !videoId) {
                return statusMsg.edit(`❌ Could not find video for: ${query}`);
              }

              const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
              
              // Create a readable stream using youtube-dl
              const ytdl = spawn('youtube-dl', [
                '-o', '-',
                '-f', 'bestaudio',
                '--audio-format', 'opus',
                videoUrl
              ]);

              // Create audio resource from the stream
              const resource = createAudioResource(ytdl.stdout);
              
              // Play the audio
              player.play(resource);
              
              const embed = new EmbedBuilder()
                .setTitle('🎵 Now Playing')
                .setDescription(`**${videoTitle}**`)
                .setColor('#2ecc71')
                .addFields(
                  { name: 'Requested by', value: message.author.username, inline: true }
                );
              
              await statusMsg.edit({ content: null, embeds: [embed] });
            });
          } catch (error) {
            console.error("Audio playback error:", error);
            return statusMsg.edit(`❌ Error playing audio: ${error.message}`);
          }
        } catch (error) {
          console.error("Play command error:", error);
          return message.reply(`❌ An error occurred: ${error.message}`);
        }
      }
    },
    
    {
      name: "stop",
      description: "Stop playback and leave the voice channel",
      data: {
        name: "stop",
        description: "Stop playback and leave the voice channel"
      },
      slash: true,
      async execute(interaction, bot) {
        try {
          const member = interaction.member;
          const guild = interaction.guild;
          
          // Check if the bot is in a voice channel
          const voiceConnection = getVoiceConnection(guild.id);
          if (!voiceConnection) {
            return interaction.reply("❌ I'm not currently in a voice channel!");
          }
          
          // Check if user is in the same voice channel
          if (!member.voice.channel || member.voice.channelId !== voiceConnection.joinConfig.channelId) {
            return interaction.reply("❌ You need to be in the same voice channel to stop playback!");
          }
          
          // Destroy the connection
          voiceConnection.destroy();
          
          return interaction.reply("⏹️ Stopped playback and left the voice channel.");
        } catch (error) {
          console.error("Stop command error:", error);
          return interaction.reply(`❌ An error occurred: ${error.message}`);
        }
      },
      
      // Legacy command
      legacy: true,
      async legacyExecute(message, args, bot) {
        try {
          const member = message.member;
          const guild = message.guild;
          
          // Check if the bot is in a voice channel
          const voiceConnection = getVoiceConnection(guild.id);
          if (!voiceConnection) {
            return message.reply("❌ I'm not currently in a voice channel!");
          }
          
          // Check if user is in the same voice channel
          if (!member.voice.channel || member.voice.channelId !== voiceConnection.joinConfig.channelId) {
            return message.reply("❌ You need to be in the same voice channel to stop playback!");
          }
          
          // Destroy the connection
          voiceConnection.destroy();
          
          return message.reply("⏹️ Stopped playback and left the voice channel.");
        } catch (error) {
          console.error("Stop command error:", error);
          return message.reply(`❌ An error occurred: ${error.message}`);
        }
      }
    }
  ]
};