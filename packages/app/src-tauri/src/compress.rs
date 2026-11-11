//! What happens to an image's bytes on the way to the bucket.
//!
//! **Nothing is converted.** A JPEG is stored as a JPEG, a PNG as a PNG, and so on — the
//! extension the website draws is the one that was uploaded. What is done instead is
//! *lossless* compression, per format:
//!
//! | format | what is tried |
//! |---|---|
//! | JPEG | the coefficients rewritten with optimized Huffman tables and progressive scans (`jpeg.rs`) |
//! | PNG  | oxipng: filter search, re-deflate, lossless bit-depth/palette reductions |
//! | WebP | a *lossless* WebP re-encoded at libwebp's maximum effort; a lossy one is left alone |
//! | GIF  | left alone — there is no lossless GIF optimizer worth linking |
//!
//! **Every rewrite is checked.** The result is decoded and compared with the original pixel
//! for pixel, and it is kept only when the pixels match *and* the file is smaller. Anything
//! else — an encoder error, a mismatch, a file that came out bigger — stores the upload
//! byte-for-byte. The worst case is the file you gave it.
//!
//! The thumbnail is the one lossy step, since a thumbnail is a smaller picture by
//! definition: 360px tall (width capped at 720), in the original's format.

use std::io::Cursor;

use base64::Engine;
use fast_image_resize as fr;
use image::metadata::Orientation;
use image::{DynamicImage, ImageDecoder, ImageFormat, ImageReader};

use crate::jpeg;

pub const MAX_FILE_SIZE: u64 = 50 * 1024 * 1024;
pub const MAX_PIXELS: u64 = 100_000_000;
pub const THUMB_HEIGHT: u32 = 360;
pub const THUMB_MAX_WIDTH: u32 = 720;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Jpeg,
    Png,
    Gif,
    WebP,
}

impl Kind {
    /// From the bytes, never the file name: a `.png` that is a JPEG is a JPEG.
    pub fn detect(bytes: &[u8]) -> Option<Kind> {
        match image::guess_format(bytes).ok()? {
            ImageFormat::Jpeg => Some(Kind::Jpeg),
            ImageFormat::Png => Some(Kind::Png),
            ImageFormat::Gif => Some(Kind::Gif),
            ImageFormat::WebP => Some(Kind::WebP),
            _ => None,
        }
    }

    pub fn ext(self) -> &'static str {
        match self {
            Kind::Jpeg => "jpg",
            Kind::Png => "png",
            Kind::Gif => "gif",
            Kind::WebP => "webp",
        }
    }

    pub fn content_type(self) -> &'static str {
        content_type(self.ext())
    }

    fn format(self) -> ImageFormat {
        match self {
            Kind::Jpeg => ImageFormat::Jpeg,
            Kind::Png => ImageFormat::Png,
            Kind::Gif => ImageFormat::Gif,
            Kind::WebP => ImageFormat::WebP,
        }
    }
}

pub fn content_type(ext: &str) -> &'static str {
    match ext.to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    }
}

pub const UNSUPPORTED: &str = "Unsupported format (jpg, png, gif or webp only)";

/// What an image is, from its header alone — nothing is decoded.
#[derive(Debug, Clone, Copy)]
pub struct Header {
    pub kind: Kind,
    /// As displayed: an EXIF quarter turn swaps the stored sides.
    pub width: u32,
    pub height: u32,
    pub orientation: Orientation,
}

fn quarter_turned(orientation: Orientation) -> bool {
    matches!(
        orientation,
        Orientation::Rotate90 | Orientation::Rotate270 | Orientation::Rotate90FlipH | Orientation::Rotate270FlipH
    )
}

fn reader(bytes: &[u8], kind: Kind) -> ImageReader<Cursor<&[u8]>> {
    let mut reader = ImageReader::with_format(Cursor::new(bytes), kind.format());
    // The ceilings are ours (`MAX_PIXELS`), checked from the header before any decode.
    reader.no_limits();
    reader
}

