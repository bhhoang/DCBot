// modules/werewolf/roles/villager.js
const BaseRole = require('./baseRole');
const { TEAM } = require('../constants');

class Villager extends BaseRole {
  constructor() {
    super();
    this.id = 'VILLAGER';
    this.name = 'Dân Làng';
    this.description = 'Bạn không có khả năng đặc biệt, hãy biểu quyết sáng suốt';
    this.team = TEAM.VILLAGER;
    this.nightAction = false;
    this.emoji = '👨‍🌾';
  }
}

module.exports = Villager;