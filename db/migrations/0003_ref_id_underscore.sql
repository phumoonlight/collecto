-- `ref_id` may use `_` as well as `-` between its runs of a–z/0–9.
--
-- A new collection's address is now made from its name by the app — lowercased, spaces as
-- `_`, everything else dropped, `_xxxxx` appended on a collision (`names::ref_id_from_name`) —
-- and `_` is what that writes. The other rules stand: at most 64, and never a cuid2's shape,
-- so an address segment can't mean two collections. Mirrored by `names::valid_ref_id`.

alter table collections drop constraint collections_ref_id_format;
alter table collections add constraint collections_ref_id_format check (
  length(ref_id) <= 64
  and ref_id ~ '^[a-z0-9]+([_-][a-z0-9]+)*$'
  and ref_id !~ '^[a-z][a-z0-9]{23}$'
);
