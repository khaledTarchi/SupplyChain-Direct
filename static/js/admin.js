/**
 * admin.js – Wholesaler / Admin Dashboard Logic
 * Handles: stats, Leaflet map, reports list, driver assignment,
 * deliveries, products CRUD, and ratings view.
 */

// ============================================================
// STATE
// ============================================================
let adminUser = null;
let allReports = [];
let allDrivers = [];
let allDeliveries = [];
let leafletMap = null;
let miniLeafletMap = null;
let mapMarkers = [];
let assignTargetReportId = null;

// ============================================================
// INIT
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
    await loadAdminUser();
    await Promise.all([loadStats(), loadReports(), loadDrivers(), loadDeliveries(), loadProducts(), loadRatings(), loadComplaints()]);
    initMaps();
});

async function loadAdminUser() {
    try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return (window.location.href = "/login");
        adminUser = await res.json();
        document.getElementById("sidebarUserName").textContent = adminUser.name;
    } catch { }
}

// ============================================================
// STATS
// ============================================================
async function loadStats() {
    try {
        const res = await fetch("/api/stats");
        const s = await res.json();
        document.getElementById("s-total").textContent = s.total_reports;
        document.getElementById("s-pending").textContent = s.pending;
        document.getElementById("s-transit").textContent = s.in_transit;
        document.getElementById("s-delivered").textContent = s.delivered;
        document.getElementById("s-drivers").textContent = s.total_drivers;
        document.getElementById("s-rating").textContent = s.avg_rating ? `${s.avg_rating} / 5` : "—";
    } catch { }
}

// ============================================================
// LEAFLET MAP(S)
// ============================================================
function initMaps() {
    // Mini map in overview
    miniLeafletMap = L.map("miniMap").setView([36.75, 3.06], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "© OpenStreetMap",
    }).addTo(miniLeafletMap);

    // Full map
    leafletMap = L.map("fullMap").setView([36.75, 3.06], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "© OpenStreetMap",
    }).addTo(leafletMap);

    loadHeatmapData();

    // Fix map render after tab switch
    const observer = new MutationObserver(() => {
        if (document.getElementById("section-map").classList.contains("active")) {
            setTimeout(() => leafletMap.invalidateSize(), 200);
        }
        if (document.getElementById("section-overview").classList.contains("active")) {
            setTimeout(() => miniLeafletMap.invalidateSize(), 200);
        }
    });
    document.querySelectorAll(".content-section").forEach((sec) => {
        observer.observe(sec, { attributes: true, attributeFilter: ["class"] });
    });
}

async function loadHeatmapData() {
    try {
        const res = await fetch("/api/map/heatmap");
        const points = await res.json();
        // Clear old markers
        mapMarkers.forEach((m) => {
            miniLeafletMap.removeLayer(m);
            leafletMap.removeLayer(m);
        });
        mapMarkers = [];

        points.forEach((p) => {
            const color = p.status === "pending" ? "#ef4444" : "#f59e0b";
            const icon = L.divIcon({
                className: "custom-marker",
                html: `<div style="
          width:18px;height:18px;border-radius:50%;
          background:${color};border:2px solid #fff;
          box-shadow:0 0 8px ${color};
        "></div>`,
                iconSize: [18, 18],
                iconAnchor: [9, 9],
            });

            const popup = `
        <div style="font-family:Inter,sans-serif;min-width:160px">
          <strong>${p.shop_name}</strong><br/>
          <span style="color:#888">${t('product_label')}:</span> ${p.product}<br/>
          <span style="color:#888">${t('qty_label')}:</span> ${p.quantity}<br/>
          <span style="color:#888">${t('status_label')}:</span> ${p.status}<br/>
          <span style="color:#888">${t('reported_label')}:</span> ${timeAgo(p.created_at)}
        </div>`;

            const m1 = L.marker([p.lat, p.lng], { icon }).addTo(miniLeafletMap).bindPopup(popup);
            const m2 = L.marker([p.lat, p.lng], { icon }).addTo(leafletMap).bindPopup(popup);
            mapMarkers.push(m1, m2);
        });

        // Fit bounds
        if (points.length) {
            const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
            miniLeafletMap.fitBounds(bounds, { padding: [30, 30] });
            leafletMap.fitBounds(bounds, { padding: [30, 30] });
        }
    } catch { }
}

