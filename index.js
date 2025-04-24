const axios = require('axios');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const CMC_API_KEY = process.env.CMC_API_KEY;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const memeKeywords = ['doge', 'shiba', 'inu', 'pepe', 'bonk', 'floki', 'elon', 'moon', 'baby', 'jeet', 'rug', 'cat', 'fart', 'meme', 'hoge', 'poodle'];

let sentTokens = new Map();
try {
  const data = fs.readFileSync('seen_tokens.json', 'utf8');
  const parsed = JSON.parse(data);
  sentTokens = new Map(parsed.map(t => [t.id, t]));
} catch (_) {}

function saveToken(token) {
  sentTokens.set(token.id, token);
  fs.writeFileSync('seen_tokens.json', JSON.stringify([...sentTokens.values()]), 'utf8');
}

const watchlist = new Map();

bot.onText(/\/راقب (.+)/, (msg, match) => {
  const name = match[1].trim().toLowerCase();
  watchlist.set(name, msg.chat.id);
  bot.sendMessage(msg.chat.id, `تمت إضافة ${name} إلى قائمة المراقبة. سيتم تنبيهك عند أي تطورات.`);
});

bot.onText(/\/احذف (.+)/, (msg, match) => {
  const name = match[1].trim().toLowerCase();
  watchlist.delete(name);
  bot.sendMessage(msg.chat.id, `تمت إزالة ${name} من قائمة المراقبة.`);
});

bot.onText(/\/تحليل (.+)/, (msg, match) => {
  const name = match[1].trim().toLowerCase();
  const found = [...sentTokens.values()].find(t => t.id.includes(name));
  if (found) {
    const ageHours = ((new Date()) - new Date(found.createdAt)) / (1000 * 60 * 60);
    const analysis = `
تحليل ذكي:
الاسم: ${found.name} (${found.symbol})
السعر: $${found.price.toFixed(6)}
القيمة السوقية: $${found.marketCap.toLocaleString()}
العمر: ${ageHours.toFixed(1)} ساعة
توصية النظام: ${found.recommendation}
رابط: ${found.url}
وصف: ${found.description}
` ;
    bot.sendMessage(msg.chat.id, analysis);
  } else {
    bot.sendMessage(msg.chat.id, `العملة ${name} غير موجودة في السجل.`);
  }
});

async function analyzeNewTokens(tokens) {
  const now = new Date();
  for (const token of tokens) {
    const id = `${token.name}-${token.symbol}`.toLowerCase();
    
    // تحقق إذا كانت العملة قد تم إرسالها مسبقًا
    if (sentTokens.has(id)) {
      console.log(`Token ${token.name} has already been sent.`);
      continue;
    }

    const name = token.name?.toLowerCase() || '';
    const symbol = token.symbol || '';
    const price = token.current_price;
    const marketCap = token.market_cap;
    const createdAt = new Date(token.date_added || now);
    const ageMs = now - createdAt;
    const ageHours = ageMs / (1000 * 60 * 60);
    const reasons = [];

    if (!price || !marketCap) continue;
    if (marketCap > 10000000 || marketCap < 150000) reasons.push('⚠️ القيمة السوقية غير مناسبة');
    if (ageMs > 24 * 60 * 60 * 1000) reasons.push('⏱️ عمرها أكثر من 24 ساعة');
    if (!memeKeywords.some(k => name.includes(k))) reasons.push('🔍 لا تحتوي على كلمات ميم');

    let recommendation = '⚠️ وسطية المخاطر - راقب قبل الدخول';
    if (marketCap < 100000) recommendation = '🚫 عالية المخاطر - إحذر';
    else if (marketCap >= 150000 && marketCap <= 500000) recommendation = '✅ فرصة أولية - راقبها';
    else if (marketCap > 500000) recommendation = '💎 محتملة Pump - تابعها بسرعة';

    const dataToSave = { id, name, symbol, price, marketCap, createdAt, recommendation, url: token.url, description: token.description, icon: token.icon };
    saveToken(dataToSave);

    // التعامل مع الروابط بشكل صحيح هنا
    const linksText = token.links?.map(link => link.url).join('\n') || 'لا توجد روابط';

    const msg = reasons.length < 2 ? `📢 عملة ميم جديدة:\n🔸 الاسم: ${token.name} (${symbol})\n📅 الإطلاق: ${createdAt.toLocaleDateString()}\n💵 السعر: $${price.toFixed(6)}\n📈 الماركت كاب: $${marketCap.toLocaleString()}\n📊 التوصية: ${recommendation}\n🔗 الرابط: ${token.url}\n📝 الوصف: ${token.description}\n🔗 روابط إضافية: ${linksText}` :
      `⚠️ تحليل مبدئي:\n🔸 الاسم: ${token.name} (${symbol})\n📅 الإطلاق: ${createdAt.toLocaleDateString()}\n💵 السعر: $${price.toFixed(6)}\n📈 الماركت كاب: $${marketCap.toLocaleString()}\n⚠️ ملاحظات:\n${reasons.join('\n')}\n🔗 الرابط: ${token.url}\n📝 الوصف: ${token.description}\n🔗 روابط إضافية: ${linksText}`;

    if (reasons.length < 3) await bot.sendMessage(CHANNEL_ID, msg);
    else console.log(msg);

    if (watchlist.has(name)) {
      bot.sendMessage(watchlist.get(name), `🔔 تحديث بخصوص ${token.name}:\n${msg}`);
    }
  }
}

