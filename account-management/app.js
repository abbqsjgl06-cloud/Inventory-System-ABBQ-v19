"use strict";

let OUTLETS = [];
let ACCOUNTS = [];

document.addEventListener("authReady", (e) => {
    document.getElementById("meEmail").textContent = e.detail.email;

    if (e.detail.role !== "admin") {
        document.getElementById("accessDenied").style.display = "block";
        document.getElementById("appContent").style.display = "none";
        return;
    }

    document.getElementById("accessDenied").style.display = "none";
    document.getElementById("appContent").style.display = "block";
    init();
});

async function init() {
    await Promise.all([loadOutlets(), loadAccounts()]);
    checkCloudFunctionsAvailable();
}

/* ==========================================
   CLOUD FUNCTIONS (opsional - baru aktif setelah di-deploy)
========================================== */

let CF_AVAILABLE = null; // null = belum dicek, true/false setelah dicek

function getFns() {
    return firebase.app().functions("us-central1");
}

async function checkCloudFunctionsAvailable() {
    // Tidak ada cara "ping" murni tanpa efek samping, jadi kita anggap
    // tersedia secara optimis dan baru turunkan status kalau pemanggilan
    // nyata gagal dengan error "not-found"/"internal" (khas fungsi belum
    // di-deploy). Ini menjaga tombol tetap bisa dicoba tanpa menunggu.
    CF_AVAILABLE = true;
}

function showCfStatus(elId, msg, isError) {
    const el = document.getElementById(elId);
    el.style.display = "block";
    el.style.background = isError ? "#FCEBE9" : "#EAF3FF";
    el.style.borderColor = isError ? "#F3C5BE" : "#BFDBFE";
    el.style.color = isError ? "#8C2A1E" : "#1C3D6B";
    el.textContent = msg;
}

function toggleNewAcctOutlet() {
    const isAdmin = document.getElementById("newAcctRole").value === "admin";
    document.getElementById("newAcctOutletWrap").style.display = isAdmin ? "none" : "";
}

async function createOutletAccount() {
    const email = document.getElementById("newAcctEmail").value.trim().toLowerCase();
    const password = document.getElementById("newAcctPassword").value;
    const role = document.getElementById("newAcctRole").value;
    const outletId = role === "admin" ? "" : document.getElementById("newAcctOutlet").value;
    const resultEl = document.getElementById("createResult");
    resultEl.innerHTML = "";

    if (!email || !email.includes("@")) { resultEl.innerHTML = `<span style="color:#c0392b;">Isi email yang valid.</span>`; return; }
    if (password.length < 6) { resultEl.innerHTML = `<span style="color:#c0392b;">Password minimal 6 karakter.</span>`; return; }
    if (role === "user" && !outletId) { resultEl.innerHTML = `<span style="color:#c0392b;">Pilih outlet untuk akun bertipe User.</span>`; return; }

    try {
        const fn = getFns().httpsCallable("createOutletAccount");
        await fn({ email, password, role, outletId });

        // Mirror ke Firestore juga supaya langsung tampil di tabel & dropdown
        await InvDB.put("accounts", { email, role, outletId: outletId || "", updatedAt: new Date().toISOString() });

        resultEl.innerHTML = `<span style="color:#1E7E34;">✓ Akun ${email} berhasil dibuat & siap dipakai login.</span>`;
        document.getElementById("newAcctEmail").value = "";
        document.getElementById("newAcctPassword").value = "";
        await loadAccounts();
        toast("✓ Akun baru dibuat", "success");
    } catch (err) {
        console.error(err);
        handleCfError(err, resultEl, "cfStatusCreate");
    }
}

async function resetAccountPassword() {
    const email = document.getElementById("resetAcctEmail").value;
    const newPassword = document.getElementById("resetAcctPassword").value;
    const resultEl = document.getElementById("resetResult");
    resultEl.innerHTML = "";

    if (!email) { resultEl.innerHTML = `<span style="color:#c0392b;">Pilih akun dulu.</span>`; return; }
    if (newPassword.length < 6) { resultEl.innerHTML = `<span style="color:#c0392b;">Password baru minimal 6 karakter.</span>`; return; }

    if (!await uiConfirm(`Reset password untuk ${email}?`)) return;

    try {
        const fn = getFns().httpsCallable("resetAccountPassword");
        await fn({ email, newPassword });

        resultEl.innerHTML = `<span style="color:#1E7E34;">✓ Password ${email} berhasil direset.</span>`;
        document.getElementById("resetAcctPassword").value = "";
        toast("✓ Password direset", "success");
    } catch (err) {
        console.error(err);
        handleCfError(err, resultEl, "cfStatusReset");
    }
}

