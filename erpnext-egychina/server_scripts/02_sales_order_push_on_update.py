# =============================================================================
# ERPNext Server Script (DocType Event)
# -----------------------------------------------------------------------------
# Script Type      : DocType Event
# Reference DocType: Sales Order
# DocType Event    : After Save  (or On Update if listed)
# Disabled         : No
#
# Requires Customer.custom_expo_push_token (Data / Small Text).
# Requires `requests` available on the bench (usually already installed).
# =============================================================================

NOTIFY = {
	"Out for Delivery": (
		"تحديث الطلب",
		"طلبك رقم {name} أصبح الآن قيد التوصيل",
	),
	"قيد التوصيل": (
		"تحديث الطلب",
		"طلبك رقم {name} أصبح الآن قيد التوصيل",
	),
	"Delivered": (
		"تم التسليم",
		"طلبك رقم {name} تم تسليمه بنجاح. شكراً لتسوقكم من ايجي شاينا",
	),
	"تم التسليم": (
		"تم التسليم",
		"طلبك رقم {name} تم تسليمه بنجاح. شكراً لتسوقكم من ايجي شاينا",
	),
	"Fully Delivered": (
		"تم التسليم",
		"طلبك رقم {name} تم تسليمه بنجاح. شكراً لتسوقكم من ايجي شاينا",
	),
}

WATCH = ("status", "delivery_status", "custom_order_status", "custom_delivery_status")

changed = None
for field in WATCH:
	if not doc.meta.has_field(field) and field not in ("status", "delivery_status"):
		continue
	new_val = (doc.get(field) or "").strip()
	if new_val not in NOTIFY:
		continue
	if doc.has_value_changed(field):
		changed = new_val
		break

if not changed:
	# stop — nothing relevant changed
	pass
else:
	token = frappe.db.get_value("Customer", doc.customer, "custom_expo_push_token")
	token = (token or "").strip()
	if token:
		import json
		import requests

		title, body_tpl = NOTIFY[changed]
		body = body_tpl.format(name=doc.name)
		payload = {
			"to": token,
			"sound": "default",
			"title": title,
			"body": body,
			"data": {
				"type": "sales_order_status",
				"sales_order": doc.name,
				"status": changed,
			},
		}
		try:
			res = requests.post(
				"https://exp.host/--/api/v2/push/send",
				headers={
					"Accept": "application/json",
					"Content-Type": "application/json",
				},
				data=json.dumps(payload),
				timeout=15,
			)
			if res.status_code >= 400:
				frappe.log_error(res.text, f"Expo push failed {doc.name}")
		except Exception as exc:
			frappe.log_error(str(exc), f"Expo push exception {doc.name}")
