const http = require('http');
const mineflayer = require('mineflayer');
const { Client, GatewayIntentBits } = require('discord.js');
const fetch = require('node-fetch');

// --- TẠO HTTP SERVER ĐỂ RENDER GIỮ BOT CHẠY 24/7 ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot Minecraft & Discord is running 24/7!\n');
}).listen(PORT, () => {
  console.log(`[WEB SERVER LOG] 🌐 Đang lắng nghe HTTP trên cổng ${PORT}`);
});

// --- CẤU HÌNH CHUNG ---
const SERVER_HOST = 'Open-CR9X.aternos.me';
const SERVER_PORT = 39490;
const SERVER_VERSION = '1.21.11';
const DISCORD_TOKEN = process.env.DISCORD_TOKEN ;

const MINECRAFT_CHANNEL_ID = '1543903442064637972';
const NOITU_CHANNEL_ID = '1565332399233962114';

const OPENROUTER_API_KEY = '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';
const ADMIN_NAME = 'NKxPHAT';

let isChatReady = false;
const activeGames = new Map();

// KẾT NỐI DISCORD
const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

discordClient.once('ready', () => {
  console.log(`[DISCORD LOG] ✅ Đã đăng nhập Discord thành công với tài khoản: ${discordClient.user.tag}`);
});
discordClient.login(DISCORD_TOKEN);

function sendToDiscord(text) {
  const channel = discordClient.channels.cache.get(MINECRAFT_CHANNEL_ID);
  if (channel) {
    channel.send(text).catch(err => console.log('[DISCORD ERROR] ❌ Không gửi được tin nhắn lên kênh:', err));
  }
}

// HÀM GỌI OPENROUTER AI
async function askOpenRouterAI(promptText) {
  console.log(`[AI LOG] 🤖 Đang gửi yêu cầu tới OpenRouter AI với prompt: "${promptText}"`);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://github.com/botgame',
        'X-Title': 'Minecraft Bot',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'Bạn là game thủ Minecraft. Trả lời tiếng Việt trực tiếp, cực kỳ ngắn gọn dưới 8 từ.' },
          { role: 'user', content: promptText }
        ],
        max_tokens: 50
      })
    });
    const data = await response.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      const result = data.choices[0].message.content.trim();
      console.log(`[AI LOG] ✨ Nhận phản hồi từ AI: "${result}"`);
      return result;
    }
  } catch (err) {
    console.log('[AI ERROR] ❌ Lỗi kết nối OpenRouter API:', err);
  }
  return "Đi mine thôi!";
}

// HÀM TRA TỪ ĐIỂN ANH - ANH
async function lookupDictionary(word) {
  console.log(`[DICT LOG] 📖 Đang tra từ tiếng Anh: "${word}"`);
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) return null;
    const data = await res.json();
    
    if (Array.isArray(data) && data.length > 0) {
      const entry = data[0];
      const meanings = entry.meanings[0];
      const definition = meanings?.definitions[0]?.definition || "Không có định nghĩa";
      const example = meanings?.definitions[0]?.example || "Không có ví dụ cụ thể";
      
      return {
        word: entry.word,
        phonetic: entry.phonetic || entry.phonetics?.[0]?.text || "",
        partOfSpeech: meanings?.partOfSpeech || "",
        definition: definition,
        example: example
      };
    }
  } catch (e) {
    console.log("[DICT ERROR] ❌ Lỗi tra từ điển Anh:", e);
  }
  return null;
}

// HÀM TRA TỪ ĐIỂN TIẾNG VIỆT
async function lookupVietnameseDictionary(word) {
  console.log(`[VDICT LOG] 📖 Đang tra từ điển tiếng Việt qua AI: "${word}"`);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://github.com/botgame',
        'X-Title': 'Minecraft Bot',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { 
            role: 'system', 
            content: 'Bạn là chuyên gia từ điển tiếng Việt. Hãy giải nghĩa từ, nêu rõ từ loại, và cung cấp 2-3 câu ví dụ thực tế hoặc các cụm từ biến thể liên quan. Ngắn gọn, súc tích.' 
          },
          { role: 'user', content: word }
        ],
        max_tokens: 300
      })
    });
    const data = await response.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content.trim();
    }
  } catch (err) {
    console.log('[VDICT ERROR] ❌ Lỗi tra từ điển tiếng Việt:', err);
  }
  return null;
}

