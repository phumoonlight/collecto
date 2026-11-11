-- Collecto's schema: named collections of images, and the images on them.
--
-- Two tables, no functions, no triggers. What booru's shelves became with everything but the
-- shelf taken out: no rating, no AI flag, no tags, no maintenance switch. A collection has a
-- name and a mark; an image has a source and the facts about its file.

create table collections (
  id integer generated always as identity primary key,
  -- Prose, not a tag: spaces, capitals and punctuation. The app settles the spelling —
  -- trimmed, whitespace collapsed, 64 characters (`names.rs`).
  name text not null,
  -- Free prefix drawn before the name — an emoji, `[WIP]`, a year. 12 graphemes; null for none.
  mark text,
  created_at timestamptz not null default now(),
  -- What the list is ordered by: a shelf is most interesting when something just happened to
  -- it. Touched by an edit and by every image added, removed or moved — by the app, inside the
  -- same transaction as the change, since this schema has no triggers.
  updated_at timestamptz not null default now()
);

-- `Sketches` and `sketches` are one shelf spelled two ways; refusing the second is the
-- useful answer.
create unique index collections_name_key on collections (lower(name));
create index collections_updated_idx on collections (updated_at desc, id desc);

create table collection_posts (
  id integer generated always as identity primary key,
  -- **No `on delete cascade`, on purpose.** A collection cannot be deleted while it holds
  -- anything, and the foreign key is the enforcement: a cascade would silently destroy a set
  -- of images along with a row somebody meant to tidy up.
  collection_id integer not null references collections (id),
  -- The md5 of the *uploaded* bytes, naming both stored objects:
  -- `collections/posts/{file_name}.{file_ext}` and `collections/thumbs/{file_name}.{file_ext}`.
  -- Unique across the whole table: an image lives on exactly one shelf, and two rows for the
  -- same bytes would be two rows pointing at one pair of objects.
  file_name text unique not null,
  -- The uploaded format, kept: the app compresses losslessly and never converts. Both stored
  -- objects take this extension.
  file_ext text not null check (file_ext in ('jpg', 'png', 'gif', 'webp')),
  -- Of the stored image, after lossless compression.
  file_size integer not null,
  -- Of the file as uploaded — what the compression is measured against.
  original_size integer not null,
  -- As displayed: an EXIF quarter turn has already swapped them.
  width integer not null,
  height integer not null,
  source_url text,
  -- The website's one write, granted by column (`db/grants.sql`).
  view_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- "This shelf, newest first", cursored by id — the only way a shelf is read.
create index collection_posts_collection_idx on collection_posts (collection_id, id desc);
