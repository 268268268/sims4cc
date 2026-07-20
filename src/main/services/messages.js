// User-facing messages produced in the MAIN process (link resolver errors etc.).
// The renderer localizes its own UI; these strings travel through IPC as text,
// so they are localized here, from the same `language` setting ('auto'|'en'|'ru').

const TABLE = {
  en: {
    badUrl: 'That does not look like a URL.',
    httpOnly: 'Only http(s) links are supported.',
    localBlocked: 'Local/private addresses are not allowed.',
    tooManyHops: 'Too many redirects to follow.',
    pinNoLink: 'This pin has no outbound link (image only).',
    patreonNoId: 'Could not read the Patreon post id.',
    patreonLocked: 'This Patreon post is patron-only. Connect your Patreon account (Settings) if you back this creator.',
    patreonNoFiles: 'This post has no directly-installable files (it may link out to another host).',
    patreonProfile: 'This is a Patreon profile, not a post — opening in your browser.',
    boostySubs: 'This Boosty post is for subscribers only — opening in your browser.',
    boostyLogin: 'Boosty serves files to signed-in users only — opening in your browser.',
    boostyNoFiles: 'This Boosty post has no installable files.',
    boostyProfile: 'This is a Boosty profile, not a post — opening in your browser.',
    tsr: 'The Sims Resource gates downloads behind its own site — opening there.',
    modcollective: 'Mod Collective requires signing in on their site — opening there.',
    megaFolder: 'MEGA folders need picking by hand — opening in your browser.',
    megaBad: 'Could not read this MEGA link ({error}).',
    notAFile: '{host} link points to "{name}" — not an installable mod file.',
    cantRead: 'Could not read the {what}.',
    drivePrivate: 'This Google Drive file is not shared publicly — opening in your browser.',
    dropboxGone: 'Could not reach this Dropbox file (deleted or access-restricted).',
    mfNoLink: 'Could not find the MediaFire download link (file removed?).',
    mfFolderByHand: 'MediaFire folders need picking by hand — opening in your browser.',
    cfNotFound: 'Mod not found on CurseForge.',
    cfBlocked: 'This creator disabled downloads outside CurseForge — opening there.',
    simfilesNotFile: 'This simfil.es link does not serve a mod file.',
    emptyFolder: 'No installable files in this {host} folder (or it is private).',
    folderResolveFailed: 'Could not resolve any files in this {host} folder.',
    sfsBig: 'This SimFileShare folder has {count} files — pick the ones you want in the browser.',
    pageHttp: 'Page returned HTTP {status}.',
    pageNoFiles: 'No downloadable files found behind this link — opening in your browser.',
    notDownloadable: '{host} is not a directly-downloadable host — opening in your browser.',
    mtsNoFiles: 'No installable files found on this ModTheSims page.',
    tumblrNoFiles: "No installable files found behind this post's links.",
    invalidTumblrInput: 'Not a valid Tumblr blog name or URL.',
    rateLimited: 'Tumblr rate limit reached — try again in a minute (or set your own API key in Settings).'
  },
  ru: {
    badUrl: 'Это не похоже на ссылку.',
    httpOnly: 'Поддерживаются только http(s)-ссылки.',
    localBlocked: 'Локальные/приватные адреса запрещены.',
    tooManyHops: 'Слишком длинная цепочка редиректов.',
    pinNoLink: 'У этого пина нет внешней ссылки (только картинка).',
    patreonNoId: 'Не удалось прочитать id Patreon-поста.',
    patreonLocked: 'Этот пост Patreon только для патронов. Подключи аккаунт Patreon в настройках, если поддерживаешь автора.',
    patreonNoFiles: 'В посте нет файлов для установки (возможно, ссылка ведёт на другой сайт).',
    patreonProfile: 'Это профиль Patreon, а не пост — открываю в браузере.',
    boostySubs: 'Этот пост Boosty только для подписчиков — открываю в браузере.',
    boostyLogin: 'Boosty отдаёт файлы только залогиненным — открываю в браузере.',
    boostyNoFiles: 'В этом посте Boosty нет файлов для установки.',
    boostyProfile: 'Это профиль Boosty, а не пост — открываю в браузере.',
    tsr: 'The Sims Resource выдаёт файлы только через свой сайт — открываю там.',
    modcollective: 'Mod Collective требует входа на их сайте — открываю там.',
    megaFolder: 'Папки MEGA нужно разбирать вручную — открываю в браузере.',
    megaBad: 'Не удалось прочитать MEGA-ссылку ({error}).',
    notAFile: 'Ссылка {host} ведёт на «{name}» — это не устанавливаемый мод.',
    cantRead: 'Не удалось прочитать {what}.',
    drivePrivate: 'Файл Google Drive не открыт для общего доступа — открываю в браузере.',
    dropboxGone: 'Файл Dropbox недоступен (удалён или закрыт).',
    mfNoLink: 'Не нашёл ссылку скачивания на MediaFire (файл удалён?).',
    mfFolderByHand: 'Папки MediaFire нужно разбирать вручную — открываю в браузере.',
    cfNotFound: 'Мод не найден на CurseForge.',
    cfBlocked: 'Автор запретил скачивание вне CurseForge — открываю там.',
    simfilesNotFile: 'Эта ссылка simfil.es не отдаёт файл мода.',
    emptyFolder: 'В папке {host} нет устанавливаемых файлов (или она приватная).',
    folderResolveFailed: 'Не удалось получить файлы из папки {host}.',
    sfsBig: 'В папке SimFileShare {count} файлов — выбери нужные в браузере.',
    pageHttp: 'Страница ответила HTTP {status}.',
    pageNoFiles: 'За этой ссылкой не нашлось файлов для скачивания — открываю в браузере.',
    notDownloadable: '{host} не отдаёт файлы напрямую — открываю в браузере.',
    mtsNoFiles: 'На этой странице ModTheSims нет устанавливаемых файлов.',
    tumblrNoFiles: 'За ссылками этого поста не нашлось устанавливаемых файлов.',
    invalidTumblrInput: 'Это не похоже на имя или ссылку Tumblr-блога.',
    rateLimited: 'Лимит запросов Tumblr исчерпан — попробуй через минуту (или впиши свой API-ключ в настройках).'
  }
}

let pref = 'auto' // 'auto' | 'en' | 'ru' — mirrors the renderer's language setting

/** Called at startup and whenever the user changes the language in Settings. */
export function setMsgLang(p) {
  pref = p || 'auto'
}

function lang() {
  if (pref === 'ru' || pref === 'en') return pref
  try {
    return String(Intl.DateTimeFormat().resolvedOptions().locale).toLowerCase().startsWith('ru') ? 'ru' : 'en'
  } catch {
    return 'en'
  }
}

/** msg('key', { vars }) → localized string (falls back to English, then the key). */
export function msg(key, vars) {
  const str = TABLE[lang()][key] ?? TABLE.en[key] ?? key
  return vars ? str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`)) : str
}
