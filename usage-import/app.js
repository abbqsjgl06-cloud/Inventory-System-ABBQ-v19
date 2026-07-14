"use strict";

let BOM_ROWS = [];
let MENUS = [];
let PARSED_ROWS = [];
let SALES_BY_MENU = {};
let USAGE_RESULT = {};   // material_code -> qty
let UNMATCHED_MENUS = new Set();
let DATE_MIN = null, DATE_MAX = null;
let ALL_IMPORTS = [];
let HISTORY_FILTER_APPLIED = false;

document.addEventListener("DOMContentLoaded", async () => {
    await InvDB.ensureMasterSeed();
    BOM_ROWS = await InvDB.getAll("bom");
    MENUS = await InvDB.getAll("menus");
    ALL_IMPORTS = await InvDB.getAll("usageImports");

    document.getElementById("periodLabel").value = defaultPeriodLabel();

    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    document.getElementById("histFilterStart").value = start.toISOString().slice(0,10);
    document.getElementById("histFilterEnd").value = end.toISOString().slice(0,10);

    document.getElementById("fileInput").addEventListener("change", handleFile);
    renderHistoryPrompt();
});

function applyHistoryFilter(){
    HISTORY_FILTER_APPLIED = true;
    renderImportHistory();
}

function renderHistoryPrompt(){
    document.getElementById("importHistoryBody").innerHTML =
        `<tr><td colspan="6" class="empty">Pilih rentang tanggal lalu klik "Tampilkan Riwayat"</td></tr>`;
}

function defaultPeriodLabel(){
    const d = new Date();
    return d.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

function handleFile(e){
    const file = e.target.files[0];
    if(!file) return;
    document.getElementById("fileName").textContent = file.name;

    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const data = new Uint8Array(evt.target.result);
            const wb = XLSX.read(data, { type: "array", cellDates: true });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
            PARSED_ROWS = rows;
            processRows(rows, file.name);
        } catch(err){
            console.error(err);
            toast("Gagal membaca file. Pastikan format .xlsx/.xls/.csv","error");
        }
    };
    reader.readAsArrayBuffer(file);
}

function findKey(row, candidates){
    const keys = Object.keys(row);
    for(const c of candidates){
        const found = keys.find(k => k.trim().toLowerCase() === c.toLowerCase());
        if(found) return found;
    }
    return null;
}

function parseFlexibleDate(value){
    if(value === null || value === undefined || value === "") return null;

    if(value instanceof Date && !isNaN(value)) return value;

    if(typeof value === "number"){
        // Excel serial date number
        try {
            const parsed = XLSX.SSF.parse_date_code(value);
            if(parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
        } catch(e){ /* fall through */ }
    }

    if(typeof value === "string"){
        const s = value.trim();

        // YYYY-MM-DD or YYYY/MM/DD
        let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
        if(m) return new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));

        // DD-MM-YYYY or DD/MM/YYYY (Indonesian format)
        m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
        if(m) return new Date(Date.UTC(+m[3], +m[2]-1, +m[1]));

        // Fallback to native parsing
        const native = new Date(s);
        if(!isNaN(native)) return native;
    }

    return null;
}

