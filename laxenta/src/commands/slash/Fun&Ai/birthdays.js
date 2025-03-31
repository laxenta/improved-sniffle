// birthdays.js - Optimized Discord Birthday Bot
const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder,
  ComponentType,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const mongoose = require('mongoose');
const cron = require('node-cron');

// MongoDB Connection
async function connectDatabase() {
  try {
    const MONGO_URI = process.env.MONGO_URI;
    await mongoose.connect(MONGO_URI, { 
      useNewUrlParser: true, 
      useUnifiedTopology: true 
    });
    console.log("✅ Connected to MongoDB for Birthday System");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }
}

// Schema Definition
const birthdaySchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  day: { type: Number, required: true },
  month: { type: Number, required: true },
  year: { type: Number },
  createdAt: { type: Date, default: Date.now },
  wishList: [{ userId: String, username: String, timestamp: Date }],
  followers: [{ userId: String, username: String, timestamp: Date }]
});

// Optimize queries with indexes
birthdaySchema.index({ month: 1, day: 1 });
birthdaySchema.index({ userId: 1 });
birthdaySchema.index({ username: 'text' });

const Birthday = mongoose.models.Birthday || mongoose.model('Birthday', birthdaySchema);

// Utility functions
const months = [
  "January", "February", "March", "April", "May", "June", 
  "July", "August", "September", "October", "November", "December"
];

