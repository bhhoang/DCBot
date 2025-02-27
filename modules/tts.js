// modules/tts.js
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { createAudioPlayer, createAudioResource, joinVoiceChannel, AudioPlayerStatus, 
        VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const googleTTS = require('google-tts-api');
const { exec } = require('child_process');
// Explicitly require and handle sodium
let sodium;
try {
  sodium = require('libsodium-wrappers');
} catch (e) {
  console.error("Could not load libsodium-wrappers:", e.message);
}

// Add flag to track FFmpeg availability
let ffmpegAvailable = false;
// Add flag to track sodium availability
let sodiumReady = false;

module.exports = {
  meta: {
    name: "tts",
    type: "utility",
    version: "1.0.0",
    description: "Convert text to speech and play in voice channel",
    dependencies: [],
    npmDependencies: {
      'google-tts-api': '^2.0.2',
      '@discordjs/voice': '^0.16.1',
      'axios': '^0.21.1',
      'libsodium-wrappers': '^0.7.11',  // Add encryption package for voice
      'ffmpeg-static': '^5.2.0'  // Add static FFmpeg executable
    }
  },
  
  // Module initialization
  async init(client, bot) {
    // Ensure TTS temp directory exists
    const ttsTempDir = path.join(process.cwd(), 'temp', 'tts');
    if (!fs.existsSync(ttsTempDir)) {
      fs.mkdirSync(ttsTempDir, { recursive: true });
    }
    
    // Initialize sodium (required for voice)
    if (sodium) {
      console.log("Initializing sodium for voice encryption...");
      try {
        await sodium.ready;
        sodiumReady = true;
        console.log("✅ Sodium initialized successfully!");
      } catch (error) {
        console.error("Failed to initialize sodium:", error);
      }
    } else {
      console.warn("⚠️ libsodium-wrappers not found. Voice functionality will be limited.");
      console.warn("Please run 'node scripts/install-voice-deps.js' to install the required dependency.");
    }
    
    // Check for FFmpeg installation (using ffmpeg-static as fallback)
    this.checkForFFmpeg();
    
    console.log("TTS module initialized!");
  },
  
  // Check if FFmpeg is installed
  checkForFFmpeg() {
    // Try to use ffmpeg-static first
    try {
      const ffmpegStatic = require('ffmpeg-static');
      if (ffmpegStatic) {
        console.log('✅ FFmpeg static found:', ffmpegStatic);
        ffmpegAvailable = true;
        return;
      }
    } catch (err) {
      console.warn('FFmpeg static not found, checking system FFmpeg...');
    }
    
    // Fall back to system FFmpeg
    exec('ffmpeg -version', (error, stdout, stderr) => {
      if (error) {
        console.warn('⚠️ FFmpeg not found! TTS functionality will be limited.');
        console.warn('Please install FFmpeg or run "node scripts/install-voice-deps.js"');
        ffmpegAvailable = false;
      } else {
        console.log('✅ System FFmpeg detected. TTS module ready.');
        ffmpegAvailable = true;
      }
    });
  },
  
  // Module shutdown
  async shutdown() {
    // Clean up any existing TTS files
    const ttsTempDir = path.join(process.cwd(), 'temp', 'tts');
    try {
      const files = fs.readdirSync(ttsTempDir);
      files.forEach(file => {
        if (file.endsWith('.mp3')) {
          fs.unlinkSync(path.join(ttsTempDir, file));
        }
      });
    } catch (error) {
      console.error("Error cleaning up TTS files:", error);
    }
    console.log("TTS module shut down!");
  },
  
  // Commands
  commands: [
    {
      name: "tts",
      description: "Convert text to speech and play in your voice channel",
      data: {
        name: "tts",
        description: "Convert text to speech and play in your voice channel",
        options: [
          {
            name: "text",
            description: "Text to convert to speech",
            type: 3, // STRING
            required: true
          },
          {
            name: "language",
            description: "Language code (default: vi-VN)",
            type: 3,
            required: false,
            choices: [
              { name: "English (US)", value: "en-US" },
              { name: "Vietnamese", value: "vi-VN" },
              { name: "French", value: "fr-FR" },
              { name: "Spanish", value: "es-ES" },
              { name: "German", value: "de-DE" },
              { name: "Chinese (Mandarin)", value: "zh-CN" }
            ]
          }
        ]
      },
      slash: true,
      async execute(interaction, bot) {
        await this.executeTTS(interaction, interaction.options.getString("text"), 
                               interaction.options.getString("language") || "vi-VN");
      },
      
      // Legacy command
      legacy: true,
      async legacyExecute(message, args, bot) {
        // Check if language is specified
        let text = args.join(' ');
        let language = 'en-US';
        
        // Check if first argument is a language code
        const languageCodes = ['en-US', 'vi-VN', 'fr-FR', 'es-ES', 'de-DE', 'zh-CN'];
        if (languageCodes.includes(args[0])) {
          language = args[0];
          text = args.slice(1).join(' ');
        }
        
        await this.executeTTS(message, text, language);
      },
      
      /**
       * Execute TTS functionality
       * @param {Object} source - Interaction or Message object
       * @param {string} text - Text to convert to speech
       * @param {string} language - Language code
       */
      async executeTTS(source, text, language) {
        // Validate input
        if (!text) {
          return source.reply({
            content: "Please provide text to convert to speech.",
            ephemeral: true
          });
        }
        
        // Check if FFmpeg is available
        if (!ffmpegAvailable) {
          return source.reply({
            content: "⚠️ FFmpeg not found! Please run `node scripts/install-voice-deps.js` to install the required dependencies.",
            ephemeral: true
          });
        }
        
        // Check if sodium is ready
        if (!sodiumReady) {
          return source.reply({
            content: "⚠️ Voice encryption not available. Please run `node scripts/install-voice-deps.js` to install the required dependencies.",
            ephemeral: true
          });
        }
        
        // Get the username of the person who executed the command
        let username;
        if (source.member) {
          // Prefer nickname over username if available
          username = source.member.nickname || source.user?.username || source.author?.username || "Someone";
        } else {
          username = source.author?.username || "Someone";
        }
        
        // Modify the text to include who's speaking
        const announcedText = `${username}: ${text}`;
        
        // Validate language
        const supportedLanguages = ['en-US', 'vi-VN', 'fr-FR', 'es-ES', 'de-DE', 'zh-CN'];
        if (!supportedLanguages.includes(language)) {
          return source.reply({
            content: `Unsupported language. Supported languages are: ${supportedLanguages.join(', ')}`,
            ephemeral: true
          });
        }
        
        // Check if user is in a voice channel
        const member = source.member || source.author;
        const voiceChannel = member.voice.channel;
        
        if (!voiceChannel) {
          return source.reply({
            content: "You must be in a voice channel to use this command.",
            ephemeral: true
          });
        }
        
        // Create TTS file
        const ttsTempDir = path.join(process.cwd(), 'temp', 'tts');
        const filename = `tts_${Date.now()}.mp3`;
        const filepath = path.join(ttsTempDir, filename);
        
        try {
          // Set up language and split text if too long
          const maxLength = 200; // Max characters for Google TTS
          const chunks = [];
          
          // Split long text into chunks
          if (announcedText.length > maxLength) {
            const sentences = announcedText.match(/[^\.!\?]+[\.!\?]+/g) || [announcedText];
            let currentChunk = '';
            
            for (const sentence of sentences) {
              if ((currentChunk + sentence).length > maxLength) {
                chunks.push(currentChunk.trim());
                currentChunk = sentence;
              } else {
                currentChunk += sentence;
              }
            }
            
            if (currentChunk) {
              chunks.push(currentChunk.trim());
            }
          } else {
            chunks.push(announcedText);
          }
          
          // Generate audio for all chunks
          const audioChunks = [];
          for (const chunk of chunks) {
            const audioUrl = googleTTS.getAudioUrl(chunk, {
              lang: language,
              slow: false,
              host: 'https://translate.google.com'
            });
            
            const response = await axios({
              method: 'get',
              url: audioUrl,
              responseType: 'arraybuffer'
            });
            
            audioChunks.push(response.data);
          }
          
          // Combine and save audio chunks
          const combinedBuffer = Buffer.concat(audioChunks);
          fs.writeFileSync(filepath, combinedBuffer);
          
          // Join voice channel with proper connection handling
        //   console.log(`Joining voice channel ${voiceChannel.name} (${voiceChannel.id})`);
          
          const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
          });
          
          // Wait for connection to be ready before continuing
          try {
            // Set a timeout of 30 seconds for the connection
            await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
            // console.log("Voice connection is ready!");
          } catch (error) {
            // Destroy connection if we time out or have an error
            connection.destroy();
            throw new Error(`Failed to join voice channel: ${error.message}`);
          }
          
          // Set up connection error handling
          connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
            try {
              // Try to reconnect if we get disconnected
              await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
              ]);
            } catch (error) {
              // Destroy connection if we can't reconnect
              connection.destroy();
            }
          });
          
          // Create audio player
          const player = createAudioPlayer();
          connection.subscribe(player);
          
          // Play the audio once connection is confirmed ready
          const resource = createAudioResource(filepath);
          player.play(resource);
          console.log("Started playing audio");
          
          // Handle playback completion
          player.once(AudioPlayerStatus.Idle, () => {
            console.log("Playback completed");
            // Clean up the file
            try {
              fs.unlinkSync(filepath);
            } catch (err) {
              console.error("Error deleting TTS file:", err);
            }
            
            // Disconnect from voice channel
            setTimeout(() => {
              connection.destroy();
              console.log("Voice connection destroyed");
            }, 1000*60); // Small delay to ensure audio is fully played
          });
          
          // Handle player errors
          player.on('error', error => {
            console.error("Audio player error:", error);
            // Clean up on error
            try {
              fs.unlinkSync(filepath);
            } catch {}
            connection.destroy();
          });
          
          // Respond to the user
          const languageNames = {
            'en-US': 'English (US)',
            'vi-VN': 'Vietnamese',
            'fr-FR': 'French',
            'es-ES': 'Spanish',
            'de-DE': 'German',
            'zh-CN': 'Chinese (Mandarin)'
          };
          
          const embed = new EmbedBuilder()
            .setTitle("🔊 Text-to-Speech")
            .setDescription(`Playing message from ${username} in ${languageNames[language]}`)
            .addFields(
              { name: "Text", value: text.length > 1024 ? text.slice(0, 1021) + '...' : text }
            )
            .setColor('#3498db');
          
          if (source.reply) {
            // Slash command
            await source.reply({ embeds: [embed] });
          } else {
            // Legacy command
            await source.reply({ embeds: [embed] });
          }
          
        } catch (error) {
          console.error("TTS Error:", error);
          
          // Clean up file if it exists
          if (fs.existsSync(filepath)) {
            try {
              fs.unlinkSync(filepath);
            } catch {}
          }
          
          // Send error message
          const errorMessage = `Failed to generate TTS: ${error.message}`;
          if (source.reply) {
            // Slash command
            await source.reply({
              content: errorMessage,
              ephemeral: true
            });
          } else {
            // Legacy command
            await source.reply(errorMessage);
          }
        }
      }
    }
  ]
};