// ============================================================
// REPORTS
// ============================================================
async function loadReports() {
    try {
        const res = await fetch("/api/reports");
        allReports = await res.json();
        renderAdminReports();
        renderPendingQuick();
    } catch { }
}

function renderAdminReports(filter = "all") {
    const el = document.getElementById("adminReportsList");
    const list = filter === "all" ? allReports : allReports.filter((r) => r.status === filter);
    if (!list.length) {
        el.innerHTML = `<div class="empty-state">${t('no_reports')}</div>`;
        return;
    }
    el.innerHTML = list
        .map(
            (r) => `
    <div class="order-card">
      <div class="order-main">
        <h4>${r.product_name || t('product_label') + ' #' + r.product_id}</h4>
        <span class="status-badge status-${r.status}">${formatStatus(r.status)}</span>
        <div class="order-meta">
          <span>${t('shop_label')}: ${r.shop_name || r.shop_owner_name || '—'}</span>
          <span>${t('qty_label')}: ${r.quantity_requested}</span>
          <span>📍 ${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}</span>
          <span>🕐 ${timeAgo(r.created_at)}</span>
        </div>
      </div>
      <div class="order-actions">
        ${r.status === 'pending' ? `<button class="btn-sm btn-assign" onclick="openAssignModal(${r.id})">🎯 ${t('assign_driver_btn')}</button>` : ''}
      </div>
    </div>`
        )
        .join("");
}

function filterAdminReports(val) {
    renderAdminReports(val);
}

function renderPendingQuick() {
    const el = document.getElementById("pendingQuickList");
    const pending = allReports.filter((r) => r.status === "pending").slice(0, 5);
    if (!pending.length) {
        el.innerHTML = `<div class="empty-state">${t('no_pending_reports')}</div>`;
        return;
    }
    el.innerHTML = pending
        .map(
            (r) => `
    <div class="order-item">
      <span><strong>${r.product_name}</strong> — ${r.shop_name || r.shop_owner_name}</span>
      <button class="btn-sm btn-assign" onclick="openAssignModal(${r.id})">${t('assign_btn')}</button>
    </div>`
        )
        .join("");
}

// ============================================================
// DRIVER ASSIGNMENT
// ============================================================
async function loadDrivers() {
    try {
        const res = await fetch("/api/users/drivers");
        allDrivers = await res.json();
    } catch { }
}

function openAssignModal(reportId) {
    assignTargetReportId = reportId;
    const r = allReports.find((x) => x.id === reportId);
    document.getElementById("assignReportInfo").textContent = r
        ? `Report #${r.id}: ${r.product_name} × ${r.quantity_requested} — ${r.shop_name}`
        : `Report #${reportId}`;

    const sel = document.getElementById("driverSelect");
    sel.innerHTML = allDrivers
        .map((d) => `<option value="${d.id}">${d.name} (${d.phone || "—"})</option>`)
        .join("");

    document.getElementById("assignError").classList.add("hidden");
    document.getElementById("assignModal").classList.remove("hidden");
}
function closeAssignModal() {
    document.getElementById("assignModal").classList.add("hidden");
}

async function confirmAssign() {
    const errEl = document.getElementById("assignError");
    errEl.classList.add("hidden");
    const driverId = document.getElementById("driverSelect").value;
    if (!driverId) {
        errEl.textContent = t("select_driver_err");
        errEl.classList.remove("hidden");
        return;
    }
    try {
        const res = await fetch("/api/deliveries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ report_id: assignTargetReportId, driver_id: Number(driverId) }),
        });
        const data = await res.json();
        if (!res.ok) {
            errEl.textContent = data.error;
            errEl.classList.remove("hidden");
            return;
        }
        closeAssignModal();
        await Promise.all([loadReports(), loadDeliveries(), loadStats(), loadHeatmapData()]);
    } catch {
        errEl.textContent = t("network_error");
        errEl.classList.remove("hidden");
    }
}

