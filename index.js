require("dotenv").config();

const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");

const DATA_FILE = path.join(__dirname, "birthdays.json");

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return {
      guilds: {}
    };
  }

  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return {
      guilds: {}
    };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function getGuildData(data, guildId) {
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = {
      channelId: null,
      message: "🎉 Feliz aniversário, {usuario}! Muitos anos de vida!",
      birthdays: {}
    };
  }

  return data.guilds[guildId];
}

function isValidDateBR(dateText) {
  const match = /^(\d{1,2})\/(\d{1,2})$/.exec(dateText.trim());
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const daysInMonth = {
    1: 31,
    2: 29,
    3: 31,
    4: 30,
    5: 31,
    6: 30,
    7: 31,
    8: 31,
    9: 30,
    10: 31,
    11: 30,
    12: 31
  };

  if (day > daysInMonth[month]) return null;

  return {
    day,
    month,
    formatted: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`
  };
}

function todayInBrazil() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).formatToParts(now);

  const day = Number(parts.find(p => p.type === "day").value);
  const month = Number(parts.find(p => p.type === "month").value);
  const year = Number(parts.find(p => p.type === "year").value);

  return { day, month, year };
}

const commands = [
  new SlashCommandBuilder()
    .setName("niver")
    .setDescription("Sistema de aniversário do servidor")
    .addSubcommand(sub =>
      sub
        .setName("cadastrar")
        .setDescription("Cadastrar sua data de aniversário")
        .addStringOption(opt =>
          opt
            .setName("data")
            .setDescription("Data no formato DD/MM. Exemplo: 14/04")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("remover")
        .setDescription("Remover seu aniversário da lista")
    )
    .addSubcommand(sub =>
      sub
        .setName("ver")
        .setDescription("Ver a data de aniversário de alguém")
        .addUserOption(opt =>
          opt
            .setName("usuario")
            .setDescription("Usuário que você quer consultar")
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("listar")
        .setDescription("Listar aniversários cadastrados")
    )
    .addSubcommand(sub =>
      sub
        .setName("canal")
        .setDescription("Definir o canal onde o bot vai mandar os aniversários")
        .addChannelOption(opt =>
          opt
            .setName("canal")
            .setDescription("Canal de texto para enviar os aniversários")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("mensagem")
        .setDescription("Definir a mensagem de aniversário")
        .addStringOption(opt =>
          opt
            .setName("texto")
            .setDescription("Use {usuario} para mencionar a pessoa")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("testar")
        .setDescription("Testar a mensagem de aniversário no canal configurado")
    )
    .toJSON()
];

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );

  console.log("✅ Comandos slash registrados.");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

client.once("ready", async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);
  checkBirthdays();
  setInterval(checkBirthdays, 60 * 60 * 1000);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "niver") return;

  const data = loadData();
  const guildData = getGuildData(data, interaction.guildId);
  const sub = interaction.options.getSubcommand();

  if (sub === "cadastrar") {
    const dateText = interaction.options.getString("data");
    const parsed = isValidDateBR(dateText);

    if (!parsed) {
      return interaction.reply({
        content: "❌ Data inválida. Use assim: `/niver cadastrar data:14/04`",
        ephemeral: true
      });
    }

    guildData.birthdays[interaction.user.id] = {
      date: parsed.formatted,
      day: parsed.day,
      month: parsed.month,
      lastSentYear: null
    };

    saveData(data);

    return interaction.reply({
      content: `✅ Aniversário cadastrado para **${parsed.formatted}**.`,
      ephemeral: true
    });
  }

  if (sub === "remover") {
    if (!guildData.birthdays[interaction.user.id]) {
      return interaction.reply({
        content: "❌ Você não tinha aniversário cadastrado.",
        ephemeral: true
      });
    }

    delete guildData.birthdays[interaction.user.id];
    saveData(data);

    return interaction.reply({
      content: "✅ Seu aniversário foi removido.",
      ephemeral: true
    });
  }

  if (sub === "ver") {
    const user = interaction.options.getUser("usuario") || interaction.user;
    const birthday = guildData.birthdays[user.id];

    if (!birthday) {
      return interaction.reply({
        content: `❌ ${user} não tem aniversário cadastrado.`,
        ephemeral: true
      });
    }

    return interaction.reply({
      content: `🎂 Aniversário de ${user}: **${birthday.date}**`,
      ephemeral: true
    });
  }

  if (sub === "listar") {
    const entries = Object.entries(guildData.birthdays);

    if (entries.length === 0) {
      return interaction.reply({
        content: "❌ Nenhum aniversário cadastrado ainda.",
        ephemeral: true
      });
    }

    const list = entries
      .sort((a, b) => {
        if (a[1].month !== b[1].month) return a[1].month - b[1].month;
        return a[1].day - b[1].day;
      })
      .map(([userId, b]) => `🎂 <@${userId}> — **${b.date}**`)
      .join("\n");

    return interaction.reply({
      content: `📅 **Aniversários cadastrados:**\n\n${list}`,
      ephemeral: false
    });
  }

  if (sub === "canal") {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: "❌ Apenas mods/dono com permissão **Gerenciar Servidor** podem mudar o canal.",
        ephemeral: true
      });
    }

    const channel = interaction.options.getChannel("canal");
    guildData.channelId = channel.id;
    saveData(data);

    return interaction.reply({
      content: `✅ Canal de aniversário definido para ${channel}.`,
      ephemeral: true
    });
  }

  if (sub === "mensagem") {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: "❌ Apenas mods/dono com permissão **Gerenciar Servidor** podem mudar a mensagem.",
        ephemeral: true
      });
    }

    const text = interaction.options.getString("texto");

    if (!text.includes("{usuario}")) {
      return interaction.reply({
        content: "❌ A mensagem precisa ter `{usuario}` para o bot mencionar a pessoa.",
        ephemeral: true
      });
    }

    guildData.message = text;
    saveData(data);

    return interaction.reply({
      content: `✅ Mensagem definida:\n\n${text}`,
      ephemeral: true
    });
  }

  if (sub === "testar") {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: "❌ Apenas mods/dono com permissão **Gerenciar Servidor** podem testar.",
        ephemeral: true
      });
    }

    if (!guildData.channelId) {
      return interaction.reply({
        content: "❌ Primeiro defina o canal com `/niver canal`.",
        ephemeral: true
      });
    }

    const channel = await interaction.guild.channels.fetch(guildData.channelId).catch(() => null);

    if (!channel) {
      return interaction.reply({
        content: "❌ O canal configurado não existe mais ou o bot não tem acesso.",
        ephemeral: true
      });
    }

    const msg = guildData.message
      .replaceAll("{usuario}", `${interaction.user}`)
      .replaceAll("{servidor}", interaction.guild.name);

    await channel.send(msg);

    return interaction.reply({
      content: "✅ Mensagem de teste enviada.",
      ephemeral: true
    });
  }
});

async function checkBirthdays() {
  const data = loadData();
  const today = todayInBrazil();

  for (const [guildId, guildData] of Object.entries(data.guilds)) {
    if (!guildData.channelId) continue;

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) continue;

    const channel = await guild.channels.fetch(guildData.channelId).catch(() => null);
    if (!channel) continue;

    for (const [userId, birthday] of Object.entries(guildData.birthdays)) {
      const isToday =
        birthday.day === today.day &&
        birthday.month === today.month;

      const alreadySent = birthday.lastSentYear === today.year;

      if (!isToday || alreadySent) continue;

      const message = guildData.message
        .replaceAll("{usuario}", `<@${userId}>`)
        .replaceAll("{servidor}", guild.name);

      await channel.send(message);

      birthday.lastSentYear = today.year;
      saveData(data);
    }
  }
}

registerCommands()
  .then(() => client.login(process.env.DISCORD_TOKEN))
  .catch(err => {
    console.error("Erro ao iniciar o bot:", err);
  });