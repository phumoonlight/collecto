# Smart lossy compression (planned, not built)

Agent-facing spec. The human-readable version is `docs/smart-lossy.html` — keep both in step.

An **optional** lossy mode for uploads, like TinyPNG's. It does not replace the current
lossless pipeline: lossless stays the default, and smart lossy is something you turn on when
you want smaller files more than the original pixels.

## Why it is optional

The current pipeline (`compress.rs`) stores either a pixel-identical rewrite or the upload
itself, so nothing is ever lost. A lossy pass throws away the original for good: the bucket
keeps only the result. For a hand-kept collection that is a trade the user should choose for
each upload, never a default.

## What it would do

| format | smart lossy | typical saving |
|---|---|---|
| PNG | reduce to ≤256 colours with dithering (palette quantization, like pngquant), then oxipng | 50–80% |
| JPEG | nothing at first: lowering the quality costs another generation of loss for a small gain | — |
| WebP | lossy WebP is already lossy; lossless WebP could go through the same quantization as PNG | later |
| GIF | already ≤256 colours, nothing to gain | — |

It works best on flat art, screenshots and icons. Photos and smooth gradients can show colour
banding, which is why the quality check below is required.

## Quality check (required)

The lossless check ("pixels identical") cannot apply. Instead:

1. Quantize and encode the candidate.
2. Decode it and score it against the original with a similarity metric (SSIM, or
   butteraugli/DSSIM if a crate is good enough).
3. Keep it only if the score passes a threshold **and** it is smaller than the lossless result.
   Otherwise fall back to the normal lossless path, so the worst case stays what it is today.
4. Log what happened (`activity::logged` note), e.g. `1.20 MB → 310 KB (−74%), lossy, SSIM 0.991`.

## How to choose it

- A **setting** in the Compression section of `components/settings.tsx` ("Smart lossy for
  PNG: off / on"), stored in `prefs.rs` next to `png_level` and `zopfli`. Default **off**.
- Possibly a per-batch toggle on the upload screen as well, so you can turn it on for one batch
  of screenshots without changing the default.
- Uploads made with it should be marked lossy somewhere (log note at least; maybe a column if
  it ever needs to show on the site).

## Library choice

- `imagequant` (libimagequant, the pngquant engine): best results, but **GPL-3** unless a
  commercial licence is bought. That matters if the app is ever shared.
- `color_quant` (NeuQuant, MIT): permissive, noticeably worse palettes.
- Check for a newer permissive quantizer (e.g. `quantette`) before picking.

## Things to keep in step

- `collection_posts.file_name` is the md5 of the *uploaded* bytes, so dedupe keeps working
  unchanged: the same upload, lossy or not, is one row.
- Thumbnails are already lossy; nothing changes there.
- Update `README.md` (compression table) and `CLAUDE.md` (image pipeline) when it lands.
