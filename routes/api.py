"""
routes/api.py – REST API Blueprint
------------------------------------
All endpoints return JSON.  Role checks are enforced via decorators.
Endpoints:
  Products  : GET /api/products
  Reports   : GET/POST /api/reports, PATCH /api/reports/<id>/status
  Deliveries: POST /api/deliveries, PATCH /api/deliveries/<id>/status
  Ratings   : POST /api/ratings
  Users     : GET /api/users/drivers, GET /api/stats
"""

from datetime import datetime
from functools import wraps
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from models import db, User, Product, ShortageReport, Delivery, Rating

api_bp = Blueprint("api", __name__)


# ---------------------------------------------------------------------------
# Role-guard decorators
# ---------------------------------------------------------------------------
def role_required(*roles):
    def decorator(f):
        @wraps(f)
        @login_required
        def wrapped(*args, **kwargs):
            if current_user.role not in roles:
                return jsonify({"error": "Access denied."}), 403
            return f(*args, **kwargs)
        return wrapped
    return decorator


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------
@api_bp.route("/products", methods=["GET"])
@login_required
def get_products():
    products = Product.query.filter_by(is_available=True).all()
    return jsonify([p.to_dict() for p in products]), 200


@api_bp.route("/products", methods=["POST"])
@role_required("admin")
def create_product():
    data = request.get_json(silent=True) or {}
    required = ["name", "price_per_unit"]
    for f in required:
        if not data.get(f):
            return jsonify({"error": f"'{f}' is required."}), 400
    product = Product(
        name=data["name"],
        description=data.get("description", ""),
        unit=data.get("unit", "unit"),
        price_per_unit=float(data["price_per_unit"]),
        stock_quantity=int(data.get("stock_quantity", 0)),
        category=data.get("category", ""),
    )
    db.session.add(product)
    db.session.commit()
    return jsonify(product.to_dict()), 201


@api_bp.route("/products/<int:product_id>", methods=["PUT"])
@role_required("admin")
def update_product(product_id):
    product = db.session.get(Product, product_id)
    if not product:
        return jsonify({"error": "Product not found."}), 404
    data = request.get_json(silent=True) or {}
    for field in ["name", "description", "unit", "price_per_unit", "stock_quantity", "category", "is_available"]:
        if field in data:
            setattr(product, field, data[field])
    db.session.commit()
    return jsonify(product.to_dict()), 200


# ---------------------------------------------------------------------------
# Shortage Reports
# ---------------------------------------------------------------------------
@api_bp.route("/reports", methods=["GET"])
@login_required
def get_reports():
    if current_user.role == "admin":
        reports = ShortageReport.query.order_by(ShortageReport.created_at.desc()).all()
    elif current_user.role == "shop_owner":
        reports = ShortageReport.query.filter_by(shop_owner_id=current_user.id)\
            .order_by(ShortageReport.created_at.desc()).all()
    elif current_user.role == "driver":
        # Driver sees their assigned deliveries' reports
        deliveries = Delivery.query.filter_by(driver_id=current_user.id).all()
        report_ids = [d.report_id for d in deliveries]
        reports = ShortageReport.query.filter(ShortageReport.id.in_(report_ids)).all()
    else:
        return jsonify({"error": "Access denied."}), 403

    return jsonify([r.to_dict() for r in reports]), 200


@api_bp.route("/reports", methods=["POST"])
@role_required("shop_owner")
def create_report():
    data = request.get_json(silent=True) or {}
    required = ["product_id", "quantity_requested", "latitude", "longitude"]
    for f in required:
        if data.get(f) is None:
            return jsonify({"error": f"'{f}' is required."}), 400

    product = db.session.get(Product, int(data["product_id"]))
    if not product:
        return jsonify({"error": "Product not found."}), 404

    report = ShortageReport(
        shop_owner_id=current_user.id,
        product_id=int(data["product_id"]),
        quantity_requested=int(data["quantity_requested"]),
        latitude=float(data["latitude"]),
        longitude=float(data["longitude"]),
        shop_name=data.get("shop_name", current_user.name),
        notes=data.get("notes", ""),
        status="pending",
    )
    db.session.add(report)
    db.session.commit()
    return jsonify(report.to_dict()), 201


