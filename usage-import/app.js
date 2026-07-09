"use strict";

let BOM_ROWS = [];
let MENUS = [];
let PARSED_ROWS = [];
let SALES_BY_MENU = {};
let USAGE_RESULT = {};   // material_code -> qty
let UNMATCHED_MENUS = new Set();
let DATE_MIN = null, DATE_MAX = null;
let ALL_IMPORTS = [];

document.addEventListener("DOMContentLoaded", async () => {
    await InvDB.ensureMasterSeed();
    BOM_ROWS = await InvDB.getAll("bom");
    MENUS = await InvDB.getAll("menus");
    ALL_IMPORTS = await InvDB.getAll("usageImports");

    document.getElementById("periodLabel").value = defaultPeriodLabel();

    document.getElementById("fileInput").addEventListener("change", handleFile);
    renderImportHistory();
});

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

        if(dateKey && r[dateKey]){
            let d = r[dateKey];
            if(d instanceof Date){
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
    if(!confirm("Hapus riwayat import ini? Usage terkait akan dihapus dari laporan variance.")) return;
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
    const sorted = [...ALL_IMPORTS].sort((a,b)=>b.dateImported.localeCompare(a.dateImported));
    if(sorted.length === 0){
        document.getElementById("importHistoryBody").innerHTML =
            `<tr><td colspan="6" class="empty">Belum ada import</td></tr>`;
        return;
    }
    document.getElementById("importHistoryBody").innerHTML = sorted.map(h => `
        <tr>
            <td>${new Date(h.dateImported).toLocaleString("id-ID")}</td>
            <td>${h.periodLabel}${h.periodStart ? ` <br><small style="color:var(--muted);">${h.periodStart} s/d ${h.periodEnd}</small>` : ""}</td>
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
