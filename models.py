"""
models.py – SQLAlchemy ORM Models for DistribDZ Online
---------------------------------------------------------
Tables:
  - User        : Stores all users (admin/wholesaler, shop_owner, driver)
  - Product     : Product catalogue managed by the wholesaler
  - ShortageReport : Sent by shop owners including GPS coordinates
  - Delivery    : Assignment of a report to a driver
  - Rating      : Shop owner feedback after delivery completion
"""

from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_login import UserMixin

db = SQLAlchemy()
bcrypt = Bcrypt()


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------
class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    # Roles: 'admin', 'shop_owner', 'driver'
    role = db.Column(db.String(20), nullable=False, default="shop_owner")
    phone = db.Column(db.String(30))
    address = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)

    # Relationships
    reports = db.relationship(
        "ShortageReport", back_populates="shop_owner", foreign_keys="ShortageReport.shop_owner_id"
    )
    deliveries_as_driver = db.relationship(
        "Delivery", back_populates="driver", foreign_keys="Delivery.driver_id"
    )
    ratings_given = db.relationship(
        "Rating", back_populates="shop_owner", foreign_keys="Rating.shop_owner_id"
    )
    complaints = db.relationship(
        "Complaint", back_populates="user", foreign_keys="Complaint.user_id"
    )

    def set_password(self, password: str) -> None:
        self.password_hash = bcrypt.generate_password_hash(password).decode("utf-8")

    def check_password(self, password: str) -> bool:
        return bcrypt.check_password_hash(self.password_hash, password)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "phone": self.phone,
            "address": self.address,
            "created_at": self.created_at.isoformat(),
            "is_active": self.is_active,
        }


# ---------------------------------------------------------------------------
# Product
# ---------------------------------------------------------------------------
class Product(db.Model):
    __tablename__ = "products"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    unit = db.Column(db.String(50), default="unit")   # e.g. kg, box, crate
    price_per_unit = db.Column(db.Float, nullable=False, default=0.0)
    stock_quantity = db.Column(db.Integer, default=0)
    category = db.Column(db.String(100))
    image_url = db.Column(db.String(500))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_available = db.Column(db.Boolean, default=True)

    # Relationships
    reports = db.relationship("ShortageReport", back_populates="product")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "unit": self.unit,
            "price_per_unit": self.price_per_unit,
            "stock_quantity": self.stock_quantity,
            "category": self.category,
            "image_url": self.image_url,
            "is_available": self.is_available,
        }


# ---------------------------------------------------------------------------
# ShortageReport
# ---------------------------------------------------------------------------
class ShortageReport(db.Model):
    __tablename__ = "shortage_reports"

    id = db.Column(db.Integer, primary_key=True)
    shop_owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)

    quantity_requested = db.Column(db.Integer, nullable=False, default=1)
    notes = db.Column(db.Text)

    # GPS from the shop owner's device
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    shop_name = db.Column(db.String(200))

    # Status lifecycle: 'pending' → 'assigned' → 'in_transit' → 'delivered'
    status = db.Column(db.String(20), nullable=False, default="pending")

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Sync metadata (for Background Sync offline support)
    synced = db.Column(db.Boolean, default=True)

    # Relationships
    shop_owner = db.relationship("User", back_populates="reports", foreign_keys=[shop_owner_id])
    product = db.relationship("Product", back_populates="reports")
    delivery = db.relationship("Delivery", back_populates="report", uselist=False)
    rating = db.relationship("Rating", back_populates="report", uselist=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "shop_owner_id": self.shop_owner_id,
            "shop_owner_name": self.shop_owner.name if self.shop_owner else None,
            "shop_name": self.shop_name,
            "product_id": self.product_id,
            "product_name": self.product.name if self.product else None,
            "quantity_requested": self.quantity_requested,
            "notes": self.notes,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


# ---------------------------------------------------------------------------
# Delivery
# ---------------------------------------------------------------------------
class Delivery(db.Model):
    __tablename__ = "deliveries"

    id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey("shortage_reports.id"), nullable=False, unique=True)
    driver_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    assigned_at = db.Column(db.DateTime, default=datetime.utcnow)
    delivered_at = db.Column(db.DateTime)

    # Status: 'assigned' → 'in_transit' → 'delivered'
    status = db.Column(db.String(20), nullable=False, default="assigned")
    driver_notes = db.Column(db.Text)

    # Relationships
    report = db.relationship("ShortageReport", back_populates="delivery")
    driver = db.relationship("User", back_populates="deliveries_as_driver", foreign_keys=[driver_id])
    rating = db.relationship("Rating", back_populates="delivery", uselist=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "report_id": self.report_id,
            "driver_id": self.driver_id,
            "driver_name": self.driver.name if self.driver else None,
            "assigned_at": self.assigned_at.isoformat(),
            "delivered_at": self.delivered_at.isoformat() if self.delivered_at else None,
            "status": self.status,
            "driver_notes": self.driver_notes,
        }


# ---------------------------------------------------------------------------
# Rating
# ---------------------------------------------------------------------------
class Rating(db.Model):
    __tablename__ = "ratings"

    id = db.Column(db.Integer, primary_key=True)
    shop_owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    delivery_id = db.Column(db.Integer, db.ForeignKey("deliveries.id"), nullable=False, unique=True)
    report_id = db.Column(db.Integer, db.ForeignKey("shortage_reports.id"), nullable=False)

    score = db.Column(db.Integer, nullable=False)    # 1–5 stars
    comment = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    shop_owner = db.relationship("User", back_populates="ratings_given", foreign_keys=[shop_owner_id])
    delivery = db.relationship("Delivery", back_populates="rating")
    report = db.relationship("ShortageReport", back_populates="rating")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "shop_owner_id": self.shop_owner_id,
            "delivery_id": self.delivery_id,
            "report_id": self.report_id,
            "score": self.score,
            "comment": self.comment,
            "created_at": self.created_at.isoformat(),
        }


# ---------------------------------------------------------------------------
# Complaint
# ---------------------------------------------------------------------------
class Complaint(db.Model):
    __tablename__ = "complaints"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    
    subject = db.Column(db.String(200), nullable=False)
    message = db.Column(db.Text, nullable=False)
    
    # Status: 'open' -> 'closed'
    status = db.Column(db.String(20), nullable=False, default="open")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    user = db.relationship("User", back_populates="complaints", foreign_keys=[user_id])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "user_name": self.user.name if self.user else None,
            "subject": self.subject,
            "message": self.message,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
        }
