// modules/invite.js
const { EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  meta: {
    name: "invite",
    type: "utility",
    version: "1.0.0",
    description: "Generate an invite link for the bot",
    dependencies: [],
    npmDependencies: {}
  },
  
  // Module initialization
  async init(client, bot) {
    console.log("Invite module initialized!");
    this.client = client;
  },
  
  // Module shutdown
  async shutdown() {
    console.log("Invite module shut down!");
  },
  
  // Commands
  commands: [
    {
      name: "invite",
      description: "Generate an invite link for the bot",
      data: {
        name: "invite",
        description: "Generate an invite link for the bot",
        options: [
          {
            name: "permissions",
            description: "Set specific permissions (default: recommended permissions)",
            type: 3, // STRING
            required: false,
            choices: [
              { name: "Basic (minimal permissions)", value: "basic" },
              { name: "Standard (recommended permissions)", value: "standard" },
              { name: "Admin (all permissions)", value: "admin" }
            ]
          }
        ]
      },
      slash: true,
      async execute(interaction, bot) {
        const permissionType = interaction.options.getString("permissions") || "standard";
        const inviteUrl = this.generateInviteUrl(bot.client, permissionType);
        
        const embed = new EmbedBuilder()
          .setTitle("🔗 Bot Invite Link")
          .setColor("#5865F2")
          .setDescription(`Use the link below to add the bot to your server!\n\n**[Click here to invite](${inviteUrl})**`)
          .addFields({ 
            name: "Permission Level", 
            value: this.formatPermissionType(permissionType), 
            inline: true 
          })
          .setFooter({ text: "You need 'Manage Server' permission to add bots" });
        
        return interaction.reply({ embeds: [embed] });
      },
      
      // Legacy command
      legacy: true,
      async legacyExecute(message, args, bot) {
        const permissionType = args[0] || "standard";
        const validTypes = ["basic", "standard", "admin"];
        
        const type = validTypes.includes(permissionType.toLowerCase()) 
          ? permissionType.toLowerCase() 
          : "standard";
        
        const inviteUrl = this.generateInviteUrl(bot.client, type);
        
        const embed = new EmbedBuilder()
          .setTitle("🔗 Bot Invite Link")
          .setColor("#5865F2")
          .setDescription(`Use the link below to add the bot to your server!\n\n**[Click here to invite](${inviteUrl})**`)
          .addFields({ 
            name: "Permission Level", 
            value: this.formatPermissionType(type), 
            inline: true 
          })
          .setFooter({ text: "You need 'Manage Server' permission to add bots" });
        
        return message.reply({ embeds: [embed] });
      },
      
      /**
       * Generate invite URL based on permission level
       */
      generateInviteUrl(client, permissionType) {
        let permissions;
        
        switch(permissionType.toLowerCase()) {
          case "admin":
            permissions = [PermissionsBitField.Flags.Administrator];
            break;
            
          case "basic":
            permissions = [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ];
            break;
            
          case "standard":
          default:
            // Recommended permissions for most bot functionality
            permissions = [
              // General permissions
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.SendMessagesInThreads,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.AttachFiles,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.UseExternalEmojis,
              PermissionsBitField.Flags.AddReactions,
              
              // Voice permissions for music features
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.Speak,
              
              // Moderation features
              PermissionsBitField.Flags.ManageMessages,
              PermissionsBitField.Flags.MoveMembers,
              PermissionsBitField.Flags.MuteMembers
            ];
            break;
        }
        
        // Generate the URL with the scopes we need
        const url = client.generateInvite({
          scopes: ['bot', 'applications.commands'],
          permissions: permissions
        });
        
        return url;
      },
      
      /**
       * Format the permission type for display
       */
      formatPermissionType(type) {
        switch(type.toLowerCase()) {
          case "admin":
            return "🔴 Administrator (Full control)";
          case "basic":
            return "🟢 Basic (Minimal permissions)";
          case "standard":
          default:
            return "🟡 Standard (Recommended permissions)";
        }
      }
    }
  ]
};