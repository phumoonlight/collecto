//! What counts as a collection's name and mark — the same rules as booru's
//! `readCollectionName` / `readCollectionMark`, enforced on the side that writes.

use unicode_segmentation::UnicodeSegmentation;

pub const NAME_MAX: usize = 64;
pub const MARK_MAX: usize = 12;

/// Control characters become spaces, runs of whitespace collapse to one, ends are trimmed.
fn clean(raw: &str) -> String {
    let replaced: String = raw.chars().map(|ch| if ch.is_control() { ' ' } else { ch }).collect();
    replaced.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Prose, not a token: a person names a shelf `Ukiyo-e studies`. Case is kept as typed and
/// ignored for uniqueness by the `lower(name)` index.
pub fn read_name(raw: &str) -> Result<String, String> {
    let name = clean(raw);
    if name.is_empty() {
        return Err("Type a name for the collection.".into());
    }
    if name.chars().count() > NAME_MAX {
        return Err(format!("That name is too long (max {NAME_MAX} characters)."));
    }
    Ok(name)
}

/// The prefix drawn in front of a name — an emoji, `[WIP]`, a year. Counted in graphemes,
/// since 🧑‍🎨 is five code points. Empty clears it.
pub fn read_mark(raw: &str) -> Result<Option<String>, String> {
    let mark = clean(raw);
    if mark.is_empty() {
        return Ok(None);
    }
    if mark.graphemes(true).count() > MARK_MAX {
        return Err(format!("A mark is {MARK_MAX} characters at most."));
    }
    Ok(Some(mark))
}

pub const REF_ID_MAX: usize = 64;

/// A cuid2 as the database checks it: `^[a-z][a-z0-9]{23}$`.
pub fn looks_like_id(value: &str) -> bool {
    value.len() == 24
        && value.starts_with(|c: char| c.is_ascii_lowercase())
        && value.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
}

/// A collection's web address segment — `/collections/<ref_id>` — or `None` for no address
/// of its own (the cuid2 id is used). Lowercase letters, digits and single hyphens; typed
/// capitals are lowered and spaces become hyphens. It may not have a cuid2's shape, so a URL
/// segment can never mean two different collections. The same rule is a check constraint
/// (`db/migrations/0002_collection_cuid_ref.sql`).
pub fn read_ref_id(raw: &str) -> Result<Option<String>, String> {
    let ref_id = raw.trim().to_lowercase().split_whitespace().collect::<Vec<_>>().join("-");
    if ref_id.is_empty() {
        return Ok(None);
    }
    if ref_id.chars().count() > REF_ID_MAX {
        return Err(format!("That address is too long (max {REF_ID_MAX} characters)."));
    }
    let well_formed = ref_id
        .split('-')
        .all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()));
    if !well_formed {
        return Err("An address uses a–z, 0–9 and single hyphens between them.".into());
    }
    if looks_like_id(&ref_id) {
        return Err("That address looks like a collection id — add a hyphen or change its length.".into());
    }
    Ok(Some(ref_id))
}

pub const SOURCE_MAX: usize = 2000;

/// An image's source: empty for none, otherwise an http(s) address. Anything else is refused
/// — the website draws it as a link anybody can click, and a `javascript:` URL there would run
/// in every visitor's browser.
pub fn read_source(raw: &str) -> Result<String, String> {
    let source = raw.trim();
    if source.is_empty() {
        return Ok(String::new());
    }
    if source.chars().count() > SOURCE_MAX {
        return Err(format!("That source is too long (max {SOURCE_MAX} characters)."));
    }
    match url::Url::parse(source) {
        Ok(url) if matches!(url.scheme(), "http" | "https") && url.host_str().is_some() => {
            Ok(source.to_string())
        }
        _ => Err("A source has to be a web address (http:// or https://).".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ref_ids_are_url_segments() {
        assert_eq!(read_ref_id("  ").unwrap(), None);
        assert_eq!(read_ref_id(" Ukiyo E  Studies ").unwrap().as_deref(), Some("ukiyo-e-studies"));
        assert_eq!(read_ref_id("2024").unwrap().as_deref(), Some("2024"));
        assert!(read_ref_id("a--b").is_err());
        assert!(read_ref_id("-a").is_err());
        assert!(read_ref_id("café").is_err());
        assert!(read_ref_id("../x").is_err());
        assert!(read_ref_id(&"a".repeat(65)).is_err());
        // The shape of a cuid2 is the id's, never an address.
        assert!(read_ref_id(&cuid2::create_id()).is_err());
        assert!(read_ref_id("abcdefghijklmnopqrstuvwx").is_err());
    }

    #[test]
    fn sources_are_web_addresses() {
        assert_eq!(read_source("  ").unwrap(), "");
        assert_eq!(read_source(" https://x.com/a/1 ").unwrap(), "https://x.com/a/1");
        assert!(read_source("javascript:alert(1)").is_err());
        assert!(read_source("file:///C:/secret").is_err());
        assert!(read_source("not a url").is_err());
    }

    #[test]
    fn names_are_cleaned() {
        assert_eq!(read_name("  Ukiyo-e \t studies ").unwrap(), "Ukiyo-e studies");
        assert!(read_name("   ").is_err());
        assert!(read_name(&"x".repeat(65)).is_err());
    }

    #[test]
    fn marks_count_graphemes() {
        assert_eq!(read_mark("").unwrap(), None);
        assert_eq!(read_mark("🧑‍🎨").unwrap().as_deref(), Some("🧑‍🎨"));
        assert!(read_mark(&"🎴".repeat(13)).is_err());
    }
}
