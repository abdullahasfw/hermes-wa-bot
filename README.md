# Hermes WhatsApp Bot

Bot WhatsApp yang meneruskan pesan ke Hermes Agent melalui API server lokal Hermes.

## Fitur utama

- Login WhatsApp dengan pairing code atau QR Code
- Autentikasi Baileys dipertahankan di `auth_info/`
- Mengirim prompt ke Hermes API melalui `/v1/runs`
- Konteks chat dipertahankan per nomor WhatsApp menggunakan `session_id` Hermes
- Perintah: `!help`, `!reset`, `!status`, dan `!stop`
- Keamanan: whitelist nomor WhatsApp lewat `.env`
- Mendukung tool Hermes yang diaktifkan untuk API server, termasuk kontrol desktop bila `computer_use` tersedia
- Menangani timeout dan kegagalan API
- Memecah pesan panjang agar aman untuk WhatsApp

## Prasyarat

- Node.js yang sudah terinstal
- Hermes Agent berjalan dengan API server aktif
- API_SERVER_KEY valid dari Hermes
- Untuk mengendalikan aplikasi pada desktop Linux/X11, toolset `computer_use` Hermes harus aktif pada platform `api_server`

## Instalasi

```bash
cd ~/hermes-wa-bot
npm install
cp .env.example .env
nano .env
```

Isi file `.env` dengan nilai Anda:

```env
HERMES_API_BASE_URL=http://127.0.0.1:8642
HERMES_API_KEY=PASTE_API_SERVER_KEY
WHATSAPP_ALLOWED_NUMBERS=15551234567
WHATSAPP_PHONE_NUMBER=
WHATSAPP_UNAUTHORIZED_BEHAVIOR=reply
BOT_NAME=Hermes WA Bot
HERMES_API_TIMEOUT_MS=45000
HERMES_RUN_TIMEOUT_MS=600000
# Optional: route a specific allowlisted sender to another Hermes API.
# HERMES_USER_ROUTES='{"15557654321":{"name":"Hermes user","baseUrl":"https://hermes.example","apiKey":"USER_HERMES_API_KEY","timeoutMs":45000}}'
```

Catatan: `WHATSAPP_ALLOWED_NUMBERS` harus diisi nomor WhatsApp yang diizinkan, pisahkan dengan koma bila lebih dari satu.
`WHATSAPP_PHONE_NUMBER` adalah akun WhatsApp yang ditautkan ke bot; kosongkan untuk menggunakan QR. Jangan samakan keduanya kecuali memang menggunakan satu akun.
`HERMES_API_TIMEOUT_MS` membatasi setiap request HTTP ke API, sedangkan `HERMES_RUN_TIMEOUT_MS` mengatur lama bot menunggu run Hermes (default 10 menit). Jika batas tunggu run tercapai, run tidak otomatis dibatalkan.
Satu instance bot menggunakan satu akun/nomor WhatsApp tertaut. Semua nomor yang diizinkan menggunakan Hermes default kecuali diberi route khusus. `HERMES_USER_ROUTES` adalah JSON object opsional yang memetakan nomor pengirim ke endpoint Hermes, nama tampilan, API key, dan timeout API khusus. Nomor yang dipetakan wajib juga ada di `WHATSAPP_ALLOWED_NUMBERS`; setiap route harus memiliki API key tersendiri. Sesi, run aktif, persetujuan, dan perintah `!reset` diisolasi per pengirim, termasuk untuk pesan grup.
`WHATSAPP_UNAUTHORIZED_BEHAVIOR=reply` membalas pengirim yang tidak diizinkan dengan pesan penolakan; `ignore` mengabaikan pesan tersebut tanpa membalas.

### Routing Hermes per pengirim

```env
WHATSAPP_ALLOWED_NUMBERS=15551234567,15557654321
HERMES_API_BASE_URL=http://127.0.0.1:8642
HERMES_API_KEY=YOUR_DEFAULT_HERMES_API_KEY
HERMES_USER_ROUTES='{"15557654321":{"name":"Hermes user","baseUrl":"https://hermes.example","apiKey":"USER_HERMES_API_KEY","timeoutMs":45000}}'
```

