"""Sales Order → Expo push notifications on status / delivery changes."""

from __future__ import annotations

import json

import frappe
import requests

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# Map workflow / status labels → Arabic notification copy
STATUS_MESSAGES: dict[str, tuple[str, str]] = {
	# title, body template ({name} = Sales Order name)
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
	"To Deliver": (
		"تحديث الطلب",
		"طلبك رقم {name} جاهز للتوصيل",
	),
}

# Fields watched for change (standard + common custom)
WATCH_FIELDS = (
	"status",
	"delivery_status",
	"custom_order_status",
	"custom_delivery_status",
	"custom_fulfillment_status",
)


def on_sales_order_update(doc, method=None):
	"""DocType event: Sales Order.on_update"""
	changed_status = _detect_notify_status(doc)
	if not changed_status:
		return

	token = _get_customer_push_token(doc.customer)
	if not token:
		return

	title, body_tpl = STATUS_MESSAGES[changed_status]
	body = body_tpl.format(name=doc.name)

	# Async — never block SO save on Expo latency
	frappe.enqueue(
		"egychina.sales_order.notifications.send_expo_push",
		queue="short",
		token=token,
		title=title,
		body=body,
		sales_order=doc.name,
		status=changed_status,
		enqueue_after_commit=True,
	)


def _detect_notify_status(doc) -> str | None:
	"""Return the new status label if a watched field changed into a notify value."""
	before = doc.get_doc_before_save()
	for field in WATCH_FIELDS:
		if not doc.meta.has_field(field) and field not in ("status", "delivery_status"):
			continue
		new_val = (doc.get(field) or "").strip()
		if not new_val or new_val not in STATUS_MESSAGES:
			continue
		old_val = (before.get(field) if before else None) or ""
		old_val = str(old_val).strip()
		if new_val != old_val:
			return new_val
	return None


def _get_customer_push_token(customer: str | None) -> str | None:
	if not customer:
		return None
	if not frappe.get_meta("Customer").has_field("custom_expo_push_token"):
		frappe.log_error(
			"Missing Customer.custom_expo_push_token",
			"EgyChina Push",
		)
		return None
	token = frappe.db.get_value("Customer", customer, "custom_expo_push_token")
	token = (token or "").strip()
	return token or None


def send_expo_push(
	token: str,
	title: str,
	body: str,
	sales_order: str | None = None,
	status: str | None = None,
):
	"""HTTP POST to Expo Push API (runs in background worker)."""
	payload = {
		"to": token,
		"sound": "default",
		"title": title,
		"body": body,
		"data": {
			"type": "sales_order_status",
			"sales_order": sales_order,
			"status": status,
		},
	}

	try:
		response = requests.post(
			EXPO_PUSH_URL,
			headers={
				"Accept": "application/json",
				"Accept-Encoding": "gzip, deflate",
				"Content-Type": "application/json",
			},
			data=json.dumps(payload),
			timeout=15,
		)
		response.raise_for_status()
		result = response.json()
		# Expo returns errors inside data even with HTTP 200
		errors = []
		data = result.get("data")
		if isinstance(data, dict) and data.get("status") == "error":
			errors.append(data)
		elif isinstance(data, list):
			errors.extend([row for row in data if row.get("status") == "error"])
		if errors:
			frappe.log_error(
				title=f"Expo push error SO {sales_order}",
				message=json.dumps({"payload": payload, "errors": errors}, ensure_ascii=False),
			)
	except Exception:
		frappe.log_error(
			title=f"Expo push failed SO {sales_order}",
			message=frappe.get_traceback(),
		)
