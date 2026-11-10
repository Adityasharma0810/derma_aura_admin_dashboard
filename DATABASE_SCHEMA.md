# Database schema inventory

This inventory documents the schema declared in [`setup_supabase.py`](./setup_supabase.py). It lists 23 project-owned tables in the `public` schema and their PostgreSQL column types.

**Important:** This is the schema declared by the setup script, not a live database inventory. No database connection was configured when this inventory was prepared, so a deployed Supabase database may differ.

Types below are PostgreSQL types. `timestamptz` means timestamp with time zone. Columns are listed as `column_name: type`.

## Tables and columns

### `profiles`

- `id: uuid`
- `email: text`
- `full_name: text`
- `phone: text`
- `avatar_url: text`
- `role: text`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### `categories`

- `id: uuid`
- `name: text`
- `slug: text`
- `description: text`
- `sort_order: integer`
- `is_active: boolean`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### `skin_concerns`

- `id: uuid`
- `name: text`
- `slug: text`
- `short_description: text`
- `icon: text`
- `sort_order: integer`
- `is_active: boolean`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### `products`

- `id: uuid`
- `category_id: uuid`
- `name: text`
- `slug: text`
- `short_description: text`
- `description: text`
- `benefit_label: text`
- `kind: text`
- `badge_text: text`
- `skin_types: text[]`
- `key_benefits: text[]`
- `ingredients: jsonb`
- `how_to_use: text`
- `is_featured: boolean`
- `is_active: boolean`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### `product_images`

- `id: uuid`
- `product_id: uuid`
- `image_url: text`
- `alt_text: text`
- `sort_order: integer`
- `is_primary: boolean`
- `created_at: timestamptz`

### `product_variants`

- `id: uuid`
- `product_id: uuid`
- `sku: text`
- `variant_name: text`
- `size_label: text`
- `price: numeric(10,2)`
- `compare_at_price: numeric(10,2)`
- `stock_quantity: integer`
- `low_stock_threshold: integer`
- `is_default: boolean`
- `is_active: boolean`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### `product_concerns`

- `product_id: uuid`
- `concern_id: uuid`
- `created_at: timestamptz`

### `addresses`

- `id: uuid`
- `user_id: uuid`
- `recipient_name: text`
- `phone: text`
- `address_line1: text`
- `address_line2: text`
- `landmark: text`
- `city: text`
- `state: text`
- `pincode: text`
- `country: text`
- `address_type: text`
- `is_default: boolean`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### `carts`

- `id: uuid`
- `user_id: uuid`
- `status: text`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### `cart_items`

- `id: uuid`
- `cart_id: uuid`
- `variant_id: uuid`
- `quantity: integer`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### `wishlists`

- `id: uuid`
- `user_id: uuid`
- `name: text`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### `wishlist_items`

- `id: uuid`
- `wishlist_id: uuid`
- `variant_id: uuid`
- `created_at: timestamptz`

### `coupons`

- `id: uuid`
- `code: text`
- `description: text`
- `discount_type: text`
- `discount_value: numeric(10,2)`
- `minimum_order_value: numeric(10,2)`
- `maximum_discount: numeric(10,2)`
- `usage_limit: integer`
- `per_user_limit: integer`
- `starts_at: timestamptz`
- `expires_at: timestamptz`
- `is_active: boolean`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### `orders`

- `id: uuid`
- `order_number: text`
- `user_id: uuid`
- `customer_email: text`
- `customer_name: text`
- `customer_phone: text`
- `status: text`
- `payment_status: text`
- `currency: text`
- `subtotal: numeric(10,2)`
- `discount_amount: numeric(10,2)`
- `shipping_fee: numeric(10,2)`
- `tax_amount: numeric(10,2)`
- `total_amount: numeric(10,2)`
- `coupon_id: uuid`
- `shipping_address_id: uuid`
- `billing_address_id: uuid`
- `shipping_address_snapshot: jsonb`
- `billing_address_snapshot: jsonb`
- `customer_note: text`
- `placed_at: timestamptz`
- `paid_at: timestamptz`
- `cancelled_at: timestamptz`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### `order_items`

- `id: uuid`
- `order_id: uuid`
- `product_id: uuid`
- `variant_id: uuid`
- `product_name: text`
- `variant_name: text`
- `sku: text`
- `size_label: text`
- `unit_price: numeric(10,2)`
- `compare_at_price: numeric(10,2)`
- `quantity: integer`
- `line_total: numeric(10,2)`
- `product_snapshot: jsonb`
- `created_at: timestamptz`

### `coupon_redemptions`

- `id: uuid`
- `coupon_id: uuid`
- `order_id: uuid`
- `user_id: uuid`
- `discount_amount: numeric(10,2)`
- `redeemed_at: timestamptz`

### `payments`

- `id: uuid`
- `order_id: uuid`
- `user_id: uuid`
- `provider: text`
- `provider_order_id: text`
- `provider_payment_id: text`
- `signature_verified: boolean`
- `amount: numeric(10,2)`
- `currency: text`
- `status: text`
- `payment_method: text`
- `gateway_response: jsonb`
- `failure_reason: text`
- `paid_at: timestamptz`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### `webhook_events`

- `id: uuid`
- `provider: text`
- `provider_event_id: text`
- `event_type: text`
- `payload: jsonb`
- `processed_at: timestamptz`
- `processing_error: text`
- `received_at: timestamptz`

### `shipments`

- `id: uuid`
- `order_id: uuid`
- `provider: text`
- `awb_number: text`
- `consignment_number: text`
- `courier_service: text`
- `tracking_url: text`
- `label_url: text`
- `status: text`
- `estimated_delivery_date: date`
- `booked_at: timestamptz`
- `picked_up_at: timestamptz`
- `delivered_at: timestamptz`
- `request_payload: jsonb`
- `response_payload: jsonb`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### `shipment_events`

- `id: uuid`
- `shipment_id: uuid`
- `event_code: text`
- `status: text`
- `description: text`
- `location: text`
- `event_time: timestamptz`
- `raw_event: jsonb`
- `created_at: timestamptz`

### `inventory_movements`

- `id: uuid`
- `variant_id: uuid`
- `order_id: uuid`
- `movement_type: text`
- `quantity_change: integer`
- `reason: text`
- `reference: text`
- `created_by: uuid`
- `created_at: timestamptz`

### `reviews`

- `id: uuid`
- `product_id: uuid`
- `user_id: uuid`
- `order_item_id: uuid`
- `rating: integer`
- `title: text`
- `body: text`
- `status: text`
- `created_at: timestamptz`
- `updated_at: timestamptz`

### `newsletter_subscribers`

- `id: uuid`
- `email: text`
- `is_active: boolean`
- `subscribed_at: timestamptz`
- `unsubscribed_at: timestamptz`

## Scope notes

- The setup script also references Supabase-managed `auth.users`; that table is not a project-owned table in the `public` schema and is not included in the 23-table count.
- This inventory lists column names and data types. The setup script additionally defines nullability, defaults, primary and foreign keys, unique constraints, checks, indexes, triggers, and row-level security policies.
