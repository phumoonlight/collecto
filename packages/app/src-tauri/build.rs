//! Nothing about the board is compiled in: the app is built without any environment, and the
//! installer carries no credential. Which database and bucket a copy writes to is set on each
//! machine from a setup code (`src/setup.rs`, made by `npm run app:code`).

fn main() {
    tauri_build::build()
}
