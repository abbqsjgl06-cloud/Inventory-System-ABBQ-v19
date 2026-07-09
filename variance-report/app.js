"use strict";

let MATERIALS = [];
let STOCK_SESSIONS = [];
let USAGE_IMPORTS = [];
let RESULT_ROWS = [];
let CURRENT_FILTER = "all";
let OUTLET_NAME = "ABBQ Indonesia";
let BUSINESS_DATE = null;
let OPENING_EOD = null; // EOD snapshot for (selected periodStart - 1 day), if any
let OPENING_MODE = "manual"; // "auto" | "manual"

document.addEventListener("DOMContentLoaded", async () => {
    await InvDB.ensureMasterSeed();
    MATERIALS = await InvDB.getAll("materials");
    OUTLET_NAME = await InvDB.getSetting("outletName", "ABBQ Indonesia");

    await InvDB.migrateLegacyStockOpname();
    STOCK_SESSIONS = await InvDB.getAll("stockOpname");
    USAGE_IMPORTS = await InvDB.getAll("usageImports");

    BUSINESS_DATE = await InvDB.getBusinessDate();
    renderBizDate();

    const end = todayStr();
    const start = new Date();
    start.setDate(1); // default: start of current month
    document.getElementById("periodStart").value = start.toISOString().slice(0,10);
    document.getElementById("periodEnd").value = end;

    renderSessionLists();
    renderUsageList();
    await refreshOpeningForPeriod();
});

function todayStr(){
    return new Date().toISOString().slice(0,10);
}

function previousDateStr(dateStr){
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0,10);
}

/* ================= BUSINESS DATE ================= */

function renderBizDate(){
    const [y,m,d] = BUSINESS_DATE.split("-");
    document.getElementById("bizDateDisplay").textContent = `${d}/${m}/${y}`;
    document.getElementById("eodDateLabel").textContent = `${d}/${m}/${y}`;
    document.getElementById("manualBizDate").value = BUSINESS_DATE;
}

function toggleManualDateEdit(){
    const box = document.getElementById("manualDateEdit");
    box.style.display = box.style.display === "none" ? "block" : "none";
}

async function saveManualBizDate(){
    const val = document.getElementById("manualBizDate").value;
    if(!val){ toast("Pilih tanggal","error"); return; }
    await InvDB.setBusinessDate(val);
    BUSINESS_DATE = val;
    renderBizDate();
    document.getElementById("manualDateEdit").style.display = "none";
    toast("✓ Business date diperbarui","success");
}

/* ================= OPENING MODE (auto from EOD of the day before periodStart) ================= */

async function refreshOpeningForPeriod(){
    const periodStart = document.getElementById("periodStart").value;
    if(!periodStart){ OPENING_EOD = null; renderOpeningMode(); return; }

    const prevDate = previousDateStr(periodStart);
    OPENING_EOD = await InvDB.getEodSnapshot(prevDate);
    OPENING_MODE = OPENING_EOD ? "auto" : "manual";
    renderOpeningMode();
}

function renderOpeningMode(){
    const autoBox = document.getElementById("openingAutoBox");
    const manualBox = document.getElementById("openingManualBox");
    const backBtn = document.getElementById("backToAutoBtn");

    if(OPENING_MODE === "auto" && OPENING_EOD){
        autoBox.style.display = "block";
        manualBox.style.display = "none";
        const [y,m,d] = OPENING_EOD.date.split("-");
        document.getElementById("openingAutoDate").textContent = `${d}/${m}/${y}`;
        document.getElementById("openingAutoCount").textContent = Object.keys(OPENING_EOD.endingByCode).length;
    } else {
        autoBox.style.display = OPENING_EOD ? "block" : "none";
        manualBox.style.display = "block";
        backBtn.style.display = OPENING_EOD ? "inline-flex" : "none";
    }
}

function useManualOpening(){
    OPENING_MODE = "manual";
    renderOpeningMode();
}

