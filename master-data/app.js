"use strict";

let ALL_MATERIALS = [];
let ALL_MENUS = [];
let ALL_BOM = [];
let DETAIL_LOADED = false;

let IS_ADMIN = false;

document.addEventListener("authReady", (e) => {
    IS_ADMIN = e.detail.role === "admin";
    document.querySelectorAll(".admin-only").forEach(el => {
        el.style.display = IS_ADMIN ? "" : "none";
    });
    unlockApp();
});

function unlockApp(){
    document.getElementById("appContent").style.display = "block";

    document.getElementById("bomFileInput").addEventListener("change", handleBomFile);
    initTabs();
    init();
}

async function init(){
    try {
        await ensureSeed();
        await loadOutletName();
        await refreshAll();
    } catch(err){
        console.error("Gagal memuat master data:", err);
        toast("Gagal memuat data. Coba refresh halaman (Ctrl+Shift+R).", "error");
    }
}

function toggleDetail(){
    const section = document.getElementById("detailSection");
    const btn = document.getElementById("toggleDetailBtn");
    const showing = section.style.display !== "none";
    section.style.display = showing ? "none" : "block";
    btn.textContent = showing ? "Lihat Detail Item & BOM ▾" : "Sembunyikan Detail ▴";
    if(!showing) section.scrollIntoView({behavior:"smooth", block:"start"});
}

