import {
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { readSpreadsheetWorkbook } from '../utils/excelUtils';
import {
  buildInternalEmail,
  db,
  getProvisionerAuth,
  isValidUsernameFormat,
  normalizeUsername,
} from '../lib/firebase';
import {
  Classroom,
  SessionIssuedCredential,
  Student,
  Teacher,
  UserProfile,
  UserRole,
} from '../types/siakad';

export interface CreateAccountInput {
  name: string;
  username: string;
  password: string;
  role: UserRole;
  linkedEntityId?: string;
  nis?: string;
  nip?: string;
  classLabel?: string;
}

export interface AccountImportRowPreview {
  rowNumber: number;
  name: string;
  username: string;
  password: string;
  rawRole: string;
  role: UserRole;
  kelas: string;
  matchedEntityId?: string;
  nis?: string;
  nip?: string;
  valid: boolean;
  reason?: string;
}

export function generateRandomPassword(length = 10): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%';
  const all = upper + lower + digits + symbols;

  const pick = (pool: string) => pool[Math.floor(Math.random() * pool.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < Math.max(8, length)) {
    chars.push(pick(all));
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export async function isUsernameAvailable(
  rawUsername: string,
  existingUsers: UserProfile[] = [],
  ignoreUid?: string
): Promise<{ available: boolean; normalized: string; reason?: string }> {
  const normalized = normalizeUsername(rawUsername);
  if (normalized !== rawUsername.trim().toLowerCase() || rawUsername.includes(' ')) {
    return {
      available: false,
      normalized,
      reason: 'Username hanya boleh huruf kecil, angka, titik (.), garis bawah (_), atau tanda hubung (-) tanpa spasi.',
    };
  }
  if (!isValidUsernameFormat(normalized)) {
    return {
      available: false,
      normalized,
      reason: 'Username harus terdiri dari 3–40 karakter huruf kecil/angka/._- tanpa spasi.',
    };
  }

  const localDuplicate = existingUsers.some(
    (u) => u.username.toLowerCase() === normalized && u.uid !== ignoreUid
  );
  if (localDuplicate) {
    return {
      available: false,
      normalized,
      reason: `Username "${normalized}" sudah dipakai akun lain.`,
    };
  }

  try {
    const lookupSnap = await getDoc(doc(db, 'account_lookups', normalized));
    if (lookupSnap.exists()) {
      const targetUser = existingUsers.find((u) => u.uid === ignoreUid);
      const isSameEmail =
        targetUser && lookupSnap.data()?.internalEmail === targetUser.internalEmail;
      if (!isSameEmail) {
        return {
          available: false,
          normalized,
          reason: `Username "${normalized}" sudah terdaftar.`,
        };
      }
    }
  } catch {
    // Abaikan jika mode demo lokal
  }

  return { available: true, normalized };
}

async function provisionAuthCredentialWithRetry(
  username: string,
  version: number,
  password: string
): Promise<{ uid: string; internalEmail: string }> {
  const secondaryAuth = await getProvisionerAuth();
  let candidateEmail = buildInternalEmail(username, version);

  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const cred = await createUserWithEmailAndPassword(
          secondaryAuth,
          candidateEmail,
          password
        );
        return { uid: cred.user.uid, internalEmail: candidateEmail };
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code || '';
        if (code === 'auth/email-already-in-use' && attempt < 3) {
          const salt = `${Date.now().toString(36).slice(-3)}${attempt}`;
          candidateEmail = buildInternalEmail(username, version, salt);
          continue;
        }
        throw err;
      }
    }
    throw new Error('Gagal membuat kredensial autentikasi.');
  } finally {
    await signOut(secondaryAuth).catch(() => {});
  }
}

