/* ==========================================
   ABBQ Inventory - Shared Database (Cloud / Firestore edition)
   inv-db.js

   This keeps the EXACT same function names as the old
   IndexedDB-based version, so goods-receipt, transfer,
   usage-import, variance-report, and master-data did not
   need to change their calling code at all.

   Requires, loaded BEFORE this file on the page:
     - firebase-app-compat.js
     - firebase-firestore-compat.js
     - firebase-auth-compat.js (only needed on pages using auth)
     - shared/firebase-config.js  (defines FIREBASE_CONFIG)

   Collections mirror the old IndexedDB store names:
     materials, menus, bom, goodsReceipt, transfer,
     usageImports, usageDetail, settings, eodSnapshots

   (Stock Opname & Waste Tracker keep their own separate
   local storage for now and are only READ from here.)
========================================== */

"use strict";

const InvDB = (() => {

    // Doc-id field per collection. Collections not listed here
    // (currently: bom, usageDetail) get an auto-generated "id"
    // field attached automatically on first write.
    const KEY_PATHS = {
        materials: "code",
        menus: "menu_code",
        goodsReceipt: "id",
        transfer: "id",
        usageImports: "id",
        settings: "key",
        eodSnapshots: "id"
    };

    function keyPathFor(storeName) {
        return KEY_PATHS[storeName] || "id";
    }

    let firestoreInstance = null;

    function ensureFirebaseApp() {
        if (!firebase.apps.length) {
            firebase.initializeApp(FIREBASE_CONFIG);
        }
    }

    function fs() {
        if (!firestoreInstance) {
            ensureFirebaseApp();
            firestoreInstance = firebase.firestore();
            try {
                firestoreInstance.enablePersistence({ synchronizeTabs: true }).catch(() => {});
            } catch (e) { /* offline persistence not available - fine, just skip */ }
        }
        return firestoreInstance;
    }

    function col(storeName) {
        return fs().collection(storeName);
    }

    /* ======================================
       CORE CRUD (same signatures as before)
    ====================================== */

    async function getAll(storeName) {
        const snap = await col(storeName).get();
        return snap.docs.map(d => d.data());
    }

    async function get(storeName, key) {
        if (key === undefined || key === null) return null;
        const doc = await col(storeName).doc(String(key)).get();
        return doc.exists ? doc.data() : null;
    }

    async function put(storeName, value) {
        const kp = keyPathFor(storeName);
        let docId = value[kp];
        let data = value;

        if (docId === undefined || docId === null || docId === "") {
            docId = col(storeName).doc().id;
            data = { ...value, [kp]: docId };
        }

        await col(storeName).doc(String(docId)).set(data);
        return data;
    }

    async function bulkPut(storeName, values) {
        if (!values || values.length === 0) return;
        const kp = keyPathFor(storeName);
        const CHUNK = 400; // Firestore batch limit is 500 writes

        for (let i = 0; i < values.length; i += CHUNK) {
            const chunk = values.slice(i, i + CHUNK);
            const batch = fs().batch();

            chunk.forEach(v => {
                let docId = v[kp];
                let data = v;
                if (docId === undefined || docId === null || docId === "") {
                    docId = col(storeName).doc().id;
                    data = { ...v, [kp]: docId };
                }
                batch.set(col(storeName).doc(String(docId)), data);
            });

            await batch.commit();
        }
    }

    async function remove(storeName, key) {
        await col(storeName).doc(String(key)).delete();
    }

    async function clear(storeName) {
        const snap = await col(storeName).get();
        const docs = snap.docs;
        const CHUNK = 400;

        for (let i = 0; i < docs.length; i += CHUNK) {
            const batch = fs().batch();
            docs.slice(i, i + CHUNK).forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
    }

    async function getByIndex(storeName, indexName, value) {
        const snap = await col(storeName).where(indexName, "==", value).get();
        return snap.docs.map(d => d.data());
    }

    /* ======================================
       SETTINGS HELPERS
    ====================================== */

    async function getSetting(key, fallback = null) {
        const row = await get("settings", key);
        return row ? row.value : fallback;
    }

    async function setSetting(key, value) {
        return put("settings", { key, value });
    }

    /* ======================================
       SHARED MASTER SEED (callable from any module)
       Runs once ever now, since the database is shared
       across every outlet/device - whichever device opens
       the app first seeds it for everyone else.
    ====================================== */

    async function ensureMasterSeed() {
        const existingMaterials = await getAll("materials");
        const existingBom = await getAll("bom");
        const existingMenus = await getAll("menus");

        const seed = (typeof window !== "undefined" && window.SEED_DATA)
            ? window.SEED_DATA
            : { materials: [], bom: [], menus: [] };

        if (existingMaterials.length === 0 && seed.materials.length > 0) {
            await bulkPut("materials", seed.materials);
        }
        if (existingBom.length === 0 && seed.bom.length > 0) {
            await bulkPut("bom", seed.bom);
        }
        if (existingMenus.length === 0 && seed.menus.length > 0) {
            await bulkPut("menus", seed.menus);
        }

        return {
            materials: await getAll("materials"),
            bom: await getAll("bom"),
            menus: await getAll("menus")
        };
    }

    /* ======================================
       BUSINESS DATE & END OF DAY
       Now centralized - every outlet/device sees the same
       business date and EOD history.
    ====================================== */

    function todayStr() {
        return new Date().toISOString().slice(0, 10);
    }

    async function getBusinessDate() {
        const val = await getSetting("businessDate", null);
        if (val) return val;
        const t = todayStr();
        await setSetting("businessDate", t);
        return t;
    }

    async function setBusinessDate(dateStr) {
        return setSetting("businessDate", dateStr);
    }

    async function getLatestEodSnapshot() {
        const snapshots = await getAll("eodSnapshots");
        if (snapshots.length === 0) return null;
        return snapshots.sort((a, b) => b.date.localeCompare(a.date))[0];
    }

    async function getEodSnapshot(dateStr) {
        return get("eodSnapshots", dateStr);
    }

    async function closeBusinessDay(dateStr, endingByCode, note) {
        const snapshot = {
            id: dateStr,
            date: dateStr,
            closedAt: new Date().toISOString(),
            endingByCode: endingByCode || {},
            note: note || ""
        };
        await put("eodSnapshots", snapshot);

        const d = new Date(dateStr + "T00:00:00");
        d.setDate(d.getDate() + 1);
        const nextStr = d.toISOString().slice(0, 10);
        await setBusinessDate(nextStr);

        return nextStr;
    }

    async function reopenBusinessDay(dateStr) {
        await remove("eodSnapshots", dateStr);
        await setBusinessDate(dateStr);
    }

    /* ======================================
       AUTH HELPERS (used by Master Data login)
    ====================================== */

    async function signInAdmin(email, password) {
        ensureFirebaseApp();
        return firebase.auth().signInWithEmailAndPassword(email, password);
    }

    function isAdminSignedIn() {
        ensureFirebaseApp();
        return !!firebase.auth().currentUser;
    }

    function onAuthChange(callback) {
        ensureFirebaseApp();
        return firebase.auth().onAuthStateChanged(callback);
    }

    async function signOutAdmin() {
        ensureFirebaseApp();
        return firebase.auth().signOut();
    }

    /* ======================================
       ONE-TIME LEGACY MIGRATION
       Stock Opname used to live only in this device's
       localStorage ("historyStock"). The first time this
       runs on a given device/browser, it pushes whatever is
       there up to the shared Firestore "stockOpname"
       collection, then marks itself done so it never
       re-runs (and never re-uploads duplicates) on that device.
    ====================================== */

    async function migrateLegacyStockOpname() {
        if (typeof localStorage === "undefined") return { migrated: 0 };
        if (localStorage.getItem("historyStock_migrated") === "1") return { migrated: 0 };

        let legacy = [];
        try {
            legacy = JSON.parse(localStorage.getItem("historyStock")) || [];
        } catch (e) {
            legacy = [];
        }

        if (legacy.length === 0) {
            localStorage.setItem("historyStock_migrated", "1");
            return { migrated: 0 };
        }

        const normalized = legacy
            .filter(rec => rec && rec.id !== undefined && rec.id !== null)
            .map(rec => ({ ...rec, id: String(rec.id) }));

        await bulkPut("stockOpname", normalized);
        localStorage.setItem("historyStock_migrated", "1");

        return { migrated: normalized.length };
    }

    async function migrateLegacyWasteRecords() {
        if (typeof indexedDB === "undefined") return { migrated: 0 };
        if (localStorage.getItem("wasteRecords_migrated") === "1") return { migrated: 0 };

        let legacy = [];
        try {
            const legacyDb = await new Promise((resolve, reject) => {
                const req = indexedDB.open("ABBQ_WASTE_DB", 1);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
                req.onupgradeneeded = (e) => {
                    const d = e.target.result;
                    if (!d.objectStoreNames.contains("wasteRecords")) {
                        d.createObjectStore("wasteRecords", { keyPath: "id" });
                    }
                };
            });

            if (legacyDb.objectStoreNames.contains("wasteRecords")) {
                legacy = await new Promise((resolve, reject) => {
                    const tx = legacyDb.transaction("wasteRecords", "readonly");
                    const req = tx.objectStore("wasteRecords").getAll();
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = () => reject(req.error);
                });
            }
        } catch (e) {
            legacy = [];
        }

        if (legacy.length === 0) {
            localStorage.setItem("wasteRecords_migrated", "1");
            return { migrated: 0 };
        }

        // Migrate one at a time (not bulkPut/batch) since records may
        // contain large base64 photos - safer to isolate failures per record
        // rather than risk one oversized batch failing entirely.
        let count = 0;
        for (const rec of legacy) {
            try {
                await put("wasteRecords", rec);
                count++;
            } catch (e) {
                console.warn("Gagal migrasi 1 waste record (kemungkinan foto terlalu besar):", e);
            }
        }

        localStorage.setItem("wasteRecords_migrated", "1");
        return { migrated: count };
    }

    return {
        getAll, get, put, bulkPut, remove, clear, getByIndex,
        getSetting, setSetting, ensureMasterSeed,
        getBusinessDate, setBusinessDate, getLatestEodSnapshot, getEodSnapshot,
        closeBusinessDay, reopenBusinessDay,
        signInAdmin, isAdminSignedIn, onAuthChange, signOutAdmin,
        migrateLegacyStockOpname, migrateLegacyWasteRecords
    };

})();
