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

/// The rule a stored `ref_id` follows, spelled again as the check constraint in
/// `db/migrations/0003_ref_id_underscore.sql`: runs of a–z/0–9 joined by single `_` or `-`, at
/// most 64, and never a cuid2's shape — so a URL segment can't mean two collections.
fn valid_ref_id(ref_id: &str) -> bool {
    ref_id.len() <= REF_ID_MAX
        && ref_id
            .split(['_', '-'])
            .all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()))
        && !looks_like_id(ref_id)
}

/// A collection's web address segment as typed in the edit form — `/collections/<ref_id>` —
/// or `None` for no address of its own (the cuid2 id is used). Capitals are lowered and spaces
/// become `_`; anything else outside the rule is refused rather than silently changed, since
/// the person is looking at exactly what they typed.
pub fn read_ref_id(raw: &str) -> Result<Option<String>, String> {
    let ref_id = raw.trim().to_lowercase().split_whitespace().collect::<Vec<_>>().join("_");
    if ref_id.is_empty() {
        return Ok(None);
    }
    if ref_id.chars().count() > REF_ID_MAX {
        return Err(format!("That address is too long (max {REF_ID_MAX} characters)."));
    }
    if looks_like_id(&ref_id) {
        return Err("That address looks like a collection id — add a _ or change its length.".into());
    }
    if !valid_ref_id(&ref_id) {
        return Err("An address uses a–z and 0–9, with single _ or - between them.".into());
    }
    Ok(Some(ref_id))
}

/// Room left for `_xxxxx` when an address has to be made unique.
const SUFFIX_ROOM: usize = REF_ID_MAX - 6;

/// The address a new collection gets from its name: lowercased, spaces (and `_`) become a
/// single `_`, every other character — punctuation, accents, non-Latin script — is dropped.
/// `None` when nothing is left, and the collection is addressed by its id.
pub fn ref_id_from_name(name: &str) -> Option<String> {
    let mut slug = String::new();
    for ch in name.to_lowercase().chars() {
        if ch.is_ascii_lowercase() || ch.is_ascii_digit() {
            slug.push(ch);
        } else if (ch.is_whitespace() || ch == '_') && !slug.is_empty() && !slug.ends_with('_') {
            slug.push('_');
        }
    }
    // Shortened so a suffix still fits; ASCII only, so a byte index is a character index.
    slug.truncate(SUFFIX_ROOM);
    let slug = slug.trim_end_matches('_').to_string();
    (!slug.is_empty()).then_some(slug)
}

/// `base` made unique with `_` and five random a–z/0–9 characters.
pub fn ref_id_with_suffix(base: &str) -> String {
    let random = cuid2::create_id();
    // A cuid2 is lowercase base36; its tail is the random part.
    format!("{base}_{}", &random[random.len() - 5..])
}

/// Whether `base` can be stored as it is, or has to take a suffix even before any collision —
/// a name like `abcdefghijklmnopqrstuvwx` makes a slug with a cuid2's shape.
pub fn needs_suffix(base: &str) -> bool {
    !valid_ref_id(base)
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
    fn ref_ids_from_names() {
        assert_eq!(ref_id_from_name("Ukiyo-e Studies").as_deref(), Some("ukiyoe_studies"));
        assert_eq!(ref_id_from_name("  My   Café! 2024 ").as_deref(), Some("my_caf_2024"));
        assert_eq!(ref_id_from_name("a - b").as_deref(), Some("a_b"));
        assert_eq!(ref_id_from_name("snake_case name").as_deref(), Some("snake_case_name"));
        assert_eq!(ref_id_from_name("ภาพวาด"), None);
        assert_eq!(ref_id_from_name("🎴 !!"), None);
        let long = ref_id_from_name(&"word ".repeat(30)).unwrap();
        assert!(long.len() <= SUFFIX_ROOM && !long.ends_with('_'));
        assert!(ref_id_with_suffix(&long).len() <= REF_ID_MAX);
        assert!(needs_suffix("abcdefghijklmnopqrstuvwx"));
        assert!(!needs_suffix("ukiyoe_studies"));
    }

    #[test]
    fn suffixes_are_five_base36_characters() {
        let made = ref_id_with_suffix("ukiyoe");
        let (base, tail) = made.rsplit_once('_').unwrap();
        assert_eq!(base, "ukiyoe");
        assert!(tail.len() == 5 && tail.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()));
        assert!(read_ref_id(&made).unwrap().is_some());
    }

    #[test]
    fn ref_ids_are_url_segments() {
        assert_eq!(read_ref_id("  ").unwrap(), None);
        assert_eq!(read_ref_id(" Ukiyo E  Studies ").unwrap().as_deref(), Some("ukiyo_e_studies"));
        assert_eq!(read_ref_id("ukiyo-e_studies").unwrap().as_deref(), Some("ukiyo-e_studies"));
        assert_eq!(read_ref_id("2024").unwrap().as_deref(), Some("2024"));
        assert!(read_ref_id("a--b").is_err());
        assert!(read_ref_id("a_-b").is_err());
        assert!(read_ref_id("-a").is_err());
        assert!(read_ref_id("a_").is_err());
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