async function syncUidReferencesInFirestore(params: {
  oldUid?: string;
  newUid: string;
  role: UserRole;
  linkedEntityId?: string;
  adminUid: string;
}): Promise<void> {
  const { oldUid, newUid, role, linkedEntityId, adminUid } = params;

  const replaceUidInArray = (arr: unknown): string[] => {
    const list = Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : [];
    const filtered = oldUid ? list.filter((id) => id !== oldUid) : list;
    return Array.from(new Set([...filtered, newUid, adminUid].filter(Boolean)));
  };

  // 1. Tautkan dokumen student jika role murid & ada linkedEntityId atau oldUid
  if (role === 'murid') {
    if (linkedEntityId) {
      const stuRef = doc(db, 'students', linkedEntityId);
      const stuSnap = await getDoc(stuRef);
      if (stuSnap.exists()) {
        const d = stuSnap.data();
        await updateDoc(stuRef, {
          ownerUid: newUid,
          accessUids: replaceUidInArray(d.accessUids).slice(0, 30),
          updatedAt: serverTimestamp(),
        });
      }
    }

    if (oldUid && oldUid !== newUid) {
      const studentSnap = await getDocs(
        query(collection(db, 'students'), where('ownerUid', '==', oldUid))
      );
      await Promise.all(
        studentSnap.docs.map((docSnap) =>
          updateDoc(docSnap.ref, {
            ownerUid: newUid,
            accessUids: replaceUidInArray(docSnap.data().accessUids).slice(0, 30),
            updatedAt: serverTimestamp(),
          })
        )
      );

      // Migrasi studentUid & array UID pada tugas, presensi, rapor, ujian
      const [tasksSnap, tsubSnap, attSnap, grdSnap, exSubSnap] = await Promise.all([
        getDocs(query(collection(db, 'tasks'), where('targetStudentUids', 'array-contains', oldUid))),
        getDocs(query(collection(db, 'task_submissions'), where('studentUid', '==', oldUid))),
        getDocs(query(collection(db, 'attendance_sessions'), where('studentUids', 'array-contains', oldUid))),
        getDocs(query(collection(db, 'grade_records'), where('studentUid', '==', oldUid))),
        getDocs(query(collection(db, 'exam_submissions'), where('studentUid', '==', oldUid))),
      ]);

      await Promise.all([
        ...tasksSnap.docs.map((d) => {
          const prevTargets = Array.isArray(d.data().targetStudentUids) ? d.data().targetStudentUids : [];
          const nextTargets = Array.from(
            new Set([...prevTargets.filter((x: string) => x !== oldUid), newUid])
          ).slice(0, 100);
          return updateDoc(d.ref, {
            targetStudentUids: nextTargets,
            updatedAt: serverTimestamp(),
          });
        }),
        ...tsubSnap.docs.map((d) =>
          updateDoc(d.ref, {
            studentUid: newUid,
            accessUids: replaceUidInArray(d.data().accessUids).slice(0, 50),
            updatedAt: serverTimestamp(),
          })
        ),
        ...attSnap.docs.map((d) => {
          const prevStudents = Array.isArray(d.data().studentUids) ? d.data().studentUids : [];
          const nextStudents = Array.from(
            new Set([...prevStudents.filter((x: string) => x !== oldUid), newUid])
          ).slice(0, 100);
          return updateDoc(d.ref, {
            studentUids: nextStudents,
            updatedAt: serverTimestamp(),
          });
        }),
        ...grdSnap.docs.map((d) =>
          updateDoc(d.ref, {
            studentUid: newUid,
            accessUids: replaceUidInArray(d.data().accessUids).slice(0, 50),
            updatedAt: serverTimestamp(),
          })
        ),
        ...exSubSnap.docs.map((d) =>
          updateDoc(d.ref, {
            studentUid: newUid,
            accessUids: replaceUidInArray(d.data().accessUids).slice(0, 30),
            updatedAt: serverTimestamp(),
          })
        ),
      ]);
    } else if (linkedEntityId) {
      // Saat pertama kali menautkan akun ke murid yang sudah punya tugas/rapor dengan ownerUid lama
      const stuSnap = await getDoc(doc(db, 'students', linkedEntityId));
      const classId = stuSnap.exists() ? stuSnap.data().classId : null;
      if (classId) {
        const classTasksSnap = await getDocs(
          query(collection(db, 'tasks'), where('classId', '==', classId))
        );
        await Promise.all(
          classTasksSnap.docs.map((d) => {
            const prev = Array.isArray(d.data().targetStudentUids) ? d.data().targetStudentUids : [];
            const next = Array.from(new Set([...prev, newUid])).slice(0, 100);
            return updateDoc(d.ref, {
              targetStudentUids: next,
              updatedAt: serverTimestamp(),
            });
          })
        );
      }
      const grdSnap = await getDocs(
        query(collection(db, 'grade_records'), where('studentId', '==', linkedEntityId))
      );
      await Promise.all(
        grdSnap.docs.map((d) =>
          updateDoc(d.ref, {
            studentUid: newUid,
            updatedAt: serverTimestamp(),
          })
        )
      );
    }
  }

  // 2. Tautkan dokumen teacher & jadwal jika role guru
  if (role === 'guru') {
    if (linkedEntityId) {
      const tRef = doc(db, 'teachers', linkedEntityId);
      const tSnap = await getDoc(tRef);
      if (tSnap.exists()) {
        const d = tSnap.data();
        await updateDoc(tRef, {
          ownerUid: newUid,
          accessUids: replaceUidInArray(d.accessUids).slice(0, 30),
          updatedAt: serverTimestamp(),
        });
      }

      const allAsgSnap = await getDocs(
        query(collection(db, 'assignments'), where('status', 'in', ['Aktif', 'Selesai']))
      );
      const asgByTeacherDocs = allAsgSnap.docs.filter((d) => d.data().teacherId === linkedEntityId);
      const classIds: string[] = [];
      await Promise.all(
        asgByTeacherDocs.map((d) => {
          if (d.data().classId) classIds.push(d.data().classId);
          return updateDoc(d.ref, {
            teacherUid: newUid,
            accessUids: replaceUidInArray(d.data().accessUids).slice(0, 30),
            updatedAt: serverTimestamp(),
          });
        })
      );

      // Pastikan guru dapat membaca murid pada kelas ampuan & tugas/nilai terkait
      for (const classId of Array.from(new Set(classIds))) {
        const stuInClassSnap = await getDocs(
          query(collection(db, 'students'), where('classId', '==', classId))
        );
        await Promise.all(
          stuInClassSnap.docs.map((d) =>
            updateDoc(d.ref, {
              accessUids: replaceUidInArray(d.data().accessUids).slice(0, 30),
              updatedAt: serverTimestamp(),
            })
          )
        );
      }
    }

    if (oldUid && oldUid !== newUid) {
      const [asgUidSnap, tasksUidSnap, tsubAccessSnap, attUidSnap, gwUidSnap, grdUidSnap, tdSnap, qbSnap, exSnap] =
        await Promise.all([
          getDocs(query(collection(db, 'assignments'), where('status', 'in', ['Aktif', 'Selesai']))),
          getDocs(query(collection(db, 'tasks'), where('accessUids', 'array-contains', oldUid))),
          getDocs(query(collection(db, 'task_submissions'), where('accessUids', 'array-contains', oldUid))),
          getDocs(query(collection(db, 'attendance_sessions'), where('accessUids', 'array-contains', oldUid))),
          getDocs(query(collection(db, 'grade_weights'), where('accessUids', 'array-contains', oldUid))),
          getDocs(query(collection(db, 'grade_records'), where('accessUids', 'array-contains', oldUid))),
          getDocs(query(collection(db, 'teaching_documents'), where('accessUids', 'array-contains', oldUid))),
          getDocs(query(collection(db, 'question_bank'), where('accessUids', 'array-contains', oldUid))),
          getDocs(query(collection(db, 'exams'), where('accessUids', 'array-contains', oldUid))),
        ]);

      const matchingAsgUidDocs = asgUidSnap.docs.filter((d) => {
        const list = Array.isArray(d.data().accessUids) ? d.data().accessUids : [];
        return list.includes(oldUid) || d.data().teacherUid === oldUid;
      });

      await Promise.all([
        ...matchingAsgUidDocs.map((d) =>
          updateDoc(d.ref, {
            teacherUid: d.data().teacherUid === oldUid ? newUid : d.data().teacherUid,
            accessUids: replaceUidInArray(d.data().accessUids).slice(0, 30),
            updatedAt: serverTimestamp(),
          })
        ),
        ...tasksUidSnap.docs.map((d) =>
          updateDoc(d.ref, {
            teacherUid: d.data().teacherUid === oldUid ? newUid : d.data().teacherUid,
            ownerUid: d.data().ownerUid === oldUid ? newUid : d.data().ownerUid,
            accessUids: replaceUidInArray(d.data().accessUids).slice(0, 50),
            updatedAt: serverTimestamp(),
          })
        ),
        ...tsubAccessSnap.docs.map((d) =>
          updateDoc(d.ref, {
            accessUids: replaceUidInArray(d.data().accessUids).slice(0, 50),
            updatedAt: serverTimestamp(),
          })
        ),
        ...attUidSnap.docs.map((d) =>
          updateDoc(d.ref, {
            ownerUid: d.data().ownerUid === oldUid ? newUid : d.data().ownerUid,
            accessUids: replaceUidInArray(d.data().accessUids).slice(0, 50),
            updatedAt: serverTimestamp(),
          })
        ),
        ...gwUidSnap.docs.map((d) =>
          updateDoc(d.ref, {
            ownerUid: d.data().ownerUid === oldUid ? newUid : d.data().ownerUid,
            accessUids: replaceUidInArray(d.data().accessUids).slice(0, 50),
            updatedAt: serverTimestamp(),
          })
        ),
        ...grdUidSnap.docs.map((d) =>
          updateDoc(d.ref, {
            ownerUid: d.data().ownerUid === oldUid ? newUid : d.data().ownerUid,
            accessUids: replaceUidInArray(d.data().accessUids).slice(0, 50),
            updatedAt: serverTimestamp(),
          })
        ),
        ...tdSnap.docs.map((d) =>
          updateDoc(d.ref, {
            accessUids: replaceUidInArray(d.data().accessUids).slice(0, 30),
            updatedAt: serverTimestamp(),
          })
        ),
        ...qbSnap.docs.map((d) =>
          updateDoc(d.ref, {
            accessUids: replaceUidInArray(d.data().accessUids).slice(0, 30),
            updatedAt: serverTimestamp(),
          })
        ),
        ...exSnap.docs.map((d) =>
          updateDoc(d.ref, {
            accessUids: replaceUidInArray(d.data().accessUids).slice(0, 30),
            updatedAt: serverTimestamp(),
          })
        ),
      ]);
    }
  }
}