function validateDate(day, month, year = null) {
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(year || 2024, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return false;
  if (year !== null) {
    const currentYear = new Date().getFullYear();
    if (year < 1900 || year > currentYear) return false;
  }
  return true;
}

function formatDate(day, month, year = null) {
  return `${months[month - 1]} ${day}${year ? `, ${year}` : ""}`;
}

function getDaysUntilBirthday(day, month) {
  const today = new Date();
  const currentYear = today.getFullYear();
  let birthdayThisYear = new Date(currentYear, month - 1, day);
  if (birthdayThisYear < today) birthdayThisYear.setFullYear(currentYear + 1);
  return Math.ceil((birthdayThisYear - today) / (1000 * 60 * 60 * 24));
}

function isBirthdayToday(day, month) {
  const today = new Date();
  return today.getDate() === day && (today.getMonth() + 1) === month;
}

async function findUserByIdentifier(identifier) {
  // Handle Discord mention format
  const mentionMatch = identifier.match(/<@!?(\d+)>/);
  if (mentionMatch) {
    identifier = mentionMatch[1];
  }

  // Try exact userId match first
  let birthday = await Birthday.findOne({ userId: identifier });
  if (birthday) return birthday;
  
  // Try case-insensitive username match
  birthday = await Birthday.findOne({ 
    username: { $regex: new RegExp('^' + identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') } 
  });
  if (birthday) return birthday;
  
  // Try partial username match
  birthday = await Birthday.findOne({ 
    username: { $regex: new RegExp(identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } 
  });
  return birthday;
}

// Embed creators
function createErrorEmbed(title, description) {
  return new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle(`❌ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

function createSuccessEmbed(title, description) {
  return new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle(`✅ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

function createInfoEmbed(title, description) {
  return new EmbedBuilder()
    .setColor('#FF69B4')
    .setTitle(`🎂 ${title}`)
    .setDescription(description)
    .setTimestamp();
}

function createWarningEmbed(title, description) {
  return new EmbedBuilder()
    .setColor('#FFA500')
    .setTitle(`⚠️ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

// DM notification functions
async function sendBirthdayDM(client, userId, username) {
  try {
    const user = await client.users.fetch(userId);
    if (!user) return false;
    
    const embed = new EmbedBuilder()
      .setColor('#FF69B4')
      .setTitle('🎂 Happy Birthday!')
      .setDescription(`Hey ${username}, it's your birthday today! Enjoy your day and some cake! 🍰`)
      .setImage('https://i.pinimg.com/originals/57/e3/c8/57e3c8a764413d509584fc526825b980.gif')
      .setTimestamp();
    
    await user.send({ embeds: [embed] });
    console.log(`Birthday DM sent to ${username} (${userId})`);
    return true;
  } catch (err) {
    console.error(`Error sending birthday DM to ${username} (${userId}):`, err);
    return false;
  }
}

async function sendFollowNotificationDM(client, followerUserId, birthdayUser) {
  try {
    const follower = await client.users.fetch(followerUserId);
    if (!follower) return false;
    
    let user = null;
    try {
      user = await client.users.fetch(birthdayUser.userId);
    } catch (e) {
      // User not found, continue without avatar
    }
    
    const embed = new EmbedBuilder()
      .setColor('#00FFFF')
      .setTitle('🔔 Birthday Notification')
      .setDescription(`**${birthdayUser.username}'s** birthday is today!`)
      .setThumbnail(user ? user.displayAvatarURL({ dynamic: true }) : null)
      .addFields(
        { name: 'Birth Date', value: formatDate(birthdayUser.day, birthdayUser.month, birthdayUser.year), inline: true },
        { name: 'Birthday User', value: `<@${birthdayUser.userId}>`, inline: true }
      )
      .setTimestamp();
    
    await follower.send({ embeds: [embed] });
    console.log(`Follow notification DM sent to ${followerUserId}`);
    return true;
  } catch (err) {
    console.error(`Error sending follow notification DM to ${followerUserId}:`, err);
    return false;
  }
}

// Birthday checker (runs every hour)
function setupBirthdayChecker(client) {
  cron.schedule('0 * * * *', async () => {
    try {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentDay = now.getDate();
      console.log(`🎂 Birthday check running for ${currentMonth}-${currentDay}`);
      
      const todaysBirthdays = await Birthday.find({ month: currentMonth, day: currentDay });
      console.log(`Found ${todaysBirthdays.length} birthdays today`);
      
      for (const birthday of todaysBirthdays) {
        // Send DM to birthday person
        await sendBirthdayDM(client, birthday.userId, birthday.username);
        
        // Notify followers
        if (birthday.followers && birthday.followers.length > 0) {
          console.log(`Notifying ${birthday.followers.length} followers for ${birthday.username}`);
          for (const follower of birthday.followers) {
            await sendFollowNotificationDM(client, follower.userId, birthday);
          }
        }
      }
    } catch (error) {
      console.error('Birthday checker error:', error);
    }
  });
  console.log('🕒 Birthday checker scheduled (every hour)!');
}

// Pagination helpers
function createPaginationRow(currentPage, totalPages) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('prev_page')
        .setLabel('◀️ Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0),
      new ButtonBuilder()
        .setCustomId('next_page')
        .setLabel('Next ▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === totalPages - 1)
    );
}

async function handlePagination(interaction, embeds, initialPage = 0) {
  if (embeds.length === 0) {
    await interaction.reply({
      embeds: [createWarningEmbed('No Data', 'No information to display.')],
      ephemeral: true
    });
    return;
  }
  
  if (embeds.length === 1) {
    await interaction.reply({ embeds: [embeds[0]] });
    return;
  }
  
  let currentPage = initialPage;
  const paginationRow = createPaginationRow(currentPage, embeds.length);
  
  const response = await interaction.reply({
    embeds: [embeds[currentPage]],
    components: [paginationRow],
    fetchReply: true
  });
  
  const filter = i => 
    i.customId === 'prev_page' || 
    i.customId === 'next_page';
  
  const collector = response.createMessageComponentCollector({ 
    filter, 
    time: 120000,
    componentType: ComponentType.Button
  });
  
  collector.on('collect', async i => {
    if (i.customId === 'prev_page') {
      currentPage = Math.max(0, currentPage - 1);
    } else if (i.customId === 'next_page') {
      currentPage = Math.min(embeds.length - 1, currentPage + 1);
    }
    
    const updatedRow = createPaginationRow(currentPage, embeds.length);
    
    await i.update({
      embeds: [embeds[currentPage]],
      components: [updatedRow]
    });
  });
  
  collector.on('end', async () => {
    try {
      await interaction.editReply({
        components: []
      });
    } catch (error) {
      console.error('Failed to remove pagination buttons:', error);
    }
  });

  collector.on('collect', async i => {
    if (i.customId === 'interact_page') {
      const currentPageItems = pages[currentPage];
      
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('birthday_interact')
        .setPlaceholder('Select a user to interact with...')
        .addOptions(
          currentPageItems.map(b => 
            new StringSelectMenuOptionBuilder()
              .setLabel(`${b.username}`)
              .setDescription(`${b.daysUntil === 0 ? 'Today!' : `In ${b.daysUntil} days`}`)
              .setValue(b.userId)
          )
        );

      const selectRow = new ActionRowBuilder().addComponents(selectMenu);

      const reply = await i.reply({
        embeds: [createInfoEmbed('Interact with Birthday', 'Select a user to view their birthday details and interact with them!')],
        components: [selectRow],
        ephemeral: true,
        fetchReply: true
      });

      // Create a new collector specifically for this select menu
      const selectCollector = reply.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60000
      });

      selectCollector.on('collect', async selectInteraction => {
        const selectedUserId = selectInteraction.values[0];
        
        // Create a new webhook for editing the ephemeral message
        const webhook = await interaction.webhook.fetchMessage(reply.id);
        
        // Call lookupBirthday with the webhook for response
        await lookupBirthday(selectInteraction, selectedUserId);
        
        // End the collector after selection
        selectCollector.stop();
      });

      selectCollector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          try {
            await i.editReply({
              components: [],
              embeds: [createWarningEmbed('Timeout', 'Selection menu expired.')]
            });
          } catch (error) {
            // Ignore if message was already handled
          }
        }
      });
    }
  });
}

// Command handlers
async function setBirthday(interaction) {
  try {
    const day = interaction.options.getInteger('day');
    const month = interaction.options.getInteger('month');
    const year = interaction.options.getInteger('year') || null;
    
    if (!validateDate(day, month, year)) {
      return interaction.reply({
        embeds: [createErrorEmbed('Invalid Date', `The date ${month}/${day}${year ? `/${year}` : ''} is invalid.`)],
        ephemeral: true
      });
    }
    
    const user = await interaction.client.users.fetch(interaction.user.id);
    
    await Birthday.findOneAndUpdate(
      { userId: interaction.user.id },
      { 
        userId: interaction.user.id, 
        username: interaction.user.username, 
        day, 
        month, 
        year 
      },
      { upsert: true, new: true }
    );
    
    const daysUntil = getDaysUntilBirthday(day, month);
    const birthdayDate = formatDate(day, month, year);
    
    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('🎉 Birthday Set!')
      .setDescription(`Your birthday is set to **${birthdayDate}**`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: 'Days Until Birthday', value: daysUntil === 0 ? 'Today! Happy Birthday! 🎂' : `${daysUntil} day${daysUntil !== 1 ? 's' : ''}`, inline: true },
        { name: 'Birthday Notifications', value: 'You\'ll receive a DM on your birthday!', inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'Others can follow your birthday to get notified' });
    
    await interaction.reply({ embeds: [embed] });
    
    // If today is the birthday, send DM immediately
    if (isBirthdayToday(day, month)) {
      await sendBirthdayDM(interaction.client, interaction.user.id, interaction.user.username);
    }
  } catch (error) {
    console.error('Error in setBirthday:', error);
    await interaction.reply({
      embeds: [createErrorEmbed('Error', 'Failed to set your birthday.')],
      ephemeral: true
    });
  }
}

