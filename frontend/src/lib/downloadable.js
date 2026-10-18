export const isDownloadable = (item) => {
  if (!item || item.locked) return false
  if (item.sourceType === 'pinterest') {
    return (item.downloads?.length ?? 0) > 0 || Boolean(item.directUrl)
  }
  return (
    (item.downloads?.length ?? 0) > 0 ||
    (item.links?.length ?? 0) > 0 ||
    Boolean(item.downloadUrl || item.directUrl) ||
    item.sourceType === 'modthesims' ||
    item.sourceType === 'tsr' ||
    item.sourceType === 'itch' ||
    item.sourceType === 'itchio' ||
    item.sourceType === 'github' ||
    item.sourceType === 'mega'
  )
}