// ==========================================
// 1. BOT CHAT (`Botgame`)
// ==========================================
let chatBot;
function createChatBot() {
  console.log('[BOT CHAT LOG] 🔄 Đang khởi tạo Botgame kết nối vào server Minecraft...');
  chatBot = mineflayer.createBot({
    host: SERVER_HOST,
    port: SERVER_PORT,
    username: 'Botgame',
    version: SERVER_VERSION
  });

  chatBot.once('spawn', () => {
    isChatReady = true;
    console.log(`[BOT CHAT LOG] 🎉 Botgame đã vào game thành công!`);
    sendToDiscord(`💬 **[Bot Chat]** Đã online và sẵn sàng!`);

    setTimeout(() => {
      chatBot.setControlState('forward', true);
      setTimeout(() => chatBot.setControlState('forward', false), 1000);
    }, 3000);
  });

  chatBot.on('messagestr', async (message) => {
    if (message.includes(chatBot.username) || message.includes('BotFarmer')) return;
    console.log(`[MINECRAFT CHAT] ${message}`);
    sendToDiscord(`💬 [Game]: ${message}`);

    if (message.includes(ADMIN_NAME) && message.includes('!')) {
      const parts = message.split('!');
      if (parts.length > 1) {
        const cmd = parts[1].trim();
        chatBot.chat(`/${cmd}`);
        sendToDiscord(`🛡️ Admin thực thi lệnh từ game: /${cmd}`);
      }
    }

    if (message.toLowerCase().includes('botgame')) {
      const cleanMsg = message.replace(/<.*?>/, '').replace(/botgame/gi, '').trim();
      if (cleanMsg.toLowerCase().includes('toạ độ') || cleanMsg.toLowerCase().includes('toa do')) {
        const pos = chatBot.entity.position;
        const posText = `Tọa độ của tôi: X: ${Math.round(pos.x)}, Y: ${Math.round(pos.y)}, Z: ${Math.round(pos.z)}`;
        chatBot.chat(posText);
        sendToDiscord(`📍 **Bot trả lời tọa độ**: ${posText}`);
      } else if (cleanMsg.length > 0) {
        const reply = await askOpenRouterAI(cleanMsg);
        chatBot.chat(reply);
        sendToDiscord(`🤖 **Bot trả lời trong game**: ${reply}`);
      }
    }
  });

  chatBot.on('end', (reason) => {
    isChatReady = false;
    console.log(`[BOT CHAT WARNING] ⚠️ Botgame ngắt kết nối. Đang tự động kết nối lại sau 5 giây...`);
    setTimeout(createChatBot, 5000);
  });

  chatBot.on('error', (err) => {});
}

// ==========================================
// 2. BOT CÀY ĐỒ (`BotFarmer`)
// ==========================================
let isFarmActive = true;
let farmerBot;

