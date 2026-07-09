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
        window.CURRENT_ROLE = (user.email === ADMIN_EMAIL) ? "admin" : "user";

        var hideStyle = document.getElementById("auth-guard-hide");
        if (hideStyle) hideStyle.remove();

        document.dispatchEvent(new CustomEvent("authReady", {
            detail: { role: window.CURRENT_ROLE, email: user.email }
        }));
    });
});

async function authGuardLogout() {
    await firebase.auth().signOut();
    window.location.href = _authGuardLoginPath();
}
