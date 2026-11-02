const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

function parseAllowedNumbers(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => entry.replace(/\D/g, '')),
  );
}

function normalizeNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

function positiveIntegerEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return defaultValue;
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} harus berupa bilangan bulat positif.`);
  }

  return value;
}

function parseUnauthorizedBehavior(value = 'reply') {
  const behavior = String(value).trim().toLowerCase();
  if (!['reply', 'ignore'].includes(behavior)) {
    throw new Error('WHATSAPP_UNAUTHORIZED_BEHAVIOR harus bernilai reply atau ignore.');
  }
  return behavior;
}

function parseHermesUserRoutes(value, defaultRoute) {
  if (!value || value.trim() === '') {
    return new Map();
  }

  let routes;
  try {
    routes = JSON.parse(value);
  } catch (error) {
    throw new Error('HERMES_USER_ROUTES harus berupa JSON object yang valid.');
  }
  if (!routes || typeof routes !== 'object' || Array.isArray(routes)) {
    throw new Error('HERMES_USER_ROUTES harus berupa JSON object dengan nomor pengirim sebagai key.');
  }

  return new Map(Object.entries(routes).map(([rawNumber, route]) => {
    const number = normalizeNumber(rawNumber);
    if (!/^\+?\d{8,15}$/.test(rawNumber) || !number || !route || typeof route !== 'object' || Array.isArray(route)) {
      throw new Error('Setiap HERMES_USER_ROUTES harus berisi nomor telepon dan object konfigurasi.');
    }

    const baseUrl = String(route.baseUrl || '').replace(/\/$/, '');
    const apiKey = String(route.apiKey || '');
    let parsedUrl;
    try {
      parsedUrl = new URL(baseUrl);
    } catch (error) {
      throw new Error(`URL Hermes untuk nomor ${number} tidak valid.`);
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
      throw new Error(`URL Hermes untuk nomor ${number} harus HTTP(S) tanpa kredensial URL.`);
    }
    if (!apiKey) {
      throw new Error(`apiKey Hermes untuk nomor ${number} wajib diisi.`);
    }

    const timeoutMs = route.timeoutMs === undefined
      ? defaultRoute.timeoutMs
      : Number(route.timeoutMs);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error(`timeoutMs Hermes untuk nomor ${number} harus bilangan bulat positif.`);
    }

    return [number, {
      id: number,
      name: String(route.name || `Hermes ${number}`),
      baseUrl,
      apiKey,
      timeoutMs,
      runTimeoutMs: defaultRoute.runTimeoutMs,
    }];
  }));
}

const defaultHermesRoute = {
  id: 'default',
  name: process.env.HERMES_DEFAULT_NAME || 'Hermes utama',
  baseUrl: (process.env.HERMES_API_BASE_URL || 'http://127.0.0.1:8642').replace(/\/$/, ''),
  apiKey: process.env.HERMES_API_KEY || '',
  timeoutMs: positiveIntegerEnv('HERMES_API_TIMEOUT_MS', 45000),
  runTimeoutMs: positiveIntegerEnv('HERMES_RUN_TIMEOUT_MS', 600000),
};
const hermesUserRoutes = parseHermesUserRoutes(process.env.HERMES_USER_ROUTES || '', defaultHermesRoute);
const allowedNumbers = parseAllowedNumbers(process.env.WHATSAPP_ALLOWED_NUMBERS || '');
const unauthorizedBehavior = parseUnauthorizedBehavior(process.env.WHATSAPP_UNAUTHORIZED_BEHAVIOR || 'reply');
for (const number of hermesUserRoutes.keys()) {
  if (!allowedNumbers.has(number)) {
    throw new Error(`Nomor Hermes route ${number} harus tercantum di WHATSAPP_ALLOWED_NUMBERS.`);
  }
}

const config = {
  projectRoot: path.resolve(__dirname, '..'),
  authInfoPath: path.resolve(__dirname, '../auth_info'),
  sessionsDir: path.resolve(__dirname, '../sessions'),
  botName: process.env.BOT_NAME || 'Hermes WA Bot',
  hermes: defaultHermesRoute,
  hermesUserRoutes,
  whatsapp: {
    allowedNumbers,
    unauthorizedBehavior,
    phoneNumber: normalizeNumber(process.env.WHATSAPP_PHONE_NUMBER || ''),
    qrTimeoutMs: Number(process.env.WHATSAPP_QR_TIMEOUT_MS || 60000),
    sendTyping: process.env.WHATSAPP_SEND_TYPING === 'true',
  },
};

module.exports = {
  config,
  normalizeNumber,
  parseAllowedNumbers,
  parseUnauthorizedBehavior,
  parseHermesUserRoutes,
  ensureDir: (dirPath) => {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  },
};
