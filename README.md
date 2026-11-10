# derma aura admin dashboard

## Run locally

1. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`.
   Use the public anon/publishable key only; never use a service-role key.
2. Run `npm install`, then `npm run dev`.
3. Sign in with an email and password belonging to a user whose existing
   `profiles.role` is `admin`.

Vite reads `.env.local` when it starts. Restart the dev server after changing
environment values.

## Product image uploads

Set `VITE_SUPABASE_STORAGE_BUCKET` to an existing public Supabase Storage bucket
(default: `product-images`). Configure Storage policies to allow authenticated
admins to upload and remove their own product images. The dashboard adds rows to
the existing `products`, `product_variants`, and `product_images` tables; it
does not modify the database schema.

## Order CSV export

On the Orders page, select **Download CSV** to export all loaded non-cancelled
orders and line items, including customer contact details, shipping and billing
address snapshots, payment and order statuses, item quantities and prices,
totals, and customer notes. Orders with multiple items use one row per item.

## Analytics notes

Sales use paid, non-cancelled orders. Repeat purchase and customer value use
available paid order history. Customer acquisition cost and product cost are
not present in the current schema, so LTV:CAC and SKU gross margin are not
fabricated. Refunded orders and low review ratings are displayed only as
limited proxies, not as measured return or complaint rates.