export async function createManagedAccount(params: {
  input: CreateAccountInput;
  adminUid: string;
  existingUsers: UserProfile[];
}): Promise<SessionIssuedCredential> {
  const { input, adminUid, existingUsers } = params;
  const check = await isUsernameAvailable(input.username, existingUsers);
  if (!check.available) {
    throw new Error(check.reason || 'Username tidak valid atau sudah digunakan.');
  }

  if (!input.password || input.password.length < 6) {
    throw new Error('Password minimal harus 6 karakter.');
  }

  const cleanName = input.name.trim().slice(0, 120);
  if (cleanName.length < 2) {
    throw new Error('Nama lengkap minimal 2 karakter.');
  }

  const { uid: newUid, internalEmail } = await provisionAuthCredentialWithRetry(
    check.normalized,
    1,
    input.password
  );

  // JANGAN PERNAH menyimpan password dalam bentuk apa pun ke Firestore!
  const userPayload: Record<string, unknown> = {
    uid: newUid,
    username: check.normalized,
    internalEmail,
    name: cleanName,
    role: input.role,
    status: 'Aktif',
    authVersion: 1,
    createdBy: adminUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.nis?.trim()) userPayload.nis = input.nis.trim().slice(0, 32);
  if (input.nip?.trim()) userPayload.nip = input.nip.trim().slice(0, 32);
  if (input.linkedEntityId?.trim()) userPayload.linkedEntityId = input.linkedEntityId.trim().slice(0, 128);
  if (input.classLabel?.trim()) userPayload.classLabel = input.classLabel.trim().slice(0, 120);

  await setDoc(doc(db, 'users', newUid), userPayload);
  await setDoc(doc(db, 'account_lookups', check.normalized), {
    username: check.normalized,
    internalEmail,
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'login_card_credentials', newUid), {
    uid: newUid,
    username: check.normalized,
    name: cleanName,
    role: input.role,
    ...(input.classLabel?.trim() ? { classLabel: input.classLabel.trim().slice(0, 120) } : {}),
    cardPassword: input.password.slice(0, 64),
    updatedBy: adminUid,
    updatedAt: serverTimestamp(),
  }).catch(() => {});

  await syncUidReferencesInFirestore({
    newUid,
    role: input.role,
    linkedEntityId: input.linkedEntityId,
    adminUid,
  }).catch((err) => {
    console.warn('Sinkronisasi tautan UID parsial:', err);
  });

  return {
    uid: newUid,
    name: cleanName,
    username: check.normalized,
    password: input.password,
    role: input.role,
    classLabel: input.classLabel,
    issuedAt: new Date().toISOString(),
  };
}