async function removeBirthday(interaction) {
  try {
    const deleted = await Birthday.findOneAndDelete({ userId: interaction.user.id });
    if (!deleted) {
      return interaction.reply({
        embeds: [createErrorEmbed('No Birthday Found', 'You don\'t have a birthday registered.')],
        ephemeral: true
      });
    }
    
    await interaction.reply({
      embeds: [createSuccessEmbed('Birthday Removed', 'Your birthday has been removed from the system.')]
    });
  } catch (error) {
    console.error('Error in removeBirthday:', error);
    await interaction.reply({
      embeds: [createErrorEmbed('Error', 'Failed to remove your birthday.')],
      ephemeral: true
    });
  }
}

async function showUpcomingBirthdays(interaction) {
  try {
    const days = interaction.options.getInteger('days') || 30;
    const allBirthdays = await Birthday.find({});
    
    if (!allBirthdays.length) {
      return interaction.reply({
        embeds: [createWarningEmbed('No Birthdays Found', 'No birthdays registered yet.')],
        ephemeral: true
      });
    }
    
    const upcomingBirthdays = allBirthdays
      .map(b => ({ ...b.toObject(), daysUntil: getDaysUntilBirthday(b.day, b.month) }))
      .filter(b => b.daysUntil <= days)
      .sort((a, b) => a.daysUntil - b.daysUntil);
    
    if (!upcomingBirthdays.length) {
      return interaction.reply({
        embeds: [createWarningEmbed('No Upcoming Birthdays', `No birthdays in the next ${days} days.`)],
        ephemeral: true
      });
    }

    // Create paginated embeds (10 birthdays per page)
    const ITEMS_PER_PAGE = 10;
    const embeds = [];
    const pages = [];

    for (let i = 0; i < upcomingBirthdays.length; i += ITEMS_PER_PAGE) {
      const pageItems = upcomingBirthdays.slice(i, i + ITEMS_PER_PAGE);
      pages.push(pageItems);
      
      const embed = new EmbedBuilder()
        .setColor('#FF69B4')
        .setTitle(`🎂 Upcoming Birthdays (Next ${days} Days)`)
        .setDescription('Here are the upcoming birthdays.')
        .setFooter({ text: `Page ${Math.floor(i/ITEMS_PER_PAGE) + 1}/${Math.ceil(upcomingBirthdays.length/ITEMS_PER_PAGE)} • ${upcomingBirthdays.length} birthdays found` })
        .setTimestamp();
      
      pageItems.forEach(b => {
        const age = b.year ? new Date().getFullYear() - b.year : null;
        const ageText = age ? ` (Turning ${age}!)` : '';
        
        embed.addFields({
          name: `${b.username} - ${b.daysUntil === 0 ? 'Today! 🎂' : `${b.daysUntil} day${b.daysUntil !== 1 ? 's' : ''}`}`,
          value: `<@${b.userId}> - **${formatDate(b.day, b.month, b.year)}**${ageText}`,
          inline: false
        });
      });
      
      embeds.push(embed);
    }
    
    let currentPage = 0;

    // Create action row with pagination buttons AND dropdown
    const createActionRow = (pageNum, currentPageItems) => {
      const row = new ActionRowBuilder();
      
      // Add dropdown menu first
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('birthday_follow')
        .setPlaceholder('Select someone to follow...')
        .addOptions(
          currentPageItems.map(b => 
            new StringSelectMenuOptionBuilder()
              .setLabel(`${b.username}`)
              .setDescription(`${b.daysUntil === 0 ? 'Today!' : `In ${b.daysUntil} days`}`)
              .setValue(b.userId)
          )
        );
      
      const dropdownRow = new ActionRowBuilder().addComponents(selectMenu);
      
      // Add pagination buttons in separate row if multiple pages
      const buttonRow = new ActionRowBuilder();
      if (embeds.length > 1) {
        buttonRow.addComponents(
          new ButtonBuilder()
            .setCustomId('prev_page')
            .setLabel('◀️ Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(pageNum === 0),
          new ButtonBuilder()
            .setCustomId('next_page')
            .setLabel('Next ▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(pageNum === embeds.length - 1)
        );
        return [dropdownRow, buttonRow];
      }
      
      return [dropdownRow];
    };

    const response = await interaction.reply({
      embeds: [embeds[0]],
      components: createActionRow(0, pages[0]),
      fetchReply: true
    });

    // Combined collector for both buttons and select menu
    const collector = response.createMessageComponentCollector({
      time: 300000 // 5 minutes
    });

    collector.on('collect', async i => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({ content: 'These interactions are not for you!', ephemeral: true });
      }

      try {
        if (i.customId === 'prev_page') {
          currentPage = Math.max(0, currentPage - 1);
          await i.update({
            embeds: [embeds[currentPage]],
            components: createActionRow(currentPage, pages[currentPage])
          });
        } 
        else if (i.customId === 'next_page') {
          currentPage = Math.min(embeds.length - 1, currentPage + 1);
          await i.update({
            embeds: [embeds[currentPage]],
            components: createActionRow(currentPage, pages[currentPage])
          });
        }
        else if (i.customId === 'birthday_follow') {
          const selectedUserId = i.values[0];
          const birthday = await Birthday.findOne({ userId: selectedUserId });
          
          if (!birthday) {
            await i.reply({
              embeds: [createErrorEmbed('User Not Found', 'Selected birthday user not found.')],
              ephemeral: true
            });
            return;
          }

          if (birthday.followers?.some(f => f.userId === i.user.id)) {
            await i.reply({
              embeds: [createWarningEmbed('Already Following', `You're already following ${birthday.username}'s birthday.`)],
              ephemeral: true
            });
            return;
          }

          await Birthday.findOneAndUpdate(
            { userId: selectedUserId },
            { $push: { followers: { 
              userId: i.user.id, 
              username: i.user.username, 
              timestamp: new Date() 
            } } }
          );

          await i.reply({
            embeds: [createSuccessEmbed('Now Following!', `You'll get a DM when ${birthday.username}'s birthday arrives.`)],
            ephemeral: true
          });
        }
      } catch (error) {
        console.error('Error handling interaction:', error);
        await i.reply({
          embeds: [createErrorEmbed('Error', 'Failed to process your request.')],
          ephemeral: true
        });
      }
    });

    collector.on('end', async () => {
      try {
        await interaction.editReply({ components: [] });
      } catch (error) {
        // Ignore errors if message was already deleted
      }
    });

  } catch (error) {
    console.error('Error in showUpcomingBirthdays:', error);
    await interaction.reply({
      embeds: [createErrorEmbed('Error', 'Failed to retrieve upcoming birthdays.')],
      ephemeral: true
    });
  }
}

