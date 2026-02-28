/**
 * auth.js – Login & Registration Logic
 * Handles form submission, tab switching, and demo-credential auto-fill.
 */

// ---- Tab switching --------------------------------------------------------
function switchTab(tab) {
  document.getElementById("tab-login").classList.toggle("active", tab === "login");
  document.getElementById("tab-register").classList.toggle("active", tab === "register");
  document.getElementById("form-login").classList.toggle("hidden", tab !== "login");
  document.getElementById("form-register").classList.toggle("hidden", tab !== "register");
}

// ---- Password visibility toggle ------------------------------------------
function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  btn.textContent = isPassword ? "🙈" : "👁";
}

// ---- Demo credentials auto-fill ------------------------------------------
function fillCredentials(email, password) {
  document.getElementById("login-email").value = email;
  document.getElementById("login-password").value = password;
  switchTab("login");
}

// ---- LOGIN ---------------------------------------------------------------
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("loginError");
  const btnEl = document.getElementById("loginBtn");
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  if (!email || !password) {
    showError(errEl, "Please fill in all fields.");
    return;
  }

  setLoading(btnEl, true);
  errEl.classList.add("hidden");

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError(errEl, data.error || "Login failed.");
      setLoading(btnEl, false);
      return;
    }
    // Redirect based on role
    window.location.href = data.redirect || "/";
  } catch {
    showError(errEl, "Network error. Please try again.");
    setLoading(btnEl, false);
  }
});

// ---- REGISTER ------------------------------------------------------------
document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("registerError");
  const successEl = document.getElementById("registerSuccess");
  const btnEl = document.getElementById("registerBtn");

  const name = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  const phone = document.getElementById("reg-phone").value.trim();
  const role = document.querySelector('input[name="role"]:checked').value;

  if (!name || !email || !password) {
    showError(errEl, "Name, email, and password are required.");
    return;
  }
  if (password.length < 6) {
    showError(errEl, "Password must be at least 6 characters.");
    return;
  }

  setLoading(btnEl, true);
  errEl.classList.add("hidden");
  successEl.classList.add("hidden");

  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, phone, role }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError(errEl, data.error || "Registration failed.");
      setLoading(btnEl, false);
      return;
    }
    successEl.textContent = "✅ Account created! You can now sign in.";
    successEl.classList.remove("hidden");
    setLoading(btnEl, false);
    // Auto-switch to login tab
    setTimeout(() => switchTab("login"), 1500);
  } catch {
    showError(errEl, "Network error. Please try again.");
    setLoading(btnEl, false);
  }
});

// ---- Helpers --------------------------------------------------------------
function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove("hidden");
}

function setLoading(btn, loading) {
  const text = btn.querySelector(".btn-text");
  const loader = btn.querySelector(".btn-loader");
  if (loading) {
    text.classList.add("hidden");
    loader.classList.remove("hidden");
    btn.disabled = true;
  } else {
    text.classList.remove("hidden");
    loader.classList.add("hidden");
    btn.disabled = false;
  }
}

// ---- PWA Service Worker Registration -------------------------------------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/static/sw.js", { scope: "/" })
    .then((reg) => console.log("[SW] registered:", reg.scope))
    .catch((err) => console.warn("[SW] registration failed:", err));
}