export async function updateManagedUsername(params: {
  account: UserProfile;
  newUsernameRaw: string;
  newName?: string;
  newClassLabel?: string;
  existingUsers: UserProfile[];
  adminUid?: string;
}): Promise<{ username: string }> {
  const { account, newUsernameRaw, newName, newClassLabel, existingUsers, adminUid } = params;
  const check = await isUsernameAvailable(newUsernameRaw, existingUsers, account.uid);
  if (!check.available) {
    throw new Error(check.reason || 'Username tidak valid atau sudah dipakai.');
  }

  const nextUsername = check.normalized;
  const isUsernameChanged = nextUsername !== account.username;

  if (isUsernameChanged) {
    await setDoc(doc(db, 'account_lookups', nextUsername), {
      username: nextUsername,
      internalEmail: account.internalEmail,
      updatedAt: serverTimestamp(),
    });
  }

  const patch: Record<string, unknown> = {
    username: nextUsername,
    updatedAt: serverTimestamp(),
  };
  if (newName && newName.trim().length >= 2) {
    patch.name = newName.trim().slice(0, 120);
  }
  if (newClassLabel !== undefined) {
    patch.classLabel = newClassLabel.trim().slice(0, 120);
  }

  const targetDocId = account.docId || account.uid;
  await updateDoc(doc(db, 'users', targetDocId), patch);

  // Sinkronkan juga metadata kartu login di login_card_credentials bila dokumennya ada
  try {
    const credRef = doc(db, 'login_card_credentials', targetDocId);
    const credSnap = await getDoc(credRef);
    if (credSnap.exists()) {
      const credPatch: Record<string, unknown> = {
        username: nextUsername,
        ...(adminUid ? { updatedBy: adminUid } : {}),
        updatedAt: serverTimestamp(),
      };
      if (newName && newName.trim().length >= 2) {
        credPatch.name = newName.trim().slice(0, 120);
      }
      if (newClassLabel !== undefined) {
        credPatch.classLabel = newClassLabel.trim().slice(0, 120);
      }
      await updateDoc(credRef, credPatch).catch(() => {});
    }
  } catch {
    // Abaikan bila dokumen kartu belum tersimpan
  }

  if (isUsernameChanged && account.username) {
    await deleteDoc(doc(db, 'account_lookups', normalizeUsername(account.username))).catch(() => {});
  }

  return { username: nextUsername };
}

