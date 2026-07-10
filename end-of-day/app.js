"use strict";

let TRACKED_BUSINESS_DATE = null; // the officially auto-advancing business date
let TARGET_DATE = null;           // the date currently shown/being closed (admin can change this)
let STOCK_SESSIONS = [];
let IS_ADMIN = false;

document.addEventListener("authReady", (e) => {
    IS_ADMIN = e.detail.role === "admin";
    const box = document.getElementById("adminDateEditBox");
    if(box) box.style.display = IS_ADMIN ? "block" : "none";
});

document.addEventListener("DOMContentLoaded", async () => {
    try {
        TRACKED_BUSINESS_DATE = await InvDB.getBusinessDate();
        TARGET_DATE = TRACKED_BUSINESS_DATE;
        document.getElementById("targetDateInput").value = TARGET_DATE;
        renderBizDate();

        await InvDB.migrateLegacyStockOpname();
        STOCK_SESSIONS = await InvDB.getAll("stockOpname");

        renderEndingSessionList();
        await renderChecklist();
        await renderEodHistory();
    } catch(err){
        console.error("Gagal memuat End of Day:", err);
        toast("Gagal memuat data. Coba refresh halaman.", "error");
    }
});

function renderBizDate(){
    const [y,m,d] = TARGET_DATE.split("-");
    document.getElementById("bizDateDisplay").textContent = `${d}/${m}/${y}`;
}

async function applyTargetDate(){
    const val = document.getElementById("targetDateInput").value;
    if(!val){ toast("Pilih tanggal","error"); return; }
    TARGET_DATE = val;
    renderBizDate();
    renderEndingSessionList();
    await renderChecklist();
    toast(`✓ Checklist dimuat untuk tanggal ${val}`,"success");
}

/* ================= WASTE (now centralized via Firestore "wasteRecords") ================= */

async function getAllWasteRecords(){
    try {
        await InvDB.migrateLegacyWasteRecords();
        return await InvDB.getAll("wasteRecords");
    } catch(err){
        console.warn("Gagal memuat data waste:", err);
        return [];
    }
}

/* ================= CHECKLIST ================= */

async function renderChecklist(){
    const box = document.getElementById("checklistBox");

    // 1. Stock Opname for the target date
    const soSessions = STOCK_SESSIONS.filter(s => s.tanggal === TARGET_DATE);

    // 2. Waste (optional)
    const wasteRecords = await getAllWasteRecords();
    const wasteToday = wasteRecords.filter(r => r.date === TARGET_DATE);

    // 3. Goods Receipt (optional)
    const goodsToday = await InvDB.getByIndex("goodsReceipt", "date", TARGET_DATE);

    // 4. Transfer (optional)
    const transferToday = await InvDB.getByIndex("transfer", "date", TARGET_DATE);

    // 5. Usage Import covering the target date
    const allImports = await InvDB.getAll("usageImports");
    const usageToday = allImports.filter(u => u.periodStart && u.periodEnd && TARGET_DATE >= u.periodStart && TARGET_DATE <= u.periodEnd);

    const items = [
        {
            title: "Stock Opname",
            required: true,
            ok: soSessions.length > 0,
            desc: soSessions.length > 0
                ? `${soSessions.length} sesi ditemukan untuk ${TARGET_DATE}`
                : `Belum ada Stock Opname untuk ${TARGET_DATE}`
        },
        {
            title: "Waste Tracker",
            required: false,
            ok: true, // optional - never blocks
            desc: wasteToday.length > 0
                ? `${wasteToday.length} entri waste tercatat hari ini`
                : `Tidak ada waste tercatat hari ini (dianggap tidak ada waste)`
        },
        {
            title: "Barang Masuk",
            required: false,
            ok: true,
            desc: goodsToday.length > 0
                ? `${goodsToday.length} baris barang masuk hari ini`
                : `Tidak ada barang masuk tercatat hari ini`
        },
        {
            title: "Transfer Stock",
            required: false,
            ok: true,
            desc: transferToday.length > 0
                ? `${transferToday.length} baris transfer hari ini`
                : `Tidak ada transfer tercatat hari ini`
        },
        {
            title: "Import Usage",
            required: true,
            ok: usageToday.length > 0,
            desc: usageToday.length > 0
                ? `Tercakup dalam ${usageToday.length} import (${usageToday.map(u=>u.periodLabel).join(", ")})`
                : `Belum ada data usage yang mencakup tanggal ${TARGET_DATE}`
        }
    ];

    box.innerHTML = items.map(item => `
        <div class="checklist-item">
            <div class="cl-icon ${item.ok ? 'ok' : 'warn'}">${item.ok ? '✓' : '!'}</div>
            <div class="cl-body">
                <div class="cl-title">${item.title} ${!item.required ? '<span class="cl-optional">bila ada</span>' : ''}</div>
                <div class="cl-desc">${item.desc}</div>
            </div>
        </div>
    `).join("");

    window._checklistBlocking = items.filter(i => i.required && !i.ok);
}

