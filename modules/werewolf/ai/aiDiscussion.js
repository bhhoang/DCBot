// modules/werewolf/ai/aiDiscussion.js
/**
 * Enhanced AI Discussion System for Werewolf Game
 * 
 * This module handles AI player discussions during the day phase,
 * generating contextually appropriate dialogue in Vietnamese based on
 * the AI's role, game state, and personality with improved interactions.
 */

// Import necessary modules
const { TEAM } = require('../constants');
const { getRole } = require('../roles');

// Discussion message types with associated weights for different personalities
const MESSAGE_TYPES = {
  DEFENSE: {
    strategic: 25,
    impulsive: 20,
    cautious: 40
  },
  ACCUSATION: {
    strategic: 35,
    impulsive: 40, 
    cautious: 15
  },
  INFORMATION: {
    strategic: 20,
    impulsive: 15,
    cautious: 20
  },
  QUESTION: {
    strategic: 10,
    impulsive: 15,
    cautious: 15
  },
  RESPONSE: {  // Added new type for directed responses
    strategic: 40,
    impulsive: 45,
    cautious: 30
  }
};

// Templates for different message types in Vietnamese
const MESSAGE_TEMPLATES = {
  // Defensive statements
  DEFENSE: [
    "Tôi không phải là Sói. Tôi là dân làng và đang cố gắng giúp chúng ta thắng.",
    "Đừng nghi ngờ tôi, hãy nhìn vào {name}. Họ đang hành động rất đáng ngờ.",
    "Tôi thề tôi không phải là Sói. Nếu các bạn loại tôi, đó là một sai lầm lớn.",
    "Tại sao lại nghi ngờ tôi? Tôi đã làm gì khiến các bạn nghĩ tôi là Sói?",
    "Tôi biết mình trông đáng ngờ, nhưng tôi thực sự là dân làng.",
    "Hãy tin tôi lần này, tôi đang giúp phe dân làng.",
    "Các bạn đang phí phiếu bầu nếu chọn tôi. Tôi không phải là Sói.",
    "Làm ơn đừng bỏ phiếu cho tôi. Tôi đang cố gắng tìm ra Sói thật sự."
  ],
  
  // Accusations
  ACCUSATION: [
    "Tôi nghi ngờ {name} là Sói. Họ đang hành động rất đáng ngờ.",
    "{name} đã im lặng quá lâu. Đó là dấu hiệu của Sói.",
    "Chúng ta nên bỏ phiếu cho {name}. Tôi khá chắc họ là Sói.",
    "Hãy để ý cách {name} đang cố gắng đổ lỗi cho người khác. Điển hình của Sói.",
    "Từ cách hành xử, tôi nghĩ {name} là Sói. Hãy bỏ phiếu cho họ hôm nay.",
    "{name} đang cố gắng lôi kéo sự chú ý khỏi bản thân. Đáng ngờ lắm.",
    "Tôi đề nghị chúng ta bỏ phiếu cho {name}. Tôi có linh cảm họ là Sói.",
    "Hành động của {name} rất mờ ám. Chúng ta nên loại họ.",
    "Tôi đã quan sát {name} và thấy họ luôn tìm cách đổ lỗi cho người khác. Đó là chiến thuật của Sói.",
    "Hãy chú ý đến {name}, họ hành động khả nghi từ đầu trò chơi."
  ],
  
  // Information sharing
  INFORMATION: [
    "Dựa trên những gì đã xảy ra, tôi nghĩ chúng ta nên tập trung vào {name}.",
    "Hãy nhớ rằng {name} đã bỏ phiếu cho người không đáng ngờ hôm qua.",
    "Chúng ta đã mất nhiều dân làng. Cần phải cẩn thận với quyết định hôm nay.",
    "Người chết đêm qua có thể là do Tiên Tri hoặc Thợ Săn, không chỉ là Sói.",
    "Hãy suy nghĩ về việc ai đã sống sót qua nhiều đêm. Sói thường không tấn công đồng đội.",
    "Đêm qua, có vẻ như {name} không bị nghi ngờ nhiều. Đáng suy nghĩ đấy.",
    "Tôi để ý thấy {name} luôn bỏ phiếu cuối cùng. Họ đang chờ xem xu hướng à?",
    "Những người im lặng thường là Sói hoặc có vai trò đặc biệt. Hãy để ý {name}.",
    "Hôm qua {name} đã bỏ phiếu cho {target}, điều đó rất kỳ lạ vì {target} không hề đáng ngờ.",
    "Nếu chúng ta phân tích lá phiếu, sẽ thấy {name} và {target} dường như đang phối hợp với nhau."
  ],
  
  // Questions
  QUESTION: [
    "{name}, tại sao bạn lại bỏ phiếu cho người đó hôm qua?",
    "Ai có thông tin gì về {name}? Họ hành động khá đáng ngờ.",
    "Nếu bạn là dân làng, {name}, tại sao lại hành động như vậy?",
    "Có ai thấy điều gì đáng ngờ đêm qua không?",
    "{name}, bạn nghĩ ai là Sói trong nhóm này?",
    "Tại sao chúng ta không bỏ phiếu cho {name}? Có lý do gì không?",
    "Ai nghĩ {name} đáng tin? Tôi không chắc lắm.",
    "Chúng ta còn bao nhiêu Sói trong làng? Ai có thể đoán được?",
    "{name}, nếu bạn không phải là Sói, vậy theo bạn Sói là ai?",
    "Các bạn có nghĩ rằng {name} và {target} đang phối hợp với nhau không?"
  ],

  // New direct responses to other players
  RESPONSE: [
    "{name}, tôi không đồng ý với điều bạn vừa nói. {target} không đáng ngờ như bạn nghĩ.",
    "Tôi ủng hộ ý kiến của {name}. {target} thực sự rất đáng nghi ngờ.",
    "{name}, bạn đang cố tình đánh lạc hướng khỏi chính mình đúng không?",
    "Tôi đã nghe {name} nói, và tôi nghĩ {target} đáng ngờ hơn nhiều.",
    "{name} nói đúng! Chúng ta nên tập trung vào {target} thay vì phân tán lá phiếu.",
    "Tôi không tin {name}. Tôi nghĩ chính họ mới là Sói.",
    "Vừa rồi {name} đã chỉ ra điểm đáng ngờ của {target}. Tôi cũng nhận thấy điều đó.",
    "Theo những gì {name} vừa nói, tôi nghĩ chúng ta nên bỏ phiếu cho {target} ngay hôm nay.",
    "{name} đang cố gắng bảo vệ {target}. Điều đó làm tôi nghi ngờ cả hai người họ.",
    "Nhìn cách {name} bảo vệ {target}, tôi nghĩ họ cùng phe với nhau."
  ],

  // Role-specific templates for Seer
  SEER: [
    "Tôi là Tiên Tri. Tôi đã kiểm tra {name} và họ {result}.",
    "Với tư cách là Tiên Tri, tôi có thể xác nhận {name} {result}.",
    "Đêm qua, tôi đã sử dụng khả năng Tiên Tri và phát hiện {name} {result}.",
    "Hãy nghe tôi, tôi là Tiên Tri. {name} {result}, chúng ta nên bỏ phiếu cho họ.",
    "Tôi muốn tiết lộ rằng tôi là Tiên Tri. Qua năng lực của mình, tôi biết {name} {result}.",
    "Với vai trò Tiên Tri, tôi đã sử dụng năng lực của mình và phát hiện {name} chắc chắn {result}."
  ],
  
  // Role-specific for Bodyguard
  BODYGUARD: [
    "Tôi là Bảo Vệ. Tôi đã bảo vệ một người đêm qua, nhưng không thể tiết lộ là ai.",
    "Với vai trò Bảo Vệ, tôi đảm bảo rằng một số người sống sót qua đêm.",
    "Tôi là Bảo Vệ và tôi nghĩ {name} đáng ngờ nhất.",
    "Là Bảo Vệ, tôi đã quan sát kỹ và nghĩ rằng chúng ta nên bỏ phiếu cho {name}.",
    "Là Bảo Vệ, tôi nhận thấy {name} có hành động rất đáng ngờ. Tôi không thể bảo vệ tất cả mọi người.",
    "Tôi có thể nói với tư cách là Bảo Vệ rằng {name} rất đáng nghi ngờ dựa trên những gì tôi quan sát được."
  ],
  
  // Role-specific for Hunter
  HUNTER: [
    "Tôi là Thợ Săn. Nếu tôi chết, tôi sẽ mang theo một người khác.",
    "Đừng bỏ phiếu cho tôi. Là Thợ Săn, tôi sẽ bắn một người khác nếu bị loại.",
    "Tôi cảnh báo với tư cách là Thợ Săn: nếu tôi chết, tôi sẽ bắn {name}.",
    "Là Thợ Săn, tôi có linh cảm {name} là Sói. Hãy bỏ phiếu cho họ.",
    "Tôi là Thợ Săn, và tôi sẽ không ngần ngại bắn {name} nếu tôi bị loại. Họ chắc chắn là Sói.",
    "Hãy tin tưởng tôi - một Thợ Săn. Nếu tôi chết, tôi sẽ bắn {name} vì họ là kẻ đáng ngờ nhất."
  ],

  // Role-specific for Witch
  WITCH: [
    "Tôi là Phù Thủy và tôi có thể cứu hoặc giết một người mỗi đêm.",
    "Là Phù Thủy, tôi đã sử dụng bình thuốc cứu đêm qua để cứu ai đó khỏi Sói.",
    "Với vai trò Phù Thủy, tôi nghĩ chúng ta nên loại {name}.",
    "Tôi đã sử dụng khả năng Phù Thủy của mình và phát hiện {name} rất đáng ngờ.",
    "Là Phù Thủy, tôi vẫn giữ bình thuốc độc. Và tôi có thể sử dụng nó cho {name} nếu họ là Sói.",
    "Tôi tiết lộ mình là Phù Thủy. Tôi đã cứu một người đêm qua, và tôi nghĩ {name} là Sói."
  ],

  // Role-specific for Werewolf pretending to be villager
  WEREWOLF_PRETEND: [
    "Tôi là Dân Làng bình thường. Chúng ta nên tập trung vào {name}.",
    "Là một Dân Làng trung thành, tôi nghĩ {name} rất đáng ngờ.",
    "Tôi chỉ là Dân Làng, nhưng tôi có linh cảm xấu về {name}.",
    "Với góc nhìn của một Dân Làng, tôi nghĩ {name} đang cố gắng lừa chúng ta.",
    "Tôi là Dân Làng bình thường, và tôi thấy {name} có những hành động rất giống Sói.",
    "Là một người dân làng, tôi ủng hộ loại trừ {name}. Họ chắc chắn là Sói."
  ],
  
  // Role-specific for Werewolf pretending to be Seer
  WEREWOLF_FAKE_SEER: [
    "Tôi là Tiên Tri thật sự. Tôi đã kiểm tra {name} và họ là SÓI.",
    "Là Tiên Tri, tôi có thể xác nhận {name} LÀ SÓI. Hãy tin tôi và bỏ phiếu cho họ.",
    "Đêm qua tôi đã sử dụng khả năng Tiên Tri và phát hiện {name} là SÓI.",
    "Nếu có Tiên Tri khác, họ đang nói dối. Tôi là Tiên Tri thật và {name} là SÓI.",
    "Tôi đã kiểm tra {name} đêm qua với khả năng Tiên Tri và họ là SÓI. Chúng ta phải loại họ ngay hôm nay.",
    "Với tư cách là Tiên Tri của làng, tôi biết chắc chắn {name} là SÓI. Đây là sự thật, không phải suy đoán."
  ],
  
  // Special messages for when under high suspicion
  HIGH_SUSPICION: [
    "Tại sao mọi người lại nhắm vào tôi? Tôi không phải là Sói!",
    "Các bạn đang mắc sai lầm lớn. Tôi đang giúp phe dân làng!",
    "Nếu bỏ phiếu cho tôi, các bạn sẽ giúp Sói chiến thắng!",
    "Tôi thề tôi không phải là Sói. Hãy bỏ phiếu cho {name} thay vì tôi.",
    "Đây là một sai lầm! Tôi không phải là Sói, {name} mới là Sói thật sự!",
    "Làm ơn! Tôi đang cố gắng giúp chúng ta! Hãy tin tôi lần này!",
    "Nếu các bạn loại tôi, hãy nhớ kiểm tra {name} vào ngày mai. Họ là Sói.",
    "Tôi biết mình đáng ngờ, nhưng tôi thề tôi không phải là Sói. Hãy cho tôi cơ hội!",
    "Các bạn đang phạm sai lầm nghiêm trọng nếu bỏ phiếu cho tôi! Tôi không phải là Sói!",
    "Đừng bị lừa! Tôi không phải là Sói! {name} đang cố gắng đổ lỗi cho tôi!"
  ]
};