function createFarmerBot() {
  console.log('[BOT FARMER LOG] 🔄 Đang khởi tạo BotFarmer...');
  farmerBot = mineflayer.createBot({
    host: SERVER_HOST,
    port: SERVER_PORT,
    username: 'BotFarmer',
    version: SERVER_VERSION
  });

  farmerBot.once('spawn', () => {
    console.log('[BOT FARMER LOG] 🎉 BotFarmer đã vào game thành công!');
    sendToDiscord(`⛏️ **[Bot Farmer]** Đã bắt đầu cày đồ tự động!`);

    setInterval(() => {
      if (!isFarmActive || !farmerBot.entity) return;
      try {
        const block = farmerBot.findBlock({
          matching: (b) => b.name.includes('log') || b.name.includes('dirt'),
          maxDistance: 4
        });
        if (block) {
          farmerBot.dig(block, () => {});
        } else {
          farmerBot.setControlState('jump', true);
          setTimeout(() => farmerBot.setControlState('jump', false), 500);
        }
      } catch (e) {}
    }, 15000);
  });

  farmerBot.on('messagestr', (message) => {
    if (message.includes(ADMIN_NAME)) {
      const lower = message.toLowerCase();
      if (lower.includes('enansoaf') || lower.includes('.enansoaf')) {
        isFarmActive = true;
        farmerBot.chat('Đã nhận lệnh enansoaf, tiếp tục farm!');
        sendToDiscord(`⛏️ **[Bot Farmer]**: Đã tiếp tục cày cuốc!`);
      } else if (lower.includes('stop') || lower.includes('dừng')) {
        isFarmActive = false;
        farmerBot.chat('Đã dừng farm.');
        sendToDiscord(`⛏️ **[Bot Farmer]**: Đã tạm dừng cày cuốc.`);
      }
    }
  });

  farmerBot.on('end', (reason) => {
    console.log(`[BOT FARMER WARNING] ⚠️ BotFarmer ngắt kết nối. Đang kết nối lại sau 5 giây...`);
    setTimeout(createFarmerBot, 5000);
  });

  farmerBot.on('error', (err) => {});
}

createChatBot();
createFarmerBot();

