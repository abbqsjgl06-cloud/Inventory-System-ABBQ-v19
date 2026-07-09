// =====================================
// APP.JS FINAL STABLE
// =====================================

// =====================================
// ADMIN: UPLOAD DATA STOCK OPNAME
// (Kitchen maupun Frontliner, Daily maupun WM)
// =====================================

document.addEventListener("authReady", (e) => {
    const box = document.getElementById("adminUploadBox");
    if(box) box.style.display = (e.detail.role === "admin") ? "block" : "none";
});

document.addEventListener("DOMContentLoaded", () => {
    const fileInput = document.getElementById("adminStockUploadFile");
    if(fileInput){
        fileInput.addEventListener("change", handleAdminStockUpload);
    }
});

function getDatabaseFileFor(kategori, type){
    if(kategori === "Kitchen" && type === "Daily") return "database/daily_kitchen.json";
    if(kategori === "Frontliner" && type === "Daily") return "database/daily_frontliner.json";
    if(kategori === "Kitchen" && type === "WM") return "database/wm_kitchen.json";
    if(kategori === "Frontliner" && type === "WM") return "database/wm_frontliner.json";
    return null;
}

async function handleAdminStockUpload(e){
    const file = e.target.files[0];
    if(!file) return;

    const resultEl = document.getElementById("adminStockUploadResult");

    const pic = document.getElementById("operator").value.trim();
    const kategori = document.getElementById("kategori").value;
    const type = document.getElementById("type").value;
    const tanggal = document.getElementById("tanggal").value;

    if(!pic || !kategori || !type || !tanggal){
        resultEl.innerHTML = `<span style="color:#c0392b;">Lengkapi PIC, Kategori, Type, dan Tanggal dulu sebelum upload.</span>`;
        e.target.value = "";
        return;
    }

    const databaseFile = getDatabaseFileFor(kategori, type);
    if(!databaseFile){
        resultEl.innerHTML = `<span style="color:#c0392b;">Kombinasi Kategori + Type tidak dikenali.</span>`;
        e.target.value = "";
        return;
    }

    resultEl.innerHTML = "Memproses...";

    try {
        const [dbRes, fileBuffer] = await Promise.all([
            fetch(databaseFile + "?v=" + Date.now()).then(r => {
                if(!r.ok) throw new Error("Database item tidak ditemukan");
                return r.json();
            }),
            file.arrayBuffer()
        ]);

        const wb = XLSX.read(new Uint8Array(fileBuffer), { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", header: 1 });

        const qtyByKode = {};
        rows.forEach(row => {
            const kode = row[0];
            const qty = row[1];
            if(kode === "" || kode === undefined || kode === null) return;
            if(String(kode).toLowerCase() === "kode") return; // skip header
            qtyByKode[String(kode).trim()] = Number(qty) || 0;
        });

        let matched = 0, unmatched = 0;

        const items = dbRes.map(item => {
            const kode = String(item.kode).trim();
            const hasQty = Object.prototype.hasOwnProperty.call(qtyByKode, kode);
            if(hasQty) matched++; else unmatched++;
            return {
                nomor: item.nomor,
                kode: item.kode,
                item: item.item,
                konv: item.konv,
                uom: item.uom,
                pcs_gr: hasQty ? qtyByKode[kode] : 0
            };
        });

        const data = {
            id: String(Date.now()),
            pic,
            kategori,
            type,
            tanggal,
            waktuInput: getWaktuInput(),
            items
        };

        await InvDB.put("stockOpname", data);

        resultEl.innerHTML = `✓ Data tersimpan: ${matched} item terisi dari file, ${unmatched} item lain default 0.`;
        e.target.value = "";

    } catch(err){
        console.error(err);
        resultEl.innerHTML = `<span style="color:#c0392b;">Gagal upload: ${err.message || err}</span>`;
        e.target.value = "";
    }
}

// ======================
// WAKTU INPUT
// ======================
function getWaktuInput() {

    return new Date().toLocaleString("id-ID", {

        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"

    });

}

// ======================
// MULAI INPUT
// ======================
window.mulaiInput = function () {

    const pic =
        document.getElementById("operator").value.trim();

    const kategori =
        document.getElementById("kategori").value;

    const type =
        document.getElementById("type").value;

    const tanggal =
        document.getElementById("tanggal").value;

    // ======================
    // VALIDASI
    // ======================
    if (!pic || !kategori || !type || !tanggal) {

        tampilNotif(
            "Lengkapi semua data terlebih dahulu",
            "error"
        );

        return;

    }

    // ======================
    // DATA AKTIF
    // ======================
    const activeStock = {

        pic: pic,
        kategori: kategori,
        type: type,
        tanggal: tanggal,
        waktuInput: getWaktuInput()

    };

    // ======================
    // SIMPAN
    // ======================
    localStorage.setItem(
        "activeStock",
        JSON.stringify(activeStock)
    );

    // Backup kompatibilitas
    localStorage.setItem(
        "kategori",
        kategori
    );

    localStorage.setItem(
        "type",
        type
    );

    localStorage.setItem(
        "tanggal",
        tanggal
    );

    console.log("=== ACTIVE STOCK ===");
    console.log(activeStock);

    // ======================
    // PINDAH HALAMAN
    // ======================
    window.location.href =
        "input.html";

};

// ======================
// NOTIFIKASI
// ======================
function tampilNotif(
    pesan,
    type = "success"
) {

    const notif =
        document.getElementById("notif");

    if (!notif) {

        return;

    }

    notif.className =
        "notif " + type;

    notif.innerHTML =
        pesan;

    notif.style.display =
        "block";

    setTimeout(() => {

        notif.style.display =
            "none";

    }, 2000);

}

// ======================
// INSTALL PWA
// ======================
// Untuk memunculkan lagi tombol "INSTALL APP", ganti false jadi true
// di baris di bawah ini.
const SHOW_INSTALL_BUTTON = false;

let deferredPrompt = null;

if (SHOW_INSTALL_BUTTON) {

window.addEventListener(
    "beforeinstallprompt",
    (e) => {

        e.preventDefault();

        deferredPrompt = e;

        const installBtn =
            document.getElementById(
                "installBtn"
            );

        if (installBtn) {

            installBtn.style.display =
                "block";

        }

    }
);

const installBtn =
    document.getElementById(
        "installBtn"
    );

if (installBtn) {

    installBtn.addEventListener(
        "click",
        async () => {

            if (!deferredPrompt) {

                return;

            }

            deferredPrompt.prompt();

            await deferredPrompt.userChoice;

            deferredPrompt = null;

            installBtn.style.display =
                "none";

        }
    );

}

}

// ======================
// REGISTER SERVICE WORKER
// ======================
if (
    "serviceWorker" in navigator
) {

    window.addEventListener(
        "load",
        () => {

            navigator.serviceWorker.register(
                "./service-worker.js"
            );

        }
    );

}