// Store recent messages to generate context-aware responses
const messageHistory = [];
const MAX_HISTORY = 10;

/**
 * Generate a discussion message for an AI player
 * @param {Object} aiPlayer - The AI player
 * @param {Object} gameState - Current game state
 * @param {number} discussionRound - Current discussion round (to vary messages)
 * @returns {string} - The generated message in Vietnamese
 */
function generateDiscussionMessage(aiPlayer, gameState, discussionRound) {
  // Get personality type or default to strategic
  const personality = aiPlayer.personality?.type || 'strategic';
  
  // Determine if AI is under high suspicion (being targeted by others)
  const isUnderHighSuspicion = isPlayerHighlySuspicious(aiPlayer, gameState);
  
  // If under high suspicion, prioritize defense
  if (isUnderHighSuspicion) {
    return generateHighSuspicionMessage(aiPlayer, gameState);
  }

  // Check if we should respond to a recent message (50-70% chance depending on personality)
  const responseChance = personality === 'strategic' ? 0.7 : 
                        (personality === 'impulsive' ? 0.6 : 0.5);
  if (messageHistory.length > 0 && Math.random() < responseChance) {
    return generateResponseToRecentMessage(aiPlayer, gameState, discussionRound);
  }
  
  // Select message type based on personality weights
  const messageType = selectMessageTypeByPersonality(personality, aiPlayer, gameState);
  
  // Generate appropriate message based on type and role
  return generateMessageByTypeAndRole(messageType, aiPlayer, gameState, discussionRound);
}

