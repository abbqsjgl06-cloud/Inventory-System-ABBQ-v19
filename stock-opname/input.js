// =====================================
// INPUT.JS FINAL STABLE
// =====================================

let stockMeta = {};
let databaseData = [];

// =====================================
// ADMIN: UPLOAD QTY DARI EXCEL
// =====================================

function handleAdminUpload(e){
    const file = e.target.files[0];
    if(!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const data = new Uint8Array(evt.target.result);
            const wb = XLSX.read(data, { type: "array" });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 });

            let matched = 0, unmatched = 0;

            rows.forEach(row => {
                const kode = row[0];
                const qty = row[1];
                if(kode === "" || kode === undefined || kode === null) return;
                if(String(kode).toLowerCase() === "kode") return; // skip header row

                const idx = databaseData.findIndex(item => String(item.kode).trim() === String(kode).trim());
                if(idx === -1){
                    unmatched++;
                    return;
                }

                const input = document.getElementById("qty_" + idx);
                if(input){
                    input.value = Number(qty) || 0;
                    matched++;
                }
            });

            document.getElementById("adminUploadResult").innerHTML =
                `✓ ${matched} item terisi otomatis` + (unmatched > 0 ? `, ${unmatched} kode tidak ditemukan di master` : "");

        } catch(err){
            console.error(err);
            document.getElementById("adminUploadResult").innerHTML =
                `<span style="color:#c0392b;">Gagal membaca file. Pastikan format .xlsx/.xls/.csv 2 kolom (Kode, Qty).</span>`;
        }
    };
    reader.readAsArrayBuffer(file);
}

// =====================================
// LOAD HALAMAN
// =====================================
document.addEventListener("DOMContentLoaded", () => {

    // Ambil data aktif
    const activeStock =
        JSON.parse(localStorage.getItem("activeStock")) || {};

    stockMeta = {

        pic:
            activeStock.pic || "-",

        kategori:
            activeStock.kategori ||
            localStorage.getItem("kategori") ||
            "",

        type:
            activeStock.type ||
            localStorage.getItem("type") ||
            "",

        tanggal:
            activeStock.tanggal ||
            localStorage.getItem("tanggal") ||
            ""

    };

    // Validasi
    if (
        !stockMeta.kategori ||
        !stockMeta.type ||
        !stockMeta.tanggal
    ) {

        tampilNotif(
            "Data input tidak ditemukan",
            "error"
        );

        setTimeout(() => {

            window.location.href =
                "index.html";

        },1500);

        return;

    }

    // Judul
    document.getElementById(
        "judulHalaman"
    ).innerHTML =

        stockMeta.kategori +
        " - " +
        stockMeta.type +
        " - " +
        stockMeta.tanggal;

    loadDatabase();

});

document.addEventListener("authReady", (e) => {
    const box = document.getElementById("adminUploadBox");
    if(box) box.style.display = (e.detail.role === "admin") ? "block" : "none";

    const manageBox = document.getElementById("adminManageBox");
    if(manageBox) manageBox.style.display = (e.detail.role === "admin") ? "block" : "none";
});

document.addEventListener("DOMContentLoaded", () => {
    const fileInput = document.getElementById("adminUploadFile");
    if(fileInput){
        fileInput.addEventListener("change", handleAdminUpload);
    }
});

// =====================================
// ADMIN: KELOLA DAFTAR ITEM
// =====================================

function toggleAdminManage(){
    const panel = document.getElementById("adminManagePanel");
    const arrow = document.getElementById("adminManageArrow");
    const showing = panel.style.display !== "none";
    panel.style.display = showing ? "none" : "block";
    arrow.textContent = showing ? "▾" : "▴";
}

