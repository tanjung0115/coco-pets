# COCO Pets

Aplikasi Android dan web untuk profil hewan, catatan perawatan, katalog kebutuhan pet, pesanan dan booking layanan. Project ini merupakan demo portofolio dengan backend lokal dan simulator IoT.

## Fitur utama

- Daftar/login, verifikasi email, reset/ganti password dan penghapusan akun server.
- Profil pengguna dan beberapa pet, unggah foto dan catatan perawatan.
- Cache perangkat, sinkronisasi lintas perangkat dan deteksi konflik revisi.
- Katalog makanan/kebutuhan pet, keranjang, pesanan serta pengelolaan stok server.
- Booking dokter hewan, grooming dan boarding berdasarkan slot penyedia.
- Panel pengelola untuk katalog, layanan, jadwal, konfirmasi booking dan pembayaran manual.
- Simulator IoT: lokasi contoh, baterai lemah, koneksi terputus dan data terlambat.
- Frontend browser dan aplikasi Android menggunakan Capacitor.

## Teknologi

HTML, CSS, JavaScript, Node.js 24+, SQLite (`node:sqlite`), Capacitor Android 8 dan Nodemailer. Versi aplikasi Android: **1.5.0**.

## Menjalankan demo

Gunakan Node.js **24 atau lebih baru** dan npm.

```powershell
git clone https://github.com/tanjung0115/coco-pets.git
cd coco-pets
npm install
npm run start:lan
```

Buka alamat yang ditampilkan terminal. Tanpa konfigurasi tambahan, port yang digunakan adalah **4173**. Untuk HP, gunakan alamat Wi-Fi komputer yang ditampilkan server; komputer dan HP harus berada di jaringan yang sama. Tekan **Ctrl+C** untuk menghentikan server. Gunakan `npm start` jika hanya ingin mengakses dari komputer sendiri.

Repository tidak menyertakan akun atau data pengguna. Daftarkan akun baru dan tambahkan pet sendiri. Database dibuat otomatis di `backend/data/`. Akun lokal browser lama terpisah dari akun server.

### Konfigurasi opsional

Salin `.env.example` menjadi `.env` untuk mengubah port atau mengatur email:

```powershell
Copy-Item .env.example .env
```

Jangan commit `.env`, token atau password. Biarkan konfigurasi SMTP/webhook kosong untuk demo lokal. Tautan verifikasi/reset tersimpan sebagai pesan JSON privat di `backend/data/outbox/`; buka tautannya di browser yang dapat mengakses server. Tidak ada email nyata yang dikirim pada mode ini. Sesuaikan `COCO_PUBLIC_URL` dengan alamat server jika diperlukan.

### Panel pengelola

Daftar akun server dan verifikasi emailnya. Di terminal kedua, gunakan email akun tersebut:

```powershell
npm run server:manage -- grant-operator EMAIL_AKUN
```

Buka `/manage.html` pada alamat server lalu login. Tidak ada akun admin atau password bawaan. Pengelola dapat mengatur produk, stok, layanan, slot booking dan pembayaran manual.

### Simulator IoT

Login ke akun server, tambahkan pet, lalu buka **About me → Penyimpanan server → Perangkat dan data sensor**. Pilih pet dan coba kontrol dummy.

Semua data dummy berlabel **SIMULASI**. Koordinat bukan posisi pet sebenarnya; Health, Food dan Mood tidak diisi sebagai pengukuran sensor buatan.

## Build Android

Memerlukan Android Studio, Java 21 dan Android SDK sesuai konfigurasi Gradle. Instal dependensi npm terlebih dahulu.

```powershell
npm run android:apk
```

Script menyinkronkan frontend dan menghasilkan `releases/coco-pets-trial.apk`. APK debug untuk trial tidak disimpan di repository. Pada HP, atur alamat server Wi-Fi komputer melalui pengaturan Penyimpanan server.

`npm run android:release:check` memvalidasi kompilasi release. Untuk APK/AAB bertanda tangan, set environment `COCO_KEYSTORE_PATH`, `COCO_KEYSTORE_PASSWORD`, `COCO_KEY_ALIAS` dan `COCO_KEY_PASSWORD`, lalu jalankan `npm run android:release`. Simpan kunci/password di luar repository. Paket release membutuhkan backend HTTPS karena menolak HTTP cleartext.

## Struktur repository

```text
frontend/    Antarmuka, aset aktif, cache dan klien API
backend/     HTTP API, SQLite, akun, katalog, booking dan perangkat
android/     Source native dan konfigurasi Gradle/Capacitor
scripts/     Build Android, backup dan pengelolaan server
```

Dokumen/portofolio, material pengujian lokal, cache, dependensi, hasil build, database, backup dan APK tidak disertakan. `frontend/assets/design/` masih diperlukan untuk merender halaman dan bukan sekadar gambar referensi.

## Status dan batas demo

Demo berjalan pada server lokal; belum ada hosting publik, gateway pembayaran, mitra klinik eksternal atau hardware IoT. Harga katalog merupakan contoh. Pembayaran diperiksa dan dicatat pengelola. Pengujian API dan browser dijalankan selama pengembangan; source pengujian tidak disertakan dalam repository demo ini.

Gunakan jaringan trial tepercaya. Sebelum penggunaan publik, siapkan HTTPS, email nyata, backup/restore, identitas/kontak pengelola dan kebijakan privasi publik. Halaman privasi trial tersedia di `/privacy.html`.

Desain berdasarkan referensi Figma/SVG selama pengembangan. Kredit dan izin aset perlu diperiksa sebelum redistribusi komersial. Pengembangan serta dokumentasi dibantu Codex/AI.
