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
| Review fixes | Complete | Added explicit `expo-file-system`; background scan now notifies only when new files appear and is registered at startup; saved background-audio setting no longer overridden at launch; removed mic permission, `expo-video` plugin/dependency, unused template components, and `manus` deep-link scheme (now `kora`); artwork hash covers the whole image; finished-queue state no longer sticks on "playing". |
| Restart persistence check | Complete | Favorites are saved only after loading (could be overwritten by the empty list); background-scan switch is re-applied at every launch instead of only when Settings is opened. |
| Library sort/filter persistence | Complete | Selected sort order and filter chip are saved and restored on relaunch (search text intentionally resets). |
| Manual Next in repeat-one | Complete | Next now uses a dedicated helper (`getManualNextIndex`) that always advances to a different song when the queue has more than one; auto-advance still repeats the song in repeat-one. Covered by tests. |
| Shuffle deck + ordered queue | Complete | Shuffle now plays every song once before repeating (new cycle avoids the song just played). Tapping a song in Library queues the full library in the chosen sort order; tapping in an album/artist list queues that list first, then the rest. The order survives rescans. |
| Playlist queue + saved queue order | Complete | "Play playlist" and tapping a playlist song queue the playlist in its own order (rest of library follows); the chosen queue order is saved and restored after relaunch. |
| Home date and greeting | Complete | Date and greeting were hardcoded ("TUESDAY, SEPTEMBER 28" / "Good evening"); they now follow the device clock (morning / afternoon / evening / night) and refresh every minute. |
| Real daily mix | Complete | Home "Play mix" builds a 30-song mix (about 60% favorites, rest from the library, shuffled), stable for the day and refreshable with Remix; plays in mix order via repeat-all; shows real song count, artists and favorites count. Covered by tests in `tests/mix-utils.test.ts`. |
| Less "zoomed" layout | Complete | Home cards, greeting, hero artwork and section titles made smaller; screen titles 31 -> 27 on Library, Playlists, Settings, Albums and Artists. |
