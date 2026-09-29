export type BrowseTrack = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  artworkUri?: string;
  initials: string;
  tone: string;
};

export type ArtistGroup<T extends BrowseTrack = BrowseTrack> = {
  name: string;
  tracks: T[];
  artworkUri?: string;
  initials: string;
  tone: string;
};

export type AlbumGroup<T extends BrowseTrack = BrowseTrack> = {
  name: string;
  artist: string;
  tracks: T[];
  artworkUri?: string;
  initials: string;
  tone: string;
};

function initialsFor(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "♪";
}

export function groupByArtist<T extends BrowseTrack>(tracks: T[]): ArtistGroup<T>[] {
  const groups = new Map<string, T[]>();
  tracks.forEach((track) => groups.set(track.artist, [...(groups.get(track.artist) ?? []), track]));
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, artistTracks]) => ({
    name,
    tracks: artistTracks,
    artworkUri: artistTracks.find((track) => track.artworkUri)?.artworkUri,
    initials: initialsFor(name),
    tone: artistTracks[0]?.tone ?? "#35432c",
  }));
}

export function groupByAlbum<T extends BrowseTrack>(tracks: T[]): AlbumGroup<T>[] {
  const groups = new Map<string, T[]>();
  tracks.forEach((track) => {
    const key = `${track.album}\u0000${track.artist}`;
    groups.set(key, [...(groups.get(key) ?? []), track]);
  });
  return [...groups.values()].sort((a, b) => `${a[0]?.album ?? ""}${a[0]?.artist ?? ""}`.localeCompare(`${b[0]?.album ?? ""}${b[0]?.artist ?? ""}`)).map((albumTracks) => ({
    name: albumTracks[0]?.album ?? "Unknown album",
    artist: albumTracks[0]?.artist ?? "Unknown artist",
    tracks: albumTracks,
    artworkUri: albumTracks.find((track) => track.artworkUri)?.artworkUri,
    initials: initialsFor(albumTracks[0]?.album ?? "Album"),
    tone: albumTracks[0]?.tone ?? "#35432c",
  }));
}
