export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-slate-500">
          Configure WooCommerce connection and POS preferences
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">WooCommerce API</h2>
        <p className="mt-2 text-sm text-slate-600">
          API credentials are stored server-side in environment variables for
          security. Create a{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5">.env.local</code>{" "}
          file with:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-900 p-4 text-sm text-slate-100">
{`WOOCOMMERCE_URL=https://your-store.example.com
WOOCOMMERCE_CONSUMER_KEY=ck_...
WOOCOMMERCE_CONSUMER_SECRET=cs_...`}
        </pre>
        <p className="mt-3 text-sm text-slate-500">
          Generate keys in WooCommerce → Settings → Advanced → REST API.
        </p>
      </div>
    </div>
  );
}