function useAutoOpening(){
    OPENING_MODE = "auto";
    renderOpeningMode();
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

/* ================= SESSION LISTS ================= */

function renderSessionLists(){
    const sorted = [...STOCK_SESSIONS].sort((a,b) => {
        const da = a.tanggal || "";
        const db = b.tanggal || "";
        return db.localeCompare(da);
    });

    if(sorted.length === 0){
        const emptyMsg = `<div class="empty">Belum ada sesi Stock Opname. Silakan input dulu di modul Stock Opname.</div>`;
        document.getElementById("openingList").innerHTML = emptyMsg;
        document.getElementById("endingList").innerHTML = emptyMsg;
        return;
    }

    const html = (prefix) => sorted.map(s => `
        <label class="sess-item">
            <input type="checkbox" class="${prefix}-check" value="${s.id}">
            <div class="sess-meta">
                <b>${s.tanggal || "-"} · ${s.kategori || "-"}</b>
                <small>${s.type || ""} · ${s.waktuInput || ""} · PIC: ${s.pic || "-"} · ${(s.items||[]).length} item</small>
            </div>
        </label>
    `).join("");

    document.getElementById("openingList").innerHTML = html("opening");
    document.getElementById("endingList").innerHTML = html("ending");
}

function renderUsageList(){
    if(USAGE_IMPORTS.length === 0){
        document.getElementById("usageList").innerHTML =
            `<div class="empty">Belum ada data usage. Silakan upload dulu di modul Import Usage.</div>`;
        return;
    }
    const sorted = [...USAGE_IMPORTS].sort((a,b)=>b.dateImported.localeCompare(a.dateImported));
    document.getElementById("usageList").innerHTML = sorted.map(u => `
        <label class="sess-item">
            <input type="checkbox" class="usage-check" value="${u.id}">
            <div class="sess-meta">
                <b>${u.periodLabel}</b>
                <small>${u.filename} · ${u.rowCount} baris${u.periodStart ? ` · ${u.periodStart} s/d ${u.periodEnd}` : ""}</small>
            </div>
        </label>
    `).join("");
}

/* ================= CALCULATION ================= */

async function calculateVariance(){
    const endingIds = Array.from(document.querySelectorAll(".ending-check:checked")).map(el=>el.value);
    const usageIds = Array.from(document.querySelectorAll(".usage-check:checked")).map(el=>el.value);
    const periodStart = document.getElementById("periodStart").value;
    const periodEnd = document.getElementById("periodEnd").value;

    let opening;
    if(OPENING_MODE === "auto" && OPENING_EOD){
        opening = { ...OPENING_EOD.endingByCode };
    } else {
        const openingIds = Array.from(document.querySelectorAll(".opening-check:checked")).map(el=>el.value);
        if(openingIds.length === 0){ toast("Pilih minimal 1 sesi Opening Stock","error"); return; }
        opening = sumSessionsByCode(openingIds);
    }

    if(endingIds.length === 0){ toast("Pilih minimal 1 sesi Ending Stock","error"); return; }
    if(!periodStart || !periodEnd){ toast("Lengkapi periode tanggal","error"); return; }

    // 1. Ending stock (sum pcs_gr per kode across selected sessions)
    const ending = sumSessionsByCode(endingIds);

    // 2. Goods Receipt within period
    const allReceipts = await InvDB.getAll("goodsReceipt");
    const receiptsInRange = allReceipts.filter(r => r.date >= periodStart && r.date <= periodEnd);
    const inCK = sumByCode(receiptsInRange.filter(r=>r.source==="CK"));
    const inSupplier = sumByCode(receiptsInRange.filter(r=>r.source==="Supplier"));

    // 3. Transfer within period
    const allTransfers = await InvDB.getAll("transfer");
    const transfersInRange = allTransfers.filter(r => r.date >= periodStart && r.date <= periodEnd);
    const transferIn = sumByCode(transfersInRange.filter(r=>r.type==="IN"));
    const transferOut = sumByCode(transfersInRange.filter(r=>r.type==="OUT"));

    // 4. Waste within period (from waste-tracker DB)
    const wasteRecords = await getAllWasteRecords();
    const wasteInRange = wasteRecords.filter(r => r.date >= periodStart && r.date <= periodEnd);
    const waste = sumByCode(wasteInRange);

    // 5. Usage (selected imports)
    let usage = {};
    for(const impId of usageIds){
        const details = await InvDB.getByIndex("usageDetail", "importId", impId);
        details.forEach(d => {
            usage[d.material_code] = (usage[d.material_code] || 0) + d.qty;
        });
    }

    // 6. Build unified code list: master items first, then any orphan codes from transactions
    const codeSet = new Map();
    MATERIALS.forEach(m => codeSet.set(m.code, { code: m.code, name: m.name, uom: m.uom }));

    const orphanSources = [opening, ending, inCK, inSupplier, transferIn, transferOut, waste, usage];
    orphanSources.forEach(src => {
        Object.keys(src).forEach(code => {
            if(!codeSet.has(code)){
                codeSet.set(code, { code, name: "(Tidak ada di Master Data)", uom: "" });
            }
        });
    });

    RESULT_ROWS = Array.from(codeSet.values()).map(m => {
        const op = opening[m.code] || 0;
        const ck = inCK[m.code] || 0;
        const sup = inSupplier[m.code] || 0;
        const tin = transferIn[m.code] || 0;
        const tout = transferOut[m.code] || 0;
        const w = waste[m.code] || 0;
        const u = usage[m.code] || 0;
        const end = ending[m.code] || 0;
        const expected = op + ck + sup + tin - tout - w - u;
        const variance = end - expected;
        return {
            code: m.code, name: m.name, uom: m.uom,
            opening: op, inCK: ck, inSupplier: sup, transferIn: tin, transferOut: tout,
            waste: w, usage: u, expected, ending: end, variance
        };
    }).sort((a,b) => Math.abs(b.variance) - Math.abs(a.variance));

    document.getElementById("resultSection").style.display = "block";
    document.getElementById("sumTotalItems").textContent = RESULT_ROWS.length;
    document.getElementById("sumVarianceItems").textContent = RESULT_ROWS.filter(r => Math.abs(r.variance) > 0.001).length;

    renderTable();
    document.getElementById("resultSection").scrollIntoView({behavior:"smooth"});
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

/* ================= END OF DAY ================= */

async function closeEndOfDay(){
    if(RESULT_ROWS.length === 0){ toast("Hitung variance dulu sebelum tutup hari","error"); return; }

    if(!confirm(`Tutup business date ${BUSINESS_DATE}? Ending Stock hasil hitungan ini akan menjadi Opening Stock untuk hari berikutnya. Aksi ini bisa dibatalkan lagi lewat "Ubah Manual" bila diperlukan.`)) return;

    const endingByCode = {};
    RESULT_ROWS.forEach(r => {
        endingByCode[r.code] = r.ending;
    });

    const nextDate = await InvDB.closeBusinessDay(BUSINESS_DATE, endingByCode, "");

    BUSINESS_DATE = nextDate;
    await refreshOpeningForPeriod();

    renderBizDate();

    document.getElementById("resultSection").style.display = "none";
    RESULT_ROWS = [];

    toast(`✓ Hari ditutup. Business date sekarang: ${nextDate}`,"success");
    window.scrollTo({top:0, behavior:"smooth"});
}

function sumByCode(rows){
    const result = {};
    rows.forEach(r => {
        result[r.material_code || r.code] = (result[r.material_code || r.code] || 0) + Number(r.qty || 0);
    });
    return result;
}

/* ================= TABLE RENDER ================= */

function setFilter(f){
    CURRENT_FILTER = f;
    document.getElementById("showAll").classList.toggle("active", f==="all");
    document.getElementById("showVarOnly").classList.toggle("active", f==="variance");
    renderTable();
}

function renderTable(){
    const key = (document.getElementById("searchResult")?.value || "").toLowerCase();

    let rows = RESULT_ROWS.filter(r =>
        r.code.toLowerCase().includes(key) || (r.name||"").toLowerCase().includes(key)
    );

    if(CURRENT_FILTER === "variance"){
        rows = rows.filter(r => Math.abs(r.variance) > 0.001);
    }

    if(rows.length === 0){
        document.getElementById("resultBody").innerHTML =
            `<tr><td colspan="13" class="empty">Tidak ada data</td></tr>`;
        return;
    }

    document.getElementById("resultBody").innerHTML = rows.map(r => {
        const flag = Math.abs(r.variance) > 0.001 ? "row-flag" : "";
        const varClass = r.variance > 0.001 ? "pos" : (r.variance < -0.001 ? "neg" : "");
        return `
        <tr class="${flag}">
            <td>${r.code}</td>
            <td>${r.name}</td>
            <td>${r.uom}</td>
            <td class="num">${fmt(r.opening)}</td>
            <td class="num">${fmt(r.inCK)}</td>
            <td class="num">${fmt(r.inSupplier)}</td>
            <td class="num">${fmt(r.transferIn)}</td>
            <td class="num">${fmt(r.transferOut)}</td>
            <td class="num">${fmt(r.waste)}</td>
            <td class="num">${fmt(r.usage)}</td>
            <td class="num">${fmt(r.expected)}</td>
            <td class="num">${fmt(r.ending)}</td>
            <td class="num ${varClass}">${fmt(r.variance)}</td>
        </tr>`;
    }).join("");
}

function fmt(n){
    return Number(n).toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

/* ================= EXPORT ================= */

function exportExcel(){
    if(RESULT_ROWS.length === 0){ toast("Belum ada hasil untuk diexport","error"); return; }

    const header = ["Kode","Nama Item","UOM","Opening","In CK","In Supplier","Transfer In","Transfer Out","Waste","Usage","Expected Stock","Ending Stock (SO)","Variance"];
    const data = RESULT_ROWS.map(r => [
        r.code, r.name, r.uom, r.opening, r.inCK, r.inSupplier, r.transferIn, r.transferOut, r.waste, r.usage, r.expected, r.ending, r.variance
    ]);

    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Variance");

    const periodStart = document.getElementById("periodStart").value;
    const periodEnd = document.getElementById("periodEnd").value;
    const filename = `Variance_${OUTLET_NAME.replace(/\s+/g,"_")}_${periodStart}_${periodEnd}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast("✓ File diunduh","success");
}

function toast(msg, type="success"){
    const el = document.getElementById("notif");
    el.className = "notif " + type;
    el.innerHTML = msg;
    el.style.display = "block";
    setTimeout(()=>{ el.style.display = "none"; }, 2500);
}
