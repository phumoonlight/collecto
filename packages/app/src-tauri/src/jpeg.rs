//! Lossless JPEG optimization — what `jpegtran -optimize -progressive` does, through mozjpeg.
//!
//! The DCT coefficients are read and written back untouched; only the entropy coding is
//! redone (optimized Huffman tables, progressive scans, mozjpeg's scan search). No pixel is
//! decoded or re-quantized, so the picture is bit-for-bit the same one.
//!
//! libjpeg reports a fatal error by calling `error_exit`, which by default calls `exit()`.
//! Here it panics instead, and the panic unwinds out through the C frames (mozjpeg-sys'
//! `unwinding` feature) to the `catch_unwind` below, which turns it into an `Err`. Warnings —
//! corrupt data libjpeg would otherwise skip over — are treated as errors too: a file that
//! is not entirely sound is stored as uploaded rather than rewritten.

use std::ffi::CStr;
use std::mem;
use std::os::raw::{c_int, c_ulong, c_void};
use std::panic::{self, AssertUnwindSafe};
use std::ptr;

use mozjpeg_sys::*;

extern "C" {
    fn free(ptr: *mut c_void);
}

const APP1: c_int = 0xE1;
const APP2: c_int = 0xE2;

struct JpegFailure(String);

unsafe extern "C-unwind" fn error_exit(cinfo: &mut jpeg_common_struct) {
    let mut buffer = [0u8; 80];
    if let Some(format) = (*cinfo.err).format_message {
        format(cinfo, &buffer);
    }
    // `format_message` writes through what the binding calls a shared reference.
    buffer = ptr::read_volatile(&buffer);
    let text = CStr::from_bytes_until_nul(&buffer)
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "libjpeg error".into());
    panic::resume_unwind(Box::new(JpegFailure(text)));
}

unsafe extern "C-unwind" fn emit_message(cinfo: &mut jpeg_common_struct, level: c_int) {
    // -1 is a warning about the data (corrupt, truncated); trace levels are ≥ 0.
    if level < 0 {
        error_exit(cinfo);
    }
}

struct Decompress(jpeg_decompress_struct);
struct Compress(jpeg_compress_struct);

impl Drop for Decompress {
    fn drop(&mut self) {
        unsafe { jpeg_destroy_decompress(&mut self.0) }
    }
}

impl Drop for Compress {
    fn drop(&mut self) {
        unsafe { jpeg_destroy_compress(&mut self.0) }
    }
}

/// Frees libjpeg's output buffer whichever way the transcode leaves.
struct Output {
    buffer: *mut u8,
    size: c_ulong,
}

impl Drop for Output {
    fn drop(&mut self) {
        if !self.buffer.is_null() {
            unsafe { free(self.buffer.cast()) }
        }
    }
}

unsafe fn transcode(input: &[u8], keep_exif: bool) -> Vec<u8> {
    let mut src_err: Box<jpeg_error_mgr> = Box::new(mem::zeroed());
    let mut dst_err: Box<jpeg_error_mgr> = Box::new(mem::zeroed());
    jpeg_std_error(&mut src_err);
    jpeg_std_error(&mut dst_err);
    for err in [&mut src_err, &mut dst_err] {
        err.error_exit = Some(error_exit);
        err.emit_message = Some(emit_message);
    }

    let mut src = Box::new(Decompress(mem::zeroed()));
    src.0.common.err = &mut *src_err;
    jpeg_create_decompress(&mut src.0);
    jpeg_mem_src(&mut src.0, input.as_ptr(), input.len() as c_ulong);
    // The two markers that change how the picture is drawn: EXIF (orientation) and ICC
    // (colour). Everything else — comments, XMP, thumbnails, maker notes — is dropped.
    jpeg_save_markers(&mut src.0, APP1, 0xFFFF);
    jpeg_save_markers(&mut src.0, APP2, 0xFFFF);
    jpeg_read_header(&mut src.0, 1);
    let coefficients = jpeg_read_coefficients(&mut src.0);

    let mut dst = Box::new(Compress(mem::zeroed()));
    dst.0.common.err = &mut *dst_err;
    jpeg_create_compress(&mut dst.0);
    jpeg_copy_critical_parameters(&src.0, &mut dst.0);
    dst.0.optimize_coding = 1;
    jpeg_simple_progression(&mut dst.0);

    let mut output = Output { buffer: ptr::null_mut(), size: 0 };
    jpeg_mem_dest(&mut dst.0, &mut output.buffer, &mut output.size);
    jpeg_write_coefficients(&mut dst.0, coefficients);

    let mut marker = src.0.marker_list;
    while !marker.is_null() {
        let m = &*marker;
        let data = std::slice::from_raw_parts(m.data, m.data_length as usize);
        let keep = (m.marker as c_int == APP1 && keep_exif && data.starts_with(b"Exif\0"))
            || (m.marker as c_int == APP2 && data.starts_with(b"ICC_PROFILE\0"));
        if keep {
            jpeg_write_marker(&mut dst.0, m.marker as c_int, m.data, m.data_length);
        }
        marker = m.next;
    }

    jpeg_finish_compress(&mut dst.0);
    jpeg_finish_decompress(&mut src.0);
    let bytes = std::slice::from_raw_parts(output.buffer, output.size as usize).to_vec();

    // Destroyed before the error managers they point at.
    drop(dst);
    drop(src);
    drop(output);
    bytes
}

