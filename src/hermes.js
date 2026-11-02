const { config } = require('./config');
const { readSession, writeSession, deleteSession } = require('./store');

const API_KEY = config.hermes.apiKey;

function buildHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_KEY}`,
    ...extra,
  };
}

function extractRunOutput(payload) {
  if (!payload) {
    return '';
  }

  if (typeof payload === 'string') {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry.text === 'string') return entry.text;
        if (entry && Array.isArray(entry.content)) {
          return entry.content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('');
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  if (typeof payload === 'object') {
    if (typeof payload.text === 'string') {
      return payload.text;
    }
    if (Array.isArray(payload.content)) {
      return payload.content
        .map((part) => (typeof part === 'string' ? part : part?.text || ''))
        .join('');
    }
    if (typeof payload.output === 'string') {
      return payload.output;
    }
    if (payload.output && typeof payload.output === 'object') {
      return extractRunOutput(payload.output);
    }
  }

  return String(payload);
}

async function hermesFetch(path, options = {}, route = config.hermes) {
  if (!route?.apiKey) {
    throw new Error('HERMES_API_KEY belum diatur pada .env');
  }

  const response = await fetch(`${route.baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: buildHeaders({
      Authorization: `Bearer ${route.apiKey}`,
      ...(options.headers || {}),
    }),
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    signal: AbortSignal.timeout(route.timeoutMs),
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (error) {
    json = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    json,
    text,
  };
}

async function createSessionId(chatId) {
  return `wa_${String(chatId).replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now().toString(36)}`;
}

async function getOrCreateSession(chatId, fallbackChatId) {
  const existing = await readSession(chatId);
  if (existing && existing.session_id) {
    return existing;
  }

  if (fallbackChatId && fallbackChatId !== chatId) {
    const fallback = await readSession(fallbackChatId);
    if (fallback?.session_id) {
      await writeSession(chatId, fallback);
      return fallback;
    }
  }

  const newSession = {
    session_id: await createSessionId(chatId),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await writeSession(chatId, newSession);
  return newSession;
}

async function resetSession(chatId, fallbackChatId) {
  await deleteSession(chatId);
  if (fallbackChatId && fallbackChatId !== chatId) {
    await deleteSession(fallbackChatId);
  }
}

async function checkHermesStatus(route = config.hermes) {
  try {
    const result = await hermesFetch('/v1/models', {}, route);
    if (!result.ok) {
      return {
        ok: false,
        error: result.json?.error?.message || 'Hermes API tidak bisa diakses',
      };
    }
    return {
      ok: true,
      data: result.json || [],
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || 'Hermes timeout / kegagalan koneksi',
    };
  }
}

async function startRun(chatId, prompt, { fallbackChatId, route = config.hermes } = {}) {
  const session = await getOrCreateSession(chatId, fallbackChatId);
  const result = await hermesFetch('/v1/runs', {
    method: 'POST',
    body: {
      session_id: session.session_id,
      input: String(prompt || '').trim(),
    },
  }, route);

  if (!result.ok) {
    throw new Error(result.json?.error?.message || `Hermes API gagal memulai run (${result.status})`);
  }

  const run = {
    session_id: session.session_id,
    run_id: result.json.run_id,
    started_at: new Date().toISOString(),
  };
  await writeSession(chatId, { ...session, active_run: run });

  return {
    session_id: session.session_id,
    run_id: run.run_id,
    status: result.json.status || 'started',
  };
}

async function getStoredActiveRun(chatId, fallbackChatId) {
  let session = await readSession(chatId);
  if ((!session || !session.active_run) && fallbackChatId && fallbackChatId !== chatId) {
    const fallback = await readSession(fallbackChatId);
    if (fallback?.active_run) {
      session = fallback;
      await writeSession(chatId, fallback);
    }
  }
  return session?.active_run || null;
}

async function clearActiveRun(chatId, fallbackChatId) {
  for (const key of new Set([chatId, fallbackChatId].filter(Boolean))) {
    const session = await readSession(key);
    if (session?.active_run) {
      delete session.active_run;
      await writeSession(key, session);
    }
  }
}

async function getRunStatus(runId, route = config.hermes) {
  const result = await hermesFetch(`/v1/runs/${encodeURIComponent(runId)}`, {}, route);
  if (!result.ok) {
    throw new Error(result.json?.error?.message || `Hermes gagal mengecek status run (${result.status})`);
  }
  return result.json || {};
}

async function respondToRunApproval(runId, requestId, choice, route = config.hermes) {
  if (!['once', 'deny'].includes(choice)) {
    throw new Error('Pilihan approval tidak valid.');
  }

  const result = await hermesFetch(`/v1/runs/${encodeURIComponent(runId)}/approval`, {
    method: 'POST',
    body: {
      choice,
      request_id: requestId,
    },
  }, route);

  if (!result.ok) {
    throw new Error(result.json?.error?.message || `Hermes menolak respons approval (${result.status})`);
  }

  return result.json || {};
}

async function waitForRun(runId, { onApproval, route = config.hermes } = {}) {
  const started = Date.now();
  const maxWaitMs = route.runTimeoutMs;
  let notifiedApprovalId = null;

  while (Date.now() - started < maxWaitMs) {
    const status = await getRunStatus(runId, route);
    if (status.status === 'waiting_for_approval' && status.approval) {
      const approval = status.approval;
      const requestId = approval.request_id;
      if (requestId && requestId !== notifiedApprovalId) {
        notifiedApprovalId = requestId;
        await onApproval?.(approval);
      }
    } else if (status.status !== 'waiting_for_approval') {
      notifiedApprovalId = null;
    }

    if (status.status === 'completed') {
      return {
        ok: true,
        output: extractRunOutput(status.output || status.result || status.message || ''),
        session_id: status.session_id,
      };
    }

    if (status.status === 'failed' || status.status === 'cancelled') {
      return {
        ok: false,
        error: status.error || extractRunOutput(status.output || status.result || '') || `Hermes run berstatus ${status.status}`,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  return {
    ok: false,
    timedOut: true,
    error: `Hermes masih memproses setelah ${Math.ceil(maxWaitMs / 60000)} menit.`,
  };
}

async function stopRun(runId, route = config.hermes) {
  const result = await hermesFetch(`/v1/runs/${encodeURIComponent(runId)}/stop`, {
    method: 'POST',
    body: {},
  }, route);

  if (!result.ok) {
    return {
      ok: false,
      error: result.json?.error?.message || 'Stop request gagal dikirim ke Hermes',
    };
  }

  return {
    ok: true,
    data: result.json || {},
  };
}

module.exports = {
  checkHermesStatus,
  getOrCreateSession,
  getStoredActiveRun,
  getRunStatus,
  clearActiveRun,
  resetSession,
  startRun,
  waitForRun,
  respondToRunApproval,
  stopRun,
};
