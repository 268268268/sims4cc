// Seeded into sources.json on first run (see sourcesStore.listSources). Users can
// unfollow any of these, or follow many more from the Sources panel (a big curated
// list of verified creators lives in suggestedSources.js → "Suggested creators").
//
// Kept deliberately focused (~34 creators): auto-following the full 130-creator
// curator list made the very first Discover load take ~2 minutes (Patreon is
// rate-limited to a polite trickle). This focused set loads in a reasonable time,
// and the Tumblr "finds hubs" below reblog from hundreds of creators, so variety
// stays high. Every slug here is probe-verified to resolve a live campaign (2026-07).
export const DEFAULT_SOURCES = [
  // ---- Patreon · CAS / hair / clothing ----
  { type: "patreon", input: "okruee", label: "okruee" },
  { type: "patreon", input: "simstrouble", label: "simstrouble" },
  { type: "patreon", input: "aharris00britney", label: "aharris00britney" },
  { type: "patreon", input: "pralinesims", label: "pralinesims" },
  { type: "patreon", input: "katverse", label: "katverse" },
  { type: "patreon", input: "joliebean", label: "joliebean" },
  { type: "patreon", input: "sentate", label: "Sentate" },
  { type: "patreon", input: "leahlillith", label: "LeahLillith" },
  { type: "patreon", input: "simpliciaty", label: "Simpliciaty" },
  { type: "patreon", input: "greenllamas", label: "GreenLlamas" },
  { type: "patreon", input: "trillyke", label: "Trillyke" },
  { type: "patreon", input: "darte77", label: "Darte77" },
  { type: "patreon", input: "charlypancakes", label: "CharlyPancakes" },
  { type: "patreon", input: "elliesimple", label: "Elliesimple" },
  { type: "patreon", input: "madlen", label: "Madlen" },
  { type: "patreon", input: "dogsill", label: "Dogsill" },
  { type: "patreon", input: "imvikai", label: "imVikai" },
  { type: "patreon", input: "thisisthem", label: "THIS IS THEM" },
  // ---- Patreon · Build / Buy ----
  { type: "patreon", input: "ravasheen", label: "RAVASHEEN" },
  { type: "patreon", input: "littledica", label: "littledica" },
  { type: "patreon", input: "felixandre", label: "Felixandre" },
  { type: "patreon", input: "pierisim", label: "Pierisim" },
  { type: "patreon", input: "harrie", label: "Captain Harrie" },
  { type: "patreon", input: "peacemakeric", label: "Peacemaker IC" },
  { type: "patreon", input: "sixamcc", label: "sixamcc" },
  { type: "patreon", input: "dreamteamsims", label: "dreamteamsims" },
  { type: "patreon", input: "goppolsme", label: "GoppolsMe" },
  { type: "patreon", input: "nucrests", label: "Nucrests" },
  // ---- Patreon · Gameplay mods ----
  { type: "patreon", input: "lumpinou", label: "Lumpinou" },
  { type: "patreon", input: "kawaiistacie", label: "KawaiiStacie" },
  { type: "patreon", input: "adeepindigo", label: "adeepindigo" },
  { type: "patreon", input: "sacrificial", label: "Sacrificial" },
  { type: "patreon", input: "simrealist", label: "SimRealist" },
  { type: "patreon", input: "roburky", label: "roBurky" },
  // ---- Tumblr finds hubs (each reblogs from hundreds of creators) ----
  { type: "tumblr", input: "maxismatchccworld", label: "Maxis Match CC World" },
  { type: "tumblr", input: "emilyccfinds", label: "Emily CC Finds" },
  { type: "tumblr", input: "mmfinds", label: "MMFINDS" },
  { type: "tumblr", input: "thesimscatalog", label: "The Sims Catalog" },
  { type: "tumblr", input: "citrontart", label: "CITRONTART" },
  { type: "tumblr", input: "peppermint-ginger", label: "peppermint & ginger" },
  { type: "tumblr", input: "ts4-maxis-match", label: "Sims 4 Maxis Match" },
  { type: "tumblr", input: "zx-ta", label: "Zx-Ta" }
]
