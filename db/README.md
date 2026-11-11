# The database

Postgres on Neon — its own project, separate from booru's. `migrations/` is the source of
truth, applied by `scripts/migrate.mts` (TypeScript, run directly by Node 24); a dashboard
edit is never the answer.

| | |
|---|---|
| `npm run db:push` | list what the database has not seen, ask, apply it, then re-apply `grants.sql`. `--yes` skips the question |
| `npm run db:list` | what is applied and what is pending |
| `npm run db:reset` | **drops every table** and applies everything from nothing. Shows what it will drop and how many rows, then asks you to type the database name — `--yes` does not skip it; without a terminal pass `--confirm=<name>`. Images in the bucket are not deleted |

All three read `DATABASE_URL_OWNER` from `.env`.

## The three roles

**The owner is the one Neon already made** — `neondb_owner`. That is `DATABASE_URL_OWNER`.

The other two are yours. **Make them with SQL, in Neon's SQL Editor — not with the console's
Add role button:**

```sql
create role collecto_app login password 'a long random string';
create role collecto_web login password 'a different long random string';
```

A console-made role is granted `neon_superuser` (CREATEDB, CREATEROLE, BYPASSRLS), which
overrides every grant here — and the owner cannot revoke that membership, so the only repair
is `drop role` and making it again from SQL.

Then `npm run db:push`. It re-applies `grants.sql` whether or not a migration ran, so it is
also what you run after recreating a role.

| role | held by | may |
|---|---|---|
| `neondb_owner` | `.env`, the migration runner only | everything, DDL included |
| `collecto_app` | the app, via its setup code (`DATABASE_URL_APP`, `npm run app:code`) | read and write every row; **no** create, alter or drop |
| `collecto_web` | Vercel (`DATABASE_URL`) | read both tables; `update (view_count) on collection_posts`, and nothing else |

**Which host for which login.** The website runs on serverless functions: give `DATABASE_URL`
Neon's *pooled* host (`…-pooler…`). The app holds a handful of long-lived connections: the
direct host is the natural fit for `DATABASE_URL_APP`, though the pooled one works too — the
app sends no named prepared statements.

## Adding a migration

A new numbered file — `0004_whatever.sql` — never an edit to one already applied anywhere
real. Each runs inside a transaction and is recorded in `_migrations`.

| file | |
|---|---|
| `0001_baseline.sql` | `collections` and `collection_posts` |
| `0002_collection_cuid_ref.sql` | `collections.id` becomes a cuid2 (existing rows get new ids, posts follow); adds `collections.ref_id` |
| `0003_ref_id_underscore.sql` | `ref_id` may use `_` as well as `-` between its runs |

## Shape

```
collections ───< collection_posts
```

- **A collection's id is a cuid2** (`^[a-z][a-z0-9]{23}$`), made by the app; it never changes.
- **`ref_id` is its web address** — `/collections/<ref_id>`, or `/collections/<id>` when unset.
  Made from the name when the collection is created (lowercase, spaces as `_`, other characters
  dropped, `_xxxxx` appended on a collision), then editable in the app. Unique; runs of a–z/0–9
  joined by single `_` or `-`, at most 64, and never cuid2-shaped, so an address segment can't
  mean two collections. Changing it breaks links to the old address.
- **A collection cannot be deleted while it holds anything** — `collection_posts.collection_id`
  has no `on delete cascade`.
- **An image lives on exactly one shelf** — `file_name` (the md5 of the uploaded bytes) is
  unique across the table.
- **Storage paths are derived, never stored**: `collections/posts/{file_name}.{file_ext}` and
  `collections/thumbs/{file_name}.{file_ext}`. Flat rather than per shelf, so moving an image is
  one column and no object moves.
- **The cover is derived** — the newest image on the shelf — not a column.
- **`updated_at` is maintained by the app**, in the same transaction as each change.