pub fn read_header(bytes: &[u8]) -> Result<Header, String> {
    let kind = Kind::detect(bytes).ok_or(UNSUPPORTED)?;
    let mut decoder = reader(bytes, kind).into_decoder().map_err(|_| "Not a readable image".to_string())?;
    let orientation = decoder.orientation().unwrap_or(Orientation::NoTransforms);
    let (w, h) = decoder.dimensions();
    if w == 0 || h == 0 {
        return Err("Not a readable image".into());
    }
    let (width, height) = if quarter_turned(orientation) { (h, w) } else { (w, h) };
    Ok(Header { kind, width, height, orientation })
}

/// The ceilings: 50MB, 100MP. A sane thing to refuse rather than anything forcing it — and
/// the pixel count is a memory bound, an RGBA decode of 100MP being ~400MB.
pub fn check_limits(size: u64, header: &Header) -> Result<(), String> {
    if size > MAX_FILE_SIZE {
        return Err(format!("Too large (max {}MB)", MAX_FILE_SIZE / 1024 / 1024));
    }
    if header.width as u64 * header.height as u64 > MAX_PIXELS {
        return Err(format!("Too many pixels (max {}MP)", MAX_PIXELS / 1_000_000));
    }
    Ok(())
}

/// The pixels as stored, with no orientation applied — what a lossless rewrite must match.
fn decode_raw(bytes: &[u8], kind: Kind) -> Result<DynamicImage, String> {
    let decoder = reader(bytes, kind).into_decoder().map_err(|e| e.to_string())?;
    DynamicImage::from_decoder(decoder).map_err(|e| e.to_string())
}

/// The picture as a browser draws it: first frame, EXIF orientation applied.
pub fn decode(bytes: &[u8]) -> Result<DynamicImage, String> {
    let kind = Kind::detect(bytes).ok_or(UNSUPPORTED)?;
    let mut decoder = reader(bytes, kind).into_decoder().map_err(|e| e.to_string())?;
    let orientation = decoder.orientation().unwrap_or(Orientation::NoTransforms);
    let mut image = DynamicImage::from_decoder(decoder).map_err(|e| e.to_string())?;
    image.apply_orientation(orientation);
    Ok(image)
}

fn same_pixels(a: &DynamicImage, b: &DynamicImage) -> bool {
    if a.width() != b.width() || a.height() != b.height() {
        return false;
    }
    if a.color() == b.color() {
        return a.as_bytes() == b.as_bytes();
    }
    // A rewrite may store the same pixels another way — RGBA with every alpha opaque as RGB,
    // a palette, 16 bits that were all multiples of 257 as 8. Widened, they must be equal.
    let deep = |image: &DynamicImage| image.color().bytes_per_pixel() / image.color().channel_count() > 1;
    if deep(a) || deep(b) {
        a.to_rgba16().as_raw() == b.to_rgba16().as_raw()
    } else {
        a.to_rgba8().as_raw() == b.to_rgba8().as_raw()
    }
}

fn verify(original: &[u8], candidate: &[u8], kind: Kind) -> Result<(), String> {
    let before = decode_raw(original, kind)?;
    let after = decode_raw(candidate, kind).map_err(|e| format!("the rewrite does not decode: {e}"))?;
    if same_pixels(&before, &after) {
        Ok(())
    } else {
        Err("the rewrite did not match the original pixels".into())
    }
}

/// How hard the lossless pass works — the settings screen's Compression rows.
#[derive(Debug, Clone, Copy)]
pub struct Effort {
    /// oxipng's preset, 0–6.
    pub png_level: u8,
    /// Zopfli instead of libdeflate for PNG: a few percent smaller, many times slower.
    pub zopfli: bool,
}

/// An animated PNG — oxipng does not optimize its frames, and only the first could be
/// verified, so it is stored as uploaded.
fn is_apng(bytes: &[u8]) -> bool {
    let mut at = 8;
    while at + 8 <= bytes.len() {
        let length = u32::from_be_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]]) as usize;
        match &bytes[at + 4..at + 8] {
            b"acTL" => return true,
            b"IDAT" => return false,
            _ => at += 12 + length,
        }
    }
    false
}

