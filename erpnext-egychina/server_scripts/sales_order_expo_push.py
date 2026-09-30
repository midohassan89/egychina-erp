# Server Script → Script Type: DocType Event
# Reference Document Type: Sales Order
# DocType Event: After Save

NOTIFY = {
	"Out for Delivery": (
		"تحديث الطلب",
		"طلبك رقم {name} أصبح الآن قيد التوصيل",
	),
	"Delivered": (
		"تم التسليم",
		"طلبك رقم {name} تم تسليمه بنجاح. شكراً لتسوقكم من ايجي شاينا",
	),
}

changed = None
for field in ("status", "delivery_status", "custom_order_status", "custom_delivery_status"):
	if field not in ("status", "delivery_status") and not doc.meta.has_field(field):
		continue
	new_val = (doc.get(field) or "").strip()
	if new_val in NOTIFY and doc.has_value_changed(field):
		changed = new_val
		break

if changed:
	token = (frappe.db.get_value("Customer", doc.customer, "custom_expo_push_token") or "").strip()
	if token:
		import json
		import requests

		title, body_tpl = NOTIFY[changed]
		payload = {
			"to": token,
			"sound": "default",
			"title": title,
			"body": body_tpl.format(name=doc.name),
			"data": {"type": "sales_order_status", "sales_order": doc.name, "status": changed},
		}
		try:
			res = requests.post(
				"https://exp.host/--/api/v2/push/send",
				headers={"Accept": "application/json", "Content-Type": "application/json"},
				data=json.dumps(payload),
				timeout=15,
			)
			if res.status_code >= 400:
				frappe.log_error(res.text[:1400], f"Expo push failed {doc.name}")
		except Exception as e:
			frappe.log_error(str(e)[:1400], f"Expo push exception {doc.name}")
