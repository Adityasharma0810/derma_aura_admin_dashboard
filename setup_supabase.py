#!/usr/bin/env python3
"""Create the Aura skincare storefront schema in Supabase Postgres.

Requirements:
    pip install "psycopg[binary]>=3.2,<4"

Set SUPABASE_DB_URL to the connection string from Supabase Dashboard -> Connect.
This uses a direct Postgres/session-pooler connection, NOT the Supabase anon key.

The script is safe to re-run: tables/indexes are IF NOT EXISTS, policies/triggers
are recreated, and starter catalogue data is inserted only when missing.
"""

from __future__ import annotations

import os
import sys
from typing import Any

try:
    import psycopg
except ImportError:
    print('Missing dependency. Install it with: python -m pip install "psycopg[binary]>=3.2,<4"')
    raise SystemExit(1)


SCHEMA_SQL = r"""
-- Private helper schema: do not expose this schema through the Supabase Data API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Customer profile (credentials stay in Supabase Auth / auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text,
    full_name text,
    phone text,
    avatar_url text,
    role text not null default 'customer' check (role in ('customer', 'admin')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Catalogue
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null unique,
    description text,
    sort_order integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.skin_concerns (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null unique,
    short_description text,
    icon text,
    sort_order integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.products (
    id uuid primary key default gen_random_uuid(),
    category_id uuid references public.categories(id) on delete set null,
    name text not null,
    slug text not null unique,
    short_description text,
    description text,
    benefit_label text,
    kind text not null default 'other',
    badge_text text,
    skin_types text[] not null default '{}',
    key_benefits text[] not null default '{}',
    ingredients jsonb not null default '[]'::jsonb,
    how_to_use text,
    is_featured boolean not null default false,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.product_images (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references public.products(id) on delete cascade,
    image_url text not null,
    alt_text text,
    sort_order integer not null default 0,
    is_primary boolean not null default false,
    created_at timestamptz not null default now()
);

-- A product can have multiple sizes / SKUs. Price and inventory live on the variant.
create table if not exists public.product_variants (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references public.products(id) on delete cascade,
    sku text not null unique,
    variant_name text not null default 'Default',
    size_label text,
    price numeric(10,2) not null check (price >= 0),
    compare_at_price numeric(10,2) check (compare_at_price is null or compare_at_price >= price),
    stock_quantity integer not null default 0 check (stock_quantity >= 0),
    low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
    is_default boolean not null default false,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.product_concerns (
    product_id uuid not null references public.products(id) on delete cascade,
    concern_id uuid not null references public.skin_concerns(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (product_id, concern_id)
);

-- ---------------------------------------------------------------------------
-- 3. Customer address book, cart and wishlist
-- ---------------------------------------------------------------------------
create table if not exists public.addresses (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    recipient_name text not null,
    phone text not null,
    address_line1 text not null,
    address_line2 text,
    landmark text,
    city text not null,
    state text not null,
    pincode text not null,
    country text not null default 'India',
    address_type text not null default 'home' check (address_type in ('home', 'work', 'other')),
    is_default boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create unique index if not exists addresses_one_default_per_user
    on public.addresses(user_id) where is_default = true;

create table if not exists public.carts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    status text not null default 'active' check (status in ('active', 'converted', 'abandoned')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create unique index if not exists carts_one_active_cart_per_user
    on public.carts(user_id) where status = 'active';

create table if not exists public.cart_items (
    id uuid primary key default gen_random_uuid(),
    cart_id uuid not null references public.carts(id) on delete cascade,
    variant_id uuid not null references public.product_variants(id) on delete restrict,
    quantity integer not null default 1 check (quantity > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (cart_id, variant_id)
);

create table if not exists public.wishlists (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique references auth.users(id) on delete cascade,
    name text not null default 'My Wishlist',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.wishlist_items (
    id uuid primary key default gen_random_uuid(),
    wishlist_id uuid not null references public.wishlists(id) on delete cascade,
    variant_id uuid not null references public.product_variants(id) on delete cascade,
    created_at timestamptz not null default now(),
    unique (wishlist_id, variant_id)
);

-- ---------------------------------------------------------------------------
-- 4. Coupons and orders
-- ---------------------------------------------------------------------------
create table if not exists public.coupons (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    description text,
    discount_type text not null check (discount_type in ('percentage', 'fixed')),
    discount_value numeric(10,2) not null check (discount_value > 0),
    minimum_order_value numeric(10,2) not null default 0 check (minimum_order_value >= 0),
    maximum_discount numeric(10,2) check (maximum_discount is null or maximum_discount >= 0),
    usage_limit integer check (usage_limit is null or usage_limit > 0),
    per_user_limit integer not null default 1 check (per_user_limit > 0),
    starts_at timestamptz not null default now(),
    expires_at timestamptz,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (expires_at is null or expires_at > starts_at)
);

create table if not exists public.orders (
    id uuid primary key default gen_random_uuid(),
    order_number text not null unique,
    user_id uuid not null references auth.users(id) on delete restrict,
    customer_email text not null,
    customer_name text not null,
    customer_phone text not null,
    status text not null default 'pending_payment'
        check (status in ('pending_payment', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
    payment_status text not null default 'pending'
        check (payment_status in ('pending', 'paid', 'failed', 'partially_refunded', 'refunded')),
    currency text not null default 'INR' check (currency = 'INR'),
    subtotal numeric(10,2) not null check (subtotal >= 0),
    discount_amount numeric(10,2) not null default 0 check (discount_amount >= 0),
    shipping_fee numeric(10,2) not null default 0 check (shipping_fee >= 0),
    tax_amount numeric(10,2) not null default 0 check (tax_amount >= 0),
    total_amount numeric(10,2) not null check (total_amount >= 0),
    coupon_id uuid references public.coupons(id) on delete set null,
    shipping_address_id uuid references public.addresses(id) on delete set null,
    billing_address_id uuid references public.addresses(id) on delete set null,
    shipping_address_snapshot jsonb not null,
    billing_address_snapshot jsonb,
    customer_note text,
    placed_at timestamptz not null default now(),
    paid_at timestamptz,
    cancelled_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete cascade,
    product_id uuid references public.products(id) on delete set null,
    variant_id uuid references public.product_variants(id) on delete set null,
    product_name text not null,
    variant_name text,
    sku text,
    size_label text,
    unit_price numeric(10,2) not null check (unit_price >= 0),
    compare_at_price numeric(10,2),
    quantity integer not null check (quantity > 0),
    line_total numeric(10,2) not null check (line_total >= 0),
    product_snapshot jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.coupon_redemptions (
    id uuid primary key default gen_random_uuid(),
    coupon_id uuid not null references public.coupons(id) on delete restrict,
    order_id uuid not null references public.orders(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete restrict,
    discount_amount numeric(10,2) not null check (discount_amount >= 0),
    redeemed_at timestamptz not null default now(),
    unique (coupon_id, order_id)
);

-- ---------------------------------------------------------------------------
-- 5. Razorpay payments and webhook idempotency
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete restrict,
    user_id uuid not null references auth.users(id) on delete restrict,
    provider text not null default 'razorpay' check (provider = 'razorpay'),
    provider_order_id text unique,
    provider_payment_id text unique,
    signature_verified boolean not null default false,
    amount numeric(10,2) not null check (amount >= 0),
    currency text not null default 'INR' check (currency = 'INR'),
    status text not null default 'created'
        check (status in ('created', 'authorized', 'captured', 'failed', 'partially_refunded', 'refunded')),
    payment_method text,
    gateway_response jsonb not null default '{}'::jsonb,
    failure_reason text,
    paid_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.webhook_events (
    id uuid primary key default gen_random_uuid(),
    provider text not null,
    provider_event_id text not null,
    event_type text not null,
    payload jsonb not null,
    processed_at timestamptz,
    processing_error text,
    received_at timestamptz not null default now(),
    unique (provider, provider_event_id)
);

-- ---------------------------------------------------------------------------
-- 6. DTDC shipment and tracking history
-- ---------------------------------------------------------------------------
create table if not exists public.shipments (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.orders(id) on delete restrict,
    provider text not null default 'dtdc' check (provider = 'dtdc'),
    awb_number text,
    consignment_number text,
    courier_service text,
    tracking_url text,
    label_url text,
    status text not null default 'pending'
        check (status in ('pending', 'booked', 'pickup_scheduled', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'rto', 'cancelled', 'exception')),
    estimated_delivery_date date,
    booked_at timestamptz,
    picked_up_at timestamptz,
    delivered_at timestamptz,
    request_payload jsonb not null default '{}'::jsonb,
    response_payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create unique index if not exists shipments_unique_dtdc_awb
    on public.shipments(provider, awb_number) where awb_number is not null;

create table if not exists public.shipment_events (
    id uuid primary key default gen_random_uuid(),
    shipment_id uuid not null references public.shipments(id) on delete cascade,
    event_code text,
    status text not null,
    description text,
    location text,
    event_time timestamptz,
    raw_event jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 7. Inventory audit, product reviews and newsletter
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_movements (
    id uuid primary key default gen_random_uuid(),
    variant_id uuid not null references public.product_variants(id) on delete restrict,
    order_id uuid references public.orders(id) on delete set null,
    movement_type text not null check (movement_type in ('restock', 'sale', 'return', 'adjustment', 'reservation', 'release')),
    quantity_change integer not null check (quantity_change <> 0),
    reason text,
    reference text,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create table if not exists public.reviews (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references public.products(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    order_item_id uuid not null unique references public.order_items(id) on delete restrict,
    rating integer not null check (rating between 1 and 5),
    title text,
    body text,
    status text not null default 'pending' check (status in ('pending', 'published', 'rejected')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.newsletter_subscribers (
    id uuid primary key default gen_random_uuid(),
    email text not null,
    is_active boolean not null default true,
    subscribed_at timestamptz not null default now(),
    unsubscribed_at timestamptz
);
create unique index if not exists newsletter_subscribers_email_lower_unique
    on public.newsletter_subscribers (lower(email));

-- ---------------------------------------------------------------------------
-- 8. Indexes for common storefront, account and operations queries
-- ---------------------------------------------------------------------------
create index if not exists products_category_active_idx on public.products(category_id, is_active);
create index if not exists products_featured_idx on public.products(is_featured) where is_active = true;
create index if not exists product_images_product_sort_idx on public.product_images(product_id, sort_order);
create index if not exists variants_product_active_idx on public.product_variants(product_id, is_active);
create index if not exists product_concerns_concern_idx on public.product_concerns(concern_id);
create index if not exists addresses_user_idx on public.addresses(user_id);
create index if not exists cart_items_cart_idx on public.cart_items(cart_id);
create index if not exists wishlist_items_wishlist_idx on public.wishlist_items(wishlist_id);
create index if not exists orders_user_created_idx on public.orders(user_id, created_at desc);
create index if not exists orders_status_idx on public.orders(status, created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists payments_order_idx on public.payments(order_id, created_at desc);
create index if not exists webhook_events_unprocessed_idx on public.webhook_events(received_at) where processed_at is null;
create index if not exists shipments_order_idx on public.shipments(order_id);
create index if not exists shipments_awb_idx on public.shipments(awb_number);
create index if not exists shipment_events_shipment_time_idx on public.shipment_events(shipment_id, event_time desc);
create index if not exists inventory_movements_variant_time_idx on public.inventory_movements(variant_id, created_at desc);
create index if not exists reviews_product_status_idx on public.reviews(product_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- 9. Helper functions and Auth profile trigger
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create or replace function private.handle_auth_user_upsert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles as current_profile (id, email, full_name)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
    )
    on conflict (id) do update
       set email = excluded.email,
           full_name = coalesce(current_profile.full_name, excluded.full_name);
    return new;
end;
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'admin'
    );
$$;
revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.handle_auth_user_upsert() from public, anon, authenticated;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

-- Keep profiles in sync for both new signups and email changes.
drop trigger if exists on_auth_user_created_or_updated on auth.users;
create trigger on_auth_user_created_or_updated
after insert or update of email on auth.users
for each row execute function private.handle_auth_user_upsert();

-- Backfill profiles for Auth users that existed before this setup script.
insert into public.profiles (id, email, full_name)
select id, email, coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name')
from auth.users
on conflict (id) do nothing;

-- updated_at triggers (recreated so this script can safely be re-run).
do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'profiles', 'categories', 'skin_concerns', 'products', 'product_variants',
        'addresses', 'carts', 'cart_items', 'wishlists', 'coupons', 'orders',
        'payments', 'shipments', 'reviews'
    ] loop
        execute format('drop trigger if exists set_updated_at on public.%I', table_name);
        execute format(
            'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
            table_name
        );
    end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Row Level Security (RLS)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.skin_concerns enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_concerns enable row level security;
alter table public.addresses enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.wishlists enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.coupons enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.payments enable row level security;
alter table public.webhook_events enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_events enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.reviews enable row level security;
alter table public.newsletter_subscribers enable row level security;

-- Remove only policies owned by this setup script; preserve any custom policies.
do $$
declare
    policy_row record;
begin
    for policy_row in
        select schemaname, tablename, policyname
        from pg_policies
        where schemaname = 'public'
          and policyname = any (array[
            'categories_public_read','categories_admin_manage',
            'skin_concerns_public_read','skin_concerns_admin_manage',
            'products_public_read','products_admin_manage',
            'product_images_public_read','product_images_admin_manage',
            'product_variants_public_read','product_variants_admin_manage',
            'product_concerns_public_read','product_concerns_admin_manage',
            'profiles_read_own','profiles_admin_read','profiles_update_own',
            'addresses_owner_all','carts_owner_all','cart_items_owner_all',
            'wishlists_owner_all','wishlist_items_owner_all','coupons_admin_manage',
            'coupon_redemptions_owner_read','coupon_redemptions_admin_manage',
            'orders_owner_read','orders_admin_read','order_items_owner_read',
            'order_items_admin_read','payments_owner_read','payments_admin_read',
            'shipments_owner_read','shipments_admin_read','shipment_events_owner_read',
            'shipment_events_admin_read','inventory_movements_admin_read',
            'reviews_public_read','reviews_owner_read','reviews_verified_purchase_insert',
            'reviews_admin_manage','newsletter_public_insert','newsletter_admin_read'
          ])
    loop
        execute format('drop policy %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
    end loop;
end;
$$;

-- Public catalogue reads; only active products/variants/images are visible.
create policy categories_public_read on public.categories
for select to anon, authenticated using (is_active);
create policy categories_admin_manage on public.categories
for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy skin_concerns_public_read on public.skin_concerns
for select to anon, authenticated using (is_active);
create policy skin_concerns_admin_manage on public.skin_concerns
for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy products_public_read on public.products
for select to anon, authenticated using (is_active);
create policy products_admin_manage on public.products
for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy product_images_public_read on public.product_images
for select to anon, authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.is_active = true)
);
create policy product_images_admin_manage on public.product_images
for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy product_variants_public_read on public.product_variants
for select to anon, authenticated using (
    is_active and exists (select 1 from public.products p where p.id = product_id and p.is_active = true)
);
create policy product_variants_admin_manage on public.product_variants
for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy product_concerns_public_read on public.product_concerns
for select to anon, authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.is_active = true)
);
create policy product_concerns_admin_manage on public.product_concerns
for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- Profile: customers can read their own profile and update only safe columns.
create policy profiles_read_own on public.profiles
for select to authenticated using (id = (select auth.uid()));
create policy profiles_admin_read on public.profiles
for select to authenticated using ((select private.is_admin()));
create policy profiles_update_own on public.profiles
for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Addresses belong to one authenticated customer.
create policy addresses_owner_all on public.addresses
for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Carts and cart items: a customer can only access their own active cart data.
create policy carts_owner_all on public.carts
for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy cart_items_owner_all on public.cart_items
for all to authenticated using (
    exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid()))
) with check (
    exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid()))
);

create policy wishlists_owner_all on public.wishlists
for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy wishlist_items_owner_all on public.wishlist_items
for all to authenticated using (
    exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = (select auth.uid()))
) with check (
    exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = (select auth.uid()))
);

-- Coupons are manageable by admins; customers validate/redeem through a server function.
create policy coupons_admin_manage on public.coupons
for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy coupon_redemptions_owner_read on public.coupon_redemptions
for select to authenticated using (user_id = (select auth.uid()));
create policy coupon_redemptions_admin_manage on public.coupon_redemptions
for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- Checkout/payment/order/shipping writes are server-side only (Edge Function / trusted backend).
create policy orders_owner_read on public.orders
for select to authenticated using (user_id = (select auth.uid()));
create policy orders_admin_read on public.orders
for select to authenticated using ((select private.is_admin()));

create policy order_items_owner_read on public.order_items
for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
);
create policy order_items_admin_read on public.order_items
for select to authenticated using ((select private.is_admin()));

create policy payments_owner_read on public.payments
for select to authenticated using (user_id = (select auth.uid()));
create policy payments_admin_read on public.payments
for select to authenticated using ((select private.is_admin()));

create policy shipments_owner_read on public.shipments
for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
);
create policy shipments_admin_read on public.shipments
for select to authenticated using ((select private.is_admin()));

create policy shipment_events_owner_read on public.shipment_events
for select to authenticated using (
    exists (
        select 1 from public.shipments s
        join public.orders o on o.id = s.order_id
        where s.id = shipment_id and o.user_id = (select auth.uid())
    )
);
create policy shipment_events_admin_read on public.shipment_events
for select to authenticated using ((select private.is_admin()));

create policy inventory_movements_admin_read on public.inventory_movements
for select to authenticated using ((select private.is_admin()));

-- Customers may submit a review only for a delivered order item they own.
create policy reviews_public_read on public.reviews
for select to anon, authenticated using (status = 'published');
create policy reviews_owner_read on public.reviews
for select to authenticated using (user_id = (select auth.uid()));
create policy reviews_verified_purchase_insert on public.reviews
for insert to authenticated with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and exists (
        select 1
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        where oi.id = public.reviews.order_item_id
          and oi.product_id = public.reviews.product_id
          and o.user_id = (select auth.uid())
          and o.status = 'delivered'
    )
);
create policy reviews_admin_manage on public.reviews
for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

-- Newsletter signup is public; subscribers cannot read the mailing list via the Data API.
create policy newsletter_public_insert on public.newsletter_subscribers
for insert to anon, authenticated with check (
    is_active = true and email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
);
create policy newsletter_admin_read on public.newsletter_subscribers
for select to authenticated using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- 11. Explicit least-privilege grants (RLS policies do not grant SQL privileges)
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.categories, public.skin_concerns, public.products,
    public.product_images, public.product_variants, public.product_concerns,
    public.addresses, public.carts, public.cart_items, public.wishlists,
    public.wishlist_items, public.coupons, public.orders, public.order_items,
    public.coupon_redemptions, public.payments, public.webhook_events,
    public.shipments, public.shipment_events, public.inventory_movements,
    public.reviews, public.newsletter_subscribers from anon, authenticated;

-- Public storefront data.
grant select on public.categories, public.skin_concerns, public.products,
    public.product_images, public.product_variants, public.product_concerns,
    public.reviews to anon, authenticated;
grant insert on public.newsletter_subscribers to anon, authenticated;

-- Customer-owned records.
grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;
grant select, insert, update, delete on public.addresses, public.carts,
    public.cart_items, public.wishlists, public.wishlist_items to authenticated;
grant select on public.orders, public.order_items, public.payments,
    public.shipments, public.shipment_events, public.coupon_redemptions to authenticated;
grant insert on public.reviews to authenticated;

-- Admin-only Data API access is still protected by private.is_admin() policies.
grant insert, update, delete on public.categories, public.skin_concerns,
    public.products, public.product_images, public.product_variants,
    public.product_concerns, public.coupons, public.reviews to authenticated;
grant select on public.coupons, public.inventory_movements,
    public.newsletter_subscribers to authenticated;

-- Trusted Edge Functions use service_role for server-only order/payment/shipping writes.
grant all privileges on public.profiles, public.categories, public.skin_concerns, public.products,
    public.product_images, public.product_variants, public.product_concerns,
    public.addresses, public.carts, public.cart_items, public.wishlists,
    public.wishlist_items, public.coupons, public.orders, public.order_items,
    public.coupon_redemptions, public.payments, public.webhook_events,
    public.shipments, public.shipment_events, public.inventory_movements,
    public.reviews, public.newsletter_subscribers to service_role;

-- Server functions using the service role perform checkout, payment and courier writes.
-- These records intentionally have no customer INSERT/UPDATE/DELETE policies.
"""


