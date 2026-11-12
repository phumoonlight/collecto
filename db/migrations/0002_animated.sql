-- Whether an image moves — a GIF with two or more frames, an APNG, an animated WebP. Set by
-- the app from the file's container when it is uploaded (`compress::is_animated`).
--
-- An animated image is stored **without a thumbnail**: a still cut from it would stop it
-- moving, so the website and the app draw the stored file itself, wherever the image shows.
-- Its `collections/thumbs/` path names nothing.
alter table collection_posts add column animated boolean not null default false;

-- What was uploaded before this column: every GIF is taken to move. Each has a first-frame
-- thumbnail in the bucket, which is no longer drawn. A one-frame GIF drawn at full size is
-- the same picture, so the guess costs at most bandwidth. Animated WebPs and APNGs cannot be
-- told apart from stills here, and keep drawing their thumbnails.
update collection_posts set animated = true where file_ext = 'gif';
