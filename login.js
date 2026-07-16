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

    if(!user || !pass){
        errorEl.textContent = "Isi username dan password.";
        errorEl.style.display = "block";
        return;
    }

    // Username maps predictably to "<username>@abbq-system.local" - this
    // works for admin/user and any account created later via Kelola Akun
    // (storepilot1, storepilot2, dst) without needing code changes here.
    const email = user + "@abbq-system.local";

    try {
        await firebase.auth().signInWithEmailAndPassword(email, pass);
        goToRedirect();
    } catch (err) {
        console.error("Login gagal:", err);
        errorEl.textContent = "Username atau password salah.";
        errorEl.style.display = "block";
    }
}
