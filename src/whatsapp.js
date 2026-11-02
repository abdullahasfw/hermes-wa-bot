const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
} = require('@whiskeysockets/baileys');
const { config } = require('./config');
const {
  checkHermesStatus,
  startRun,
  waitForRun,
  getStoredActiveRun,
  getRunStatus,
  clearActiveRun,
  respondToRunApproval,
  stopRun,
  resetSession,
} = require('./hermes');
const {
  extractText,
  isAllowedNumber,
  getMessageSenderAddresses,
  getConversationKey,
  getSenderNumber,
  splitLongMessage,
} = require('./commands');

const activeRuns = new Map();
const seenMessages = new Map();

function cleanSeenMessages() {
  const now = Date.now();
  for (const [key, time] of seenMessages.entries()) {
    if (now - time > 60000) {
      seenMessages.delete(key);
    }
  }
}

function isDuplicateMessage(message) {
  if (!message?.key) {
    return false;
  }

  const key = `${message.key.remoteJid || ''}:${message.key.id || ''}:${message.key.participant || ''}`;
  const now = Date.now();
  if (seenMessages.has(key)) {
    return true;
  }
  seenMessages.set(key, now);
  cleanSeenMessages();
  return false;
}

async function sendText(sock, to, text) {
  if (!text) {
    return;
  }

  for (const chunk of splitLongMessage(text)) {
    await sock.sendMessage(to, { text: chunk });
  }
}

async function refreshActiveRun(conversationKey, fallbackChatId, route = config.hermes) {
  let active = activeRuns.get(conversationKey);
  if (!active) {
    const stored = await getStoredActiveRun(conversationKey, fallbackChatId);
    if (!stored?.run_id) {
      return { active: null, status: null };
    }

    active = {
      runId: stored.run_id,
      sessionId: stored.session_id,
      startedAt: Date.parse(stored.started_at) || Date.now(),
      monitoring: false,
      route,
    };
    activeRuns.set(conversationKey, active);
  }

  const status = await getRunStatus(active.runId, active.route);
  if (['completed', 'failed', 'cancelled', 'interrupted'].includes(status.status)) {
    activeRuns.delete(conversationKey);
    await clearActiveRun(conversationKey, fallbackChatId);
    return { active: null, status };
  }

  if (status.status === 'waiting_for_approval' && status.approval) {
    if (active.pendingApproval?.request_id !== status.approval.request_id) {
      active.notifiedApprovalId = null;
    }
    active.pendingApproval = status.approval;
  } else {
    active.pendingApproval = null;
    active.notifiedApprovalId = null;
  }

  return { active, status };
}

async function notifyPendingApproval(sock, to, active, approval, runtime) {
  const requestId = approval?.request_id;
  if (!requestId || active.notifiedApprovalId === requestId) {
    return;
  }

  active.pendingApproval = approval;
  const description = approval.description || 'Hermes meminta persetujuan untuk tindakan.';
  const action = approval.command ? `\nTindakan: ${approval.command}` : '';
  runtime.onLog?.('Hermes approval is pending; sending WhatsApp notification.');
  await sendText(
    sock,
    to,
    `Hermes meminta persetujuan:\n${description}${action}\n\nBalas “oke lanjut” atau kirim !approve untuk menyetujui tindakan ini satu kali.\nKirim !deny untuk menolak.`,
  );
  active.notifiedApprovalId = requestId;
  runtime.onLog?.('Hermes approval notification sent to WhatsApp.');
}

