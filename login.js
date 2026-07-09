"use strict";

document.addEventListener("DOMContentLoaded", () => {
    if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
    }

    // If already logged in, skip straight to the redirect target.
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            goToRedirect();
        }
    });

    document.getElementById("loginPass").addEventListener("keydown", (e) => {
        if (e.key === "Enter") attemptLogin();
    });
});

function goToRedirect() {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect");
    window.location.href = redirect ? redirect : "index.html";
}

async function attemptLogin() {
    const user = document.getElementById("loginUser").value.trim().toLowerCase();
    const pass = document.getElementById("loginPass").value;
    const errorEl = document.getElementById("loginError");
    errorEl.style.display = "none";

    let email;
    if (user === "admin") {
        email = ADMIN_EMAIL;
    } else if (user === "user") {
        email = USER_EMAIL;
    } else {
        errorEl.textContent = "Username atau password salah.";
        errorEl.style.display = "block";
        return;
    }

    try {
        await firebase.auth().signInWithEmailAndPassword(email, pass);
        goToRedirect();
    } catch (err) {
        console.error("Login gagal:", err);
        errorEl.textContent = "Username atau password salah.";
        errorEl.style.display = "block";
    }
}
