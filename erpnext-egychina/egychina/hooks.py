app_name = "egychina"
app_title = "EgyChina Store"
app_publisher = "EgyChina"
app_description = "Mobile push notifications and customer Expo token sync"
app_email = "support@egychina.local"
app_license = "MIT"

# Sales Order → Expo push when status / delivery status changes
doc_events = {
	"Sales Order": {
		"on_update": "egychina.sales_order.notifications.on_sales_order_update",
	}
}