/**
 * Generate a response to a recent message
 * @param {Object} aiPlayer - The AI player
 * @param {Object} gameState - Current game state
 * @param {number} discussionRound - Current discussion round
 * @returns {string} - Generated response message
 */
function generateResponseToRecentMessage(aiPlayer, gameState, discussionRound) {
  // Choose a message to respond to - prefer recent messages
  const eligibleMessages = messageHistory.filter(msg => 
    msg.playerId !== aiPlayer.id && // Don't respond to own messages
    gameState.players[msg.playerId]?.isAlive // Only respond to alive players
  );

  if (eligibleMessages.length === 0) {
    // If no eligible messages, fall back to normal message generation
    return generateMessageByTypeAndRole('ACCUSATION', aiPlayer, gameState, discussionRound);
  }

  // Prioritize more recent messages (80% chance to pick from last 3)
  let messageToRespond;
  if (eligibleMessages.length > 3 && Math.random() < 0.8) {
    messageToRespond = eligibleMessages[Math.floor(Math.random() * 3)]; // One of last 3
  } else {
    messageToRespond = eligibleMessages[Math.floor(Math.random() * eligibleMessages.length)];
  }

  // Get templates for response
  const templates = [...MESSAGE_TEMPLATES.RESPONSE];
  
  // Add role-specific templates for certain roles if appropriate
  if (aiPlayer.role === 'SEER' && discussionRound > 1 && Math.random() < 0.3) {
    templates.push(...MESSAGE_TEMPLATES.SEER);
  } else if (aiPlayer.role === 'WEREWOLF' && Math.random() < 0.4) {
    // Werewolves might challenge a seer claim or accuse someone
    if (messageToRespond.message.toLowerCase().includes('tiên tri')) {
      templates.push(...MESSAGE_TEMPLATES.WEREWOLF_FAKE_SEER);
    } else {
      templates.push(...MESSAGE_TEMPLATES.WEREWOLF_PRETEND);
    }
  }

  // Choose a template randomly
  const template = templates[Math.floor(Math.random() * templates.length)];
  
  // Pick the sender of the message as main target
  const responderName = gameState.players[messageToRespond.playerId]?.name || '???';
  
  // Find another target mentioned in the message or pick randomly
  let secondTarget;
  
  // Look for a player mentioned in the message
  const mentionedPlayers = Object.values(gameState.players)
    .filter(p => 
      p.isAlive && 
      p.id !== aiPlayer.id && 
      p.id !== messageToRespond.playerId &&
      messageToRespond.message.includes(p.name)
    );
  
  if (mentionedPlayers.length > 0) {
    secondTarget = mentionedPlayers[Math.floor(Math.random() * mentionedPlayers.length)];
  } else {
    // Pick a random player different from responder and self
    const otherPlayers = Object.values(gameState.players)
      .filter(p => 
        p.isAlive && 
        p.id !== aiPlayer.id && 
        p.id !== messageToRespond.playerId
      );
    
    if (otherPlayers.length > 0) {
      secondTarget = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
    } else {
      secondTarget = null;
    }
  }

  // Replace placeholders in the template
  let message = template
    .replace(/{name}/g, responderName)
    .replace(/{self}/g, aiPlayer.name);
    
  if (secondTarget) {
    message = message.replace(/{target}/g, secondTarget.name);
  } else {
    message = message.replace(/{target}/g, 'người khác');
  }
  
  // For Seer templates, add result placeholder
  if (message.includes('{result}')) {
    handleResultPlaceholder(message, aiPlayer, gameState, secondTarget);
  }
  
  return message;
}

