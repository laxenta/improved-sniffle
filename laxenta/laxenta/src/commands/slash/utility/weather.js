const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, WebhookClient } = require('discord.js');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const { registerButton } = require('../../../handlers/buttonHandler.js');
const { logger } = require('../../../utils/logger');
const path = require('path');
const fs = require('fs').promises;

// Config - in production move to .env
const API_KEY = 'fa6690aadde3440d922141501250203';

// Cache with TTL and auto-cleanup
class CacheManager {
  constructor(cleanupInterval = 30 * 60 * 1000) { // Default 30 min cleanup
    this.cache = new Map();
    setInterval(() => this.cleanup(), cleanupInterval);
  }

  set(key, value, ttl = 15 * 60 * 1000) { // Default 15 min TTL
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl
    });
    return key;
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) this.cache.delete(key);
    }
  }
}

const weatherCache = new CacheManager();

// API Functions
async function fetchCitySuggestions(query) {
  if (!query || query.trim().length < 2) return [];

  try {
    const url = `http://api.weatherapi.com/v1/search.json?key=${API_KEY}&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { timeout: 5000 });
    
    if (!res.ok) {
      logger.warn(`City search failed with status ${res.status}: ${res.statusText}`);
      return [];
    }
    
    const data = await res.json();
    return data.map(loc => `${loc.name}, ${loc.region || ''}, ${loc.country}`.replace(/, ,/g, ','));
  } catch (error) {
    logger.error(`City suggestion error: ${error.message}`);
    return [];
  }
}

async function fetchWeatherData(city, dataType = 'both') {
  // Check cache first
  const cacheKey = `${city}_${dataType}`;
  const cachedData = weatherCache.get(cacheKey);
  if (cachedData) return cachedData;

  try {
    let current, forecast;
    
    // Fetch requested data
    if (dataType === 'current' || dataType === 'both') {
      const currentUrl = `http://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${encodeURIComponent(city)}&aqi=yes`;
      const currentRes = await fetch(currentUrl, { timeout: 8000 });
      
      if (!currentRes.ok) {
        throw new Error(`Weather API returned ${currentRes.status}: ${currentRes.statusText}`);
      }
      
      current = await currentRes.json();
    }
    
    if (dataType === 'forecast' || dataType === 'both') {
      const forecastUrl = `http://api.weatherapi.com/v1/forecast.json?key=${API_KEY}&q=${encodeURIComponent(city)}&days=2&aqi=yes&alerts=yes`;
      const forecastRes = await fetch(forecastUrl, { timeout: 8000 });
      
      if (!forecastRes.ok) {
        throw new Error(`Forecast API returned ${forecastRes.status}: ${forecastRes.statusText}`);
      }
      
      forecast = await forecastRes.json();
    }

    const result = { current, forecast };
    weatherCache.set(cacheKey, result);
    return result;
  } catch (error) {
    logger.error(`Weather fetch error for ${city}: ${error.message}`);
    throw new Error(`Couldn't fetch weather data for "${city}". ${error.message}`);
  }
}

// Format functions
function getAQIDescription(aqi) {
  const pm25 = aqi && aqi.pm2_5 ? aqi.pm2_5 : null;
  
  if (pm25 === null) return null;
  
  if (pm25 <= 12) return { level: "Good", emoji: "🟢" };
  if (pm25 <= 35.4) return { level: "Moderate", emoji: "🟡" };
  if (pm25 <= 55.4) return { level: "Unhealthy for Sensitive Groups", emoji: "🟠" };
  if (pm25 <= 150.4) return { level: "Unhealthy", emoji: "🔴" };
  if (pm25 <= 250.4) return { level: "Very Unhealthy", emoji: "🟣" };
  return { level: "Hazardous", emoji: "⚫" };
}

function formatTemperature(temp_c, temp_f) {
  return `${temp_c}°C / ${temp_f}°F`;
}

function getWindDescription(speed_kph) {
  if (speed_kph < 1) return "Calm";
  if (speed_kph < 6) return "Light air";
  if (speed_kph < 12) return "Light breeze";
  if (speed_kph < 20) return "Gentle breeze";
  if (speed_kph < 29) return "Moderate breeze";
  if (speed_kph < 39) return "Fresh breeze";
  if (speed_kph < 50) return "Strong breeze";
  if (speed_kph < 62) return "High wind";
  if (speed_kph < 75) return "Gale";
  if (speed_kph < 89) return "Strong gale";
  if (speed_kph < 103) return "Storm";
  if (speed_kph < 118) return "Violent storm";
  return "Hurricane force";
}

