"""
routes/pages.py – HTML Page Blueprint
--------------------------------------
Serves the main HTML shell pages for each role.
Flask-Login handles redirects for unauthenticated requests.
"""

from flask import Blueprint, render_template, redirect, url_for
from flask_login import login_required, current_user

pages_bp = Blueprint("pages", __name__)


@pages_bp.route("/")
def index():
    if current_user.is_authenticated:
        role_map = {"admin": "/admin", "shop_owner": "/shop", "driver": "/driver"}
        return redirect(role_map.get(current_user.role, "/login"))
    return redirect(url_for("auth.login_page"))


@pages_bp.route("/shop")
@login_required
def shop_dashboard():
    if current_user.role != "shop_owner":
        return redirect("/")
    return render_template("shop_dashboard.html", user=current_user)


@pages_bp.route("/admin")
@login_required
def admin_dashboard():
    if current_user.role != "admin":
        return redirect("/")
    return render_template("admin_dashboard.html", user=current_user)


@pages_bp.route("/driver")
@login_required
def driver_dashboard():
    if current_user.role != "driver":
        return redirect("/")
    return render_template("driver_dashboard.html", user=current_user)
