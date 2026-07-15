/**
 * ABBQ Inventory - Cloud Functions
 * functions/index.js
 *
 * Handles the operations that MUST run with admin privileges and can't
 * be done safely from the browser:
 *   - createOutletAccount   -> create a new Firebase Auth login + set its
 *                              role/outlet in one step (replaces doing
 *                              this manually in the Firebase Console)
 *   - setAccountClaims      -> (re)assign role/outlet on an EXISTING login
 *   - resetAccountPassword  -> change the password of ANY account (this is
 *                              the one thing that's flat out impossible
 *                              from client-side Firebase Auth)
 *
 * These write "custom claims" (role + outletId) onto the Firebase Auth
 * user. Firestore Security Rules read those claims directly from the
 * user's login token (request.auth.token.role / .outletId) - that's what
 * actually LOCKS data per outlet server-side, not just in the app's UI.
 *
 * ---------------------------------------------------------------------
 * ONE-TIME SETUP (run these from your project folder, the one that has
 * index.html / firebase.json - ask if you're not sure):
 *
 *   1. npm install -g firebase-tools        (skip if already installed)
 *   2. firebase login
 *   3. firebase init functions
 *        - "Use an existing project" -> pick abbq-system
 *        - Language: JavaScript
 *        - ESLint: your choice (No is fine)
 *        - When it asks to overwrite functions/index.js: choose NO
 *          (so it keeps this file)
 *        - Install dependencies now: Yes
 *   4. Make sure the project is on the Blaze (pay-as-you-go) plan -
 *      Cloud Functions require it, but usage at this scale (a handful
 *      of admin actions per week) stays within the free monthly quota,
 *      so realistically $0/month:
 *      https://console.firebase.google.com/project/_/usage/details
 *   5. firebase deploy --only functions
 *
 * After deploying, the "Kelola Akun" page will automatically start
 * using these functions (it already has the calling code wired up).
 * ---------------------------------------------------------------------
 */

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
admin.initializeApp();

// Bootstrap admin - hardcoded on purpose. This is what lets the very
// first admin claim get set (before any custom claims exist yet, this
// is the only way to prove "I'm the admin").
const SUPER_ADMIN_EMAIL = "admin@abbq-system.local";

function assertIsAdmin(context) {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Anda harus login.");
    }
    const isBootstrapAdmin = context.auth.token.email === SUPER_ADMIN_EMAIL;
    const isClaimedAdmin = context.auth.token.role === "admin";
    if (!isBootstrapAdmin && !isClaimedAdmin) {
        throw new functions.https.HttpsError("permission-denied", "Hanya akun Admin yang boleh melakukan ini.");
    }
}

function normalizeRoleOutlet(data) {
    const role = data.role === "admin" ? "admin" : "user";
    const outletId = role === "admin" ? "" : String(data.outletId || "").trim();
    return { role, outletId };
}

/**
 * Create a brand-new Firebase Auth login (email + password) AND set its
 * role/outletId custom claims in one step.
 */
exports.createOutletAccount = functions.https.onCall(async (data, context) => {
    assertIsAdmin(context);

    const email = String(data.email || "").trim().toLowerCase();
    const password = String(data.password || "");
    const { role, outletId } = normalizeRoleOutlet(data);

    if (!email || !email.includes("@")) {
        throw new functions.https.HttpsError("invalid-argument", "Isi email yang valid.");
    }
    if (password.length < 6) {
        throw new functions.https.HttpsError("invalid-argument", "Password minimal 6 karakter.");
    }
    if (role === "user" && !outletId) {
        throw new functions.https.HttpsError("invalid-argument", "Pilih outlet untuk akun bertipe User.");
    }

    let userRecord;
    try {
        userRecord = await admin.auth().createUser({ email, password });
    } catch (e) {
        if (e.code === "auth/email-already-exists") {
            throw new functions.https.HttpsError(
                "already-exists",
                "Email ini sudah terdaftar. Gunakan 'Simpan Akun' untuk mengubah role/outlet-nya, atau 'Reset Password Akun Lain' untuk menggantinya."
            );
        }
        throw new functions.https.HttpsError("internal", "Gagal membuat akun: " + e.message);
    }

    await admin.auth().setCustomUserClaims(userRecord.uid, { role, outletId });

    return { ok: true, uid: userRecord.uid };
});

/**
 * (Re)assign role/outletId custom claims on an EXISTING Firebase Auth
 * account. Call this whenever "Kelola Akun" saves an account row.
 */
exports.setAccountClaims = functions.https.onCall(async (data, context) => {
    assertIsAdmin(context);

    const email = String(data.email || "").trim().toLowerCase();
    const { role, outletId } = normalizeRoleOutlet(data);

    if (!email) throw new functions.https.HttpsError("invalid-argument", "Email wajib diisi.");
    if (role === "user" && !outletId) {
        throw new functions.https.HttpsError("invalid-argument", "Pilih outlet untuk akun bertipe User.");
    }

    let userRecord;
    try {
        userRecord = await admin.auth().getUserByEmail(email);
    } catch (e) {
        throw new functions.https.HttpsError(
            "not-found",
            "Login untuk email ini belum ada di Firebase Authentication. Buat dulu lewat 'Buat Akun Baru' di halaman ini, atau lewat Firebase Console."
        );
    }

    await admin.auth().setCustomUserClaims(userRecord.uid, { role, outletId });

    return { ok: true, uid: userRecord.uid };
});

/**
 * Reset the password of ANY existing account. Admin-only. This is the
 * one thing that genuinely can't be done from the browser SDK.
 */
exports.resetAccountPassword = functions.https.onCall(async (data, context) => {
    assertIsAdmin(context);

    const email = String(data.email || "").trim().toLowerCase();
    const newPassword = String(data.newPassword || "");

    if (!email) throw new functions.https.HttpsError("invalid-argument", "Email wajib diisi.");
    if (newPassword.length < 6) throw new functions.https.HttpsError("invalid-argument", "Password baru minimal 6 karakter.");

    let userRecord;
    try {
        userRecord = await admin.auth().getUserByEmail(email);
    } catch (e) {
        throw new functions.https.HttpsError("not-found", "Akun dengan email ini tidak ditemukan di Firebase Authentication.");
    }

    await admin.auth().updateUser(userRecord.uid, { password: newPassword });

    return { ok: true };
});
