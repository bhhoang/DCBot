// index.js - Main entry point for the Discord bot
const fs = require('fs');
const path = require('path');
const { Bot } = require('./src/core/bot');

// Setup error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1); // Exit with failure
});

// Create required directories if they don't exist
const requiredDirs = ['./logs', './data', './config', './modules'];
for (const dir of requiredDirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
}

// Ensure config files exist
const configFiles = {
  'config.json': {
    bot: {
      token: 'YOUR_DISCORD_BOT_TOKEN',
      clientId: 'YOUR_BOT_CLIENT_ID',
      prefix: '!',
      status: 'online',
      activity: { type: 'PLAYING', name: 'with modules' }
    },
    commands: {
      registerSlashCommands: true,
      enableLegacyCommands: true
    },
    development: {
      debug: false,
      testGuildId: ''
    }
  },
  'modules.json': {
    enabled: []
  }
};

for (const [file, defaultContent] of Object.entries(configFiles)) {
  const filePath = path.join('./config', file);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(
      filePath,
      JSON.stringify(defaultContent, null, 2)
    );
    console.log(`Created default config file: ${file}`);
  }
}

// Load configuration
let config;
try {
  config = {
    ...require('./config/config.json'),
    modules: require('./config/modules.json')
  };
} catch (error) {
  console.error('Failed to load configuration:', error);
  process.exit(1);
}

// Helper function to format timestamps
function formatTimestamp() {
  return new Date().toISOString();
}

// Enhanced logging
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = (...args) => {
  originalConsoleLog(`[${formatTimestamp()}] [INFO]`, ...args);
  
  // Log to file if enabled
  if (config?.logging?.fileOutput) {
    try {
      const logDir = config.logging.logDirectory || './logs';
      const logFile = path.join(logDir, `${new Date().toISOString().split('T')[0]}.log`);
      fs.appendFileSync(logFile, `[${formatTimestamp()}] [INFO] ${args.join(' ')}\n`);
    } catch (error) {
      originalConsoleError(`Failed to write to log file: ${error}`);
    }
  }
};

console.error = (...args) => {
  originalConsoleError(`[${formatTimestamp()}] [ERROR]`, ...args);
  
  // Log to file if enabled
  if (config?.logging?.fileOutput) {
    try {
      const logDir = config.logging.logDirectory || './logs';
      const logFile = path.join(logDir, `${new Date().toISOString().split('T')[0]}-error.log`);
      fs.appendFileSync(logFile, `[${formatTimestamp()}] [ERROR] ${args.join(' ')}\n`);
    } catch (error) {
      originalConsoleError(`Failed to write to error log file: ${error}`);
    }
  }
};

async function main() {
  console.log('Starting Discord bot...');
  
  // Check for required configuration
  if (!config.bot.token) {
    console.error('Bot token not found in config.json. Please add your bot token.');
    process.exit(1);
  }
  
  try {
    // Create and initialize the bot
    const bot = new Bot(config);
    await bot.initialize();
    await bot.login();
    
    console.log(`Bot is now online as ${bot.client.user.tag}!`);
    
    // Handle graceful shutdown
    const shutdownHandler = async (signal) => {
      console.log(`Received ${signal}. Shutting down gracefully...`);
      await bot.shutdown();
      console.log('Bot has been shut down. Goodbye!');
      process.exit(0);
    };
    
    // Register shutdown handlers
    process.on('SIGINT', () => shutdownHandler('SIGINT'));
    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
    
    // If we're in development mode and a test guild is specified, register commands there
    if (config.development.devMode && config.development.testGuildId) {
      await bot.commandHandler.registerCommandsToGuild(config.development.testGuildId);
      console.log(`Registered slash commands to test guild: ${config.development.testGuildId}`);
    }
    
  } catch (error) {
    console.error('Failed to start the bot:', error);
    process.exit(1);
  }
}

// Start the bot
main().catch(error => {
  console.error('Fatal error in main process:', error);
  process.exit(1);
});