async function wishBirthday(interaction) {
  try {
    const identifier = interaction.options.getString('user');
    const birthday = await findUserByIdentifier(identifier);
    
    if (!birthday) {
      return interaction.reply({
        embeds: [createErrorEmbed('User Not Found', `No birthday found for "${identifier}".`)],
        ephemeral: true
      });
    }
    
    if (!isBirthdayToday(birthday.day, birthday.month)) {
      const daysUntil = getDaysUntilBirthday(birthday.day, birthday.month);
      return interaction.reply({
        embeds: [createWarningEmbed('Not Today', `It's not ${birthday.username}'s birthday today. Their birthday is on **${formatDate(birthday.day, birthday.month, birthday.year)}** (in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}).`)],
        ephemeral: true
      });
    }
    
    const alreadyWished = birthday.wishList.some(w => w.userId === interaction.user.id);
    if (alreadyWished) {
      return interaction.reply({
        embeds: [createWarningEmbed('Already Wished', `You've already wished ${birthday.username} a happy birthday today!`)],
        ephemeral: true
      });
    }
    
    // Add to wish list
    await Birthday.findOneAndUpdate(
      { userId: birthday.userId },
      { $push: { wishList: { userId: interaction.user.id, username: interaction.user.username, timestamp: new Date() } } }
    );
    
    // Get user info if possible
    let birthdayUser = null;
    try {
      birthdayUser = await interaction.client.users.fetch(birthday.userId);
    } catch (err) {
      // Continue without user avatar
    }
    
    // Get sender info
    const sender = await interaction.client.users.fetch(interaction.user.id);
    
    // Send DM to birthday person
    if (birthdayUser) {
      const wishEmbed = new EmbedBuilder()
        .setColor('#FF69B4')
        .setTitle('🎂 Birthday Wish!')
        .setDescription(`**${interaction.user.username}** has wished you a happy birthday!`)
        .setThumbnail(sender.displayAvatarURL({ dynamic: true }))
        .setTimestamp();
      
      try {
        await birthdayUser.send({ embeds: [wishEmbed] });
      } catch (err) {
        console.log(`Could not DM ${birthday.username}`);
      }
    }
    
    // Reply to command
    const successEmbed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('🎉 Birthday Wish Sent!')
      .setDescription(`You've wished <@${birthday.userId}> a happy birthday!`)
      .setThumbnail(birthdayUser ? birthdayUser.displayAvatarURL({ dynamic: true }) : null)
      .setTimestamp();
    
    await interaction.reply({ embeds: [successEmbed] });
  } catch (error) {
    console.error('Error in wishBirthday:', error);
    await interaction.reply({
      embeds: [createErrorEmbed('Error', 'Failed to send birthday wish.')],
      ephemeral: true
    });
  }
}

