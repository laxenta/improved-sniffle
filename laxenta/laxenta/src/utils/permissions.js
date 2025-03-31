require('dotenv').config();

/**
 * Validate the management password.
 * @param {string} pass - The password to validate.
 * @returns {boolean} True if the password matches the .env MANAGE_PASS.
 */
const validatePass = (pass) => pass === process.env.MANAGE_PASS;

/**
 * Check if a user has a specific role.
 * @param {GuildMember} member - The Discord guild member object.
 * @param {string} roleId - The role ID to check for.
 * @returns {boolean} True if the member has the role.
 */
const hasRole = (member, roleId) => member.roles.cache.has(roleId);

/**
 * Check if a user ID is in the trusted list.
 * @param {string} userId - The Discord user ID to validate.
 * @returns {boolean} True if the user ID is trusted.
 */
const isTrusted = (userId) => {
    const trustedIds = process.env.TRUSTED_IDS?.split(',') || [];
    return trustedIds.includes(userId);
};

module.exports = { validatePass, hasRole, isTrusted };