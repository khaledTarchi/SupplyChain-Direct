/**
 * shop.js – Shop Owner Dashboard Logic
 * Handles: GPS geolocation, shortage report submission,
 * order listing/filtering, delivery feedback, offline indicator, and PWA.
 */

// ============================================================
// STATE
// ============================================================
let currentUser = null;
let myReports = [];
let gpsLat = null;
let gpsLng = null;
let selectedDeliveryId = null;
let selectedRatingScore = 0;

// ============================================================
// INIT
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
    await loadCurrentUser();
    await loadProducts();
    await loadMyReports();
    await loadComplaints();
    setupOfflineDetection();
    registerServiceWorker();
});

// ---- Load current user ---------------------------------------------------
async function loadCurrentUser() {
    try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return (window.location.href = "/login");
        currentUser = await res.json();
        document.getElementById("sidebarUserName").textContent = currentUser.name;
        document.getElementById("greetName").textContent = currentUser.name.split(" ")[0];
    } catch {
        /* offline */
    }
}

// ---- Load products into select -------------------------------------------
async function loadProducts() {
    try {
        const res = await fetch("/api/products");
        const products = await res.json();
        const sel = document.getElementById("product-select");
        sel.innerHTML = '<option value="">— Choose a product —</option>';
        products.forEach((p) => {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = `${p.name}  (${p.price_per_unit} DA / ${p.unit})`;
            sel.appendChild(opt);
        });
    } catch {
        /* offline — select stays as-is */
    }
}

// ---- Load my reports -----------------------------------------------------
async function loadMyReports() {
    try {
        const res = await fetch("/api/reports");
        if (!res.ok) return;
        myReports = await res.json();
        updateStats();
        renderRecentOrders();
        renderOrders();
        renderDeliveries();
    } catch {
        /* offline */
    }
}

function updateStats() {
    const total = myReports.length;
    const pending = myReports.filter((r) => r.status === "pending").length;
    const transit = myReports.filter((r) => r.status === "in_transit").length;
    const delivered = myReports.filter((r) => r.status === "delivered").length;
    document.getElementById("stat-total").textContent = total;
    document.getElementById("stat-pending").textContent = pending;
    document.getElementById("stat-transit").textContent = transit;
    document.getElementById("stat-delivered").textContent = delivered;
}

function renderRecentOrders() {
    const el = document.getElementById("recentOrdersList");
    const recent = myReports.slice(0, 5);
    if (!recent.length) {
        el.innerHTML = '<div class="empty-state">No reports yet. Report your first shortage!</div>';
        return;
    }
    el.innerHTML = recent
        .map(
            (r) => `
    <div class="order-item">
      <span><strong>${r.product_name || "Product"}</strong> × ${r.quantity_requested}</span>
      <span class="status-badge status-${r.status}">${formatStatus(r.status)}</span>
    </div>`
        )
        .join("");
}