CATEGORIES = [
    ("Serums", "serums", "Targeted daily treatment serums.", 1),
    ("Moisturisers", "moisturisers", "Daily hydration and barrier care.", 2),
    ("Cleansers", "cleansers", "Gentle everyday cleansing.", 3),
    ("Sunscreens", "sunscreens", "Daily sun protection.", 4),
]

CONCERNS = [
    ("Dullness & pigmentation", "dullness", "Find your glow", "sun", 1),
    ("Dryness & dehydration", "dryness", "A little more hydration", "drop", 2),
    ("Acne & blemishes", "acne", "Keep things clear", "leaf", 3),
    ("Sensitivity & redness", "sensitivity", "Care, a little gentler", "shield", 4),
    ("Sun protection", "sun", "Your everyday defence", "sun", 5),
    ("Fine lines & texture", "ageing", "Smooth, soft, replenished", "drop", 6),
]

# Data below is the six illustrative items already present in the uploaded React storefront.
PRODUCTS = [
    {
        "name": "Vitamin C Glow Serum", "slug": "vitamin-c-glow-serum", "kind": "serum",
        "category": "serums", "benefit": "BRIGHTEN + REVIVE", "badge": "Bestseller",
        "price": 699, "compare": 899, "sku": "AURA-SER-001", "size": "30 ml",
        "stock": 25, "skin": ["dry", "normal", "combination", "oily"],
        "concerns": ["dullness", "ageing"], "featured": True,
    },
    {
        "name": "Barrier Repair Moisturiser", "slug": "barrier-repair-moisturiser", "kind": "jar",
        "category": "moisturisers", "benefit": "NOURISH + STRENGTHEN", "badge": None,
        "price": 599, "compare": 749, "sku": "AURA-MOI-001", "size": "50 g",
        "stock": 25, "skin": ["dry", "normal", "sensitive", "combination"],
        "concerns": ["dryness", "sensitivity"], "featured": True,
    },
    {
        "name": "Gentle Daily Cleanser", "slug": "gentle-daily-cleanser", "kind": "pump",
        "category": "cleansers", "benefit": "CLEANSE + REFRESH", "badge": None,
        "price": 399, "compare": 499, "sku": "AURA-CLE-001", "size": "100 ml",
        "stock": 25, "skin": ["dry", "normal", "sensitive", "combination", "oily"],
        "concerns": ["acne", "sensitivity"], "featured": True,
    },
    {
        "name": "Dewy Sunscreen SPF 50", "slug": "dewy-sunscreen-spf-50", "kind": "tube",
        "category": "sunscreens", "benefit": "PROTECT + GLOW", "badge": "New",
        "price": 549, "compare": 699, "sku": "AURA-SUN-001", "size": "50 g",
        "stock": 25, "skin": ["dry", "normal", "combination", "oily"],
        "concerns": ["sun", "dullness"], "featured": True,
    },
    {
        "name": "Hydra Boost Serum", "slug": "hydra-boost-serum", "kind": "serum",
        "category": "serums", "benefit": "PLUMP + HYDRATE", "badge": None,
        "price": 649, "compare": 799, "sku": "AURA-SER-002", "size": "30 ml",
        "stock": 25, "skin": ["dry", "normal", "combination", "oily"],
        "concerns": ["dryness"], "featured": False,
    },
    {
        "name": "Overnight Renewal Cream", "slug": "overnight-renewal-cream", "kind": "jar",
        "category": "moisturisers", "benefit": "REST + RESTORE", "badge": None,
        "price": 749, "compare": 949, "sku": "AURA-MOI-002", "size": "50 g",
        "stock": 25, "skin": ["dry", "normal"],
        "concerns": ["ageing", "dryness"], "featured": False,
    },
]


