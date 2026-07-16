"use strict";

/* ==========================================
   OCR SCAN (Beta) - goods-receipt/ocr-scan.js

   Foto dokumen PO/DO -> Tesseract.js baca teksnya di browser (gratis,
   tanpa server) -> di-parse jadi baris Kode/Nama/UOM pakai heuristik
   sederhana -> dicocokkan ke MATERIALS (master item) -> user review &
   koreksi manual -> baru ditambahkan ke STAGING (daftar item yang sama
   dipakai alur input manual).

   Catatan jujur: OCR di browser (gratis) TIDAK akan selalu akurat,
   apalagi untuk dokumen yang pudar / ada tulisan tangan menimpa teks.
   Karena itu semua hasil WAJIB direview manual sebelum ditambahkan -
   tidak ada baris yang otomatis masuk ke daftar tanpa dilihat user.
========================================== */

let OCR_ROWS = [];
let OCR_ROW_SEQ = 0;

document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("ocrPhotoInput");
    const galleryInput = document.getElementById("ocrPhotoInputGallery");
    if (input) input.addEventListener("change", handleOcrPhoto);
    if (galleryInput) galleryInput.addEventListener("change", handleOcrPhoto);
});

async function handleOcrPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;

    const preview = document.getElementById("ocrPreview");
    const statusEl = document.getElementById("ocrStatus");

    const url = URL.createObjectURL(file);
    preview.src = url;
    preview.style.display = "block";

    statusEl.style.display = "block";
    statusEl.style.color = "#1C3D6B";
    statusEl.textContent = "⏳ Memproses OCR... bisa 10-30 detik tergantung HP, mohon tunggu.";

    OCR_ROWS = [];
    document.getElementById("ocrReviewWrap").style.display = "none";

    try {
        const result = await Tesseract.recognize(file, "eng", {
            logger: (m) => {
                if (m.status === "recognizing text" && m.progress != null) {
                    statusEl.textContent = `⏳ Membaca teks... ${Math.round(m.progress * 100)}%`;
                }
            }
        });

        const text = result.data.text || "";
        const parsed = parseOcrText(text);

        if (parsed.length === 0) {
            statusEl.style.color = "#8C2A1E";
            statusEl.textContent = "⚠ Tidak ada baris item yang terbaca. Coba foto ulang lebih dekat/terang, atau tambah baris manual di bawah.";
        } else {
            statusEl.style.color = "#1E7E34";
            statusEl.textContent = `✓ ${parsed.length} baris terbaca. Cek & koreksi dulu sebelum ditambahkan ke daftar.`;
        }

        OCR_ROWS = parsed.map(toOcrRow);
        document.getElementById("ocrReviewWrap").style.display = "block";
        renderOcrReview();

    } catch (err) {
        console.error(err);
        statusEl.style.color = "#8C2A1E";
        statusEl.textContent = "Gagal memproses foto. Coba foto lain atau tambah baris manual di bawah.";
        document.getElementById("ocrReviewWrap").style.display = "block";
    }
}

/* ======================================
   PARSING - heuristik sederhana untuk format
   tabel "No | Kode Barang | Nama Barang | UOM"
====================================== */

function parseOcrText(text) {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    const codeRegex = /\b(\d{5,7})\b/;
    const uomRegex = /\b(PAC|KG|CAR|CAN|BKU|PC|ROL|GR|ML|LTR|BTL|DUS|BOX|CTN)\b/i;

    const rows = [];
    lines.forEach(line => {
        const codeMatch = line.match(codeRegex);
        if (!codeMatch) return;

        const code = codeMatch[1];
        let rest = line.slice(codeMatch.index + code.length).trim();

        let uom = "";
        const uomMatch = rest.match(uomRegex);
        if (uomMatch) {
            uom = uomMatch[1].toUpperCase();
            rest = rest.slice(0, uomMatch.index).trim();
        }

        const name = rest.replace(/[^A-Za-z0-9 .\/\-]/g, " ").replace(/\s+/g, " ").trim();
        if (!name && !uom) return; // baris kemungkinan cuma noise, lewati

        rows.push({ code, name, uom });
    });

    return rows;
}