// ==========================================
// 3. LẮNG NGHE DISCORD 
// ==========================================
discordClient.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const channelId = message.channel.id;
  const content = message.content.trim().toLowerCase();

  // --- KÊNH 2: GAME NỐI TỪ (AI TỰ TẠO TỪ ĐẦU TIÊN) ---
  if (channelId === NOITU_CHANNEL_ID) {
    if (content === '!noitu') {
      const aiPrompt = `Hãy cho một từ đôi tiếng Việt có nghĩa thực tế (gồm 2 tiếng, ví dụ: "Học tập", "Quê hương") để làm từ khởi đầu cho trò chơi nối từ. Chỉ trả lời đúng từ đó, không kèm giải thích hay dấu câu.`;
      
      const firstWord = await askOpenRouterAI(aiPrompt);
      const cleanFirstWord = firstWord.replace(/['".,]/g, '').trim();

      activeGames.set(channelId, { lastWord: cleanFirstWord, lastUser: 'bot' });
      console.log(`[NOI TU LOG] 🤖 AI đã khởi tạo từ mở đầu: "${cleanFirstWord}"`);
      return message.reply(`🎮 **Đã bật chế độ Nối Từ!** Từ mở đầu do AI tạo ra là: **"${cleanFirstWord}"**. Mời người chơi tiếp theo nối tiếp!`);
    }

    if (activeGames.has(channelId)) {
      const game = activeGames.get(channelId);
      const words = message.content.trim().split(/\s+/);
      const lastPart = game.lastWord ? game.lastWord.split(/\s+/).pop() : '';

      // 1. Kiểm tra chống spam (Trừ khi lượt trước do bot ra từ)
      if (game.lastWord && game.lastUser === message.author.id) {
        console.log(`[NOI TU LOG] ⚠️ Người chơi ${message.author.tag} bị chặn spam.`);
        await message.react('⚠️');
        return message.reply('Bạn phải đợi người khác nối tiếp theo nhé!');
      }

      const firstPart = words[0];

      // 2. Kiểm tra luật âm tiết
      if (firstPart.toLowerCase() !== lastPart.toLowerCase()) {
        console.log(`[NOI TU LOG] ❌ Sai luật nối âm tiết! Gãy chuỗi.`);
        await message.react('❌');
        message.reply(`Sai rồi! Từ trước kết thúc bằng tiếng **"${lastPart}"**, từ của bạn phải bắt đầu bằng tiếng đó. 💥 **Gãy chuỗi!** (Đã reset chuỗi mới bằng từ của bạn).`);
        game.lastWord = words.join(' ');
        game.lastUser = message.author.id;
        return;
      }

      // 3. Kiểm tra nghĩa bằng AI
      const checkMsg = message.content.trim();
      const aiPrompt = `Kiểm tra xem cụm từ tiếng Việt sau đây: "${checkMsg}" có phải là từ có nghĩa thực tế trong tiếng Việt hay không? Chỉ trả lời đúng một chữ "ĐÚNG" hoặc "SAI", không giải thích gì thêm.`;
      
      const aiCheckResult = await askOpenRouterAI(aiPrompt);

      if (aiCheckResult && aiCheckResult.toUpperCase().includes('SAI')) {
        console.log(`[NOI TU LOG] ❌ AI đánh giá từ "${checkMsg}" là SAI. Gãy chuỗi.`);
        await message.react('❌');
        message.reply(`💥 **Từ này không có nghĩa hoặc không hợp lệ trong tiếng Việt!** Gãy chuỗi (Đã reset chuỗi mới bằng từ của bạn).`);
        game.lastWord = words.join(' ');
        game.lastUser = message.author.id;
      } else {
        console.log(`[NOI TU LOG] ✅ Từ "${checkMsg}" hợp lệ.`);
        game.lastWord = words.join(' ');
        game.lastUser = message.author.id;
        await message.react('✅');
      }
    }
    return;
  }

  // --- KÊNH 1: MINECRAFT CHAT, AI, TRA TỪ ĐIỂN ---
  if (channelId === MINECRAFT_CHANNEL_ID) {
    if (message.content.startsWith('!dict ') || message.content.startsWith('.dict ')) {
      const searchWord = message.content.slice(6).trim();
      if (!searchWord) return message.reply('⚠️ Vui lòng nhập từ tiếng Anh! Ví dụ: `!dict go`');

      const dictData = await lookupDictionary(searchWord);
      if (!dictData) return message.reply(`❌ Không tìm thấy từ **"${searchWord}"**.`);

      let replyMsg = `📖 **TRA TỪ ĐIỂN ANH: ${dictData.word.toUpperCase()}** (${dictData.phonetic})\n`;
      replyMsg += `- **Loại từ:** *${dictData.partOfSpeech}*\n`;
      replyMsg += `- **Định nghĩa:** ${dictData.definition}\n`;
      replyMsg += `- **Ví dụ:** "${dictData.example}"\n`;
      return message.reply(replyMsg);
    }

    if (message.content.startsWith('!vdict ') || message.content.startsWith('.vdict ')) {
      const searchWord = message.content.slice(7).trim();
      if (!searchWord) return message.reply('⚠️ Vui lòng nhập từ tiếng Việt! Ví dụ: `!vdict gây go`');

      const dictResult = await lookupVietnameseDictionary(searchWord);
      if (!dictResult) return message.reply(`❌ Không thể tra cứu từ này lúc này.`);

      return message.reply(`📖 **TRA TỪ ĐIỂN TIẾNG VIỆT: ${searchWord.toUpperCase()}**\n\n${dictResult}`);
    }

    const isTagged = message.mentions.has(discordClient.user) || message.content.toLowerCase().includes('bot');

    if (message.content.startsWith('!')) {
      const cmd = message.content.slice(1);
      if (chatBot && chatBot.entity) {
        chatBot.chat(`/${cmd}`);
        sendToDiscord(`🛡️ Lệnh từ Discord: /${cmd}`);
      }
    } else if (isTagged) {
      const prompt = message.content.replace(/<@!?\d+>/g, '').trim();
      
      if (prompt.toLowerCase().includes('toạ độ') || prompt.toLowerCase().includes('toa do')) {
        try {
          const pos = chatBot.entity.position;
          const posText = `Tọa độ hiện tại của tôi: X: ${Math.round(pos.x)}, Y: ${Math.round(pos.y)}, Z: ${Math.round(pos.z)}`;
          chatBot.chat(posText);
          sendToDiscord(`📍 **Bot (Tọa độ)**: ${posText}`);
        } catch (e) {
          sendToDiscord(`⚠️ Chưa lấy được tọa độ do bot chưa load vị trí.`);
        }
      } else {
        const reply = await askOpenRouterAI(prompt);
        try {
          if (chatBot && chatBot.entity) {
            chatBot.chat(reply);
            sendToDiscord(`🤖 **Bot trả lời trong game**: ${reply}`);
          }
        } catch (e) {
          sendToDiscord(`🤖 **Bot (Chỉ gửi Discord)**: ${reply}`);
        }
      }
    }
  }
});

