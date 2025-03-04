// modules/werewolf/ai/geminiDiscussion.js
/**
 * Gemini API integration for Werewolf AI discussions
 * 
 * This module enhances AI discussions using Google's Gemini API
 * to generate more natural and contextually relevant responses.
 * Uses the official @google/generative-ai library.
 */

// Import the Google Generative AI library instead of axios
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getRole } = require('../roles');

// Replace with your actual Gemini API key
const GEMINI_API_KEY = 'AIzaSyC_8K-M-K8coP37yyRnyjZ3YzIbiOCSVKc';

// Initialize the Generative AI API
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Store previously used messages to track conversation threads
const messageHistory = [];
const MAX_HISTORY = 10; // Keep track of the last 10 messages

// Cache to avoid repeated API calls for similar prompts
const responseCache = new Map();

/**
 * Generate a discussion message using Gemini API
 * @param {Object} aiPlayer - The AI player
 * @param {Object} gameState - Current game state
 * @returns {Promise<string>} - Generated message in Vietnamese
 */
async function generateGeminiMessage(aiPlayer, gameState) {
  try {
    // Create context for the AI
    const playerContext = createPlayerContext(aiPlayer, gameState);
    const historyContext = createHistoryContext(messageHistory);
    
    // Build a prompt that instructs the model on what to generate
    const prompt = `
${playerContext}

${historyContext}

Bạn là ${aiPlayer.name}, một người chơi trong trò chơi Ma Sói. Hãy viết chỉ MỘT câu thảo luận ngắn (dưới 20 từ) bằng tiếng Việt dựa trên vai trò, tình hình trò chơi và lịch sử tin nhắn.

Phản hồi PHẢI:
- Hoàn toàn bằng tiếng Việt
- KHÔNG bắt đầu với tên của bạn (${aiPlayer.name})
- Ngắn gọn (dưới 20 từ)
- Tự nhiên, như thật
- Phù hợp với vai trò của bạn
- Không lặp lại những gì người khác đã nói

Nếu bạn là SÓI (${aiPlayer.role === 'WEREWOLF' || aiPlayer.role === 'CURSED_WEREWOLF' ? 'đúng vậy' : 'không phải'}), hãy cố gắng lừa dối và đổ lỗi cho người vô tội.

KHÔNG bao gồm dialogue markers như ":", "-", hay tên người chơi.
`;

    // Check cache for this player and day
    const cacheKey = `${aiPlayer.id}-${gameState.day}-${messageHistory.length}`;
    if (responseCache.has(cacheKey)) {
      return responseCache.get(cacheKey);
    }

    // Generate content using the Gemini model
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-lite" // Using the flash model for faster responses
    });

    const result = await model.generateContent(prompt);
    const response = result.response;
    let generatedText = response.text().trim();

    // Clean up the response - remove any unwanted artifacts
    generatedText = generatedText
      .replace(/^["']|["']$/g, '')  // Remove quotes at start/end
      .replace(/^[-:] */g, '')      // Remove dialogue dashes or colons
      .replace(/^[*]|[*]$/g, '')    // Remove asterisks at start/end
      .replace(/^.*?: /g, '')       // Remove name prefixes like "Bot-Name: "
      .replace(/^\s*<.*?>/, '')     // Remove HTML-like tags at the beginning
      .replace(/<.*?>\s*$/, '');    // Remove HTML-like tags at the end

    // Remove the player's name if it appears at the start
    if (generatedText.startsWith(aiPlayer.name + ":")) {
      generatedText = generatedText.substring(aiPlayer.name.length + 1).trim();
    }
    if (generatedText.startsWith(aiPlayer.name + " ")) {
      generatedText = generatedText.substring(aiPlayer.name.length).trim();
    }

    // Store in cache
    responseCache.set(cacheKey, generatedText);
    
    // If response is empty or error occurred, use fallback
    if (!generatedText) {
      return fallbackDiscussionMessage(aiPlayer, gameState);
    }
    
    return generatedText;

  } catch (error) {
    console.error('[ERROR-GEMINI] API call failed:', error.message);
    
    // Fallback to basic discussion if API fails
    return fallbackDiscussionMessage(aiPlayer, gameState);
  }
}

/**
 * Create player context information
 * @param {Object} aiPlayer - The AI player
 * @param {Object} gameState - Current game state
 * @returns {string} - Context string for Gemini
 */