function handleCfError(err, resultEl, statusElId) {
    // Fungsi belum di-deploy sama sekali - "not-found"/"internal" khas ini,
    // atau error jaringan langsung dari SDK Functions.
    if (err.code === "functions/not-found" || err.code === "not-found" && !err.message.includes("Login")) {
        showCfStatus(statusElId, "⚠ Cloud Functions belum terdeteksi/di-deploy. Pakai cara manual lewat Firebase Console di bawah untuk sementara.", true);
        resultEl.innerHTML = "";
        return;
    }
    resultEl.innerHTML = `<span style="color:#c0392b;">${err.message || "Gagal memproses permintaan."}</span>`;
}

/* ==========================================
   GANTI PASSWORD SENDIRI
========================================== */

async function changeMyPassword() {
    const cur = document.getElementById("curPass").value;
    const n1 = document.getElementById("newPass").value;
    const n2 = document.getElementById("newPass2").value;
    const resultEl = document.getElementById("passResult");
    resultEl.innerHTML = "";

    if (!cur || !n1 || !n2) {
        resultEl.innerHTML = `<span style="color:#c0392b;">Semua kolom wajib diisi.</span>`;
        return;
    }
    if (n1.length < 6) {
        resultEl.innerHTML = `<span style="color:#c0392b;">Password baru minimal 6 karakter.</span>`;
        return;
    }
    if (n1 !== n2) {
        resultEl.innerHTML = `<span style="color:#c0392b;">Konfirmasi password baru tidak cocok.</span>`;
        return;
    }

    try {
        const user = firebase.auth().currentUser;
        const cred = firebase.auth.EmailAuthProvider.credential(user.email, cur);
        await user.reauthenticateWithCredential(cred);
        await user.updatePassword(n1);

        resultEl.innerHTML = `<span style="color:#1E7E34;">✓ Password berhasil diganti.</span>`;
        document.getElementById("curPass").value = "";
        document.getElementById("newPass").value = "";
        document.getElementById("newPass2").value = "";
        toast("✓ Password berhasil diganti", "success");
    } catch (err) {
        console.error(err);
        let msg = "Gagal mengganti password.";
        if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") msg = "Password saat ini salah.";
        else if (err.code === "auth/too-many-requests") msg = "Terlalu banyak percobaan gagal. Coba lagi beberapa menit lagi.";
        else if (err.code === "auth/weak-password") msg = "Password baru terlalu lemah (minimal 6 karakter).";
        resultEl.innerHTML = `<span style="color:#c0392b;">${msg}</span>`;
    }
}

/* ==========================================
   KELOLA OUTLET
========================================== */

async function loadOutlets() {
    OUTLETS = await InvDB.getAll("outlets");
    OUTLETS.sort((a, b) => a.name.localeCompare(b.name));
    renderOutlets();
    populateOutletSelect();
}

function renderOutlets() {
    const body = document.getElementById("outletBody");
    if (OUTLETS.length === 0) {
        body.innerHTML = `<tr><td colspan="3" class="empty">Belum ada outlet. Tambahkan di atas.</td></tr>`;
        return;
    }
    body.innerHTML = OUTLETS.map(o => `
        <tr>
            <td><code>${o.id}</code></td>
            <td>${o.name}</td>
            <td><button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;" onclick="deleteOutlet('${o.id}')">Hapus</button></td>
        </tr>
    `).join("");
}

async function addOutlet() {
    const idRaw = document.getElementById("outletId").value.trim().toLowerCase();
    const id = idRaw.replace(/\s+/g, "-");
    const name = document.getElementById("outletName").value.trim();

    if (!id || !name) { toast("ID & Nama outlet wajib diisi", "error"); return; }
    if (OUTLETS.some(o => o.id === id)) { toast("ID outlet sudah dipakai", "error"); return; }

    await InvDB.put("outlets", { id, name, createdAt: new Date().toISOString() });
    document.getElementById("outletId").value = "";
    document.getElementById("outletName").value = "";
    await loadOutlets();
    toast("✓ Outlet ditambahkan", "success");
}

