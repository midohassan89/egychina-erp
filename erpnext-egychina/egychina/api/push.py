"""Whitelisted APIs for mobile Expo push-token sync."""

from __future__ import annotations

import frappe
from frappe import _


def _normalize_phone(raw: str) -> str:
	"""Digits-only Egyptian-friendly normalize (01… or +20…)."""
	digits = "".join(ch for ch in (raw or "") if ch.isdigit())
	if digits.startswith("20") and len(digits) >= 12:
		digits = "0" + digits[2:]
	return digits


def _find_customer_name(phone: str) -> str | None:
	"""Resolve Customer name by mobile_no / custom phone fields."""
	clean = _normalize_phone(phone)
	if not clean:
		return None

	# Exact + common variants
	candidates = {clean, phone.strip()}
	if clean.startswith("0") and len(clean) == 11:
		candidates.add("20" + clean[1:])
		candidates.add("+20" + clean[1:])

	filters_or = []
	for field in ("mobile_no", "custom_phone", "custom_mobile"):
		# Only query fields that exist on Customer
		if not frappe.get_meta("Customer").has_field(field):
			continue
		for value in candidates:
			filters_or.append([field, "=", value])

	if not filters_or:
		# Fallback: mobile_no only
		for value in candidates:
			name = frappe.db.get_value("Customer", {"mobile_no": value}, "name")
			if name:
				return name
		return None

	rows = frappe.get_all(
		"Customer",
		or_filters=filters_or,
		fields=["name"],
		limit=1,
	)
	return rows[0].name if rows else None


@frappe.whitelist(allow_guest=True)
def update_push_token(phone: str | None = None, token: str | None = None):
	"""
	Update a Customer's Expo push token from the mobile app.

	POST /api/method/egychina.api.push.update_push_token
	Body (JSON or form): phone, token

	Optional site config: egychina_push_api_key — if set, require header
	X-EgyChina-Key: <key> (recommended when allow_guest=True).
	"""
	_assert_api_key_if_configured()

	phone = (phone or frappe.form_dict.get("phone") or "").strip()
	token = (token or frappe.form_dict.get("token") or "").strip()

	if not phone:
		frappe.throw(_("phone is required"), frappe.ValidationError)
	if not token:
		frappe.throw(_("token is required"), frappe.ValidationError)

	if not frappe.get_meta("Customer").has_field("custom_expo_push_token"):
		frappe.throw(
			_(
				"Customer field custom_expo_push_token is missing. "
				"Create it as a Data/Small Text field on Customer."
			),
			frappe.ValidationError,
		)

	customer_name = _find_customer_name(phone)
	if not customer_name:
		frappe.throw(
			_("No Customer found for phone {0}").format(phone),
			frappe.DoesNotExistError,
		)

	frappe.db.set_value(
		"Customer",
		customer_name,
		"custom_expo_push_token",
		token,
		update_modified=True,
	)
	frappe.db.commit()

	return {
		"ok": True,
		"customer": customer_name,
		"phone": _normalize_phone(phone),
		"token_saved": True,
	}


def _assert_api_key_if_configured():
	expected = frappe.conf.get("egychina_push_api_key")
	if not expected:
		return
	provided = (
		frappe.get_request_header("X-EgyChina-Key")
		or frappe.form_dict.get("api_key")
		or ""
	).strip()
	if provided != str(expected):
		frappe.throw(_("Invalid API key"), frappe.PermissionError)
