// modules/werewolf/constants.js
// Game states
const STATE = {
    LOBBY: 'LOBBY',
    NIGHT: 'NIGHT',
    DAY: 'DAY',
    VOTING: 'VOTING',
    ENDED: 'ENDED'
  };
  
  // Night phases - order matters
  const NIGHT_PHASE = {
    WEREWOLF: 'WEREWOLF',
    SEER: 'SEER',
    BODYGUARD: 'BODYGUARD',
    WITCH: 'WITCH'
  };
  
  // Teams
  const TEAM = {
    WEREWOLF: 'MA SÓI',
    VILLAGER: 'DÂN LÀNG'
  };
  
  // Custom IDs for interactions
  const CUSTOM_ID = {
    JOIN_BUTTON: 'werewolf_join',
    START_BUTTON: 'werewolf_start',
    VOTE_PREFIX: 'werewolf_vote_',
    VOTE_SKIP: 'werewolf_vote_skip',
    ACTION_PREFIX: 'werewolf_action_',
    HUNTER_PREFIX: 'werewolf_hunter_',
    WITCH_KILL_PREFIX: 'werewolf_witch_kill_'
  };
  
  module.exports = {
    STATE,
    NIGHT_PHASE,
    TEAM,
    CUSTOM_ID
  };