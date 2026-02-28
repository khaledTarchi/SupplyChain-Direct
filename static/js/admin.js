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
    await Promise.all([loadStats(), loadReports(), loadDrivers(), loadDeliveries(), loadProducts(), loadRatings()]);
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
          <span style="color:#888">Product:</span> ${p.product}<br/>
          <span style="color:#888">Qty:</span> ${p.quantity}<br/>
          <span style="color:#888">Status:</span> ${p.status}<br/>
          <span style="color:#888">Reported:</span> ${timeAgo(p.created_at)}
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
        el.innerHTML = '<div class="empty-state">No reports found.</div>';
        return;
    }
    el.innerHTML = list
        .map(
            (r) => `
    <div class="order-card">
      <div class="order-main">
        <h4>${r.product_name || "Product #" + r.product_id}</h4>
        <span class="status-badge status-${r.status}">${formatStatus(r.status)}</span>
        <div class="order-meta">
          <span>Shop: ${r.shop_name || r.shop_owner_name || "—"}</span>
          <span>Qty: ${r.quantity_requested}</span>
          <span>📍 ${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}</span>
          <span>🕐 ${timeAgo(r.created_at)}</span>
        </div>
      </div>
      <div class="order-actions">
        ${r.status === "pending" ? `<button class="btn-sm btn-assign" onclick="openAssignModal(${r.id})">🎯 Assign Driver</button>` : ""}
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
        el.innerHTML = '<div class="empty-state">No pending reports 🎉</div>';
        return;
    }
    el.innerHTML = pending
        .map(
            (r) => `
    <div class="order-item">
      <span><strong>${r.product_name}</strong> — ${r.shop_name || r.shop_owner_name}</span>
      <button class="btn-sm btn-assign" onclick="openAssignModal(${r.id})">Assign</button>
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
        errEl.textContent = "Select a driver.";
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
        errEl.textContent = "Network error.";
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
        el.innerHTML = '<div class="empty-state">No deliveries yet.</div>';
        return;
    }
    el.innerHTML = allDeliveries
        .map(
            (d) => `
    <div class="order-card">
      <div class="order-main">
        <h4>Delivery #${d.id}</h4>
        <span class="status-badge status-${d.status}">${formatStatus(d.status)}</span>
        <div class="order-meta">
          <span>Report #${d.report_id}</span>
          <span>Driver: ${d.driver_name || "—"}</span>
          <span>Assigned: ${timeAgo(d.assigned_at)}</span>
          ${d.delivered_at ? `<span>Done: ${timeAgo(d.delivered_at)}</span>` : ""}
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
            el.innerHTML = '<div class="empty-state">No products.</div>';
            return;
        }
        el.innerHTML = products
            .map(
                (p) => `
      <div class="product-card">
        <h4>${p.name}</h4>
        <p class="prod-meta">${p.description || ""}</p>
        <p class="prod-meta">Unit: ${p.unit} • Stock: ${p.stock_quantity} • Category: ${p.category || "—"}</p>
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
        errEl.textContent = "Name and price are required.";
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
            el.innerHTML = '<div class="empty-state">No ratings yet.</div>';
            return;
        }
        el.innerHTML = ratings
            .map(
                (r) => `
      <div class="order-card">
        <div class="order-main">
          <h4>Rating #${r.id} — ${"★".repeat(r.score)}${"☆".repeat(5 - r.score)}</h4>
          <div class="order-meta">
            <span>Delivery #${r.delivery_id}</span>
            <span>Report #${r.report_id}</span>
            <span>🕐 ${timeAgo(r.created_at)}</span>
          </div>
          ${r.comment ? `<p style="font-size:.85rem;color:var(--text-secondary);margin-top:.4rem">"${r.comment}"</p>` : ""}
        </div>
      </div>`
            )
            .join("");
    } catch { }
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
        overview: "Dashboard",
        map: "Shortage Map",
        reports: "All Reports",
        deliveries: "Deliveries",
        products: "Products",
        ratings: "Ratings",
    };
    document.getElementById("pageTitle").textContent = titles[name] || name;
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
function formatStatus(s) {
    const map = { pending: "⏳ Pending", assigned: "🎯 Assigned", in_transit: "🚛 In Transit", delivered: "✅ Delivered" };
    return map[s] || s;
}
function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}
