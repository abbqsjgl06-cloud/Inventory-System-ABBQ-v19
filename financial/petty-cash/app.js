"use strict";

const DEFAULT_SALDO_AWAL = 1000000;

let IS_ADMIN = false;
let ALL_USAGE = [];
let HISTORY_FILTERED = [];
let currentPhoto = null;
let editId = null;

document.addEventListener("authReady", (e) => {
    IS_ADMIN = e.detail.role === "admin";
    const box = document.getElementById("adminSaldoBox");
    if (box) box.style.display = IS_ADMIN ? "block" : "none";
});

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("pcDate").value = today();

    const end = today();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    document.getElementById("histFrom").value = start.toISOString().slice(0, 10);
    document.getElementById("histTo").value = end;

    bindPhoto();
    loadSummary();
});

function today() {
    return new Date().toISOString().slice(0, 10);
}

function rupiah(n) {
    return "Rp " + (Number(n) || 0).toLocaleString("id-ID");
}

function outletKey() {
    return (typeof window !== "undefined" && window.CURRENT_OUTLET_ID) ? window.CURRENT_OUTLET_ID : "global";
}

function saldoAwalSettingKey() {
    return `pettyCashSaldoAwal::${outletKey()}`;
}

/* ======================================
   SALDO AWAL (opening balance, editable by admin)
====================================== */

async function getSaldoAwal() {
    const val = await InvDB.getSetting(saldoAwalSettingKey(), null);
    if (val !== null && val !== undefined) return Number(val);
    await InvDB.setSetting(saldoAwalSettingKey(), DEFAULT_SALDO_AWAL);
    return DEFAULT_SALDO_AWAL;
}

async function saveSaldoAwal() {
    const val = Number(document.getElementById("editSaldoAwal").value);
    if (!val || val < 0) { toast("Isi saldo awal yang valid", "error"); return; }
    await InvDB.setSetting(saldoAwalSettingKey(), val);
    toast("✓ Saldo awal disimpan", "success");
    loadSummary();
}

/* ======================================
   SUMMARY (saldo awal - total penggunaan = saldo akhir)
   Total penggunaan dihitung dari SELURUH data (bukan cuma
   rentang tanggal riwayat), karena ini saldo berjalan.
====================================== */

async function loadSummary() {
    try {
        const [saldoAwal, usage] = await Promise.all([getSaldoAwal(), InvDB.getAll("pettyCashUsage")]);
        ALL_USAGE = usage;

        const totalUsage = usage.reduce((sum, u) => sum + (Number(u.amount) || 0), 0);
        const saldoAkhir = saldoAwal - totalUsage;

        document.getElementById("sumSaldoAwal").textContent = rupiah(saldoAwal);
        document.getElementById("sumUsage").textContent = rupiah(totalUsage);
        document.getElementById("sumSaldoAkhir").textContent = rupiah(saldoAkhir);
        document.getElementById("editSaldoAwal").value = saldoAwal;
    } catch (err) {
        console.error(err);
        toast("Gagal memuat summary", "error");
    }
}

/* ======================================
   PHOTO
====================================== */

function bindPhoto() {
    const input = document.getElementById("pcPhotoInput");
    const galleryInput = document.getElementById("pcPhotoInputGallery");
    const takeBtn = document.getElementById("pcTakePhotoBtn");
    const galleryBtn = document.getElementById("pcPickGalleryBtn");
    const removeBtn = document.getElementById("pcRemovePhotoBtn");

    if (input) input.addEventListener("change", selectPhoto);
    if (galleryInput) galleryInput.addEventListener("change", selectPhoto);
    if (takeBtn) takeBtn.addEventListener("click", () => input && input.click());
    if (galleryBtn) galleryBtn.addEventListener("click", () => galleryInput && galleryInput.click());
    if (removeBtn) removeBtn.addEventListener("click", clearPhoto);
}

async function selectPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
        currentPhoto = await compressPhoto(file);
        previewPhoto(currentPhoto);
    } catch (err) {
        console.error(err);
        toast("Foto gagal diproses. Coba gunakan foto lain.", "error");
    }
}

