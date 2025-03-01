// modules/werewolf/roles/hunter.js
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const BaseRole = require('./baseRole');
const { TEAM, CUSTOM_ID } = require('../constants');

class Hunter extends BaseRole {
  constructor() {
    super();
    this.id = 'HUNTER';
    this.name = 'Thợ Săn';
    this.description = 'Khi bạn chết, bạn có thể bắn chết một người khác';
    this.team = TEAM.VILLAGER;
    this.nightAction = false;
    this.emoji = '🏹';
  }

  /**
   * Handle when the Hunter dies
   * @param {Object} gameState - Game state
   * @param {Object} player - The Hunter player who died
   */
  async handleDeath(gameState, player) {
    // Hunter can shoot someone when they die
    const embed = new EmbedBuilder()
      .setTitle(`🏹 Khả Năng Đặc Biệt Của Thợ Săn`)
      .setDescription(`Bạn đã bị giết, nhưng có thể bắn một mũi tên cuối cùng. Hãy chọn người bạn muốn bắn.`)
      .setColor("#e67e22");
    
    // Create target selection menu
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`${CUSTOM_ID.HUNTER_PREFIX}${player.id}`)
      .setPlaceholder('Chọn một người để bắn...');
    
    // Add all alive players as options
    const targets = Object.values(gameState.players).filter(p => 
      p.isAlive && p.id !== player.id
    );
    
    targets.forEach(target => {
      selectMenu.addOptions({
        label: target.name,
        value: target.id,
        description: `Bắn ${target.name}`,
      });
    });
    
    // Add "Don't shoot" option
    selectMenu.addOptions({
      label: "Không bắn ai",
      value: "none",
      description: "Quyết định không sử dụng khả năng đặc biệt",
    });
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    try {
      // Send the prompt to the Hunter
      await player.user.send({ embeds: [embed], components: [row] });
      
      // Notify the game channel
      const channelEmbed = new EmbedBuilder()
        .setTitle(`🏹 Khả Năng Đặc Biệt Của Thợ Săn`)
        .setDescription(`**${player.name}** là Thợ Săn! Thợ Săn đang chọn người để bắn...`)
        .setColor("#e67e22");
      
      await gameState.channel.send({ embeds: [channelEmbed] });
      
      return { success: true, message: "Hunter death ability activated" };
    } catch (error) {
      console.error(`Failed to send Hunter ability prompt to ${player.name}:`, error);
      // If we can't DM the hunter, just skip their ability
      return { success: false, message: "Failed to send Hunter death ability prompt" };
    }
  }
}

module.exports = Hunter;