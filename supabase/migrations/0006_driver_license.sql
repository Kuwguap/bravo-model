-- Driver's license number — collected on the tag site when a non-NJ buyer
-- opts into insurance, so the NY FS-20 card's PDF417 barcode (AAMVA DAQ) can
-- encode it. NJ cards have no barcode and don't need it.

alter table public.orders
  add column if not exists driver_license text;
