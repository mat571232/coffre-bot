const { Client, GatewayIntentBits } = require('discord.js');
const { google } = require('googleapis');

// ─────────────────────────────────────────────
//  CONFIGURATION
// ─────────────────────────────────────────────
const CONFIG = {
  DISCORD_TOKEN:      process.env.MTQ5NDgyNjA1NzM0NDM1NjM1Mg.G7hScI.CQ7zGaLCff1GrrPtGI23lcQutdoiBVND-pwaIQ,
  CHANNEL_ID:         process.env.1495034418606375064,
  SPREADSHEET_ID:     process.env.1NVOHJD0joNPZqgyTElnlUcfGiiL-H0fFJsJdG7SQ1hw,
  SHEET_NAME:         'Coffre',
  TARGET_POSITION:    { x: 1697.93, y: 4868.40, z: 42.10 },
  POSITION_TOLERANCE: 1.0,
};
// ─────────────────────────────────────────────

async function getGoogleSheetsClient() {
  const credentials = JSON.parse(require('fs').readFileSync('./google-credentials.json'));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ── Lire toutes les lignes du sheet ────────────
async function getRows(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    range: `${CONFIG.SHEET_NAME}!A:B`,
  });
  return res.data.values || [];
}

// ── Dépôt : cherche l'objet et additionne ──────
// Structure du sheet : colonne A = Objet, colonne B = Quantité
async function updateStock(sheets, item, quantity) {
  const rows = await getRows(sheets);

  // Chercher si l'objet existe déjà (en ignorant la casse)
  const rowIndex = rows.findIndex(
    (r) => r[0] && r[0].toLowerCase() === item.toLowerCase()
  );

  if (rowIndex === -1) {
    // Objet inconnu → nouvelle ligne
    await sheets.spreadsheets.values.append({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: `${CONFIG.SHEET_NAME}!A:B`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[item, quantity]] },
    });
    console.log(`➕ Nouvel objet : ${item} → ${quantity}`);
  } else {
    // Objet existant → additionner
    const currentQty = parseInt(rows[rowIndex][1], 10) || 0;
    const newQty = currentQty + quantity;
    const sheetRow = rowIndex + 1; // Google Sheets commence à 1

    await sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: `${CONFIG.SHEET_NAME}!B${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[newQty]] },
    });
    console.log(`✅ ${item} : ${currentQty} + ${quantity} = ${newQty}`);
  }
}

// ── Retrait : soustraire ───────────────────────
async function removeStock(sheets, item, quantity) {
  const rows = await getRows(sheets);
  const rowIndex = rows.findIndex(
    (r) => r[0] && r[0].toLowerCase() === item.toLowerCase()
  );

  if (rowIndex === -1) {
    console.log(`⚠️ Retrait ignoré — objet inconnu : ${item}`);
    return;
  }

  const currentQty = parseInt(rows[rowIndex][1], 10) || 0;
  const newQty = Math.max(0, currentQty - quantity);
  const sheetRow = rowIndex + 1;

  await sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    range: `${CONFIG.SHEET_NAME}!B${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[newQty]] },
  });
  console.log(`📤 ${item} : ${currentQty} - ${quantity} = ${newQty}`);
}

// ── Parser le message Discord ──────────────────
function parseCoffreMessage(content, embedFields) {
  let fullText = content || '';
  for (const f of embedFields) fullText += `\n${f.name}: ${f.value}`;

  // Vérifier la position GPS du coffre
  const posMatch = fullText.match(/position[:\s]+([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (posMatch) {
    const dx = Math.abs(parseFloat(posMatch[1]) - CONFIG.TARGET_POSITION.x);
    const dy = Math.abs(parseFloat(posMatch[2]) - CONFIG.TARGET_POSITION.y);
    const dz = Math.abs(parseFloat(posMatch[3]) - CONFIG.TARGET_POSITION.z);
    if (dx > CONFIG.POSITION_TOLERANCE || dy > CONFIG.POSITION_TOLERANCE || dz > CONFIG.POSITION_TOLERANCE) {
      return null; // Mauvais coffre
    }
  }

  // Détecter dépôt ou retrait
  let type = null;
  if (/d[eé]p[oô]t/i.test(fullText))             type = 'depot';
  else if (/retrait|pris|retiré/i.test(fullText)) type = 'retrait';
  else return null;

  // Extraire quantité + objet  ex: "272x Alcool"
  const itemMatch = fullText.match(/(\d+)\s*x\s*([\w]+)/i);
  if (!itemMatch) return null;

  return {
    type,
    quantity: parseInt(itemMatch[1], 10),
    item: itemMatch[2],
  };
}

// ── Bot Discord ────────────────────────────────
async function startBot() {
  const sheets = await getGoogleSheetsClient();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once('ready', () => console.log(`🤖 Bot en ligne : ${client.user.tag}`));

  client.on('messageCreate', async (message) => {
    if (message.channelId !== CONFIG.CHANNEL_ID) return;

    let content = message.content || '';
    let embedFields = [];
    for (const embed of message.embeds) {
      if (embed.description) content += '\n' + embed.description;
      if (embed.title)       content += '\n' + embed.title;
      if (embed.fields)      embedFields = embedFields.concat(embed.fields);
    }

    const data = parseCoffreMessage(content, embedFields);
    if (!data) return;

    try {
      if (data.type === 'depot') {
        await updateStock(sheets, data.item, data.quantity);
      } else {
        await removeStock(sheets, data.item, data.quantity);
      }
    } catch (err) {
      console.error('❌ Erreur Sheets :', err.message);
    }
  });

  client.login(CONFIG.DISCORD_TOKEN);
}

startBot().catch(console.error);