async function viewBirthday(interaction) {
  try {
    const identifier = interaction.options.getString('user');
    const birthday = await findUserByIdentifier(identifier);
    
    if (!birthday) {
      return interaction.reply({
        embeds: [createErrorEmbed('User Not Found', `No birthday info for "${identifier}".`)],
        ephemeral: true
      });
    }
    
    const daysUntil = getDaysUntilBirthday(birthday.day, birthday.month);
    const birthdayDate = formatDate(birthday.day, birthday.month, birthday.year);
    const age = birthday.year ? new Date().getFullYear() - birthday.year : null;
    
    let user;
    try {
      user = await interaction.client.users.fetch(birthday.userId);
    } catch (err) {
      user = null;
    }
    
    const embed = new EmbedBuilder()
      .setColor('#FF69B4')
      .setTitle(`🎂 ${birthday.username}'s Birthday`)
      .setDescription(`**${birthdayDate}**${age ? ` (Turning ${age})` : ""}`)
      .setThumbnail(user ? user.displayAvatarURL({ dynamic: true }) : null)
      .addFields(
        { name: '🗓️ Days Until Birthday', value: daysUntil === 0 ? 'Today! 🎉' : `${daysUntil} day${daysUntil !== 1 ? 's' : ''}`, inline: true },
        { name: '👤 User', value: `<@${birthday.userId}>`, inline: true },
        { name: '📊 Stats', value: `${birthday.followers?.length || 0} followers | ${birthday.wishList?.length || 0} birthday wishes` }
      )
      .setTimestamp();
    
    // Create action buttons
    const actionRow = new ActionRowBuilder();
    
    // Add follow button
    if (!birthday.followers?.some(f => f.userId === interaction.user.id)) {
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId('follow_birthday')
          .setLabel('🔔 Follow')
          .setStyle(ButtonStyle.Secondary)
      );
    }
    
    // Add wish button if it's their birthday today
    if (daysUntil === 0 && !birthday.wishList?.some(w => w.userId === interaction.user.id)) {
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId('wish_birthday')
          .setLabel('🎂 Wish Happy Birthday!')
          .setStyle(ButtonStyle.Primary)
      );
    }
    
    const hasButtons = actionRow.components.length > 0;
    const response = await interaction.reply({ 
      embeds: [embed], 
      components: hasButtons ? [actionRow] : [],
      fetchReply: true
    });
    
    if (hasButtons) {
      const collector = response.createMessageComponentCollector({ 
        componentType: ComponentType.Button,
        time: 60000
      });
      
      collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
          return i.reply({ 
            content: 'These buttons are not for you!', 
            ephemeral: true 
          });
        }
        
        if (i.customId === 'follow_birthday') {
          try {
            // Check if already following
            const birthdayRecord = await Birthday.findOne({ userId: birthday.userId });
            if (birthdayRecord.followers.some(f => f.userId === i.user.id)) {
              return i.update({
                embeds: [createWarningEmbed('Already Following', `You're already following ${birthdayRecord.username}'s birthday.`)],
                components: []
              });
            }
            
            // Add follower
            await Birthday.findOneAndUpdate(
              { userId: birthday.userId },
              { $push: { followers: { userId: i.user.id, username: i.user.username, timestamp: new Date() } } }
            );
            
            await i.update({
              embeds: [createSuccessEmbed('Now Following!', `You'll get a DM when ${birthday.username}'s birthday arrives.`)],
              components: []
            });
          } catch (error) {
            console.error('Error in follow button:', error);
            await i.update({
              embeds: [createErrorEmbed('Error', 'Failed to follow birthday.')],
              components: []
            });
          }
        } else if (i.customId === 'wish_birthday') {
          try {
            // Check if already wished
            const birthdayRecord = await Birthday.findOne({ userId: birthday.userId });
            if (birthdayRecord.wishList.some(w => w.userId === i.user.id)) {
              return i.update({
                embeds: [createWarningEmbed('Already Wished', `You've already wished ${birthdayRecord.username} a happy birthday today!`)],
                components: []
              });
            }
            
            // Add to wish list
            await Birthday.findOneAndUpdate(
              { userId: birthday.userId },
              { $push: { wishList: { userId: i.user.id, username: i.user.username, timestamp: new Date() } } }
            );
            
            // Get sender info
            const sender = await i.client.users.fetch(i.user.id);
            
            // Send DM to birthday person
            if (user) {
              const wishEmbed = new EmbedBuilder()
                .setColor('#FF69B4')
                .setTitle('🎂 Birthday Wish!')
                .setDescription(`**${i.user.username}** has wished you a happy birthday!`)
                .setThumbnail(sender.displayAvatarURL({ dynamic: true }))
                .setTimestamp();
              
              try {
                await user.send({ embeds: [wishEmbed] });
              } catch (err) {
                console.log(`Could not DM ${birthday.username}`);
              }
            }
            
            await i.update({
              embeds: [createSuccessEmbed('Birthday Wish Sent!', `You've wished ${birthday.username} a happy birthday! 🎉`)],
              components: []
            });
          } catch (error) {
            console.error('Error in wish button:', error);
            await i.update({
              embeds: [createErrorEmbed('Error', 'Failed to send birthday wish.')],
              components: []
            });
          }
        }
      });
      
      collector.on('end', async () => {
        try {
          await interaction.editReply({ components: [] });
        } catch (error) {
          // Ignore errors if message was already deleted
        }
      });
    }
  } catch (error) {
    console.error('Error in viewBirthday:', error);
    await interaction.reply({
      embeds: [createErrorEmbed('Error', 'Failed to retrieve birthday info.')],
      ephemeral: true
    });
  }
}



async function testBirthday(interaction) {
  try {
    const result = await sendBirthdayDM(interaction.client, interaction.user.id, interaction.user.username);
    
    if (result) {
      await interaction.reply({
        embeds: [createSuccessEmbed('Test Successful', 'Birthday notification DM sent successfully. Check your DMs!')],
        ephemeral: true
      });
    } else {
      await interaction.reply({
        embeds: [createWarningEmbed('Test Failed', 'Failed to send test birthday DM. You might have DMs disabled.')],
        ephemeral: true
      });
    }
  } catch (error) {
    console.error('Error in testBirthday:', error);
    await interaction.reply({
      embeds: [createErrorEmbed('Error', 'Failed to send test birthday notification.')],
      ephemeral: true
    });
  }
}