function createPlayerContext(aiPlayer, gameState) {
  const role = getRole(aiPlayer.role);
  const personality = aiPlayer.personality?.type || 'strategic';
  
  // Get suspicion information
  const suspicions = [];
  for (const [playerId, suspicion] of Object.entries(aiPlayer.memory.suspiciousPlayers || {})) {
    if (gameState.players[playerId]?.isAlive) {
      suspicions.push(`- ${gameState.players[playerId].name}: ${suspicion.suspicionLevel}/100 suspicion`);
    }
  }

  // Get information specific to roles
  let roleSpecificInfo = '';
  if (aiPlayer.role === 'SEER' && aiPlayer.memory.seenRoles) {
    const seenPlayers = [];
    for (const [playerId, result] of Object.entries(aiPlayer.memory.seenRoles)) {
      if (gameState.players[playerId]?.isAlive) {
        seenPlayers.push(`- ${gameState.players[playerId].name}: ${result === 'werewolf' ? 'LÀ SÓI' : 'KHÔNG PHẢI SÓI'}`);
      }
    }
    if (seenPlayers.length > 0) {
      roleSpecificInfo += `\nKết quả tiên tri của bạn:\n${seenPlayers.join('\n')}`;
    }
  } else if ((aiPlayer.role === 'WEREWOLF' || aiPlayer.role === 'CURSED_WEREWOLF') && gameState.werewolfIds) {
    const otherWolves = gameState.werewolfIds
      .filter(id => id !== aiPlayer.id)
      .map(id => gameState.players[id]?.name)
      .filter(Boolean);
    
    if (otherWolves.length > 0) {
      roleSpecificInfo += `\nĐồng đội Ma Sói của bạn: ${otherWolves.join(', ')}`;
    }
  }

  // Get a list of all alive players
  const alivePlayers = Object.values(gameState.players)
    .filter(p => p.isAlive)
    .map(p => p.name)
    .join(', ');

  return `# Thông tin người chơi và trò chơi:
- Tên của bạn: ${aiPlayer.name}
- Vai trò của bạn: ${role?.name || aiPlayer.role}
- Phe của bạn: ${aiPlayer.role === 'WEREWOLF' || aiPlayer.role === 'CURSED_WEREWOLF' ? 'MA SÓI' : 'DÂN LÀNG'}
- Tính cách của bạn: ${personality}
- Ngày trong trò chơi: ${gameState.day}
- Người chơi còn sống: ${alivePlayers}
- Số người còn sống: ${Object.values(gameState.players).filter(p => p.isAlive).length}
- Số người đã chết: ${Object.values(gameState.players).filter(p => !p.isAlive).length}

# Mức độ nghi ngờ của bạn với người khác:
${suspicions.join('\n') || "Chưa có thông tin nghi ngờ."}
${roleSpecificInfo}

# Nhiệm vụ của bạn:
${aiPlayer.role === 'WEREWOLF' || aiPlayer.role === 'CURSED_WEREWOLF' ? 
  '- Bạn là Ma Sói, hãy giấu danh tính thật và đổ lỗi cho người khác' : 
  '- Bạn là Dân Làng, hãy tìm ra ai là Ma Sói và bảo vệ bản thân'}`;
}

/**
 * Create message history context
 * @param {Array} messageHistory - Previous messages
 * @returns {string} - Context string for message history
 */
function createHistoryContext(messageHistory) {
  if (!messageHistory || messageHistory.length === 0) {
    return '# Lịch sử thảo luận: Chưa có tin nhắn nào.';
  }

  // Take only last few messages for context
  const recentMessages = messageHistory.slice(0, 5);
  
  const formattedHistory = recentMessages.map(msg => 
    `${msg.playerName}: ${msg.message}`
  ).join('\n');

  return `# Lịch sử thảo luận gần đây:\n${formattedHistory}`;
}

/**
 * Fallback function if Gemini API fails
 * @param {Object} aiPlayer - The AI player
 * @param {Object} gameState - Current game state 
 * @returns {string} - Basic discussion message
 */
