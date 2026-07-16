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
                if (window.CURRENT_ROLE === "admin") {
                    // Admin can temporarily "view as" a specific outlet.
                    // The choice is per-browser-tab (sessionStorage) and
                    // overrides CURRENT_OUTLET_ID for this session only.
                    var override = sessionStorage.getItem("adminOutletOverride");
                    if (override) window.CURRENT_OUTLET_ID = override;
                    return _injectOutletSwitcher(window.CURRENT_OUTLET_ID);
                }
            })
            .then(function () {
                _injectUserBadge(user.email, window.CURRENT_ROLE, window.CURRENT_OUTLET_ID);
                _startPresenceHeartbeat(user.email, window.CURRENT_ROLE);
                _watchPresenceCount(user.email);
                if (typeof window.initChatWidget === "function") {
                    window.initChatWidget(user.email, window.CURRENT_ROLE, window.CURRENT_OUTLET_ID);
                }
                document.dispatchEvent(new CustomEvent("authReady", {
                    detail: { role: window.CURRENT_ROLE, email: user.email, outletId: window.CURRENT_OUTLET_ID }
                }));
            });
    });
});

/* ==========================================
   Admin outlet switcher: dropdown untuk admin
   memilih "lihat sebagai outlet mana". Pilihan
   "Semua Outlet" (default) = tidak difilter sama
   sekali, admin lihat data gabungan semua outlet.
========================================== */
function _injectOutletSwitcher(currentOutletId) {
    return firebase.firestore().collection("outlets").get()
        .then(function (snap) {
            if (document.getElementById("outletSwitcher")) return;

            var outlets = [];
            snap.forEach(function (d) { outlets.push(d.data()); });
            if (outlets.length === 0) return; // no outlets configured yet

            var hasBizDateBadge = !!document.querySelector(".biz-date-badge");
            var topOffset = hasBizDateBadge ? "62px" : "14px";

            var wrap = document.createElement("div");
            wrap.id = "outletSwitcher";
            wrap.style.cssText = [
                "position:fixed", "top:" + topOffset, "left:14px", "z-index:9999",
                "font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif"
            ].join(";");

            var select = document.createElement("select");
            select.style.cssText = [
                "background:rgba(28,27,25,.92)", "color:#fff", "border:none",
                "border-radius:999px", "padding:6px 12px", "font-size:11px",
                "font-weight:600", "max-width:44vw"
            ].join(";");

            var allOpt = document.createElement("option");
            allOpt.value = "";
            allOpt.textContent = "🏬 Semua Outlet";
            select.appendChild(allOpt);

            outlets.forEach(function (o) {
                var opt = document.createElement("option");
                opt.value = o.id;
                opt.textContent = o.name || o.id;
                if (o.id === currentOutletId) opt.selected = true;
                select.appendChild(opt);
            });

            select.addEventListener("change", function () {
                if (select.value) {
                    sessionStorage.setItem("adminOutletOverride", select.value);
                } else {
                    sessionStorage.removeItem("adminOutletOverride");
                }
                window.location.reload();
            });

            wrap.appendChild(select);
            document.body.appendChild(wrap);
        })
        .catch(function () {
            // outlets collection not readable / not configured - skip silently
        });
}