// جلب العملات من CoinGecko + GeckoTerminal + DexScreener
async function fetchCoinGeckoTokens() {
  try {
    console.log("Fetching tokens from CoinGecko...");
    const res = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
      params: { vs_currency: 'usd', order: 'gecko_desc', per_page: 100, page: 1 }
    });
    console.log("CoinGecko response:", res.data);
    await analyzeNewTokens(res.data);
  } catch (err) {
    console.error("❌ CoinGecko:", err.message);
  }
}

async function fetchGeckoTerminalTokens() {
  try {
    console.log("Fetching tokens from GeckoTerminal...");
    const res = await axios.get('https://api.geckoterminal.com/api/v2/networks/solana/pools', {
      params: { include: 'base_token' }
    });
    console.log("GeckoTerminal response:", res.data);
    const pools = res.data.data || [];
    const formatted = pools
      .filter(pool => pool?.attributes?.base_token?.name && pool?.attributes?.base_token_price_usd && pool?.attributes?.liquidity_usd)
      .map(pool => {
        const token = pool.attributes.base_token;
        const marketCap = parseFloat(pool.attributes.liquidity_usd || 0);
        if (marketCap < 150000 || marketCap > 10000000) return null;
        return {
          name: token.name,
          symbol: token.symbol,
          date_added: pool.attributes.created_at,
          current_price: parseFloat(pool.attributes.base_token_price_usd || 0),
          market_cap: marketCap,
          url: `https://geckoterminal.com/token/${token.address}`,
          description: token.name,
          icon: pool.attributes.base_token.icon,
          links: pool.attributes.links || []
        };
      }).filter(Boolean);
    await analyzeNewTokens(formatted);
  } catch (err) {
    console.error("❌ GeckoTerminal:", err.message);
  }
}

async function fetchDexScreenerTokens() {
  try {
    console.log("Fetching tokens from DexScreener...");
    const res = await axios.get('https://api.dexscreener.com/token-profiles/latest/v1');
    console.log("DexScreener response:", res.data);
    const tokens = res.data || [];
    
    const formatted = tokens.map(token => ({
      name: token.header || "Unnamed Token",
      symbol: token.tokenAddress.slice(0, 6),
      date_added: new Date(),
      current_price: parseFloat(token.current_price || 0),
      market_cap: parseFloat(token.market_cap || 0),
      description: token.description || "No description available",
      icon: token.icon,
      url: token.url,
      links: token.links || []
    })).filter(t => t.current_price && t.market_cap);

    await analyzeNewTokens(formatted);
  } catch (err) {
    console.error("❌ DexScreener:", err.message);
  }
}

async function startChecking() {
  console.log("Starting to check for new tokens...");
  await fetchCoinGeckoTokens();
  await fetchGeckoTerminalTokens();
  await fetchDexScreenerTokens();
}

startChecking();
setInterval(startChecking, 10 * 60 * 1000);  // التكرار كل 10 دقائق
