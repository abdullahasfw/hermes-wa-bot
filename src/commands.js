const { normalizeNumber } = require('./config');

function extractText(message) {
  if (!message) {
    return '';
  }

  const direct =
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    '';

  if (direct && direct.trim()) {
    return direct.trim();
  }

  return '';
}

function isAllowedNumber(senderJid, allowedNumbers) {
  const senderAddresses = Array.isArray(senderJid) ? senderJid : [senderJid];
  const allowed = Array.from(allowedNumbers || []);

  if (senderAddresses.length === 0 || allowed.length === 0) {
    return false;
  }

  const senderNumbers = new Set(
    senderAddresses
      .map((address) => {
        const [user, server] = String(address || '').split('@');
        if (server && !['s.whatsapp.net', 'hosted'].includes(server)) {
          return '';
        }

        return normalizeNumber((user || '').split(':')[0]);
      })
      .filter(Boolean),
  );

  return allowed.some((entry) => senderNumbers.has(normalizeNumber(entry)));
}

function getMessageSenderAddresses(message) {
  const key = message?.key || {};
  const primary = key.participant || key.remoteJid;
  const alternate = key.participant ? key.participantAlt : key.remoteJidAlt;

  return [alternate, primary].filter((address, index, addresses) => (
    address && addresses.indexOf(address) === index
  ));
}

function getConversationKey(chatJid, senderAddresses) {
  if (String(chatJid || '').endsWith('@g.us')) {
    return chatJid;
  }

  const phoneAddress = (senderAddresses || []).find((address) => {
    const [user, server] = String(address || '').split('@');
    return server === 's.whatsapp.net' && normalizeNumber((user || '').split(':')[0]);
  });
  if (!phoneAddress) {
    return chatJid;
  }

  const user = phoneAddress.split('@')[0].split(':')[0];
  return `${normalizeNumber(user)}@s.whatsapp.net`;
}

function getSenderNumber(senderAddresses) {
  for (const address of senderAddresses || []) {
    const [user, server] = String(address || '').split('@');
    if (server === 's.whatsapp.net' || server === 'hosted') {
      const number = normalizeNumber((user || '').split(':')[0]);
      if (number) {
        return number;
      }
    }
  }
  return '';
}

function splitLongMessage(text, maxLength = 1000) {
  if (!text || text.length <= maxLength) {
    return [text || ''];
  }

  const chunks = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.slice(i, i + maxLength));
  }
  return chunks;
}

module.exports = {
  extractText,
  isAllowedNumber,
  getMessageSenderAddresses,
  getConversationKey,
  getSenderNumber,
  splitLongMessage,
};