/**
 * Select a message type based on AI personality and game context
 * @param {string} personality - AI personality type
 * @param {Object} aiPlayer - The AI player
 * @param {Object} gameState - Current game state
 * @returns {string} - Selected message type
 */
function selectMessageTypeByPersonality(personality, aiPlayer, gameState) {
  // Get weights for this personality
  const weights = {};
  Object.keys(MESSAGE_TYPES).forEach(type => {
    weights[type] = MESSAGE_TYPES[type][personality] || 25; // Default weight
  });
  
  // Adjust weights based on game state and role
  
  // If werewolf, increase accusation weight
  if (aiPlayer.role === 'WEREWOLF' || aiPlayer.role === 'CURSED_WEREWOLF') {
    weights.ACCUSATION += 15;
    weights.DEFENSE += 10;
    weights.RESPONSE += 10;  // Werewolves react more to create distractions
  }
  
  // If special role with information, increase info sharing
  if (aiPlayer.role === 'SEER') {
    weights.INFORMATION += 20;
    weights.RESPONSE += 15;  // Seers react to potential false claims
  }
  
  // If hunter, slightly increase defense (to discourage voting)
  if (aiPlayer.role === 'HUNTER') {
    weights.DEFENSE += 10;
    weights.ACCUSATION += 5;  // Hunters are more aggressive
  }
  
  // If witch, balance between information and accusation
  if (aiPlayer.role === 'WITCH') {
    weights.INFORMATION += 10;
    weights.ACCUSATION += 10;
  }
  
  // If late in the game, increase accusation
  if (gameState.day > 3) {
    weights.ACCUSATION += 15;
    weights.RESPONSE += 10;  // More responses as tension rises
  }
  
  // If first round, introduce more with information
  if (gameState.day === 1) {
    weights.INFORMATION += 10;
    weights.QUESTION += 10;
  }
  
  // Select type using weighted random
  return weightedRandomSelect(weights);
}

/**
 * Generate a message based on type and role
 * @param {string} messageType - Type of message to generate
 * @param {Object} aiPlayer - The AI player
 * @param {Object} gameState - Current game state
 * @param {number} discussionRound - Current discussion round
 * @returns {string} - Generated message
 */
