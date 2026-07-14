/* ==========================================
   ABBQ Inventory - Auth Guard
   shared/auth-guard.js

   Include this near the top of <body> (after firebase +
   firebase-config.js scripts) on every page that requires
   login. It hides the page content until Firebase Auth
   confirms a logged-in session, otherwise redirects to
   the central login page.

   Before including this script, set:
     window.AUTH_GUARD_DEPTH = <number of folders deep from project root>
   e.g. root index.html -> 0, stock-opname/input.html -> 1

   After auth passes, window.CURRENT_ROLE is set to
   "admin" or "user", and a custom "authReady" event fires
   on document, in case a page wants to react (e.g. show
   admin-only controls).
========================================== */

"use strict";

(function () {
    var style = document.createElement("style");
    style.id = "auth-guard-hide";
    style.innerHTML = "body{visibility:hidden !important;}";
    document.head.appendChild(style);
})();

function _authGuardLoginPath() {
    var depth = window.AUTH_GUARD_DEPTH || 0;
    var prefix = "";
    for (var i = 0; i < depth; i++) prefix += "../";
    return prefix + "login.html";
}

document.addEventListener("DOMContentLoaded", function () {
    if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
    }

    firebase.auth().onAuthStateChanged(function (user) {
        if (!user) {
            var loginUrl = _authGuardLoginPath() + "?redirect=" + encodeURIComponent(window.location.pathname + window.location.search);
            window.location.href = loginUrl;
            return;
        }

        window.CURRENT_USER_EMAIL = user.email;

        // Legacy default (backward compatible): role from hardcoded admin
        // email, no outlet scoping. This is what everyone gets unless an
        // account profile has been explicitly set up via "Kelola Akun".
        window.CURRENT_ROLE = (user.email === ADMIN_EMAIL) ? "admin" : "user";
        window.CURRENT_OUTLET_ID = null;

        var hideStyle = document.getElementById("auth-guard-hide");
        if (hideStyle) hideStyle.remove();

        firebase.firestore().collection("accounts").doc(user.email).get()
            .then(function (doc) {
                if (doc.exists) {
                    var acct = doc.data();
                    if (acct.role === "admin" || acct.role === "user") window.CURRENT_ROLE = acct.role;
                    window.CURRENT_OUTLET_ID = acct.outletId || null;
                }
            })
            .catch(function () {
                // No accounts profile / offline / not permitted - keep legacy behavior above.
            })
            .then(function () {
                _injectUserBadge(user.email, window.CURRENT_ROLE);
                document.dispatchEvent(new CustomEvent("authReady", {
                    detail: { role: window.CURRENT_ROLE, email: user.email, outletId: window.CURRENT_OUTLET_ID }
                }));
            });
    });
});

/* ==========================================
   Floating badge: menampilkan email & role
   (Admin/User) yang sedang login, di semua
   halaman yang memuat auth-guard.js.
========================================== */
function _injectUserBadge(email, role) {
    if (document.getElementById("authUserBadge")) return;

    // Turunkan posisi badge kalau halaman index utama sudah punya
    // badge Business Date di pojok kanan atas, supaya tidak tumpuk.
    var hasBizDateBadge = !!document.querySelector(".biz-date-badge");
    var topOffset = hasBizDateBadge ? "62px" : "14px";

    var isAdmin = role === "admin";
    var roleLabel = isAdmin ? "Admin" : "User";
    var dotColor = isAdmin ? "#F2B400" : "#2E7D4F";

    var badge = document.createElement("div");
    badge.id = "authUserBadge";
    badge.title = email;
    badge.style.cssText = [
        "position:fixed", "top:" + topOffset, "right:14px", "z-index:9999",
        "display:flex", "align-items:center", "gap:6px",
        "max-width:min(62vw,320px)",
        "background:rgba(28,27,25,.92)", "color:#fff",
        "font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
        "font-size:11px", "font-weight:600", "line-height:1.2",
        "padding:6px 12px", "border-radius:999px",
        "box-shadow:0 2px 8px rgba(0,0,0,.18)",
        "pointer-events:none"
    ].join(";");

    var dot = document.createElement("span");
    dot.style.cssText = "width:7px;height:7px;border-radius:50%;flex:none;background:" + dotColor + ";";

    var text = document.createElement("span");
    text.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    text.textContent = roleLabel;

    badge.appendChild(dot);
    badge.appendChild(text);
    document.body.appendChild(badge);
}

async function authGuardLogout() {
    await firebase.auth().signOut();
    window.location.href = _authGuardLoginPath();
}
