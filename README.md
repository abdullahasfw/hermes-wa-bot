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
WHATSAPP_ALLOWED_NUMBERS=6281234567890,6289876543210
WHATSAPP_PHONE_NUMBER=6281234567890
WHATSAPP_UNAUTHORIZED_BEHAVIOR=reply
BOT_NAME=Hermes WA Bot
HERMES_API_TIMEOUT_MS=45000
HERMES_RUN_TIMEOUT_MS=600000
HERMES_USER_ROUTES='{"6289876543210":{"name":"Hermes teman","baseUrl":"http://100.64.0.2:8642","apiKey":"FRIEND_HERMES_API_KEY","timeoutMs":45000}}'
```

Catatan: `WHATSAPP_ALLOWED_NUMBERS` harus diisi nomor WhatsApp yang diizinkan, pisahkan dengan koma bila lebih dari satu.
`WHATSAPP_PHONE_NUMBER` adalah akun WhatsApp yang ditautkan ke bot; kosongkan untuk menggunakan QR. Jangan samakan keduanya kecuali memang menggunakan satu akun.
`HERMES_API_TIMEOUT_MS` membatasi setiap request HTTP ke API, sedangkan `HERMES_RUN_TIMEOUT_MS` mengatur lama bot menunggu run Hermes (default 10 menit). Jika batas tunggu run tercapai, run tidak otomatis dibatalkan.
Satu instance bot menggunakan satu akun/nomor WhatsApp tertaut. Pesan pribadi dari nomor yang diizinkan diteruskan ke Hermes utama secara default. `HERMES_USER_ROUTES` adalah JSON object opsional yang memetakan nomor pengirim tertentu ke endpoint Hermes, nama tampilan, API key, dan timeout API khusus. Nomor yang dipetakan wajib juga ada di `WHATSAPP_ALLOWED_NUMBERS`; setiap route harus memiliki API key tersendiri. Sesi, run aktif, persetujuan, dan perintah `!reset` diisolasi per pengirim, termasuk untuk pesan grup.
`WHATSAPP_UNAUTHORIZED_BEHAVIOR=reply` mempertahankan balasan penolakan standar; gunakan `ignore` pada instalasi kedua agar ia tidak membalas pesan milik pengguna instalasi pertama.

Contoh dengan pemetaan teman:

```env
WHATSAPP_ALLOWED_NUMBERS=6281234567890,6289876543210
HERMES_API_BASE_URL=http://127.0.0.1:8642
HERMES_API_KEY=KUNCI_HERMES_UTAMA
HERMES_USER_ROUTES='{"6289876543210":{"name":"Hermes teman","baseUrl":"http://100.64.0.2:8642","apiKey":"KUNCI_HERMES_TEMAN","timeoutMs":45000}}'
```

Ganti nomor dan nilai contoh dengan konfigurasi sebenarnya. Jangan bagikan atau commit `.env`. `100.64.0.2` hanya contoh alamat VPN; ganti dengan alamat privat Hermes teman yang dapat dijangkau dari komputer bot. Hermes API biasanya hanya mendengarkan localhost; untuk akses jarak jauh, teman perlu mengonfigurasi listener terbatas pada interface VPN dan firewall yang mengizinkan hanya host bot, atau membuat tunnel SSH yang aman. Jangan membuka API ke internet publik. Gunakan kunci API terpisah untuk masing-masing Hermes. `!status` menampilkan status Hermes yang dipilih untuk pengirim tersebut.

## Dua instalasi memakai nomor bot WhatsApp yang sama

Jika setiap orang menjalankan bot dan Hermes sendiri, kedua bot dapat ditautkan sebagai **perangkat tertaut yang berbeda** pada akun WhatsApp bot yang sama (selama akun masih memiliki slot perangkat tertaut). Jangan menyalin folder `auth_info/` dari satu komputer ke komputer lain; tautkan setiap instalasi secara terpisah dengan QR/pairing code agar masing-masing memiliki kredensial perangkat sendiri.

Di setiap komputer, isi `.env` dengan nomor pengirim yang boleh memakai instalasi tersebut saja dan Hermes lokal komputer itu. Contoh konfigurasi teman:

```env
WHATSAPP_ALLOWED_NUMBERS=6289876543210
WHATSAPP_UNAUTHORIZED_BEHAVIOR=ignore
HERMES_API_BASE_URL=http://127.0.0.1:8642
HERMES_API_KEY=KUNCI_HERMES_LOKAL_TEMAN
```

Komputer utama menggunakan nomor pengirim Anda sendiri di `WHATSAPP_ALLOWED_NUMBERS`. Pada kedua instalasi, `WHATSAPP_UNAUTHORIZED_BEHAVIOR=ignore` mencegah bot yang tidak bertanggung jawab atas pengirim itu mengirim balasan penolakan. Setiap bot menerima pembaruan pesan, tetapi hanya meneruskan pesan dari nomor allowlist lokalnya; pesan lain diabaikan. Masing-masing komputer memakai Hermes lokalnya sehingga tidak memerlukan endpoint Hermes jarak jauh. Jangan berbagi `.env` atau `auth_info/`; lindungi terminal dan file konfigurasi pada tiap komputer.

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