function processRows(rows, filename){
    if(rows.length === 0){
        toast("File kosong","error");
        return;
    }

    const codeKey = findKey(rows[0], ["Code","Kode"]);
    const qtyKey = findKey(rows[0], ["Qty","Quantity"]);
    const dateKey = findKey(rows[0], ["Date","Tanggal"]);

    if(!codeKey || !qtyKey){
        toast("Kolom 'Code' dan 'Qty' tidak ditemukan di file","error");
        return;
    }

    SALES_BY_MENU = {};
    DATE_MIN = null; DATE_MAX = null;

    rows.forEach(r => {
        const code = String(r[codeKey]).trim();
        const qty = Number(r[qtyKey]) || 0;
        if(!code) return;
        SALES_BY_MENU[code] = (SALES_BY_MENU[code] || 0) + qty;

        if(dateKey && r[dateKey] !== "" && r[dateKey] !== undefined && r[dateKey] !== null){
            const d = parseFlexibleDate(r[dateKey]);
            if(d){
                if(!DATE_MIN || d < DATE_MIN) DATE_MIN = d;
                if(!DATE_MAX || d > DATE_MAX) DATE_MAX = d;
            }
        }
    });

    // translate to material usage via BOM
    USAGE_RESULT = {};
    UNMATCHED_MENUS = new Set();

    const bomByMenu = {};
    BOM_ROWS.forEach(b => {
        if(!bomByMenu[b.menu_code]) bomByMenu[b.menu_code] = [];
        bomByMenu[b.menu_code].push(b);
    });

    Object.keys(SALES_BY_MENU).forEach(menuCode => {
        const qtySold = SALES_BY_MENU[menuCode];
        const bomLines = bomByMenu[menuCode];
        if(!bomLines){
            UNMATCHED_MENUS.add(menuCode);
            return;
        }
        bomLines.forEach(line => {
            const usage = qtySold * Number(line.qty_per_portion || 0);
            USAGE_RESULT[line.material_code] = (USAGE_RESULT[line.material_code] || 0) + usage;
        });
    });

    document.getElementById("rowsRead").textContent = rows.length;
    document.getElementById("menuUnik").textContent = Object.keys(SALES_BY_MENU).length;
    document.getElementById("menuMatched").textContent = Object.keys(SALES_BY_MENU).length - UNMATCHED_MENUS.size;
    document.getElementById("menuUnmatched").textContent = UNMATCHED_MENUS.size;
    document.getElementById("previewBox").style.display = "block";

    const dateWarning = document.getElementById("dateWarning");
    if(dateWarning){
        if(!dateKey){
            dateWarning.style.display = "block";
            dateWarning.textContent = "⚠ Kolom tanggal tidak ditemukan di file. Periode akan disimpan tanpa rentang tanggal otomatis (isi manual di 'Nama Periode' saja).";
        } else if(!DATE_MIN || !DATE_MAX){
            dateWarning.style.display = "block";
            dateWarning.textContent = "⚠ Kolom tanggal ditemukan tapi formatnya tidak terbaca. Coba format tanggal YYYY-MM-DD atau DD/MM/YYYY di file Excel-nya.";
        } else {
            dateWarning.style.display = "none";
        }
    }

    window._pendingFilename = filename;
}

async function confirmImport(){
    const periodLabel = document.getElementById("periodLabel").value.trim() || defaultPeriodLabel();
    const importId = "usg_" + Date.now();

    const header = {
        id: importId,
        filename: window._pendingFilename || "upload.xlsx",
        periodLabel,
        dateImported: new Date().toISOString(),
        periodStart: DATE_MIN ? DATE_MIN.toISOString().slice(0,10) : null,
        periodEnd: DATE_MAX ? DATE_MAX.toISOString().slice(0,10) : null,
        rowCount: PARSED_ROWS.length,
        unmatchedCount: UNMATCHED_MENUS.size,
        unmatchedMenus: Array.from(UNMATCHED_MENUS)
    };

    await InvDB.put("usageImports", header);

    const details = Object.entries(USAGE_RESULT).map(([material_code, qty]) => ({
        importId, material_code, qty
    }));
    await InvDB.bulkPut("usageDetail", details);

    ALL_IMPORTS.push(header);
    document.getElementById("previewBox").style.display = "none";
    document.getElementById("fileInput").value = "";
    document.getElementById("fileName").textContent = "";

    renderImportHistory();
    toast("✓ Usage berhasil disimpan (" + details.length + " item bahan baku)", "success");
}

async function deleteImport(id){
    if(!await uiConfirm("Hapus riwayat import ini? Usage terkait akan dihapus dari laporan variance.")) return;
    await InvDB.remove("usageImports", id);
    const details = await InvDB.getByIndex("usageDetail", "importId", id);
    for(const d of details){
        await InvDB.remove("usageDetail", d.id);
    }
    ALL_IMPORTS = ALL_IMPORTS.filter(i => i.id !== id);
    renderImportHistory();
    toast("✓ Dihapus","success");
}

