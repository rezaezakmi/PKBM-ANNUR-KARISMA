# Security Specification — SIAKAD PKBM ANNUR KARISMA

## 1. Data Invariants
1. Setiap dokumen di `/users/{userId}` harus memiliki `uid == userId`, `username` lowercase valid (`^[a-z0-9._-]{3,40}$`), peran valid (`admin | kepala_pkbm | guru | murid`), dan `status` (`Aktif | Nonaktif`). **Tidak ada kolom password dalam bentuk apa pun yang disimpan di Firestore.**
2. Pembuatan, pengubahan role/status, listing, dan penghapusan dokumen `/users/{userId}` hanya diizinkan oleh Admin aktif (`isAdmin()`), **kecuali** inisialisasi Admin pertama kali saat `/system_config/auth_setup` belum ada.
3. Setelah `/system_config/auth_setup` dibuat (dengan `adminInitialized == true`), dokumen tersebut terkunci permanen (`allow update, delete: if false`) sehingga tidak ada pendaftaran Admin tambahan maupun pendaftaran mandiri.
4. Koleksi `/account_lookups/{username}` hanya menyimpan pasangan minimal `{ username, internalEmail, updatedAt }` tanpa PII lain. Publik hanya diizinkan melakukan `get` per satu username persis saat login (`allow list` dibatasi khusus `isAdmin()`).
5. Semua akses baca/tulis pada koleksi operasional mewajibkan `isActiveAccount()`, yaitu token login valid DAN dokumen `/users/$(request.auth.uid)` ada serta berstatus `'Aktif'`. Akun berstatus `'Nonaktif'` atau UID lama yang sudah diganti saat reset password otomatis ditolak oleh rules.
6. Pengaturan sekolah `/school_settings/main` hanya dapat dibuat, diubah, di-list, atau dihapus oleh Admin aktif (`isAdmin()`), sedangkan pembacaan dokumen tunggal `main` diizinkan bagi seluruh akun aktif (`isActiveAccount()`) agar kop surat, logo, nama Kepala PKBM, dan TTD pada seluruh surat konsisten mengikuti Admin Master.
7. Dokumen murid (`/students/{studentId}`) dan guru (`/teachers/{teacherId}`) dibatasi ketat per pemilik (`ownerUid`), daftar `accessUids`, atau staf pimpinan (`Admin`/`Kepala PKBM`), dengan mutasi data induk dikontrol Admin.
8. Semua stempel waktu (`createdAt`, `updatedAt`) wajib sama dengan `request.time` saat pembuatan/pembaruan dan `createdAt`/`createdBy` bersifat imutabel.
9. Semua ID dokumen wajib lolos regex `^[a-zA-Z0-9_\-]+$` (atau `^[a-z0-9._\-]{3,40}$` untuk username lookup).

## 2. The "Dirty Dozen" Payloads (Rejected with PERMISSION_DENIED)
1. **Unauthenticated Read/Write**: Membaca atau menulis `/students/s1` tanpa token autentikasi.
2. **Inactive / Deleted Account Access**: Akun berstatus `Nonaktif` atau kredensial Auth versi lama mencoba membaca `/tasks` atau `/announcements`.
3. **Self-Registration / Privilege Escalation**: Pengguna mencoba membuat `/users/{uid}` setelah `/system_config/auth_setup` ada, atau memperbarui `role`/`status` miliknya sendiri.
4. **Password Storage / Shadow Field Injection**: Payload `create` pada `/users/{uid}` menyertakan field liar `password` atau `isSuperUser: true`.
5. **Public Directory Scraping**: Pengguna anonim atau non-admin mencoba melakukan `list` pada `/account_lookups` atau `/users`.
6. **Non-Admin School Settings Tampering**: Guru, Kepala PKBM, atau Murid mencoba mengubah, membuat, menghapus, atau me-list `/school_settings/main`.
7. **Cross-Student PII Scraping**: Murid A melakukan `get` atau `list` terhadap data milik Murid B (`ownerUid != request.auth.uid`).
8. **ID & Timestamp Spoofing**: Mengirim `createdAt` atau `updatedAt` bukan `request.time`, atau ID dokumen dengan karakter terlarang.
9. **Student Answer Key Harvesting**: Murid membaca `/question_bank/{id}` atau draf ujian yang belum dipublikasikan (`isOnlinePublished == false`).
10. **Self-Grading Exam or Task Submission**: Murid mencoba memperbarui `essayScore`, `finalScore`, `score`, atau `status: "Sudah Dinilai"` pada pengumpulan ujian/tugas.
11. **Student Grade & Attendance Tampering**: Murid mencoba menulis ke `/attendance_sessions/{id}`, `/grade_records/{id}`, atau `/grade_weights/{id}`.
12. **Cross-Teacher Class & Subject Isolation**: Guru A mencoba membaca atau mengubah pengumpulan tugas, jawaban ujian, presensi, atau nilai kelas/mapel Guru B tanpa tercantum di `ownerUid`/`teacherUid`/`accessUids`.