function renderAdminItemList(){
    const label = document.getElementById("adminManageListLabel");
    if(label) label.textContent = `${stockMeta.kategori} - ${stockMeta.type}`;

    const box = document.getElementById("adminItemListBox");
    if(!box) return;

    if(databaseData.length === 0){
        box.innerHTML = `<p style="color:#666;font-size:13px;">Belum ada item.</p>`;
        return;
    }

    box.innerHTML = databaseData.map((item, idx) => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #eee;font-size:13px;">
            <div style="flex:1;">
                <b>${item.kode}</b> - ${item.item}<br>
                <span style="color:#666;">Konv: ${item.konv} · UOM: ${item.uom}</span>
            </div>
            <button type="button" onclick="editAdminItem(${idx})" style="background:#f1c40f;border:none;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer;">Edit</button>
            <button type="button" onclick="deleteAdminItem(${idx})" style="background:#e74c3c;color:#fff;border:none;border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer;">Hapus</button>
        </div>
    `).join("");
}

async function persistCurrentList(){
    await InvDB.put("stockOpnameLists", { id: CURRENT_LIST_ID, items: databaseData });
}

async function addAdminItem(){
    const kode = document.getElementById("newItemKode").value.trim();
    const nama = document.getElementById("newItemNama").value.trim();
    const uom = document.getElementById("newItemUom").value.trim();
    const konv = Number(document.getElementById("newItemKonv").value) || 1;

    if(!kode || !nama || !uom){
        tampilNotif("Lengkapi kode, nama, dan UOM", "error");
        return;
    }

    if(databaseData.some(i => String(i.kode).trim() === kode)){
        tampilNotif("Kode item sudah ada di daftar ini", "error");
        return;
    }

    const nextNomor = databaseData.length > 0 ? Math.max(...databaseData.map(i=>Number(i.nomor)||0)) + 1 : 1;
    databaseData.push({ nomor: nextNomor, kode, item: nama, konv, uom });

    try {
        await persistCurrentList();
        document.getElementById("newItemKode").value = "";
        document.getElementById("newItemNama").value = "";
        document.getElementById("newItemUom").value = "";
        document.getElementById("newItemKonv").value = "";
        renderTable();
        renderAdminItemList();
        tampilNotif("✓ Item ditambahkan", "success");
    } catch(err){
        console.error(err);
        tampilNotif("Gagal simpan ke server", "error");
    }
}

async function editAdminItem(idx){
    const item = databaseData[idx];
    if(!item) return;

    const newNama = prompt("Nama item:", item.item);
    if(newNama === null) return;
    const newUom = prompt("UOM:", item.uom);
    if(newUom === null) return;
    const newKonv = prompt("Konv:", item.konv);
    if(newKonv === null) return;

    item.item = newNama.trim() || item.item;
    item.uom = newUom.trim() || item.uom;
    item.konv = Number(newKonv) || item.konv;

    try {
        await persistCurrentList();
        renderTable();
        renderAdminItemList();
        tampilNotif("✓ Item diperbarui", "success");
    } catch(err){
        console.error(err);
        tampilNotif("Gagal simpan ke server", "error");
    }
}

async function deleteAdminItem(idx){
    const item = databaseData[idx];
    if(!item) return;

    if(!await uiConfirm(`Hapus item "${item.item}" (${item.kode}) dari daftar ${stockMeta.kategori} - ${stockMeta.type}?`)) return;

    databaseData.splice(idx, 1);

    try {
        await persistCurrentList();
        renderTable();
        renderAdminItemList();
        tampilNotif("✓ Item dihapus", "success");
    } catch(err){
        console.error(err);
        tampilNotif("Gagal simpan ke server", "error");
    }
}

// =====================================
// LOAD DATABASE
// =====================================

let CURRENT_LIST_ID = "";

function getListId(){
    if(stockMeta.kategori === "Kitchen" && stockMeta.type === "Daily") return "kitchen_daily";
    if(stockMeta.kategori === "Frontliner" && stockMeta.type === "Daily") return "frontliner_daily";
    if(stockMeta.kategori === "Kitchen" && stockMeta.type === "WM") return "kitchen_wm";
    if(stockMeta.kategori === "Frontliner" && stockMeta.type === "WM") return "frontliner_wm";
    return "";
}

function getStaticFileFor(listId){
    const map = {
        kitchen_daily: "database/daily_kitchen.json",
        frontliner_daily: "database/daily_frontliner.json",
        kitchen_wm: "database/wm_kitchen.json",
        frontliner_wm: "database/wm_frontliner.json"
    };
    return map[listId] || "";
}

async function loadDatabase(){

    CURRENT_LIST_ID = getListId();

    if(!CURRENT_LIST_ID){
        tampilNotif("Kategori/Type tidak dikenali", "error");
        return;
    }

    try {
        let doc = await InvDB.get("stockOpnameLists", CURRENT_LIST_ID);

        if(!doc || !Array.isArray(doc.items) || doc.items.length === 0){
            // Seed once from the original static JSON file
            const staticFile = getStaticFileFor(CURRENT_LIST_ID);
            const res = await fetch(staticFile + "?v=" + Date.now());
            if(!res.ok) throw new Error("Database awal tidak ditemukan");
            const seedItems = await res.json();
            doc = { id: CURRENT_LIST_ID, items: seedItems };
            await InvDB.put("stockOpnameLists", doc);
        }

        databaseData = doc.items;
        renderTable();
        renderAdminItemList();

    } catch(error){
        console.error(error);
        tampilNotif("Gagal membuka database", "error");
    }

}

// =====================================
// TABEL
// =====================================

function renderTable(){

    let html = "";

    databaseData.forEach((item,index)=>{

        html += `

        <tr>

            <td>${item.nomor}</td>

            <td>${item.kode}</td>

            <td>${item.item}</td>

            <td>${item.konv}</td>

            <td>${item.uom}</td>

            <td>

                <input
                    type="number"
                    class="qty-input"
                    id="qty_${index}"
                    min="0"
                    value="0">

            </td>

        </tr>

        `;

    });

    document.getElementById(
        "tableBody"
    ).innerHTML = html;

}

// =====================================
// WAKTU
// =====================================

function getWaktuInput(){

    return new Date().toLocaleString(
        "id-ID",
        {

            year:"numeric",
            month:"2-digit",
            day:"2-digit",
            hour:"2-digit",
            minute:"2-digit",
            second:"2-digit"

        }
    );

}

// =====================================
// SIMPAN
// =====================================

async function simpanData(){

    let items = [];

    databaseData.forEach((item,index)=>{

        items.push({

            nomor:item.nomor,

            kode:item.kode,

            item:item.item,

            konv:item.konv,

            uom:item.uom,

            pcs_gr:Number(

                document.getElementById(
                    "qty_"+index
                ).value

            )

        });

    });

    const data = {

        id:String(Date.now()),

        pic:stockMeta.pic,

        kategori:stockMeta.kategori,

        type:stockMeta.type,

        tanggal:stockMeta.tanggal,

        waktuInput:getWaktuInput(),

        items:items

    };

    try {

        await InvDB.put("stockOpname", data);

        localStorage.setItem(
            "currentStock",
            JSON.stringify(data)
        );

        tampilNotif(
            "✓ Data berhasil disimpan",
            "success"
        );

    } catch(err) {

        console.error("Gagal simpan Stock Opname:", err);

        tampilNotif(
            "Gagal simpan ke server. Cek koneksi internet.",
            "error"
        );

    }

}

// =====================================
// RESET
// =====================================

function resetData(){

    document
        .querySelectorAll(".qty-input")
        .forEach(input=>{

            input.value = 0;

        });

    tampilNotif(
        "✓ Data berhasil direset",
        "success"
    );

}

// =====================================
// NOTIFIKASI
// =====================================

function tampilNotif(
    pesan,
    type="success"
){

    const notif =
        document.getElementById(
            "notif"
        );

    if(!notif) return;

    notif.className =
        "notif " + type;

    notif.innerHTML =
        pesan;

    notif.style.display =
        "block";

    setTimeout(()=>{

        notif.style.display =
            "none";

    },2000);

}


function filterTable(){
 const key=document.getElementById('searchItem').value.toLowerCase();
 document.querySelectorAll('#tableBody tr').forEach(tr=>{
  const txt=tr.innerText.toLowerCase();
  tr.style.display=txt.includes(key)?'':'none';
 });
}