async function deleteOutlet(id) {
    const inUse = ACCOUNTS.some(a => a.outletId === id);
    const msg = inUse
        ? "Outlet ini masih dipakai oleh satu atau lebih akun. Tetap hapus? (Akun terkait tidak akan otomatis diperbarui.)"
        : "Hapus outlet ini?";
    if (!await uiConfirm(msg)) return;

    await InvDB.remove("outlets", id);
    await loadOutlets();
    toast("✓ Outlet dihapus", "success");
}

function populateOutletSelect() {
    const options = OUTLETS.length === 0
        ? `<option value="">— Belum ada outlet —</option>`
        : `<option value="">— (khusus role Admin) —</option>` + OUTLETS.map(o => `<option value="${o.id}">${o.name}</option>`).join("");

    ["acctOutlet", "newAcctOutlet"].forEach(id => {
        const sel = document.getElementById(id);
        const current = sel.value;
        sel.innerHTML = options;
        sel.value = current;
    });
}

/* ==========================================
   KELOLA AKUN (role & outlet)
========================================== */

async function loadAccounts() {
    ACCOUNTS = await InvDB.getAll("accounts");
    ACCOUNTS.sort((a, b) => a.email.localeCompare(b.email));
    renderAccounts();
    populateResetAccountSelect();
}

function populateResetAccountSelect() {
    const list = document.getElementById("resetAcctEmailList");
    const known = new Set(ACCOUNTS.map(a => a.email));
    known.add("admin@abbq-system.local");
    known.add("user@abbq-system.local");
    list.innerHTML = Array.from(known).map(email => `<option value="${email}"></option>`).join("");
}

function renderAccounts() {
    const body = document.getElementById("acctBody");
    if (ACCOUNTS.length === 0) {
        body.innerHTML = `<tr><td colspan="4" class="empty">Belum ada akun terdaftar di sini.</td></tr>`;
        return;
    }
    body.innerHTML = ACCOUNTS.map(a => {
        const outletObj = OUTLETS.find(o => o.id === a.outletId);
        const outletLabel = a.role === "admin" ? "— Semua Outlet —" : (outletObj ? outletObj.name : (a.outletId || "-"));
        const roleChip = a.role === "admin"
            ? `<span class="role-chip role-admin">Admin</span>`
            : `<span class="role-chip role-user">User</span>`;
        return `
            <tr>
                <td>${a.email}</td>
                <td>${roleChip}</td>
                <td>${outletLabel}</td>
                <td><button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;" onclick="deleteAccount('${a.email}')">Hapus</button></td>
            </tr>
        `;
    }).join("");
}

async function addAccount() {
    const email = document.getElementById("acctEmail").value.trim().toLowerCase();
    const role = document.getElementById("acctRole").value;
    const outletId = role === "admin" ? "" : document.getElementById("acctOutlet").value;

    if (!email || !email.includes("@")) { toast("Isi email yang valid", "error"); return; }
    if (role === "user" && !outletId) { toast("Pilih outlet untuk akun bertipe User", "error"); return; }

    await InvDB.put("accounts", {
        email, role, outletId: outletId || "",
        updatedAt: new Date().toISOString()
    });

    document.getElementById("acctEmail").value = "";
    await loadAccounts();

    // Best-effort: also lock this in server-side via custom claims, so
    // Firestore rules actually enforce it (not just the app's UI). If
    // Cloud Functions isn't deployed yet, this silently no-ops - the
    // client-side scoping from Fase 2 still works either way.
    try {
        const fn = getFns().httpsCallable("setAccountClaims");
        await fn({ email, role, outletId });
        toast("✓ Akun disimpan & dikunci di server (custom claims aktif)", "success");
    } catch (err) {
        console.warn("setAccountClaims belum aktif (Cloud Functions belum di-deploy?):", err.message);
        toast("✓ Akun disimpan. Pastikan login-nya sudah dibuat (Firebase Console / Buat Akun Baru).", "success");
    }
}

async function deleteAccount(email) {
    if (!await uiConfirm("Hapus pengaturan role/outlet akun ini?\n(Login Firebase Auth-nya TIDAK ikut terhapus — hanya pengaturan role/outlet di sini.)")) return;
    await InvDB.remove("accounts", email);
    await loadAccounts();
    toast("✓ Dihapus", "success");
}

function toast(msg, type = "success") {
    const el = document.getElementById("notif");
    el.className = "notif " + type;
    el.innerHTML = msg;
    el.style.display = "block";
    setTimeout(() => { el.style.display = "none"; }, 2500);
}
