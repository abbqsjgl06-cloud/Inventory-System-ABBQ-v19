// =====================================
// INPUT.JS FINAL STABLE
// =====================================

let stockMeta = {};
let databaseData = [];

// =====================================
// ADMIN: UPLOAD QTY DARI EXCEL
// =====================================

document.addEventListener("authReady", (e) => {
    const box = document.getElementById("adminUploadBox");
    if(box) box.style.display = (e.detail.role === "admin") ? "block" : "none";
});

document.addEventListener("DOMContentLoaded", () => {
    const fileInput = document.getElementById("adminUploadFile");
    if(fileInput){
        fileInput.addEventListener("change", handleAdminUpload);
    }
});

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

// =====================================
// LOAD DATABASE
// =====================================

function loadDatabase(){

    let databaseFile = "";

    if(
        stockMeta.kategori === "Kitchen" &&
        stockMeta.type === "Daily"
    ){

        databaseFile =
            "database/daily_kitchen.json";

    }

    else if(
        stockMeta.kategori === "Frontliner" &&
        stockMeta.type === "Daily"
    ){

        databaseFile =
            "database/daily_frontliner.json";

    }

    else if(
        stockMeta.kategori === "Kitchen" &&
        stockMeta.type === "WM"
    ){

        databaseFile =
            "database/wm_kitchen.json";

    }

    else if(
        stockMeta.kategori === "Frontliner" &&
        stockMeta.type === "WM"
    ){

        databaseFile =
            "database/wm_frontliner.json";

    }

    console.log(databaseFile);

    fetch(
        databaseFile + "?v=" + Date.now()
    )

    .then(response=>{

        if(!response.ok){

            throw new Error(
                "Database tidak ditemukan"
            );

        }

        return response.json();

    })

    .then(data=>{

        databaseData = data;

        renderTable();

    })

    .catch(error=>{

        console.error(error);

        tampilNotif(
            "Gagal membuka database",
            "error"
        );

    });

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
