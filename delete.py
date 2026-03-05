"""
delete.py – Reset DistribDZ Online database (keep accounts)
--------------------------------------------------------------
Deletes ALL data from every table EXCEPT the users table.
After running this script:
  - User accounts are preserved (credentials, roles, contact info).
  - Every user appears as if their account was just created:
      * No shortage reports
      * No deliveries
      * No ratings
      * No complaints
      * No products
Run from the project root:
    python delete.py
"""

import sys
import os

# ── Make sure we can import the project's modules ───────────────────────────
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
sys.path.insert(0, BASE_DIR)

from app import create_app
from models import db, Rating, Complaint, Delivery, ShortageReport, Product, User


def reset_database() -> None:
    """Delete all non-account data in a safe, FK-respecting order."""

    app = create_app()

    with app.app_context():
        # Deletion order matters: children before parents.
        #
        #  ratings        → depends on deliveries + shortage_reports
        #  complaints     → depends on users (kept, so just delete rows)
        #  deliveries     → depends on shortage_reports + users
        #  shortage_reports → depends on products + users
        #  products       → no FK parents (among deleted tables)

        tables = [
            ("ratings",          Rating),
            ("complaints",       Complaint),
            ("deliveries",       Delivery),
            ("shortage_reports", ShortageReport),
            ("products",         Product),
        ]

        print("=" * 52)
        print("  DistribDZ Online – Database Reset")
        print("=" * 52)

        total_deleted = 0
        for table_name, Model in tables:
            count = db.session.query(Model).delete(synchronize_session=False)
            total_deleted += count
            print(f"  [{table_name:<20}]  {count:>5} row(s) deleted")

        db.session.commit()

        print("-" * 52)
        print(f"  Total rows deleted : {total_deleted}")
        print("  User accounts      : PRESERVED")
        print("=" * 52)
        print("  Done. The database has been reset successfully.")
        print("=" * 52)


def delete_report_by_id(report_id: int) -> None:
    """Delete a single ShortageReport (and its child Rating / Delivery) by primary key."""

    app = create_app()

    with app.app_context():
        from models import Rating, Delivery, ShortageReport

        report = ShortageReport.query.get(report_id)
        if report is None:
            print(f"\n  [!] No shortage report found with id={report_id}")
            return

        # Delete dependent child rows first (FK safety)
        if report.rating:
            db.session.delete(report.rating)
        if report.delivery:
            db.session.delete(report.delivery)

        db.session.delete(report)
        db.session.commit()
        print(f"\n  [OK] Shortage report deleted --> id={report_id}")


def delete_account_by_email(email: str) -> None:
    """Delete a single user account identified by email address."""

    app = create_app()

    with app.app_context():
        user = User.query.filter_by(email=email).first()
        if user is None:
            print(f"\n  [!] No account found with email: {email}")
            return

        db.session.delete(user)
        db.session.commit()
        print(f"\n  [OK] Account deleted  -->  {email}  (id={user.id}, role={user.role})")


def delete_all_accounts() -> None:
    """Delete every account in the users table."""

    app = create_app()

    with app.app_context():
        count = db.session.query(User).delete(synchronize_session=False)
        db.session.commit()
        print(f"\n  [OK] All accounts deleted  -->  {count} user(s) removed.")


if __name__ == "__main__":
    # Safety prompt – ask for confirmation before wiping data.
    print("\n[!] WARNING: This will permanently delete all data")
    print("   except user accounts (users table is untouched).\n")
    answer = input("   Type  yes  to continue, anything else to abort: ").strip().lower()

    if answer == "yes":
        # ── Delete the specific shortage report (id=1) ───────────────────────
        delete_report_by_id(1)
    else:
        print("\n   Aborted. No data was changed.")
