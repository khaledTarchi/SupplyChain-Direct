/**
 * driver.js – Driver Dashboard Logic
 * Handles: delivery status updates, active/completed listing, stats.
 */

// ============================================================
// STATE
// ============================================================
let driverUser = null;
let driverDeliveries = [];
let driverReports = [];

// ============================================================
// INIT
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
    await loadDriverUser();
    await loadDriverData();
    registerServiceWorker();
});

async function loadDriverUser() {
    try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return (window.location.href = "/login");
        driverUser = await res.json();
        document.getElementById("sidebarUserName").textContent = driverUser.name;
    } catch { }
}

async function loadDriverData() {
    try {
        const [delRes, repRes] = await Promise.all([
            fetch("/api/deliveries"),
            fetch("/api/reports"),
        ]);
        driverDeliveries = await delRes.json();
        driverReports = await repRes.json();
        updateDriverStats();
        renderActiveJobs();
        renderCompletedJobs();
    } catch { }
}

function updateDriverStats() {
    const assigned = driverDeliveries.filter((d) => d.status === "assigned").length;
    const transit = driverDeliveries.filter((d) => d.status === "in_transit").length;
    const done = driverDeliveries.filter((d) => d.status === "delivered").length;
    document.getElementById("d-assigned").textContent = assigned;
    document.getElementById("d-transit").textContent = transit;
    document.getElementById("d-done").textContent = done;
}

// ============================================================
// ACTIVE JOBS
// ============================================================
function renderActiveJobs() {
    const el = document.getElementById("activeJobsList");
    const active = driverDeliveries.filter((d) => d.status !== "delivered");
    if (!active.length) {
        el.innerHTML = '<div class="empty-state">No active jobs. Enjoy your break! ☕</div>';
        return;
    }
    el.innerHTML = active
        .map((d) => {
            const report = driverReports.find((r) => r.id === d.report_id);
            return `
      <div class="order-card">
        <div class="order-main">
          <h4>${report ? report.product_name : "Delivery #" + d.id}</h4>
          <span class="status-badge status-${d.status}">${formatStatus(d.status)}</span>
          <div class="order-meta">
            ${report ? `<span>Shop: ${report.shop_name || report.shop_owner_name || "—"}</span>` : ""}
            ${report ? `<span>Qty: ${report.quantity_requested}</span>` : ""}
            ${report ? `<span>📍 ${report.latitude.toFixed(4)}, ${report.longitude.toFixed(4)}</span>` : ""}
            <span>🕐 Assigned: ${timeAgo(d.assigned_at)}</span>
          </div>
        </div>
        <div class="order-actions">
          ${d.status === "assigned"
                    ? `<button class="btn-sm btn-warning" onclick="updateStatus(${d.id},'in_transit')">🚛 Start Delivery</button>`
                    : ""
                }
          ${d.status === "in_transit"
                    ? `<button class="btn-sm btn-success" onclick="updateStatus(${d.id},'delivered')">✅ Mark Delivered</button>`
                    : ""
                }
        </div>
      </div>`;
        })
        .join("");
}

// ============================================================
// COMPLETED JOBS
// ============================================================
function renderCompletedJobs() {
    const el = document.getElementById("completedJobsList");
    const done = driverDeliveries.filter((d) => d.status === "delivered");
    if (!done.length) {
        el.innerHTML = '<div class="empty-state">No completed deliveries yet.</div>';
        return;
    }
    el.innerHTML = done
        .map((d) => {
            const report = driverReports.find((r) => r.id === d.report_id);
            return `
      <div class="order-card">
        <div class="order-main">
          <h4>${report ? report.product_name : "Delivery #" + d.id}</h4>
          <span class="status-badge status-delivered">✅ Delivered</span>
          <div class="order-meta">
            ${report ? `<span>Shop: ${report.shop_name || "—"}</span>` : ""}
            <span>Delivered: ${d.delivered_at ? timeAgo(d.delivered_at) : "—"}</span>
          </div>
          ${d.driver_notes ? `<p style="font-size:.85rem;color:var(--text-secondary);margin-top:.3rem">Note: "${d.driver_notes}"</p>` : ""}
        </div>
      </div>`;
        })
        .join("");
}

// ============================================================
// STATUS UPDATE
// ============================================================
async function updateStatus(deliveryId, newStatus) {
    try {
        const res = await fetch(`/api/deliveries/${deliveryId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) {
            const data = await res.json();
            alert(data.error || "Failed to update status.");
            return;
        }
        await loadDriverData();
    } catch {
        alert("Network error. Please try again.");
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
    const titles = { active: "Active Jobs", completed: "Completed" };
    document.getElementById("pageTitle").textContent = titles[name] || name;
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebarOverlay").classList.remove("show");
}

async function logoutUser() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { }
    window.location.href = "/login";
}

// ============================================================
// SERVICE WORKER
// ============================================================
function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker
            .register("/static/sw.js", { scope: "/" })
            .then((reg) => console.log("[SW] registered:", reg.scope))
            .catch((err) => console.warn("[SW] reg failed:", err));
    }
}

// ============================================================
// HELPERS
// ============================================================
function formatStatus(s) {
    return { pending: "⏳ Pending", assigned: "🎯 Assigned", in_transit: "🚛 In Transit", delivered: "✅ Delivered" }[s] || s;
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