function formatLocalTime(datetime) {
  const date = new Date(datetime);
  return date.toLocaleString('en-US', { 
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  });
}

// Embed Builders
function buildCurrentWeatherEmbed(state) {
  const embed = new EmbedBuilder();
  const primaryData = state.primary.current;
  const compareData = state.compare?.current;
  
  if (!primaryData) {
    return errorEmbed("Weather data unavailable");
  }
  
  const primaryLoc = primaryData.location;
  const primaryCur = primaryData.current;
  const titlePrefix = state.compare ? '📊 Comparison: ' : '🌡️ ';
  
  embed.setTitle(`${titlePrefix}Current Weather`);
  embed.setColor('#3498db');
  
  // Primary location
  let desc = `## ${primaryLoc.name}, ${primaryLoc.region}, ${primaryLoc.country}\n`;
  desc += `**${primaryCur.condition.text}** • ${formatLocalTime(primaryLoc.localtime)}\n\n`;
  
  desc += `**Temperature:** ${formatTemperature(primaryCur.temp_c, primaryCur.temp_f)}\n`;
  desc += `**Feels Like:** ${formatTemperature(primaryCur.feelslike_c, primaryCur.feelslike_f)}\n`;
  desc += `**Humidity:** ${primaryCur.humidity}%\n`;
  
  const windDesc = getWindDescription(primaryCur.wind_kph);
  desc += `**Wind:** ${primaryCur.wind_kph} km/h ${primaryCur.wind_dir} (${windDesc})\n`;
  desc += `**Pressure:** ${primaryCur.pressure_mb} mb\n`;
  
  if (primaryCur.precip_mm > 0) {
    desc += `**Precipitation:** ${primaryCur.precip_mm} mm\n`;
  }
  
  if (primaryCur.uv !== undefined) {
    desc += `**UV Index:** ${primaryCur.uv}\n`;
  }
  
  // Air quality if available
  if (primaryCur.air_quality) {
    const aqiDesc = getAQIDescription(primaryCur.air_quality);
    if (aqiDesc) {
      desc += `**Air Quality:** ${aqiDesc.emoji} ${aqiDesc.level} (PM2.5: ${primaryCur.air_quality.pm2_5.toFixed(1)})\n`;
    }
  }
  
  // Comparison data
  if (compareData) {
    const compLoc = compareData.location;
    const compCur = compareData.current;
    
    desc += `\n## ${compLoc.name}, ${compLoc.region}, ${compLoc.country}\n`;
    desc += `**${compCur.condition.text}** • ${formatLocalTime(compLoc.localtime)}\n\n`;
    
    desc += `**Temperature:** ${formatTemperature(compCur.temp_c, compCur.temp_f)}\n`;
    desc += `**Feels Like:** ${formatTemperature(compCur.feelslike_c, compCur.feelslike_f)}\n`;
    desc += `**Humidity:** ${compCur.humidity}%\n`;
    
    const compWindDesc = getWindDescription(compCur.wind_kph);
    desc += `**Wind:** ${compCur.wind_kph} km/h ${compCur.wind_dir} (${compWindDesc})\n`;
    
    if (compCur.air_quality) {
      const compAqiDesc = getAQIDescription(compCur.air_quality);
      if (compAqiDesc) {
        desc += `**Air Quality:** ${compAqiDesc.emoji} ${compAqiDesc.level} (PM2.5: ${compCur.air_quality.pm2_5.toFixed(1)})\n`;
      }
    }
    
    // Temperature difference
    const tempDiff = (primaryCur.temp_c - compCur.temp_c).toFixed(1);
    desc += `\n**Temperature Difference:** ${Math.abs(tempDiff)}°C ${tempDiff > 0 ? 'warmer' : 'cooler'} in ${primaryLoc.name}\n`;
  }
  
  embed.setDescription(desc);
  embed.setThumbnail(`https:${primaryCur.condition.icon}`);
  return embed;
}

