-- The draft table already restricts all access to the editorial service.
-- Cache derived English for an exact snapshot independently of the approved Persian.
alter table public.gerami_editorial_drafts add column if not exists english_edition jsonb;