function renderOrders(filter = "all") {
    const el = document.getElementById("ordersList");
    const list = filter === "all" ? myReports : myReports.filter((r) => r.status === filter);
    if (!list.length) {
        el.innerHTML = '<div class="empty-state">No orders match this filter.</div>';
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
          <span>Qty: ${r.quantity_requested}</span>
          <span>📍 ${r.shop_name || "—"}</span>
          <span>🕐 ${timeAgo(r.created_at)}</span>
        </div>
        ${r.notes ? `<p style="font-size:.82rem;color:var(--text-secondary);margin-top:.3rem">"${r.notes}"</p>` : ""}
      </div>
    </div>`
        )
        .join("");
}
function filterOrders(val) {
    renderOrders(val);
}

// ---- Deliveries / Feedback -----------------------------------------------
async function renderDeliveries() {
    const el = document.getElementById("deliveriesList");
    const delivered = myReports.filter((r) => r.status === "delivered");
    if (!delivered.length) {
        el.innerHTML = '<div class="empty-state">No completed deliveries yet.</div>';
        return;
    }
    el.innerHTML = delivered
        .map(
            (r) => `
    <div class="order-card">
      <div class="order-main">
        <h4>${r.product_name}</h4>
        <span class="status-badge status-delivered">Delivered</span>
        <div class="order-meta">
          <span>Qty: ${r.quantity_requested}</span>
          <span>🕐 ${timeAgo(r.updated_at || r.created_at)}</span>
        </div>
      </div>
      <div class="order-actions">
        <button class="btn-sm btn-warning" onclick="openRatingModal(${r.id})">⭐ Rate Driver</button>
      </div>
    </div>`
        )
        .join("");
}

// ---- Rating modal --------------------------------------------------------
function openRatingModal(reportId) {
    // Find the delivery_id via a fetch to get related info
    selectedDeliveryId = null;
    selectedRatingScore = 0;
    document.querySelectorAll(".star").forEach((s) => s.classList.remove("active"));
    document.getElementById("ratingComment").value = "";
    document.getElementById("ratingError").classList.add("hidden");

    // We need the delivery id — fetch the report
    fetch(`/api/reports/${reportId}`)
        .then((r) => r.json())
        .then(async () => {
            // The delivery info must be fetched; for simplicity, we store reportId
            // and let the backend accept report_id based lookup or we use the deliveries list
            const delRes = await fetch("/api/reports");
            const allReports = await delRes.json();
            // We don't have a direct deliveries endpoint for shop owners, so we
            // pass report id and handle on backend. Workaround: admin deliveries are hidden.
            // We'll store report id and look it up
            selectedDeliveryId = reportId; // we'll adapt backend if needed
            document.getElementById("ratingDeliveryInfo").textContent =
                "Report #" + reportId;
            document.getElementById("ratingModal").classList.remove("hidden");
        })
        .catch(() => {
            alert("Could not load delivery details. Try again.");
        });
}
function closeRatingModal() {
    document.getElementById("ratingModal").classList.add("hidden");
}
function selectStar(val) {
    selectedRatingScore = val;
    document.querySelectorAll(".star").forEach((s) => {
        s.classList.toggle("active", Number(s.dataset.v) <= val);
    });
}
async function submitRating() {
    const errEl = document.getElementById("ratingError");
    errEl.classList.add("hidden");

    if (!selectedRatingScore) {
        errEl.textContent = "Please select a star rating.";
        errEl.classList.remove("hidden");
        return;
    }
    // We need the delivery_id. We'll fetch it via the admin deliveries or rely on
    // a simple approach: fetch deliveries for the current report
    try {
        // Attempt to get delivery id from report
        const rRes = await fetch(`/api/reports/${selectedDeliveryId}`);
        const report = await rRes.json();

        // Fetch all deliveries to find the one matching
        // The shop owner doesn't have /api/deliveries access,
        // but we can add a report-based rating endpoint workaround.
        // For now, let's try to post with report_id and get delivery from backend
        const res = await fetch("/api/ratings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                report_id: selectedDeliveryId, // using report_id for lookup
                score: selectedRatingScore,
                comment: document.getElementById("ratingComment").value.trim(),
            }),
        });
        const data = await res.json();
        if (!res.ok) {
            errEl.textContent = data.error || "Failed to submit rating.";
            errEl.classList.remove("hidden");
            return;
        }
        closeRatingModal();
        await loadMyReports();
    } catch {
        errEl.textContent = "Network error. Try again.";
        errEl.classList.remove("hidden");
    }
}

// ============================================================
// GPS GEOLOCATION
// ============================================================
function getGPS() {
    const statusText = document.getElementById("gpsText");
    const coordsEl = document.getElementById("gpsCoords");
    const widget = document.getElementById("gpsWidget");
    const submitBtn = document.getElementById("reportBtn");

    if (!navigator.geolocation) {
        statusText.textContent = "Geolocation is not supported by your browser.";
        return;
    }
    statusText.textContent = "Acquiring location…";

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            gpsLat = pos.coords.latitude;
            gpsLng = pos.coords.longitude;
            statusText.textContent = "Location acquired ✓";
            document.getElementById("gpsLat").textContent = gpsLat.toFixed(6);
            document.getElementById("gpsLng").textContent = gpsLng.toFixed(6);
            coordsEl.classList.remove("hidden");
            widget.classList.add("success");
            submitBtn.disabled = false;
        },
        (err) => {
            statusText.textContent = `Error: ${err.message}. Using default location.`;
            // Default fallback — Algiers
            gpsLat = 36.7538;
            gpsLng = 3.0588;
            document.getElementById("gpsLat").textContent = gpsLat.toFixed(6);
            document.getElementById("gpsLng").textContent = gpsLng.toFixed(6);
            coordsEl.classList.remove("hidden");
            submitBtn.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// ============================================================
// SHORTAGE REPORT SUBMISSION
// ============================================================
document.getElementById("shortageForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("reportError");
    const successEl = document.getElementById("reportSuccess");
    const btn = document.getElementById("reportBtn");
    errEl.classList.add("hidden");
    successEl.classList.add("hidden");

    const product_id = document.getElementById("product-select").value;
    const quantity = document.getElementById("qty-input").value;
    const shopName = document.getElementById("shop-name-input").value.trim();
    const notes = document.getElementById("notes-input").value.trim();

    if (!product_id) {
        showFormMsg(errEl, "Please select a product.");
        return;
    }
    if (!gpsLat || !gpsLng) {
        showFormMsg(errEl, "Please fetch your GPS location first.");
        return;
    }

    const payload = {
        product_id: Number(product_id),
        quantity_requested: Number(quantity),
        latitude: gpsLat,
        longitude: gpsLng,
        shop_name: shopName || currentUser?.name || "",
        notes,
    };

    // Check online status — if offline, queue for Background Sync
    if (!navigator.onLine) {
        queueOfflineReport(payload);
        showFormMsg(successEl, "📡 You are offline. Report saved and will sync automatically!");
        return;
    }

    btn.disabled = true;
    try {
        const res = await fetch("/api/reports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
            showFormMsg(errEl, data.error || "Submission failed.");
            btn.disabled = false;
            return;
        }
        showFormMsg(successEl, "✅ Report submitted successfully!");
        document.getElementById("shortageForm").reset();
        gpsLat = gpsLng = null;
        document.getElementById("gpsCoords").classList.add("hidden");
        document.getElementById("gpsWidget").classList.remove("success");
        document.getElementById("gpsText").textContent = "Tap to fetch your GPS location";
        btn.disabled = true;
        await loadMyReports();
    } catch {
        // Queue for background sync
        queueOfflineReport(payload);
        showFormMsg(successEl, "📡 Network issue. Report queued for Background Sync.");
    }
    btn.disabled = false;
});

// ---- Offline queue via IndexedDB ------------------------------------------
function queueOfflineReport(payload) {
    if ("serviceWorker" in navigator && "SyncManager" in window) {
        // Store in IndexedDB
        const openDB = indexedDB.open("scd-offline", 1);
        openDB.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("pending-reports")) {
                db.createObjectStore("pending-reports", { autoIncrement: true });
            }
        };
        openDB.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction("pending-reports", "readwrite");
            tx.objectStore("pending-reports").add(payload);
            tx.oncomplete = () => {
                navigator.serviceWorker.ready.then((reg) => {
                    reg.sync.register("sync-reports");
                });
            };
        };
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
    // Update nav
    document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active"));
    const link = document.querySelector(`.nav-link[href="#${name}"]`) ||
        document.querySelector(`.nav-link[onclick*="${name}"]`);
    if (link) link.classList.add("active");
    // Update topbar title
    const titles = {
        overview: "nav_overview",
        report: "nav_report",
        orders: "nav_orders",
        deliveries: "nav_deliveries",
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
    // Close mobile sidebar
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebarOverlay").classList.remove("show");
}

// ============================================================
// LOGOUT
// ============================================================
async function logoutUser() {
    try {
        await fetch("/api/auth/logout", { method: "POST" });
    } catch { }
    window.location.href = "/login";
}

// ============================================================
// OFFLINE DETECTION
// ============================================================
function setupOfflineDetection() {
    const banner = document.getElementById("offlineBanner");
    const badge = document.getElementById("signalBadge");

    function updateOnlineStatus() {
        if (navigator.onLine) {
            banner.classList.remove("visible");
            badge.innerHTML = '<span class="signal-dot online"></span><span class="signal-label">Online</span>';
        } else {
            banner.classList.add("visible");
            badge.innerHTML = '<span class="signal-dot offline"></span><span class="signal-label">Offline</span>';
        }
    }

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    updateOnlineStatus();
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
// COMPLAINTS
// ============================================================
async function loadComplaints() {
    try {
        const res = await fetch("/api/complaints");
        if (!res.ok) return;
        const complaints = await res.json();

        const el = document.getElementById("complaintsList");
        if (!complaints.length) {
            el.innerHTML = '<div class="empty-state">No complaints found.</div>';
            return;
        }

        el.innerHTML = complaints.map(c => `
            <div class="order-card">
              <div class="order-main">
                <h4>${c.subject}</h4>
                <span class="status-badge status-${c.status === 'closed' ? 'delivered' : 'pending'}">${c.status === 'closed' ? t('complaint_closed') : t('complaint_open')}</span>
                <div class="order-meta">
                  <span>🕐 ${timeAgo(c.created_at)}</span>
                </div>
                <p style="font-size:.82rem;color:var(--text-secondary);margin-top:.5rem">"${c.message}"</p>
              </div>
            </div>
        `).join("");
    } catch {
        /* offline */
    }
}

function openComplaintModal() {
    document.getElementById("complaintSubject").value = "";
    document.getElementById("complaintMessage").value = "";
    document.getElementById("complaintError").classList.add("hidden");
    document.getElementById("complaintSuccess").classList.add("hidden");
    document.getElementById("complaintModal").classList.remove("hidden");
}

function closeComplaintModal() {
    document.getElementById("complaintModal").classList.add("hidden");
}

async function submitComplaint() {
    const errEl = document.getElementById("complaintError");
    const successEl = document.getElementById("complaintSuccess");
    errEl.classList.add("hidden");
    successEl.classList.add("hidden");

    const subject = document.getElementById("complaintSubject").value.trim();
    const message = document.getElementById("complaintMessage").value.trim();

    if (!subject || !message) {
        showFormMsg(errEl, "Both subject and message are required.");
        return;
    }

    try {
        const res = await fetch("/api/complaints", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject, message })
        });

        const data = await res.json();
        if (!res.ok) {
            showFormMsg(errEl, data.error || "Failed to submit complaint.");
            return;
        }

        showFormMsg(successEl, "✅ Complaint submitted successfully.");

        setTimeout(() => {
            closeComplaintModal();
            loadComplaints();
        }, 1500);

    } catch {
        showFormMsg(errEl, "Network error. Try again.");
    }
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
function showFormMsg(el, msg) {
    el.textContent = msg;
    el.classList.remove("hidden");
}
