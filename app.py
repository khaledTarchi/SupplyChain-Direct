"""
app.py – DistribDZ Online Main Server
----------------------------------------
Flask application factory with:
  - Session-based authentication (Flask-Login)
  - Role-based access control decorators
  - RESTful JSON API endpoints
  - Automatic DB initialization with seed data
"""

import os
from datetime import datetime
from functools import wraps

from flask import (
    Flask, render_template, request, jsonify,
    redirect, url_for, session, abort
)
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from flask_cors import CORS

from models import db, bcrypt, User, Product, ShortageReport, Delivery, Rating, Complaint

# ---------------------------------------------------------------------------
# Application Factory
# ---------------------------------------------------------------------------
def create_app() -> Flask:
    app = Flask(__name__)

    # ---- Core config -------------------------------------------------------
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "scd-dev-secret-2024")
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    app.config["SQLALCHEMY_DATABASE_URI"] = (
        "sqlite:///" + os.path.join(BASE_DIR, "supplychain.db")
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

    # ---- Extensions --------------------------------------------------------
    db.init_app(app)
    bcrypt.init_app(app)
    CORS(app, supports_credentials=True)

    # ---- Flask-Login -------------------------------------------------------
    login_manager = LoginManager(app)
    login_manager.login_view = "auth.login_page"

    @login_manager.user_loader
    def load_user(user_id: str):
        return db.session.get(User, int(user_id))

    # ---- Register blueprints -----------------------------------------------
    from routes.auth import auth_bp
    from routes.api import api_bp
    from routes.pages import pages_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(api_bp, url_prefix="/api")
    app.register_blueprint(pages_bp)

    # ---- DB init + seed ----------------------------------------------------
    with app.app_context():
        db.create_all()
        _seed_if_empty()

    return app


# ---------------------------------------------------------------------------
# Seed initial data
# ---------------------------------------------------------------------------
def _seed_if_empty():
    return  # auto-seeding disabled – accounts are managed manually
    if User.query.first():
        return  # already seeded

    # Admin / Wholesaler
    admin = User(name="Ahmed Admin", email="admin@scd.com", role="admin", phone="+213600000001")
    admin.set_password("admin123")

    # Shop owner
    shop1 = User(name="Karim Boudjemaa", email="karim@scd.com", role="shop_owner",
                 phone="+213600000002", address="Rue Didouche Mourad, Alger")
    shop1.set_password("shop123")

    # Driver
    driver1 = User(name="Youcef Hadjadj", email="youcef@scd.com", role="driver",
                   phone="+213600000003")
    driver1.set_password("driver123")

    # Products
    products = [
        Product(name="Huile de table 5L", description="Huile végétale raffinée", unit="bouteille",
                price_per_unit=850.0, stock_quantity=500, category="Épicerie"),
        Product(name="Sucre en poudre 50kg", description="Sucre blanc granulé", unit="sac",
                price_per_unit=6500.0, stock_quantity=200, category="Épicerie"),
        Product(name="Farine 50kg", description="Farine de blé T55", unit="sac",
                price_per_unit=4200.0, stock_quantity=300, category="Boulangerie"),
        Product(name="Café arabica 1kg", description="Café moulu premium", unit="paquet",
                price_per_unit=2800.0, stock_quantity=150, category="Boissons"),
        Product(name="Eau minérale 12x0.5L", description="Pack eau minérale naturelle", unit="pack",
                price_per_unit=320.0, stock_quantity=1000, category="Boissons"),
        Product(name="Lait pasteurisé 1L", description="Lait entier pasteurisé", unit="bouteille",
                price_per_unit=95.0, stock_quantity=800, category="Produits laitiers"),
    ]

    db.session.add_all([admin, shop1, driver1] + products)
    db.session.flush()

    # Sample shortage report
    rpt = ShortageReport(
        shop_owner_id=shop1.id,
        product_id=products[0].id,
        quantity_requested=20,
        latitude=36.7538,
        longitude=3.0588,
        shop_name="Épicerie Karim",
        notes="Urgent – rupture de stock depuis 2 jours",
        status="pending",
    )
    db.session.add(rpt)
    db.session.commit()
    print("[OK] Database seeded with demo data.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
app = create_app()

if __name__ == "__main__":
    app.run(
      
        port=5000,
        debug=True
    )