/* ==========================================
   Floating badge: menampilkan email & role
   (Admin/User) yang sedang login, di semua
   halaman yang memuat auth-guard.js.
========================================== */
function _injectUserBadge(email, role, outletId) {
    if (document.getElementById("authUserBadge")) return;

    // Turunkan posisi badge kalau halaman index utama sudah punya
    // badge Business Date di pojok kanan atas, supaya tidak tumpuk.
    var hasBizDateBadge = !!document.querySelector(".biz-date-badge");
    var topOffset = hasBizDateBadge ? "62px" : "14px";

    var isAdmin = role === "admin";
    // Non-admin accounts show their account name (the part before @) so
    // it's clear which outlet/person is logged in - e.g.
    // "sjgl@abbq-system.local" -> "SJGL". Admin badge stays generic.
    var roleLabel = isAdmin ? "Admin" : String(email).split("@")[0].toUpperCase();
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

    var textWrap = document.createElement("span");
    textWrap.style.cssText = "display:flex;flex-direction:column;line-height:1.2;overflow:hidden;";

    var text = document.createElement("span");
    text.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    text.textContent = roleLabel;

    var subText = document.createElement("span");
    subText.id = "authUserBadgeSub";
    subText.style.cssText = "font-size:9px;font-weight:500;opacity:.75;white-space:nowrap;";
    subText.textContent = "";

    textWrap.appendChild(text);
    textWrap.appendChild(subText);

    // Non-admin: tampilkan status outlet yang terdeteksi. Ini sengaja
    // dibuat MENCOLOK kalau belum di-set, karena kondisi ini persis yang
    // menyebabkan akun melihat data outlet lain (belum difilter sama
    // sekali karena tidak tahu harus filter ke outlet mana).
    if (!isAdmin) {
        var outletLine = document.createElement("span");
        outletLine.id = "authUserBadgeOutlet";
        outletLine.style.cssText = "font-size:9px;font-weight:700;white-space:nowrap;";
        if (outletId) {
            outletLine.style.opacity = ".85";
            outletLine.textContent = "🏬 " + outletId;
        } else {
            outletLine.style.color = "#FFD166";
            outletLine.textContent = "⚠ Outlet belum di-set";
        }
        textWrap.appendChild(outletLine);
    }

    badge.appendChild(dot);
    badge.appendChild(textWrap);
    document.body.appendChild(badge);
}

/* ==========================================
   Presence: menandai sesi ini "online" dan
   menghitung berapa sesi lain yang sedang
   login pakai akun (email) yang sama, lalu
   menampilkannya di bawah nama role pada badge.

   Pakai Firestore biasa (bukan Realtime DB):
   tiap tab/perangkat kirim "heartbeat" berkala
   ke koleksi `presence`. Sesi dianggap online
   kalau heartbeat terakhirnya dalam FRESH_MS
   detik terakhir - jadi kalau tab ditutup tanpa
   sempat logout, statusnya otomatis "hilang"
   dengan sendirinya setelah beberapa saat
   (tidak butuh cleanup manual).
========================================== */

var PRESENCE_FRESH_MS = 70 * 1000;      // dianggap online kalau heartbeat < 70 detik lalu
var PRESENCE_INTERVAL_MS = 25 * 1000;   // kirim heartbeat tiap 25 detik

function _presenceSessionId() {
    try {
        var id = sessionStorage.getItem("abbq_session_id");
        if (!id) {
            id = "s_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
            sessionStorage.setItem("abbq_session_id", id);
        }
        return id;
    } catch (e) {
        // sessionStorage unavailable (private mode dsb) - fall back to a
        // per-load id; presence just won't dedupe reloads perfectly.
        return "s_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
    }
}

function _startPresenceHeartbeat(email, role) {
    var sessionId = _presenceSessionId();

    function beat() {
        firebase.firestore().collection("presence").doc(sessionId).set({
            email: email,
            role: role,
            lastActive: Date.now()
        }).catch(function () { /* best effort - ignore offline/permission errors */ });
    }

    beat();
    setInterval(beat, PRESENCE_INTERVAL_MS);
}

function _watchPresenceCount(email) {
    var latestDocs = [];

    function render() {
        var now = Date.now();
        var onlineCount = latestDocs.filter(function (d) {
            return (now - (d.lastActive || 0)) < PRESENCE_FRESH_MS;
        }).length;
        // Selalu minimal 1 (sesi ini sendiri), jaga-jaga kalau listener
        // belum sempat menerima snapshot pertama.
        if (onlineCount < 1) onlineCount = 1;

        var subText = document.getElementById("authUserBadgeSub");
        if (subText) {
            subText.textContent = onlineCount === 1 ? "1 online" : onlineCount + " online";
        }
    }

    firebase.firestore().collection("presence").where("email", "==", email)
        .onSnapshot(function (snap) {
            latestDocs = snap.docs.map(function (d) { return d.data(); });
            render();
        }, function () { /* ignore listener errors (offline dsb) */ });

    // Snapshot events hanya terpicu saat ada perubahan data - re-render
    // berkala juga supaya sesi yang sudah basi (tab ditutup) otomatis
    // hilang dari hitungan walau tidak ada event baru.
    setInterval(render, 15 * 1000);
}

async function authGuardLogout() {
    await firebase.auth().signOut();
    window.location.href = _authGuardLoginPath();
}