function initTabs(){
    document.querySelectorAll(".tab-btn").forEach(btn=>{
        btn.addEventListener("click", ()=>{
            document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
            document.querySelectorAll(".tab-panel").forEach(p=>p.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById("tab-"+btn.dataset.tab).classList.add("active");
        });
    });
}

async function ensureSeed(){
    await InvDB.ensureMasterSeed();
}

async function resetSeed(){
    if(!IS_ADMIN){ toast("Hanya Admin yang boleh mereset data master","error"); return; }
    if(!await uiConfirm("Reset seluruh Item & BOM ke data awal? Perubahan manual pada master akan hilang.")) return;
    await InvDB.clear("materials");
    await InvDB.clear("bom");
    await InvDB.clear("menus");
    await ensureSeed();
    await refreshAll();
    toast("✓ Data master direset", "success");
}

async function loadOutletName(){
    const name = await InvDB.getSetting("outletName", "ABBQ Indonesia");
    document.getElementById("outletName").value = name;
}

async function saveOutletName(){
    if(!IS_ADMIN){ toast("Hanya Admin yang boleh mengubah ini","error"); return; }
    const val = document.getElementById("outletName").value.trim();
    if(!val){ toast("Nama outlet tidak boleh kosong","error"); return; }
    await InvDB.setSetting("outletName", val);
    toast("✓ Nama outlet disimpan","success");
}

async function refreshAll(){
    ALL_MATERIALS = (await InvDB.getAll("materials")).sort((a,b)=>a.name.localeCompare(b.name));
    ALL_MENUS = (await InvDB.getAll("menus")).sort((a,b)=>a.menu_name.localeCompare(b.menu_name));
    ALL_BOM = await InvDB.getAll("bom");
    renderMaterials();
    renderMenus();
}

/* ================= MATERIALS ================= */

function renderMaterials(){
    const key = document.getElementById("searchMaterial").value.toLowerCase();
    const filtered = ALL_MATERIALS.filter(m =>
        m.code.toLowerCase().includes(key) || (m.name||"").toLowerCase().includes(key)
    );
    document.getElementById("materialCount").textContent = ALL_MATERIALS.length;

    if(filtered.length === 0){
        document.getElementById("materialsBody").innerHTML =
            `<tr><td colspan="5" class="empty">Tidak ada item ditemukan</td></tr>`;
        return;
    }

    document.getElementById("materialsBody").innerHTML = filtered.map(m => `
        <tr>
            <td>${m.code}</td>
            <td>${m.name || ""}</td>
            <td>${m.uom || ""}</td>
            <td class="num">${m.konv ?? ""}</td>
            <td>
                ${IS_ADMIN ? `
                <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;width:auto;"
                    onclick="editMaterial('${m.code}')">Edit</button>
                <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;width:auto;color:#C23B2E;"
                    onclick="deleteMaterial('${m.code}')">Hapus</button>
                ` : ""}
            </td>
        </tr>
    `).join("");
}

function editMaterial(code){
    if(!IS_ADMIN){ toast("Hanya Admin yang boleh mengedit","error"); return; }
    const m = ALL_MATERIALS.find(x=>x.code===code);
    if(!m) return;
    document.getElementById("matCode").value = m.code;
    document.getElementById("matName").value = m.name;
    document.getElementById("matUom").value = m.uom;
    document.getElementById("matKonv").value = m.konv;
    document.getElementById("matCode").scrollIntoView({behavior:"smooth", block:"center"});
}

async function deleteMaterial(code){
    if(!IS_ADMIN){ toast("Hanya Admin yang boleh menghapus","error"); return; }
    const m = ALL_MATERIALS.find(x=>x.code===code);
    if(!m) return;
    if(!await uiConfirm(`Hapus item "${m.name}" (kode ${code})? Item ini tidak akan muncul lagi di dropdown Waste Tracker, Barang Masuk, Transfer, dll. Data transaksi lama yang sudah memakai item ini tidak akan terhapus.`)) return;

    try {
        await InvDB.remove("materials", code);
        await refreshAll();
        toast("✓ Item dihapus","success");
    } catch(err){
        console.error("Gagal hapus item:", err);
        toast("Gagal hapus item. Cek koneksi internet.","error");
    }
}

function resetMaterialForm(){
    document.getElementById("matCode").value = "";
    document.getElementById("matName").value = "";
    document.getElementById("matUom").value = "";
    document.getElementById("matKonv").value = "";
}

async function saveMaterial(){
    if(!IS_ADMIN){ toast("Hanya Admin yang boleh menambah/mengedit item","error"); return; }
    const code = document.getElementById("matCode").value.trim();
    const name = document.getElementById("matName").value.trim();
    const uom = document.getElementById("matUom").value.trim();
    const konv = Number(document.getElementById("matKonv").value) || 1;

    if(!code || !name || !uom){
        toast("Lengkapi kode, nama, dan UOM","error");
        return;
    }

    await InvDB.put("materials", { code, name, uom, konv });
    resetMaterialForm();
    await refreshAll();
    toast("✓ Item tersimpan","success");
}

/* ================= BOM / MENU ================= */

function renderMenus(){
    const key = document.getElementById("searchMenu").value.toLowerCase();
    const filtered = ALL_MENUS.filter(m =>
        m.menu_code.toLowerCase().includes(key) || (m.menu_name||"").toLowerCase().includes(key)
    );
    document.getElementById("menuCount").textContent = ALL_MENUS.length;

    if(filtered.length === 0){
        document.getElementById("menuList").innerHTML = `<div class="empty">Tidak ada menu ditemukan</div>`;
        return;
    }

    document.getElementById("menuList").innerHTML = filtered.map(m => {
        const rows = ALL_BOM.filter(b => b.menu_code === m.menu_code);
        return `
        <div class="panel">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
                <div>
                    <div style="font-weight:700;font-size:14px;">${m.menu_name}</div>
                    <div style="font-size:12px;color:var(--muted);">Kode ${m.menu_code} · ${m.category || "-"}</div>
                </div>
                <span class="chip">${rows.length} bahan</span>
            </div>
            <div class="table-wrap">
                <table>
                    <thead><tr><th>Kode Bahan</th><th>Nama Bahan</th><th class="num">Qty/Porsi</th><th>UOM</th></tr></thead>
                    <tbody>
                        ${rows.map(r=>`
                            <tr>
                                <td>${r.material_code}</td>
                                <td>${r.material_name}</td>
                                <td class="num">${r.qty_per_portion}</td>
                                <td>${r.uom}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        </div>`;
    }).join("");
}

/* ================= NOTIF ================= */

function toast(msg, type="success"){
    const el = document.getElementById("notif");
    el.className = "notif " + type;
    el.innerHTML = msg;
    el.style.display = "block";
    setTimeout(()=>{ el.style.display = "none"; }, 2500);
}

/* ================= BOM EXCEL IMPORT ================= */

let PENDING_BOM_IMPORT = null;

function handleBomFile(e){
    if(!IS_ADMIN){ toast("Hanya Admin yang boleh upload BOM","error"); return; }
    const file = e.target.files[0];
    if(!file) return;
    document.getElementById("bomFileName").textContent = file.name;

    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const data = new Uint8Array(evt.target.result);
            const wb = XLSX.read(data, { type: "array" });
            processBomWorkbook(wb);
        } catch(err){
            console.error(err);
            toast("Gagal membaca file. Pastikan format .xlsx/.xls","error");
        }
    };
    reader.readAsArrayBuffer(file);
}

function findSheetName(wb, candidates){
    const names = wb.SheetNames;
    for(const c of candidates){
        const found = names.find(n => n.trim().toLowerCase() === c.toLowerCase());
        if(found) return found;
    }
    return null;
}

async function processBomWorkbook(wb){
    const salesSheetName = findSheetName(wb, ["Sales", "Sales dan Waste", "Sales Dan Waste"]) || wb.SheetNames[0];
    const bomSheetName = findSheetName(wb, ["BOM"]) || wb.SheetNames[1] || wb.SheetNames[0];

    const salesSheet = wb.Sheets[salesSheetName];
    const bomSheet = wb.Sheets[bomSheetName];

    const salesRows = XLSX.utils.sheet_to_json(salesSheet, { defval: "", header: 1 });
    const bomRows = XLSX.utils.sheet_to_json(bomSheet, { defval: "", header: 1 });

    // Menus from "Sales dan Waste": col A = menu code, col B = menu name
    const menus = [];
    salesRows.slice(1).forEach(row => {
        const code = row[0];
        const name = row[1];
        if(code === "" || code === undefined || code === null) return;
        menus.push({ menu_code: String(code).trim(), menu_name: String(name || "").trim() });
    });

    // BOM sheet: col A menu code, B menu name, C material code, D material name, E qty, F uom
    // Header may span a couple of rows before data starts; find first row where col C is numeric/non-empty and col A too.
    const bomParsed = [];
    bomRows.forEach(row => {
        const menuCode = row[0], menuName = row[1], matCode = row[2], matName = row[3], qty = row[4], uom = row[5];
        if(menuCode === "" || menuCode === undefined || menuCode === null) return;
        if(matCode === "" || matCode === undefined || matCode === null) return;
        // skip header-like rows
        if(String(menuCode).toLowerCase().includes("nomor material")) return;
        bomParsed.push({
            menu_code: String(menuCode).trim(),
            menu_name: String(menuName || "").trim(),
            category: null,
            material_code: String(matCode).trim(),
            material_name: String(matName || "").trim(),
            qty_per_portion: Number(qty) || 0,
            uom: String(uom || "").trim()
        });
    });

    if(bomParsed.length === 0){
        toast("Tidak ada baris BOM valid ditemukan di file ini","error");
        return;
    }

    // Build updated materials list: merge with existing (preserve konv)
    const existingMaterials = await InvDB.getAll("materials");
    const existingMap = new Map(existingMaterials.map(m => [m.code, m]));

    const materialsFromBom = new Map();
    bomParsed.forEach(r => {
        if(!materialsFromBom.has(r.material_code)){
            materialsFromBom.set(r.material_code, { code: r.material_code, name: r.material_name, uom: r.uom });
        }
    });

    let newCount = 0, updatedCount = 0;
    const finalMaterials = new Map(existingMap);
    materialsFromBom.forEach((m, code) => {
        if(finalMaterials.has(code)){
            const old = finalMaterials.get(code);
            finalMaterials.set(code, { ...old, name: m.name || old.name, uom: m.uom || old.uom });
            updatedCount++;
        } else {
            finalMaterials.set(code, { code, name: m.name, uom: m.uom, konv: 1 });
            newCount++;
        }
    });

    PENDING_BOM_IMPORT = {
        menus,
        bom: bomParsed,
        materials: Array.from(finalMaterials.values())
    };

    document.getElementById("bomPrevMenus").textContent = menus.length;
    document.getElementById("bomPrevRows").textContent = bomParsed.length;
    document.getElementById("bomPrevNewItems").textContent = newCount;
    document.getElementById("bomPrevUpdatedItems").textContent = updatedCount;
    document.getElementById("bomPreview").style.display = "block";
}

async function confirmBomImport(){
    if(!IS_ADMIN){ toast("Hanya Admin yang boleh update BOM","error"); return; }
    if(!PENDING_BOM_IMPORT){ toast("Belum ada file yang diproses","error"); return; }
    if(!await uiConfirm("Update Master Data (Item & BOM) dengan file ini? Data BOM & daftar menu lama akan digantikan.")) return;

    await InvDB.clear("bom");
    await InvDB.clear("menus");
    await InvDB.bulkPut("bom", PENDING_BOM_IMPORT.bom);
    await InvDB.bulkPut("menus", PENDING_BOM_IMPORT.menus);
    await InvDB.bulkPut("materials", PENDING_BOM_IMPORT.materials);

    PENDING_BOM_IMPORT = null;
    document.getElementById("bomPreview").style.display = "none";
    document.getElementById("bomFileInput").value = "";
    document.getElementById("bomFileName").textContent = "";

    await refreshAll();
    toast("✓ Master Data berhasil diperbarui","success");
}