def seed_catalogue(conn: psycopg.Connection[Any]) -> None:
    """Insert starter categories, concerns, products, variants and concern links."""
    with conn.cursor() as cur:
        category_ids: dict[str, str] = {}
        for name, slug, description, sort_order in CATEGORIES:
            cur.execute(
                """insert into public.categories (name, slug, description, sort_order)
                   values (%s, %s, %s, %s)
                   on conflict (slug) do nothing
                   returning id""",
                (name, slug, description, sort_order),
            )
            row = cur.fetchone()
            if row is None:
                cur.execute("select id from public.categories where slug = %s", (slug,))
                row = cur.fetchone()
            category_ids[slug] = str(row[0])

        concern_ids: dict[str, str] = {}
        for name, slug, short_description, icon, sort_order in CONCERNS:
            cur.execute(
                """insert into public.skin_concerns (name, slug, short_description, icon, sort_order)
                   values (%s, %s, %s, %s, %s)
                   on conflict (slug) do nothing
                   returning id""",
                (name, slug, short_description, icon, sort_order),
            )
            row = cur.fetchone()
            if row is None:
                cur.execute("select id from public.skin_concerns where slug = %s", (slug,))
                row = cur.fetchone()
            concern_ids[slug] = str(row[0])

        for product in PRODUCTS:
            cur.execute(
                """insert into public.products
                   (category_id, name, slug, short_description, benefit_label, kind,
                    badge_text, skin_types, is_featured, is_active)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, true)
                   on conflict (slug) do nothing
                   returning id""",
                (
                    category_ids[product["category"]], product["name"], product["slug"],
                    product["benefit"].title(), product["benefit"], product["kind"],
                    product["badge"], product["skin"], product["featured"],
                ),
            )
            row = cur.fetchone()
            if row is None:
                cur.execute("select id from public.products where slug = %s", (product["slug"],))
                row = cur.fetchone()
            product_id = str(row[0])

            cur.execute(
                """insert into public.product_variants
                   (product_id, sku, variant_name, size_label, price, compare_at_price,
                    stock_quantity, is_default, is_active)
                   values (%s, %s, 'Default', %s, %s, %s, %s, true, true)
                   on conflict (sku) do nothing""",
                (
                    product_id, product["sku"], product["size"], product["price"],
                    product["compare"], product["stock"],
                ),
            )

            for concern_slug in product["concerns"]:
                cur.execute(
                    """insert into public.product_concerns (product_id, concern_id)
                       values (%s, %s) on conflict do nothing""",
                    (product_id, concern_ids[concern_slug]),
                )

        # GLOW10 matches the promotional code shown in the current demo cart.
        cur.execute(
            """insert into public.coupons
               (code, description, discount_type, discount_value, per_user_limit, is_active)
               values ('GLOW10', '10% off your order', 'percentage', 10, 1, true)
               on conflict (code) do nothing"""
        )


