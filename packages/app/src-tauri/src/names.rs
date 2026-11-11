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
