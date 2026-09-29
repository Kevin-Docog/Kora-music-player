# Kora native upgrade tracker

| Area | Status | Notes |
| --- | --- | --- |
| Paginated device audio scan | Complete | Reads every audio page instead of only the first 200 assets. |
| Native artwork previews | Complete | Embedded `picture` tags become data URIs and flow through Library, Home, queue, and now playing. |
| Embedded and sidecar lyrics | Complete | Reads embedded lyrics and local `.lrc` siblings, with timestamp parsing and active-line highlighting. |
| Metadata editing | Complete | Local title, artist, album, and lyrics overrides are stored without mutating source files. |
| Shuffle, repeat, queue sync | Complete | Queue replacement follows rescans; next-track selection is covered by pure helpers. |
| Native permissions and background audio | Complete | Audio granular permission and iOS background audio configuration are wired. |
| Type, lint, tests, preview | Complete | TypeScript, lint, 26 passing tests, and mobile Library/Artists/Albums screenshots are clean. |
| Artist browsing | Complete | Added searchable artist groups with artwork, counts, and playable artist detail lists. |
| Album browsing | Complete | Added searchable album groups with artwork, artist labels, and playable album detail lists. |
| Device-only library | Complete | Removed bundled demo tracks and preview audio; empty states now appear until native device music is scanned. |
| Launch rescan preference | Complete | Added a persisted Settings toggle; existing scanned device tracks restore immediately and refresh on launch when enabled. |
| Scan completion crash hardening | Complete | Capped inline artwork, sanitized persistence, preferred provider artwork, and isolated unreadable files so completed scans do not terminate the app. |
| Incremental scan results | Complete | Each successfully scanned track is published to Library immediately while the remaining device files continue processing. |
| Cancel scan | Complete | Library shows a Cancel button during scanning; cancellation preserves discovered tracks and avoids replacing the queue with an incomplete result. |
| Favorites and track handoff | Complete | Removed seeded liked songs, migrated the legacy two-track favorite state, and explicitly paused/released the previous player before starting another track. |
| Playlist and Home refinements | Complete | Removed Liked songs from Playlists, added Song A–Z sorting in Library, and made Continue listening reflect the current track and replay it when tapped. |
| Playlist naming | Complete | Playlist creation now preserves the typed name through a normalized builder, uses collision-resistant IDs, and has regression coverage. |
| Reopen playback and library hydration | Complete | Persists the last selected track for mini-player restoration and merges automatic scan results into the saved library so existing songs remain visible throughout rescans. |
| Cached scan skipping | Complete | Matches MediaLibrary asset IDs to saved tracks, reuses cached metadata for existing songs, and reads metadata only for new device files. |
| Functional Settings and branding cleanup | Complete | Wired volume normalization, smooth fade transitions, artwork visibility, lyric matching, and playback listening profiles; removed the Alex profile card and Alex Home greeting. |
| Persistence audit | Complete | Verified playlists, metadata edits, favorites, scanned library, launch-rescan, artwork/lyrics preferences, last track, audio settings, background audio, and repeat mode survive app restart; fixed Settings/audio startup races. |
| Resume and seek playback | Complete | Saves playback position, resumes the saved song from that position after reopening, and adds swipe/tap seeking to the full playback progress bar. |
