const { createWhatsAppBot } = require('./whatsapp');
const { checkHermesStatus } = require('./hermes');
const { config } = require('./config');
const qrcode = require('qrcode-terminal');

function printQr(qr) {
  qrcode.generate(qr, { small: true });
  console.log('Scan QR code WhatsApp di atas untuk login.');
}

function printPairingCode(code) {
  console.log(`Kode pairing WhatsApp: ${code}`);
  console.log('Masukkan kode ini di WhatsApp pada perangkat yang ingin ditautkan.');
}

async function main() {
  const hermesStatus = await checkHermesStatus();
  if (!hermesStatus.ok) {
    console.warn('Peringatan: Hermes API tidak tersedia:', hermesStatus.error);
  } else {
    console.log('Hermes API terhubung.');
  }

  const bot = await createWhatsAppBot({
    onReady: () => {
      console.log('WhatsApp bot siap menerima pesan.');
    },
    onQrCode: printQr,
    onPairingCode: printPairingCode,
    onLog: (message) => console.log(message),
  });

  await bot.start();
  const allowed = Array.from(config.whatsapp.allowedNumbers).join(', ') || 'belum diatur';
  console.log(`Bot aktif. Nomor yang diizinkan: ${allowed}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