@api_bp.route("/reports/<int:report_id>", methods=["GET"])
@login_required
def get_report(report_id):
    report = db.session.get(ShortageReport, report_id)
    if not report:
        return jsonify({"error": "Report not found."}), 404
    # Shop owners can only view their own reports
    if current_user.role == "shop_owner" and report.shop_owner_id != current_user.id:
        return jsonify({"error": "Access denied."}), 403
    return jsonify(report.to_dict()), 200


@api_bp.route("/reports/<int:report_id>/status", methods=["PATCH"])
@role_required("admin")
def update_report_status(report_id):
    report = db.session.get(ShortageReport, report_id)
    if not report:
        return jsonify({"error": "Report not found."}), 404
    data = request.get_json(silent=True) or {}
    new_status = data.get("status")
    valid_statuses = ("pending", "assigned", "in_transit", "delivered")
    if new_status not in valid_statuses:
        return jsonify({"error": f"Invalid status. Must be one of: {valid_statuses}"}), 400
    report.status = new_status
    report.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify(report.to_dict()), 200


# ---------------------------------------------------------------------------
# Deliveries
# ---------------------------------------------------------------------------
@api_bp.route("/deliveries", methods=["POST"])
@role_required("admin")
def assign_delivery():
    data = request.get_json(silent=True) or {}
    report_id = data.get("report_id")
    driver_id = data.get("driver_id")

    if not report_id or not driver_id:
        return jsonify({"error": "'report_id' and 'driver_id' are required."}), 400

    report = db.session.get(ShortageReport, int(report_id))
    if not report:
        return jsonify({"error": "Report not found."}), 404
    if report.delivery:
        return jsonify({"error": "Report already has a delivery assigned."}), 409

    driver = db.session.get(User, int(driver_id))
    if not driver or driver.role != "driver":
        return jsonify({"error": "Driver not found."}), 404

    delivery = Delivery(
        report_id=report.id,
        driver_id=driver.id,
        status="assigned",
    )
    report.status = "assigned"
    db.session.add(delivery)
    db.session.commit()
    return jsonify(delivery.to_dict()), 201


@api_bp.route("/deliveries/<int:delivery_id>/status", methods=["PATCH"])
@role_required("driver", "admin")
def update_delivery_status(delivery_id):
    delivery = db.session.get(Delivery, delivery_id)
    if not delivery:
        return jsonify({"error": "Delivery not found."}), 404

    # Drivers can only update their own deliveries
    if current_user.role == "driver" and delivery.driver_id != current_user.id:
        return jsonify({"error": "Access denied."}), 403

    data = request.get_json(silent=True) or {}
    new_status = data.get("status")
    valid = ("assigned", "in_transit", "delivered")
    if new_status not in valid:
        return jsonify({"error": f"Invalid status. Must be one of: {valid}"}), 400

    delivery.status = new_status
    delivery.report.status = new_status

    if new_status == "delivered":
        delivery.delivered_at = datetime.utcnow()
        if data.get("driver_notes"):
            delivery.driver_notes = data["driver_notes"]

    db.session.commit()
    return jsonify(delivery.to_dict()), 200


@api_bp.route("/deliveries", methods=["GET"])
@login_required
def get_deliveries():
    if current_user.role == "admin":
        deliveries = Delivery.query.order_by(Delivery.assigned_at.desc()).all()
    elif current_user.role == "driver":
        deliveries = Delivery.query.filter_by(driver_id=current_user.id)\
            .order_by(Delivery.assigned_at.desc()).all()
    else:
        return jsonify({"error": "Access denied."}), 403
    return jsonify([d.to_dict() for d in deliveries]), 200