function buildForecastEmbed(state) {
  const embed = new EmbedBuilder();
  const primaryData = state.primary.forecast;
  const compareData = state.compare?.forecast;
  
  if (!primaryData || !primaryData.forecast || !primaryData.forecast.forecastday.length) {
    return errorEmbed("Forecast data unavailable");
  }

  const primaryLoc = primaryData.location;
  const titlePrefix = state.compare ? '📊 Comparison: ' : '📅 ';
  
  embed.setTitle(`${titlePrefix}Weather Forecast`);
  embed.setColor('#2ecc71');
  
  // Primary location forecast
  const fcDay = primaryData.forecast.forecastday[0];
  let desc = `## ${primaryLoc.name}, ${primaryLoc.region}, ${primaryLoc.country}\n`;
  desc += `**${fcDay.date}** - ${fcDay.day.condition.text}\n\n`;
  
  desc += `**Temperature:** High ${fcDay.day.maxtemp_c}°C / Low ${fcDay.day.mintemp_c}°C\n`;
  desc += `**Precipitation:** ${fcDay.day.totalprecip_mm} mm\n`;
  desc += `**Chance of Rain:** ${fcDay.day.daily_chance_of_rain}%\n`;
  
  if (fcDay.day.daily_chance_of_snow > 0) {
    desc += `**Chance of Snow:** ${fcDay.day.daily_chance_of_snow}%\n`;
  }
  
  desc += `\n### Hourly Forecast\n`;
  
  // Get current hour and show next 4 hours
  const currentHour = new Date(primaryLoc.localtime).getHours();
  const startIndex = currentHour;
  let forecastHours = [];
  
  // Get hours from today
  for (let i = startIndex; i < 24; i++) {
    forecastHours.push(fcDay.hour[i]);
    if (forecastHours.length >= 4) break;
  }
  
  // If we need more hours, get from tomorrow
  if (forecastHours.length < 4 && primaryData.forecast.forecastday.length > 1) {
    const tomorrowHours = primaryData.forecast.forecastday[1].hour;
    for (let i = 0; i < startIndex; i++) {
      forecastHours.push(tomorrowHours[i]);
      if (forecastHours.length >= 4) break;
    }
  }
  
  // Format hourly forecasts
  forecastHours.forEach(hour => {
    const time = hour.time.split(' ')[1];
    desc += `**${time}:** ${hour.temp_c}°C - ${hour.condition.text} (${hour.chance_of_rain}% rain)\n`;
  });
  
  // Comparison data
  if (compareData && compareData.forecast && compareData.forecast.forecastday.length) {
    const compLoc = compareData.location;
    const compFcDay = compareData.forecast.forecastday[0];
    
    desc += `\n## ${compLoc.name}, ${compLoc.region}, ${compLoc.country}\n`;
    desc += `**${compFcDay.date}** - ${compFcDay.day.condition.text}\n\n`;
    
    desc += `**Temperature:** High ${compFcDay.day.maxtemp_c}°C / Low ${compFcDay.day.mintemp_c}°C\n`;
    desc += `**Precipitation:** ${compFcDay.day.totalprecip_mm} mm\n`;
    desc += `**Chance of Rain:** ${compFcDay.day.daily_chance_of_rain}%\n`;
    
    // Basic comparison
    const tempDiffMax = (fcDay.day.maxtemp_c - compFcDay.day.maxtemp_c).toFixed(1);
    const rainDiff = fcDay.day.daily_chance_of_rain - compFcDay.day.daily_chance_of_rain;
    
    desc += `\n**Max Temp Difference:** ${Math.abs(tempDiffMax)}°C ${tempDiffMax > 0 ? 'warmer' : 'cooler'} in ${primaryLoc.name}\n`;
    desc += `**Rain Chance Difference:** ${Math.abs(rainDiff)}% ${rainDiff > 0 ? 'higher' : 'lower'} in ${primaryLoc.name}\n`;
  }
  
  embed.setDescription(desc);
  embed.setThumbnail(`https:${fcDay.day.condition.icon}`);
  return embed;
}

