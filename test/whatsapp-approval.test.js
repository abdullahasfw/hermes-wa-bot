const test = require('node:test');
const assert = require('node:assert/strict');
const { notifyPendingApproval } = require('../src/whatsapp');

function createSocket({ failOnce = false } = {}) {
  const sent = [];
  let shouldFail = failOnce;
  return {
    sent,
    async sendMessage(to, message) {
      if (shouldFail) {
        shouldFail = false;
        throw new Error('simulated WhatsApp send failure');
      }
      sent.push({ to, message });
    },
  };
}

test('notifies even when the approval was already cached by a status check', async () => {
  const socket = createSocket();
  const approval = {
    request_id: 'approval-1',
    description: 'Allow computer_use to perform `click`?',
    command: 'computer_use: click at (10, 20)',
  };
  const active = { pendingApproval: approval };

  await notifyPendingApproval(socket, '6281234567890@s.whatsapp.net', active, approval, {});
  await notifyPendingApproval(socket, '6281234567890@s.whatsapp.net', active, approval, {});

  assert.equal(socket.sent.length, 1);
  assert.match(socket.sent[0].message.text, /!approve/);
  assert.match(socket.sent[0].message.text, /click at \(10, 20\)/);
  assert.equal(active.notifiedApprovalId, 'approval-1');
});

test('allows retrying an approval notification after WhatsApp send failure', async () => {
  const socket = createSocket({ failOnce: true });
  const approval = { request_id: 'approval-2', description: 'Allow desktop action?' };
  const active = { pendingApproval: approval };

  await assert.rejects(
    notifyPendingApproval(socket, '6281234567890@s.whatsapp.net', active, approval, {}),
    /simulated WhatsApp send failure/,
  );
  assert.equal(active.notifiedApprovalId, undefined);

  await notifyPendingApproval(socket, '6281234567890@s.whatsapp.net', active, approval, {});
  assert.equal(socket.sent.length, 1);
  assert.equal(active.notifiedApprovalId, 'approval-2');
});
