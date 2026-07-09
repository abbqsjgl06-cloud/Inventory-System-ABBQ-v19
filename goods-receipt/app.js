"use strict";

let MATERIALS = [];
let SELECTED_ITEM = null;
let ALL_RECEIPTS = [];
let MATERIALS_LOADED = false;

document.addEventListener("DOMContentLoaded", () => {
    // Always run first, synchronously - never blocked by data loading.
    document.getElementById("rcvDate").value = today();

    const end = today();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    document.getElementById("filterStart").value = start.toISOString().slice(0,10);
    document.getElementById("filterEnd").value = end;

    initAutocomplete();
    renderHistory();

    loadData();
});

async function loadData(){
    try {
        await InvDB.ensureMasterSeed();
        MATERIALS = (await InvDB.getAll("materials")).sort((a,b)=>a.name.localeCompare(b.name));
        ALL_RECEIPTS = await InvDB.getAll("goodsReceipt");
        MATERIALS_LOADED = true;
        renderHistory();
    } catch(err){
        console.error("Gagal memuat data master:", err);
        toast("Gagal memuat daftar item. Coba refresh halaman (Ctrl+Shift+R).", "error");
    }
}

function today(){
    return new Date().toISOString().slice(0,10);
}

function initAutocomplete(){
    const input = document.getElementById("itemSearch");
    const list = document.getElementById("suggestList");

    function render(){
        if(!MATERIALS_LOADED){
            list.innerHTML = `<div class="suggest-item" style="cursor:default;color:var(--muted);">Memuat daftar item...</div>`;
            list.style.display = "block";
            return;
        }

        const key = input.value.trim().toLowerCase();
        const matches = (key
            ? MATERIALS.filter(m => m.code.toLowerCase().includes(key) || (m.name||"").toLowerCase().includes(key))
            : MATERIALS
        ).slice(0, 30);

        if(matches.length === 0){
            list.innerHTML = `<div class="suggest-item" style="cursor:default;color:var(--muted);">Item tidak ditemukan</div>`;
            list.style.display = "block";
            return;
        }

        list.innerHTML = matches.map(m => `
            <div class="suggest-item" data-code="${m.code}">
                ${m.name}
                <small>Kode ${m.code} · ${m.uom}</small>
            </div>
        `).join("");
        list.style.display = "block";

        list.querySelectorAll(".suggest-item[data-code]").forEach(el=>{
            el.addEventListener("click", () => {
                const m = MATERIALS.find(x=>x.code===el.dataset.code);
                SELECTED_ITEM = m;
                input.value = `${m.code} - ${m.name}`;
                document.getElementById("rcvUom").value = m.uom;
                list.style.display = "none";
            });
        });
    }

    input.addEventListener("focus", render);
    input.addEventListener("click", render);
    input.addEventListener("input", () => {
        SELECTED_ITEM = null;
        document.getElementById("rcvUom").value = "";
        render();
    });

    document.addEventListener("click", (e)=>{
        if(!list.contains(e.target) && e.target !== input){
            list.style.display = "none";
        }
    });
}

let STAGING = [];

function addToStaging(){
    const qty = Number(document.getElementById("rcvQty").value);

    if(!SELECTED_ITEM){ toast("Pilih item dari daftar suggestion","error"); return; }
    if(!qty || qty <= 0){ toast("Qty harus lebih dari 0","error"); return; }

    STAGING.push({
        material_code: SELECTED_ITEM.code,
        material_name: SELECTED_ITEM.name,
        qty,
        uom: SELECTED_ITEM.uom
    });

    document.getElementById("itemSearch").value = "";
    document.getElementById("rcvUom").value = "";
    document.getElementById("rcvQty").value = "";
    SELECTED_ITEM = null;
    document.getElementById("itemSearch").focus();

    renderStaging();
}

function removeFromStaging(index){
    STAGING.splice(index, 1);
    renderStaging();
}

function renderStaging(){
    const panel = document.getElementById("stagingPanel");
    if(STAGING.length === 0){
        panel.style.display = "none";
        return;
    }
    panel.style.display = "block";
    document.getElementById("saveStagingBtn").textContent = `💾 Simpan Semua ke Riwayat (${STAGING.length} item)`;
    document.getElementById("stagingBody").innerHTML = STAGING.map((s, i) => `
        <tr>
            <td>${s.material_code}</td>
            <td>${s.material_name}</td>
            <td class="num">${s.qty}</td>
            <td>${s.uom}</td>
            <td>
                <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;width:auto;"
                    onclick="removeFromStaging(${i})">Hapus</button>
            </td>
        </tr>
    `).join("");
}