async function unfollowBirthday(interaction) {
  try {
    const identifier = interaction.options.getString('user');
    const birthday = await findUserByIdentifier(identifier);
    
    if (!birthday) {
      return interaction.reply({
        embeds: [createErrorEmbed('User Not Found', `No birthday found for "${identifier}".`)],
        ephemeral: true
      });
    }
    
    // Check if actually following
    if (!birthday.followers || !birthday.followers.some(f => f.userId === interaction.user.id)) {
      return interaction.reply({
        embeds: [createWarningEmbed('Not Following', `You're not following ${birthday.username}'s birthday.`)],
        ephemeral: true
      });
    }
    
    // Remove follower
    await Birthday.findOneAndUpdate(
      { userId: birthday.userId },
      { $pull: { followers: { userId: interaction.user.id } } }
    );
    
    await interaction.reply({
      embeds: [createSuccessEmbed('Unfollowed', `You've unfollowed ${birthday.username}'s birthday and won't receive notifications.`)],
      ephemeral: true
    });
  } catch (error) {
    console.error('Error in unfollowBirthday:', error);
    await interaction.reply({
      embeds: [createErrorEmbed('Error', 'Failed to unfollow birthday.')],
      ephemeral: true
    });
  }
}

async function listFollowing(interaction) {
  try {
    const allBirthdays = await Birthday.find({
      'followers.userId': interaction.user.id
    });
    
    if (!allBirthdays.length) {
      return interaction.reply({
        embeds: [createWarningEmbed('Not Following Anyone', "You're not following anyone's birthday.")],
        ephemeral: true
      });
    }
    
    // Sort by upcoming
    allBirthdays.sort((a, b) => {
      const daysUntilA = getDaysUntilBirthday(a.day, a.month);
      const daysUntilB = getDaysUntilBirthday(b.day, b.month);
      return daysUntilA - daysUntilB;
    });
    
    // Fetch user avatars when possible
    const userCache = new Map();
    for (const birthday of allBirthdays) {
      try {
        const user = await interaction.client.users.fetch(birthday.userId);
        userCache.set(birthday.userId, user);
      } catch (err) {
        // User not fetchable, continue
      }
    }
    
    // Create paginated embeds (5 birthdays per page)
    const embeds = [];
    for (let i = 0; i < allBirthdays.length; i += 5) {
      const pageItems = allBirthdays.slice(i, i + 5);
      
      const embed = new EmbedBuilder()
        .setColor('#FF69B4')
        .setTitle('🔔 Birthdays You Follow')
        .setDescription("Here are all the birthdays you're following. You'll get a DM notification when they arrive!")
        .setFooter({ text: `Page ${Math.floor(i/5) + 1}/${Math.ceil(allBirthdays.length/5)} • ${allBirthdays.length} birthdays followed` })
        .setTimestamp();
      
      pageItems.forEach(b => {
        const daysUntil = getDaysUntilBirthday(b.day, b.month);
        const age = b.year ? new Date().getFullYear() - b.year : null;
        const ageText = age ? ` (Turning ${age}!)` : '';
        const user = userCache.get(b.userId);
        
        embed.addFields({
          name: `${b.username} - ${daysUntil === 0 ? 'Today! 🎂' : `${daysUntil} day${daysUntil !== 1 ? 's' : ''}`}`,
          value: `<@${b.userId}> - **${formatDate(b.day, b.month, b.year)}**${ageText}`,
          inline: false
        });
      });
      
      embeds.push(embed);
    }
    
    // Add unfollow options
    setTimeout(async () => {
      try {
        if (allBirthdays.length > 10) allBirthdays.length = 10; // Limit to 10 for select menu
        
        const selectOptions = allBirthdays.map(b => 
          new StringSelectMenuOptionBuilder()
            .setLabel(`${b.username} (${formatDate(b.day, b.month)})`)
            .setDescription(`${getDaysUntilBirthday(b.day, b.month) === 0 ? 'Today!' : `In ${getDaysUntilBirthday(b.day, b.month)} days`}`)
            .setValue(b.userId)
        );
        
        const unfollowSelect = new StringSelectMenuBuilder()
          .setCustomId('unfollow_select')
          .setPlaceholder('Select a user to unfollow...')
          .addOptions(selectOptions);
        
        const selectRow = new ActionRowBuilder().addComponents(unfollowSelect);
        
        const unfollowMessage = await interaction.followUp({
          embeds: [createInfoEmbed('Unfollow Birthdays', 'Select a user below to unfollow their birthday:')],
          components: [selectRow],
          ephemeral: true,
          fetchReply: true
        });
        
        const collector = unfollowMessage.createMessageComponentCollector({ 
          componentType: ComponentType.StringSelect, 
          time: 60000 
        });
        
        collector.on('collect', async selectInteraction => {
          try {
            const selectedUserId = selectInteraction.values[0];
            const birthdayToUnfollow = allBirthdays.find(b => b.userId === selectedUserId);
            
            if (!birthdayToUnfollow) {
              await selectInteraction.update({
                embeds: [createErrorEmbed('User Not Found', 'Selected birthday user not found.')],
                components: []
              });
              return;
            }
            
            // Remove follower
            await Birthday.findOneAndUpdate(
              { userId: selectedUserId },
              { $pull: { followers: { userId: selectInteraction.user.id } } }
            );
            
            await selectInteraction.update({
              embeds: [createSuccessEmbed('Unfollowed', `You've unfollowed ${birthdayToUnfollow.username}'s birthday and won't receive notifications.`)],
              components: []
            });
          } catch (error) {
            console.error('Error in unfollow select:', error);
            await selectInteraction.update({
              embeds: [createErrorEmbed('Error', 'Failed to process unfollow request.')],
              components: []
            });
          }
        });
        
        collector.on('end', async (collected, reason) => {
          if (reason === 'time' && collected.size === 0) {
            try {
              await unfollowMessage.delete();
            } catch (e) {
              // Ignore errors if message was already deleted
            }
          }
        });
      } catch (error) {
        console.error('Error creating unfollow message:', error);
      }
    }, 1000);
    
    // Handle pagination
    await handlePagination(interaction, embeds);
  } catch (error) {
    console.error('Error in listFollowing:', error);
    await interaction.reply({
      embeds: [createErrorEmbed('Error', 'Failed to retrieve your followed birthdays.')],
      ephemeral: true
    });
  }
}

