# Server Script → Script Type: API
# API Method: update_expo_token
# Allow Guest: Yes (or No if the app logs in)

phone = (frappe.form_dict.get("phone") or "").strip()
token = (frappe.form_dict.get("token") or "").strip()

if not phone:
	frappe.throw("phone is required")
if not token:
	frappe.throw("token is required")

digits = "".join(ch for ch in phone if ch.isdigit())
if digits.startswith("20") and len(digits) >= 12:
	digits = "0" + digits[2:]
elif digits.startswith("20") and len(digits) == 12:
	digits = "0" + digits[2:]

customer = frappe.db.get_value("Customer", {"mobile_no": digits}, "name")
if not customer:
	customer = frappe.db.get_value("Customer", {"mobile_no": phone}, "name")
if not customer and digits.startswith("0"):
	customer = frappe.db.get_value("Customer", {"mobile_no": "+20" + digits[1:]}, "name")
if not customer and digits.startswith("0"):
	customer = frappe.db.get_value("Customer", {"mobile_no": "20" + digits[1:]}, "name")

if not customer:
	frappe.throw(f"No Customer found for phone {phone}")

frappe.db.set_value("Customer", customer, "custom_expo_push_token", token)
frappe.db.commit()

frappe.response["message"] = {"ok": True, "customer": customer, "phone": digits}
