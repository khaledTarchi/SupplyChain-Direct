"""
list_reports.py – List all ShortageReports in the database.
Run:  python list_reports.py
"""
import sys, os
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
sys.path.insert(0, BASE_DIR)

from app import create_app
from models import db, ShortageReport

app = create_app()
with app.app_context():
    reports = ShortageReport.query.order_by(ShortageReport.id).all()
    if not reports:
        print("No shortage reports found in the database.")
    else:
        print(f"\n{'ID':<5} {'Status':<12} {'Shop':<25} {'Product':<25} {'Qty':>5}  Created")
        print("-" * 90)
        for r in reports:
            product_name = r.product.name if r.product else "N/A"
            shop = r.shop_name or (r.shop_owner.name if r.shop_owner else "N/A")
            print(f"{r.id:<5} {r.status:<12} {shop:<25} {product_name:<25} {r.quantity_requested:>5}  {r.created_at.strftime('%Y-%m-%d %H:%M')}")
        print(f"\nTotal: {len(reports)} report(s)\n")