function fallbackDiscussionMessage(aiPlayer, gameState) {
  // Get more diverse fallback messages based on role and game state
  const templates = {
    werewolf: [
      "Tôi nghĩ {name} rất đáng ngờ sau cách họ phản ứng vừa rồi.",
      "Chúng ta nên tập trung vào {name}, họ đang cố né tránh câu hỏi.",
      "Hành động của {name} không bình thường chút nào.",
      "Tôi thấy {name} lảng tránh khi bị chất vấn, rất đáng ngờ.",
      "Có ai để ý cách {name} luôn im lặng khi đề cập đến người chết không?"
    ],
    seer: [
      "Tôi đã kiểm tra {name} đêm qua, họ không phải Sói.",
      "Theo thông tin tôi có, {name} đáng nghi ngờ nhất.",
      "Làng nên nghe tôi, {name} cần được kiểm tra kỹ hơn.",
      "Tôi có lý do để tin rằng {name} không đáng tin.",
      "Dựa vào quan sát của tôi, {name} có vẻ an toàn."
    ],
    villager: [
      "Tôi không có thông tin gì đặc biệt, nhưng {name} trông khả nghi.",
      "Ai đó có thông tin về {name} không? Tôi cảm thấy họ hành động lạ.",
      "Theo logic, chúng ta nên loại trừ {name} trước.",
      "Tôi vẫn đang quan sát để tìm manh mối về Sói.",
      "Bỏ phiếu loại {name} có vẻ là lựa chọn an toàn nhất lúc này."
    ],
    hunter: [
      "Cẩn thận với quyết định của các bạn, tôi có cách để đáp trả.",
      "Nếu tôi bị loại, tôi sẽ mang theo {name} đi cùng.",
      "Tôi đề nghị tất cả suy nghĩ kỹ trước khi bỏ phiếu hôm nay.",
      "Ai là người đáng ngờ nhất? Tôi đang cân nhắc mục tiêu của mình.",
      "{name} cần giải thích rõ ràng hơn về hành động đêm qua."
    ],
    bodyguard: [
      "Tôi sẽ làm tốt nhiệm vụ của mình đêm nay.",
      "Mọi người nên cẩn thận, Sói có vẻ đang nhắm vào những người quan trọng.",
      "Hãy giữ an toàn cho những người có vai trò đặc biệt.",
      "Tôi nghĩ {name} cần được chú ý nhiều hơn.",
      "Chúng ta đã mất quá nhiều người, hãy thận trọng với lá phiếu."
    ],
    witch: [
      "Tôi đã cứu một người đêm qua, hãy cẩn thận với lựa chọn của các bạn.",
      "Quyền năng của tôi có hạn, chúng ta cần tìm ra Sói càng sớm càng tốt.",
      "{name} hành động như thể họ có thông tin đặc biệt, đáng ngờ.",
      "Tôi còn một cơ hội để loại bỏ kẻ đáng ngờ nhất.",
      "Làng nên tin tưởng tôi, tôi đang làm những gì tốt nhất."
    ],
    generic: [
      "Ai có thông tin gì về đêm qua không?",
      "Chúng ta nên trao đổi những nghi ngờ của mình.",
      "Tình hình trở nên khó khăn, chúng ta cần tìm ra Sói ngay.",
      "Hãy chia sẻ nếu ai có manh mối.",
      "Chúng ta phải thận trọng với quyết định hôm nay."
    ],
    response: [
      "Tôi không đồng ý với {name}, lý do của họ không thuyết phục.",
      "Điều {name} vừa nói có điểm đáng chú ý.",
      "{name} có thể đúng, nhưng chúng ta cần thêm bằng chứng.",
      "Tôi nghi ngờ động cơ của {name} khi nói điều đó.",
      "Nếu những gì {name} nói là thật, chúng ta cần xem xét lại chiến lược."
    ]
  };
  
  // Choose template based on role
  let templateArray;
  if (aiPlayer.role === 'WEREWOLF' || aiPlayer.role === 'CURSED_WEREWOLF') {
    templateArray = templates.werewolf;
  } else if (aiPlayer.role === 'SEER') {
    templateArray = templates.seer;
  } else if (aiPlayer.role === 'HUNTER') {
    templateArray = templates.hunter;
  } else if (aiPlayer.role === 'BODYGUARD') {
    templateArray = templates.bodyguard;
  } else if (aiPlayer.role === 'WITCH') {
    templateArray = templates.witch;
  } else {
    templateArray = templates.villager;
  }
  
  // 30% chance to use generic templates for variety
  if (Math.random() < 0.3) {
    templateArray = templates.generic;
  }
  
  // Select a random template
  const template = templateArray[Math.floor(Math.random() * templateArray.length)];
  
  // Select a random alive player to mention
  const alivePlayers = Object.values(gameState.players)
    .filter(p => p.isAlive && p.id !== aiPlayer.id);
  
  let targetPlayer = null;
  if (alivePlayers.length > 0) {
    // For werewolves, try to target non-werewolves
    if (aiPlayer.role === 'WEREWOLF' || aiPlayer.role === 'CURSED_WEREWOLF') {
      const nonWerewolves = alivePlayers.filter(p => 
        p.role !== 'WEREWOLF' && p.role !== 'CURSED_WEREWOLF'
      );
      if (nonWerewolves.length > 0) {
        targetPlayer = nonWerewolves[Math.floor(Math.random() * nonWerewolves.length)];
      }
    }
    
    // If no target selected yet, pick a random alive player
    if (!targetPlayer) {
      targetPlayer = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
    }
  }
  
  // Replace placeholder with target name, or use a generic term if no target
  return template.replace('{name}', targetPlayer ? targetPlayer.name : 'ai đó');
}

