# The database

Postgres on Neon — its own project, separate from booru's. `migrations/` is the source of
truth, applied by `scripts/migrate.mjs`; a dashboard edit is never the answer.

| | |
|---|---|
| `npm run db:push` | list what the database has not seen, ask, apply it, then re-apply `grants.sql`. `--yes` skips the question |
| `npm run db:list` | what is applied and what is pending |

Both read `DATABASE_URL_OWNER` from `.env.local`.

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
| `neondb_owner` | `.env.local`, the migration runner only | everything, DDL included |
| `collecto_app` | compiled into the app (`DATABASE_URL_APP`) | read and write every row; **no** create, alter or drop |
| `collecto_web` | Vercel (`DATABASE_URL`) | read both tables; `update (view_count) on collection_posts`, and nothing else |

**Which host for which login.** The website runs on serverless functions: give `DATABASE_URL`
Neon's *pooled* host (`…-pooler…`). The app holds a handful of long-lived connections: the
direct host is the natural fit for `DATABASE_URL_APP`, though the pooled one works too — the
app sends no named prepared statements.

## Adding a migration

A new numbered file — `0002_whatever.sql` — never an edit to one already applied anywhere
real. Each runs inside a transaction and is recorded in `_migrations`.

## Shape

```
collections ───< collection_posts
```

- **A collection cannot be deleted while it holds anything** — `collection_posts.collection_id`
  has no `on delete cascade`.
- **An image lives on exactly one shelf** — `file_name` (the md5 of the uploaded bytes) is
  unique across the table.
- **Storage paths are derived, never stored**: `collections/posts/{file_name}.{file_ext}` and
  `collections/thumbs/{file_name}.{file_ext}`. Flat rather than per shelf, so moving an image is
  one column and no object moves.
- **The cover is derived** — the newest image on the shelf — not a column.
- **`updated_at` is maintained by the app**, in the same transaction as each change.