Ganti nomor dan nilai contoh dengan konfigurasi deployment Anda. Nomor pada `HERMES_USER_ROUTES` harus tercantum di allowlist. Nomor lain yang diizinkan akan memakai endpoint Hermes default. Endpoint route harus dapat dijangkau dengan aman dari host bot; gunakan jaringan privat tepercaya atau tunnel terautentikasi, batasi akses API dan firewall, serta jangan mengekspos Hermes API ke internet publik. Gunakan API key terpisah untuk tiap endpoint. `!status` menampilkan Hermes yang dipilih untuk pengirim tersebut.

## Deployment multi-instance

Beberapa instalasi dapat memakai akun WhatsApp yang sama sebagai **perangkat tertaut yang berbeda**, selama akun memiliki slot perangkat tertaut. Perilaku ini bergantung pada WhatsApp dan Baileys; uji pada akun deployment Anda sebelum penggunaan produksi. Jangan menyalin folder `auth_info/` antar-host; tautkan setiap instalasi secara terpisah dengan QR/pairing code agar masing-masing memiliki kredensial perangkat sendiri.

Jika setiap instalasi ditujukan untuk kelompok pengguna yang berbeda, konfigurasi allowlist di setiap host secara terpisah:

```env
WHATSAPP_ALLOWED_NUMBERS=15557654321
WHATSAPP_UNAUTHORIZED_BEHAVIOR=ignore
HERMES_API_BASE_URL=http://127.0.0.1:8642
HERMES_API_KEY=YOUR_LOCAL_HERMES_API_KEY
```

Setiap instalasi hanya meneruskan pesan dari nomor allowlist lokalnya. `ignore` berguna jika beberapa instance menerima pesan yang sama agar instance yang tidak bertanggung jawab atas pengirim tersebut tidak mengirim balasan penolakan. Setiap host dapat menggunakan Hermes lokalnya sendiri. Jangan berbagi `.env` atau `auth_info/`; lindungi kredensial dan file konfigurasi pada setiap host.

## Menjalankan bot

```bash
cd ~/hermes-wa-bot
node src/index.js
```

Untuk login dengan pairing code, isi `WHATSAPP_PHONE_NUMBER` dengan nomor lengkap termasuk kode negara, hanya digit (contoh Indonesia: `6281234567890`). Bot akan menampilkan kode pairing di terminal. Di WhatsApp ponsel, buka **Perangkat tertaut → Tautkan perangkat → Tautkan dengan nomor telepon**, lalu masukkan kode tersebut. Jangan bagikan kode pairing kepada siapa pun.

Jika `WHATSAPP_PHONE_NUMBER` kosong, bot menggunakan QR code sebagai metode login. Setelah koneksi terbuka, bot siap menerima pesan.

## Perintah di WhatsApp

- `!help` — menampilkan bantuan
- `!reset` — menghapus konteks percakapan chat saat ini
- `!status` — memeriksa status WhatsApp dan Hermes
- `!wait` — melanjutkan pemantauan run Hermes yang masih aktif setelah timeout sementara
- `!stop` — membatalkan pekerjaan Hermes yang sedang berjalan
- `!approve` atau `oke lanjut` — menyetujui satu tindakan Hermes yang sedang menunggu persetujuan
- `!deny` — menolak tindakan sensitif Hermes yang sedang menunggu persetujuan

Approval hanya diproses dari nomor allowlist dan hanya bila Hermes benar-benar melaporkan permintaan yang sedang menunggu. Bot mengirim deskripsi dan ringkasan tindakan Hermes; periksa keduanya sebelum menyetujui. `!approve` atau balasan tepat `oke lanjut` menyetujui tindakan itu satu kali; bot tidak menyetujui tindakan secara otomatis. Bila tidak ada approval aktif, frasa tersebut tidak diteruskan sebagai prompt baru. Untuk chat pribadi, bot menormalkan PN/LID ke nomor yang sama agar status run dan approval tetap terhubung meski WhatsApp mengganti jenis alamat.
Run aktif disimpan bersama sesi chat agar `!status`, `!wait`, `!approve`, dan `!stop` tetap dapat menemukannya setelah bot dimulai ulang. `!status` menandai secara terpisah jika Hermes sedang menunggu persetujuan.