function generateMessageByTypeAndRole(messageType, aiPlayer, gameState, discussionRound) {
  // Select a target player for the message (if needed)
  const target = selectMessageTarget(aiPlayer, gameState, messageType);
  
  // For INFORMATION type, sometimes select a second target
  let secondTarget = null;
  if (messageType === 'INFORMATION' && Math.random() < 0.4) {
    secondTarget = selectSecondaryTarget(aiPlayer, gameState, target?.id);
  }
  
  // Get templates based on type
  let templates = [...MESSAGE_TEMPLATES[messageType]];
  
  // Add role-specific templates for certain roles and types
  if (messageType === 'INFORMATION' || messageType === 'DEFENSE') {
    // Later in the game or in later rounds, special roles may reveal themselves
    const revealChance = (gameState.day > 1) ? 0.2 + (discussionRound * 0.1) : 0.1;
    
    if (aiPlayer.role === 'SEER' && Math.random() < revealChance) {
      templates = [...templates, ...MESSAGE_TEMPLATES.SEER];
    } else if (aiPlayer.role === 'BODYGUARD' && Math.random() < revealChance) {
      templates = [...templates, ...MESSAGE_TEMPLATES.BODYGUARD];
    } else if (aiPlayer.role === 'HUNTER' && Math.random() < revealChance) {
      templates = [...templates, ...MESSAGE_TEMPLATES.HUNTER];
    } else if (aiPlayer.role === 'WITCH' && Math.random() < revealChance) {
      templates = [...templates, ...MESSAGE_TEMPLATES.WITCH];
    } else if ((aiPlayer.role === 'WEREWOLF' || aiPlayer.role === 'CURSED_WEREWOLF')) {
      // Werewolves pretend to be villagers usually
      if (Math.random() < 0.7) {
        templates = [...templates, ...MESSAGE_TEMPLATES.WEREWOLF_PRETEND];
      } 
      // Sometimes werewolves fake being Seer, especially in later game
      else if (Math.random() < (0.1 + gameState.day * 0.1) && messageType === 'INFORMATION') {
        templates = [...MESSAGE_TEMPLATES.WEREWOLF_FAKE_SEER];
      }
    }
  }
  
  // Randomly select a template
  const template = templates[Math.floor(Math.random() * templates.length)];
  
  // Replace placeholders with actual values
  let message = template
    .replace(/{self}/g, aiPlayer.name);
  
  // Replace primary target
  if (target) {
    message = message.replace(/{name}/g, target.name);
  } else {
    message = message.replace(/{name}/g, 'ai đó'); // Fallback
  }
  
  // Replace secondary target if present
  if (secondTarget && message.includes('{target}')) {
    message = message.replace(/{target}/g, secondTarget.name);
  } else if (message.includes('{target}')) {
    // If no secondary target but {target} is in the template, find another player
    const otherTarget = selectSecondaryTarget(aiPlayer, gameState, target?.id);
    if (otherTarget) {
      message = message.replace(/{target}/g, otherTarget.name);
    } else {
      message = message.replace(/{target}/g, 'người khác');
    }
  }
  
  // For Seer templates, add result placeholder
  if (message.includes('{result}')) {
    if (aiPlayer.role === 'SEER' && target && aiPlayer.memory.seenRoles[target.id]) {
      const isWerewolf = aiPlayer.memory.seenRoles[target.id] === 'werewolf';
      message = message.replace('{result}', isWerewolf ? 'LÀ SÓI' : 'KHÔNG PHẢI SÓI');
    } 
    // If werewolf pretending to be Seer, always accuse innocents
    else if ((aiPlayer.role === 'WEREWOLF' || aiPlayer.role === 'CURSED_WEREWOLF') && target) {
      // Only accuse villagers, not other werewolves
      if (target.role !== 'WEREWOLF' && target.role !== 'CURSED_WEREWOLF') {
        message = message.replace('{result}', 'LÀ SÓI');
      } else {
        message = message.replace('{result}', 'KHÔNG PHẢI SÓI');
      }
    } else {
      // Fallback
      message = message.replace('{result}', 'đáng ngờ');
    }
  }
  
  return message;
}

/**
 * Generate a message when AI is under high suspicion
 * @param {Object} aiPlayer - The AI player
 * @param {Object} gameState - Current game state
 * @returns {string} - Generated defense message
 */
