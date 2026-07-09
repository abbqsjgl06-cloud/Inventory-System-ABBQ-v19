"use strict";

// Firebase project config for ABBQ Inventory (project: abbq-system)
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD9JVAat1VbAkM6H6Q6RFR3ANucgY_Njgc",
  authDomain: "abbq-system.firebaseapp.com",
  projectId: "abbq-system",
  storageBucket: "abbq-system.firebasestorage.app",
  messagingSenderId: "445156682295",
  appId: "1:445156682295:web:ee2d8a05a5e5cfbb26edb2",
  measurementId: "G-JW5CD557E3"
};

// Fixed internal "emails" used for the two app accounts.
// The person types username "admin" or "user" in the UI; this maps
// it to the actual Firebase Auth account created in the console.
const ADMIN_EMAIL = "admin@abbq-system.local";
const USER_EMAIL = "user@abbq-system.local";

// Kept for backward compatibility with older code that referenced this name.
const MASTER_DATA_ADMIN_EMAIL = ADMIN_EMAIL;
