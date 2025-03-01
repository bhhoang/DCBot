// modules/werewolf/roles/index.js
const Werewolf = require('./werewolf');
const Witch = require('./witch');
const Seer = require('./seer');
const Bodyguard = require('./bodyguard');
const Hunter = require('./hunter');
// Import other roles as they're implemented
const Villager = require('./villager');

// Role map by ID
const ROLES = {
  WEREWOLF: new Werewolf(),
  WITCH: new Witch(),
  SEER: new Seer(),
  BODYGUARD: new Bodyguard(),
  HUNTER: new Hunter(),
  VILLAGER: new Villager(),
};

// Get role by ID
function getRole(roleId) {
  return ROLES[roleId];
}

// Get all roles
function getAllRoles() {
  return Object.values(ROLES);
}

// Get all role IDs
function getAllRoleIds() {
  return Object.keys(ROLES);
}

// Export role functions and all individual roles
module.exports = {
  getRole,
  getAllRoles,
  getAllRoleIds,
  ROLES,
  Werewolf,
  Witch,
  Seer,
  Bodyguard,
  Hunter,
  Villager,
};