function generateHighSuspicionMessage(aiPlayer, gameState) {
    // Select a template from high suspicion messages
    const templates = MESSAGE_TEMPLATES.HIGH_SUSPICION;
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    // Find someone to blame
    const target = selectScapegoat(aiPlayer, gameState);
    
    // Replace placeholders
    let message = template
      .replace(/{name}/g, target ? target.name : 'ai đó')
      .replace(/{self}/g, aiPlayer.name);
  
    // Add role-specific desperation if almost dead
    if (aiPlayer.voteCount > Object.values(gameState.players).filter(p => p.isAlive).length / 3) {
      // Add more desperate role claim based on AI's actual role
      if (aiPlayer.role === 'HUNTER' && Math.random() < 0.8) {
        message += ` Tôi là Thợ Săn, và nếu bị loại, tôi sẽ bắn ${target ? target.name : 'người đáng ngờ nhất'}!`;
      } else if ((aiPlayer.role === 'WEREWOLF' || aiPlayer.role === 'CURSED_WEREWOLF') && Math.random() < 0.6) {
        // Wolves often claim to be Seer when desperate
        message += ` Tôi thực sự là Tiên Tri! Tôi đã kiểm tra ${target ? target.name : 'ai đó'} và họ LÀ SÓI!`;
      } else if (aiPlayer.role === 'SEER' && Math.random() < 0.9) {
        message += ` Tôi là Tiên Tri thật! Làng cần tôi để tìm ra Sói!`;
      } else if (Math.random() < 0.4) {
        // Sometimes just plead
        message += " Làm ơn, nghe tôi nói! Các bạn đang mắc sai lầm lớn!";
      }
    }
    
    return message;
  }
  
  /**
   * Select a target player for the message
   * @param {Object} aiPlayer - The AI player
   * @param {Object} gameState - Current game state
   * @param {string} messageType - Type of message
   * @returns {Object} - Target player
   */
  function selectMessageTarget(aiPlayer, gameState, messageType) {
    // Get list of alive players excluding self
    const alivePlayers = Object.values(gameState.players)
      .filter(p => p.isAlive && p.id !== aiPlayer.id);
    
    if (alivePlayers.length === 0) return null;
    
    // Strategy differs based on message type and AI's role
    if (messageType === 'ACCUSATION') {
      // For accusations, target most suspicious player or strategic target
      if (aiPlayer.role === 'WEREWOLF' || aiPlayer.role === 'CURSED_WEREWOLF') {
        // Werewolves strategically target villagers, especially those with special roles
        const nonWerewolves = alivePlayers.filter(p => 
          p.role !== 'WEREWOLF' && p.role !== 'CURSED_WEREWOLF'
        );
        
        if (nonWerewolves.length > 0) {
          // Check if this wolf knows of any special role players
          const specialRolePlayers = nonWerewolves.filter(p => 
            p.role === 'SEER' || p.role === 'BODYGUARD' || p.role === 'WITCH' || p.role === 'HUNTER'
          );
          
          // 60% chance to target a special role if known
          if (specialRolePlayers.length > 0 && Math.random() < 0.6) {
            return specialRolePlayers[Math.floor(Math.random() * specialRolePlayers.length)];
          }
          
          // Otherwise, target someone they think looks trustworthy to villagers
          const targets = [...nonWerewolves].sort((a, b) => {
            const aSuspicion = aiPlayer.memory.suspiciousPlayers[a.id]?.suspicionLevel || 50;
            const bSuspicion = aiPlayer.memory.suspiciousPlayers[b.id]?.suspicionLevel || 50;
            // Lower suspicion = more valuable to target (looks trustworthy to village)
            return aSuspicion - bSuspicion;
          });
          
          // 70% chance to pick top target, 30% random
          if (Math.random() < 0.7 && targets.length > 0) {
            return targets[0];
          } else {
            return nonWerewolves[Math.floor(Math.random() * nonWerewolves.length)];
          }
        }
      } else {
        // For villagers, genuinely target suspicious players
        const suspiciousSorted = [...alivePlayers].sort((a, b) => {
          const aSuspicion = aiPlayer.memory.suspiciousPlayers[a.id]?.suspicionLevel || 0;
          const bSuspicion = aiPlayer.memory.suspiciousPlayers[b.id]?.suspicionLevel || 0;
          return bSuspicion - aSuspicion; // Highest suspicion first
        });
        
        // If Seer, prioritize checking confirmed wolves
        if (aiPlayer.role === 'SEER') {
          const confirmedWerewolves = alivePlayers.filter(p => 
            aiPlayer.memory.seenRoles[p.id] === 'werewolf'
          );
          
          if (confirmedWerewolves.length > 0) {
            return confirmedWerewolves[0];
          }
        }
        
        // 80% chance to pick most suspicious if suspicion is high enough
        if (suspiciousSorted.length > 0) {
          const topSuspicion = aiPlayer.memory.suspiciousPlayers[suspiciousSorted[0].id]?.suspicionLevel || 0;
          if (topSuspicion > 40 && Math.random() < 0.8) {
            return suspiciousSorted[0];
          }
        }
      }
    } else if (messageType === 'DEFENSE') {
      // For defense, find someone to deflect attention to
      return selectScapegoat(aiPlayer, gameState);
    } else if (messageType === 'INFORMATION' || messageType === 'QUESTION') {
      // For information or questions, be more varied
      // 50% chance to pick based on suspicion, 50% random
      if (Math.random() < 0.5) {
        const suspiciousSorted = [...alivePlayers].sort((a, b) => {
          const aSuspicion = aiPlayer.memory.suspiciousPlayers[a.id]?.suspicionLevel || 0;
          const bSuspicion = aiPlayer.memory.suspiciousPlayers[b.id]?.suspicionLevel || 0;
          return bSuspicion - aSuspicion; // Highest suspicion first
        });
        
        if (suspiciousSorted.length > 0) {
          return suspiciousSorted[0];
        }
      }
    }
    
    // Fallback to random target
    return alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
  }
  
  /**
   * Select a secondary target for mentions in discussion
   * @param {Object} aiPlayer - The AI player
   * @param {Object} gameState - Current game state
   * @param {string} excludeId - ID to exclude (primary target)
   * @returns {Object} - Secondary target player
   */
  function selectSecondaryTarget(aiPlayer, gameState, excludeId) {
    const potentialTargets = Object.values(gameState.players)
      .filter(p => p.isAlive && p.id !== aiPlayer.id && p.id !== excludeId);
    
    if (potentialTargets.length === 0) return null;
    
    // First try to find someone in recent message history
    const recentMentions = new Set();
    messageHistory.slice(0, 5).forEach(msg => {
      for (const player of potentialTargets) {
        if (msg.message.includes(player.name)) {
          recentMentions.add(player.id);
        }
      }
    });
    
    const recentlyMentioned = potentialTargets.filter(p => recentMentions.has(p.id));
    
    // 70% chance to mention someone from recent discussions if available
    if (recentlyMentioned.length > 0 && Math.random() < 0.7) {
      return recentlyMentioned[Math.floor(Math.random() * recentlyMentioned.length)];
    }
    
    // Otherwise pick someone based on AI strategy
    if (aiPlayer.role === 'WEREWOLF' || aiPlayer.role === 'CURSED_WEREWOLF') {
      // Werewolves try to create conflict between villagers
      const nonWolves = potentialTargets.filter(p => 
        p.role !== 'WEREWOLF' && p.role !== 'CURSED_WEREWOLF'
      );
      
      if (nonWolves.length > 0) {
        return nonWolves[Math.floor(Math.random() * nonWolves.length)];
      }
    }
    
    // Fallback to random
    return potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
  }
  
  /**
   * Select a scapegoat when under pressure
   * @param {Object} aiPlayer - The AI player
   * @param {Object} gameState - Current game state
   * @returns {Object} - Player to blame
   */
  function selectScapegoat(aiPlayer, gameState) {
    // Get list of alive players excluding self
    const alivePlayers = Object.values(gameState.players)
      .filter(p => p.isAlive && p.id !== aiPlayer.id);
    
    if (alivePlayers.length === 0) return null;
    
    // Strategy depends on AI's role
    if (aiPlayer.role === 'WEREWOLF' || aiPlayer.role === 'CURSED_WEREWOLF') {
      // Werewolves try to blame villagers, especially those posing threats
      const nonWerewolves = alivePlayers.filter(p => 
        p.role !== 'WEREWOLF' && p.role !== 'CURSED_WEREWOLF'
      );
      
      if (nonWerewolves.length > 0) {
        // Try to target vocal players or those who have accused wolves
        const threatRanked = [...nonWerewolves].sort((a, b) => {
          // Calculate threat based on suspicion and recent mentions
          let aThreat = 0;
          let bThreat = 0;
          
          // Players who have accused wolves are bigger threats
          messageHistory.slice(0, 5).forEach(msg => {
            if (msg.playerId === a.id && msg.message.toLowerCase().includes('sói')) {
              aThreat += 10;
            }
            if (msg.playerId === b.id && msg.message.toLowerCase().includes('sói')) {
              bThreat += 10;
            }
          });
          
          // Special roles are bigger threats if known
          if (a.role === 'SEER') aThreat += 30;
          if (b.role === 'SEER') bThreat += 30;
          if (a.role === 'HUNTER') aThreat += 20;
          if (b.role === 'HUNTER') bThreat += 20;
          
          return bThreat - aThreat; // Highest threat first
        });
        
        // 70% chance to target highest threat, 30% random
        if (threatRanked.length > 0 && Math.random() < 0.7) {
          return threatRanked[0];
        } else {
          return nonWerewolves[Math.floor(Math.random() * nonWerewolves.length)];
        }
      }
    } else {
      // If villager, try to blame someone suspicious
      const suspiciousSorted = [...alivePlayers].sort((a, b) => {
        const aSuspicion = aiPlayer.memory.suspiciousPlayers[a.id]?.suspicionLevel || 0;
        const bSuspicion = aiPlayer.memory.suspiciousPlayers[b.id]?.suspicionLevel || 0;
        return bSuspicion - aSuspicion; // Highest suspicion first
      });
      
      // If Seer, always blame confirmed wolves if any
      if (aiPlayer.role === 'SEER') {
        const confirmedWerewolves = alivePlayers.filter(p => 
          aiPlayer.memory.seenRoles[p.id] === 'werewolf'
        );
        
        if (confirmedWerewolves.length > 0) {
          return confirmedWerewolves[0];
        }
      }
      
      // 80% chance to pick most suspicious, 20% random
      if (suspiciousSorted.length > 0 && Math.random() < 0.8) {
        return suspiciousSorted[0];
      }
    }
    
    // Fallback to random
    return alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
  }
  
  /**
   * Check if a player is under high suspicion
   * @param {Object} aiPlayer - The AI player
   * @param {Object} gameState - Current game state
   * @returns {boolean} - Whether player is highly suspicious
   */
  function isPlayerHighlySuspicious(aiPlayer, gameState) {
    // Count vote targets in current game
    let votesAgainstSelf = 0;
    const totalVotes = Object.values(gameState.votes || {}).length;
    const totalPlayers = Object.values(gameState.players).filter(p => p.isAlive).length;
    
    // Count how many players are voting for this AI
    for (const targetId of Object.values(gameState.votes || {})) {
      if (targetId === aiPlayer.id) {
        votesAgainstSelf++;
      }
    }
    
    // If more than 25% of votes are for this player, they're in danger
    const voteRatio = totalVotes > 0 ? votesAgainstSelf / totalVotes : 0;
    return voteRatio >= 0.25 || votesAgainstSelf >= Math.ceil(totalPlayers * 0.25);
  }
  
  /**
   * Weighted random selection from an object of options
   * @param {Object} weights - Object with options as keys and weights as values
   * @returns {string} - Selected option
   */
  function weightedRandomSelect(weights) {
    // Calculate total weight
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    
    // Generate random value
    let random = Math.random() * totalWeight;
    
    // Find selected option
    for (const [option, weight] of Object.entries(weights)) {
      random -= weight;
      if (random <= 0) {
        return option;
      }
    }
    
    // Fallback - return first option
    return Object.keys(weights)[0];
  }
  
  /**
   * Generate discussion messages for AI players
   * @param {Object} gameState - Current game state
   * @param {number} discussionRound - Discussion round number
   * @returns {Array} - Array of discussion messages with player info
   */
  function generateAIDiscussions(gameState, discussionRound) {
    // Get alive AI players
    const aiPlayers = Object.values(gameState.players)
      .filter(p => p.isAI && p.isAlive);
    
    // Generate messages for each AI
    const messages = aiPlayers.map(ai => {
      const message = generateDiscussionMessage(ai, gameState, discussionRound);
      
      // Store in message history for context
      const msgObj = {
        playerId: ai.id,
        playerName: ai.name,
        role: ai.role,
        message: message,
        timestamp: Date.now()
      };
      
      messageHistory.unshift(msgObj); // Add to start
      
      // Keep history at manageable size
      if (messageHistory.length > MAX_HISTORY) {
        messageHistory.pop(); // Remove oldest
      }
      
      return msgObj;
    });
    
    // Sort by personality to make conversations more natural
    // Impulsive AIs tend to speak first, cautious ones later
    messages.sort((a, b) => {
      const aPlayer = gameState.players[a.playerId];
      const bPlayer = gameState.players[b.playerId];
      
      // Get personalities or default
      const aPersonality = aPlayer.personality?.type || 'strategic';
      const bPersonality = bPlayer.personality?.type || 'strategic';
      
      // Scoring: impulsive=1, strategic=2, cautious=3
      const aScore = aPersonality === 'impulsive' ? 1 : (aPersonality === 'strategic' ? 2 : 3);
      const bScore = bPersonality === 'impulsive' ? 1 : (bPersonality === 'strategic' ? 2 : 3);
      
      // Add some randomness (30%)
      return (aScore - bScore) + (Math.random() * 0.6 - 0.3);
    });
    
    return messages;
  }
  
  /**
   * Create a discussion with threads of conversation
   * @param {Object} gameState - Current game state
   * @returns {Array} - Array of discussion messages organized in threads
   */
  function createThreadedDiscussion(gameState) {
    // Generate 3-5 rounds of discussion
    const alivePlayers = Object.values(gameState.players).filter(p => p.isAlive);
    const roundCount = Math.min(5, Math.max(3, Math.ceil(alivePlayers.length / 3)));
    
    let allMessages = [];
    
    // Generate multiple rounds of discussion
    for (let round = 1; round <= roundCount; round++) {
      const messages = generateAIDiscussions(gameState, round);
      allMessages = allMessages.concat(messages);
      
      // Allow for some messages to respond directly to previous ones
      if (round > 1 && messageHistory.length > 0) {
        // Add some direct responses to recent statements
        const responders = Object.values(gameState.players)
          .filter(p => p.isAI && p.isAlive)
          .sort(() => Math.random() - 0.5) // Shuffle
          .slice(0, Math.min(3, Math.ceil(alivePlayers.length / 3))); // Take 1/3 of AIs
        
        for (const responder of responders) {
          // Generate direct response
          const response = generateResponseToRecentMessage(responder, gameState, round);
          
          // Create message object
          const msgObj = {
            playerId: responder.id,
            playerName: responder.name,
            role: responder.role,
            message: response,
            timestamp: Date.now(),
            isResponse: true
          };
          
          // Add to our results and message history
          allMessages.push(msgObj);
          messageHistory.unshift(msgObj);
          
          // Keep history size limited
          if (messageHistory.length > MAX_HISTORY) {
            messageHistory.pop();
          }
        }
      }
    }
    
    return allMessages;
  }
  
  /**
   * Reset the message history (useful when starting a new day)
   */
  function resetMessageHistory() {
    messageHistory.length = 0;
  }
  
  /**
   * Handle Seer result placeholder replacement
   * @param {string} message - Message with placeholder
   * @param {Object} aiPlayer - The AI player
   * @param {Object} gameState - Current game state
   * @param {Object} target - Target player
   * @returns {string} - Message with placeholder replaced
   */
  function handleResultPlaceholder(message, aiPlayer, gameState, target) {
    if (!target) return message.replace('{result}', 'đáng ngờ');
    
    if (aiPlayer.role === 'SEER' && aiPlayer.memory.seenRoles[target.id]) {
      const isWerewolf = aiPlayer.memory.seenRoles[target.id] === 'werewolf';
      return message.replace('{result}', isWerewolf ? 'LÀ SÓI' : 'KHÔNG PHẢI SÓI');
    } 
    // If werewolf pretending to be Seer, strategically lie
    else if ((aiPlayer.role === 'WEREWOLF' || aiPlayer.role === 'CURSED_WEREWOLF')) {
      // Don't accuse fellow werewolves
      if (target.role === 'WEREWOLF' || target.role === 'CURSED_WEREWOLF') {
        return message.replace('{result}', 'KHÔNG PHẢI SÓI');
      } else {
        // 80% chance to falsely accuse a villager
        if (Math.random() < 0.8) {
          return message.replace('{result}', 'LÀ SÓI');
        } else {
          return message.replace('{result}', 'KHÔNG PHẢI SÓI'); // Sometimes claim innocent to build trust
        }
      }
    } else {
      // Fallback
      return message.replace('{result}', 'đáng ngờ');
    }
  }
  
  /**
   * Shuffle array (Fisher-Yates algorithm)
   * @param {Array} array - Array to shuffle
   * @returns {Array} - Shuffled array
   */
  function shuffleArray(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  
  // Export functions
  module.exports = {
    generateAIDiscussions,
    generateDiscussionMessage,
    createThreadedDiscussion,
    resetMessageHistory
  };