function buildAstronomyEmbed(state) {
  const embed = new EmbedBuilder();
  const primaryData = state.primary.forecast;
  const compareData = state.compare?.forecast;
  
  if (!primaryData || !primaryData.forecast || !primaryData.forecast.forecastday.length) {
    return errorEmbed("Astronomy data unavailable");
  }

  const primaryLoc = primaryData.location;
  const titlePrefix = state.compare ? '📊 Comparison: ' : '🌙 ';
  
  embed.setTitle(`${titlePrefix}Astronomy Information`);
  embed.setColor('#9b59b6');
  
  // Primary location astronomy
  const astro = primaryData.forecast.forecastday[0].astro;
  let desc = `## ${primaryLoc.name}, ${primaryLoc.region}, ${primaryLoc.country}\n\n`;
  
  desc += `**Sunrise:** ${astro.sunrise}\n`;
  desc += `**Sunset:** ${astro.sunset}\n`;
  desc += `**Moonrise:** ${astro.moonrise}\n`;
  desc += `**Moonset:** ${astro.moonset}\n`;
  desc += `**Moon Phase:** ${astro.moon_phase}\n`;
  desc += `**Moon Illumination:** ${astro.moon_illumination}%\n`;
  
  // Add day length calculation
  const sunriseTime = convertTo24Hour(astro.sunrise);
  const sunsetTime = convertTo24Hour(astro.sunset);
  const dayLengthMinutes = calculateTimeDifference(sunriseTime, sunsetTime);
  const hours = Math.floor(dayLengthMinutes / 60);
  const minutes = dayLengthMinutes % 60;
  
  desc += `**Day Length:** ${hours} hours ${minutes} minutes\n`;
  
  // Comparison data
  if (compareData && compareData.forecast && compareData.forecast.forecastday.length) {
    const compLoc = compareData.location;
    const compAstro = compareData.forecast.forecastday[0].astro;
    
    desc += `\n## ${compLoc.name}, ${compLoc.region}, ${compLoc.country}\n\n`;
    
    desc += `**Sunrise:** ${compAstro.sunrise}\n`;
    desc += `**Sunset:** ${compAstro.sunset}\n`;
    desc += `**Moonrise:** ${compAstro.moonrise}\n`;
    desc += `**Moonset:** ${compAstro.moonset}\n`;
    desc += `**Moon Phase:** ${compAstro.moon_phase}\n`;
    
    // Compare day lengths
    const compSunriseTime = convertTo24Hour(compAstro.sunrise);
    const compSunsetTime = convertTo24Hour(compAstro.sunset);
    const compDayLengthMinutes = calculateTimeDifference(compSunriseTime, compSunsetTime);
    const compHours = Math.floor(compDayLengthMinutes / 60);
    const compMinutes = compDayLengthMinutes % 60;
    
    desc += `**Day Length:** ${compHours} hours ${compMinutes} minutes\n`;
    
    // Day length difference
    const dayLengthDiff = dayLengthMinutes - compDayLengthMinutes;
    const diffHours = Math.floor(Math.abs(dayLengthDiff) / 60);
    const diffMinutes = Math.abs(dayLengthDiff) % 60;
    
    desc += `\n**Day Length Difference:** ${diffHours}h ${diffMinutes}m ${dayLengthDiff > 0 ? 'longer' : 'shorter'} in ${primaryLoc.name}\n`;
  }
  
  embed.setDescription(desc);
  embed.setThumbnail('https://cdn-icons-png.flaticon.com/512/3079/3079720.png');
  return embed;
}