async function handleCommand(sock, from, text, runtime, conversationKey = from, senderNumber = '') {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const normalizedText = lower.replace(/[.,!?،]/g, '').replace(/\s+/g, ' ').trim();
  const isApprovalPhrase = ['oke lanjut', 'ok lanjut', 'okay lanjut', 'ya lanjut', 'setuju', 'saya setuju']
    .includes(normalizedText);
  const route = config.hermesUserRoutes.get(senderNumber) || config.hermes;
  const fallbackChatId = from.endsWith('@g.us') ? undefined : from;

  if (lower === '!help') {
    await sendText(sock, from, 'Perintah yang tersedia:\n!help — bantuan\n!reset — hapus konteks chat\n!status — cek status WhatsApp, Hermes, dan pekerjaan aktif\n!wait — lanjutkan pemantauan pekerjaan Hermes\n!stop — batalkan pekerjaan Hermes aktif\n!approve atau “oke lanjut” — setujui satu tindakan yang menunggu\n!deny — tolak tindakan yang menunggu');
    return;
  }

  if (lower === '!reset') {
    await resetSession(conversationKey, fallbackChatId);
    await sendText(sock, from, 'Konteks percakapan telah dihapus.');
    return;
  }

  if (lower === '!status') {
    const hermesStatus = await checkHermesStatus(route);
    const hermesText = hermesStatus.ok ? 'tersambung' : `gagal (${hermesStatus.error})`;
    const whatsappText = runtime.socketReady ? 'tersambung' : 'belum siap';
    try {
      const { active, status } = await refreshActiveRun(conversationKey, fallbackChatId, route);
      let runText = 'tidak ada';
      if (active && status?.status === 'waiting_for_approval') {
        const description = status.approval?.description;
        runText = `menunggu persetujuan Hermes${description ? `: ${description}` : ''}; balas “oke lanjut” atau kirim !approve; !deny untuk menolak`;
      } else if (active) {
        runText = active.monitoring ? 'sedang diproses' : 'masih berjalan; kirim !wait untuk memantau';
      } else if (status) {
        runText = `terakhir berstatus ${status.status}`;
      }
      await sendText(sock, from, `Status bot:\nWhatsApp: ${whatsappText}\nHermes: ${route.name}: ${hermesText}\nPekerjaan aktif: ${runText}`);
    } catch (error) {
      await sendText(sock, from, `Status bot:\nWhatsApp: ${whatsappText}\nHermes: ${route.name}: ${hermesText}\nStatus pekerjaan tidak dapat diperiksa: ${error.message}`);
    }
    return;
  }

  if (lower === '!wait') {
    let active;
    try {
      ({ active } = await refreshActiveRun(conversationKey, fallbackChatId, route));
    } catch (error) {
      await sendText(sock, from, `Status pekerjaan tidak dapat diperiksa: ${error.message}`);
      return;
    }
    if (!active?.runId) {
      await sendText(sock, from, 'Tidak ada pekerjaan Hermes yang perlu dipantau.');
      return;
    }
    if (active.monitoring) {
      await sendText(sock, from, 'Bot sedang memantau pekerjaan Hermes ini.');
      return;
    }
    await monitorActiveRun(sock, from, conversationKey, active, fallbackChatId, runtime);
    return;
  }

  if (lower === '!stop') {
    let active;
    try {
      ({ active } = await refreshActiveRun(conversationKey, fallbackChatId, route));
    } catch (error) {
      await sendText(sock, from, `Status pekerjaan tidak dapat diperiksa: ${error.message}`);
      return;
    }
    if (!active?.runId) {
      await sendText(sock, from, 'Tidak ada pekerjaan Hermes yang sedang berjalan di chat ini.');
      return;
    }

    const result = await stopRun(active.runId, active.route || route);
    if (result.ok) {
      activeRuns.delete(conversationKey);
      await clearActiveRun(conversationKey, fallbackChatId);
      await sendText(sock, from, 'Pekerjaan Hermes dibatalkan.');
      return;
    }

    await sendText(sock, from, `Gagal membatalkan pekerjaan: ${result.error}`);
    return;
  }

  if (lower === '!approve' || lower === '!deny' || isApprovalPhrase) {
    let active;
    try {
      ({ active } = await refreshActiveRun(conversationKey, fallbackChatId, route));
    } catch (error) {
      await sendText(sock, from, `Status pekerjaan tidak dapat diperiksa: ${error.message}`);
      return;
    }
    const pendingApproval = active?.pendingApproval;
    if (!active?.runId || !pendingApproval?.request_id) {
      await sendText(
        sock,
        from,
        isApprovalPhrase
          ? 'Tidak ada tindakan Hermes yang sedang menunggu persetujuan; pesan persetujuan tidak diteruskan sebagai instruksi baru.'
          : 'Tidak ada tindakan Hermes yang sedang menunggu persetujuan.',
      );
      return;
    }

    try {
      const choice = lower === '!deny' ? 'deny' : 'once';
      await respondToRunApproval(active.runId, pendingApproval.request_id, choice, active.route || route);
      active.pendingApproval = null;
      active.notifiedApprovalId = null;
      runtime.onLog?.(`WhatsApp approval response submitted: ${choice}.`);
      await sendText(
        sock,
        from,
        choice === 'once'
          ? 'Persetujuan diberikan satu kali. Hermes akan melanjutkan tindakan ini.'
          : 'Tindakan ditolak. Hermes akan melanjutkan tanpa menjalankannya.',
      );
      if (choice === 'once' && !active.monitoring) {
        await monitorActiveRun(sock, from, conversationKey, active, fallbackChatId, runtime);
      }
    } catch (error) {
      await sendText(sock, from, `Respons persetujuan gagal: ${error.message}`);
    }
    return;
  }

  const session = activeRuns.get(conversationKey);
  if (session && session.runId) {
    await sendText(sock, from, 'Masih ada pekerjaan Hermes aktif. Kirim !wait untuk memantau atau !stop untuk membatalkan.');
    return;
  }

  await sendText(sock, from, 'Sedang memproses...');

  try {
    const run = await startRun(conversationKey, trimmed, { fallbackChatId, route });
    const active = { runId: run.run_id, sessionId: run.session_id, startedAt: Date.now(), monitoring: false, route };
    activeRuns.set(conversationKey, active);
    await monitorActiveRun(sock, from, conversationKey, active, fallbackChatId, runtime);
  } catch (error) {
    activeRuns.delete(conversationKey);
    await sendText(sock, from, `Hermes API error: ${error.message || 'Unknown error'}`);
  }
}

