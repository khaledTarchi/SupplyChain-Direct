"""
routes/auth.py – Authentication Blueprint
------------------------------------------
Handles login, logout, and registration endpoints.
All passwords are bcrypt-hashed; never stored in plain text.
"""

from flask import Blueprint, request, jsonify, redirect, url_for, session
from flask_login import login_user, logout_user, login_required, current_user
from models import db, User

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["GET"])
def login_page():
    """Serve the login HTML page."""
    from flask import render_template
    if current_user.is_authenticated:
        return _redirect_by_role(current_user.role)
    return render_template("login.html")


@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    """JSON API – authenticate a user and start a session."""
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid credentials."}), 401

    if not user.is_active:
        return jsonify({"error": "Account suspended. Contact admin."}), 403

    login_user(user, remember=True)

    return jsonify({
        "message": "Login successful.",
        "user": user.to_dict(),
        "redirect": _role_url(user.role),
    }), 200


@auth_bp.route("/api/auth/logout", methods=["POST"])
@login_required
def logout():
    logout_user()
    return jsonify({"message": "Logged out."}), 200


@auth_bp.route("/api/auth/register", methods=["POST"])
def register():
    """Register a new shop_owner or driver account."""
    data = request.get_json(silent=True) or {}
    required = ["name", "email", "password", "role"]
    for field in required:
        if not data.get(field):
            return jsonify({"error": f"'{field}' is required."}), 400

    role = data["role"]
    if role not in ("shop_owner", "driver"):
        return jsonify({"error": "Invalid role. Only 'shop_owner' or 'driver' allowed."}), 400

    email = data["email"].strip().lower()
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered."}), 409

    user = User(
        name=data["name"].strip(),
        email=email,
        role=role,
        phone=data.get("phone", ""),
        address=data.get("address", ""),
    )
    user.set_password(data["password"])

    db.session.add(user)
    db.session.commit()

    return jsonify({"message": "Account created successfully.", "user": user.to_dict()}), 201


@auth_bp.route("/api/auth/me", methods=["GET"])
@login_required
def me():
    return jsonify(current_user.to_dict()), 200


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _role_url(role: str) -> str:
    mapping = {
        "admin": "/admin",
        "shop_owner": "/shop",
        "driver": "/driver",
    }
    return mapping.get(role, "/")


def _redirect_by_role(role: str):
    return redirect(_role_url(role))
