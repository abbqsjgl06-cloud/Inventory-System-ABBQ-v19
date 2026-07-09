/* ==========================================
   ABBQ Waste Tracker
   dashboard.js
   Version : 1.0
========================================== */

"use strict";

const Dashboard = (() => {

    let records = [];

    /* ======================================
       INIT
    ====================================== */

    async function init() {

        await load();

    }

    /* ======================================
       LOAD
    ====================================== */

    async function load() {

        records = await DB.getWaste();

        updateSummary();

        updateTopItem();

        updateCategory();

    }

    /* ======================================
       SUMMARY
    ====================================== */

    function updateSummary() {

        const totalEntry = records.length;

        let todayWaste = 0;

        let totalPhoto = 0;

        const today = Helper.today();

        records.forEach(item => {

            if (item.date === today) {

                todayWaste++;

            }

            if (item.photo) {

                totalPhoto++;

            }

        });

        setText("totalEntry", totalEntry);

        setText("todayWaste", todayWaste);

        setText("totalPhoto", totalPhoto);

    }

    /* ======================================
       TOP ITEM
    ====================================== */

    function updateTopItem() {

        const result = {};

        records.forEach(item => {

            if (!result[item.item]) {

                result[item.item] = 0;

            }

            result[item.item] += Number(item.qty);

        });

        const data = Object.entries(result)

            .sort((a, b) => b[1] - a[1])

            .slice(0, 5);

        renderTopItem(data);

    }

    /* ======================================
       TOP CATEGORY
    ====================================== */

    function updateCategory() {

        const result = {};

        records.forEach(item => {

            if (!result[item.category]) {

                result[item.category] = 0;

            }

            result[item.category]++;

        });

        const data = Object.entries(result)

            .sort((a, b) => b[1] - a[1])

            .slice(0, 5);

        renderCategory(data);

    }

    /* ======================================
       RENDER TOP ITEM
    ====================================== */

    function renderTopItem(data) {

        const box = document.getElementById("topItemList");

        if (!box) return;

        box.innerHTML = "";

        if (data.length === 0) {

            box.innerHTML = "<p>Belum ada data</p>";

            return;

        }

        data.forEach(row => {

            const div = document.createElement("div");

            div.className = "dashboard-row";

            div.innerHTML = `

                <span>${row[0]}</span>

                <strong>${row[1]}</strong>

            `;

            box.appendChild(div);

        });

    }

    /* ======================================
       RENDER CATEGORY
    ====================================== */

    function renderCategory(data) {

        const box = document.getElementById("categoryList");

        if (!box) return;

        box.innerHTML = "";

        if (data.length === 0) {

            box.innerHTML = "<p>Belum ada data</p>";

            return;

        }

        data.forEach(row => {

            const div = document.createElement("div");

            div.className = "dashboard-row";

            div.innerHTML = `

                <span>${row[0]}</span>

                <strong>${row[1]}</strong>

            `;

            box.appendChild(div);

        });

    }

    /* ======================================
       SET TEXT
    ====================================== */

    function setText(id, value) {

        const el = document.getElementById(id);

        if (el) {

            el.textContent = value;

        }

    }

    /* ======================================
       RETURN
    ====================================== */

    return {

        init,

        load

    };

})();
