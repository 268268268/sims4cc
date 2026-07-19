// A Discover item the app can install. Patreon items carry explicit file lists;
// ModTheSims files are resolved lazily at download click (main process fetches
// the mod page), so MTS cards are downloadable even with an empty list. Tumblr
// posts carry candidate outbound links (`links`) resolved lazily the same way.
export const isDownloadable = (item) =>
  (item?.downloads?.length ?? 0) > 0 ||
  item?.sourceType === 'modthesims' ||
  (item?.sourceType === 'tumblr' && (item?.links?.length ?? 0) > 0)
