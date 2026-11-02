const fs = require('fs/promises');
const path = require('path');
const { config, ensureDir } = require('./config');

function getSafeSessionName(chatId) {
  return String(chatId || 'unknown')
    .replace(/@/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .slice(0, 120) || 'unknown';
}

async function readSession(chatId) {
  ensureDir(config.sessionsDir);
  const file = path.join(config.sessionsDir, `${getSafeSessionName(chatId)}.json`);
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeSession(chatId, data) {
  ensureDir(config.sessionsDir);
  const file = path.join(config.sessionsDir, `${getSafeSessionName(chatId)}.json`);
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

async function deleteSession(chatId) {
  ensureDir(config.sessionsDir);
  const file = path.join(config.sessionsDir, `${getSafeSessionName(chatId)}.json`);
  try {
    await fs.unlink(file);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

module.exports = {
  readSession,
  writeSession,
  deleteSession,
  getSafeSessionName,
};