async function saveAllStaging(){
    if(STAGING.length === 0){ toast("Daftar item masih kosong","error"); return; }

    const date = document.getElementById("rcvDate").value;
    const source = document.getElementById("rcvSource").value;
    const note = document.getElementById("rcvNote").value.trim();

    if(!date){ toast("Pilih tanggal","error"); return; }

    const now = new Date().toISOString();
    const records = STAGING.map((s, i) => ({
        id: "gr_" + Date.now() + "_" + i + "_" + Math.random().toString(36).slice(2,5),
        date,
        source,
        material_code: s.material_code,
        material_name: s.material_name,
        qty: s.qty,
        uom: s.uom,
        note,
        createdAt: now
    }));

    for(const r of records){
        await InvDB.put("goodsReceipt", r);
    }
    ALL_RECEIPTS.push(...records);

    const count = STAGING.length;
    STAGING = [];
    renderStaging();
    document.getElementById("rcvNote").value = "";

    renderHistory();
    toast(`✓ ${count} item berhasil disimpan ke riwayat`,"success");
}

async function deleteReceipt(id){
    if(!confirm("Hapus entri ini?")) return;
    await InvDB.remove("goodsReceipt", id);
    ALL_RECEIPTS = ALL_RECEIPTS.filter(r=>r.id!==id);
    renderHistory();
    toast("✓ Dihapus","success");
}

function renderHistory(){
    const start = document.getElementById("filterStart").value;
    const end = document.getElementById("filterEnd").value;

    const filtered = ALL_RECEIPTS
        .filter(r => (!start || r.date >= start) && (!end || r.date <= end))
        .sort((a,b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

    document.getElementById("sumRows").textContent = filtered.length;
    document.getElementById("sumItems").textContent = new Set(filtered.map(r=>r.material_code)).size;
    document.getElementById("checkAll").checked = false;
    updateSelectedCount();

    if(filtered.length === 0){
        document.getElementById("historyBody").innerHTML =
            `<tr><td colspan="8" class="empty">Belum ada data pada rentang ini</td></tr>`;
        return;
    }

    document.getElementById("historyBody").innerHTML = filtered.map(r => `
        <tr>
            <td><input type="checkbox" class="row-check" value="${r.id}" onchange="updateSelectedCount()"></td>
            <td>${r.date}</td>
            <td><span class="chip">${r.source === "CK" ? "In CK" : "In Supplier"}</span></td>
            <td>${r.material_code}</td>
            <td>${r.material_name}</td>
            <td class="num">${r.qty}</td>
            <td>${r.uom}</td>
            <td>
                <button class="btn btn-ghost" style="padding:6px 10px;font-size:12px;width:auto;"
                    onclick="deleteReceipt('${r.id}')">Hapus</button>
            </td>
        </tr>
    `).join("");
}

function toggleCheckAll(checkbox){
    document.querySelectorAll(".row-check").forEach(el => el.checked = checkbox.checked);
    updateSelectedCount();
}

function updateSelectedCount(){
    const count = document.querySelectorAll(".row-check:checked").length;
    document.getElementById("selectedCount").textContent = count;
}

function exportSelected(){
    const ids = Array.from(document.querySelectorAll(".row-check:checked")).map(el => el.value);
    if(ids.length === 0){ toast("Pilih minimal 1 item untuk export","error"); return; }

    const rows = ALL_RECEIPTS.filter(r => ids.includes(r.id))
        .sort((a,b) => b.date.localeCompare(a.date));

    const header = ["Tanggal","Sumber","Kode","Item","Qty","UOM","Keterangan/No PO"];
    const data = rows.map(r => [
        r.date, r.source === "CK" ? "In CK" : "In Supplier", r.material_code, r.material_name, r.qty, r.uom, r.note || ""
    ]);

    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Barang Masuk");
    XLSX.writeFile(wb, `BarangMasuk_${today()}.xlsx`);
    toast(`✓ ${rows.length} item diexport`,"success");
}

function toast(msg, type="success"){
    const el = document.getElementById("notif");
    el.className = "notif " + type;
    el.innerHTML = msg;
    el.style.display = "block";
    setTimeout(()=>{ el.style.display = "none"; }, 2000);
}
