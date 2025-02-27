// src/core/databaseManager.js - Database connection and management
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

class DatabaseManager {
  constructor(config) {
    this.config = config;
    this.db = null;
    this.type = config.type || 'sqlite';
    this.mongoose = null;
  }
  
  /**
   * Connect to the database
   */
  async connect() {
    try {
      if (this.type === 'sqlite') {
        await this.connectSqlite();
      } else if (this.type === 'mongodb') {
        await this.connectMongoDB();
      } else {
        throw new Error(`Unsupported database type: ${this.type}`);
      }
      
      console.log(`Connected to ${this.type} database`);
      return true;
    } catch (error) {
      console.error(`Failed to connect to ${this.type} database:`, error);
      throw error;
    }
  }
  
  /**
   * Connect to SQLite database
   */
  connectSqlite() {
    return new Promise((resolve, reject) => {
      // Ensure the data directory exists
      const dbPath = this.config.path || './data/database.sqlite';
      const dbDir = path.dirname(dbPath);
      
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      
      // Connect to the database
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          // Initialize database schema
          this.initSqliteSchema().then(resolve).catch(reject);
        }
      });
    });
  }
  
  /**
   * Initialize SQLite database schema
   */
  async initSqliteSchema() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Create tables if they don't exist
        this.db.run(`
          CREATE TABLE IF NOT EXISTS guild_settings (
            guild_id TEXT PRIMARY KEY,
            prefix TEXT,
            welcome_channel TEXT,
            farewell_channel TEXT,
            log_channel TEXT,
            auto_role TEXT,
            created_at INTEGER,
            updated_at INTEGER
          )
        `, (err) => {
          if (err) return reject(err);
          
          // Create module-specific tables
          this.db.run(`
            CREATE TABLE IF NOT EXISTS module_data (
              module_name TEXT,
              guild_id TEXT,
              key TEXT,
              value TEXT,
              created_at INTEGER,
              updated_at INTEGER,
              PRIMARY KEY (module_name, guild_id, key)
            )
          `, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      });
    });
  }
  
  /**
   * Connect to MongoDB database
   */
  async connectMongoDB() {
    try {
      // Only require mongoose if MongoDB is being used
      const mongoose = require('mongoose');
      this.mongoose = mongoose;
      
      // Connect to MongoDB
      await mongoose.connect(this.config.mongodb.uri, this.config.mongodb.options || {});
      
      // Define schemas
      const guildSettingsSchema = new mongoose.Schema({
        guild_id: { type: String, required: true, unique: true },
        prefix: String,
        welcome_channel: String,
        farewell_channel: String,
        log_channel: String,
        auto_role: String,
        created_at: { type: Date, default: Date.now },
        updated_at: { type: Date, default: Date.now }
      });
      
      const moduleDataSchema = new mongoose.Schema({
        module_name: { type: String, required: true },
        guild_id: { type: String, required: true },
        key: { type: String, required: true },
        value: mongoose.Schema.Types.Mixed,
        created_at: { type: Date, default: Date.now },
        updated_at: { type: Date, default: Date.now }
      });
      
      // Create a compound index for moduleData
      moduleDataSchema.index({ module_name: 1, guild_id: 1, key: 1 }, { unique: true });
      
      // Define models
      this.models = {
        GuildSettings: mongoose.model('GuildSettings', guildSettingsSchema),
        ModuleData: mongoose.model('ModuleData', moduleDataSchema)
      };
      
    } catch (error) {
      console.error('MongoDB connection error:', error);
      throw error;
    }
  }
  
  /**
   * Get guild settings
   * @param {string} guildId - Discord guild ID
   */
  async getGuildSettings(guildId) {
    if (this.type === 'sqlite') {
      return new Promise((resolve, reject) => {
        this.db.get(
          'SELECT * FROM guild_settings WHERE guild_id = ?',
          [guildId],
          (err, row) => {
            if (err) return reject(err);
            resolve(row || {});
          }
        );
      });
    } else if (this.type === 'mongodb') {
      return this.models.GuildSettings.findOne({ guild_id: guildId }).lean() || {};
    }
  }
  
  /**
   * Set guild settings
   * @param {string} guildId - Discord guild ID
   * @param {object} settings - Settings to save
   */
  async setGuildSettings(guildId, settings) {
    const now = Date.now();
    
    if (this.type === 'sqlite') {
      // First get existing settings outside the Promise
      const existingSettings = await this.getGuildSettings(guildId);
      const mergedSettings = { ...existingSettings, ...settings, updated_at: now };
      
      return new Promise((resolve, reject) => {
        if (existingSettings.guild_id) {
          // Update existing settings
          const keys = Object.keys(mergedSettings).filter(key => key !== 'guild_id');
          const placeholders = keys.map(key => `${key} = ?`).join(', ');
          const values = keys.map(key => mergedSettings[key]);
          
          this.db.run(
            `UPDATE guild_settings SET ${placeholders} WHERE guild_id = ?`,
            [...values, guildId],
            (err) => {
              if (err) return reject(err);
              resolve(mergedSettings);
            }
          );
        } else {
          // Insert new settings
          mergedSettings.guild_id = guildId;
          mergedSettings.created_at = now;
          
          const keys = Object.keys(mergedSettings);
          const placeholders = keys.map(() => '?').join(', ');
          const values = keys.map(key => mergedSettings[key]);
          
          this.db.run(
            `INSERT INTO guild_settings (${keys.join(', ')}) VALUES (${placeholders})`,
            values,
            (err) => {
              if (err) return reject(err);
              resolve(mergedSettings);
            }
          );
        }
      });
    } else if (this.type === 'mongodb') {
      const options = { upsert: true, new: true, setDefaultsOnInsert: true };
      return this.models.GuildSettings.findOneAndUpdate(
        { guild_id: guildId },
        { $set: { ...settings, updated_at: new Date() } },
        options
      ).lean();
    }
  }
  
  /**
   * Get module data
   * @param {string} moduleName - Name of the module
   * @param {string} guildId - Discord guild ID
   * @param {string} key - Data key
   */
  async getModuleData(moduleName, guildId, key) {
    if (this.type === 'sqlite') {
      return new Promise((resolve, reject) => {
        this.db.get(
          'SELECT value FROM module_data WHERE module_name = ? AND guild_id = ? AND key = ?',
          [moduleName, guildId, key],
          (err, row) => {
            if (err) return reject(err);
            resolve(row ? JSON.parse(row.value) : null);
          }
        );
      });
    } else if (this.type === 'mongodb') {
      const data = await this.models.ModuleData.findOne({
        module_name: moduleName,
        guild_id: guildId,
        key: key
      }).lean();
      
      return data ? data.value : null;
    }
  }
  
  /**
   * Set module data
   * @param {string} moduleName - Name of the module
   * @param {string} guildId - Discord guild ID
   * @param {string} key - Data key
   * @param {any} value - Data value
   */
  async setModuleData(moduleName, guildId, key, value) {
    const now = Date.now();
    
    if (this.type === 'sqlite') {
      return new Promise((resolve, reject) => {
        const valueStr = JSON.stringify(value);
        
        this.db.run(
          `INSERT INTO module_data(module_name, guild_id, key, value, created_at, updated_at) 
           VALUES(?, ?, ?, ?, ?, ?) 
           ON CONFLICT(module_name, guild_id, key) 
           DO UPDATE SET value = ?, updated_at = ?`,
          [moduleName, guildId, key, valueStr, now, now, valueStr, now],
          (err) => {
            if (err) return reject(err);
            resolve(value);
          }
        );
      });
    } else if (this.type === 'mongodb') {
      const options = { upsert: true, new: true, setDefaultsOnInsert: true };
      const result = await this.models.ModuleData.findOneAndUpdate(
        { module_name: moduleName, guild_id: guildId, key: key },
        { $set: { value: value, updated_at: new Date() } },
        options
      ).lean();
      
      return result.value;
    }
  }
  
  /**
   * Disconnect from the database
   */
  async disconnect() {
    if (this.type === 'sqlite' && this.db) {
      return new Promise((resolve, reject) => {
        this.db.close((err) => {
          if (err) {
            console.error('Error closing SQLite database:', err);
            reject(err);
          } else {
            this.db = null;
            resolve();
          }
        });
      });
    } else if (this.type === 'mongodb' && this.mongoose) {
      await this.mongoose.disconnect();
      this.mongoose = null;
    }
  }
}

module.exports = { DatabaseManager };