/**
 * Menyimpan/memperbarui catatan sandi kartu login (tanpa mengubah UID Auth) agar
 * password kartu (termasuk akun Admin yang sedang aktif) selalu tampil terbuka saat dicetak.
 */
export async function saveLoginCardCredential(params: {
  account: UserProfile;
  cardPassword: string;
  actorUid: string;
}): Promise<SessionIssuedCredential> {
  const { account, cardPassword, actorUid } = params;
  const cleanPwd = cardPassword.trim();
  if (cleanPwd.length < 6 || cleanPwd.length > 64) {
    throw new Error('Password kartu harus terdiri dari 6 hingga 64 karakter.');
  }

  const targetUid = account.docId || account.uid;
  const cleanName = (account.name || account.username).trim().slice(0, 120);
  const payload: Record<string, unknown> = {
    uid: targetUid,
    username: normalizeUsername(account.username),
    name: cleanName.length >= 2 ? cleanName : `${cleanName}__`.slice(0, 2),
    role: account.role,
    cardPassword: cleanPwd,
    updatedBy: actorUid,
    updatedAt: serverTimestamp(),
  };
  if (account.classLabel?.trim()) {
    payload.classLabel = account.classLabel.trim().slice(0, 120);
  }

  await setDoc(doc(db, 'login_card_credentials', targetUid), payload);

  return {
    uid: targetUid,
    name: cleanName,
    username: normalizeUsername(account.username),
    password: cleanPwd,
    role: account.role,
    classLabel: account.classLabel,
    issuedAt: new Date().toISOString(),
  };
}

