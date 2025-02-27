// modules/gemini.js
const { EmbedBuilder } = require('discord.js');

// Conversation memory for users (ephemeral, cleared on bot restart)
const userConversations = new Map();

// Max conversation history entries to keep per user
const MAX_HISTORY_LENGTH = 10;

// We'll attempt to use these models in order
const MODEL_CANDIDATES = ['gemini-1.5-pro', 'gemini-pro'];

module.exports = {
  meta: {
    name: "gemini",
    type: "ai",
    version: "1.0.0",
    description: "Interact with Google's Gemini AI model",
    dependencies: [],
    npmDependencies: {
      "@google/generative-ai": "^0.2.1"
    }
  },
  
  // Module vars
  genAI: null,
  apiKey: null,
  modelName: null, // Will be set during initialization
  
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
      // Import the Google Generative AI package
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      
      // Initialize the Gemini API client
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      
      // Try to determine available models
      try {
        const models = await this.genAI.getModels();
        console.log("Available Gemini models:", models.models.map(m => m.name));
        
        // Find a suitable model from our candidates
        for (const candidate of MODEL_CANDIDATES) {
          if (models.models.some(m => m.name.includes(candidate))) {
            this.modelName = models.models.find(m => m.name.includes(candidate)).name;
            console.log(`Selected Gemini model: ${this.modelName}`);
            break;
          }
        }
        
        if (!this.modelName) {
          // If no candidate models are found, use the first available model
          if (models.models.length > 0) {
            this.modelName = models.models[0].name;
            console.log(`No preferred model found. Using ${this.modelName} instead.`);
          } else {
            console.warn("No Gemini models available for this API key!");
          }
        }
      } catch (modelError) {
        console.warn("Could not fetch available models:", modelError);
        console.log("Will try common model names during execution.");
        this.modelName = 'gemini-1.5-pro'; // Default to latest
      }
      
      console.log("Gemini module initialized successfully!");
    } catch (error) {
      console.error("Failed to initialize Gemini module:", error);
      console.warn("Make sure '@google/generative-ai' is installed in modules/node_modules");
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
          if (!this.genAI) {
            // Try to initialize now
            const { GoogleGenerativeAI } = require('@google/generative-ai');
            
            // Get API key
            this.apiKey = process.env.GEMINI_API_KEY || bot.config.gemini?.apiKey;
            
            if (!this.apiKey) {
              return interaction.reply({
                content: "⚠️ Gemini API key not configured. Please ask the bot administrator to set up the Gemini API key.",
                ephemeral: true
              });
            }
            
            this.genAI = new GoogleGenerativeAI(this.apiKey);
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
          const errorMessage = error.message || 'Something went wrong with the Gemini API';
          
          if (interaction.deferred) {
            await interaction.editReply({
              content: `❌ Error: ${errorMessage}`
            });
          } else {
            await interaction.reply({
              content: `❌ Error: ${errorMessage}`,
              ephemeral: true
            });
          }
        }
      },
      
      // Legacy command
      legacy: true,
      async legacyExecute(message, args, bot) {
        try {
          // Check if the module is properly initialized
          if (!this.genAI) {
            // Try to initialize now
            const { GoogleGenerativeAI } = require('@google/generative-ai');
            
            // Get API key
            this.apiKey = process.env.GEMINI_API_KEY || bot.config.gemini?.apiKey;
            
            if (!this.apiKey) {
              return message.reply("⚠️ Gemini API key not configured. Please ask the bot administrator to set up the Gemini API key.");
            }
            
            this.genAI = new GoogleGenerativeAI(this.apiKey);
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
          await message.reply(`❌ Error: ${error.message || 'Something went wrong with the Gemini API'}`);
        }
      },
      
      /**
       * Generate a response from Gemini
       * @param {string} prompt - User prompt
       * @param {string} userId - Discord user ID
       * @returns {Promise<string>} - Gemini's response
       */
      async generateResponse(prompt, userId) {
        // Try to determine which model to use if we don't have one yet
        if (!this.modelName) {
          // Try each candidate model until one works
          for (const candidate of MODEL_CANDIDATES) {
            try {
              const testModel = this.genAI.getGenerativeModel({ model: candidate });
              await testModel.generateContent("test");
              this.modelName = candidate;
              console.log(`Found working model: ${candidate}`);
              break;
            } catch (e) {
              console.log(`Model ${candidate} not available, trying next...`);
            }
          }
          
          if (!this.modelName) {
            throw new Error("No compatible Gemini models available for your API key.");
          }
        }
        
        // Get the model
        const model = this.genAI.getGenerativeModel({ model: this.modelName });
        
        // Get user's conversation history or create new
        if (!userConversations.has(userId)) {
          userConversations.set(userId, {
            history: []
          });
        }
        
        const userConvo = userConversations.get(userId);
        
        let response;
        
        // Try chat mode first (for conversation history)
        try {
          // Use chat for maintaining conversation history
          const chat = model.startChat({
            history: userConvo.history,
            generationConfig: {
              maxOutputTokens: 1000,
              temperature: 0.7,
              topP: 0.85,
              topK: 40
            }
          });
          
          // Send the message and get response
          const result = await chat.sendMessage(prompt);
          response = result.response.text();
          
          // Update conversation history
          userConvo.history.push({ role: "user", parts: [{ text: prompt }] });
          userConvo.history.push({ role: "model", parts: [{ text: response }] });
          
          // Limit history length
          if (userConvo.history.length > MAX_HISTORY_LENGTH * 2) {
            // Remove oldest message pair (user message and model response)
            userConvo.history.splice(0, 2);
          }
        } catch (chatError) {
          console.warn("Chat mode failed, falling back to single-turn generation:", chatError);
          
          // Fall back to single turn generation
          try {
            const result = await model.generateContent(prompt);
            response = result.response.text();
            
            // Clear history since we can't use it
            userConvo.history = [];
          } catch (genError) {
            throw genError; // Re-throw if both methods fail
          }
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
            ephemeral: true
          });
        } else {
          return interaction.reply({
            content: "You don't have any active Gemini conversations.",
            ephemeral: true
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