/* ================= ENDING STOCK SESSION LIST ================= */

function renderEndingSessionList(){
    const sorted = [...STOCK_SESSIONS].sort((a,b) => (b.tanggal||"").localeCompare(a.tanggal||""));

    if(sorted.length === 0){
        document.getElementById("endingList").innerHTML =
            `<div class="empty">Belum ada sesi Stock Opname sama sekali.</div>`;
        return;
    }

    document.getElementById("endingList").innerHTML = sorted.map(s => `
        <label class="sess-item">
            <input type="checkbox" class="ending-check" value="${s.id}" ${s.tanggal === TARGET_DATE ? "checked" : ""}>
            <div class="sess-meta">
                <b>${s.tanggal || "-"} · ${s.kategori || "-"}</b>
                <small>${s.type || ""} · ${s.waktuInput || ""} · PIC: ${s.pic || "-"} · ${(s.items||[]).length} item</small>
            </div>
        </label>
    `).join("");
}

function sumSessionsByCode(ids){
    const result = {};
    ids.forEach(id => {
        const session = STOCK_SESSIONS.find(s => String(s.id) === String(id));
        if(!session) return;
        (session.items || []).forEach(item => {
            const qty = Number(item.pcs_gr) || 0;
            result[item.kode] = (result[item.kode] || 0) + qty;
        });
    });
    return result;
}

/* ================= CLOSE DAY ================= */

async function closeToday(){
    const endingIds = Array.from(document.querySelectorAll(".ending-check:checked")).map(el=>el.value);

    if(endingIds.length === 0){
        toast("Pilih minimal 1 sesi Stock Opname sebagai Ending hari ini","error");
        return;
    }

    const blocking = window._checklistBlocking || [];
    if(blocking.length > 0){
        const names = blocking.map(b=>b.title).join(", ");
        if(!confirm(`Checklist berikut belum lengkap: ${names}.\n\nTetap lanjutkan tutup tanggal ${TARGET_DATE}?`)) return;
    } else {
        if(!confirm(`Tutup business date ${TARGET_DATE}?`)) return;
    }

    const endingByCode = sumSessionsByCode(endingIds);
    const newTracked = await InvDB.closeBusinessDay(TARGET_DATE, endingByCode, "", endingIds);

    toast(`✓ Tanggal ${TARGET_DATE} ditutup. Business date sekarang: ${newTracked}`,"success");

    TRACKED_BUSINESS_DATE = newTracked;
    TARGET_DATE = newTracked;
    document.getElementById("targetDateInput").value = TARGET_DATE;
    renderBizDate();
    renderEndingSessionList();
    await renderChecklist();
    await renderEodHistory();
    window.scrollTo({top:0, behavior:"smooth"});
}

/* ================= HISTORY ================= */

async function renderEodHistory(){
    const snapshots = await InvDB.getAll("eodSnapshots");
    const sorted = snapshots.sort((a,b)=>b.date.localeCompare(a.date));

    if(sorted.length === 0){
        document.getElementById("historyBody").innerHTML =
            `<tr><td colspan="3" class="empty">Belum ada riwayat penutupan hari</td></tr>`;
        return;
    }

    document.getElementById("historyBody").innerHTML = sorted.map(s => `
        <tr>
            <td>${s.date}</td>
            <td>${new Date(s.closedAt).toLocaleString("id-ID")}</td>
            <td class="num">${Object.keys(s.endingByCode||{}).length}</td>
        </tr>
    `).join("");
}

function toast(msg, type="success"){
    const el = document.getElementById("notif");
    el.className = "notif " + type;
    el.innerHTML = msg;
    el.style.display = "block";
    setTimeout(()=>{ el.style.display = "none"; }, 2500);
}