fn optimize_png(bytes: &[u8], header: &Header, effort: Effort) -> Result<Vec<u8>, String> {
    if is_apng(bytes) {
        return Err("an animated PNG is stored as uploaded".into());
    }
    let mut options = oxipng::Options::from_preset(effort.png_level.min(6));
    // Every chunk that does not change how the picture is drawn goes — text, timestamps,
    // editor data. An EXIF orientation does change it, so a turned PNG keeps everything.
    options.strip = if header.orientation == Orientation::NoTransforms {
        oxipng::StripChunks::Safe
    } else {
        oxipng::StripChunks::None
    };
    if effort.zopfli {
        // 15 iterations, the Zopfli default.
        options.deflater = oxipng::Deflater::Zopfli(oxipng::ZopfliOptions::default());
    }
    oxipng::optimize_from_memory(bytes, &options).map_err(|e| e.to_string())
}

/// `Some(true)` for a plain lossless WebP that can be re-encoded without losing anything,
/// `Some(false)` for one that cannot (lossy, animated, or carrying ICC/EXIF/XMP), `None` for
/// a file that is not WebP at all.
fn plain_lossless_webp(bytes: &[u8]) -> Option<bool> {
    if bytes.len() < 21 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return None;
    }
    match &bytes[12..16] {
        b"VP8L" => Some(true),
        b"VP8 " => Some(false),
        b"VP8X" => {
            let flags = bytes[20];
            // animation 0x02, ICC 0x20, EXIF 0x08, XMP 0x04 — any of them is kept by storing
            // the file as it is.
            if flags & (0x02 | 0x20 | 0x08 | 0x04) != 0 {
                return Some(false);
            }
            let mut at = 12;
            while at + 8 <= bytes.len() {
                let size = u32::from_le_bytes([bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]]) as usize;
                match &bytes[at..at + 4] {
                    b"VP8L" => return Some(true),
                    b"VP8 " => return Some(false),
                    _ => at += 8 + size + (size & 1),
                }
            }
            Some(false)
        }
        _ => Some(false),
    }
}

fn optimize_webp(bytes: &[u8]) -> Result<Vec<u8>, String> {
    match plain_lossless_webp(bytes) {
        Some(true) => {}
        _ => return Err("a lossy or animated WebP has no lossless rewrite".into()),
    }
    let decoded = webp::Decoder::new(bytes).decode().ok_or("libwebp could not decode it")?;
    let encoder = webp::Encoder::new(&decoded, decoded.layout(), decoded.width(), decoded.height());
    let mut config = webp::WebPConfig::new().map_err(|_| "libwebp config failed")?;
    config.lossless = 1;
    config.quality = 100.0; // in lossless mode: effort, not fidelity
    config.method = 6;
    config.exact = 1; // keep the colour under fully transparent pixels
    let out = encoder.encode_advanced(&config).map_err(|e| format!("libwebp: {e:?}"))?;
    Ok(out.to_vec())
}

pub struct Optimized {
    pub bytes: Vec<u8>,
    /// Whether `bytes` is a rewrite rather than the upload itself.
    pub rewritten: bool,
    /// One line for the log: what was tried and what was kept.
    pub note: String,
}

fn kb(size: usize) -> String {
    if size >= 1024 * 1024 {
        format!("{:.2} MB", size as f64 / 1024.0 / 1024.0)
    } else {
        format!("{:.1} KB", size as f64 / 1024.0)
    }
}

/// The stored image: the smallest verified lossless form of the upload, or the upload.
pub fn optimize(bytes: &[u8], header: &Header, effort: Effort) -> Optimized {
    let attempt = match header.kind {
        Kind::Jpeg => jpeg::optimize(bytes, header.orientation != Orientation::NoTransforms),
        Kind::Png => optimize_png(bytes, header, effort),
        Kind::WebP => optimize_webp(bytes),
        Kind::Gif => Err("GIF is stored as uploaded".into()),
    }
    .and_then(|candidate| verify(bytes, &candidate, header.kind).map(|_| candidate));

    let kept = |note: String| Optimized { bytes: bytes.to_vec(), rewritten: false, note };
    match attempt {
        Ok(candidate) if candidate.len() < bytes.len() => {
            let saved = 100.0 * (bytes.len() - candidate.len()) as f64 / bytes.len() as f64;
            let note = format!("{} → {} (−{saved:.1}%), lossless", kb(bytes.len()), kb(candidate.len()));
            Optimized { bytes: candidate, rewritten: true, note }
        }
        Ok(candidate) => kept(format!(
            "kept as uploaded ({}): the lossless rewrite was not smaller ({})",
            kb(bytes.len()),
            kb(candidate.len())
        )),
        Err(reason) => kept(format!("kept as uploaded ({}): {reason}", kb(bytes.len()))),
    }
}

