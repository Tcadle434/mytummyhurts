-- Product photos for barcode scans (Open Food Facts front image URL).
alter table public.grocery_products
  add column if not exists image_url text;