async function searchBirthdays(interaction) {
  try {
    const searchTerm = interaction.options.getString('term');
    
    // Build query using regex for case-insensitive search
    const query = {
      $or: [
        { username: { $regex: new RegExp(searchTerm, 'i') } },
        { userId: searchTerm }
      ]
    };
    
    const foundBirthdays = await Birthday.find(query).limit(10);
    
    if (!foundBirthdays.length) {
      return interaction.reply({
        embeds: [createWarningEmbed('No Results', `No birthdays found matching "${searchTerm}".`)],
        ephemeral: true
      });
    }
    
    // Sort by upcoming
    foundBirthdays.sort((a, b) => {
      const daysUntilA = getDaysUntilBirthday(a.day, a.month);
      const daysUntilB = getDaysUntilBirthday(b.day, b.month);
      return daysUntilA - daysUntilB;
    });
    
    const embed = new EmbedBuilder()
      .setColor('#FF69B4')
      .setTitle('🔍 Birthday Search Results')
      .setDescription(`Found ${foundBirthdays.length} birthdays matching "${searchTerm}"`)
      .setTimestamp();
    
    foundBirthdays.forEach(b => {
      const daysUntil = getDaysUntilBirthday(b.day, b.month);
      embed.addFields({
        name: b.username,
        value: `<@${b.userId}> - **${formatDate(b.day, b.month, b.year)}** - ${daysUntil === 0 ? 'Today! 🎂' : `${daysUntil} day${daysUntil !== 1 ? 's' : ''}`}`,
        inline: false
      });
    });
    
    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in searchBirthdays:', error);
    await interaction.reply({
      embeds: [createErrorEmbed('Error', 'Failed to search birthdays.')],
      ephemeral: true
    });
  }
}

async function showBirthdayStats(interaction) {
  try {
    const allBirthdays = await Birthday.find({});
    
    if (!allBirthdays.length) {
      return interaction.reply({
        embeds: [createWarningEmbed('No Data', 'No birthdays registered yet.')],
        ephemeral: true
      });
    }
    
    // Calculate statistics
    const totalBirthdays = allBirthdays.length;
    const todaysBirthdays = allBirthdays.filter(b => isBirthdayToday(b.day, b.month)).length;
    
    // Count birthdays by month
    const birthsByMonth = new Array(12).fill(0);
    allBirthdays.forEach(b => birthsByMonth[b.month - 1]++);
    
    // Most popular month
    const mostPopularMonthIndex = birthsByMonth.indexOf(Math.max(...birthsByMonth));
    
    // Most followed user
    let mostFollowedUser = { username: 'None', count: 0 };
    allBirthdays.forEach(b => {
      const followerCount = b.followers?.length || 0;
      if (followerCount > mostFollowedUser.count) {
        mostFollowedUser = { username: b.username, count: followerCount };
      }
    });
    
    // Most wished user
    let mostWishedUser = { username: 'None', count: 0 };
    allBirthdays.forEach(b => {
      const wishCount = b.wishList?.length || 0;
      if (wishCount > mostWishedUser.count) {
        mostWishedUser = { username: b.username, count: wishCount };
      }
    });
    
    // Create embed
    const embed = new EmbedBuilder()
      .setColor('#FF69B4')
      .setTitle('📊 Birthday System Statistics')
      .addFields(
        { name: 'Total Birthdays', value: totalBirthdays.toString(), inline: true },
        { name: 'Birthdays Today', value: todaysBirthdays.toString(), inline: true },
        { name: 'Most Popular Month', value: months[mostPopularMonthIndex], inline: true },
        { name: 'Most Followed User', value: `${mostFollowedUser.username} (${mostFollowedUser.count} followers)`, inline: true },
        { name: 'Most Wished User', value: `${mostWishedUser.username} (${mostWishedUser.count} wishes)`, inline: true }
      )
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in showBirthdayStats:', error);
    await interaction.reply({
      embeds: [createErrorEmbed('Error', 'Failed to retrieve birthday statistics.')],
      ephemeral: true
    });
  }
}

// Define slash command data
const birthdayCommandData = new SlashCommandBuilder()
  .setName('birthday')
  .setDescription('Birthday system commands')
    .setIntegrationTypes(0, 1)

    .setContexts(0, 1, 2)
  .addSubcommand(subcommand =>
    subcommand
      .setName('set')
      .setDescription('Set your birthday')
      .addIntegerOption(option =>
        option.setName('day')
          .setDescription('Day of your birthday')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(31))
      .addIntegerOption(option =>
        option.setName('month')
          .setDescription('Month of your birthday')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(12))
      .addIntegerOption(option =>
        option.setName('year')
          .setDescription('Year of your birth (optional)')
          .setRequired(false)
          .setMinValue(1900)
          .setMaxValue(new Date().getFullYear())))
  .addSubcommand(subcommand =>
    subcommand
      .setName('lookup')
      .setDescription('Look up someone\'s birthday')
      .addStringOption(option =>
        option.setName('user')
          .setDescription('@mention, username, or ID')
          .setRequired(true)))
  .addSubcommand(subcommand =>
    subcommand
      .setName('upcoming')
      .setDescription('Show upcoming birthdays')
      .addIntegerOption(option =>
        option.setName('days')
          .setDescription('Number of days to look ahead')
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(365)));

