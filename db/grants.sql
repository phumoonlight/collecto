-- Who may do what. Re-applied by `db:push` after every migration: it is desired state, not
-- history, and roles are made after the schema — or remade with new passwords.
--
--   neondb_owner   the migration runner's. Never deployed, never compiled into anything.
--   collecto_app   compiled into the app. Reads and writes every row; may not create, alter
--                  or drop anything — a login extracted from a binary can vandalise the data
--                  and cannot drop the schema.
--   collecto_web   held by Vercel. Reads both tables and writes exactly one column: the view
--                  counter.
--
-- Grants go to whichever of the roles exist, so a scratch database still migrates.
-- **Create the roles with SQL, never in the Neon console** — see db/README.md.
do $$
declare
  content_tables constant text[] := array['collections', 'collection_posts'];
  entry text;
begin
  if to_regrole('collecto_web') is not null then
    execute 'grant usage on schema public to collecto_web';
    foreach entry in array content_tables loop
      execute format('grant select on public.%I to collecto_web', entry);
    end loop;
    execute 'grant update (view_count) on public.collection_posts to collecto_web';
  else
    raise notice 'collecto_web does not exist — skipping its grants (see db/README.md)';
  end if;

  if to_regrole('collecto_app') is not null then
    execute 'grant usage on schema public to collecto_app';
    foreach entry in array content_tables loop
      execute format('grant select, insert, update, delete on public.%I to collecto_app', entry);
    end loop;
  else
    raise notice 'collecto_app does not exist — skipping its grants (see db/README.md)';
  end if;
end $$;