## Kontrol browser dan desktop

Toolset Hermes `browser` mengotomatisasi browser sesuai implementasi Hermes; untuk mengendalikan aplikasi GUI pada desktop Linux/X11, API server juga perlu mengaktifkan `computer_use`. Aktifkan melalui CLI Hermes, lalu mulai ulang Gateway:

```bash
hermes tools enable computer_use --platform api_server
systemctl --user restart hermes-gateway.service
hermes tools list --platform api_server
hermes computer-use doctor
```

Pastikan daftar tool menampilkan `computer_use` aktif dan pemeriksaan desktop lulus. Gateway harus berjalan dalam sesi desktop yang memiliki akses ke X11. Tindakan input desktop yang memerlukan persetujuan akan menunggu konfirmasi melalui permintaan approval Hermes yang diteruskan bot ke WhatsApp; balasan chat tidak mengesampingkan persetujuan Hermes. Periksa ringkasan tindakan sebelum menggunakan `!approve` atau `oke lanjut`. Jika tidak ada notifikasi approval, kirim `!status`, lalu `!wait` untuk memulihkan pemantauan run aktif. Jangan mengaktifkan mode YOLO atau mengubah unattended approval menjadi auto-approve.

## systemd user service

Service user terpasang di `~/.config/systemd/user/hermes-wa-bot.service`. Untuk mengaktifkan atau mengelola bot:

```bash
systemctl --user daemon-reload
systemctl --user enable --now hermes-wa-bot.service
systemctl --user status hermes-wa-bot.service
```

## Log dan status service

```bash
journalctl --user -u hermes-wa-bot.service -f
systemctl --user status hermes-wa-bot.service
systemctl --user stop hermes-wa-bot.service
systemctl --user start hermes-wa-bot.service
```

Bot dimulai ketika user login karena service terikat ke `default.target`, dan meminta systemd user memastikan `hermes-gateway.service` aktif terlebih dahulu. File service Hermes Gateway yang sudah ada tidak diubah.

## Troubleshooting

- Jika `HERMES_API_KEY` salah, bot akan gagal di semua request.
- Jika QR code tidak muncul, pastikan terminal bisa menampilkan output TUI.
- Jika nomor WhatsApp tidak diizinkan, bot akan membalas dengan notifikasi `tidak berizin`.
- Jika Hermes API timeout, uji endpoint dengan curl:

```bash
curl -sS -H "Authorization: Bearer <API_SERVER_KEY>" http://127.0.0.1:8642/v1/models
```

- Jika Hermes mengatakan tidak dapat mengakses desktop, pastikan `computer_use` aktif pada `api_server`, Gateway sudah dimulai ulang, dan `hermes computer-use doctor` lulus. Jika chat sudah berisi jawaban lama yang menolak akses desktop, kirim `!reset` untuk menghapus konteks itu, lalu minta secara spesifik: “Gunakan computer_use untuk membuka Firefox di desktop ini.” Jangan gunakan `!approve` kecuali Hermes benar-benar mengirim permintaan approval yang ingin Anda setujui.

- Jika bot melaporkan Hermes masih memproses setelah batas waktu, run tetap aktif. Kirim `!wait` untuk melanjutkan pemantauan atau `!stop` untuk membatalkannya. Batas tunggu dapat disesuaikan dengan `HERMES_RUN_TIMEOUT_MS`; nilai harus bilangan bulat positif dalam milidetik.

## Catatan keamanan

- `.env` tidak boleh di-commit ke Git.
- API key Hermes dan kredensial WhatsApp disimpan hanya di mesin lokal.
- API server Hermes tetap terikat ke localhost; jangan mengeksposnya ke internet.
- Hanya nomor pada `WHATSAPP_ALLOWED_NUMBERS` yang dapat mengirim instruksi ke Hermes. Pesan mereka dapat menggunakan toolset yang aktif pada API server; pada konfigurasi ini termasuk terminal, file, dan (setelah diaktifkan) kontrol desktop.
- Untuk tindakan sensitif, Hermes tetap menggunakan mekanisme approval. Bot meneruskan permintaan tersebut, tetapi tidak menyetujuinya secara otomatis; persetujuan satu kali dapat diberikan dengan `!approve`.