/**
 * Generate a response to a specific message
 * @param {Object} aiPlayer - The AI player responding
 * @param {Object} gameState - Current game state
 * @param {Object} targetMessage - Message being responded to
 * @returns {Promise<string>} - Generated response in Vietnamese
 */
async function generateGeminiResponse(aiPlayer, gameState, targetMessage) {
  try {
    // Create context for the AI
    const playerContext = createPlayerContext(aiPlayer, gameState);
    const targetPlayer = gameState.players[targetMessage.playerId];
    
    // Build the prompt
    const prompt = `
${playerContext}

# Tin nhắn cần phản hồi:
${targetMessage.playerName}: "${targetMessage.message}"

Bạn là ${aiPlayer.name}, một người chơi trong trò chơi Ma Sói. Hãy viết một câu phản hồi ngắn (dưới 20 từ) bằng tiếng Việt phản hồi trực tiếp đến tin nhắn của ${targetMessage.playerName}.

Phản hồi PHẢI:
- Hoàn toàn bằng tiếng Việt
- Cụ thể về nội dung tin nhắn của ${targetMessage.playerName}
- KHÔNG bắt đầu với tên của bạn (${aiPlayer.name})
- Ngắn gọn (dưới 20 từ)
- Tự nhiên, như thật
- Phù hợp với vai trò của bạn

Nếu bạn là SÓI (${aiPlayer.role === 'WEREWOLF' || aiPlayer.role === 'CURSED_WEREWOLF' ? 'đúng vậy' : 'không phải'}), hãy cố đánh lạc hướng hoặc đổ lỗi cho người khác.

KHÔNG bao gồm dialogue markers như ":", "-", hay tên người chơi.
`;

    // Check cache first
    const cacheKey = `response-${aiPlayer.id}-${targetMessage.playerId}-${gameState.day}`;
    if (responseCache.has(cacheKey)) {
      return responseCache.get(cacheKey);
    }

    // Generate content using the Gemini model
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-lite"
    });

    const result = await model.generateContent(prompt);
    const response = result.response;
    let generatedText = response.text().trim();

    // Clean up the response
    generatedText = generatedText
      .replace(/^["']|["']$/g, '')  // Remove quotes at start/end
      .replace(/^[-:] */g, '')      // Remove dialogue dashes or colons
      .replace(/^[*]|[*]$/g, '')    // Remove asterisks at start/end
      .replace(/^.*?: /g, '')       // Remove name prefixes
      .replace(/^\s*<.*?>/, '')     // Remove HTML-like tags at beginning
      .replace(/<.*?>\s*$/, '');    // Remove HTML-like tags at end

    // Remove the player's name if it appears at the start
    if (generatedText.startsWith(aiPlayer.name + ":")) {
      generatedText = generatedText.substring(aiPlayer.name.length + 1).trim();
    }
    if (generatedText.startsWith(aiPlayer.name + " ")) {
      generatedText = generatedText.substring(aiPlayer.name.length).trim();
    }

    // Store in cache
    responseCache.set(cacheKey, generatedText);
    
    // If response is empty or error occurred, use fallback
    if (!generatedText) {
      // Get a template from the response category
      const templates = [
        "Tôi không đồng ý với điều {name} vừa nói.",
        "Điểm {name} đưa ra rất đáng nghi ngờ.",
        "Tôi thấy lý lẽ của {name} không thuyết phục.",
        "Chúng ta nên xem xét kỹ hơn những gì {name} vừa nói.",
        "Tôi có lý do để tin rằng {name} không hoàn toàn trung thực."
      ];
      
      const template = templates[Math.floor(Math.random() * templates.length)];
      return template.replace('{name}', targetPlayer ? targetPlayer.name : 'ai đó');
    }
    
    return generatedText;

  } catch (error) {
    console.error('[ERROR-GEMINI] API call failed:', error.message);
    
    // Fallback to simple response
    const speaker = gameState.players[targetMessage.playerId];
    return `Tôi không đồng ý với ${speaker?.name || 'bạn'}, chúng ta nên tìm thêm thông tin.`;
  }
}