// ============================================================
// DELIVERIES
// ============================================================
async function loadDeliveries() {
    try {
        const res = await fetch("/api/deliveries");
        allDeliveries = await res.json();
        renderAdminDeliveries();
    } catch { }
}

function renderAdminDeliveries() {
    const el = document.getElementById("adminDeliveriesList");
    if (!allDeliveries.length) {
        el.innerHTML = `<div class="empty-state">${t('no_deliveries')}</div>`;
        return;
    }
    el.innerHTML = allDeliveries
        .map(
            (d) => `
    <div class="order-card">
      <div class="order-main">
        <h4>${t('delivery_label')} #${d.id}</h4>
        <span class="status-badge status-${d.status}">${formatStatus(d.status)}</span>
        <div class="order-meta">
          <span>${t('report_label')} #${d.report_id}</span>
          <span>${t('driver_label')}: ${d.driver_name || '—'}</span>
          <span>${t('assigned_label')}: ${timeAgo(d.assigned_at)}</span>
          ${d.delivered_at ? `<span>${t('done_label')}: ${timeAgo(d.delivered_at)}</span>` : ''}
        </div>
      </div>
    </div>`
        )
        .join("");
}

// ============================================================
// PRODUCTS
// ============================================================
async function loadProducts() {
    try {
        const res = await fetch("/api/products");
        const products = await res.json();
        const el = document.getElementById("productsList");
        if (!products.length) {
            el.innerHTML = `<div class="empty-state">${t('no_products')}</div>`;
            return;
        }
        el.innerHTML = products
            .map(
                (p) => `
      <div class="product-card">
        <h4>${p.name}</h4>
        <p class="prod-meta">${p.description || ''}</p>
        <p class="prod-meta">${t('unit_label')}: ${p.unit} • ${t('stock_label')}: ${p.stock_quantity} • ${t('category_label')}: ${p.category || '—'}</p>
        <p class="prod-price">${p.price_per_unit} DA / ${p.unit}</p>
      </div>`
            )
            .join("");
    } catch { }
}

function openProductModal() {
    document.getElementById("productError").classList.add("hidden");
    document.getElementById("productForm").reset();
    document.getElementById("productModal").classList.remove("hidden");
}
function closeProductModal() {
    document.getElementById("productModal").classList.add("hidden");
}

document.getElementById("productForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("productError");
    errEl.classList.add("hidden");

    const payload = {
        name: document.getElementById("prod-name").value.trim(),
        price_per_unit: Number(document.getElementById("prod-price").value),
        stock_quantity: Number(document.getElementById("prod-stock").value || 0),
        unit: document.getElementById("prod-unit").value.trim() || "unit",
        category: document.getElementById("prod-cat").value.trim(),
        description: document.getElementById("prod-desc").value.trim(),
    };

    if (!payload.name || !payload.price_per_unit) {
        errEl.textContent = t("name_price_required");
        errEl.classList.remove("hidden");
        return;
    }

    try {
        const res = await fetch("/api/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
            errEl.textContent = data.error;
            errEl.classList.remove("hidden");
            return;
        }
        closeProductModal();
        await loadProducts();
    } catch {
        errEl.textContent = "Network error.";
        errEl.classList.remove("hidden");
    }
});

// ============================================================
// RATINGS
// ============================================================
async function loadRatings() {
    try {
        const res = await fetch("/api/ratings");
        const ratings = await res.json();
        const el = document.getElementById("ratingsList");
        if (!ratings.length) {
            el.innerHTML = `<div class="empty-state">${t('no_ratings')}</div>`;
            return;
        }
        el.innerHTML = ratings
            .map(
                (r) => `
      <div class="order-card">
        <div class="order-main">
          <h4>${t('rating_label')} #${r.id} — ${"★".repeat(r.score)}${"☆".repeat(5 - r.score)}</h4>
          <div class="order-meta">
            <span>${t('delivery_label')} #${r.delivery_id}</span>
            <span>${t('report_label')} #${r.report_id}</span>
            <span>🕐 ${timeAgo(r.created_at)}</span>
          </div>
          ${r.comment ? `<p style="font-size:.85rem;color:var(--text-secondary);margin-top:.4rem">"${r.comment}"</p>` : ''}
        </div>
      </div>`
            )
            .join("");
    } catch { }
}