/// RGB8 or RGBA8 — the two layouts every encoder and the resizer below agree on.
pub fn normalize(image: DynamicImage) -> DynamicImage {
    match image {
        DynamicImage::ImageRgb8(_) | DynamicImage::ImageRgba8(_) => image,
        other if other.color().has_alpha() => DynamicImage::ImageRgba8(other.to_rgba8()),
        other => DynamicImage::ImageRgb8(other.to_rgb8()),
    }
}

/// The largest size inside the box keeping the ratio, never enlarged.
pub fn fit_within(width: u32, height: u32, max_width: u32, max_height: u32) -> (u32, u32) {
    let scale = (max_width as f64 / width as f64).min(max_height as f64 / height as f64).min(1.0);
    (
        ((width as f64 * scale).round() as u32).max(1),
        ((height as f64 * scale).round() as u32).max(1),
    )
}

/// Lanczos3, alpha premultiplied while it filters. `crop` is where the box is cut from when
/// the shapes differ — `(0.5, 0.5)` the centre, `(0.5, 0.0)` the top — and `None` stretches,
/// which callers only use with a box of the image's own ratio.
pub fn resize(image: &DynamicImage, width: u32, height: u32, crop: Option<(f64, f64)>) -> Result<DynamicImage, String> {
    let source = normalize(image.clone());
    if (source.width(), source.height()) == (width, height) {
        return Ok(source);
    }
    let mut target = DynamicImage::new(width, height, source.color());
    let mut options = fr::ResizeOptions::new().resize_alg(fr::ResizeAlg::Convolution(fr::FilterType::Lanczos3));
    if crop.is_some() {
        options = options.fit_into_destination(crop);
    }
    fr::Resizer::new().resize(&source, &mut target, &options).map_err(|e| e.to_string())?;
    Ok(target)
}

pub fn encode_webp(image: &DynamicImage, quality: f32) -> Result<Vec<u8>, String> {
    let image = normalize(image.clone());
    let encoder = webp::Encoder::from_image(&image).map_err(|e| e.to_string())?;
    Ok(encoder.encode(quality).to_vec())
}

/// A thumbnail in the original's own format.
pub fn thumbnail(bytes: &[u8], kind: Kind) -> Result<Vec<u8>, String> {
    let image = normalize(decode(bytes).map_err(|e| format!("Could not decode the image: {e}"))?);
    let (width, height) = fit_within(image.width(), image.height(), THUMB_MAX_WIDTH, THUMB_HEIGHT);
    let small = resize(&image, width, height, None)?;

    let mut out = Vec::new();
    match kind {
        Kind::Jpeg => {
            let rgb = small.to_rgb8();
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 85)
                .encode_image(&rgb)
                .map_err(|e| e.to_string())?;
        }
        Kind::Png => {
            small.write_to(&mut Cursor::new(&mut out), ImageFormat::Png).map_err(|e| e.to_string())?;
            let mut options = oxipng::Options::from_preset(2);
            options.strip = oxipng::StripChunks::All;
            if let Ok(smaller) = oxipng::optimize_from_memory(&out, &options) {
                out = smaller;
            }
        }
        Kind::WebP => out = encode_webp(&small, 82.0)?,
        // The first frame: an animated grid of thumbnails is a lot of bandwidth for a list.
        Kind::Gif => small.write_to(&mut Cursor::new(&mut out), ImageFormat::Gif).map_err(|e| e.to_string())?,
    }
    Ok(out)
}

