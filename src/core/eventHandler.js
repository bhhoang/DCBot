// src/core/eventHandler.js - Handles event registration and management
const { Collection } = require('discord.js');

class EventHandler {
  constructor(bot) {
    this.bot = bot;
    this.events = new Collection();
    this.moduleEvents = new Collection();
  }
  
  /**
   * Register events from all modules
   */
  async registerEvents() {
    console.log('Registering events...');
    
    // Get all events from modules
    for (const module of this.bot.moduleLoader.getAllModules()) {
      if (module.events && Array.isArray(module.events)) {
        // Store each event handler by module
        if (!this.moduleEvents.has(module.meta.name)) {
          this.moduleEvents.set(module.meta.name, []);
        }
        
        for (const event of module.events) {
          try {
            // Skip events without a name or execute function
            if (!event.name || typeof event.execute !== 'function') {
              console.warn(`Found invalid event in module ${module.meta.name}, skipping...`);
              continue;
            }
            
            // Add module metadata to event
            const fullEvent = {
              ...event,
              module: module.meta.name,
              modulePath: module._path,
              moduleRequire: module._require
            };
            
            // Store event info
            if (!this.events.has(event.name)) {
              this.events.set(event.name, []);
            }
            
            this.events.get(event.name).push(fullEvent);
            
            // Store in module events collection
            this.moduleEvents.get(module.meta.name).push(fullEvent);
            
            // Register with Discord.js client
            this.registerEvent(fullEvent);
            
          } catch (error) {
            console.error(`Error registering event ${event.name} from module ${module.meta.name}:`, error);
          }
        }
      }
    }
    
    console.log(`Registered ${this.events.size} unique event types from modules.`);
  }
  
  /**
   * Register an event with the Discord.js client
   * @param {object} event - Event object
   */
  registerEvent(event) {
    // Create the event handler function
    const handler = (...args) => {
      try {
        // Add bot instance to arguments
        event.execute(...args, this.bot);
      } catch (error) {
        console.error(`Error in event ${event.name} from module ${event.module}:`, error);
      }
    };
    
    // Store the handler reference for potential removal later
    event._handler = handler;
    
    // Register with Discord.js client
    if (event.once) {
      this.bot.client.once(event.name, handler);
    } else {
      this.bot.client.on(event.name, handler);
    }
  }
  
  /**
   * Unregister events for a specific module
   * @param {string} moduleName - Name of the module
   */
  unregisterModuleEvents(moduleName) {
    // Get all events registered for this module
    const moduleEvents = this.moduleEvents.get(moduleName);
    if (!moduleEvents) return;
    
    // Unregister each event
    for (const event of moduleEvents) {
      if (event._handler) {
        this.bot.client.removeListener(event.name, event._handler);
      }
    }
    
    // Remove from collections
    this.moduleEvents.delete(moduleName);
    
    // Update the main events collection
    for (const [eventName, handlers] of this.events.entries()) {
      const filteredHandlers = handlers.filter(e => e.module !== moduleName);
      
      if (filteredHandlers.length === 0) {
        this.events.delete(eventName);
      } else {
        this.events.set(eventName, filteredHandlers);
      }
    }
  }
  
  /**
   * Manually emit an event
   * @param {string} eventName - Name of the event to emit
   * @param {...any} args - Arguments to pass to the event handlers
   */
  emit(eventName, ...args) {
    const eventHandlers = this.events.get(eventName);
    if (!eventHandlers) return;
    
    for (const event of eventHandlers) {
      try {
        event.execute(...args, this.bot);
      } catch (error) {
        console.error(`Error in manually emitted event ${eventName} from module ${event.module}:`, error);
      }
    }
  }
  
  /**
   * Get all registered events
   * @returns {Map} - Map of event name to array of handlers
   */
  getAllEvents() {
    return this.events;
  }
  
  /**
   * Get all events for a specific module
   * @param {string} moduleName - Name of the module
   * @returns {Array} - Array of event objects
   */
  getModuleEvents(moduleName) {
    return this.moduleEvents.get(moduleName) || [];
  }
  
  /**
   * Get all handlers for a specific event
   * @param {string} eventName - Name of the event
   * @returns {Array} - Array of event handlers
   */
  getEventHandlers(eventName) {
    return this.events.get(eventName) || [];
  }
}

module.exports = { EventHandler };