def verify_setup(conn: psycopg.Connection[Any]) -> None:
    expected_tables = [
        "profiles", "categories", "skin_concerns", "products", "product_images",
        "product_variants", "product_concerns", "addresses", "carts", "cart_items",
        "wishlists", "wishlist_items", "coupons", "orders", "order_items",
        "coupon_redemptions", "payments", "webhook_events", "shipments",
        "shipment_events", "inventory_movements", "reviews", "newsletter_subscribers",
    ]
    with conn.cursor() as cur:
        cur.execute(
            """select tablename, rowsecurity
               from pg_tables
               where schemaname = 'public' and tablename = any(%s)
               order by tablename""",
            (expected_tables,),
        )
        rows = cur.fetchall()

    found = {name: rls for name, rls in rows}
    missing = [name for name in expected_tables if name not in found]
    unprotected = [name for name, enabled in found.items() if not enabled]
    print("\nDatabase setup verification")
    print(f"Tables found: {len(found)}/{len(expected_tables)}")
    print(f"RLS enabled:  {len(found) - len(unprotected)}/{len(found)}")
    if missing:
        print("Missing tables:", ", ".join(missing))
    if unprotected:
        print("Tables with RLS disabled:", ", ".join(unprotected))
    if missing or unprotected:
        raise RuntimeError("Schema verification failed. Review the database output above.")