async function monitorActiveRun(sock, from, conversationKey, active, fallbackChatId, runtime) {
  active.monitoring = true;
  try {
    const final = await waitForRun(active.runId, {
      route: active.route || config.hermes,
      onApproval: async (approval) => {
        const current = activeRuns.get(conversationKey);
        if (!current) {
          return;
        }
        await notifyPendingApproval(sock, from, current, approval, runtime);
      },
    });

    if (final.timedOut) {
      active.monitoring = false;
      await sendText(sock, from, `${final.error} Run tetap aktif; kirim !wait untuk melanjutkan pemantauan atau !stop untuk membatalkan.`);
      return;
    }

    activeRuns.delete(conversationKey);
    await clearActiveRun(conversationKey, fallbackChatId);
    if (!final.ok) {
      await sendText(sock, from, final.error || 'Hermes gagal menghasilkan respons.');
      return;
    }

    await sendText(sock, from, final.output || 'Hermes tidak mengembalikan pesan.');
  } catch (error) {
    active.monitoring = false;
    await sendText(sock, from, `Gagal memeriksa status Hermes: ${error.message || 'Unknown error'}. Run tetap aktif; kirim !wait untuk mencoba lagi atau !stop untuk membatalkan.`);
  }
}

async function createWhatsAppBot({ onReady, onQrCode, onPairingCode, onLog }) {
  const { state, saveCreds } = await useMultiFileAuthState(String(config.authInfoPath));
  if (!state.creds.registered && state.creds.pairingCode) {
    delete state.creds.pairingCode;
    delete state.creds.me;
  }
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    printQRInTerminal: false,
    auth: state,
    syncFullHistory: false,
  });
  const pairingReady = !state.creds.registered && config.whatsapp.phoneNumber
    ? sock.waitForConnectionUpdate((update) => Boolean(update.qr), 30000)
    : null;

  const runtime = {
    socketReady: false,
    onLog,
  };

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      if (!config.whatsapp.phoneNumber) {
        onQrCode?.(qr);
      }
    }

    if (connection === 'open') {
      runtime.socketReady = true;
      onReady?.(sock);
      onLog?.('WhatsApp socket connected.');
      return;
    }

    if (connection === 'close') {
      runtime.socketReady = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.output?.payload?.error;

      if (statusCode === DisconnectReason.loggedOut) {
        onLog?.('WhatsApp logout detected.');
      } else {
        onLog?.(`Connection closed: ${reason || statusCode || 'unknown reason'}`);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const message of messages) {
      if (!message.message || message.key?.fromMe || message.type === 'protocolMessage') {
        continue;
      }

      if (isDuplicateMessage(message)) {
        continue;
      }

      const chat = jidNormalizedUser(message.key.remoteJid || '');
      const text = extractText(message.message);
      if (!text) {
        continue;
      }

      const senderAddresses = getMessageSenderAddresses(message);
      for (const address of senderAddresses) {
        if (/@(?:hosted\.)?lid$/.test(address)) {
          try {
            const phoneJid = await sock.signalRepository.lidMapping.getPNForLID(address);
            if (phoneJid) {
              senderAddresses.push(phoneJid);
            }
          } catch (error) {
            onLog?.(`Gagal memetakan WhatsApp LID ke nomor telepon: ${error.message}`);
          }
        }
      }

      if (!isAllowedNumber(senderAddresses, config.whatsapp.allowedNumbers)) {
        if (config.whatsapp.unauthorizedBehavior === 'reply') {
          await sendText(sock, message.key.participant || chat, 'Nomor Anda tidak berizin untuk menggunakan bot ini.');
        } else {
          onLog?.('Ignored message from a non-allowlisted WhatsApp sender.');
        }
        continue;
      }

      const conversationKey = getConversationKey(chat, senderAddresses);
      const senderNumber = getSenderNumber(senderAddresses);
      const userConversationKey = chat.endsWith('@g.us')
        ? `${conversationKey}__${senderNumber}`
        : conversationKey;
      await handleCommand(sock, chat, text, runtime, userConversationKey, senderNumber);
    }
  });

  if (!state.creds.registered && config.whatsapp.phoneNumber) {
    if (!/^\d{8,15}$/.test(config.whatsapp.phoneNumber)) {
      throw new Error('WHATSAPP_PHONE_NUMBER harus berisi 8-15 digit termasuk kode negara.');
    }

    await pairingReady;
    const pairingCode = await sock.requestPairingCode(config.whatsapp.phoneNumber);
    onPairingCode?.(pairingCode);
  }

  return {
    socket: sock,
    start: async () => sock,
    stop: async () => {
      await sock.ws?.close();
    },
    getActiveRuns: () => activeRuns,
  };
}

module.exports = {
  createWhatsAppBot,
  activeRuns,
  notifyPendingApproval,
};