function toOcrRow(parsed) {
    OCR_ROW_SEQ++;
    const match = MATERIALS.find(m => String(m.code).trim() === String(parsed.code).trim());
    return {
        rowId: "ocr_" + OCR_ROW_SEQ,
        code: parsed.code,
        ocrName: parsed.name,
        name: match ? match.name : parsed.name,
        uom: match ? match.uom : parsed.uom,
        qty: "",
        matched: !!match
    };
}

/* ======================================
   REVIEW TABLE
====================================== */

function renderOcrReview() {
    const body = document.getElementById("ocrReviewBody");

    if (OCR_ROWS.length === 0) {
        body.innerHTML = `<tr><td colspan="5" class="empty">Belum ada baris. Tambah manual kalau perlu.</td></tr>`;
        return;
    }

    body.innerHTML = OCR_ROWS.map(r => `
        <tr>
            <td>
                <input type="text" value="${r.code}" style="width:80px;" oninput="ocrUpdateCode('${r.rowId}', this.value)">
            </td>
            <td>
                <div style="font-weight:600;">${r.name || "-"}</div>
                ${!r.matched ? `<small style="color:#C23B2E;">⚠ Kode tidak dikenali di Master Data - cek/ketik ulang kode</small>` : `<small style="color:#1E7E34;">✓ cocok dengan Master Data</small>`}
            </td>
            <td>${r.uom || "-"}</td>
            <td><input type="number" min="0" step="any" placeholder="0" value="${r.qty}" style="width:70px;" oninput="ocrUpdateQty('${r.rowId}', this.value)"></td>
            <td><button type="button" class="btn btn-ghost" style="padding:6px 10px;font-size:12px;width:auto;" onclick="ocrRemoveRow('${r.rowId}')">Hapus</button></td>
        </tr>
    `).join("");
}

function ocrUpdateCode(rowId, value) {
    const row = OCR_ROWS.find(r => r.rowId === rowId);
    if (!row) return;
    row.code = value.trim();
    const match = MATERIALS.find(m => String(m.code).trim() === row.code);
    row.matched = !!match;
    row.name = match ? match.name : (row.ocrName || row.name);
    row.uom = match ? match.uom : row.uom;
    renderOcrReview();
}

function ocrUpdateQty(rowId, value) {
    const row = OCR_ROWS.find(r => r.rowId === rowId);
    if (!row) return;
    row.qty = value;
}

function ocrRemoveRow(rowId) {
    OCR_ROWS = OCR_ROWS.filter(r => r.rowId !== rowId);
    renderOcrReview();
}

function ocrAddManualRow() {
    OCR_ROW_SEQ++;
    OCR_ROWS.push({
        rowId: "ocr_" + OCR_ROW_SEQ,
        code: "",
        ocrName: "",
        name: "",
        uom: "",
        qty: "",
        matched: false
    });
    document.getElementById("ocrReviewWrap").style.display = "block";
    renderOcrReview();
}

/* ======================================
   PUSH KE STAGING (daftar item yang sama
   dipakai alur input manual)
====================================== */

function ocrAddAllToStaging() {
    if (OCR_ROWS.length === 0) { toast("Belum ada baris untuk ditambahkan", "error"); return; }

    let added = 0, skipped = 0;
    const remaining = [];

    OCR_ROWS.forEach(r => {
        const qty = Number(r.qty);
        const material = MATERIALS.find(m => String(m.code).trim() === String(r.code).trim());

        if (!material || !qty || qty <= 0) {
            skipped++;
            remaining.push(r); // biarkan di tabel review supaya bisa diperbaiki
            return;
        }

        STAGING.push({
            material_code: material.code,
            material_name: material.name,
            qty,
            uom: material.uom
        });
        added++;
    });

    OCR_ROWS = remaining;
    renderOcrReview();
    renderStaging();

    if (added > 0) toast(`✓ ${added} item ditambahkan ke Daftar Item` + (skipped > 0 ? `, ${skipped} baris masih perlu dilengkapi (kode/qty)` : ""), "success");
    else toast("Belum ada baris yang lengkap (kode cocok Master Data + qty > 0)", "error");
}