// Main execution method
async function execute(interaction) {
  try {
    // Make sure database is connected
    if (mongoose.connection.readyState !== 1) {
      await connectDatabase();
    }
    
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
      case 'set':
        await setBirthday(interaction);
        break;
      case 'lookup':
        await lookupBirthday(interaction);
        break;
      case 'upcoming':
        await showUpcomingBirthdays(interaction);
        break;
      default:
        await interaction.reply({
          embeds: [createErrorEmbed('Invalid Command', 'Unknown subcommand specified.')],
          ephemeral: true
        });
    }
  } catch (error) {
    console.error('Birthday command execution error:', error);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          embeds: [createErrorEmbed('Error', 'An unexpected error occurred while executing the command.')],
          ephemeral: true
        });
      } else {
        await interaction.reply({
          embeds: [createErrorEmbed('Error', 'An unexpected error occurred while executing the command.')],
          ephemeral: true
        });
      }
    } catch (followupError) {
      console.error('Failed to send error message:', followupError);
    }
  }
}

// Enhanced lookup function that combines view/search/follow functionality
async function lookupBirthday(interaction, directUserId = null) {
  const identifier = directUserId || interaction.options.getString('user');
  const birthday = await findUserByIdentifier(identifier);

  if (!birthday) {
    return interaction.reply({
      embeds: [createErrorEmbed('User Not Found', `No birthday found for "${identifier}"`)],
      ephemeral: true
    });
  }

  const daysUntil = getDaysUntilBirthday(birthday.day, birthday.month);
  const birthdayDate = formatDate(birthday.day, birthday.month, birthday.year);
  
  let user;
  try {
    user = await interaction.client.users.fetch(birthday.userId);
  } catch (err) {
    user = null;
  }

  const embed = new EmbedBuilder()
    .setColor('#FF69B4')
    .setTitle(`🎂 ${birthday.username}'s Birthday`)
    .setDescription(`**${birthdayDate}**`)
    .setThumbnail(user ? user.displayAvatarURL({ dynamic: true }) : null)
    .addFields(
      { name: '🗓️ Days Until Birthday', value: daysUntil === 0 ? 'Today! 🎉' : `${daysUntil} day${daysUntil !== 1 ? 's' : ''}`, inline: true },
      { name: '👤 User', value: `<@${birthday.userId}>`, inline: true }
    )
    .setTimestamp();

  const row = new ActionRowBuilder();
  
  // Follow/Unfollow button
  const isFollowing = birthday.followers?.some(f => f.userId === interaction.user.id);
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${isFollowing ? 'unfollow' : 'follow'}_${birthday.userId}`)
      .setLabel(`${isFollowing ? '🔕 Unfollow' : '🔔 Follow'}`)
      .setStyle(isFollowing ? ButtonStyle.Secondary : ButtonStyle.Primary)
  );

  // Wish button (only on birthday)
  if (daysUntil === 0) {
    const hasWished = birthday.wishList?.some(w => w.userId === interaction.user.id);
    if (!hasWished) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`wish_${birthday.userId}`)
          .setLabel('🎉 Wish Happy Birthday!')
          .setStyle(ButtonStyle.Success)
      );
    }
  }

  const response = await interaction.reply({
    embeds: [embed],
    components: row.components.length ? [row] : [],
    fetchReply: true
  });

  // Button collector
  const collector = response.createMessageComponentCollector({
    time: 60000
  });

  collector.on('collect', async i => {
    if (i.user.id !== interaction.user.id) {
      return i.reply({ content: 'These buttons are not for you!', ephemeral: true });
    }

    const [action, targetId] = i.customId.split('_');
    
    try {
      switch(action) {
        case 'follow':
          await Birthday.findOneAndUpdate(
            { userId: targetId },
            { $push: { followers: { userId: i.user.id, username: i.user.username, timestamp: new Date() } } }
          );
          await i.update({
            embeds: [createSuccessEmbed('Now Following!', `You'll get a DM when ${birthday.username}'s birthday arrives.`)],
            components: []
          });
          break;
          
        case 'unfollow':
          await Birthday.findOneAndUpdate(
            { userId: targetId },
            { $pull: { followers: { userId: i.user.id } } }
          );
          await i.update({
            embeds: [createSuccessEmbed('Unfollowed', `You've unfollowed ${birthday.username}'s birthday.`)],
            components: []
          });
          break;
          
        case 'wish':
          await Birthday.findOneAndUpdate(
            { userId: targetId },
            { $push: { wishList: { userId: i.user.id, username: i.user.username, timestamp: new Date() } } }
          );
          await i.update({
            embeds: [createSuccessEmbed('Birthday Wish Sent!', `You've wished ${birthday.username} a happy birthday! 🎉`)],
            components: []
          });
          
          // Send DM to birthday person
          if (user) {
            try {
              const wishEmbed = new EmbedBuilder()
                .setColor('#FF69B4')
                .setTitle('🎂 Birthday Wish!')
                .setDescription(`**${i.user.username}** has wished you a happy birthday!`)
                .setTimestamp();
              await user.send({ embeds: [wishEmbed] });
            } catch (err) {
              console.log(`Could not DM ${birthday.username}`);
            }
          }
          break;
      }
    } catch (error) {
      console.error(`Error handling button ${action}:`, error);
      await i.reply({
        embeds: [createErrorEmbed('Error', 'Failed to process your request.')],
        ephemeral: true
      });
    }
  });

  collector.on('end', async () => {
    try {
      await interaction.editReply({ components: [] });
    } catch (error) {
      // Ignore errors if message was already deleted
    }
  });
}

// Export the module
module.exports = {
  data: birthdayCommandData,
  execute,
  connectDatabase,
  setupBirthdayChecker
};