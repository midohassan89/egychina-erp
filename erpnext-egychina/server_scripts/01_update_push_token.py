# =============================================================================
# ERPNext Server Script (API)
# -----------------------------------------------------------------------------
# Script Type : API
# API Method  : egychina_update_push_token
# Disabled    : No
# Allow Guest : Yes  (recommended: No + logged-in API user, or guard with key)
#
# Call:
#   POST /api/method/egychina_update_push_token
#   Body: phone=<mobile>&token=<expo-token>
# =============================================================================

phone = (frappe.form_dict.get("phone") or "").strip()
token = (frappe.form_dict.get("token") or "").strip()

if not phone:
	frappe.throw("phone is required")
if not token:
	frappe.throw("token is required")

digits = "".join(ch for ch in phone if ch.isdigit())
if digits.startswith("20") and len(digits) >= 12:
	digits = "0" + digits[2:]

customer = frappe.db.get_value("Customer", {"mobile_no": digits}, "name")
if not customer:
	customer = frappe.db.get_value("Customer", {"mobile_no": phone}, "name")
if not customer:
	frappe.throw(f"No Customer found for phone {phone}")

frappe.db.set_value("Customer", customer, "custom_expo_push_token", token)
frappe.db.commit()

frappe.response["message"] = {
	"ok": True,
	"customer": customer,
	"token_saved": True,
}