/**
 * Reset password menggunakan Starter Tier Client SDK:
 * Membuat kredensial Auth baru berversi (mis. username.v2@annurkarisma.app),
 * memindahkan profil & tautan UID ke dokumen baru, mengarahkan account_lookups ke akun terbaru,
 * dan menghapus /users/{oldUid} sehingga kredensial lama otomatis ditolak oleh Security Rules.
 */
export async function resetManagedPassword(params: {
  account: UserProfile;
  newPassword: string;
  adminUid: string;
}): Promise<SessionIssuedCredential> {
  const { account, newPassword, adminUid } = params;
  if (account.uid === adminUid) {
    throw new Error(
      'Akun Admin yang sedang Anda gunakan tidak dapat direset dari sesi ini. Gunakan akun Admin lain jika ingin mereset password Anda sendiri.'
    );
  }
  if (!newPassword || newPassword.length < 6) {
    throw new Error('Password baru minimal harus 6 karakter.');
  }

  const nextVersion = Math.min(999, (account.authVersion || 1) + 1);
  const { uid: newUid, internalEmail } = await provisionAuthCredentialWithRetry(
    account.username,
    nextVersion,
    newPassword
  );

  // Tulis profil baru (tanpa password)
  const newProfileDoc: Record<string, unknown> = {
    uid: newUid,
    username: account.username,
    internalEmail,
    name: account.name,
    role: account.role,
    status: account.status,
    authVersion: nextVersion,
    createdBy: adminUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (account.nis) newProfileDoc.nis = account.nis;
  if (account.nip) newProfileDoc.nip = account.nip;
  if (account.linkedEntityId) newProfileDoc.linkedEntityId = account.linkedEntityId;
  if (account.classLabel) newProfileDoc.classLabel = account.classLabel;

  await setDoc(doc(db, 'users', newUid), newProfileDoc);
  await setDoc(doc(db, 'account_lookups', account.username), {
    username: account.username,
    internalEmail,
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'login_card_credentials', newUid), {
    uid: newUid,
    username: account.username,
    name: account.name.trim().slice(0, 120),
    role: account.role,
    ...(account.classLabel?.trim() ? { classLabel: account.classLabel.trim().slice(0, 120) } : {}),
    cardPassword: newPassword.slice(0, 64),
    updatedBy: adminUid,
    updatedAt: serverTimestamp(),
  }).catch(() => {});

  await syncUidReferencesInFirestore({
    oldUid: account.uid,
    newUid,
    role: account.role,
    linkedEntityId: account.linkedEntityId,
    adminUid,
  }).catch((err) => {
    console.warn('Peringatan migrasi UID saat reset password:', err);
  });

  // Hapus profil lama & kredensial kartu lama agar akun Auth lama langsung tertolak Security Rules
  await deleteDoc(doc(db, 'users', account.docId || account.uid));
  await deleteDoc(doc(db, 'login_card_credentials', account.docId || account.uid)).catch(() => {});

  return {
    uid: newUid,
    name: account.name,
    username: account.username,
    password: newPassword,
    role: account.role,
    classLabel: account.classLabel,
    issuedAt: new Date().toISOString(),
  };
}

export async function toggleManagedAccountStatus(params: {
  account: UserProfile;
  nextStatus: 'Aktif' | 'Nonaktif';
  adminUid: string;
}): Promise<void> {
  const { account, nextStatus, adminUid } = params;
  if (account.uid === adminUid && nextStatus === 'Nonaktif') {
    throw new Error('Anda tidak dapat menonaktifkan akun Admin yang sedang aktif digunakan.');
  }
  await updateDoc(doc(db, 'users', account.docId || account.uid), {
    status: nextStatus,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteManagedAccount(params: {
  account: UserProfile;
  adminUid: string;
}): Promise<void> {
  const { account, adminUid } = params;
  const targetDocId = account.docId || account.uid;
  if (account.uid === adminUid || targetDocId === adminUid) {
    throw new Error('Anda tidak dapat menghapus akun Admin yang sedang login.');
  }

  try {
    const lookupKey = normalizeUsername(account.username);
    if (lookupKey) {
      await deleteDoc(doc(db, 'account_lookups', lookupKey)).catch(() => {});
    }
  } catch {
    // Ignore lookup deletion failure if already removed
  }

  if (account.linkedEntityId) {
    try {
      if (account.role === 'murid') {
        await updateDoc(doc(db, 'students', account.linkedEntityId), {
          ownerUid: adminUid,
          updatedAt: serverTimestamp(),
        });
      } else if (account.role === 'guru') {
        await updateDoc(doc(db, 'teachers', account.linkedEntityId), {
          ownerUid: adminUid,
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // Ignore if linked entity does not exist
    }
  }

  // Hapus dokumen utama pengguna berdasarkan docId aktual di Firestore
  await deleteDoc(doc(db, 'users', targetDocId));
  await deleteDoc(doc(db, 'login_card_credentials', targetDocId)).catch(() => {});

  // Bersihkan juga jika ada doc lain dengan uid atau username yang sama (misal sisa reset/duplikat)
  if (account.uid && account.uid !== targetDocId && account.uid !== adminUid) {
    await deleteDoc(doc(db, 'users', account.uid)).catch(() => {});
    await deleteDoc(doc(db, 'login_card_credentials', account.uid)).catch(() => {});
  }
  if (account.username) {
    try {
      const dupSnap = await getDocs(
        query(collection(db, 'users'), where('username', '==', account.username))
      );
      await Promise.all(
        dupSnap.docs
          .filter((d) => d.id !== adminUid && d.id !== targetDocId)
          .map((d) => deleteDoc(d.ref))
      );
    } catch {
      // Ignore duplicate sweep errors
    }
  }
}

function parseExcelRole(raw: string): UserRole | null {
  const val = raw.trim().toLowerCase();
  if (val === 'murid' || val === 'siswa' || val === 'warga belajar' || val === 'student') {
    return 'murid';
  }
  if (val === 'guru' || val === 'tutor' || val === 'teacher' || val === 'pengajar') {
    return 'guru';
  }
  if (val === 'kepala' || val === 'kepala pkbm' || val === 'kepala_pkbm' || val === 'headmaster') {
    return 'kepala_pkbm';
  }
  if (val === 'admin' || val === 'administrator' || val === 'operator') {
    return 'admin';
  }
  return null;
}

export async function parseAccountImportFile(params: {
  file: File;
  existingUsers: UserProfile[];
  students: Student[];
  teachers: Teacher[];
  classes: Classroom[];
}): Promise<AccountImportRowPreview[]> {
  const { file, existingUsers, students, teachers, classes } = params;
  const workbook = await readSpreadsheetWorkbook(file);
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('File Excel kosong atau tidak memiliki lembar kerja.');
  }
  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (rawRows.length === 0) {
    throw new Error('Tidak ditemukan baris data pada file Excel.');
  }

  const existingUsernames = new Set(existingUsers.map((u) => u.username.toLowerCase()));
  const seenInFile = new Set<string>();

  const results: AccountImportRowPreview[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNum = i + 2;

    // Normalize keys case-insensitively
    const normalizedMap: Record<string, string> = {};
    Object.entries(raw).forEach(([k, v]) => {
      normalizedMap[k.trim().toLowerCase()] = String(v ?? '').trim();
    });

    const name =
      normalizedMap['nama'] ||
      normalizedMap['nama lengkap'] ||
      normalizedMap['name'] ||
      '';
    const rawUsername =
      normalizedMap['username'] ||
      normalizedMap['nama pengguna'] ||
      normalizedMap['user'] ||
      '';
    const password =
      normalizedMap['password'] ||
      normalizedMap['kata sandi'] ||
      normalizedMap['sandi'] ||
      '';
    const rawRole =
      normalizedMap['role'] ||
      normalizedMap['peran'] ||
      normalizedMap['jabatan'] ||
      'murid';
    const kelas =
      normalizedMap['kelas'] ||
      normalizedMap['class'] ||
      normalizedMap['mapel'] ||
      normalizedMap['kelas/mapel'] ||
      '';

    const cleanUsername = rawUsername.trim().toLowerCase();
    const parsedRole = parseExcelRole(rawRole);

    const reasons: string[] = [];
    if (name.length < 2) reasons.push('Nama minimal 2 karakter');
    if (!rawUsername) {
      reasons.push('Username wajib diisi');
    } else if (/\s/.test(rawUsername) || rawUsername !== cleanUsername || !isValidUsernameFormat(cleanUsername)) {
      reasons.push('Username harus huruf kecil tanpa spasi (3-40 karakter: a-z, 0-9, . _ -)');
    } else if (existingUsernames.has(cleanUsername)) {
      reasons.push(`Username "${cleanUsername}" sudah ada`);
    } else if (seenInFile.has(cleanUsername)) {
      reasons.push(`Duplikat username "${cleanUsername}" di file`);
    }

    if (password.length < 6) {
      reasons.push('Password minimal 6 karakter');
    }

    if (!parsedRole) {
      reasons.push(`Role "${rawRole}" tidak dikenal (gunakan: guru, murid, kepala, admin)`);
    }

    let matchedEntityId: string | undefined;
    let nis: string | undefined;
    let nip: string | undefined;
    let resolvedClassLabel = kelas;

    if (parsedRole === 'murid') {
      const stu = students.find(
        (s) =>
          s.nis.toLowerCase() === cleanUsername ||
          s.fullName.toLowerCase() === name.toLowerCase()
      );
      if (stu) {
        matchedEntityId = stu.id;
        nis = stu.nis;
        if (!resolvedClassLabel) resolvedClassLabel = stu.className;
      } else if (kelas) {
        const clsMatch = classes.find((c) => c.name.toLowerCase() === kelas.toLowerCase());
        if (clsMatch) resolvedClassLabel = clsMatch.name;
      }
    } else if (parsedRole === 'guru') {
      const tch = teachers.find(
        (t) =>
          t.nip.toLowerCase() === cleanUsername ||
          t.fullName.toLowerCase() === name.toLowerCase()
      );
      if (tch) {
        matchedEntityId = tch.id;
        nip = tch.nip;
        if (!resolvedClassLabel) resolvedClassLabel = tch.specialization;
      }
    }

    if (cleanUsername) seenInFile.add(cleanUsername);

    results.push({
      rowNumber: rowNum,
      name,
      username: cleanUsername || rawUsername,
      password,
      rawRole,
      role: parsedRole || 'murid',
      kelas: resolvedClassLabel,
      matchedEntityId,
      nis,
      nip,
      valid: reasons.length === 0,
      reason: reasons.length > 0 ? reasons.join('; ') : undefined,
    });
  }

  return results;
}

export function downloadAccountImportTemplate(): void {
  const sampleRows = [
    {
      nama: 'Budi Santoso',
      username: '2026001',
      password: 'PasswordBudi2026!',
      role: 'murid',
      kelas: 'Paket C - Kelas 12 CIPANAS',
    },
    {
      nama: 'Siti Aminah, S.Pd.',
      username: 'siti.aminah',
      password: 'PasswordSiti2026!',
      role: 'guru',
      kelas: 'Bahasa Indonesia & Literasi',
    },
  ];
  const worksheet = XLSX.utils.json_to_sheet(sampleRows, {
    header: ['nama', 'username', 'password', 'role', 'kelas'],
  });
  worksheet['!cols'] = [
    { wch: 26 },
    { wch: 20 },
    { wch: 22 },
    { wch: 14 },
    { wch: 30 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Template Akun');
  XLSX.writeFile(workbook, 'template-import-akun-pkbm-annur-karisma.xlsx');
}
