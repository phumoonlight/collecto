; Included by Tauri's NSIS template before its pages are declared, so MUI2 sees this when the
; finish page is inserted: the "Create desktop shortcut" box starts unticked. (The template
; reuses MUI's "show readme" checkbox for the shortcut.)
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