/// A small `data:` URL for the staging batch — never the file itself in the window.
pub fn preview(bytes: &[u8]) -> Option<String> {
    let image = decode(bytes).ok()?;
    let (width, height) = fit_within(image.width(), image.height(), 320, 320);
    let small = resize(&image, width, height, None).ok()?;
    let webp = encode_webp(&small, 70.0).ok()?;
    Some(format!("data:image/webp;base64,{}", base64::engine::general_purpose::STANDARD.encode(webp)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageEncoder, Rgb, RgbImage, Rgba, RgbaImage};

    /// A picture with gradients and noise, so the encoders have something to work on.
    fn sample(width: u32, height: u32) -> RgbImage {
        let mut seed: u32 = 7;
        RgbImage::from_fn(width, height, |x, y| {
            seed = seed.wrapping_mul(1_103_515_245).wrapping_add(12_345);
            let noise = ((seed >> 16) & 0x1f) as u8;
            Rgb([(x * 255 / width) as u8 ^ noise, (y * 255 / height) as u8, ((x + y) % 256) as u8])
        })
    }

    fn effort() -> Effort {
        Effort { png_level: 2, zopfli: false }
    }

    #[test]
    fn jpeg_is_rewritten_losslessly() {
        let mut original = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut original, 92)
            .encode_image(&sample(640, 480))
            .unwrap();
        let header = read_header(&original).unwrap();
        let result = optimize(&original, &header, effort());
        assert!(result.rewritten, "{}", result.note);
        assert!(result.bytes.len() < original.len());
        verify(&original, &result.bytes, Kind::Jpeg).unwrap();
        assert_eq!(Kind::detect(&result.bytes), Some(Kind::Jpeg));
    }

    #[test]
    fn broken_jpeg_is_kept_as_uploaded() {
        let mut original = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut original, 92)
            .encode_image(&sample(320, 240))
            .unwrap();
        original.truncate(original.len() / 2);
        let header = read_header(&original).unwrap();
        let result = optimize(&original, &header, effort());
        assert!(!result.rewritten);
        assert_eq!(result.bytes, original);
    }

    #[test]
    fn png_is_rewritten_losslessly() {
        // RGBA with every pixel opaque, stored at the fastest deflate: plenty to win back.
        let rgba = RgbaImage::from_fn(300, 200, |x, y| Rgba([(x % 256) as u8, (y % 256) as u8, 40, 255]));
        let mut original = Vec::new();
        image::codecs::png::PngEncoder::new_with_quality(
            &mut original,
            image::codecs::png::CompressionType::Fast,
            image::codecs::png::FilterType::NoFilter,
        )
        .write_image(rgba.as_raw(), 300, 200, image::ExtendedColorType::Rgba8)
        .unwrap();
        let header = read_header(&original).unwrap();
        let result = optimize(&original, &header, effort());
        assert!(result.rewritten, "{}", result.note);
        verify(&original, &result.bytes, Kind::Png).unwrap();
    }

    #[test]
    fn lossless_webp_is_recompressed_and_lossy_left_alone() {
        let image = DynamicImage::ImageRgb8(sample(200, 150));
        let lossless = webp::Encoder::from_image(&image).unwrap().encode_simple(true, 0.0).unwrap().to_vec();
        assert_eq!(plain_lossless_webp(&lossless), Some(true));
        let header = read_header(&lossless).unwrap();
        let result = optimize(&lossless, &header, effort());
        verify(&lossless, &result.bytes, Kind::WebP).unwrap();

        let lossy = encode_webp(&image, 80.0).unwrap();
        assert_eq!(plain_lossless_webp(&lossy), Some(false));
        let header = read_header(&lossy).unwrap();
        assert!(!optimize(&lossy, &header, effort()).rewritten);
    }

    #[test]
    fn thumbnails_keep_the_format_and_the_bound() {
        let mut jpeg = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 90)
            .encode_image(&sample(2000, 1000))
            .unwrap();
        let thumb = thumbnail(&jpeg, Kind::Jpeg).unwrap();
        assert_eq!(Kind::detect(&thumb), Some(Kind::Jpeg));
        let header = read_header(&thumb).unwrap();
        assert_eq!((header.width, header.height), (720, 360));

        let mut gif = Vec::new();
        DynamicImage::ImageRgb8(sample(100, 50))
            .write_to(&mut Cursor::new(&mut gif), ImageFormat::Gif)
            .unwrap();
        let thumb = thumbnail(&gif, Kind::Gif).unwrap();
        assert_eq!(Kind::detect(&thumb), Some(Kind::Gif));
    }

    #[test]
    fn fit_never_enlarges() {
        assert_eq!(fit_within(100, 50, 768, 384), (100, 50));
        assert_eq!(fit_within(4000, 1000, 768, 384), (768, 192));
        assert_eq!(fit_within(1000, 4000, 768, 384), (96, 384));
    }
}