/**
 * Create a threaded discussion using Gemini API
 * @param {Object} gameState - Current game state
 * @returns {Promise<Array>} - Array of discussion messages
 */
async function createGeminiThreadedDiscussion(gameState) {
  // Clear message history at the start of a new day
  messageHistory.length = 0;
  
  // Keep track of messages for this discussion
  const discussionMessages = [];
  
  // Get alive AI players
  const aiPlayers = Object.values(gameState.players)
    .filter(p => p.isAI && p.isAlive);
  
  if (aiPlayers.length === 0) return [];
  
  console.log(`[DEBUG-GEMINI] Starting AI discussions with ${aiPlayers.length} AI players`);
  
  // Generate 3-5 rounds of discussion
  const alivePlayers = Object.values(gameState.players).filter(p => p.isAlive);
  const roundCount = Math.min(5, Math.max(3, Math.ceil(alivePlayers.length / 3)));
  
  // Sort players by personality - impulsive first, cautious last
  const sortedAIPlayers = [...aiPlayers].sort((a, b) => {
    const aPersonality = a.personality?.type || 'strategic';
    const bPersonality = b.personality?.type || 'strategic';
    
    // Scoring: impulsive=1, strategic=2, cautious=3
    const aScore = aPersonality === 'impulsive' ? 1 : (aPersonality === 'strategic' ? 2 : 3);
    const bScore = bPersonality === 'impulsive' ? 1 : (bPersonality === 'strategic' ? 2 : 3);
    
    return aScore - bScore;
  });
  
  // Process each round with a delay between
  for (let round = 1; round <= roundCount; round++) {
    console.log(`[DEBUG-GEMINI] Generating discussion round ${round}`);
    
    // Generate initial messages for this round
    for (const aiPlayer of sortedAIPlayers) {
      try {
        // Skip occasional messages for realism (except in first round)
        if (round > 1 && Math.random() < 0.3) {
          continue;
        }
        
        const message = await generateGeminiMessage(aiPlayer, gameState);
        
        // Create message object
        const msgObj = {
          playerId: aiPlayer.id,
          playerName: aiPlayer.name,
          role: aiPlayer.role,
          message: message,
          timestamp: Date.now()
        };
        
        // Add to history and results
        messageHistory.unshift(msgObj);
        if (messageHistory.length > MAX_HISTORY) {
          messageHistory.pop();
        }
        
        discussionMessages.push(msgObj);
      } catch (error) {
        console.error(`[ERROR-GEMINI] Failed to generate message for ${aiPlayer.name}:`, error);
      }
    }
    
    // If this isn't the first round, generate some responses to messages
    if (round > 1 && messageHistory.length > 2) {
      // Select some random AI players to respond to recent messages
      const responders = [...sortedAIPlayers]
        .sort(() => Math.random() - 0.5) // Shuffle
        .slice(0, Math.min(Math.ceil(aiPlayers.length / 3), 3)); // Take up to 3 or 1/3 of AIs
      
      for (const responder of responders) {
        try {
          // Find a message to respond to (not from this AI, preferably recent)
          const recentMessages = messageHistory
            .filter(msg => msg.playerId !== responder.id)
            .slice(0, 5); // Last 5 messages
          
          if (recentMessages.length === 0) continue;
          
          // Randomly select one message to respond to
          const targetMessage = recentMessages[Math.floor(Math.random() * recentMessages.length)];
          
          // Generate response
          const response = await generateGeminiResponse(responder, gameState, targetMessage);
          
          // Create message object
          const msgObj = {
            playerId: responder.id,
            playerName: responder.name,
            role: responder.role,
            message: response,
            timestamp: Date.now(),
            isResponse: true,
            responseToId: targetMessage.playerId
          };
          
          // Add to history and results
          messageHistory.unshift(msgObj);
          if (messageHistory.length > MAX_HISTORY) {
            messageHistory.pop();
          }
          
          discussionMessages.push(msgObj);
        } catch (error) {
          console.error(`[ERROR-GEMINI] Failed to generate response for ${responder.name}:`, error);
        }
      }
    }
  }
  
  console.log(`[DEBUG-GEMINI] Generated ${discussionMessages.length} total discussion messages`);
  return discussionMessages;
}

// Export functions
module.exports = {
  generateGeminiMessage,
  generateGeminiResponse,
  createGeminiThreadedDiscussion
};