function compressPhoto(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function () {
            const img = new Image();
            img.onload = function () {
                const canvas = document.createElement("canvas");
                const scale = Math.min(1, 1000 / img.width, 1000 / img.height);
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                let quality = 0.6;
                let result = canvas.toDataURL("image/jpeg", quality);
                while (result.length > 700000 && quality > 0.3) {
                    quality -= 0.1;
                    result = canvas.toDataURL("image/jpeg", quality);
                }
                if (result.length > 900000) {
                    reject(new Error("Foto masih terlalu besar setelah dikompres."));
                    return;
                }
                resolve(result);
            };
            img.onerror = reject;
            img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function previewPhoto(src) {
    const img = document.getElementById("pcPhotoPreview");
    if (img) { img.src = src; img.style.display = "block"; }
}

function clearPhoto() {
    currentPhoto = null;
    const img = document.getElementById("pcPhotoPreview");
    if (img) { img.src = ""; img.style.display = "none"; }
    const input = document.getElementById("pcPhotoInput");
    if (input) input.value = "";
    const galleryInput = document.getElementById("pcPhotoInputGallery");
    if (galleryInput) galleryInput.value = "";
}

/* ======================================
   SAVE / EDIT
====================================== */

async function saveUsage() {
    const date = document.getElementById("pcDate").value;
    const category = document.getElementById("pcCategory").value.trim();
    const description = document.getElementById("pcDescription").value.trim();
    const amount = Number(document.getElementById("pcAmount").value);

    if (!date) { toast("Pilih tanggal", "error"); return; }
    if (!category) { toast("Isi kategori", "error"); return; }
    if (!description) { toast("Isi deskripsi", "error"); return; }
    if (!amount || amount <= 0) { toast("Isi amount yang valid", "error"); return; }

    const id = editId || ("pc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8));
    const data = {
        id, date, category, description, amount,
        photo: currentPhoto,
        updatedAt: new Date().toISOString()
    };

    try {
        if (editId) {
            const old = ALL_USAGE.find(u => u.id === editId);
            data.createdAt = old ? old.createdAt : new Date().toISOString();
            if (!currentPhoto && old) data.photo = old.photo || null;
        } else {
            data.createdAt = new Date().toISOString();
        }

        await InvDB.put("pettyCashUsage", data);
        toast(editId ? "✓ Data diperbarui" : "✓ Penggunaan tersimpan", "success");
        cancelEdit();
        loadSummary();
        loadHistory();
    } catch (err) {
        console.error(err);
        toast("Gagal menyimpan. Cek koneksi internet.", "error");
    }
}

function editUsage(id) {
    const data = ALL_USAGE.find(u => u.id === id) || HISTORY_FILTERED.find(u => u.id === id);
    if (!data) return;

    editId = id;
    document.getElementById("pcDate").value = data.date;
    document.getElementById("pcCategory").value = data.category || "";
    document.getElementById("pcDescription").value = data.description || "";
    document.getElementById("pcAmount").value = data.amount || 0;

    if (data.photo) { currentPhoto = data.photo; previewPhoto(data.photo); }
    else { clearPhoto(); }

    document.getElementById("pcSaveBtn").textContent = "💾 Simpan Perubahan";
    document.getElementById("pcCancelEditBtn").style.display = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelEdit() {
    editId = null;
    document.getElementById("pcDate").value = today();
    document.getElementById("pcCategory").value = "";
    document.getElementById("pcDescription").value = "";
    document.getElementById("pcAmount").value = "";
    clearPhoto();
    document.getElementById("pcSaveBtn").textContent = "💾 Simpan Penggunaan";
    document.getElementById("pcCancelEditBtn").style.display = "none";
}

async function deleteUsage(id) {
    if (!await uiConfirm("Hapus data penggunaan ini?")) return;
    await InvDB.remove("pettyCashUsage", id);
    toast("✓ Dihapus", "success");
    loadSummary();
    loadHistory();
}

/* ======================================
   HISTORY
====================================== */

async function loadHistory() {
    const from = document.getElementById("histFrom").value;
    const to = document.getElementById("histTo").value;
    if (!from || !to) { toast("Pilih rentang tanggal dulu", "error"); return; }

    try {
        const all = ALL_USAGE.length ? ALL_USAGE : await InvDB.getAll("pettyCashUsage");
        ALL_USAGE = all;
        HISTORY_FILTERED = all.filter(u => u.date >= from && u.date <= to).sort((a, b) => b.date.localeCompare(a.date));

        const body = document.getElementById("histBody");
        const totalLine = document.getElementById("histTotalLine");

        if (HISTORY_FILTERED.length === 0) {
            body.innerHTML = `<tr><td colspan="6" class="empty">Tidak ada data pada rentang ini</td></tr>`;
            totalLine.textContent = "";
            return;
        }

        const totalRange = HISTORY_FILTERED.reduce((s, u) => s + (Number(u.amount) || 0), 0);
        totalLine.textContent = `Total pada rentang ini: ${rupiah(totalRange)}`;

        body.innerHTML = HISTORY_FILTERED.map(u => `
            <tr>
                <td>${u.date}</td>
                <td>${u.category}</td>
                <td>${u.description}</td>
                <td class="num">${rupiah(u.amount)}</td>
                <td>${u.photo ? `<img src="${u.photo}" class="photo-thumb" onclick="showPhoto('${u.id}')">` : "-"}</td>
                <td>
                    <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;" onclick="editUsage('${u.id}')">Edit</button>
                    <button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;" onclick="deleteUsage('${u.id}')">Hapus</button>
                </td>
            </tr>
        `).join("");
    } catch (err) {
        console.error(err);
        toast("Gagal memuat riwayat", "error");
    }
}

function showPhoto(id) {
    const item = HISTORY_FILTERED.find(u => u.id === id) || ALL_USAGE.find(u => u.id === id);
    if (!item || !item.photo) return;
    const win = window.open("");
    if (!win) { toast("Popup diblokir browser. Izinkan popup untuk melihat foto.", "error"); return; }
    win.document.title = item.description + " - Foto";
    win.document.body.style.margin = "0";
    win.document.body.style.background = "#111";
    const img = win.document.createElement("img");
    img.src = item.photo;
    img.style.maxWidth = "100%";
    img.style.display = "block";
    img.style.margin = "0 auto";
    win.document.body.appendChild(img);
}

/* ======================================
   EXPORT EXCEL (foto ter-embed)
====================================== */

async function exportExcel() {
    if (!HISTORY_FILTERED || HISTORY_FILTERED.length === 0) {
        toast("Tampilkan riwayat dulu sebelum export", "error");
        return;
    }

    try {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("Petty Cash");
        ws.columns = [
            { header: "Tanggal", key: "date", width: 14 },
            { header: "Kategori", key: "category", width: 18 },
            { header: "Deskripsi", key: "description", width: 30 },
            { header: "Amount", key: "amount", width: 16 },
            { header: "Foto", key: "photo", width: 20 }
        ];
        ws.getRow(1).font = { bold: true };

        const records = [...HISTORY_FILTERED].sort((a, b) => a.date.localeCompare(b.date));

        records.forEach((r, idx) => {
            const rowIndex = idx + 2;
            const row = ws.addRow({
                date: r.date,
                category: r.category,
                description: r.description,
                amount: r.amount,
                photo: r.photo ? "" : "Tidak ada foto"
            });
            row.alignment = { vertical: "middle", wrapText: true };

            if (r.photo) {
                try {
                    const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/.exec(r.photo);
                    if (match) {
                        const ext = match[1] === "jpg" ? "jpeg" : match[1];
                        const imageId = wb.addImage({ base64: r.photo, extension: ext });
                        ws.addImage(imageId, {
                            tl: { col: 4, row: rowIndex - 1 },
                            ext: { width: 100, height: 100 },
                            editAs: "oneCell"
                        });
                        row.height = 80;
                    }
                } catch (imgErr) {
                    console.error("Gagal menyisipkan foto baris", rowIndex, imgErr);
                }
            }
        });

        const totalRow = ws.addRow({ date: "", category: "", description: "TOTAL", amount: records.reduce((s, r) => s + (Number(r.amount) || 0), 0), photo: "" });
        totalRow.font = { bold: true };

        const buf = await wb.xlsx.writeBuffer();
        const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "PettyCash_" + today() + ".xlsx";
        a.click();
        URL.revokeObjectURL(a.href);

        toast("✓ Export berhasil", "success");
    } catch (err) {
        console.error(err);
        toast("Gagal export: " + (err.message || "error"), "error");
    }
}

function toast(msg, type = "success") {
    const el = document.getElementById("notif");
    el.className = "notif " + type;
    el.innerHTML = msg;
    el.style.display = "block";
    setTimeout(() => { el.style.display = "none"; }, 2500);
}
