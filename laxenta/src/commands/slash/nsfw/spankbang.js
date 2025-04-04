const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const puppeteer = require('puppeteer');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mediafind')
    .setDescription('Search or get random media content')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Optional search term')
        .setRequired(false)
    ),

  async execute(interaction) {
    const query = interaction.options.getString('query');
    await interaction.deferReply({ ephemeral: true });

    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ],
      });

      const page = await browser.newPage();
      
      // Use a more modern user agent
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Set cookies for age verification
      await page.setCookie({
        name: 'sa_age_verified',
        value: '1',
        domain: '.spankbang.com'
      });

      const url = query
        ? `https://spankbang.com/s/${encodeURIComponent(query)}/1`
        : 'https://spankbang.com/categories/hentai/';

      // Add randomized request delay to avoid detection
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 40000 // Increased timeout
      });

      // Random delay between 1-3 seconds to appear more human-like
      await page.waitForTimeout(Math.random() * 2000 + 1000);

      // Attempt to extract thumbnails as well
      const results = await page.evaluate(() => {
        const getVideos = () => {
          const videos = new Map();
          document.querySelectorAll('.video-item').forEach(item => {
            try {
              const anchor = item.querySelector('.n a, .title a');
              const thumbnailElement = item.querySelector('img.thumb');
              const durationElement = item.querySelector('.l');
              const viewsElement = item.querySelector('.v');
              
              if (anchor) {
                const href = anchor.getAttribute('href');
                const title = anchor.innerText.trim();
                const thumbnail = thumbnailElement ? thumbnailElement.getAttribute('data-src') || thumbnailElement.getAttribute('src') : null;
                const duration = durationElement ? durationElement.innerText.trim() : '';
                const views = viewsElement ? viewsElement.innerText.trim() : '';
                
                if (!videos.has(href) && title) {
                  videos.set(href, {
                    title,
                    url: 'https://spankbang.com' + href,
                    thumbnail,
                    duration,
                    views
                  });
                }
              }
            } catch (e) {
              // Skip individual item if there's an error
            }
          });
          return Array.from(videos.values());
        };

        const all = getVideos();
        // Shuffle results
        for (let i = all.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [all[i], all[j]] = [all[j], all[i]];
        }

        return all.slice(0, 5);
      });

      await browser.close();

      if (results.length === 0) {
        return interaction.editReply('❌ No content found. Try different search terms.');
      }

      // Create Discord embeds for better display
      const embeds = results.map((video, index) => {
        const embed = new EmbedBuilder()
          .setTitle(`${index + 1}. ${video.title}`)
          .setURL(video.url)
          .setColor(0xFF5733)
          .setDescription(`⏱️ ${video.duration || 'Unknown'} | 👁️ ${video.views || 'Unknown views'}`)
          .setFooter({ text: 'Results are randomly selected' });
        
        // Add thumbnail if available
        if (video.thumbnail && !video.thumbnail.includes('blank.gif')) {
          embed.setImage(video.thumbnail);
        }
        
        return embed;
      });

      // Limit to 4 embeds to stay within Discord limits
      const finalEmbeds = embeds.slice(0, 4);
      
      await interaction.editReply({
        content: query ? `🔞 Top results for **${query}**:` : '🔞 Random content:',
        embeds: finalEmbeds
      });

    } catch (error) {
      console.error('Scrape error:', error);
      
      // Better error handling with more specific messages
      if (error.message.includes('timeout')) {
        await interaction.editReply('❌ Request timed out. The site might be experiencing high traffic or blocking requests.');
      } else if (error.message.includes('Navigation failed')) {
        await interaction.editReply('❌ Navigation failed. The site might be implementing more aggressive anti-bot measures.');
      } else if (error.message.includes('Could not find video elements')) {
        await interaction.editReply('❌ Could not load videos. Try changing your search terms or try again later.');
      } else {
        await interaction.editReply(`❌ Error fetching results: ${error.message.substring(0, 100)}. Please try again later.`);
      }
    }
  },
};