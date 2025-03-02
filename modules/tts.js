// modules/tts.js
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { createAudioPlayer, createAudioResource, joinVoiceChannel, AudioPlayerStatus, 
        VoiceConnectionStatus, entersState, NoSubscriberBehavior } = require('@discordjs/voice');
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
// Track active connections
const activeConnections = new Map();
// Platform detection
const isLinux = process.platform === 'linux';

module.exports = {
  meta: {
    name: "tts",
    type: "utility",
    version: "1.0.1", // Updated version
    description: "Convert text to speech and play in voice channel",
    dependencies: [],
    npmDependencies: {
      'google-tts-api': '^2.0.2',
      '@discordjs/voice': '^0.16.1',
      'axios': '^0.21.1',
      'libsodium-wrappers': '^0.7.11',  // Add encryption package for voice
      'ffmpeg-static': '^5.2.0',  // Add static FFmpeg executable
      'prism-media': '^1.3.5'     // Add Prism for opus processing
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
    // Destroy all active connections
    console.log(`Cleaning up ${activeConnections.size} active voice connections`);
    for (const [guildId, { connection }] of activeConnections.entries()) {
      try {
        connection.destroy();
        console.log(`Destroyed voice connection for guild ${guildId}`);
      } catch (error) {
        console.error(`Error destroying voice connection for guild ${guildId}:`, error);
      }
    }
    
    // Clear the active connections map
    activeConnections.clear();
    
    // Clean up any existing TTS files
    const ttsTempDir = path.join(process.cwd(), 'temp', 'tts');
    try {
      const files = fs.readdirSync(ttsTempDir);
      files.forEach(file => {
        if (file.endsWith('.mp3')) {
          fs.unlinkSync(path.join(ttsTempDir, file));
          console.log(`Deleted TTS file: ${file}`);
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
        let language = 'vi-VN';
        
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
        console.log("Starting TTS execution...");
        
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
        
        // Check if sodium is ready - but only enforce on Windows as Linux can sometimes work without it
        if (!sodiumReady && !isLinux) {
          return source.reply({
            content: "⚠️ Voice encryption not available. Please run `node scripts/install-voice-deps.js` to install the required dependencies.",
            ephemeral: true
          });
        }
        
        // Get the server display name (nickname) of the person who executed the command
        let displayName;
        if (source.member) {
          // Use server nickname (displayName) as the first priority
          displayName = source.member.displayName || source.member.nickname || source.user?.username || source.author?.username || "Someone";
        } else {
          displayName = source.author?.username || "Someone";
        }
        console.log(`TTS request from user: ${displayName}`);
        
        // Modify the text to include who's speaking
        const announcedText = `${displayName}: ${text}`;
        console.log(`Announced text: "${announcedText.substring(0, 50)}${announcedText.length > 50 ? '...' : ''}"`); // Log the first part for debugging
        
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
          for (const [index, chunk] of chunks.entries()) {
            console.log(`Processing chunk ${index + 1}/${chunks.length}: "${chunk.substring(0, 50)}${chunk.length > 50 ? '...' : ''}"`);
            
            try {
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
              console.log(`Successfully generated audio for chunk ${index + 1}`);
            } catch (error) {
              console.error(`Error generating audio for chunk ${index + 1}:`, error);
              throw new Error(`Failed to generate audio for part of the message: ${error.message}`);
            }
          }
          
          // Combine and save audio chunks
          const combinedBuffer = Buffer.concat(audioChunks);
          fs.writeFileSync(filepath, combinedBuffer);
          
          // Log connection attempt
          console.log(`Joining voice channel ${voiceChannel.name} (${voiceChannel.id})`);
          
          // First try to pre-initialize sodium
          if (sodium && !sodiumReady) {
            try {
              console.log("Pre-initializing sodium...");
              await sodium.ready;
              sodiumReady = true;
              console.log("Sodium successfully initialized");
            } catch (err) {
              console.warn("Sodium pre-initialization failed:", err.message);
              // Continue anyway as we'll try a different approach
            }
          }
          
          // Alternative connection approach that's more resilient on Linux
          let connection;
          let retryCount = 0;
          const maxRetries = 3;
          let connectionEstablished = false;
          
          // Retry loop for connection
          while (retryCount < maxRetries && !connectionEstablished) {
            try {
              // Create voice connection with more conservative settings
              connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false
              });
              
              // Set up state change logging
              connection.on(VoiceConnectionStatus.Connecting, () => {
                console.log("Voice connection status: Connecting");
              });
              
              connection.on(VoiceConnectionStatus.Signalling, () => {
                console.log("Voice connection status: Signalling");
              });
              
              connection.on(VoiceConnectionStatus.Ready, () => {
                console.log("Voice connection status: Ready");
                connectionEstablished = true;
              });
              
              // Handle connection errors and disconnections
              connection.on('error', (error) => {
                console.error('Voice connection error:', error);
              });
              
              connection.on(VoiceConnectionStatus.Disconnected, async () => {
                console.log("Voice connection disconnected");
                try {
                  await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000)
                  ]);
                  console.log("Reconnecting after disconnect");
                } catch (error) {
                  console.log("Failed to reconnect:", error.message);
                  connection.destroy();
                }
              });
              
              // Use a shorter timeout for Linux
              console.log("Waiting for connection to be ready (attempt " + (retryCount + 1) + ")");
              const connectionTimeout = 15000; // 15 seconds per attempt is better than one long timeout
              
              await entersState(connection, VoiceConnectionStatus.Ready, connectionTimeout);
              console.log("Voice connection is ready!");
              connectionEstablished = true;
              break; // Connection successful, exit retry loop
              
            } catch (error) {
              console.error(`Connection attempt ${retryCount + 1} failed:`, error.message);
              
              // Clean up failed connection
              if (connection) {
                connection.destroy();
              }
              
              // Last attempt failed
              if (retryCount === maxRetries - 1) {
                throw new Error(`Failed to join voice channel after ${maxRetries} attempts: ${error.message}`);
              }
              
              // Wait before retrying
              console.log(`Retrying in ${(retryCount + 1) * 2} seconds...`);
              await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 2000));
              retryCount++;
            }
          }
          
          // Ensure connection is fully established before continuing
          if (!connectionEstablished) {
            throw new Error("Failed to establish voice connection");
          }
          
          // Double-check the connection state
          if (connection.state.status !== VoiceConnectionStatus.Ready) {
            console.log("Connection shows as established but state is not Ready, waiting for Ready state...");
            try {
              await entersState(connection, VoiceConnectionStatus.Ready, 5000);
              console.log("Connection is now in Ready state");
            } catch (error) {
              throw new Error("Voice connection not in Ready state: " + error.message);
            }
          }
          
          // Create audio player with proper behavior configuration
          const player = createAudioPlayer({
            behaviors: {
              noSubscriber: NoSubscriberBehavior.Pause,
            },
          });
          
          // Add error handling for player
          player.on('error', error => {
            console.error('Audio player error:', error);
            // Clean up on error
            try {
              fs.unlinkSync(filepath);
            } catch (err) {
              console.error('Error deleting TTS file after player error:', err);
            }
          });
          
          // Subscribe connection to player and verify subscription
          const subscription = connection.subscribe(player);
          
          if (!subscription) {
            throw new Error("Failed to subscribe connection to audio player");
          }
          
          console.log("Successfully subscribed connection to player");
          
          // Wait a short moment to ensure subscription is fully processed
          await new Promise(resolve => setTimeout(resolve, isLinux ? 1000 : 500));
          
          // Create audio resource with platform-specific settings
          const resource = isLinux 
            ? createAudioResource(filepath) // Simpler resource creation on Linux
            : createAudioResource(filepath, {
                inputType: 'file',
                inlineVolume: true
              });
          
          // Set volume if available
          if (resource.volume) {
            resource.volume.setVolume(1.0); // Full volume
          }
          
          // Play the audio
          console.log("Preparing to play audio...");
          player.play(resource);
          
          // Verify playback started
          try {
            await entersState(player, AudioPlayerStatus.Playing, 5000);
            console.log("Audio playback confirmed started");
          } catch (error) {
            console.error("Failed to start audio playback:", error);
            // Continue anyway as it might still work
          }
          
          // Monitor playback state
          player.on(AudioPlayerStatus.Playing, () => {
            console.log('Audio is now playing!');
          });
          
          player.on(AudioPlayerStatus.Buffering, () => {
            console.log('Audio is buffering...');
          });
          
          // Store guild ID to track connections
          const guildId = voiceChannel.guild.id;
          activeConnections.set(guildId, {
            connection,
            player,
            timestamp: Date.now()
          });
          
          // Handle playback completion
          player.on(AudioPlayerStatus.Idle, () => {
            console.log("Playback completed");
            // Clean up the file
            try {
              fs.unlinkSync(filepath);
              console.log('TTS file deleted successfully');
            } catch (err) {
              console.error("Error deleting TTS file:", err);
            }
            
            // // Disconnect from voice channel after a delay
            // setTimeout(() => {
            //   // Check if this is still the active connection
            //   const activeConn = activeConnections.get(guildId);
            //   if (activeConn && activeConn.connection === connection) {
            //     connection.destroy();
            //     activeConnections.delete(guildId);
            //     console.log("Voice connection destroyed");
            //   }
            // }, isLinux ? 3000 : 5000); // Shorter timeout on Linux
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
            .setDescription(`Playing message from ${displayName} in ${languageNames[language]}`)
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
            } catch (err) {
              console.error('Error deleting TTS file after error:', err);
            }
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
    },
    
    // Add a diagnostic command to check voice dependencies
    {
      name: "tts-diagnostic",
      description: "Check TTS module dependencies and voice connectivity",
      data: {
        name: "tts-diagnostic",
        description: "Check TTS module dependencies and voice connectivity",
        options: []
      },
      slash: true,
      async execute(interaction, bot) {
        await this.executeDiagnostic(interaction);
      },
      
      // Legacy command
      legacy: true,
      async legacyExecute(message, args, bot) {
        await this.executeDiagnostic(message);
      },
      
      /**
       * Execute diagnostic functionality
       * @param {Object} source - Interaction or Message object
       */
      async executeDiagnostic(source) {
        try {
          const diagnostics = [];
          
          // Check FFmpeg
          diagnostics.push({
            name: "FFmpeg",
            status: ffmpegAvailable ? "✅ Available" : "❌ Not Found",
            details: ffmpegAvailable ? 
              "FFmpeg is properly installed" : 
              "Install FFmpeg with npm install ffmpeg-static or system package manager"
          });
          
          // Check Sodium
          diagnostics.push({
            name: "Sodium (Voice Encryption)",
            status: sodiumReady ? "✅ Available" : "❌ Not Initialized",
            details: sodiumReady ? 
              "Voice encryption is properly configured" : 
              "Install with npm install libsodium-wrappers"
          });
          
          // Check voice channel
          const member = source.member || source.author;
          const voiceChannel = member.voice?.channel;
          diagnostics.push({
            name: "Voice Channel",
            status: voiceChannel ? "✅ Connected" : "⚠️ Not Connected",
            details: voiceChannel ? 
              `You are in voice channel: ${voiceChannel.name}` :
              "Join a voice channel to use TTS features"
          });
          
          // Build embed
          const embed = new EmbedBuilder()
            .setTitle("🔍 TTS Diagnostic Results")
            .setDescription("Checking voice dependencies and settings...")
            .setColor('#3498db')
            .setTimestamp();
          
          // Add diagnostics to embed
          for (const diag of diagnostics) {
            embed.addFields({ 
              name: `${diag.name}: ${diag.status}`, 
              value: diag.details 
            });
          }
          
          // Add system info
          embed.addFields({
            name: "System Information",
            value: `Platform: ${process.platform}\nNode.js: ${process.version}\nDiscord.js Voice: ^0.16.1`
          });
          
          // Add installation help
          embed.addFields({
            name: "🛠️ Installation Help",
            value: "If dependencies are missing, run `node scripts/install-voice-deps.js` or check the documentation for manual installation steps."
          });
          
          if (source.reply) {
            // Slash command
            await source.reply({ embeds: [embed] });
          } else {
            // Legacy command
            await source.reply({ embeds: [embed] });
          }
          
        } catch (error) {
          console.error("Diagnostic Error:", error);
          
          // Send error message
          const errorMessage = `Failed to run diagnostics: ${error.message}`;
          if (source.reply) {
            await source.reply({
              content: errorMessage,
              ephemeral: true
            });
          } else {
            await source.reply(errorMessage);
          }
        }
      }
    }
  ]
};