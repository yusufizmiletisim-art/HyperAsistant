import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Gemini ve Discord istemcilerini başlatıyoruz
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
});

// Veritabanı dosyası (Görevleri ve notları kaydetmek için)
const DB_FILE = './database.json';
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ tasks: [] }, null, 2));
}

// Bot hazır olduğunda komutları Discord'a kaydediyoruz
client.once('ready', async () => {
    console.log(`[+] Bot aktif: ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('hyper')
            .setDescription('Yapay zeka asistanına bir şey sor veya komut ver.')
            .addStringOption(option =>
                option.setName('mesaj')
                    .setDescription('Asistana söylemek veya sormak istediğin şey')
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('gorevler')
            .setDescription('Sana gelen görevleri ve yapılacakları listeler.')
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('[-] Slash komutları yükleniyor...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('[+] Slash komutları başarıyla yüklendi!');
    } catch (error) {
        console.error(error);
    }
});

// Etkileşimler ve Komut Yönetimi
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'hyper') {
        await interaction.deferReply();
        const userPrompt = interaction.options.getString('mesaj');

        try {
            // Gemini modeline istek atıyoruz
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Sen profesyonel, akıllı ve samimi bir kişisel asistansın. Kullanıcının sana ilettiği şu mesaja en uygun ve akılcı yanıtı üret: "${userPrompt}"`,
            });

            const aiReply = response.text || "Üzgünüm, şu anda yanıt üretemiyorum.";
            await interaction.editReply(`🤖 **Hyper Asistan:**\n${aiReply}`);
        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ Yapay zeka yanıt üretirken bir hata oluştu.');
        }
    } 
    else if (interaction.commandName === 'gorevler') {
        const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        if (db.tasks.length === 0) {
            return interaction.reply({ content: '🎉 Harika! Şu an kayıtlı hiçbir görevin yok.', ephemeral: true });
        }

        let taskList = db.tasks.map((t, index) => `${index + 1}. **Kimden:** ${t.author} | **İstek:** ${t.content}`).join('\n');
        await interaction.reply({ content: `📌 **Bekleyen Görevlerin:**\n\n${taskList}`, ephemeral: true });
    }
});

// Biri sana DM attığında veya etiketlediğinde otomatik kayıt altına alma
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const isDM = !message.guild;
    const isMentioned = message.mentions.has(client.user);

    if (isDM || isMentioned) {
        const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        
        db.tasks.push({
            author: message.author.tag,
            content: message.content,
            date: new Date().toLocaleString()
        });

        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
        
        await message.react('📌').catch(() => {});
    }
});

client.login(process.env.DISCORD_TOKEN);