// ============================================================
// COMPLAINTS
// ============================================================
async function loadComplaints() {
    try {
        const res = await fetch("/api/complaints");
        if (!res.ok) return;
        const complaints = await res.json();

        const el = document.getElementById("adminComplaintsList");
        if (!complaints.length) {
            el.innerHTML = '<div class="empty-state">No complaints found.</div>';
            return;
        }

        el.innerHTML = complaints.map(c => `
            <div class="card" style="margin-bottom: 1rem; text-align: left;">
              <div class="card-header" style="flex-direction: column; align-items: flex-start;">
                <h4 style="margin:0">${c.subject}</h4>
                <div style="font-size: 0.85rem; color: var(--text-secondary); margin: 0.3rem 0;">${t('from_label') || 'From'}: ${c.user_name}</div>
                <span class="status-badge status-${c.status === 'closed' ? 'delivered' : 'pending'}">${c.status === 'closed' ? t('complaint_closed') : t('complaint_open')}</span>
              </div>
              <div style="padding: 1rem">
                  <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem">🕐 ${timeAgo(c.created_at)}</p>
                  <p style="margin:0">${c.message}</p>
              </div>
            </div>
        `).join("");
    } catch {
        console.error("Failed to load complaints");
    }
}

// ============================================================
// SIDEBAR & SECTIONS
// ============================================================
function toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("open");
    document.getElementById("sidebarOverlay").classList.toggle("show");
}

function showSection(name) {
    document.querySelectorAll(".content-section").forEach((s) => s.classList.remove("active"));
    document.getElementById("section-" + name).classList.add("active");
    document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active"));
    const link = document.querySelector(`.nav-link[onclick*="${name}"]`);
    if (link) link.classList.add("active");
    const titles = {
        overview: "nav_overview",
        map: "nav_map",
        reports: "reports_heading",
        deliveries: "nav_deliveries",
        products: "nav_products",
        ratings: "nav_ratings",
        complaints: "nav_complaints"
    };

    const pageTitle = document.getElementById("pageTitle");
    const key = titles[name] || name;
    pageTitle.setAttribute("data-i18n", key);
    const lang = localStorage.getItem("preferred_language") || "en";
    if (typeof translations !== 'undefined' && translations[lang] && translations[lang][key]) {
        pageTitle.textContent = translations[lang][key];
    } else {
        pageTitle.textContent = name; // Fallback
    }
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebarOverlay").classList.remove("show");

    // Invalidate map sizes after switching
    setTimeout(() => {
        if (leafletMap) leafletMap.invalidateSize();
        if (miniLeafletMap) miniLeafletMap.invalidateSize();
    }, 250);
}

async function logoutUser() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { }
    window.location.href = "/login";
}

// ============================================================
// HELPERS
// ============================================================
function t(key) {
    const lang = localStorage.getItem("preferred_language") || "en";
    return (typeof translations !== 'undefined' && translations[lang] && translations[lang][key])
        ? translations[lang][key]
        : key;
}

function formatStatus(s) {
    const map = {
        pending: () => `⏳ ${t("pending")}`,
        assigned: () => `🎯 ${t("assigned")}`,
        in_transit: () => `🚛 ${t("in_transit")}`,
        delivered: () => `✅ ${t("delivered")}`
    };
    return (map[s] ? map[s]() : s);
}
function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t("just_now");
    if (mins < 60) return `${mins}${t("min_ago")}`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}${t("hr_ago")}`;
    return `${Math.floor(hrs / 24)}${t("day_ago")}`;
}
