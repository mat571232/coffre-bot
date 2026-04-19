const { Client, GatewayIntentBits } = require('discord.js');
const fetch = require('node-fetch');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const WEBHOOK = process.env.SHEETS_WEBHOOK_RUN;
const CHANNEL_ID = process.env.CHANNEL_ID_RUN;

client.on('messageCreate', async (message) => {
  if (message.channel.id !== CHANNEL_ID) return;
  if (!message.embeds.length) return;

  for (const embed of message.embeds) {
    const desc = embed.description || '';

    if (!/vente de/i.test(desc)) continue;

    const qte     = desc.match(/vente de (\d+)x/i);
    const vendeur = desc.match(/par\s+(\w+\s+\w+|\w+)/i);
    const total   = desc.match(/pour\s+(\d+)\$/i);
    const societe = desc.match(/(\d+)\$\s+pour\s+la\s+soci[ée]t[ée]/i);

    if (!qte || !vendeur || !total || !societe) continue;

    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vendeur:    vendeur[1].trim(),
        bouteilles: parseInt(qte[1]),
        total:      parseInt(total[1]),
        societe:    parseInt(societe[1]),
      })
    });

    await message.react('✅');
  }
});

client.login(process.env.DISCORD_TOKEN);