function buildAlertsEmbed(state) {
  const embed = new EmbedBuilder();
  const primaryData = state.primary.forecast;
  const compareData = state.compare?.forecast;
  
  if (!primaryData) {
    return errorEmbed("Alert data unavailable");
  }

  const primaryLoc = primaryData.location;
  const titlePrefix = state.compare ? '📊 Comparison: ' : '⚠️ ';
  
  embed.setTitle(`${titlePrefix}Weather Alerts`);
  embed.setColor('#e74c3c');
  
  let desc = '';
  const hasAlertsForPrimary = primaryData.alerts && primaryData.alerts.alert && primaryData.alerts.alert.length > 0;
  
  // Primary location alerts
  desc += `## ${primaryLoc.name}, ${primaryLoc.region}, ${primaryLoc.country}\n\n`;
  
  if (hasAlertsForPrimary) {
    desc += `**${primaryData.alerts.alert.length} Active Alert(s):**\n\n`;
    
    primaryData.alerts.alert.slice(0, 3).forEach((alert, index) => {
      desc += `### Alert ${index + 1}: ${alert.headline || 'Weather Alert'}\n`;
      desc += `**Type:** ${alert.event || 'N/A'}\n`;
      desc += `**Severity:** ${alert.severity || 'N/A'}\n`;
      
      if (alert.effective && alert.expires) {
        desc += `**Time:** From ${formatDate(alert.effective)} to ${formatDate(alert.expires)}\n`;
      }
      
      const description = alert.desc || alert.description;
      if (description) {
        // Truncate long descriptions
        const truncDesc = description.length > 200 ? description.substring(0, 200) + '...' : description;
        desc += `**Description:** ${truncDesc}\n\n`;
      } else {
        desc += '\n';
      }
    });
    
    if (primaryData.alerts.alert.length > 3) {
      desc += `*+${primaryData.alerts.alert.length - 3} more alerts*\n\n`;
    }
  } else {
    desc += "No active weather alerts.\n\n";
  }
  
  // Comparison location alerts
  if (compareData) {
    const compLoc = compareData.location;
    const hasAlertsForCompare = compareData.alerts && compareData.alerts.alert && compareData.alerts.alert.length > 0;
    
    desc += `## ${compLoc.name}, ${compLoc.region}, ${compLoc.country}\n\n`;
    
    if (hasAlertsForCompare) {
      desc += `**${compareData.alerts.alert.length} Active Alert(s):**\n\n`;
      
      compareData.alerts.alert.slice(0, 2).forEach((alert, index) => {
        desc += `### Alert ${index + 1}: ${alert.headline || 'Weather Alert'}\n`;
        desc += `**Type:** ${alert.event || 'N/A'}\n`;
        desc += `**Severity:** ${alert.severity || 'N/A'}\n`;
        
        const description = alert.desc || alert.description;
        if (description) {
          const truncDesc = description.length > 150 ? description.substring(0, 150) + '...' : description;
          desc += `**Description:** ${truncDesc}\n\n`;
        } else {
          desc += '\n';
        }
      });
      
      if (compareData.alerts.alert.length > 2) {
        desc += `*+${compareData.alerts.alert.length - 2} more alerts*\n`;
      }
    } else {
      desc += "No active weather alerts.\n";
    }
  }
  
  if (!hasAlertsForPrimary && (!compareData || !compareData.alerts || !compareData.alerts.alert || compareData.alerts.alert.length === 0)) {
    desc += "## 🟢 All Clear\n\nNo weather alerts reported for either location.";
  }
  
  embed.setDescription(desc);
  return embed;
}

function buildLocationEmbed(state) {
  const embed = new EmbedBuilder();
  const primaryData = state.primary.current;
  const compareData = state.compare?.current;
  
  if (!primaryData) {
    return errorEmbed("Location data unavailable");
  }

  const primaryLoc = primaryData.location;
  const titlePrefix = state.compare ? '📊 Comparison: ' : '📍 ';
  
  embed.setTitle(`${titlePrefix}Location Information`);
  embed.setColor('#f1c40f');
  
  // Primary location
  let desc = `## ${primaryLoc.name}, ${primaryLoc.region}, ${primaryLoc.country}\n\n`;
  
  desc += `**Local Time:** ${formatLocalTime(primaryLoc.localtime)}\n`;
  desc += `**Time Zone:** ${primaryLoc.tz_id}\n`;
  desc += `**Coordinates:** [${primaryLoc.lat}, ${primaryLoc.lon}](https://www.google.com/maps/search/?api=1&query=${primaryLoc.lat},${primaryLoc.lon})\n`;
  
  // Comparison data
  if (compareData) {
    const compLoc = compareData.location;
    
    desc += `\n## ${compLoc.name}, ${compLoc.region}, ${compLoc.country}\n\n`;
    
    desc += `**Local Time:** ${formatLocalTime(compLoc.localtime)}\n`;
    desc += `**Time Zone:** ${compLoc.tz_id}\n`;
    desc += `**Coordinates:** [${compLoc.lat}, ${compLoc.lon}](https://www.google.com/maps/search/?api=1&query=${compLoc.lat},${compLoc.lon})\n`;
    
    // Calculate distance between locations
    const distance = calculateDistance(
      primaryLoc.lat, primaryLoc.lon,
      compLoc.lat, compLoc.lon
    );
    
    desc += `\n**Distance:** ${distance.toFixed(0)} km between locations\n`;
    
    // Calculate time difference
    const timeDiff = calculateTimezoneOffset(primaryLoc.tz_id, compLoc.tz_id);
    if (timeDiff !== null) {
      const hours = Math.abs(Math.floor(timeDiff));
      const minutes = Math.abs(Math.round((timeDiff % 1) * 60));
      desc += `**Time Difference:** ${hours}h ${minutes}m ${timeDiff >= 0 ? 'ahead' : 'behind'}\n`;
    }
  }
  
  embed.setDescription(desc);
  return embed;
}

