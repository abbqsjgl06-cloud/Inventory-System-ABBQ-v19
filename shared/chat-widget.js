/* ==========================================
   ABBQ Inventory - Chat Widget
   shared/chat-widget.js

   Chat 1-on-1 per outlet <-> Admin:
   - Akun outlet (punya outletId) : chat langsung ke channel-nya sendiri
     (channelId = outletId-nya). Tidak bisa lihat channel outlet lain.
   - Admin: lihat daftar channel (semua outlet), pilih salah satu untuk
     dibuka. Bisa chat ke channel manapun.

   Dipasang otomatis oleh auth-guard.js setelah login (lihat pemanggilan
   initChatWidget di bagian bawah file ini / auth-guard.js).
========================================== */

(function () {
    "use strict";

    let MY_EMAIL = null;
    let MY_ROLE = null;
    let MY_OUTLET_ID = null;
    let ACTIVE_CHANNEL = null;   // channelId yang sedang dibuka di panel
    let OUTLETS_CACHE = [];
    let UNSUB_THREAD = null;     // unsubscribe listener thread yang sedang aktif
    let UNSUB_ADMIN_ALL = null;  // listener global (khusus admin, untuk unread count)
    let ADMIN_ALL_MESSAGES = [];

    function lastReadKey(channelId) {
        return "chat_lastread_" + channelId;
    }
    function getLastRead(channelId) {
        return Number(localStorage.getItem(lastReadKey(channelId)) || 0);
    }
    function setLastRead(channelId, ts) {
        try { localStorage.setItem(lastReadKey(channelId), String(ts)); } catch (e) { /* ignore */ }
    }

    /* ======================================
       STYLES
    ====================================== */

    function injectStyles() {
        if (document.getElementById("chatWidgetStyles")) return;
        const style = document.createElement("style");
        style.id = "chatWidgetStyles";
        style.textContent = `
            #chatFab{
                position:fixed;bottom:18px;right:16px;z-index:9998;
                width:52px;height:52px;border-radius:50%;
                background:#0D7A5F;color:#fff;border:none;
                font-size:22px;box-shadow:0 4px 14px rgba(0,0,0,.25);
                display:flex;align-items:center;justify-content:center;cursor:pointer;
            }
            #chatFab .chat-badge{
                position:absolute;top:-2px;right:-2px;background:#C23B2E;color:#fff;
                font-size:10px;font-weight:800;min-width:18px;height:18px;border-radius:9px;
                display:flex;align-items:center;justify-content:center;padding:0 4px;
                border:2px solid #FAF7F2;
            }
            #chatOverlay{
                position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:99998;
                display:flex;align-items:flex-end;justify-content:center;
            }
            #chatPanel{
                background:#fff;width:100%;max-width:420px;height:78vh;max-height:640px;
                border-radius:20px 20px 0 0;display:flex;flex-direction:column;overflow:hidden;
                font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;
            }
            #chatPanel .chat-header{
                background:#0D7A5F;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px;
                font-weight:700;font-size:14px;flex:none;
            }
            #chatPanel .chat-header button{background:none;border:none;color:#fff;font-size:18px;cursor:pointer;padding:2px 6px;}
            #chatPanel .chat-header .chat-title{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
            #chatBody{flex:1;overflow-y:auto;padding:14px;background:#FAF7F2;}
            .chat-bubble{max-width:78%;padding:9px 12px;border-radius:14px;margin-bottom:8px;font-size:13px;line-height:1.4;word-wrap:break-word;}
            .chat-bubble.me{background:#0D7A5F;color:#fff;margin-left:auto;border-bottom-right-radius:4px;}
            .chat-bubble.them{background:#fff;color:#1C1B19;border:1px solid #E7E2D9;margin-right:auto;border-bottom-left-radius:4px;}
            .chat-bubble .chat-time{display:block;font-size:9px;opacity:.7;margin-top:3px;}
            #chatInputRow{display:flex;gap:8px;padding:10px;border-top:1px solid #E7E2D9;flex:none;background:#fff;}
            #chatInputRow input{flex:1;border:1px solid #E7E2D9;border-radius:20px;padding:10px 14px;font-size:13px;}
            #chatInputRow button{background:#0D7A5F;color:#fff;border:none;border-radius:20px;padding:0 16px;font-weight:700;cursor:pointer;}
            .chat-channel-row{
                display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #F0EDE6;cursor:pointer;
            }
            .chat-channel-row:active{background:#F5F1E8;}
            .chat-channel-name{flex:1;font-weight:600;font-size:13px;}
            .chat-channel-dot{width:9px;height:9px;border-radius:50%;background:#C23B2E;flex:none;}
            .chat-empty{padding:24px;text-align:center;color:#79746B;font-size:12px;}
        `;
        document.head.appendChild(style);
    }

    /* ======================================
       UNREAD COUNTING
    ====================================== */

    function computeMyUnread() {
        if (MY_ROLE === "admin") {
            const byChannel = {};
            ADMIN_ALL_MESSAGES.forEach(m => {
                if (m.senderRole === "admin") return; // pesan admin sendiri tidak dihitung unread
                const lastRead = getLastRead(m.channelId);
                if (m.createdAt > lastRead) {
                    byChannel[m.channelId] = true;
                }
            });
            return Object.keys(byChannel).length; // jumlah channel yang punya pesan belum dibaca
        } else {
            if (!MY_OUTLET_ID) return 0;
            // Non-admin dihitung dari listener thread langsung (di-refresh tiap snapshot)
            return window.__chatMyChannelUnread || 0;
        }
    }

    function updateFabBadge() {
        const badgeEl = document.getElementById("chatFabBadge");
        if (!badgeEl) return;
        const count = computeMyUnread();
        if (count > 0) {
            badgeEl.style.display = "flex";
            badgeEl.textContent = count > 9 ? "9+" : String(count);
        } else {
            badgeEl.style.display = "none";
        }
    }

    /* ======================================
       FAB (floating button)
    ====================================== */

    function injectFab() {
        if (document.getElementById("chatFab")) return;
        injectStyles();

        const fab = document.createElement("button");
        fab.id = "chatFab";
        fab.innerHTML = `💬<span class="chat-badge" id="chatFabBadge" style="display:none;">0</span>`;
        fab.addEventListener("click", openChat);
        document.body.appendChild(fab);
    }

    /* ======================================
       OPEN / CLOSE PANEL
    ====================================== */

    function openChat() {
        if (MY_ROLE === "admin") {
            openChannelList();
        } else {
            if (!MY_OUTLET_ID) {
                alert("Outlet Anda belum di-set oleh Admin. Hubungi Admin untuk mengatur outlet Anda dulu sebelum bisa chat.");
                return;
            }
            openThread(MY_OUTLET_ID, "Admin");
        }
    }

    function closeChat() {
        const overlay = document.getElementById("chatOverlay");
        if (overlay) overlay.remove();
        if (UNSUB_THREAD) { UNSUB_THREAD(); UNSUB_THREAD = null; }
        ACTIVE_CHANNEL = null;
        updateFabBadge();
    }

    function renderPanelShell(titleHtml, bodyHtml, showBack) {
        let overlay = document.getElementById("chatOverlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "chatOverlay";
            overlay.addEventListener("click", (e) => { if (e.target === overlay) closeChat(); });
            document.body.appendChild(overlay);
        }
        overlay.innerHTML = `
            <div id="chatPanel">
                <div class="chat-header">
                    ${showBack ? `<button id="chatBackBtn">←</button>` : ""}
                    <span class="chat-title">${titleHtml}</span>
                    <button id="chatCloseBtn">✕</button>
                </div>
                ${bodyHtml}
            </div>
        `;
        document.getElementById("chatCloseBtn").addEventListener("click", closeChat);
        const backBtn = document.getElementById("chatBackBtn");
        if (backBtn) backBtn.addEventListener("click", openChannelList);
    }

    /* ======================================
       ADMIN: CHANNEL LIST
    ====================================== */

    function openChannelList() {
        if (UNSUB_THREAD) { UNSUB_THREAD(); UNSUB_THREAD = null; }
        ACTIVE_CHANNEL = null;

        renderPanelShell("💬 Chat Outlet", `<div id="chatBody"><div class="chat-empty">Memuat daftar outlet...</div></div>`, false);

        firebase.firestore().collection("outlets").get().then((snap) => {
            OUTLETS_CACHE = [];
            snap.forEach(d => OUTLETS_CACHE.push(d.data()));
            renderChannelList();
        }).catch(() => {
            document.getElementById("chatBody").innerHTML = `<div class="chat-empty">Gagal memuat daftar outlet.</div>`;
        });

        startAdminAllListener();
    }

    function renderChannelList() {
        const body = document.getElementById("chatBody");
        if (!body) return;

        if (OUTLETS_CACHE.length === 0) {
            body.innerHTML = `<div class="chat-empty">Belum ada outlet terdaftar. Tambahkan dulu lewat Kelola Akun.</div>`;
            return;
        }

        const unreadSet = {};
        ADMIN_ALL_MESSAGES.forEach(m => {
            if (m.senderRole === "admin") return;
            if (m.createdAt > getLastRead(m.channelId)) unreadSet[m.channelId] = true;
        });

        body.innerHTML = `<div>` + OUTLETS_CACHE.map(o => `
            <div class="chat-channel-row" data-outlet="${o.id}">
                <span class="chat-channel-name">${o.name || o.id}</span>
                ${unreadSet[o.id] ? `<span class="chat-channel-dot"></span>` : ""}
            </div>
        `).join("") + `</div>`;

        body.querySelectorAll(".chat-channel-row").forEach(row => {
            row.addEventListener("click", () => {
                const outlet = OUTLETS_CACHE.find(o => o.id === row.dataset.outlet);
                openThread(row.dataset.outlet, outlet ? outlet.name : row.dataset.outlet);
            });
        });
    }

    function startAdminAllListener() {
        if (UNSUB_ADMIN_ALL) return; // sudah jalan, tidak perlu double-subscribe
        UNSUB_ADMIN_ALL = firebase.firestore().collection("chatMessages")
            .orderBy("createdAt", "desc")
            .limit(300)
            .onSnapshot((snap) => {
                ADMIN_ALL_MESSAGES = snap.docs.map(d => d.data());
                updateFabBadge();
                if (document.getElementById("chatBody") && !ACTIVE_CHANNEL) renderChannelList();
            }, () => { /* ignore */ });
    }

    /* ======================================
       THREAD (percakapan 1 channel)
    ====================================== */

    function openThread(channelId, titleLabel) {
        if (UNSUB_THREAD) { UNSUB_THREAD(); UNSUB_THREAD = null; }
        ACTIVE_CHANNEL = channelId;

        renderPanelShell(
            titleLabel || channelId,
            `<div id="chatBody"><div class="chat-empty">Memuat percakapan...</div></div>
             <div id="chatInputRow">
                <input type="text" id="chatMsgInput" placeholder="Tulis pesan...">
                <button id="chatSendBtn">Kirim</button>
             </div>`,
            MY_ROLE === "admin"
        );

        document.getElementById("chatSendBtn").addEventListener("click", sendMessage);
        document.getElementById("chatMsgInput").addEventListener("keydown", (e) => {
            if (e.key === "Enter") sendMessage();
        });

        UNSUB_THREAD = firebase.firestore().collection("chatMessages")
            .where("channelId", "==", channelId)
            .orderBy("createdAt", "asc")
            .limitToLast(200)
            .onSnapshot((snap) => {
                const messages = snap.docs.map(d => d.data());
                renderThread(messages);

                const latest = messages.length ? messages[messages.length - 1].createdAt : 0;
                setLastRead(channelId, Math.max(latest, Date.now() - 1000));

                if (MY_ROLE !== "admin") {
                    window.__chatMyChannelUnread = 0; // sedang dibuka = dianggap sudah dibaca semua
                }
                updateFabBadge();
            }, (err) => {
                console.error(err);
                const body = document.getElementById("chatBody");
                if (body) body.innerHTML = `<div class="chat-empty">Gagal memuat percakapan. Coba tutup &amp; buka lagi.</div>`;
            });
    }

    function renderThread(messages) {
        const body = document.getElementById("chatBody");
        if (!body) return;

        if (messages.length === 0) {
            body.innerHTML = `<div class="chat-empty">Belum ada pesan. Mulai percakapan di bawah 👇</div>`;
            return;
        }

        body.innerHTML = messages.map(m => {
            const mine = m.senderEmail === MY_EMAIL;
            const time = new Date(m.createdAt).toLocaleString("id-ID", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
            return `
                <div class="chat-bubble ${mine ? "me" : "them"}">
                    ${escapeHtml(m.text)}
                    <span class="chat-time">${mine ? "Anda" : (m.senderRole === "admin" ? "Admin" : "Outlet")} · ${time}</span>
                </div>
            `;
        }).join("");

        body.scrollTop = body.scrollHeight + 999;
    }

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = String(str || "");
        return div.innerHTML;
    }

    async function sendMessage() {
        const input = document.getElementById("chatMsgInput");
        const text = input.value.trim();
        if (!text || !ACTIVE_CHANNEL) return;

        input.value = "";
        input.focus();

        try {
            await firebase.firestore().collection("chatMessages").add({
                channelId: ACTIVE_CHANNEL,
                senderEmail: MY_EMAIL,
                senderRole: MY_ROLE,
                text: text.slice(0, 2000),
                createdAt: Date.now()
            });
        } catch (err) {
            console.error(err);
            alert("Gagal mengirim pesan. Cek koneksi internet.");
        }
    }

    /* ======================================
       INIT (dipanggil dari auth-guard.js)
    ====================================== */

    window.initChatWidget = function (email, role, outletId) {
        MY_EMAIL = email;
        MY_ROLE = role;
        MY_OUTLET_ID = outletId;

        injectFab();

        if (role !== "admin" && outletId) {
            // Listener ringan khusus akun outlet: cukup pantau channel sendiri
            // untuk badge unread, tanpa perlu buka panel.
            firebase.firestore().collection("chatMessages")
                .where("channelId", "==", outletId)
                .orderBy("createdAt", "desc")
                .limit(1)
                .onSnapshot((snap) => {
                    if (snap.empty) return;
                    const latest = snap.docs[0].data();
                    if (latest.senderRole === "admin" && latest.createdAt > getLastRead(outletId) && ACTIVE_CHANNEL !== outletId) {
                        window.__chatMyChannelUnread = 1;
                    } else {
                        window.__chatMyChannelUnread = 0;
                    }
                    updateFabBadge();
                }, () => { /* ignore */ });
        }
    };
})();
