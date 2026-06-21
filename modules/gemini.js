// modules/gemini.js
const { EmbedBuilder, MessageFlags } = require('discord.js');

// Conversation memory for users (ephemeral, cleared on bot restart)
const userConversations = new Map();

// Max conversation history entries to keep per user
const MAX_HISTORY_LENGTH = 10;

// Primary model, with a fallback if the primary is unavailable.
const PRIMARY_MODEL = 'gemini-3.5-flash';
const FALLBACK_MODEL = 'gemini-2.5-flash';

module.exports = {
  meta: {
    name: "gemini",
    type: "ai",
    version: "1.0.0",
    description: "Interact with Google's Gemini AI model",
    dependencies: [],
    npmDependencies: {
      "@google/genai": "2.8.0"
    }
  },
  
  // Module vars
  ai: null,
  apiKey: null,
  modelName: null, // Set to whichever model last succeeded (for the footer)

  // Module initialization
  async init(client, bot) {
    console.log("Gemini module initializing...");

    // Get API key from environment or config
    this.apiKey = process.env.GEMINI_API_KEY || bot.config.gemini?.apiKey;

    if (!this.apiKey) {
      console.warn("⚠️ Gemini API key not found! The gemini command will not work.");
      console.warn("Please set GEMINI_API_KEY in your environment or add it to your config.");
      return;
    }

    try {
      // Import the Google GenAI package
      const { GoogleGenAI } = require('@google/genai');

      // Initialize the Gemini API client
      this.ai = new GoogleGenAI({ apiKey: this.apiKey });
      this.modelName = PRIMARY_MODEL;

      console.log("Gemini module initialized successfully!");
    } catch (error) {
      console.error("Failed to initialize Gemini module:", error);
      console.warn("Make sure '@google/genai' is installed in modules/node_modules");
    }
  },
  
  // Module shutdown
  async shutdown() {
    console.log("Gemini module shutting down...");
    // Clear all conversation history
    userConversations.clear();
    console.log("Gemini module shut down successfully!");
  },
  
  // Commands
  commands: [
    {
      name: "gemini",
      description: "Ask a question to Google's Gemini AI",
      data: {
        name: "gemini",
        description: "Ask a question to Google's Gemini AI",
        options: [
          {
            name: "prompt",
            description: "Your question or prompt for Gemini",
            type: 3, // STRING
            required: true
          },
          {
            name: "new",
            description: "Start a new conversation (ignores previous context)",
            type: 5, // BOOLEAN
            required: false
          }
        ]
      },
      slash: true,
      async execute(interaction, bot) {
        try {
          // Check if the module is properly initialized
          if (!this.ai) {
            // Try to initialize now
            const { GoogleGenAI } = require('@google/genai');

            // Get API key
            this.apiKey = process.env.GEMINI_API_KEY || bot.config.gemini?.apiKey;

            if (!this.apiKey) {
              return interaction.reply({
                content: "⚠️ Gemini API key not configured. Please ask the bot administrator to set up the Gemini API key.",
                flags: MessageFlags.Ephemeral
              });
            }

            this.ai = new GoogleGenAI({ apiKey: this.apiKey });
            this.modelName = PRIMARY_MODEL;
          }
          
          // Defer the reply as AI responses might take longer than 3 seconds
          await interaction.deferReply();
          
          const prompt = interaction.options.getString("prompt");
          const newConversation = interaction.options.getBoolean("new") || false;
          
          // Get user ID for tracking conversation history
          const userId = interaction.user.id;
          
          // Start new conversation if requested or not existing
          if (newConversation || !userConversations.has(userId)) {
            userConversations.set(userId, {
              history: []
            });
          }
          
          const userConvo = userConversations.get(userId);
          
          // Generate AI response
          const response = await this.generateResponse(prompt, userId);
          
          // Create the response embed
          const embed = new EmbedBuilder()
            .setColor('#4285F4') // Google blue
            .setTitle('Gemini AI Response')
            .setDescription(response)
            .setFooter({ 
              text: `Model: ${this.modelName || "Gemini"} | Messages: ${Math.ceil(userConvo.history.length / 2)}` 
            })
            .setTimestamp();
          
          // Send the response
          await interaction.editReply({ embeds: [embed] });
          
        } catch (error) {
          console.error('Error with Gemini command:', error);

          if (interaction.deferred) {
            await interaction.editReply({
              content: '❌ Something went wrong with the Gemini API.'
            });
          } else {
            await interaction.reply({
              content: '❌ Something went wrong with the Gemini API.',
              flags: MessageFlags.Ephemeral
            });
          }
        }
      },
      
      // Legacy command
      legacy: true,
      async legacyExecute(message, args, bot) {
        try {
          // Check if the module is properly initialized
          if (!this.ai) {
            // Try to initialize now
            const { GoogleGenAI } = require('@google/genai');

            // Get API key
            this.apiKey = process.env.GEMINI_API_KEY || bot.config.gemini?.apiKey;

            if (!this.apiKey) {
              return message.reply("⚠️ Gemini API key not configured. Please ask the bot administrator to set up the Gemini API key.");
            }

            this.ai = new GoogleGenAI({ apiKey: this.apiKey });
            this.modelName = PRIMARY_MODEL;
          }
          
          // Check for arguments
          if (args.length === 0) {
            return message.reply("Please provide a prompt for Gemini. Example: `!gemini What is machine learning?`");
          }
          
          // Parse options and get prompt
          let prompt;
          let newConversation = false;
          
          // Check for new conversation option
          if (args[0] === '--new' || args[0] === '-n') {
            newConversation = true;
            args.shift();
          }
          
          // The rest is the prompt
          prompt = args.join(' ');
          
          if (!prompt) {
            return message.reply("Please provide a prompt for Gemini.");
          }
          
          // Send a typing indicator
          message.channel.sendTyping();
          
          // Get user ID for tracking conversation history
          const userId = message.author.id;
          
          // Start new conversation if requested or not existing
          if (newConversation || !userConversations.has(userId)) {
            userConversations.set(userId, {
              history: []
            });
          }
          
          // Generate AI response
          const response = await this.generateResponse(prompt, userId);
          
          // Create the response embed
          const embed = new EmbedBuilder()
            .setColor('#4285F4') // Google blue
            .setTitle('Gemini AI Response')
            .setDescription(response)
            .setFooter({ 
              text: `Model: ${this.modelName || "Gemini"} | Messages: ${Math.ceil(userConversations.get(userId).history.length / 2)}` 
            })
            .setTimestamp();
          
          // Send the response
          await message.reply({ embeds: [embed] });
          
        } catch (error) {
          console.error('Error with Gemini command:', error);
          await message.reply('❌ Something went wrong with the Gemini API.');
        }
      },
      
      /**
       * Generate a response from Gemini
       * @param {string} prompt - User prompt
       * @param {string} userId - Discord user ID
       * @returns {Promise<string>} - Gemini's response
       */
      async generateResponse(prompt, userId) {
        // Get user's conversation history or create new
        if (!userConversations.has(userId)) {
          userConversations.set(userId, {
            history: []
          });
        }

        const userConvo = userConversations.get(userId);

        // Run a chat turn against a given model. History shape is unchanged:
        // [{ role: 'user'|'model', parts: [{ text }] }].
        const runChat = async (model) => {
          const chat = this.ai.chats.create({
            model,
            history: userConvo.history,
            config: {
              maxOutputTokens: 1000,
              temperature: 0.7,
              topP: 0.85,
              topK: 40
            }
          });

          const result = await chat.sendMessage({ message: prompt });
          return result.text;
        };

        let response;
        try {
          // Primary model first.
          response = await runChat(PRIMARY_MODEL);
          this.modelName = PRIMARY_MODEL;
        } catch (primaryError) {
          console.warn(`[gemini] Primary model ${PRIMARY_MODEL} failed, retrying with ${FALLBACK_MODEL}:`, primaryError.message);
          // Retry once with the fallback model before giving up.
          response = await runChat(FALLBACK_MODEL);
          this.modelName = FALLBACK_MODEL;
        }

        // Update conversation history
        userConvo.history.push({ role: "user", parts: [{ text: prompt }] });
        userConvo.history.push({ role: "model", parts: [{ text: response }] });

        // Limit history length
        if (userConvo.history.length > MAX_HISTORY_LENGTH * 2) {
          // Remove oldest message pair (user message and model response)
          userConvo.history.splice(0, 2);
        }

        return response;
      }
    },
    
    // Clear command to reset conversation history
    {
      name: "gemini-clear",
      description: "Clear your Gemini conversation history",
      data: {
        name: "gemini-clear",
        description: "Clear your Gemini conversation history"
      },
      slash: true,
      async execute(interaction, bot) {
        const userId = interaction.user.id;
        
        if (userConversations.has(userId)) {
          userConversations.delete(userId);
          return interaction.reply({
            content: "✅ Your Gemini conversation history has been cleared.",
            flags: MessageFlags.Ephemeral
          });
        } else {
          return interaction.reply({
            content: "You don't have any active Gemini conversations.",
            flags: MessageFlags.Ephemeral
          });
        }
      },
      
      // Legacy command
      legacy: true,
      async legacyExecute(message, args, bot) {
        const userId = message.author.id;
        
        if (userConversations.has(userId)) {
          userConversations.delete(userId);
          return message.reply("✅ Your Gemini conversation history has been cleared.");
        } else {
          return message.reply("You don't have any active Gemini conversations.");
        }
      }
    }
  ]
};