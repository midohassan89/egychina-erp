# EgyChina × ERPNext — Expo Push Notifications

Backend pieces for **EgyChina Store** on **ERPNext / Frappe**:

1. Whitelisted API to save a customer’s Expo push token  
2. Sales Order `on_update` hook that notifies the customer in Arabic when status becomes *Out for Delivery* / *Delivered*

---

## Recommended approach: custom app (this folder)

Use the `egychina` app under `erpnext-egychina/` on your Frappe bench. Server Scripts (below) are a no-deploy fallback.

### 1. Custom field on Customer

**Customize → Customer → Form** (or Customize Form):

| Fieldname                 | Type        | Label            |
|---------------------------|-------------|------------------|
| `custom_expo_push_token`  | Data / Small Text | Expo Push Token |

Save & reload.

Optional: if you track order status on a **custom** Sales Order field, name it one of:

- `custom_order_status`
- `custom_delivery_status`
- `custom_fulfillment_status`

…and use the exact option values listed in `STATUS_MESSAGES` (e.g. `Out for Delivery`, `Delivered`, `قيد التوصيل`, `تم التسليم`).

### 2. Install the app on the bench

```bash
# From your bench folder (example)
cd /home/frappe/frappe-bench

# Copy or clone this app into apps/
cp -r /path/to/ERP/erpnext-egychina apps/egychina
# OR: ln -s /path/to/ERP/erpnext-egychina apps/egychina

bench get-app ./apps/egychina   # if using a git remote; skip if already copied
bench --site your-site.local install-app egychina
bench --site your-site.local clear-cache
bench restart
```

Ensure `requests` is available (Frappe/ERPNext usually includes it):

```bash
bench pip install requests
```

### 3. Optional API key (guest calls)

In `site_config.json`:

```json
{
  "egychina_push_api_key": "replace-with-long-random-secret"
}
```

Mobile app must send header: `X-EgyChina-Key: <same secret>`.

If the key is **not** set, the endpoint stays open to guests (`allow_guest=True`) — fine for private/VPN sites only.

### 4. Call from the mobile app

```http
POST /api/method/egychina.api.update_push_token
Content-Type: application/json
X-EgyChina-Key: <optional>

{
  "phone": "01012345678",
  "token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
}
```

Also accepted as form fields `phone` & `token`.

Equivalent path (same function):  
`/api/method/egychina.api.push.update_push_token`

Success:

```json
{
  "message": {
    "ok": true,
    "customer": "CUST-0001",
    "phone": "01012345678",
    "token_saved": true
  }
}
```

Customer is matched on `mobile_no` (and `custom_phone` / `custom_mobile` if those fields exist). Egyptian `+20` / `20` prefixes are normalized to `01…`.

### 5. Sales Order notifications

Hook (already in `egychina/hooks.py`):

```python
doc_events = {
  "Sales Order": {
    "on_update": "egychina.sales_order.notifications.on_sales_order_update",
  }
}
```

On change of `status`, `delivery_status`, or the custom fields above **into** a known label:

| Status value         | Title (AR)   | Body idea                                      |
|----------------------|--------------|------------------------------------------------|
| Out for Delivery / قيد التوصيل | تحديث الطلب | طلبك رقم {SO} أصبح الآن قيد التوصيل          |
| Delivered / تم التسليم / Fully Delivered | تم التسليم | طلبك رقم {SO} تم تسليمه بنجاح…                |

Flow:

1. Read `Customer.custom_expo_push_token` via `doc.customer`  
2. If present → `frappe.enqueue(... send_expo_push)` after commit  
3. Worker POSTs JSON to `https://exp.host/--/api/v2/push/send`

Workers must be running:

```bash
bench worker
# or supervisor/systemd for production
```

Failures land in **Error Log** (`Expo push error…` / `Expo push failed…`).

### 6. Align status labels with your workflow

Edit `STATUS_MESSAGES` in:

`egychina/sales_order/notifications.py`

Add every Select/Workflow state you use (Arabic or English). Values must match **exactly**.

---

## Fallback: Server Scripts only (no custom app)

Desk → **Server Script**

### A) API — update token

1. New Server Script  
2. **Script Type:** API  
3. **API Method:** `egychina_update_push_token`  
4. **Allow Guest:** as needed  
5. Paste code from `server_scripts/01_update_push_token.py`  
6. Enable & Save  

Call: `POST /api/method/egychina_update_push_token`

### B) DocType Event — Sales Order

1. New Server Script  
2. **Script Type:** DocType Event  
3. **Reference Document Type:** Sales Order  
4. **DocType Event:** After Save  
5. Paste code from `server_scripts/02_sales_order_push_on_update.py`  
6. Enable & Save  

> Server Scripts run in a restricted sandbox. If `import requests` is blocked on your site, use the **custom app** path (recommended).

---

## Quick test checklist

1. Create/find a Customer with `mobile_no = 010…` and set a real Expo token (or call the API).  
2. `curl` the update-token method — confirm field saved on Customer.  
3. Open a Sales Order for that customer; change status to `Out for Delivery` (or your custom equivalent).  
4. Confirm push on the device; if not, check **Error Log** and that `bench worker` is up.  
5. On Expo, invalid tokens return `DeviceNotRegistered` — clear `custom_expo_push_token` when you see that.

---

## File map

```
erpnext-egychina/
├── README.md                          ← this file
├── pyproject.toml
├── egychina/
│   ├── hooks.py                       ← Sales Order on_update
│   ├── api/
│   │   ├── __init__.py                ← egychina.api.update_push_token
│   │   └── push.py                    ← implementation
│   └── sales_order/
│       └── notifications.py           ← Expo send + status map
└── server_scripts/
    ├── 01_update_push_token.py
    └── 02_sales_order_push_on_update.py
```
