const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHermesUserRoutes, parseUnauthorizedBehavior } = require('../src/config');
const { getSenderNumber } = require('../src/commands');
const { checkHermesStatus } = require('../src/hermes');

const defaultRoute = {
  timeoutMs: 45000,
  runTimeoutMs: 600000,
};

test('parses an independent Hermes route for a sender number', () => {
  const routes = parseHermesUserRoutes(JSON.stringify({
    '+6289876543210': {
      name: 'Hermes friend',
      baseUrl: 'https://hermes-friend.example:8642/',
      apiKey: 'test-key',
      timeoutMs: 30000,
    },
  }), defaultRoute);

  assert.deepEqual(routes.get('6289876543210'), {
    id: '6289876543210',
    name: 'Hermes friend',
    baseUrl: 'https://hermes-friend.example:8642',
    apiKey: 'test-key',
    timeoutMs: 30000,
    runTimeoutMs: 600000,
  });
});

test('rejects routes without keys or with invalid URLs', () => {
  assert.throws(() => parseHermesUserRoutes(JSON.stringify({
    '6289876543210': { baseUrl: 'http://hermes-friend.example:8642' },
  }), defaultRoute), /apiKey.*wajib diisi/);

  assert.throws(() => parseHermesUserRoutes(JSON.stringify({
    '6289876543210': { baseUrl: 'ftp://hermes-friend.example', apiKey: 'test-key' },
  }), defaultRoute), /HTTP\(S\)/);
});

test('supports silently ignoring senders not allowed on this instance', () => {
  assert.equal(parseUnauthorizedBehavior('ignore'), 'ignore');
  assert.equal(parseUnauthorizedBehavior('reply'), 'reply');
  assert.throws(() => parseUnauthorizedBehavior('auto-approve'), /reply atau ignore/);
});

test('extracts sender phone number from PN or hosted WhatsApp JIDs', () => {
  assert.equal(getSenderNumber(['6289876543210@s.whatsapp.net']), '6289876543210');
  assert.equal(getSenderNumber(['6289876543210@hosted']), '6289876543210');
  assert.equal(getSenderNumber(['123456789@lid']), '');
});

test('Hermes status uses the selected route URL and API key', async () => {
  const previousFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      async text() {
        return '{"data":[]}';
      },
    };
  };
  try {
    const route = {
      baseUrl: 'http://100.64.0.2:8642',
      apiKey: 'friend-test-key',
      timeoutMs: 2000,
    };
    const status = await checkHermesStatus(route);

    assert.equal(status.ok, true);
    assert.equal(request.url, 'http://100.64.0.2:8642/v1/models');
    assert.equal(request.options.headers.Authorization, 'Bearer friend-test-key');
  } finally {
    global.fetch = previousFetch;
  }
});