unsafe fn compress_rgb(pixels: &[u8], width: u32, height: u32, quality: u8) -> Vec<u8> {
    let mut err: Box<jpeg_error_mgr> = Box::new(mem::zeroed());
    jpeg_std_error(&mut err);
    err.error_exit = Some(error_exit);
    err.emit_message = Some(emit_message);

    let mut dst = Box::new(Compress(mem::zeroed()));
    dst.0.common.err = &mut *err;
    jpeg_create_compress(&mut dst.0);
    dst.0.image_width = width;
    dst.0.image_height = height;
    dst.0.input_components = 3;
    dst.0.in_color_space = J_COLOR_SPACE::JCS_RGB;
    // mozjpeg's default profile is its max-compression one: trellis quantization, optimized
    // Huffman tables and a scan search. Progressive is asked for explicitly all the same.
    jpeg_set_defaults(&mut dst.0);
    jpeg_set_quality(&mut dst.0, quality as c_int, 1);
    jpeg_simple_progression(&mut dst.0);

    let mut output = Output { buffer: ptr::null_mut(), size: 0 };
    jpeg_mem_dest(&mut dst.0, &mut output.buffer, &mut output.size);
    jpeg_start_compress(&mut dst.0, 1);
    let stride = width as usize * 3;
    while dst.0.next_scanline < height {
        let row = pixels[dst.0.next_scanline as usize * stride..].as_ptr();
        jpeg_write_scanlines(&mut dst.0, &row, 1);
    }
    jpeg_finish_compress(&mut dst.0);
    let bytes = std::slice::from_raw_parts(output.buffer, output.size as usize).to_vec();

    // Destroyed before the error manager it points at.
    drop(dst);
    drop(output);
    bytes
}

fn caught(result: std::thread::Result<Vec<u8>>) -> Result<Vec<u8>, String> {
    result.map_err(|payload| match payload.downcast::<JpegFailure>() {
        Ok(failure) => failure.0,
        Err(_) => "the JPEG encoder failed".into(),
    })
}

/// The same picture with its entropy coding redone. `keep_exif` keeps the APP1 EXIF block —
/// worth its bytes only when it carries an orientation the browser has to apply.
pub fn optimize(input: &[u8], keep_exif: bool) -> Result<Vec<u8>, String> {
    // `resume_unwind` skips the panic hook, so a libjpeg error is not printed as a crash.
    caught(panic::catch_unwind(AssertUnwindSafe(|| unsafe { transcode(input, keep_exif) })))
}

/// A lossy encode through mozjpeg — the thumbnails. Its trellis quantization makes a file
/// roughly a fifth to a third smaller than a plain libjpeg-style encoder at the same quality.
pub fn encode_rgb(pixels: &[u8], width: u32, height: u32, quality: u8) -> Result<Vec<u8>, String> {
    if width == 0 || height == 0 || pixels.len() != width as usize * height as usize * 3 {
        return Err("bad RGB buffer".into());
    }
    caught(panic::catch_unwind(AssertUnwindSafe(|| unsafe { compress_rgb(pixels, width, height, quality) })))
}

#[cfg(test)]
mod tests {
    use super::optimize;

    /// libjpeg's fatal errors and its warnings both come back as an `Err` — the panic unwinds
    /// out of the C frames rather than taking the process with it.
    #[test]
    fn bad_input_is_an_error_not_a_crash() {
        assert!(optimize(b"definitely not a jpeg", false).is_err());

        let mut jpeg = Vec::new();
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg, 90)
            .encode_image(&image::RgbImage::from_pixel(64, 64, image::Rgb([200, 100, 50])))
            .unwrap();
        assert!(optimize(&jpeg, false).is_ok());
        jpeg.truncate(jpeg.len() - 40);
        assert!(optimize(&jpeg, false).is_err());
    }
}