// Helper functions
function errorEmbed(message) {
  return new EmbedBuilder()
    .setTitle('Error')
    .setDescription(message || 'An unknown error occurred')
    .setColor('#ff0000');
}

function convertTo24Hour(timeStr) {
  if (!timeStr) return null;
  
  let [time, modifier] = timeStr.split(' ');
  let [hours, minutes] = time.split(':');
  
  if (hours === '12') {
    hours = '00';
  }
  
  if (modifier === 'PM') {
    hours = parseInt(hours) + 12;
  }
  
  return { hours: parseInt(hours), minutes: parseInt(minutes) };
}

function calculateTimeDifference(time1, time2) {
  if (!time1 || !time2) return 0;
  
  const minutes1 = time1.hours * 60 + time1.minutes;
  const minutes2 = time2.hours * 60 + time2.minutes;
  
  return minutes2 - minutes1;
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch (error) {
    return dateStr;
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function calculateTimezoneOffset(tz1, tz2) {
  if (!tz1 || !tz2) return null;
  
  try {
    const date = new Date();
    const time1 = new Date(date.toLocaleString('en-US', { timeZone: tz1 }));
    const time2 = new Date(date.toLocaleString('en-US', { timeZone: tz2 }));
    
    const diffHours = (time1 - time2) / (1000 * 60 * 60);
    return diffHours;
  } catch (error) {
    return null;
  }
}

// Main function to build embed based on page number
function buildPageEmbed(state) {
  switch (state.currentPage) {
    case 1: return buildCurrentWeatherEmbed(state);
    case 2: return buildForecastEmbed(state);
    case 3: return buildAstronomyEmbed(state);
    case 4: return buildAlertsEmbed(state);
    case 5: return buildLocationEmbed(state);
    default: return errorEmbed('Invalid page');
  }
}
// i love ai : 3 , do u not?
module.exports = {
  data: new SlashCommandBuilder()
    .setName('weather')
    .setDescription('Multi-page weather information with detailed data and comparison')
    .setIntegrationTypes(0, 1)
    .setContexts(0, 1, 2)
    .addStringOption(option =>
      option.setName('city')
        .setDescription('Enter city name, postal code, IP address, or coordinates')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName('compare')
        .setDescription('Optional: Enter another location to compare')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName('units')
        .setDescription('Choose temperature units')
        .setRequired(false)
        .addChoices(
          { name: 'Metric (°C)', value: 'metric' },
          { name: 'Imperial (°F)', value: 'imperial' },
          { name: 'Both', value: 'both' }
        )
    ),

  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    const query = focusedOption.value;
    
    try {
      const suggestions = await fetchCitySuggestions(query);
      await interaction.respond(
        suggestions.map(city => ({ name: city, value: city })).slice(0, 25)
      );
    } catch (error) {
      logger.error('Autocomplete error:', error);
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    await interaction.deferReply();
    
    const city = interaction.options.getString('city');
    const compareCity = interaction.options.getString('compare');
    const units = interaction.options.getString('units') || 'both';
    
    try {
      // Fetch primary location data
      const primaryData = await fetchWeatherData(city, 'both');
      
      // Fetch comparison data if provided
      let compareData = null;
      if (compareCity) {
        compareData = await fetchWeatherData(compareCity, 'both');
      }
      
      // Create state object for navigation
      const stateId = uuidv4();
      const state = {
        id: stateId,
        primary: primaryData,
        compare: compareData,
        currentPage: 1,
        totalPages: 5,
        units
      };
      
      // Build embed for current page
      const embed = buildPageEmbed(state);
      
      // Create navigation buttons
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`weather_prev_${stateId}`)
            .setLabel('◀️ Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(state.currentPage === 1),
          new ButtonBuilder()
            .setCustomId(`weather_next_${stateId}`)
            .setLabel('Next ▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(state.currentPage === state.totalPages)
        );
      
      // Add page specific buttons
      if (state.currentPage === 1) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`weather_refresh_${stateId}`)
            .setLabel('🔄 Refresh')
            .setStyle(ButtonStyle.Primary)
        );
      }
      
      // Register button handlers
      registerButton(`weather_prev_${stateId}`, async (btnInt) => {
        try {
          if (btnInt.user.id !== interaction.user.id) {
            return await btnInt.reply({ 
              content: 'You cannot use these controls.', 
              ephemeral: true 
            });
          }
          
          state.currentPage = Math.max(1, state.currentPage - 1);
          const newEmbed = buildPageEmbed(state);
          
          const newRow = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`weather_prev_${stateId}`)
                .setLabel('◀️ Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(state.currentPage === 1),
              new ButtonBuilder()
                .setCustomId(`weather_next_${stateId}`)
                .setLabel('Next ▶️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(state.currentPage === state.totalPages)
            );
            
          if (state.currentPage === 1) {
            newRow.addComponents(
              new ButtonBuilder()
                .setCustomId(`weather_refresh_${stateId}`)
                .setLabel('🔄 Refresh')
                .setStyle(ButtonStyle.Primary)
            );
          }
          
          await btnInt.editReply({ 
            embeds: [newEmbed], 
            components: [newRow] 
          });
        } catch (error) {
          logger.error(`Previous button error: ${error.message}`);
          await btnInt.editReply({ 
            content: 'An error occurred while navigating pages.',
            embeds: [],
            components: []
          });
        }
      });
      
      registerButton(`weather_next_${stateId}`, async (btnInt) => {
        try {
          if (btnInt.user.id !== interaction.user.id) {
            return await btnInt.reply({ 
              content: 'You cannot use these controls.', 
              ephemeral: true 
            });
          }
          
          state.currentPage = Math.min(state.totalPages, state.currentPage + 1);
          const newEmbed = buildPageEmbed(state);
          
          const newRow = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`weather_prev_${stateId}`)
                .setLabel('◀️ Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(state.currentPage === 1),
              new ButtonBuilder()
                .setCustomId(`weather_next_${stateId}`)
                .setLabel('Next ▶️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(state.currentPage === state.totalPages)
            );
            
          if (state.currentPage === 1) {
            newRow.addComponents(
              new ButtonBuilder()
                .setCustomId(`weather_refresh_${stateId}`)
                .setLabel('🔄 Refresh')
                .setStyle(ButtonStyle.Primary)
            );
          }
          
          await btnInt.editReply({ 
            embeds: [newEmbed], 
            components: [newRow] 
          });
        } catch (error) {
          logger.error(`Next button error: ${error.message}`);
          await btnInt.editReply({ 
            content: 'An error occurred while navigating pages.',
            embeds: [],
            components: []
          });
        }
      });

      registerButton(`weather_refresh_${stateId}`, async (btnInt) => {
        try {
          if (btnInt.user.id !== interaction.user.id) {
            return await btnInt.reply({ 
              content: 'You cannot use these controls.', 
              ephemeral: true 
            });
          }

          await btnInt.deferUpdate();
          await btnInt.editReply({ 
            content: 'Refreshing weather data...', 
            components: [] 
          });
          
          // Fetch fresh data
          state.primary = await fetchWeatherData(city, 'both');
          if (compareCity) {
            state.compare = await fetchWeatherData(compareCity, 'both');
          }
          
          const newEmbed = buildPageEmbed(state);
          const newRow = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`weather_prev_${stateId}`)
                .setLabel('◀️ Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(state.currentPage === 1),
              new ButtonBuilder()
                .setCustomId(`weather_next_${stateId}`)
                .setLabel('Next ▶️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(state.currentPage === state.totalPages),
              new ButtonBuilder()
                .setCustomId(`weather_refresh_${stateId}`)
                .setLabel('🔄 Refresh')
                .setStyle(ButtonStyle.Primary)
            );
          
          await btnInt.editReply({ 
            content: null, 
            embeds: [newEmbed], 
            components: [newRow] 
          });
        } catch (error) {
          logger.error(`Refresh error: ${error.message}`);
          await btnInt.editReply({ 
            content: `Error refreshing data: ${error.message}`, 
            embeds: [], 
            components: [] 
          });
        }
      });

      // Send initial response
      await interaction.editReply({ 
        embeds: [embed], 
        components: [row] 
      });
      
    } catch (error) {
      logger.error(`Weather command error: ${error.message}`);
      await interaction.editReply({ 
        content: `Error: ${error.message}`, 
        embeds: [], 
        components: [] 
      });
    }
  }
};