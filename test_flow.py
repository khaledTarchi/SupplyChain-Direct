import time
import requests

BASE_URL = "http://127.0.0.1:5000"

def run_tests():
    print("Testing DistribDZ Online API...")
    s1 = requests.Session() # Shop Owner
    s2 = requests.Session() # Admin
    s3 = requests.Session() # Driver

    # 1. Login
    r = s1.post(f"{BASE_URL}/api/auth/login", json={"email": "karim@scd.com", "password": "shop123"})
    print("Shop Login:", r.json())

    r = s2.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@scd.com", "password": "admin123"})
    print("Admin Login:", r.json())
    
    r = s3.post(f"{BASE_URL}/api/auth/login", json={"email": "youcef@scd.com", "password": "driver123"})
    print("Driver Login:", r.json())

    # 2. Add product (Admin)
    r = s2.post(f"{BASE_URL}/api/products", json={
        "name": "Test Product", "price_per_unit": 10.5, "unit": "kg"
    })
    print("Add Product:", r.json())
    prod_id = r.json().get("id")

    # 3. Create Shortage Report (Shop)
    r = s1.post(f"{BASE_URL}/api/reports", json={
        "product_id": prod_id, "quantity_requested": 5, "latitude": 36.7, "longitude": 3.0
    })
    print("Create Report:", r.json())
    report_id = r.json().get("id")

    # 4. Assign Driver (Admin)
    r = s2.post(f"{BASE_URL}/api/deliveries", json={
        "report_id": report_id, "driver_id": 3
    })
    print("Assign Delivery:", r.json())
    delivery_id = r.json().get("id")

    # 5. Driver updates status
    r = s3.patch(f"{BASE_URL}/api/deliveries/{delivery_id}/status", json={"status": "in_transit"})
    print("Status -> in_transit:", r.json())
    
    r = s3.patch(f"{BASE_URL}/api/deliveries/{delivery_id}/status", json={"status": "delivered", "driver_notes": "All good"})
    print("Status -> delivered:", r.json())

    # 6. Shop Owner Rates Delivery (by report_id)
    r = s1.post(f"{BASE_URL}/api/ratings", json={
        "report_id": report_id, "score": 5, "comment": "Great delivery"
    })
    print("Rate Delivery:", r.json())

    # 7. Shop Owner creates a Complaint
    r = s1.post(f"{BASE_URL}/api/complaints", json={
        "subject": "Missing items", "message": "My delivery was short by 2 items."
    })
    print("Create Complaint (Shop):", r.json())

    # 8. Admin retrieves Complaints
    r = s2.get(f"{BASE_URL}/api/complaints")
    print("Get Complaints (Admin):", r.json())

if __name__ == "__main__":
    run_tests()