def main() -> int:
    database_url = os.getenv("SUPABASE_DB_URL", "").strip()
    if not database_url:
        print("SUPABASE_DB_URL is not set.")
        print("Copy the PostgreSQL connection string from Supabase Dashboard -> Connect.")
        print("PowerShell example:")
        print('  $env:SUPABASE_DB_URL = "postgresql://postgres:YOUR_PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres"')
        return 2

    seed = "--no-seed" not in sys.argv
    print("Connecting to Supabase Postgres...")
    try:
        # sslmode=require encrypts the connection. Prefer Supabase direct or session pooler.
        with psycopg.connect(database_url, sslmode="require", connect_timeout=20) as conn:
            print("Creating tables, indexes, triggers, functions and RLS policies...")
            with conn.cursor() as cur:
                cur.execute(SCHEMA_SQL, prepare=False)

            if seed:
                print("Adding the six existing Aura demo products, categories, concerns and GLOW10 coupon...")
                seed_catalogue(conn)
            else:
                print("Skipping starter catalogue data (--no-seed).")

            verify_setup(conn)

        print("\nSuccess. Aura's Supabase schema is ready.")
        print("Next: configure Supabase Auth providers, then build Edge Functions for checkout/Razorpay/DTDC.")
        return 0
    except Exception as exc:  # noqa: BLE001 - show database/connection errors to the developer
        print(f"\nSetup failed: {type(exc).__name__}: {exc}")
        print("Check the database password/connection string and ensure the database is reachable.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