# ---------------------------------------------------------------------------
# Ratings / Feedback
# ---------------------------------------------------------------------------
@api_bp.route("/ratings", methods=["POST"])
@role_required("shop_owner")
def submit_rating():
    data = request.get_json(silent=True) or {}
    
    # We must have a score and either delivery_id or report_id
    if "score" not in data:
        return jsonify({"error": "'score' is required."}), 400
    if "delivery_id" not in data and "report_id" not in data:
        return jsonify({"error": "Either 'delivery_id' or 'report_id' is required."}), 400

    score = int(data["score"])
    if not (1 <= score <= 5):
        return jsonify({"error": "Score must be between 1 and 5."}), 400

    # Resolve delivery
    delivery = None
    if data.get("delivery_id"):
        delivery = db.session.get(Delivery, int(data["delivery_id"]))
    elif data.get("report_id"):
        report = db.session.get(ShortageReport, int(data["report_id"]))
        if report and report.delivery:
            delivery = report.delivery

    if not delivery:
        return jsonify({"error": "Delivery not found."}), 404

    if delivery.status != "delivered":
        return jsonify({"error": "Can only rate completed deliveries."}), 400

    if delivery.report.shop_owner_id != current_user.id:
        return jsonify({"error": "Access denied."}), 403

    if delivery.rating:
        return jsonify({"error": "Delivery already rated."}), 409

    rating = Rating(
        shop_owner_id=current_user.id,
        delivery_id=delivery.id,
        report_id=delivery.report_id,
        score=score,
        comment=data.get("comment", ""),
    )
    db.session.add(rating)
    db.session.commit()
    return jsonify(rating.to_dict()), 201


@api_bp.route("/ratings", methods=["GET"])
@role_required("admin")
def get_ratings():
    ratings = Rating.query.order_by(Rating.created_at.desc()).all()
    return jsonify([r.to_dict() for r in ratings]), 200


# ---------------------------------------------------------------------------
# Users / Drivers
# ---------------------------------------------------------------------------
@api_bp.route("/users/drivers", methods=["GET"])
@role_required("admin")
def get_drivers():
    drivers = User.query.filter_by(role="driver", is_active=True).all()
    return jsonify([d.to_dict() for d in drivers]), 200


@api_bp.route("/users/shop-owners", methods=["GET"])
@role_required("admin")
def get_shop_owners():
    shops = User.query.filter_by(role="shop_owner", is_active=True).all()
    return jsonify([s.to_dict() for s in shops]), 200


# ---------------------------------------------------------------------------
# Dashboard statistics  (admin only)
# ---------------------------------------------------------------------------
@api_bp.route("/stats", methods=["GET"])
@role_required("admin")
def get_stats():
    total_reports = ShortageReport.query.count()
    pending = ShortageReport.query.filter_by(status="pending").count()
    in_transit = ShortageReport.query.filter_by(status="in_transit").count()
    delivered = ShortageReport.query.filter_by(status="delivered").count()
    total_drivers = User.query.filter_by(role="driver").count()
    total_shops = User.query.filter_by(role="shop_owner").count()

    avg_score = db.session.query(db.func.avg(Rating.score)).scalar()

    return jsonify({
        "total_reports": total_reports,
        "pending": pending,
        "in_transit": in_transit,
        "delivered": delivered,
        "total_drivers": total_drivers,
        "total_shops": total_shops,
        "avg_rating": round(avg_score, 2) if avg_score else None,
    }), 200


# ---------------------------------------------------------------------------
# Map data endpoint  (GPS heat-map points for admin)
# ---------------------------------------------------------------------------
@api_bp.route("/map/heatmap", methods=["GET"])
@role_required("admin")
def heatmap_data():
    reports = ShortageReport.query.filter(
        ShortageReport.status.in_(["pending", "assigned"])
    ).all()
    points = [
        {
            "id": r.id,
            "lat": r.latitude,
            "lng": r.longitude,
            "shop_name": r.shop_name,
            "product": r.product.name if r.product else "—",
            "quantity": r.quantity_requested,
            "status": r.status,
            "created_at": r.created_at.isoformat(),
        }
        for r in reports
    ]
    return jsonify(points), 200