function renderImportHistory(){
    if(!HISTORY_FILTER_APPLIED){ renderHistoryPrompt(); return; }

    const startEl = document.getElementById("histFilterStart");
    const endEl = document.getElementById("histFilterEnd");
    const start = startEl ? startEl.value : "";
    const end = endEl ? endEl.value : "";

    const filtered = ALL_IMPORTS.filter(h => {
        if(!start && !end) return true;
        // Prefer the detected data date range; fall back to upload date if not detected.
        const rangeStart = h.periodStart || (h.dateImported ? h.dateImported.slice(0,10) : null);
        const rangeEnd = h.periodEnd || (h.dateImported ? h.dateImported.slice(0,10) : null);
        if(!rangeStart || !rangeEnd) return true;
        if(start && rangeEnd < start) return false;
        if(end && rangeStart > end) return false;
        return true;
    });

    const sorted = [...filtered].sort((a,b)=>b.dateImported.localeCompare(a.dateImported));
    if(sorted.length === 0){
        document.getElementById("importHistoryBody").innerHTML =
            `<tr><td colspan="6" class="empty">${ALL_IMPORTS.length === 0 ? "Belum ada import" : "Tidak ada riwayat pada rentang tanggal ini"}</td></tr>`;
        return;
    }
    document.getElementById("importHistoryBody").innerHTML = sorted.map(h => `
        <tr>
            <td><b>${h.periodStart ? `${h.periodStart} s/d ${h.periodEnd}` : ""}</b>${!h.periodStart ? `<span style="color:#C23B2E;">Tidak terdeteksi</span>` : ""}</td>
            <td>${h.periodLabel}</td>
            <td>${new Date(h.dateImported).toLocaleString("id-ID")}</td>
            <td>${h.filename}</td>
            <td class="num">${h.rowCount}</td>
            <td class="num">${h.unmatchedCount || 0}</td>
            <td>
                <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;width:auto;"
                    onclick="deleteImport('${h.id}')">Hapus</button>
            </td>
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

/* ================= ADMIN: TEMPLATE DOWNLOAD ================= */

document.addEventListener("authReady", (e) => {
    const box = document.getElementById("adminToolsBox");
    if(box) box.style.display = (e.detail.role === "admin") ? "block" : "none";
});

function downloadTemplate(){
    const header = ["Date","Code","Desc","Major","Family","Qty","Discount","Net Sales","RVC","Order Type"];
    const sampleMenu = MENUS[0] || { menu_code: "1111001", menu_name: "Contoh Menu" };
    const today = new Date().toISOString().slice(0,10);
    const sample1 = [today, sampleMenu.menu_code, sampleMenu.menu_name, "", "", 5, 0, 0, "", "Dine In"];
    const sample2 = [today, sampleMenu.menu_code, sampleMenu.menu_name, "", "", 3, 0, 0, "", "Take Away"];

    const ws = XLSX.utils.aoa_to_sheet([header, sample1, sample2]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template Usage");
    XLSX.writeFile(wb, "Template_Import_Usage.xlsx");
}

/* ================= ADMIN: MENU TANPA BOM ================= */

async function showMenusWithoutBom(){
    const bomMenuCodes = new Set(BOM_ROWS.map(b => b.menu_code));
    const missing = MENUS.filter(m => !bomMenuCodes.has(m.menu_code));

    const box = document.getElementById("noBomResult");
    box.style.display = "block";

    if(missing.length === 0){
        box.innerHTML = `<p style="font-size:13px;color:var(--good);">✓ Semua menu sudah punya BOM.</p>`;
        return;
    }

    box.innerHTML = `
        <p style="font-size:13px;color:var(--muted);margin-bottom:10px;">${missing.length} menu belum punya BOM:</p>
        <div class="table-wrap">
            <table>
                <thead><tr><th>Kode Menu</th><th>Nama Menu</th></tr></thead>
                <tbody>
                    ${missing.map(m => `<tr><td>${m.menu_code}</td><td>${m.menu_name}</td></tr>`).join("")}
                </tbody>
            </table>
        </div>
    `;
}
