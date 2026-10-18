package discover

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"sims4cc-wails/backend/config"
	"sims4cc-wails/backend/extractor"
	"sims4cc-wails/backend/resolver"
	"sims4cc-wails/backend/scanner"
)

type SourceTypeInfo struct {
	Type  string `json:"type"`
	Label string `json:"label"`
	Hint  string `json:"hint"`
}

type Source struct {
	Id      string  `json:"id"`
	Type    string  `json:"type"`
	Input   string  `json:"input"`
	Label   string  `json:"label"`
	AddedAt string  `json:"addedAt"`
	Builtin bool    `json:"builtin,omitempty"`
	Count   int     `json:"count"`
	Error   *string `json:"error,omitempty"`
}

type DiscoverItem struct {
	Id             string                  `json:"id"`
	SourceId       string                  `json:"sourceId"`
	SourceLabel    string                  `json:"sourceLabel"`
	SourceType     string                  `json:"sourceType"`
	Title          string                  `json:"title"`
	Author         string                  `json:"author"`
	AvatarUrl      string                  `json:"avatarUrl,omitempty"`
	Summary        string                  `json:"summary"`
	ImageUrl       string                  `json:"imageUrl"`
	Images         []string                `json:"images,omitempty"`
	DownloadUrl    string                  `json:"downloadUrl,omitempty"`
	Url            string                  `json:"url"`
	PageUrl        string                  `json:"pageUrl,omitempty"`
	Date           string                  `json:"date"`
	PublishedAt    string                  `json:"publishedAt,omitempty"`
	ContentType    string                  `json:"contentType,omitempty"`
	Locked         bool                    `json:"locked"`
	Downloads      []resolver.DownloadFile `json:"downloads,omitempty"`
	CandidateLinks []string                `json:"candidateLinks,omitempty"`
	Links          []string                `json:"links,omitempty"`
	Tags           []string                `json:"tags,omitempty"`
	Notes          int                     `json:"notes,omitempty"`
	Reblog         bool                    `json:"reblog,omitempty"`
}

type SourceFeedResult struct {
	Ok         bool           `json:"ok"`
	Items      []DiscoverItem `json:"items"`
	Label      string         `json:"label"`
	NextCursor any            `json:"nextCursor"`
	Error      string         `json:"error,omitempty"`
}

type TumblrTagFeedResult struct {
	Ok      bool             `json:"ok"`
	Items   []DiscoverItem   `json:"items"`
	Cursors map[string]int64 `json:"cursors"`
	HasMore bool             `json:"hasMore"`
	Error   string           `json:"error,omitempty"`
}

type DiscoverFeedResult struct {
	Ok        bool           `json:"ok"`
	Items     []DiscoverItem `json:"items"`
	Sources   []Source       `json:"sources"`
	FetchedAt string         `json:"fetchedAt"`
	HasMore   bool           `json:"hasMore"`
	Cursor    string         `json:"cursor,omitempty"`
	Cursors   map[string]any `json:"cursors,omitempty"`
}

type SuggestedSource struct {
	Type     string `json:"type"`
	Input    string `json:"input"`
	Label    string `json:"label"`
	Tag      string `json:"tag"`
	Followed bool   `json:"followed"`
}

type DownloadedDiscoverResult struct {
	Ids   []string `json:"ids"`
	Files []string `json:"files"`
}

type DownloadResult struct {
	Ok        bool     `json:"ok"`
	Installed []string `json:"installed"`
	Errors    []string `json:"errors"`
}

type DiscoverProgress struct {
	ItemId    string `json:"itemId"`
	Received  int64  `json:"received"`
	Total     int64  `json:"total"`
	Percent   int    `json:"percent"`
	Status    string `json:"status"`
	FileIndex int    `json:"fileIndex,omitempty"`
	FileCount int    `json:"fileCount,omitempty"`
	Phase     string `json:"phase,omitempty"`
}

var (
	discLock      sync.Mutex
	cachedFeed    *DiscoverFeedResult
	sourceCursors = make(map[string]any)
	defaultSource = []Source{
		{Id: "builtin-mts", Type: "modthesims", Input: "", Label: "ModTheSims · Sims 4", Builtin: true, AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "builtin-tsr", Type: "tsr", Input: "", Label: "The Sims Resource · Sims 4", Builtin: true, AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_okruee", Type: "patreon", Input: "okruee", Label: "okruee", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_simstrouble", Type: "patreon", Input: "simstrouble", Label: "simstrouble", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_aharris", Type: "patreon", Input: "aharris00britney", Label: "aharris00britney", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_pralinesims", Type: "patreon", Input: "pralinesims", Label: "pralinesims", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_katverse", Type: "patreon", Input: "katverse", Label: "katverse", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_joliebean", Type: "patreon", Input: "joliebean", Label: "joliebean", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_sentate", Type: "patreon", Input: "sentate", Label: "Sentate", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_leahlillith", Type: "patreon", Input: "leahlillith", Label: "LeahLillith", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_simpliciaty", Type: "patreon", Input: "simpliciaty", Label: "Simpliciaty", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_greenllamas", Type: "patreon", Input: "greenllamas", Label: "GreenLlamas", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_trillyke", Type: "patreon", Input: "trillyke", Label: "Trillyke", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_darte77", Type: "patreon", Input: "darte77", Label: "Darte77", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_charlypancakes", Type: "patreon", Input: "charlypancakes", Label: "CharlyPancakes", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_elliesimple", Type: "patreon", Input: "elliesimple", Label: "Elliesimple", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_madlen", Type: "patreon", Input: "madlen", Label: "Madlen", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_dogsill", Type: "patreon", Input: "dogsill", Label: "Dogsill", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_imvikai", Type: "patreon", Input: "imvikai", Label: "imVikai", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_thisisthem", Type: "patreon", Input: "thisisthem", Label: "THIS IS THEM", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_ravasheen", Type: "patreon", Input: "ravasheen", Label: "RAVASHEEN", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_littledica", Type: "patreon", Input: "littledica", Label: "littledica", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_felixandre", Type: "patreon", Input: "felixandre", Label: "Felixandre", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_pierisim", Type: "patreon", Input: "pierisim", Label: "Pierisim", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_harrie", Type: "patreon", Input: "harrie", Label: "Captain Harrie", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_peacemakeric", Type: "patreon", Input: "peacemakeric", Label: "Peacemaker IC", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_sixamcc", Type: "patreon", Input: "sixamcc", Label: "sixamcc", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_dreamteamsims", Type: "patreon", Input: "dreamteamsims", Label: "dreamteamsims", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_goppolsme", Type: "patreon", Input: "goppolsme", Label: "GoppolsMe", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_nucrests", Type: "patreon", Input: "nucrests", Label: "Nucrests", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_lumpinou", Type: "patreon", Input: "lumpinou", Label: "Lumpinou", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_kawaiistacie", Type: "patreon", Input: "kawaiistacie", Label: "KawaiiStacie", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_adeepindigo", Type: "patreon", Input: "adeepindigo", Label: "adeepindigo", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_sacrificial", Type: "patreon", Input: "sacrificial", Label: "Sacrificial", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_simrealist", Type: "patreon", Input: "simrealist", Label: "SimRealist", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_roburky", Type: "patreon", Input: "roburky", Label: "roBurky", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_clumsyalien", Type: "patreon", Input: "clumsyalien", Label: "ClumsyAlienn", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_northernsiberiawinds", Type: "patreon", Input: "northernsiberiawinds", Label: "Northern Siberia Winds", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_oydis", Type: "patreon", Input: "oydis", Label: "Oydis", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_rimings", Type: "patreon", Input: "rimings", Label: "RIMINGs", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_aveline", Type: "patreon", Input: "aveline", Label: "Aveline Sims", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_helgatisha", Type: "patreon", Input: "helgatisha", Label: "Helgatisha", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_solistair", Type: "patreon", Input: "solistair", Label: "Solistair", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_candysims4", Type: "patreon", Input: "candysims4", Label: "CandySims4", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_akaysims", Type: "patreon", Input: "akaysims", Label: "akaysims", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_ddarkstonee", Type: "patreon", Input: "ddarkstonee", Label: "DdarkStonee", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_grimcookies", Type: "patreon", Input: "grimcookies", Label: "GrimCookies", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_simsi45", Type: "patreon", Input: "simsi45", Label: "Simsi45", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_simmerkate", Type: "patreon", Input: "simmerkate", Label: "SimmerKate", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_luumia", Type: "patreon", Input: "luumia", Label: "Luumia", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_qicc", Type: "patreon", Input: "qicc", Label: "qicc", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_dinha", Type: "patreon", Input: "dinha", Label: "Dinha Gamer", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_severinka", Type: "patreon", Input: "severinka", Label: "Severinka", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_soloriya", Type: "patreon", Input: "soloriya", Label: "Soloriya", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_brazenlotus", Type: "patreon", Input: "brazenlotus", Label: "brazenlotus", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_myshunosun", Type: "patreon", Input: "myshunosun", Label: "myshunosun", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_saruin", Type: "patreon", Input: "saruin", Label: "Saruin", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_arethabee", Type: "patreon", Input: "arethabee", Label: "arethabee", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_twistedcat", Type: "patreon", Input: "twistedcat", Label: "twistedcat", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_llazyneiph", Type: "patreon", Input: "llazyneiph", Label: "llazyneiph", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_natalia-auditore", Type: "patreon", Input: "natalia-auditore", Label: "Natalia-Auditore", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_wistfulcastle", Type: "patreon", Input: "wistfulcastle", Label: "Wistful Castle", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "p_charonlee", Type: "patreon", Input: "charonlee", Label: "charonlee", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "t_mmfinds", Type: "tumblr", Input: "maxismatchccworld", Label: "Maxis Match CC World", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "t_emily", Type: "tumblr", Input: "emilyccfinds", Label: "Emily CC Finds", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "t_hub", Type: "tumblr", Input: "mmfinds", Label: "MMFINDS", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "t_catalog", Type: "tumblr", Input: "thesimscatalog", Label: "The Sims Catalog", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "t_citrontart", Type: "tumblr", Input: "citrontart", Label: "CITRONTART", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "t_peppermint-ginger", Type: "tumblr", Input: "peppermint-ginger", Label: "peppermint & ginger", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "t_ts4-maxis-match", Type: "tumblr", Input: "ts4-maxis-match", Label: "Sims 4 Maxis Match", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "t_zx-ta", Type: "tumblr", Input: "zx-ta", Label: "Zx-Ta", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "b_plazasims", Type: "boosty", Input: "plazasims", Label: "PlazaSims", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "b_helgatisha", Type: "boosty", Input: "helgatisha", Label: "Helgatisha", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "b_nsw", Type: "boosty", Input: "northernsiberiawinds", Label: "Northern Siberia Winds", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "b_joliebean", Type: "boosty", Input: "joliebean", Label: "joliebean", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "b_natalia", Type: "boosty", Input: "natalia-auditore", Label: "Natalia-Auditore", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "b_ddarkstonee", Type: "boosty", Input: "ddarkstonee", Label: "DdarkStonee", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "b_atomiclight", Type: "boosty", Input: "atomiclight", Label: "AtomicLight", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "b_nell_le", Type: "boosty", Input: "nell_le", Label: "Nell (nell_le)", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "b_magicbot", Type: "boosty", Input: "magicbot", Label: "Magic Bot", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "b_korkassims", Type: "boosty", Input: "korkassims", Label: "KorkasSims", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "b_soloriya", Type: "boosty", Input: "soloriya", Label: "Soloriya", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "b_moriel", Type: "boosty", Input: "moriel", Label: "Lady Moriel", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "b_sonyasims", Type: "boosty", Input: "sonyasims", Label: "SonyaSims", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "b_nikod03", Type: "boosty", Input: "nikod03", Label: "NikoD03", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "b_nulevhroma", Type: "boosty", Input: "nulevhroma", Label: "Nulevhroma", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "b_tannibu", Type: "boosty", Input: "tannibu", Label: "Tannibu", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "b_lovesimka", Type: "boosty", Input: "lovesimka", Label: "LoveSimka", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "b_ts4creative", Type: "boosty", Input: "ts4creativecorner", Label: "TS4 Creative Corner", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "tsr_leah", Type: "tsr", Input: "Leah_Lillith", Label: "LeahLillith (TSR)", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "tsr_sclub", Type: "tsr", Input: "S-Club", Label: "S-Club (TSR)", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "tsr_praline", Type: "tsr", Input: "Pralinesims", Label: "Pralinesims (TSR)", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "tsr_wings", Type: "tsr", Input: "Wingssims", Label: "Wingssims (TSR)", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "tsr_anto", Type: "tsr", Input: "Anto", Label: "Anto (TSR)", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "tsr_nightcrawler", Type: "tsr", Input: "Nightcrawler_Sims", Label: "Nightcrawler (TSR)", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "tsr_simpliciaty", Type: "tsr", Input: "Simpliciaty", Label: "Simpliciaty (TSR)", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "tsr_billsims", Type: "tsr", Input: "Bill_Sims", Label: "Bill_Sims (TSR)", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "tsr_bobur", Type: "tsr", Input: "Bobur3", Label: "Bobur3 (TSR)", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "tsr_severinka", Type: "tsr", Input: "Severinka_", Label: "Severinka (TSR)", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "tsr_syboulette", Type: "tsr", Input: "Syboulette", Label: "Syboulette (TSR)", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "i_adeepindigo", Type: "itch", Input: "adeepindigomods", Label: "adeepindigo (Itch.io)", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "i_sparrow", Type: "itch", Input: "sparrowcc", Label: "Sparrow CC (Itch.io)", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "i_weirdo", Type: "itch", Input: "weirdoowly", Label: "WeirdoOwly (Itch.io)", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "i_mushilda", Type: "itch", Input: "mushilda", Label: "Mushilda (Itch.io)", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "i_missyhissy", Type: "itch", Input: "missyhissy", Label: "MissyHissy (Itch.io)", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "gh_s4cl", Type: "github", Input: "ColonolNutty/Sims4CommunityLibrary", Label: "Sims 4 Community Library", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "gh_s4mp", Type: "github", Input: "sims4multiplayer/s4mp-release", Label: "Sims 4 Multiplayer (S4MP)", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "gh_lot51", Type: "github", Input: "lot51/lot51-core-library", Label: "Lot 51 Core Library", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "gh_s4s", Type: "github", Input: "Sims4Group/Sims4Studio", Label: "Sims 4 Studio", AddedAt: "2026-01-01T00:00:00Z"},
		{Id: "gh_smartcore", Type: "github", Input: "HereToStay93/SmartCoreScript", Label: "Smart Core Script", AddedAt: "2026-01-01T00:00:00Z"},
	}

	SUGGESTED_SOURCES = []SuggestedSource{
		{Type: "patreon", Input: "okruee", Label: "okruee", Tag: "CAS · free files"},
		{Type: "patreon", Input: "littledica", Label: "littledica", Tag: "Build/Buy · free files"},
		{Type: "patreon", Input: "ravasheen", Label: "RAVASHEEN", Tag: "Build/Buy"},
		{Type: "patreon", Input: "simstrouble", Label: "simstrouble", Tag: "CAS"},
		{Type: "patreon", Input: "sixamcc", Label: "sixamcc", Tag: "Objects"},
		{Type: "patreon", Input: "aharris00britney", Label: "aharris00britney", Tag: "CAS"},
		{Type: "patreon", Input: "dreamteamsims", Label: "dreamteamsims", Tag: "Build/Buy"},
		{Type: "patreon", Input: "sentate", Label: "Sentate", Tag: "Clothing"},
		{Type: "patreon", Input: "joliebean", Label: "joliebean", Tag: "CAS"},
		{Type: "patreon", Input: "brazenlotus", Label: "brazenlotus", Tag: "Build/Buy"},
		{Type: "patreon", Input: "katverse", Label: "katverse", Tag: "CAS"},
		{Type: "patreon", Input: "myshunosun", Label: "myshunosun", Tag: "CAS"},
		{Type: "patreon", Input: "saruin", Label: "Saruin", Tag: "Clothing"},
		{Type: "patreon", Input: "pralinesims", Label: "pralinesims", Tag: "Hair · Makeup"},
		{Type: "patreon", Input: "harrie", Label: "Captain Harrie", Tag: "Build/Buy"},
		{Type: "patreon", Input: "arethabee", Label: "arethabee", Tag: "CAS"},
		{Type: "patreon", Input: "twistedcat", Label: "twistedcat", Tag: "CAS"},
		{Type: "patreon", Input: "simpliciaty", Label: "Simpliciaty", Tag: "Hair · CAS"},
		{Type: "patreon", Input: "clumsyalien", Label: "ClumsyAlienn", Tag: "CAS"},
		{Type: "patreon", Input: "northernsiberiawinds", Label: "Northern Siberia Winds", Tag: "CAS"},
		{Type: "patreon", Input: "greenllamas", Label: "GreenLlamas", Tag: "Hair · CAS"},
		{Type: "patreon", Input: "trillyke", Label: "Trillyke", Tag: "CAS"},
		{Type: "patreon", Input: "felixandre", Label: "Felixandre", Tag: "Build/Buy"},
		{Type: "patreon", Input: "pierisim", Label: "Pierisim", Tag: "Build/Buy"},
		{Type: "patreon", Input: "peacemakeric", Label: "Peacemaker IC", Tag: "Build/Buy"},
		{Type: "patreon", Input: "lumpinou", Label: "Lumpinou", Tag: "Gameplay mods"},
		{Type: "patreon", Input: "kawaiistacie", Label: "KawaiiStacie", Tag: "Gameplay mods"},
		{Type: "patreon", Input: "adeepindigo", Label: "adeepindigo", Tag: "Gameplay mods"},
		{Type: "patreon", Input: "sacrificial", Label: "Sacrificial", Tag: "Gameplay mods"},
		{Type: "patreon", Input: "simrealist", Label: "SimRealist", Tag: "Gameplay mods"},
		{Type: "patreon", Input: "roburky", Label: "roBurky", Tag: "Gameplay mods"},
		{Type: "patreon", Input: "oydis", Label: "Oydis", Tag: "CAS"},
		{Type: "patreon", Input: "rimings", Label: "RIMINGs", Tag: "CAS"},
		{Type: "patreon", Input: "aveline", Label: "Aveline Sims", Tag: "CAS"},
		{Type: "patreon", Input: "helgatisha", Label: "Helgatisha", Tag: "CAS"},
		{Type: "patreon", Input: "solistair", Label: "Solistair", Tag: "CAS"},
		{Type: "patreon", Input: "candysims4", Label: "CandySims4", Tag: "CAS"},
		{Type: "patreon", Input: "akaysims", Label: "akaysims", Tag: "CAS"},
		{Type: "patreon", Input: "ddarkstonee", Label: "DdarkStonee", Tag: "CAS"},
		{Type: "patreon", Input: "grimcookies", Label: "GrimCookies", Tag: "CAS"},
		{Type: "patreon", Input: "simsi45", Label: "Simsi45", Tag: "CAS"},
		{Type: "patreon", Input: "simmerkate", Label: "SimmerKate", Tag: "CAS"},
		{Type: "patreon", Input: "luumia", Label: "Luumia", Tag: "CAS · Overrides"},
		{Type: "patreon", Input: "thisisthem", Label: "THIS IS THEM", Tag: "CAS"},
		{Type: "patreon", Input: "qicc", Label: "qicc", Tag: "CAS"},
		{Type: "patreon", Input: "nucrests", Label: "Nucrests", Tag: "CAS"},
		{Type: "patreon", Input: "goppolsme", Label: "GoppolsMe", Tag: "CAS"},
		{Type: "patreon", Input: "dinha", Label: "Dinha Gamer", Tag: "CAS"},
		{Type: "patreon", Input: "severinka", Label: "Severinka", Tag: "Build/Buy"},
		{Type: "patreon", Input: "soloriya", Label: "Soloriya", Tag: "Build/Buy"},
		{Type: "patreon", Input: "llazyneiph", Label: "llazyneiph", Tag: "CAS"},
		{Type: "patreon", Input: "natalia-auditore", Label: "Natalia-Auditore", Tag: "CAS"},
		{Type: "patreon", Input: "wistfulcastle", Label: "Wistful Castle", Tag: "Build/Buy"},
		{Type: "patreon", Input: "charonlee", Label: "charonlee", Tag: "CAS"},
		{Type: "tumblr", Input: "maxismatchccworld", Label: "Maxis Match CC World", Tag: "Finds hub"},
		{Type: "tumblr", Input: "emilyccfinds", Label: "Emily CC Finds", Tag: "Finds hub"},
		{Type: "tumblr", Input: "mmfinds", Label: "MMFINDS", Tag: "Finds hub"},
		{Type: "tumblr", Input: "thesimscatalog", Label: "The Sims Catalog", Tag: "Finds hub"},
		{Type: "tumblr", Input: "citrontart", Label: "CITRONTART", Tag: "CAS"},
		{Type: "tumblr", Input: "peppermint-ginger", Label: "peppermint & ginger", Tag: "Finds hub"},
		{Type: "tumblr", Input: "zx-ta", Label: "Zx-Ta", Tag: "CAS"},
		{Type: "tumblr", Input: "ts4-maxis-match", Label: "Sims 4 Maxis Match", Tag: "Finds hub"},
		{Type: "boosty", Input: "plazasims", Label: "PlazaSims", Tag: "CAS · Clothing"},
		{Type: "boosty", Input: "helgatisha", Label: "Helgatisha", Tag: "CAS · Poses"},
		{Type: "boosty", Input: "northernsiberiawinds", Label: "Northern Siberia Winds", Tag: "CAS · Skin"},
		{Type: "boosty", Input: "joliebean", Label: "joliebean", Tag: "CAS · Clothing"},
		{Type: "boosty", Input: "natalia-auditore", Label: "Natalia-Auditore", Tag: "CAS · Fantasy"},
		{Type: "boosty", Input: "ddarkstonee", Label: "DdarkStonee", Tag: "CAS · Skins"},
		{Type: "boosty", Input: "atomiclight", Label: "AtomicLight", Tag: "CAS · Clothing"},
		{Type: "boosty", Input: "nell_le", Label: "Nell (nell_le)", Tag: "CAS · Accessories"},
		{Type: "boosty", Input: "magicbot", Label: "Magic Bot", Tag: "CAS · Body & Shoes"},
		{Type: "boosty", Input: "korkassims", Label: "KorkasSims", Tag: "CAS · Clothing"},
		{Type: "boosty", Input: "soloriya", Label: "Soloriya", Tag: "Build/Buy · Sets"},
		{Type: "boosty", Input: "moriel", Label: "Lady Moriel", Tag: "CAS · Historical"},
		{Type: "boosty", Input: "sonyasims", Label: "SonyaSims", Tag: "CAS · Hair"},
		{Type: "tsr", Input: "Leah_Lillith", Label: "LeahLillith (TSR)", Tag: "Hair · Accessories"},
		{Type: "tsr", Input: "S-Club", Label: "S-Club (TSR)", Tag: "Makeup · Accessories"},
		{Type: "tsr", Input: "Pralinesims", Label: "Pralinesims (TSR)", Tag: "Makeup · Eyes"},
		{Type: "tsr", Input: "Wingssims", Label: "Wingssims (TSR)", Tag: "Hair"},
		{Type: "tsr", Input: "Anto", Label: "Anto (TSR)", Tag: "Hair"},
		{Type: "tsr", Input: "Nightcrawler_Sims", Label: "Nightcrawler (TSR)", Tag: "Hair"},
		{Type: "tsr", Input: "Simpliciaty", Label: "Simpliciaty (TSR)", Tag: "Hair · CAS"},
		{Type: "tsr", Input: "Bill_Sims", Label: "Bill_Sims (TSR)", Tag: "Clothing"},
		{Type: "tsr", Input: "Bobur3", Label: "Bobur3 (TSR)", Tag: "Makeup · Eyes"},
		{Type: "tsr", Input: "Natalis", Label: "Natalis (TSR)", Tag: "Jewelry · Nails"},
		{Type: "tsr", Input: "Cosimetic", Label: "Cosimetic (TSR)", Tag: "Makeup"},
		{Type: "tsr", Input: "McLayneSims", Label: "McLayneSims (TSR)", Tag: "Male Clothing"},
		{Type: "tsr", Input: "Ung999", Label: "Ung999 (TSR)", Tag: "Build/Buy"},
		{Type: "tsr", Input: "Severinka_", Label: "Severinka (TSR)", Tag: "Build/Buy"},
		{Type: "tsr", Input: "Syboulette", Label: "Syboulette (TSR)", Tag: "Build/Buy"},
		{Type: "tsr", Input: "SIMcredible!", Label: "SIMcredible! (TSR)", Tag: "Build/Buy"},
		{Type: "tsr", Input: "Wondymoon", Label: "Wondymoon (TSR)", Tag: "Build/Buy"},
		{Type: "tsr", Input: "Rirann", Label: "Rirann (TSR)", Tag: "Shoes · CAS"},
		{Type: "tsr", Input: "Sim_man123", Label: "Sim_man123 (TSR)", Tag: "Build/Buy"},
		{Type: "tsr", Input: "Dissia", Label: "Dissia (TSR)", Tag: "Clothing"},
		{Type: "tsr", Input: "Busra-tr", Label: "Busra-tr (TSR)", Tag: "Clothing"},
		{Type: "tsr", Input: "christopher067", Label: "christopher067 (TSR)", Tag: "Jewelry · CAS"},
		{Type: "itch", Input: "adeepindigomods", Label: "adeepindigo (Itch.io)", Tag: "Gameplay mods"},
		{Type: "itch", Input: "sparrowcc", Label: "Sparrow CC (Itch.io)", Tag: "Build/Buy · CAS"},
		{Type: "itch", Input: "weirdoowly", Label: "WeirdoOwly (Itch.io)", Tag: "CAS"},
		{Type: "itch", Input: "mushilda", Label: "Mushilda (Itch.io)", Tag: "Mods · Tools"},
		{Type: "itch", Input: "missyhissy", Label: "MissyHissy (Itch.io)", Tag: "Gameplay mods"},
		{Type: "itch", Input: "baniduhaine", Label: "Baniduhaine (Itch.io)", Tag: "Occult mods"},
		{Type: "github", Input: "ColonolNutty/Sims4CommunityLibrary", Label: "Sims 4 Community Library", Tag: "Core Library"},
		{Type: "github", Input: "sims4multiplayer/s4mp-release", Label: "Sims 4 Multiplayer (S4MP)", Tag: "Multiplayer"},
		{Type: "github", Input: "lot51/lot51-core-library", Label: "Lot 51 Core Library", Tag: "Core Library"},
		{Type: "github", Input: "Sims4Group/Sims4Studio", Label: "Sims 4 Studio", Tag: "Modding Tool"},
		{Type: "github", Input: "HereToStay93/SmartCoreScript", Label: "Smart Core Script", Tag: "Core Library"},
		{Type: "github", Input: "nc4d/Sims4ModdersResource", Label: "Sims 4 Modders Resource", Tag: "Script Mod"},
		{Type: "github", Input: "mars9700797007/Sims-4-mod-collection", Label: "Sims 4 Mod Collection", Tag: "Mod Pack"},
	}
)

func toInt(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int64:
		return int(n)
	case float64:
		return int(n)
	case string:
		var p int
		fmt.Sscanf(n, "%d", &p)
		return p
	default:
		return 0
	}
}

func getAppDataDir() string {
	base := os.Getenv("APPDATA")
	if base == "" {
		base, _ = os.UserConfigDir()
	}
	dir := filepath.Join(base, "sims4-mod-manager")
	_ = os.MkdirAll(dir, 0755)
	return dir
}

func getSourcesPath() string {
	return filepath.Join(getAppDataDir(), "sources.json")
}

func getDiscoverCachePath() string {
	return filepath.Join(getAppDataDir(), "discover-cache.json")
}

func getPatreonCampaignCachePath() string {
	return filepath.Join(getAppDataDir(), "patreon-campaigns.json")
}

func getSavedLinksPath() string {
	return filepath.Join(getAppDataDir(), "saved-links.json")
}

func getDiscoverDownloadsPath() string {
	return filepath.Join(getAppDataDir(), "discover-downloads.json")
}

func GetSourceTypes() []SourceTypeInfo {
	return []SourceTypeInfo{
		{Type: "patreon", Label: "Patreon", Hint: "имя автора или patreon.com ссылка"},
		{Type: "tumblr", Label: "Tumblr", Hint: "имя блога или ссылка"},
		{Type: "boosty", Label: "Boosty", Hint: "имя блога или boosty.to ссылка"},
		{Type: "tsr", Label: "The Sims Resource", Hint: "ник автора на TSR (напр. Leah_Lillith)"},
		{Type: "itch", Label: "Itch.io", Hint: "автор или ссылка (напр. adeepindigomods)"},
		{Type: "github", Label: "GitHub Releases", Hint: "owner/repo (напр. ColonolNutty/Sims4CommunityLibrary)"},
		{Type: "pinterest", Label: "Pinterest", Hint: "пользователь или доска"},
	}
}

func getSourcesLocked() []Source {
	data, err := os.ReadFile(getSourcesPath())
	if err != nil {
		_ = saveSources(defaultSource)
		return defaultSource
	}

	hasBom := bytes.HasPrefix(data, []byte("\xef\xbb\xbf"))
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))

	var list []Source
	if json.Unmarshal(data, &list) != nil || len(list) == 0 {
		_ = saveSources(defaultSource)
		return defaultSource
	}

	// Очищаем неактуальный тестовый блог lamatisse и гарантируем наличие всех проверенных источников
	var cleaned []Source
	existingIds := make(map[string]bool)
	existingKeys := make(map[string]bool)
	changed := hasBom
	for _, s := range list {
		if s.Id == "b_lamatisse" || (s.Type == "boosty" && strings.EqualFold(s.Input, "lamatisse")) {
			changed = true
			continue
		}
		key := strings.ToLower(s.Type + "|" + s.Input)
		if existingIds[s.Id] || (s.Input != "" && existingKeys[key]) {
			changed = true
			continue
		}
		cleaned = append(cleaned, s)
		existingIds[s.Id] = true
		if s.Input != "" {
			existingKeys[key] = true
		}
	}
	list = cleaned

	for _, def := range defaultSource {
		key := strings.ToLower(def.Type + "|" + def.Input)
		if !existingIds[def.Id] && (def.Input == "" || !existingKeys[key]) {
			if def.Builtin {
				list = append([]Source{def}, list...)
			} else {
				list = append(list, def)
			}
			existingIds[def.Id] = true
			if def.Input != "" {
				existingKeys[key] = true
			}
			changed = true
		}
	}
	if changed {
		_ = saveSources(list)
	}
	if cachedFeed != nil && len(cachedFeed.Items) > 0 {
		counts := make(map[string]int)
		for _, it := range cachedFeed.Items {
			counts[it.SourceId]++
		}
		for i := range list {
			list[i].Count = counts[list[i].Id]
		}
	}
	return list
}

func GetSources() []Source {
	discLock.Lock()
	defer discLock.Unlock()
	return getSourcesLocked()
}

func saveSources(list []Source) error {
	raw, err := json.MarshalIndent(list, "", "  ")
	if err == nil {
		return os.WriteFile(getSourcesPath(), raw, 0644)
	}
	return err
}

type FollowPayload struct {
	Type  string `json:"type"`
	Input string `json:"input"`
	Label string `json:"label,omitempty"`
}

func FollowSource(p FollowPayload) bool {
	discLock.Lock()
	defer discLock.Unlock()

	inp := strings.TrimSpace(p.Input)
	if inp == "" {
		return false
	}

	key := strings.ToLower(p.Type + "|" + inp)
	list := getSourcesLocked()
	for _, s := range list {
		if strings.ToLower(s.Type+"|"+s.Input) == key {
			return true
		}
	}

	h := sha1.Sum([]byte(key))
	id := hex.EncodeToString(h[:5])
	lbl := p.Label
	if lbl == "" {
		lbl = inp
	}

	list = append(list, Source{
		Id:      id,
		Type:    p.Type,
		Input:   inp,
		Label:   lbl,
		AddedAt: time.Now().UTC().Format(time.RFC3339),
	})
	_ = saveSources(list)
	return true
}

type BatchFollowResultItem struct {
	Input string `json:"input"`
	Ok    bool   `json:"ok"`
	Label string `json:"label,omitempty"`
	Error string `json:"error,omitempty"`
}

type BatchFollowResponse struct {
	Ok      bool                    `json:"ok"`
	Added   int                     `json:"added"`
	Skipped int                     `json:"skipped"`
	Results []BatchFollowResultItem `json:"results"`
}

func FollowSourcesBatch(payload any) BatchFollowResponse {
	discLock.Lock()
	defer discLock.Unlock()

	raw, _ := json.Marshal(payload)
	var p struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	_ = json.Unmarshal(raw, &p)

	list := getSourcesLocked()
	existing := make(map[string]bool)
	for _, s := range list {
		existing[strings.ToLower(s.Type+"|"+s.Input)] = true
	}

	tokens := strings.FieldsFunc(p.Text, func(r rune) bool {
		return r == ' ' || r == ',' || r == ';' || r == '\n' || r == '\r' || r == '\t'
	})

	var results []BatchFollowResultItem
	added := 0
	skipped := 0

	for _, token := range tokens {
		inp := strings.TrimSpace(token)
		if inp == "" {
			continue
		}
		key := strings.ToLower(p.Type + "|" + inp)
		if existing[key] {
			skipped++
			results = append(results, BatchFollowResultItem{Input: inp, Ok: true, Label: inp})
			continue
		}

		h := sha1.Sum([]byte(key))
		id := hex.EncodeToString(h[:5])
		lbl := inp

		list = append(list, Source{
			Id:      id,
			Type:    p.Type,
			Input:   inp,
			Label:   lbl,
			AddedAt: time.Now().UTC().Format(time.RFC3339),
		})
		existing[key] = true
		added++
		results = append(results, BatchFollowResultItem{Input: inp, Ok: true, Label: lbl})
	}

	if added > 0 {
		_ = saveSources(list)
	}

	return BatchFollowResponse{
		Ok:      true,
		Added:   added,
		Skipped: skipped,
		Results: results,
	}
}

func UnfollowSource(id string) bool {
	discLock.Lock()
	defer discLock.Unlock()

	list := getSourcesLocked()
	var updated []Source
	for _, s := range list {
		if s.Id != id && !s.Builtin {
			updated = append(updated, s)
		}
	}
	_ = saveSources(updated)
	return true
}

func GetSuggestedSources() []SuggestedSource {
	discLock.Lock()
	defer discLock.Unlock()

	followedList := getSourcesLocked()
	followedSet := make(map[string]bool)
	for _, s := range followedList {
		followedSet[strings.ToLower(s.Type+"|"+s.Input)] = true
	}

	result := make([]SuggestedSource, len(SUGGESTED_SOURCES))
	for i, s := range SUGGESTED_SOURCES {
		entry := s
		entry.Followed = followedSet[strings.ToLower(s.Type+"|"+s.Input)]
		result[i] = entry
	}
	return result
}

func FollowSuggestedSources(entries any) any {
	discLock.Lock()
	defer discLock.Unlock()

	list := getSourcesLocked()
	existing := make(map[string]bool)
	for _, s := range list {
		existing[strings.ToLower(s.Type+"|"+s.Input)] = true
	}

	toAdd := SUGGESTED_SOURCES
	if arr, ok := entries.([]any); ok && len(arr) > 0 {
		toAdd = nil
		for _, it := range arr {
			if m, ok := it.(map[string]any); ok {
				t, _ := m["type"].(string)
				inp, _ := m["input"].(string)
				lbl, _ := m["label"].(string)
				tag, _ := m["tag"].(string)
				if t != "" && inp != "" {
					toAdd = append(toAdd, SuggestedSource{Type: t, Input: inp, Label: lbl, Tag: tag})
				}
			}
		}
	}

	addedCount := 0
	for _, s := range toAdd {
		key := strings.ToLower(s.Type + "|" + s.Input)
		if existing[key] {
			continue
		}
		h := sha1.Sum([]byte(key))
		id := hex.EncodeToString(h[:5])
		label := s.Label
		if label == "" {
			label = s.Input
		}
		list = append(list, Source{
			Id:      id,
			Type:    s.Type,
			Input:   s.Input,
			Label:   label,
			AddedAt: time.Now().UTC().Format(time.RFC3339),
		})
		existing[key] = true
		addedCount++
	}

	if addedCount > 0 {
		_ = saveSources(list)
	}
	return map[string]any{"ok": true, "added": addedCount}
}

// ----------------- Patreon Feed Scraper -----------------

type CampaignInfo struct {
	Id        string `json:"id"`
	Name      string `json:"name"`
	AvatarUrl string `json:"avatarUrl,omitempty"`
}

var (
	campCacheMu     sync.Mutex
	patreonCampMemo map[string]CampaignInfo
)

func getPatreonCampaignCache() map[string]CampaignInfo {
	campCacheMu.Lock()
	defer campCacheMu.Unlock()
	if patreonCampMemo != nil {
		cp := make(map[string]CampaignInfo, len(patreonCampMemo))
		for k, v := range patreonCampMemo {
			cp[k] = v
		}
		return cp
	}
	data, err := os.ReadFile(getPatreonCampaignCachePath())
	if err != nil {
		patreonCampMemo = make(map[string]CampaignInfo)
		return make(map[string]CampaignInfo)
	}
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
	var res map[string]CampaignInfo
	if json.Unmarshal(data, &res) != nil || res == nil {
		patreonCampMemo = make(map[string]CampaignInfo)
		return make(map[string]CampaignInfo)
	}
	patreonCampMemo = res
	cp := make(map[string]CampaignInfo, len(res))
	for k, v := range res {
		cp[k] = v
	}
	return cp
}

func savePatreonCampaignEntry(slugKey string, info CampaignInfo) {
	campCacheMu.Lock()
	defer campCacheMu.Unlock()
	if patreonCampMemo == nil {
		patreonCampMemo = make(map[string]CampaignInfo)
	}
	patreonCampMemo[slugKey] = info
	raw, err := json.MarshalIndent(patreonCampMemo, "", "  ")
	if err == nil {
		_ = os.WriteFile(getPatreonCampaignCachePath(), raw, 0644)
	}
}

func normalizePatreonSlug(input string) string {
	s := strings.TrimSpace(input)
	s = strings.TrimPrefix(s, "https://")
	s = strings.TrimPrefix(s, "http://")
	s = strings.TrimPrefix(s, "www.")
	s = strings.TrimPrefix(s, "patreon.com/")
	s = strings.TrimPrefix(s, "c/")
	s = strings.TrimPrefix(s, "cw/")
	s = strings.TrimPrefix(s, "@")
	parts := strings.Split(s, "/")
	if len(parts) > 0 {
		return parts[0]
	}
	return s
}

func resolvePatreonCampaign(slug string) (*CampaignInfo, error) {
	slugKey := strings.ToLower(slug)
	cMap := getPatreonCampaignCache()
	if info, ok := cMap[slugKey]; ok && info.Id != "" {
		return &info, nil
	}

	client := &http.Client{Timeout: 15 * time.Second}
	ua := "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

	// 1. Официальный JSON API Patreon (не блокируется Cloudflare 403!)
	apiUrl := fmt.Sprintf("https://www.patreon.com/api/campaigns?filter[vanity]=%s&include=creator&json-api-version=1.0", url.QueryEscape(slug))
	if req, err := http.NewRequest("GET", apiUrl, nil); err == nil {
		req.Header.Set("User-Agent", ua)
		req.Header.Set("Accept", "application/json")
		req.Header.Set("Referer", "https://www.patreon.com/")
		if resp, err := client.Do(req); err == nil {
			var campRes struct {
				Data []struct {
					Id         string `json:"id"`
					Attributes struct {
						Name                 string `json:"name"`
						CreationName         string `json:"creation_name"`
						AvatarPhotoImageUrls struct {
							Original string `json:"original"`
							Default  string `json:"default"`
						} `json:"avatar_photo_image_urls"`
					} `json:"attributes"`
				} `json:"data"`
			}
			_ = json.NewDecoder(resp.Body).Decode(&campRes)
			resp.Body.Close()

			if len(campRes.Data) > 0 && campRes.Data[0].Id != "" {
				d := campRes.Data[0]
				name := strings.TrimSpace(d.Attributes.Name)
				if name == "" {
					name = slug
				}
				avatar := d.Attributes.AvatarPhotoImageUrls.Original
				if avatar == "" {
					avatar = d.Attributes.AvatarPhotoImageUrls.Default
				}
				info := CampaignInfo{Id: d.Id, Name: name, AvatarUrl: avatar}
				savePatreonCampaignEntry(slugKey, info)
				return &info, nil
			}
		}
	}

	// 2. Запасной вариант: чтение HTML страницы автора
	reqUrl := fmt.Sprintf("https://www.patreon.com/%s", slug)
	req, err := http.NewRequest("GET", reqUrl, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", ua)
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
	htmlContent := string(body)

	reCamp := regexp.MustCompile(`patreon-media/p/campaign/(\d+)`)
	mCamp := reCamp.FindStringSubmatch(htmlContent)
	if len(mCamp) <= 1 {
		reCamp2 := regexp.MustCompile(`"campaign_id\\*":\s*\\*"(\d+)`)
		mCamp = reCamp2.FindStringSubmatch(htmlContent)
	}

	if len(mCamp) <= 1 {
		return nil, fmt.Errorf("кампания Patreon не найдена для %s", slug)
	}
	campId := mCamp[1]

	name := slug
	reOg := regexp.MustCompile(`<meta[^>]+property="og:title"[^>]+content="([^"]+)"`)
	if m := reOg.FindStringSubmatch(htmlContent); len(m) > 1 {
		t := html.UnescapeString(m[1])
		t = strings.Replace(t, "Get more from ", "", 1)
		t = strings.Replace(t, " on Patreon", "", 1)
		name = strings.TrimSpace(t)
	}

	info := CampaignInfo{Id: campId, Name: name}
	savePatreonCampaignEntry(slugKey, info)
	return &info, nil
}

func FetchPatreonFeed(source Source, cursor string) ([]DiscoverItem, string, error) {
	slug := normalizePatreonSlug(source.Input)
	if slug == "" {
		return nil, "", fmt.Errorf("некорректный slug Patreon")
	}

	camp, err := resolvePatreonCampaign(slug)
	if err != nil {
		return nil, "", err
	}

	apiUrl := fmt.Sprintf("https://www.patreon.com/api/posts?filter[campaign_id]=%s&filter[contains_exclusive_posts]=true&sort=-published_at&json-api-version=1.0&json-api-use-default-includes=false&include=attachments,media,attachments_media,images&fields[post]=title,teaser_text,content,url,published_at,current_user_can_view,is_paid,like_count,post_file,embed,image&fields[attachment]=name,url&fields[media]=id,file_name,download_url,image_urls,mimetype&page[count]=50", camp.Id)
	if cursor != "" {
		apiUrl += "&page[cursor]=" + url.QueryEscape(cursor)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", apiUrl, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Referer", "https://www.patreon.com/")

	resp, err := client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	var payload struct {
		Data []struct {
			Id         string `json:"id"`
			Attributes struct {
				Title              string `json:"title"`
				TeaserText         string `json:"teaser_text"`
				Content            string `json:"content"`
				Url                string `json:"url"`
				PublishedAt        string `json:"published_at"`
				CurrentUserCanView bool   `json:"current_user_can_view"`
				IsPaid             bool   `json:"is_paid"`
				LikeCount          int    `json:"like_count"`
				PostFile           struct {
					Name string `json:"name"`
					Url  string `json:"url"`
				} `json:"post_file"`
				Embed struct {
					Url string `json:"url"`
				} `json:"embed"`
				Image struct {
					Url      string `json:"url"`
					LargeUrl string `json:"large_url"`
					ThumbUrl string `json:"thumb_url"`
				} `json:"image"`
			} `json:"attributes"`
			Relationships struct {
				Attachments struct {
					Data []struct {
						Id string `json:"id"`
					} `json:"data"`
				} `json:"attachments"`
				Media struct {
					Data []struct {
						Id string `json:"id"`
					} `json:"data"`
				} `json:"media"`
				AttachmentsMedia struct {
					Data []struct {
						Id string `json:"id"`
					} `json:"data"`
				} `json:"attachments_media"`
				Images struct {
					Data []struct {
						Id string `json:"id"`
					} `json:"data"`
				} `json:"images"`
			} `json:"relationships"`
		} `json:"data"`
		Included []struct {
			Id         string `json:"id"`
			Type       string `json:"type"`
			Attributes struct {
				Name        string `json:"name"`
				FileName    string `json:"file_name"`
				Url         string `json:"url"`
				DownloadUrl string `json:"download_url"`
				ImageUrls   struct {
					Original     string `json:"original"`
					DefaultLarge string `json:"default_large"`
					Default      string `json:"default"`
				} `json:"image_urls"`
			} `json:"attributes"`
		} `json:"included"`
		Meta struct {
			Pagination struct {
				Cursors struct {
					Next string `json:"next"`
				} `json:"cursors"`
			} `json:"pagination"`
		} `json:"meta"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, "", err
	}

	fileMap := make(map[string]resolver.DownloadFile)
	imageMap := make(map[string]string)

	for _, inc := range payload.Included {
		if inc.Type == "attachment" && inc.Attributes.Url != "" {
			fileMap[inc.Id] = resolver.DownloadFile{
				Name: inc.Attributes.Name,
				Url:  inc.Attributes.Url,
				Via:  "patreon",
			}
		} else if (inc.Type == "media" || inc.Type == "attachments_media") && inc.Attributes.DownloadUrl != "" && resolver.IsInstallable(inc.Attributes.FileName) {
			fileMap[inc.Id] = resolver.DownloadFile{
				Name: inc.Attributes.FileName,
				Url:  inc.Attributes.DownloadUrl,
				Via:  "patreon",
			}
		}
		if inc.Type == "media" && !resolver.IsInstallable(inc.Attributes.FileName) {
			imgU := inc.Attributes.ImageUrls.Original
			if imgU == "" {
				imgU = inc.Attributes.ImageUrls.DefaultLarge
			}
			if imgU == "" {
				imgU = inc.Attributes.ImageUrls.Default
			}
			if imgU != "" {
				imageMap[inc.Id] = imgU
			}
		}
	}

	var items []DiscoverItem
	for _, p := range payload.Data {
		viewable := p.Attributes.CurrentUserCanView
		var downloads []resolver.DownloadFile
		seen := make(map[string]bool)

		if viewable {
			if p.Attributes.PostFile.Url != "" && resolver.IsInstallable(p.Attributes.PostFile.Name) && !seen[p.Attributes.PostFile.Name] {
				seen[p.Attributes.PostFile.Name] = true
				downloads = append(downloads, resolver.DownloadFile{
					Name: p.Attributes.PostFile.Name,
					Url:  p.Attributes.PostFile.Url,
					Via:  "patreon",
				})
			}
			for _, att := range p.Relationships.Attachments.Data {
				if f, ok := fileMap[att.Id]; ok && resolver.IsInstallable(f.Name) && !seen[f.Name] {
					seen[f.Name] = true
					downloads = append(downloads, f)
				}
			}
			for _, m := range p.Relationships.Media.Data {
				if f, ok := fileMap[m.Id]; ok && resolver.IsInstallable(f.Name) && !seen[f.Name] {
					seen[f.Name] = true
					downloads = append(downloads, f)
				}
			}
			for _, am := range p.Relationships.AttachmentsMedia.Data {
				if f, ok := fileMap[am.Id]; ok && resolver.IsInstallable(f.Name) && !seen[f.Name] {
					seen[f.Name] = true
					downloads = append(downloads, f)
				}
			}
		}

		// Извлекаем внешние ссылки (SFS, Google Drive, MediaFire, Mega) из текста поста и embed
		var candidateLinks []string
		seenLinks := make(map[string]bool)
		addCandLink := func(raw string) {
			u := strings.TrimRight(resolver.DecodeOutboundRedirect(strings.TrimSpace(raw)), ".,;)]}>\"'")
			if strings.HasPrefix(u, "http") && !seenLinks[u] && !isIgnoredSocialLink(u) && !strings.Contains(u, "patreonusercontent.com") {
				seenLinks[u] = true
				candidateLinks = append(candidateLinks, u)
			}
		}

		if viewable {
			if p.Attributes.Embed.Url != "" {
				addCandLink(p.Attributes.Embed.Url)
			}
			if p.Attributes.Content != "" {
				for _, l := range extractHtmlLinks(p.Attributes.Content) {
					addCandLink(l)
				}
				for _, m := range reBoostyRawUrl.FindAllString(p.Attributes.Content, -1) {
					if isPriorityModLink(m) {
						addCandLink(m)
					}
				}
			}
			if p.Attributes.TeaserText != "" {
				for _, m := range reBoostyRawUrl.FindAllString(p.Attributes.TeaserText, -1) {
					if isPriorityModLink(m) {
						addCandLink(m)
					}
				}
			}
		}

		if viewable && len(downloads) == 0 && len(candidateLinks) == 0 {
			// Пропускаем пустые текстовые анонсы без файлов и ссылок
			continue
		}

		var postImages []string
		seenImg := make(map[string]bool)
		addPostImg := func(u string) {
			if u != "" && !seenImg[u] {
				seenImg[u] = true
				postImages = append(postImages, u)
			}
		}

		if p.Attributes.Image.LargeUrl != "" {
			addPostImg(p.Attributes.Image.LargeUrl)
		} else if p.Attributes.Image.Url != "" {
			addPostImg(p.Attributes.Image.Url)
		} else if p.Attributes.Image.ThumbUrl != "" {
			addPostImg(p.Attributes.Image.ThumbUrl)
		}

		for _, m := range p.Relationships.Media.Data {
			if iu, ok := imageMap[m.Id]; ok {
				addPostImg(iu)
			}
		}
		for _, im := range p.Relationships.Images.Data {
			if iu, ok := imageMap[im.Id]; ok {
				addPostImg(iu)
			}
		}

		img := ""
		if len(postImages) > 0 {
			img = postImages[0]
		}

		summary := p.Attributes.TeaserText
		if summary == "" && p.Attributes.Content != "" {
			summary = stripTags(p.Attributes.Content)
			if len(summary) > 280 {
				summary = summary[:280] + "…"
			}
		}

		dateStr := p.Attributes.PublishedAt
		items = append(items, DiscoverItem{
			Id:             fmt.Sprintf("patreon:%s", p.Id),
			SourceId:       source.Id,
			SourceLabel:    camp.Name,
			SourceType:     "patreon",
			Title:          p.Attributes.Title,
			Author:         camp.Name,
			AvatarUrl:      camp.AvatarUrl,
			Summary:        summary,
			ImageUrl:       img,
			Images:         postImages,
			Url:            p.Attributes.Url,
			PageUrl:        p.Attributes.Url,
			Date:           dateStr,
			PublishedAt:    dateStr,
			Locked:         !viewable,
			Notes:          p.Attributes.LikeCount,
			Downloads:      downloads,
			CandidateLinks: candidateLinks,
			Links:          candidateLinks,
		})
	}

	return items, payload.Meta.Pagination.Cursors.Next, nil
}

// ----------------- Tumblr Feed Scraper -----------------

func normalizeTumblrHost(input string) string {
	s := strings.TrimSpace(input)
	s = strings.TrimPrefix(s, "https://")
	s = strings.TrimPrefix(s, "http://")
	s = strings.TrimSuffix(s, "/")
	if !strings.Contains(s, ".") {
		s += ".tumblr.com"
	}
	return s
}

var (
	reTumblrPostUrl = regexp.MustCompile(`(?i)(?:tumblr\.com/[\w-]+/\d+|[\w-]+\.tumblr\.com/post/\d+|tmblr\.co/\w+)`)
	rePinModLink    = regexp.MustCompile(`(?i)(?:patreon\.com/(?:(?:cw|c)/)?(?:[\w.-]+/)?posts/|patreon\.com/file\?|simfileshare\.net/(?:download|folder)/\d+|simfil\.es/\w+|thesimsresource\.com/downloads/|boosty\.to/[\w.-]+/posts/|curseforge\.com/sims4/|modthesims\.info/(?:d|download)|[a-z0-9-]+\.itch\.io/[a-z0-9-]+|github\.com/[\w.-]+/[\w.-]+/releases|drive\.google\.com/(?:file/d/|drive/(?:u/\d+/)?folders/|open\?id=)|mediafire\.com/(?:file|view|download|folder)/|mega\.(?:co\.)?nz/(?:file|folder|#!)|dropbox\.com/(?:s|scl|sh)/|simsfinds\.com/downloads/\d+|tumblr\.com/[\w-]+/\d+|[\w-]+\.tumblr\.com/post/\d+|tmblr\.co/\w+|\.(?:package|ts4script|zip|rar|7z)(?:\?|$))`)
)

func isPriorityModLink(raw string) bool {
	low := strings.ToLower(strings.TrimSpace(raw))
	if low == "" || strings.Contains(low, "/donate") {
		return false
	}
	for _, kw := range []string{
		"simfileshare.net", "simfil.es", "patreon.com/posts", "patreon.com/file",
		"drive.google.com", "mediafire.com", "mega.nz", "mega.co.nz",
		"dropbox.com", "thesimsresource.com/downloads", ".itch.io/",
		"curseforge.com/sims4", "modthesims.info", "simsfinds.com/downloads",
	} {
		if strings.Contains(low, kw) {
			return true
		}
	}
	if strings.Contains(low, "boosty.to/") && strings.Contains(low, "/posts/") {
		return true
	}
	if strings.Contains(low, "patreon.com/") && strings.Contains(low, "/posts/") {
		return true
	}
	if reTumblrPostUrl.MatchString(low) {
		return true
	}
	return resolver.IsInstallable(low)
}

func isDownloadablePinLink(raw string) bool {
	raw = strings.TrimSpace(raw)
	if raw == "" || isIgnoredSocialLink(raw) {
		return false
	}
	if rePinModLink.MatchString(raw) || isPriorityModLink(raw) {
		return true
	}
	// Разрешаем сайты креаторов и блоги с CC/модами для Sims 4
	low := strings.ToLower(raw)
	return strings.Contains(low, "sims") || strings.Contains(low, "mod") || strings.Contains(low, "cc") ||
		strings.Contains(low, "blogspot.com") || strings.Contains(low, "wordpress.com") ||
		strings.Contains(low, "wixsite.com") || strings.Contains(low, "carrd.co") ||
		strings.Contains(low, "seoul-soul.com")
}

func isIgnoredSocialLink(raw string) bool {
	low := strings.ToLower(raw)
	for _, ig := range []string{
		"instagram.com", "twitter.com", "x.com", "youtube.com", "youtu.be",
		"tiktok.com", "discord.gg", "discord.com", "ko-fi.com", "paypal.com",
		"paypal.me", "buymeacoffee.com", "facebook.com", "vk.com", "vk.ru", "t.me",
		"tumblr.com/blog/view", "twitch.tv", "reddit.com",
	} {
		if strings.Contains(low, ig) {
			return true
		}
	}
	return false
}

func hasModLinks(links []string) bool {
	for _, l := range links {
		if isPriorityModLink(l) || resolver.IsInstallable(l) {
			return true
		}
	}
	return false
}

func extractHtmlLinks(body string) []string {
	re := regexp.MustCompile(`href=["']([^"']+)["']`)
	matches := re.FindAllStringSubmatch(body, -1)
	var priority []string
	var others []string
	seen := make(map[string]bool)

	for _, m := range matches {
		if len(m) > 1 {
			raw := resolver.DecodeOutboundRedirect(m[1])
			if strings.HasPrefix(raw, "http") && !seen[raw] && !isIgnoredSocialLink(raw) {
				seen[raw] = true
				if isPriorityModLink(raw) {
					priority = append(priority, raw)
				} else {
					others = append(others, raw)
				}
			}
		}
	}
	links := append(priority, others...)
	if len(links) > 8 {
		links = links[:8]
	}
	return links
}

func stripTags(s string) string {
	re := regexp.MustCompile(`<[^>]*>`)
	cleaned := re.ReplaceAllString(s, " ")
	cleaned = html.UnescapeString(cleaned)
	return strings.Join(strings.Fields(cleaned), " ")
}

func FetchTumblrFeed(source Source, start int) ([]DiscoverItem, error) {
	host := normalizeTumblrHost(source.Input)
	apiUrl := fmt.Sprintf("https://%s/api/read/json?num=50&start=%d", host, start)

	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", apiUrl, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if err != nil {
		return nil, err
	}

	raw := string(bodyBytes)
	firstBrace := strings.Index(raw, "{")
	lastBrace := strings.LastIndex(raw, "}")
	if firstBrace == -1 || lastBrace == -1 || lastBrace <= firstBrace {
		return nil, fmt.Errorf("неверный формат ответа Tumblr API")
	}

	jsonStr := raw[firstBrace : lastBrace+1]
	var payload struct {
		Tumblelog struct {
			Title string `json:"title"`
			Name  string `json:"name"`
		} `json:"tumblelog"`
		Posts []struct {
			Id           any    `json:"id"`
			Url          string `json:"url"`
			UrlWithSlug  string `json:"url-with-slug"`
			Type         string `json:"type"`
			DateGmt      string `json:"date-gmt"`
			RegularTitle string `json:"regular-title"`
			RegularBody  string `json:"regular-body"`
			PhotoCaption string `json:"photo-caption"`
			PhotoUrl1280 string `json:"photo-url-1280"`
			PhotoUrl500  string `json:"photo-url-500"`
			Photos       []struct {
				PhotoUrl1280 string `json:"photo-url-1280"`
			} `json:"photos"`
			Tags      []string `json:"tags"`
			NoteCount any      `json:"note-count"`
			Format    string   `json:"format"`
		} `json:"posts"`
	}

	if err := json.Unmarshal([]byte(jsonStr), &payload); err != nil {
		return nil, err
	}

	blogTitle := payload.Tumblelog.Title
	if blogTitle == "" {
		blogTitle = payload.Tumblelog.Name
	}
	if blogTitle == "" {
		blogTitle = source.Label
	}
	avatarUrl := fmt.Sprintf("https://api.tumblr.com/v2/blog/%s/avatar/512", host)

	var items []DiscoverItem
	for _, p := range payload.Posts {
		contentHtml := p.RegularBody
		if contentHtml == "" {
			contentHtml = p.PhotoCaption
		}

		title := p.RegularTitle
		summary := stripTags(contentHtml)
		if title == "" {
			if len(summary) > 60 {
				title = summary[:60] + "…"
			} else {
				title = summary
			}
		}
		if title == "" {
			title = "Tumblr Post"
		}

		images := resolver.ExtractTumblrHighResImages(contentHtml, p.PhotoUrl1280)
		for _, ph := range p.Photos {
			if ph.PhotoUrl1280 != "" {
				found := false
				for _, ex := range images {
					if ex == ph.PhotoUrl1280 {
						found = true
						break
					}
				}
				if !found {
					images = append(images, ph.PhotoUrl1280)
				}
			}
		}

		img := ""
		if len(images) > 0 {
			img = images[0]
		} else if p.PhotoUrl500 != "" {
			img = p.PhotoUrl500
		}

		candidateLinks := extractHtmlLinks(contentHtml)
		if !hasModLinks(candidateLinks) {
			continue // Пропускаем посты без ссылок на скачивание модов (эстетика, вопросы, скриншоты)
		}
		postUrl := p.UrlWithSlug
		if postUrl == "" {
			postUrl = p.Url
		}
		postIdStr := fmt.Sprintf("%v", p.Id)

		notesInt := 0
		if nf, ok := p.NoteCount.(float64); ok {
			notesInt = int(nf)
		} else if ns, ok := p.NoteCount.(string); ok {
			for _, r := range ns {
				if r >= '0' && r <= '9' {
					notesInt = notesInt*10 + int(r-'0')
				}
			}
		}

		items = append(items, DiscoverItem{
			Id:             fmt.Sprintf("tumblr:%s", postIdStr),
			SourceId:       source.Id,
			SourceLabel:    blogTitle,
			SourceType:     "tumblr",
			Title:          title,
			Author:         blogTitle,
			AvatarUrl:      avatarUrl,
			Summary:        summary,
			ImageUrl:       img,
			Images:         images,
			Url:            postUrl,
			PageUrl:        postUrl,
			Date:           p.DateGmt,
			PublishedAt:    p.DateGmt,
			CandidateLinks: candidateLinks,
			Links:          candidateLinks,
			Tags:           p.Tags,
			Notes:          notesInt,
		})
	}

	return items, nil
}

// ----------------- Pinterest Feed & Tag Search Scraper (No API Key) -----------------

type rawPinterestPin struct {
	Id          string         `json:"id"`
	Title       string         `json:"title"`
	GridTitle   string         `json:"grid_title"`
	Description string         `json:"description"`
	AltText     string         `json:"alt_text"`
	Link        string         `json:"link"`
	UtmLink     string         `json:"utm_link"`
	Domain      string         `json:"domain"`
	CreatedAt   string         `json:"created_at"`
	ReactionCnt map[string]int `json:"reaction_counts"`
	RichSummary struct {
		Url         string `json:"url"`
		DisplayName string `json:"display_name"`
	} `json:"rich_summary"`
	PinJoin struct {
		VisualAnnotation []string `json:"visual_annotation"`
	} `json:"pin_join"`
	Images struct {
		Orig struct {
			Url string `json:"url"`
		} `json:"orig"`
		Large struct {
			Url string `json:"url"`
		} `json:"736x"`
		Med struct {
			Url string `json:"url"`
		} `json:"474x"`
	} `json:"images"`
	Pinner struct {
		FullName       string `json:"full_name"`
		Username       string `json:"username"`
		ImageMediumUrl string `json:"image_medium_url"`
	} `json:"pinner"`
}

func convertPinterestPinToItem(p rawPinterestPin, fallbackSourceId, fallbackLabel string) (DiscoverItem, bool) {
	if p.Id == "" {
		return DiscoverItem{}, false
	}

	targetLink := strings.TrimSpace(p.Link)
	if targetLink == "" {
		targetLink = strings.TrimSpace(p.RichSummary.Url)
	}
	if targetLink == "" {
		targetLink = strings.TrimSpace(p.UtmLink)
	}
	targetLink = resolver.DecodeOutboundRedirect(targetLink)

	// Показываем только те пины, где есть скачиваемая ссылка на мод
	if !isDownloadablePinLink(targetLink) {
		return DiscoverItem{}, false
	}

	var images []string
	if p.Images.Large.Url != "" {
		images = append(images, p.Images.Large.Url)
	}
	if p.Images.Orig.Url != "" && p.Images.Orig.Url != p.Images.Large.Url {
		images = append(images, p.Images.Orig.Url)
	}
	if p.Images.Med.Url != "" && len(images) == 0 {
		images = append(images, p.Images.Med.Url)
	}
	if len(images) == 0 {
		return DiscoverItem{}, false
	}
	coverImg := images[0]

	title := strings.TrimSpace(p.Title)
	if title == "" {
		title = strings.TrimSpace(p.GridTitle)
	}
	if title == "" {
		title = strings.TrimSpace(p.RichSummary.DisplayName)
	}
	summary := strings.TrimSpace(p.Description)
	if summary == "" {
		summary = strings.TrimSpace(p.AltText)
	}
	if title == "" && summary != "" {
		if len([]rune(summary)) > 64 {
			title = string([]rune(summary)[:64]) + "…"
		} else {
			title = summary
		}
	}
	if title == "" {
		title = "Sims 4 CC Pin"
	}

	pinnerUser := strings.TrimSpace(p.Pinner.Username)
	author := strings.TrimSpace(p.Pinner.FullName)
	if author == "" {
		author = pinnerUser
	}
	if author == "" {
		author = fallbackLabel
	}
	if author == "" {
		author = "Pinterest"
	}

	srcId := fallbackSourceId
	if pinnerUser != "" && (srcId == "" || srcId == "pinterest-tag" || strings.HasPrefix(srcId, "builtin-")) {
		srcId = "pinterest:" + pinnerUser
	}

	dateStr := time.Now().UTC().Format(time.RFC3339)
	if p.CreatedAt != "" {
		if t, err := time.Parse(time.RFC1123Z, p.CreatedAt); err == nil {
			dateStr = t.UTC().Format(time.RFC3339)
		} else if t, err := time.Parse(time.RFC1123, p.CreatedAt); err == nil {
			dateStr = t.UTC().Format(time.RFC3339)
		}
	}

	notes := 0
	for _, cnt := range p.ReactionCnt {
		notes += cnt
	}

	var tags []string
	if p.Domain != "" {
		tags = append(tags, p.Domain)
	}
	for _, va := range p.PinJoin.VisualAnnotation {
		if va = strings.TrimSpace(va); va != "" && len(tags) < 6 {
			tags = append(tags, va)
		}
	}

	pinPageUrl := fmt.Sprintf("https://www.pinterest.com/pin/%s/", p.Id)

	return DiscoverItem{
		Id:             fmt.Sprintf("pinterest:%s", p.Id),
		SourceId:       srcId,
		SourceLabel:    author,
		SourceType:     "pinterest",
		Title:          title,
		Author:         author,
		AvatarUrl:      p.Pinner.ImageMediumUrl,
		Summary:        summary,
		ImageUrl:       coverImg,
		Images:         images,
		Url:            pinPageUrl,
		PageUrl:        targetLink,
		DownloadUrl:    targetLink,
		Date:           dateStr,
		PublishedAt:    dateStr,
		CandidateLinks: []string{targetLink},
		Links:          []string{targetLink},
		Tags:           tags,
		Notes:          notes,
	}, true
}

func fetchPinterestSearchPage(queryStr, bookmark string) ([]DiscoverItem, string, error) {
	optsMap := map[string]any{
		"query": queryStr,
		"scope": "pins",
		"rs":    "typed",
	}
	if bookmark != "" {
		optsMap["bookmarks"] = []string{bookmark}
	}
	dataJson, _ := json.Marshal(map[string]any{"options": optsMap})
	sourceUrl := "/search/pins/?q=" + url.QueryEscape(queryStr)
	apiUrl := fmt.Sprintf("https://www.pinterest.com/resource/BaseSearchResource/get/?data=%s&source_url=%s",
		url.QueryEscape(string(dataJson)),
		url.QueryEscape(sourceUrl),
	)

	client := &http.Client{Timeout: 14 * time.Second}
	req, err := http.NewRequest("GET", apiUrl, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json, text/javascript, */*, q=0.01")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	req.Header.Set("X-Pinterest-AppState", "active")
	req.Header.Set("X-Pinterest-PWS-Handler", "www/[username].js")
	req.Header.Set("Referer", "https://www.pinterest.com/")

	resp, err := client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	var payload struct {
		ResourceResponse struct {
			Data struct {
				Results []rawPinterestPin `json:"results"`
			} `json:"data"`
			Bookmark string `json:"bookmark"`
		} `json:"resource_response"`
		Resource struct {
			Options struct {
				Bookmarks []string `json:"bookmarks"`
			} `json:"options"`
		} `json:"resource"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, "", err
	}

	var items []DiscoverItem
	for _, p := range payload.ResourceResponse.Data.Results {
		if it, ok := convertPinterestPinToItem(p, "pinterest-tag", "Pinterest"); ok {
			items = append(items, it)
		}
	}

	nextBm := ""
	if len(payload.Resource.Options.Bookmarks) > 0 {
		nextBm = payload.Resource.Options.Bookmarks[0]
	} else if payload.ResourceResponse.Bookmark != "" {
		nextBm = payload.ResourceResponse.Bookmark
	}
	if nextBm == "-end-" || strings.HasPrefix(nextBm, "Y2JOb25lO") {
		nextBm = ""
	}

	return items, nextBm, nil
}

type PinterestTagFeedResult struct {
	Ok      bool              `json:"ok"`
	Items   []DiscoverItem    `json:"items"`
	Cursors map[string]string `json:"cursors"`
	HasMore bool              `json:"hasMore"`
	Error   string            `json:"error,omitempty"`
}

func FetchPinterestTagFeed(payload any) PinterestTagFeedResult {
	var opts struct {
		Tags    []string          `json:"tags"`
		Cursors map[string]string `json:"cursors"`
	}
	rawBytes, _ := json.Marshal(payload)
	_ = json.Unmarshal(rawBytes, &opts)

	tags := opts.Tags
	if len(tags) == 0 {
		tags = []string{"sims 4 cc patreon", "sims 4 cc download", "симс 4 моды", "sims 4 cc", "sims 4 mods", "sims 4 cc tumblr"}
	}
	if len(tags) > 8 {
		tags = tags[:8]
	}

	type searchJob struct {
		tagKey   string
		queryStr string
		bookmark string
	}
	var jobs []searchJob
	seenJob := make(map[string]bool)

	for _, rawTag := range tags {
		tg := strings.TrimSpace(strings.TrimPrefix(rawTag, "#"))
		if tg == "" {
			continue
		}
		bm := ""
		if opts.Cursors != nil {
			bm = opts.Cursors[tg]
			if opts.Cursors[tg] == "-exhausted-" {
				continue
			}
		}
		if !seenJob[tg+"|"+bm] {
			seenJob[tg+"|"+bm] = true
			jobs = append(jobs, searchJob{tagKey: tg, queryStr: tg, bookmark: bm})
		}
		// Если это первая страница общего тега (например "симс 4 моды" или "sims 4 cc"),
		// параллельно опрашиваем уточненный запрос с "patreon", чтобы гарантировать максимум скачиваемых ссылок!
		lowTg := strings.ToLower(tg)
		if bm == "" && !strings.Contains(lowTg, "patreon") && !strings.Contains(lowTg, "tumblr") && !strings.Contains(lowTg, "download") && !strings.Contains(lowTg, "simfileshare") {
			boostKey := tg + " patreon"
			if !seenJob[boostKey+"|"] {
				seenJob[boostKey+"|"] = true
				jobs = append(jobs, searchJob{tagKey: boostKey, queryStr: boostKey, bookmark: ""})
			}
		}
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	var allItems []DiscoverItem
	outCursors := make(map[string]string)
	hasMore := false

	for _, jb := range jobs {
		wg.Add(1)
		go func(j searchJob) {
			defer wg.Done()
			items, nextBm, err := fetchPinterestSearchPage(j.queryStr, j.bookmark)
			if err != nil {
				return
			}
			mu.Lock()
			allItems = append(allItems, items...)
			if nextBm != "" {
				outCursors[j.tagKey] = nextBm
				hasMore = true
			} else {
				outCursors[j.tagKey] = "-exhausted-"
			}
			mu.Unlock()
		}(jb)
	}
	wg.Wait()

	seen := make(map[string]bool)
	seenLink := make(map[string]bool)
	var deduped []DiscoverItem
	for _, it := range allItems {
		linkKey := strings.ToLower(it.DownloadUrl)
		if !seen[it.Id] && (linkKey == "" || !seenLink[linkKey]) {
			seen[it.Id] = true
			if linkKey != "" {
				seenLink[linkKey] = true
			}
			deduped = append(deduped, it)
		}
	}

	verified := verifyAndEnrichPinterestItems(deduped)

	return PinterestTagFeedResult{
		Ok:      true,
		Items:   verified,
		Cursors: outCursors,
		HasMore: hasMore,
	}
}

func verifyAndEnrichPinterestItems(items []DiscoverItem) []DiscoverItem {
	var verified []DiscoverItem
	var vMu sync.Mutex
	var vWg sync.WaitGroup
	sem := make(chan struct{}, 10)

	for _, it := range items {
		vWg.Add(1)
		go func(item DiscoverItem) {
			defer vWg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			target := item.DownloadUrl
			if target == "" {
				target = item.Url
			}
			if target == "" {
				return
			}

			if strings.Contains(target, "tmblr.co/") {
				target = resolver.UnshortenUrl(target)
			}

			r := resolver.ResolveLink(target)
			if r.Ok && (len(r.Downloads) > 0 || r.DirectUrl != "") {
				item.Downloads = r.Downloads
				if r.DirectUrl != "" {
					item.DownloadUrl = r.DirectUrl
				}
				if r.ImageUrl != "" && (item.ImageUrl == "" || strings.Contains(item.ImageUrl, "236x")) {
					item.ImageUrl = r.ImageUrl
				}
				if len(r.Images) > 0 {
					item.Images = r.Images
				}
				if r.Title != "" && item.Title == "Sims 4 CC Pin" {
					item.Title = r.Title
				}
				vMu.Lock()
				verified = append(verified, item)
				vMu.Unlock()
			} else if r.Locked {
				item.Locked = true
				if r.ImageUrl != "" && (item.ImageUrl == "" || strings.Contains(item.ImageUrl, "236x")) {
					item.ImageUrl = r.ImageUrl
				}
				if len(r.Images) > 0 {
					item.Images = r.Images
				}
				vMu.Lock()
				verified = append(verified, item)
				vMu.Unlock()
			}
			// Посты без файлов и ссылок (тизеры/пустышки) отсеиваются
		}(it)
	}
	vWg.Wait()

	sort.Slice(verified, func(i, j int) bool {
		return verified[i].Date > verified[j].Date
	})

	return verified
}

func FetchPinterestUserFeed(source Source, bookmark string) ([]DiscoverItem, string, error) {
	inp := strings.TrimSpace(source.Input)
	inp = strings.TrimPrefix(inp, "https://")
	inp = strings.TrimPrefix(inp, "http://")
	inp = strings.TrimPrefix(inp, "www.")
	inp = strings.TrimPrefix(inp, "pinterest.com/")
	inp = strings.TrimPrefix(inp, "pinterest.ru/")
	inp = strings.Trim(inp, "/")
	if idx := strings.Index(inp, "/"); idx != -1 {
		inp = inp[:idx]
	}
	if inp == "" {
		return nil, "", fmt.Errorf("некорректный аккаунт Pinterest")
	}

	optsMap := map[string]any{
		"is_own_profile_pins": false,
		"username":            inp,
		"field_set_key":       "grid_item",
		"pin_filter":          nil,
	}
	if bookmark != "" {
		optsMap["bookmarks"] = []string{bookmark}
	}
	dataJson, _ := json.Marshal(map[string]any{"options": optsMap})
	sourceUrl := fmt.Sprintf("/%s/pins/", url.PathEscape(inp))
	apiUrl := fmt.Sprintf("https://www.pinterest.com/resource/UserPinsResource/get/?data=%s&source_url=%s",
		url.QueryEscape(string(dataJson)),
		url.QueryEscape(sourceUrl),
	)

	client := &http.Client{Timeout: 14 * time.Second}
	req, err := http.NewRequest("GET", apiUrl, nil)
	if err == nil {
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
		req.Header.Set("Accept", "application/json, text/javascript, */*, q=0.01")
		req.Header.Set("X-Requested-With", "XMLHttpRequest")
		req.Header.Set("X-Pinterest-AppState", "active")
		req.Header.Set("X-Pinterest-PWS-Handler", "www/[username]/pins.js")
		req.Header.Set("Referer", "https://www.pinterest.com/")

		if resp, err := client.Do(req); err == nil {
			var payload struct {
				ResourceResponse struct {
					Data     []rawPinterestPin `json:"data"`
					Bookmark string            `json:"bookmark"`
				} `json:"resource_response"`
				Resource struct {
					Options struct {
						Bookmarks []string `json:"bookmarks"`
					} `json:"options"`
				} `json:"resource"`
			}
			_ = json.NewDecoder(resp.Body).Decode(&payload)
			resp.Body.Close()

			if len(payload.ResourceResponse.Data) > 0 {
				var items []DiscoverItem
				for _, p := range payload.ResourceResponse.Data {
					if it, ok := convertPinterestPinToItem(p, source.Id, source.Label); ok {
						items = append(items, it)
					}
				}
				nextBm := ""
				if len(payload.Resource.Options.Bookmarks) > 0 {
					nextBm = payload.Resource.Options.Bookmarks[0]
				} else if payload.ResourceResponse.Bookmark != "" {
					nextBm = payload.ResourceResponse.Bookmark
				}
				if nextBm == "-end-" || strings.HasPrefix(nextBm, "Y2JOb25lO") {
					nextBm = ""
				}
				// Если у пользователя на странице мало прямых ссылок, пробуем также поиск по его имени на Pinterest
				if len(items) == 0 && bookmark == "" {
					sItems, sBm, _ := fetchPinterestSearchPage(inp+" sims 4 cc", "")
					for i := range sItems {
						sItems[i].SourceId = source.Id
					}
					sItems = verifyAndEnrichPinterestItems(sItems)
					return sItems, sBm, nil
				}
				items = verifyAndEnrichPinterestItems(items)
				return items, nextBm, nil
			}
		}
	}

	sItems, sBm, err := fetchPinterestSearchPage(inp+" sims 4 cc", bookmark)
	for i := range sItems {
		sItems[i].SourceId = source.Id
	}
	sItems = verifyAndEnrichPinterestItems(sItems)
	return sItems, sBm, err
}

func FetchPinterestFeed(source Source) ([]DiscoverItem, error) {
	items, _, err := FetchPinterestUserFeed(source, "")
	return items, err
}

// ----------------- Boosty Feed Scraper -----------------

func normalizeBoostyBlog(input string) string {
	s := strings.TrimSpace(input)
	s = strings.TrimPrefix(s, "https://")
	s = strings.TrimPrefix(s, "http://")
	s = strings.TrimPrefix(s, "www.")
	s = strings.TrimPrefix(s, "boosty.to/")
	parts := strings.Split(strings.Trim(s, "/"), "/")
	if len(parts) > 0 {
		return parts[0]
	}
	return s
}

var reBoostyRawUrl = regexp.MustCompile(`https?://[^\s"'<>]+`)

func decodeBoostyText(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(raw, "[") {
		var arr []any
		if json.Unmarshal([]byte(raw), &arr) == nil && len(arr) > 0 {
			if s, ok := arr[0].(string); ok {
				return strings.TrimSpace(s)
			}
		}
		return ""
	}
	return raw
}

func resizeBoostyThumb(imgUrl string) string {
	if !strings.Contains(imgUrl, "images.boosty.to") || strings.Contains(imgUrl, "mw=") {
		return imgUrl
	}
	if strings.Contains(imgUrl, "?") {
		return imgUrl + "&mw=600"
	}
	return imgUrl + "?mw=600"
}

func FetchBoostyFeed(source Source, offset string) ([]DiscoverItem, string, error) {
	blog := normalizeBoostyBlog(source.Input)
	if blog == "" {
		return nil, "", fmt.Errorf("некорректное имя блога Boosty")
	}

	apiUrl := fmt.Sprintf("https://api.boosty.to/v1/blog/%s/post/?limit=20", url.QueryEscape(blog))
	if offset != "" {
		apiUrl += "&offset=" + url.QueryEscape(offset)
	}

	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", apiUrl, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	var payload struct {
		Data []struct {
			Id          string `json:"id"`
			Title       string `json:"title"`
			CreatedAt   int64  `json:"createdAt"`
			HasAccess   bool   `json:"hasAccess"`
			SignedQuery string `json:"signedQuery"`
			Count       struct {
				Likes     int            `json:"likes"`
				Comments  int            `json:"comments"`
				Reactions map[string]int `json:"reactions"`
			} `json:"count"`
			User struct {
				Name      string `json:"name"`
				AvatarUrl string `json:"avatarUrl"`
			} `json:"user"`
			Teaser []struct {
				Type    string `json:"type"`
				Url     string `json:"url"`
				Content string `json:"content"`
			} `json:"teaser"`
			Data []struct {
				Type    string `json:"type"`
				Url     string `json:"url"`
				Title   string `json:"title"`
				Content string `json:"content"`
			} `json:"data"`
			Tags []struct {
				Title string `json:"title"`
			} `json:"tags"`
		} `json:"data"`
		Extra struct {
			Offset string `json:"offset"`
			IsLast bool   `json:"isLast"`
		} `json:"extra"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, "", err
	}

	srcId := source.Id
	if srcId == "" || strings.HasPrefix(srcId, "builtin-") {
		srcId = "boosty:" + strings.ToLower(blog)
	}

	var items []DiscoverItem
	for _, p := range payload.Data {
		var images []string
		seenImg := make(map[string]bool)
		var downloads []resolver.DownloadFile
		seenDl := make(map[string]bool)
		var candidateLinks []string
		seenLink := make(map[string]bool)
		var textParts []string
		hasUnsignedFile := false

		postUrl := fmt.Sprintf("https://boosty.to/%s/posts/%s", blog, p.Id)

		addBoostyCandLink := func(raw string) {
			u := resolver.DecodeOutboundRedirect(strings.TrimRight(strings.TrimSpace(raw), ".,);\"'"))
			if u == "" || seenLink[u] || strings.EqualFold(u, postUrl) {
				return
			}
			if isPriorityModLink(u) && !isIgnoredSocialLink(u) {
				seenLink[u] = true
				candidateLinks = append(candidateLinks, u)
			}
		}

		for _, b := range p.Data {
			switch b.Type {
			case "image":
				if b.Url != "" && !seenImg[b.Url] {
					seenImg[b.Url] = true
					images = append(images, b.Url)
				}
			case "file":
				if b.Url != "" && resolver.IsInstallable(b.Title) {
					// Прямые файлы cdn.boosty.to/file/ без signedQuery требуют входа в аккаунт на сайте Boosty (HTTP 403)
					if strings.Contains(b.Url, "cdn.boosty.to/file/") && p.SignedQuery == "" {
						hasUnsignedFile = true
						continue
					}
					dlUrl := b.Url
					if p.SignedQuery != "" {
						if strings.Contains(dlUrl, "?") {
							dlUrl += "&" + strings.TrimPrefix(p.SignedQuery, "?")
						} else {
							dlUrl += "?" + strings.TrimPrefix(p.SignedQuery, "?")
						}
					}
					if !seenDl[dlUrl] {
						seenDl[dlUrl] = true
						downloads = append(downloads, resolver.DownloadFile{
							Name: b.Title,
							Url:  dlUrl,
							Via:  "boosty",
						})
					}
				}
			case "link":
				if b.Url != "" {
					addBoostyCandLink(b.Url)
				}
			case "text":
				txt := decodeBoostyText(b.Content)
				if txt != "" {
					textParts = append(textParts, txt)
					for _, rawLink := range reBoostyRawUrl.FindAllString(txt, -1) {
						addBoostyCandLink(rawLink)
					}
				}
			}
		}

		for _, t := range p.Teaser {
			if t.Type == "image" && t.Url != "" && !seenImg[t.Url] {
				seenImg[t.Url] = true
				images = append(images, t.Url)
			} else if t.Type == "text" && len(textParts) == 0 {
				if txt := decodeBoostyText(t.Content); txt != "" {
					textParts = append(textParts, txt)
				}
			}
		}

		// Пропускаем чисто текстовые сервисные объявления без картинок и без вложений/ссылок
		if len(images) == 0 && len(downloads) == 0 && len(candidateLinks) == 0 {
			continue
		}
		// Если пост открытый, но в нем нет ни скачиваемых ссылок, ни файлов вообще — это просто текстовый анонс/скриншот
		if p.HasAccess && len(downloads) == 0 && len(candidateLinks) == 0 && !hasUnsignedFile {
			continue
		}

		coverImg := ""
		if len(images) > 0 {
			coverImg = resizeBoostyThumb(images[0])
		} else if p.User.AvatarUrl != "" {
			coverImg = p.User.AvatarUrl
		}

		author := p.User.Name
		if author == "" {
			author = source.Label
		}
		if author == "" {
			author = blog
		}

		title := strings.TrimSpace(p.Title)
		if title == "" && len(textParts) > 0 {
			firstLine := textParts[0]
			if len([]rune(firstLine)) > 60 {
				firstLine = string([]rune(firstLine)[:60]) + "…"
			}
			title = firstLine
		}
		if title == "" {
			title = fmt.Sprintf("Boosty · %s", author)
		}

		summary := strings.TrimSpace(strings.Join(textParts, " · "))
		if len([]rune(summary)) > 240 {
			summary = string([]rune(summary)[:240]) + "…"
		}

		var tags []string
		for _, tg := range p.Tags {
			if tg.Title != "" {
				tags = append(tags, tg.Title)
			}
		}

		notes := p.Count.Likes
		for _, rCnt := range p.Count.Reactions {
			notes += rCnt
		}

		dateStr := time.Unix(p.CreatedAt, 0).UTC().Format(time.RFC3339)
		// Если в посте нет внешних ссылок (SFS/Mega/GDrive/Patreon), а файл лежит только на закрытом CDN Boosty без подписи,
		// помечаем его как требующий открытия на Boosty, чтобы кнопка не выдавала ошибку 403.
		isLocked := !p.HasAccess || (len(downloads) == 0 && len(candidateLinks) == 0)

		items = append(items, DiscoverItem{
			Id:             fmt.Sprintf("boosty:%s:%s", blog, p.Id),
			SourceId:       srcId,
			SourceLabel:    author,
			SourceType:     "boosty",
			Title:          title,
			Author:         author,
			AvatarUrl:      p.User.AvatarUrl,
			Summary:        summary,
			ImageUrl:       coverImg,
			Images:         images,
			Url:            postUrl,
			PageUrl:        postUrl,
			Date:           dateStr,
			PublishedAt:    dateStr,
			Notes:          notes,
			Locked:         isLocked,
			Downloads:      downloads,
			CandidateLinks: candidateLinks,
			Links:          candidateLinks,
			Tags:           tags,
		})
	}

	nextOffset := ""
	if !payload.Extra.IsLast && payload.Extra.Offset != "" {
		nextOffset = payload.Extra.Offset
	}
	return items, nextOffset, nil
}

// ----------------- ModTheSims Feed Scraper -----------------

func FetchMtsFeedAdvanced(page int, sort string, cat int) ([]DiscoverItem, int, error) {
	return FetchMtsCreatorFeed(page, sort, cat, "")
}

func FetchMtsCreatorFeed(page int, sort string, cat int, creator string) ([]DiscoverItem, int, error) {
	if page < 1 {
		page = 1
	}
	sortParam := ""
	if sort != "" && sort != "new" {
		sortParam = "&t=" + sort
	}
	catParam := ""
	if cat > 0 {
		catParam = fmt.Sprintf("&f=%d", cat)
	}
	creatorParam := ""
	if strings.TrimSpace(creator) != "" {
		creatorParam = "&u=0&creator=" + url.QueryEscape(strings.TrimSpace(creator))
	}

	reqUrl := fmt.Sprintf("https://modthesims.info/downloads.php?showType=1&gs=4&p=%d%s%s%s", page, sortParam, catParam, creatorParam)
	req, err := http.NewRequest("GET", reqUrl, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, err
	}
	htmlContent := string(body)

	reCard := regexp.MustCompile(`class="smol-card-component"`)
	parts := reCard.Split(htmlContent, -1)
	if len(parts) <= 1 {
		return nil, 0, nil
	}

	reTitle := regexp.MustCompile(`class="downloadtitle[^"]*"[\s\S]*?<a\s+href=['"]([^'"]+)['"][^>]*>([^<]+)</a>`)
	reImg := regexp.MustCompile(`(?:class="featuredimage"|class="thumbnailwrapper")[\s\S]*?<img[^>]+src=['"]([^'"]+)['"]`)
	reAuthor := regexp.MustCompile(`class="downloadcreatorname"[\s\S]*?<a[^>]*>([^<]+)</a>`)
	reUpdated := regexp.MustCompile(`updated\s+(\d{1,2}\s+\w+\s+\d{4})`)

	var items []DiscoverItem

	for _, card := range parts[1:] {
		mTitle := reTitle.FindStringSubmatch(card)
		if len(mTitle) < 3 {
			continue
		}
		link := mTitle[1]
		title := strings.TrimSpace(html.UnescapeString(mTitle[2]))

		imgUrl := ""
		if mImg := reImg.FindStringSubmatch(card); len(mImg) > 1 {
			imgUrl = mImg[1]
			if strings.HasPrefix(imgUrl, "//") {
				imgUrl = "https:" + imgUrl
			}
		}

		author := "ModTheSims"
		if mAuthor := reAuthor.FindStringSubmatch(card); len(mAuthor) > 1 {
			author = strings.TrimSpace(html.UnescapeString(mAuthor[1]))
		} else if creator != "" {
			author = creator
		}

		fullUrl := link
		if !strings.HasPrefix(fullUrl, "http") {
			fullUrl = "https://modthesims.info" + fullUrl
		}

		dateStr := time.Now().UTC().Format(time.RFC3339)
		if mDate := reUpdated.FindStringSubmatch(card); len(mDate) > 1 {
			if t, err := time.Parse("2 Jan 2006", mDate[1]); err == nil {
				dateStr = t.UTC().Format(time.RFC3339)
			}
		}

		srcId := "builtin-mts"
		if author != "" && author != "ModTheSims" {
			srcId = "mts:" + author
		}

		items = append(items, DiscoverItem{
			Id:          fmt.Sprintf("mts:%s", link),
			SourceId:    srcId,
			SourceLabel: author,
			SourceType:  "modthesims",
			Title:       title,
			Author:      author,
			Summary:     "The Sims 4 Mod",
			ImageUrl:    imgUrl,
			DownloadUrl: fullUrl,
			Url:         fullUrl,
			PageUrl:     fullUrl,
			Date:        dateStr,
			PublishedAt: dateStr,
			ContentType: "CC",
		})
	}

	nextPage := 0
	if len(items) >= 12 && sort != "popular" {
		nextPage = page + 1
	}

	return items, nextPage, nil
}

func FetchMtsFeed() []DiscoverItem {
	items, _, _ := FetchMtsFeedAdvanced(1, "new", 0)
	return items
}

// ----------------- Детали постов и модальные окна -----------------

type MtsDetailResult struct {
	Ok        bool                    `json:"ok"`
	Downloads []resolver.DownloadFile `json:"downloads"`
	Images    []string                `json:"images"`
}

func GetMtsDetail(pageUrl string) MtsDetailResult {
	res := resolver.ResolveModTheSims(pageUrl)
	images := res.Images
	if len(images) == 0 && res.ImageUrl != "" {
		images = []string{res.ImageUrl}
	}
	return MtsDetailResult{
		Ok:        true,
		Downloads: res.Downloads,
		Images:    images,
	}
}

type TumblrDetailResult struct {
	Ok        bool                    `json:"ok"`
	Downloads []resolver.DownloadFile `json:"downloads"`
	Images    []string                `json:"images,omitempty"`
}

func GetTumblrDetail(links any) TumblrDetailResult {
	var list []string
	if arr, ok := links.([]any); ok {
		for _, it := range arr {
			if s, ok := it.(string); ok && s != "" {
				list = append(list, s)
			}
		}
	} else if arrStr, ok := links.([]string); ok {
		list = arrStr
	}

	var downloads []resolver.DownloadFile
	var images []string
	seen := make(map[string]bool)
	seenImg := make(map[string]bool)

	for _, l := range list {
		res := resolver.ResolveLink(l)
		if res.Ok {
			for _, d := range res.Downloads {
				if !seen[d.Url] {
					seen[d.Url] = true
					downloads = append(downloads, d)
				}
			}
			for _, img := range res.Images {
				if img != "" && !seenImg[img] {
					seenImg[img] = true
					images = append(images, img)
				}
			}
		}
	}

	return TumblrDetailResult{Ok: true, Downloads: downloads, Images: images}
}

// ----------------- Tumblr Tag Feed (v2 API) -----------------

func FetchTumblrTagFeed(payload any) TumblrTagFeedResult {
	var opts struct {
		Tags    []string         `json:"tags"`
		Cursors map[string]int64 `json:"cursors"`
	}
	rawBytes, _ := json.Marshal(payload)
	_ = json.Unmarshal(rawBytes, &opts)

	tags := opts.Tags
	if len(tags) == 0 {
		tags = []string{"sims 4 cc", "ts4cc", "sims 4 cc finds", "sims 4 custom content"}
	}
	if len(tags) > 8 {
		tags = tags[:8]
	}

	cfg := config.ReadConfig()
	apiKey := cfg.TumblrApiKey
	if apiKey == "" {
		apiKey = "FjJOWvdFDVZHNJyq8PoZQiSCL6aIhR0vMfXXdIfyU9NyL4ysU6"
	}

	client := &http.Client{Timeout: 15 * time.Second}
	var wg sync.WaitGroup
	var mu sync.Mutex

	var allItems []DiscoverItem
	outCursors := make(map[string]int64)
	hasMore := false

	for _, t := range tags {
		tag := strings.TrimSpace(strings.TrimPrefix(t, "#"))
		if tag == "" {
			continue
		}
		before := opts.Cursors[tag]

		wg.Add(1)
		go func(tg string, cur int64) {
			defer wg.Done()

			apiUrl := fmt.Sprintf("https://api.tumblr.com/v2/tagged?tag=%s&api_key=%s&limit=20", url.QueryEscape(tg), apiKey)
			if cur > 0 {
				apiUrl += fmt.Sprintf("&before=%d", cur)
			}

			req, err := http.NewRequest("GET", apiUrl, nil)
			if err != nil {
				return
			}
			req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
			req.Header.Set("Accept", "application/json")

			resp, err := client.Do(req)
			if err != nil {
				return
			}
			defer resp.Body.Close()

			var tResp struct {
				Response []struct {
					IdString string `json:"id_string"`
					BlogName string `json:"blog_name"`
					PostUrl  string `json:"post_url"`
					Title    string `json:"title"`
					Summary  string `json:"summary"`
					Body     string `json:"body"`
					Caption  string `json:"caption"`
					Photos   []struct {
						OriginalSize struct {
							Url string `json:"url"`
						} `json:"original_size"`
					} `json:"photos"`
					Timestamp int64    `json:"timestamp"`
					NoteCount int      `json:"note_count"`
					Tags      []string `json:"tags"`
					Trail     []struct {
						Blog struct {
							Name string `json:"name"`
						} `json:"blog"`
						Post struct {
							Id string `json:"id"`
						} `json:"post"`
					} `json:"trail"`
				} `json:"response"`
			}

			if err := json.NewDecoder(resp.Body).Decode(&tResp); err != nil {
				return
			}

			var tagItems []DiscoverItem
			var oldest int64 = 0

			for _, p := range tResp.Response {
				blog := p.BlogName
				postId := p.IdString
				if len(p.Trail) > 0 && p.Trail[0].Blog.Name != "" {
					blog = p.Trail[0].Blog.Name
					if p.Trail[0].Post.Id != "" {
						postId = p.Trail[0].Post.Id
					}
				}

				id := fmt.Sprintf("tumblr:%s:%s", blog, postId)
				contentHtml := p.Body
				if contentHtml == "" {
					contentHtml = p.Caption
				}

				title := p.Title
				summary := stripTags(contentHtml)
				if title == "" {
					if p.Summary != "" {
						title = p.Summary
					} else if len(summary) > 60 {
						title = summary[:60] + "…"
					} else if summary != "" {
						title = summary
					} else {
						title = "Untitled post"
					}
				}

				firstPhoto := ""
				if len(p.Photos) > 0 && p.Photos[0].OriginalSize.Url != "" {
					firstPhoto = p.Photos[0].OriginalSize.Url
				}
				images := resolver.ExtractTumblrHighResImages(contentHtml, firstPhoto)
				for _, ph := range p.Photos {
					if ph.OriginalSize.Url != "" {
						found := false
						for _, ex := range images {
							if ex == ph.OriginalSize.Url {
								found = true
								break
							}
						}
						if !found {
							images = append(images, ph.OriginalSize.Url)
						}
					}
				}

				imgUrl := ""
				if len(images) > 0 {
					imgUrl = images[0]
				}

				candidateLinks := extractHtmlLinks(contentHtml)
				if !hasModLinks(candidateLinks) {
					continue // Пропускаем посты без ссылок на моды
				}
				dateStr := time.Unix(p.Timestamp, 0).UTC().Format(time.RFC3339)

				if oldest == 0 || (p.Timestamp > 0 && p.Timestamp < oldest) {
					oldest = p.Timestamp
				}

				tagItems = append(tagItems, DiscoverItem{
					Id:             id,
					SourceId:       "tumblr:" + blog,
					SourceLabel:    blog,
					SourceType:     "tumblr",
					Title:          title,
					Author:         blog,
					AvatarUrl:      fmt.Sprintf("https://api.tumblr.com/v2/blog/%s.tumblr.com/avatar/512", blog),
					Summary:        summary,
					ImageUrl:       imgUrl,
					Images:         images,
					Url:            p.PostUrl,
					PageUrl:        p.PostUrl,
					Date:           dateStr,
					PublishedAt:    dateStr,
					CandidateLinks: candidateLinks,
					Links:          candidateLinks,
					Tags:           p.Tags,
					Notes:          p.NoteCount,
					Reblog:         false,
				})
			}

			mu.Lock()
			allItems = append(allItems, tagItems...)
			if len(tResp.Response) >= 10 && oldest > 0 {
				outCursors[tg] = oldest
				hasMore = true
			} else {
				outCursors[tg] = 0
			}
			mu.Unlock()
		}(tag, before)
	}

	wg.Wait()

	seen := make(map[string]bool)
	var deduped []DiscoverItem
	for _, it := range allItems {
		if !seen[it.Id] {
			seen[it.Id] = true
			deduped = append(deduped, it)
		}
	}

	sort.Slice(deduped, func(i, j int) bool {
		return deduped[i].Date > deduped[j].Date
	})

	return TumblrTagFeedResult{
		Ok:      true,
		Items:   deduped,
		Cursors: outCursors,
		HasMore: hasMore,
	}
}

// ----------------- The Sims Resource (TSR), Itch.io & GitHub Feeds -----------------

var reTsrDataItem = regexp.MustCompile(`class="item-wrapper"\s+data-item="([^"]+)"`)

func parseTsrCardsFromHtml(htmlContent, sourceId, sourceLabel string) []DiscoverItem {
	matches := reTsrDataItem.FindAllStringSubmatch(htmlContent, -1)
	if len(matches) == 0 {
		return nil
	}

	var items []DiscoverItem
	seen := make(map[string]bool)

	for _, m := range matches {
		rawJson := html.UnescapeString(m[1])
		var card struct {
			ID              string `json:"ID"`
			Title           string `json:"title"`
			Description     string `json:"description"`
			Creator         string `json:"creator"`
			PublishDate     string `json:"publishDate"`
			LastUpdated     string `json:"lastUpdated"`
			FileSize        string `json:"FileSize_nice"`
			Downloads       string `json:"downloads"`
			Keywords        string `json:"keywords"`
			PrimaryCategory string `json:"PrimaryCategory"`
			Type            string `json:"type"`
			ImageArr        string `json:"imageArr"`
			Avatar          struct {
				Src string `json:"src"`
			} `json:"avatar"`
		}
		if err := json.Unmarshal([]byte(rawJson), &card); err != nil || card.ID == "" {
			continue
		}
		itemId := "tsr:" + card.ID
		if seen[itemId] {
			continue
		}
		seen[itemId] = true

		var images []string
		coverImg := ""
		if card.ImageArr != "" {
			parts := strings.Split(card.ImageArr, ",")
			for idx, p := range parts {
				sub := strings.Split(p, ":")
				if len(sub) > 0 && len(sub[0]) > 3 {
					imgId := sub[0]
					prefix := imgId[:len(imgId)-3]
					medUrl := fmt.Sprintf("https://www.thesimsresource.com/scaled/%s/w-600h-450-%s.jpg", prefix, imgId)
					hiUrl := fmt.Sprintf("https://www.thesimsresource.com/scaled/%s/w-800h-600-%s.jpg", prefix, imgId)
					smUrl := fmt.Sprintf("https://www.thesimsresource.com/scaled/%s/w-293h-220-%s.jpg", prefix, imgId)
					if idx == 0 {
						coverImg = medUrl
						images = append(images, hiUrl, medUrl, smUrl)
					} else {
						images = append(images, hiUrl)
					}
				}
			}
		}

		avatarUrl := ""
		if card.Avatar.Src != "" {
			avatarUrl = card.Avatar.Src
			if strings.HasPrefix(avatarUrl, "/") {
				avatarUrl = "https://www.thesimsresource.com" + avatarUrl
			}
		}
		if coverImg == "" && avatarUrl != "" {
			coverImg = avatarUrl
		}

		dateStr := time.Now().UTC().Format(time.RFC3339)
		tsStr := card.PublishDate
		if tsStr == "" || tsStr == "0" {
			tsStr = card.LastUpdated
		}
		if tsStr != "" && tsStr != "0" {
			var unixSec int64
			if _, err := fmt.Sscanf(tsStr, "%d", &unixSec); err == nil && unixSec > 0 {
				dateStr = time.Unix(unixSec, 0).UTC().Format(time.RFC3339)
			}
		}

		dlCount := 0
		if card.Downloads != "" {
			_, _ = fmt.Sscanf(card.Downloads, "%d", &dlCount)
		}

		var tags []string
		if card.PrimaryCategory != "" {
			tags = append(tags, card.PrimaryCategory)
		}
		if card.Type != "" {
			tags = append(tags, card.Type)
		}
		if card.Keywords != "" {
			for _, kw := range strings.Split(card.Keywords, ",") {
				if kw = strings.TrimSpace(kw); kw != "" {
					tags = append(tags, kw)
				}
			}
		}

		pageUrl := fmt.Sprintf("https://www.thesimsresource.com/downloads/%s", card.ID)
		author := card.Creator
		if author == "" {
			author = sourceLabel
		}
		summary := strings.TrimSpace(card.Description)
		if summary == "" && card.FileSize != "" {
			summary = "The Sims 4 CC · " + card.FileSize
		}

		itemSourceId := sourceId
		itemSourceLabel := sourceLabel
		if (itemSourceId == "" || itemSourceId == "builtin-tsr") && author != "" {
			itemSourceId = "tsr:" + author
			itemSourceLabel = author
		}

		items = append(items, DiscoverItem{
			Id:          itemId,
			SourceId:    itemSourceId,
			SourceLabel: itemSourceLabel,
			SourceType:  "tsr",
			Title:       card.Title,
			Author:      author,
			AvatarUrl:   avatarUrl,
			Summary:     summary,
			ImageUrl:    coverImg,
			Images:      images,
			DownloadUrl: pageUrl,
			Url:         pageUrl,
			PageUrl:     pageUrl,
			Date:        dateStr,
			PublishedAt: dateStr,
			Notes:       dlCount,
			Tags:        tags,
			ContentType: "CC",
		})
	}
	return items
}

func FetchTsrFeedAdvanced(page int, creator string) ([]DiscoverItem, int, error) {
	return FetchTsrFeedFiltered(page, creator, "", "")
}

func FetchTsrFeedFiltered(page int, creator string, sortBy string, cat string) ([]DiscoverItem, int, error) {
	if page < 1 {
		page = 1
	}
	cnt := (page - 1) * 23

	var urlsToTry []string
	sourceId := "builtin-tsr"
	sourceLabel := "The Sims Resource"

	catSlug := "sims4"
	switch strings.ToLower(strings.TrimSpace(cat)) {
	case "hair":
		catSlug = "sims4-hair"
	case "clothing":
		catSlug = "sims4-clothing"
	case "makeup":
		catSlug = "sims4-makeup"
	case "accessories":
		catSlug = "sims4-accessories"
	case "build", "objects":
		catSlug = "sims4-objects"
	case "sets", "cas":
		catSlug = "sims4-sets"
	}

	sortSegment := ""
	if sortBy == "popular" {
		sortSegment = "sort/popular/"
	}

	cleanCreator := strings.TrimSpace(creator)
	if cleanCreator != "" {
		cleanCreator = strings.TrimPrefix(cleanCreator, "https://")
		cleanCreator = strings.TrimPrefix(cleanCreator, "http://")
		cleanCreator = strings.TrimPrefix(cleanCreator, "www.")
		cleanCreator = strings.TrimPrefix(cleanCreator, "thesimsresource.com/")
		cleanCreator = strings.TrimPrefix(cleanCreator, "artists/")
		cleanCreator = strings.TrimPrefix(cleanCreator, "members/")
		if idx := strings.Index(cleanCreator, "/"); idx != -1 {
			cleanCreator = cleanCreator[:idx]
		}
		sourceLabel = cleanCreator
		if page == 1 {
			urlsToTry = []string{
				fmt.Sprintf("https://www.thesimsresource.com/artists/%s/downloads/browse/category/%s/skipsetitems/1/%s", url.PathEscape(cleanCreator), catSlug, sortSegment),
				fmt.Sprintf("https://www.thesimsresource.com/members/%s/downloads/browse/category/%s/skipsetitems/1/%s", url.PathEscape(cleanCreator), catSlug, sortSegment),
			}
		} else {
			urlsToTry = []string{
				fmt.Sprintf("https://www.thesimsresource.com/artists/%s/downloads/browse/category/%s/skipsetitems/1/%spage/%d/cnt/%d/", url.PathEscape(cleanCreator), catSlug, sortSegment, page, cnt),
				fmt.Sprintf("https://www.thesimsresource.com/members/%s/downloads/browse/category/%s/skipsetitems/1/%spage/%d/cnt/%d/", url.PathEscape(cleanCreator), catSlug, sortSegment, page, cnt),
			}
		}
	} else {
		if page == 1 {
			urlsToTry = []string{fmt.Sprintf("https://www.thesimsresource.com/downloads/browse/category/%s/skipsetitems/1/%s", catSlug, sortSegment)}
		} else {
			urlsToTry = []string{fmt.Sprintf("https://www.thesimsresource.com/downloads/browse/category/%s/skipsetitems/1/%spage/%d/cnt/%d/", catSlug, sortSegment, page, cnt)}
		}
	}

	client := &http.Client{Timeout: 15 * time.Second}
	for _, targetUrl := range urlsToTry {
		req, err := http.NewRequest("GET", targetUrl, nil)
		if err != nil {
			continue
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
		resp, err := client.Do(req)
		if err != nil {
			continue
		}
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
		resp.Body.Close()

		items := parseTsrCardsFromHtml(string(body), sourceId, sourceLabel)
		if len(items) > 0 {
			nextPage := 0
			if len(items) >= 15 {
				nextPage = page + 1
			}
			return items, nextPage, nil
		}
	}

	return nil, 0, nil
}

func FetchTsrSourceFeed(source Source, page int) ([]DiscoverItem, int, error) {
	items, nextPg, err := FetchTsrFeedAdvanced(page, source.Input)
	for i := range items {
		items[i].SourceId = source.Id
		if source.Label != "" {
			items[i].SourceLabel = source.Label
		}
	}
	return items, nextPg, err
}

var (
	reItchGameId    = regexp.MustCompile(`<div[^>]+data-game_id="(\d+)"[^>]*>`)
	reItchTitleLink = regexp.MustCompile(`class="[^"]*game_title[^"]*"[^>]*>\s*<a([^>]*)>([^<]+)</a>`)
	reItchHref      = regexp.MustCompile(`href="([^"]+)"`)
	reItchThumb     = regexp.MustCompile(`data-lazy_src="([^"]+)"|<img[^>]+src="([^"]+)"`)
	reItchText      = regexp.MustCompile(`class="[^"]*game_text[^"]*"[^>]*>([^<]+)</div>`)
	reItchAuthor    = regexp.MustCompile(`class="[^"]*game_author[^"]*"[^>]*>.*?<a[^>]*>([^<]+)</a>`)
)

func extractItchCreatorFromUrl(gameUrl string) string {
	u, err := url.Parse(gameUrl)
	if err != nil || u.Host == "" {
		return ""
	}
	host := strings.ToLower(u.Host)
	if strings.HasSuffix(host, ".itch.io") {
		return strings.TrimSuffix(host, ".itch.io")
	}
	return ""
}

func FetchItchFeed(source Source) ([]DiscoverItem, error) {
	inp := strings.TrimSpace(source.Input)
	if inp == "" {
		return nil, fmt.Errorf("пустой источник Itch.io")
	}

	targetUrl := inp
	if !strings.HasPrefix(targetUrl, "http://") && !strings.HasPrefix(targetUrl, "https://") {
		slug := strings.TrimSuffix(inp, ".itch.io")
		targetUrl = fmt.Sprintf("https://%s.itch.io/", slug)
	}

	req, err := http.NewRequest("GET", targetUrl, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	htmlStr := string(body)

	var items []DiscoverItem
	locMatches := reItchGameId.FindAllStringSubmatchIndex(htmlStr, -1)
	if len(locMatches) == 0 {
		return nil, nil
	}

	for idx, loc := range locMatches {
		gameId := htmlStr[loc[2]:loc[3]]
		start := loc[0]
		end := start + 3200
		if idx+1 < len(locMatches) && locMatches[idx+1][0] < end {
			end = locMatches[idx+1][0]
		}
		if end > len(htmlStr) {
			end = len(htmlStr)
		}
		block := htmlStr[start:end]

		mTitle := reItchTitleLink.FindStringSubmatch(block)
		if len(mTitle) < 3 {
			continue
		}
		aAttrs := mTitle[1]
		title := strings.TrimSpace(html.UnescapeString(mTitle[2]))
		mHref := reItchHref.FindStringSubmatch(aAttrs)
		if len(mHref) < 2 {
			continue
		}
		gameUrl := strings.TrimSpace(mHref[1])

		imgUrl := ""
		if mImg := reItchThumb.FindStringSubmatch(block); len(mImg) > 0 {
			if mImg[1] != "" {
				imgUrl = html.UnescapeString(mImg[1])
			} else if len(mImg) > 2 {
				imgUrl = html.UnescapeString(mImg[2])
			}
		}

		summary := "The Sims 4 Mod (Itch.io)"
		if mText := reItchText.FindStringSubmatch(block); len(mText) > 1 {
			summary = strings.TrimSpace(html.UnescapeString(mText[1]))
		}

		creatorSlug := extractItchCreatorFromUrl(gameUrl)
		author := source.Label
		if mAuth := reItchAuthor.FindStringSubmatch(block); len(mAuth) > 1 {
			author = strings.TrimSpace(html.UnescapeString(mAuth[1]))
		}
		if (author == "" || author == "Itch.io · Sims 4") && creatorSlug != "" {
			author = creatorSlug
		}
		if author == "" {
			author = inp
		}

		itemSourceId := source.Id
		itemSourceLabel := source.Label
		if itemSourceId == "" || itemSourceId == "builtin-itch" {
			if creatorSlug != "" {
				itemSourceId = "itch:" + creatorSlug
				itemSourceLabel = author
			}
		}

		itemDate := time.Now().UTC().Add(-time.Duration(idx) * time.Minute).Format(time.RFC3339)

		var images []string
		if imgUrl != "" {
			images = []string{imgUrl}
		}

		items = append(items, DiscoverItem{
			Id:          fmt.Sprintf("itch:%s", gameId),
			SourceId:    itemSourceId,
			SourceLabel: itemSourceLabel,
			SourceType:  "itch",
			Title:       title,
			Author:      author,
			Summary:     summary,
			ImageUrl:    imgUrl,
			Images:      images,
			DownloadUrl: gameUrl,
			Url:         gameUrl,
			PageUrl:     gameUrl,
			Date:        itemDate,
			PublishedAt: itemDate,
			Tags:        []string{"mod", "gameplay", title},
			ContentType: "Gameplay Mod",
		})
	}

	return items, nil
}

// FetchItchBrowseFeed загружает бесконечную глобальную ленту модов The Sims 4 на Itch.io по поисковым кластерам и авторам
func FetchItchBrowseFeed(page int) ([]DiscoverItem, int, error) {
	if page < 1 {
		page = 1
	}

	queries := [][]string{
		{"https://itch.io/search?q=sims+4+mod", "https://itch.io/search?q=sims+4+cc", "https://adeepindigomods.itch.io/", "https://sparrowcc.itch.io/"},
		{"https://itch.io/search?q=the+sims+4", "https://itch.io/search?q=ts4+mod", "https://weirdoowly.itch.io/", "https://mushilda.itch.io/"},
		{"https://itch.io/search?q=sims+4+custom+content", "https://itch.io/search?q=ts4+cc", "https://missyhissy.itch.io/", "https://baniduhaine.itch.io/"},
		{"https://itch.io/search?q=sims+4+traits", "https://itch.io/search?q=sims+4+career", "https://itch.io/search?q=sims+4+gameplay"},
		{"https://itch.io/search?q=sims+4+hair", "https://itch.io/search?q=sims+4+clothes", "https://itch.io/search?q=sims+4+furniture"},
	}

	urls := queries[(page-1)%len(queries)]
	var allItems []DiscoverItem
	seen := make(map[string]bool)
	var mu sync.Mutex
	var wg sync.WaitGroup

	for uIdx, u := range urls {
		wg.Add(1)
		go func(idx int, targetUrl string) {
			defer wg.Done()
			src := Source{
				Id:    "builtin-itch",
				Type:  "itch",
				Input: targetUrl,
				Label: "Itch.io · Sims 4",
			}
			batch, err := FetchItchFeed(src)
			if err != nil || len(batch) == 0 {
				return
			}
			mu.Lock()
			for i, it := range batch {
				if seen[it.Id] {
					continue
				}
				seen[it.Id] = true
				offsetMin := (page-1)*180 + idx*45 + i
				d := time.Now().UTC().Add(-time.Duration(offsetMin) * time.Minute).Format(time.RFC3339)
				it.Date = d
				it.PublishedAt = d
				allItems = append(allItems, it)
			}
			mu.Unlock()
		}(uIdx, u)
	}
	wg.Wait()

	sort.Slice(allItems, func(i, j int) bool {
		return allItems[i].Date > allItems[j].Date
	})

	nextPage := 0
	if page < len(queries) && len(allItems) > 0 {
		nextPage = page + 1
	}
	return allItems, nextPage, nil
}

var reGhMdImage = regexp.MustCompile(`!\[[^\]]*\]\((https?://[^\s)]+)\)|<img[^>]+src=["'](https?://[^"']+)["']`)

func normalizeGitHubRepo(input string) string {
	s := strings.TrimSpace(input)
	s = strings.TrimPrefix(s, "https://")
	s = strings.TrimPrefix(s, "http://")
	s = strings.TrimPrefix(s, "www.")
	s = strings.TrimPrefix(s, "github.com/")
	s = strings.TrimSuffix(s, "/")
	parts := strings.Split(s, "/")
	if len(parts) >= 2 {
		return parts[0] + "/" + parts[1]
	}
	return s
}

func FetchGitHubFeed(source Source, page int) ([]DiscoverItem, int, error) {
	if page < 1 {
		page = 1
	}
	repo := normalizeGitHubRepo(source.Input)
	if !strings.Contains(repo, "/") {
		return nil, 0, fmt.Errorf("некорректный формат репозитория GitHub (ожидается owner/repo)")
	}

	apiUrl := fmt.Sprintf("https://api.github.com/repos/%s/releases?per_page=15&page=%d", repo, page)
	req, err := http.NewRequest("GET", apiUrl, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("User-Agent", "Sims4ModManager/2.0")
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, 0, fmt.Errorf("GitHub API HTTP %d", resp.StatusCode)
	}

	var releases []struct {
		Id          int64  `json:"id"`
		TagName     string `json:"tag_name"`
		Name        string `json:"name"`
		HtmlUrl     string `json:"html_url"`
		Body        string `json:"body"`
		PublishedAt string `json:"published_at"`
		Author      struct {
			Login     string `json:"login"`
			AvatarUrl string `json:"avatar_url"`
		} `json:"author"`
		Assets []struct {
			Name               string `json:"name"`
			Size               int64  `json:"size"`
			BrowserDownloadUrl string `json:"browser_download_url"`
		} `json:"assets"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return nil, 0, err
	}

	parts := strings.Split(repo, "/")
	repoName := parts[len(parts)-1]
	var items []DiscoverItem

	for _, rel := range releases {
		var downloads []resolver.DownloadFile
		for _, a := range rel.Assets {
			if a.BrowserDownloadUrl != "" && (resolver.IsInstallable(a.Name) || strings.HasSuffix(strings.ToLower(a.Name), ".zip")) {
				downloads = append(downloads, resolver.DownloadFile{
					Name: a.Name,
					Url:  a.BrowserDownloadUrl,
					Via:  "github",
				})
			}
		}
		if len(downloads) == 0 {
			zipUrl := fmt.Sprintf("https://api.github.com/repos/%s/zipball/%s", repo, rel.TagName)
			downloads = append(downloads, resolver.DownloadFile{
				Name: fmt.Sprintf("%s-%s.zip", repoName, rel.TagName),
				Url:  zipUrl,
				Via:  "github",
			})
		}

		var images []string
		for _, m := range reGhMdImage.FindAllStringSubmatch(rel.Body, -1) {
			u := m[1]
			if u == "" && len(m) > 2 {
				u = m[2]
			}
			if u != "" {
				images = append(images, u)
			}
		}
		ogImg := fmt.Sprintf("https://opengraph.githubassets.com/1/%s", repo)
		images = append(images, ogImg)
		if rel.Author.AvatarUrl != "" {
			images = append(images, rel.Author.AvatarUrl)
		}
		coverImg := images[0]

		relTitle := rel.Name
		if relTitle == "" {
			relTitle = rel.TagName
		}
		title := fmt.Sprintf("%s %s", repoName, relTitle)

		summary := strings.TrimSpace(rel.Body)
		if len(summary) > 220 {
			summary = summary[:220] + "…"
		}

		author := rel.Author.Login
		if author == "" {
			author = parts[0]
		}

		items = append(items, DiscoverItem{
			Id:          fmt.Sprintf("github:%s:%d", repo, rel.Id),
			SourceId:    source.Id,
			SourceLabel: source.Label,
			SourceType:  "github",
			Title:       title,
			Author:      author,
			AvatarUrl:   rel.Author.AvatarUrl,
			Summary:     summary,
			ImageUrl:    coverImg,
			Images:      images,
			Url:         rel.HtmlUrl,
			PageUrl:     rel.HtmlUrl,
			DownloadUrl: rel.HtmlUrl,
			Date:        rel.PublishedAt,
			PublishedAt: rel.PublishedAt,
			Downloads:   downloads,
			Tags:        []string{"mod", "script", repoName},
			ContentType: "Script Mod",
		})
	}

	nextPage := 0
	if len(releases) >= 15 {
		nextPage = page + 1
	}
	return items, nextPage, nil
}

// FetchGitHubBrowseFeed загружает бесконечную ленту репозиториев The Sims 4 через GitHub Search API
func FetchGitHubBrowseFeed(page int) ([]DiscoverItem, int, error) {
	return FetchGitHubBrowseFeedSorted(page, "new")
}

func FetchGitHubBrowseFeedSorted(page int, sortBy string) ([]DiscoverItem, int, error) {
	if page < 1 {
		page = 1
	}
	ghSort := "updated"
	if sortBy == "popular" {
		ghSort = "stars"
	}
	apiUrl := fmt.Sprintf("https://api.github.com/search/repositories?q=sims+4+mod+OR+ts4script+OR+sims4&sort=%s&order=desc&per_page=24&page=%d", ghSort, page)
	req, err := http.NewRequest("GET", apiUrl, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("User-Agent", "Sims4ModManager/2.0")
	req.Header.Set("Accept", "application/vnd.github+json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, 0, fmt.Errorf("GitHub Search HTTP %d", resp.StatusCode)
	}

	var searchRes struct {
		TotalCount int `json:"total_count"`
		Items      []struct {
			Id          int64    `json:"id"`
			Name        string   `json:"name"`
			FullName    string   `json:"full_name"`
			HtmlUrl     string   `json:"html_url"`
			Description string   `json:"description"`
			UpdatedAt   string   `json:"updated_at"`
			PushedAt    string   `json:"pushed_at"`
			Stars       int      `json:"stargazers_count"`
			Topics      []string `json:"topics"`
			Owner       struct {
				Login     string `json:"login"`
				AvatarUrl string `json:"avatar_url"`
			} `json:"owner"`
		} `json:"items"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&searchRes); err != nil {
		return nil, 0, err
	}

	var items []DiscoverItem
	for _, r := range searchRes.Items {
		ogImg := fmt.Sprintf("https://opengraph.githubassets.com/1/%s", r.FullName)
		images := []string{ogImg}
		if r.Owner.AvatarUrl != "" {
			images = append(images, r.Owner.AvatarUrl)
		}
		zipUrl := fmt.Sprintf("https://api.github.com/repos/%s/zipball", r.FullName)
		downloads := []resolver.DownloadFile{
			{
				Name: fmt.Sprintf("%s.zip", r.Name),
				Url:  zipUrl,
				Via:  "github",
			},
		}
		summary := strings.TrimSpace(r.Description)
		if summary == "" {
			summary = "The Sims 4 GitHub Repository"
		}
		dateStr := r.PushedAt
		if dateStr == "" {
			dateStr = r.UpdatedAt
		}
		tags := append([]string{"mod", "script"}, r.Topics...)

		items = append(items, DiscoverItem{
			Id:          fmt.Sprintf("github:repo:%d", r.Id),
			SourceId:    "github:" + r.FullName,
			SourceLabel: r.FullName,
			SourceType:  "github",
			Title:       r.Name,
			Author:      r.Owner.Login,
			AvatarUrl:   r.Owner.AvatarUrl,
			Summary:     summary,
			ImageUrl:    ogImg,
			Images:      images,
			Url:         r.HtmlUrl,
			PageUrl:     r.HtmlUrl,
			DownloadUrl: r.HtmlUrl,
			Date:        dateStr,
			PublishedAt: dateStr,
			Notes:       r.Stars,
			Tags:        tags,
			Downloads:   downloads,
			ContentType: "Script Mod",
		})
	}

	nextPage := 0
	if len(searchRes.Items) >= 20 {
		nextPage = page + 1
	}
	return items, nextPage, nil
}

// FetchBoostyClusterFeed параллельно агрегирует посты всех Boosty-креаторов с независимыми курсорами пагинации
func FetchBoostyClusterFeed(cursorStr string) ([]DiscoverItem, string, error) {
	cursors := make(map[string]string)
	if cursorStr != "" {
		_ = json.Unmarshal([]byte(cursorStr), &cursors)
	}

	sources := GetSources()
	var boostySources []Source
	seenSlug := make(map[string]bool)
	for _, s := range sources {
		if s.Type == "boosty" {
			slug := strings.ToLower(normalizeBoostyBlog(s.Input))
			if slug != "" && !seenSlug[slug] {
				seenSlug[slug] = true
				boostySources = append(boostySources, s)
			}
		}
	}
	for _, sug := range SUGGESTED_SOURCES {
		if sug.Type == "boosty" {
			slug := strings.ToLower(normalizeBoostyBlog(sug.Input))
			if slug != "" && !seenSlug[slug] {
				seenSlug[slug] = true
				boostySources = append(boostySources, Source{
					Id:    "b_" + slug,
					Type:  "boosty",
					Input: sug.Input,
					Label: sug.Label,
				})
			}
		}
	}

	var allItems []DiscoverItem
	nextCursors := make(map[string]string)
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 6)

	for _, src := range boostySources {
		slug := strings.ToLower(normalizeBoostyBlog(src.Input))
		off, hasKey := cursors[slug]
		if cursorStr != "" && (!hasKey || off == "") {
			continue
		}
		sCopy := src
		wg.Add(1)
		go func(blogSlug, offset string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			bItems, nextOff, err := FetchBoostyFeed(sCopy, offset)
			if err == nil && len(bItems) > 0 {
				mu.Lock()
				allItems = append(allItems, bItems...)
				if nextOff != "" {
					nextCursors[blogSlug] = nextOff
				}
				mu.Unlock()
			}
		}(slug, off)
	}
	wg.Wait()

	seen := make(map[string]bool)
	var deduped []DiscoverItem
	for _, it := range allItems {
		if !seen[it.Id] {
			seen[it.Id] = true
			deduped = append(deduped, it)
		}
	}

	sort.Slice(deduped, func(i, j int) bool {
		return deduped[i].Date > deduped[j].Date
	})

	nextCursorJson := ""
	if len(nextCursors) > 0 {
		if raw, err := json.Marshal(nextCursors); err == nil {
			nextCursorJson = string(raw)
		}
	}
	return deduped, nextCursorJson, nil
}

// ----------------- Source Feed (Author View & Site Browser) -----------------

func resolveDynamicSource(sourceId string, sources []Source) *Source {
	for _, s := range sources {
		if s.Id == sourceId || strings.EqualFold(s.Type+":"+s.Input, sourceId) {
			sCopy := s
			return &sCopy
		}
	}

	// Проверяем префиксы динамических авторов (patreon:, boosty:, tumblr:, tsr:, itch:, github:, mts:, pinterest:, p_, b_, t_, tsr_, i_, gh_, pin_)
	var sType, sInput string
	switch {
	case strings.HasPrefix(sourceId, "patreon:"):
		sType = "patreon"
		sInput = strings.TrimPrefix(sourceId, "patreon:")
	case strings.HasPrefix(sourceId, "p_"):
		sType = "patreon"
		sInput = strings.TrimPrefix(sourceId, "p_")
	case strings.HasPrefix(sourceId, "boosty:"):
		sType = "boosty"
		sInput = strings.TrimPrefix(sourceId, "boosty:")
	case strings.HasPrefix(sourceId, "b_"):
		sType = "boosty"
		sInput = strings.TrimPrefix(sourceId, "b_")
	case strings.HasPrefix(sourceId, "tumblr:"):
		sType = "tumblr"
		sInput = strings.TrimPrefix(sourceId, "tumblr:")
	case strings.HasPrefix(sourceId, "t_"):
		sType = "tumblr"
		sInput = strings.TrimPrefix(sourceId, "t_")
	case strings.HasPrefix(sourceId, "tsr:"):
		sType = "tsr"
		sInput = strings.TrimPrefix(sourceId, "tsr:")
	case strings.HasPrefix(sourceId, "tsr_"):
		sType = "tsr"
		sInput = strings.TrimPrefix(sourceId, "tsr_")
	case strings.HasPrefix(sourceId, "itch:"):
		sType = "itch"
		sInput = strings.TrimPrefix(sourceId, "itch:")
	case strings.HasPrefix(sourceId, "i_"):
		sType = "itch"
		sInput = strings.TrimPrefix(sourceId, "i_")
	case strings.HasPrefix(sourceId, "github:"):
		sType = "github"
		sInput = strings.TrimPrefix(sourceId, "github:")
	case strings.HasPrefix(sourceId, "gh_"):
		sType = "github"
		sInput = strings.TrimPrefix(sourceId, "gh_")
	case strings.HasPrefix(sourceId, "mts:"):
		sType = "mts"
		sInput = strings.TrimPrefix(sourceId, "mts:")
	case strings.HasPrefix(sourceId, "modthesims:"):
		sType = "mts"
		sInput = strings.TrimPrefix(sourceId, "modthesims:")
	case strings.HasPrefix(sourceId, "pinterest:"):
		sType = "pinterest"
		sInput = strings.TrimPrefix(sourceId, "pinterest:")
	case strings.HasPrefix(sourceId, "pin_"):
		sType = "pinterest"
		sInput = strings.TrimPrefix(sourceId, "pin_")
	}

	if sType == "" || sInput == "" {
		return nil
	}

	// Ищем подходящий Input и Label в существующих или предложенных источниках
	label := sInput
	cleanKey := func(v string) string {
		v = strings.ToLower(strings.TrimSpace(v))
		v = strings.ReplaceAll(v, " ", "")
		v = strings.ReplaceAll(v, "_", "")
		v = strings.ReplaceAll(v, "-", "")
		return v
	}
	targetKey := cleanKey(sInput)
	for _, s := range sources {
		if s.Type == sType && (strings.EqualFold(s.Input, sInput) || strings.EqualFold(s.Label, sInput) || (targetKey != "" && (cleanKey(s.Input) == targetKey || cleanKey(s.Label) == targetKey))) {
			return &Source{
				Id:    s.Id,
				Type:  s.Type,
				Input: s.Input,
				Label: s.Label,
			}
		}
	}
	for _, sug := range SUGGESTED_SOURCES {
		if sug.Type == sType && (strings.EqualFold(sug.Input, sInput) || strings.EqualFold(sug.Label, sInput) || (targetKey != "" && (cleanKey(sug.Input) == targetKey || cleanKey(sug.Label) == targetKey))) {
			sInput = sug.Input
			label = sug.Label
			break
		}
	}

	return &Source{
		Id:    sourceId,
		Type:  sType,
		Input: sInput,
		Label: label,
	}
}

func FetchSourceFeed(payload any) SourceFeedResult {
	var opts struct {
		SourceId string `json:"sourceId"`
		Cursor   any    `json:"cursor"`
		Sort     string `json:"sort"`
		Cat      any    `json:"cat"`
	}
	rawBytes, _ := json.Marshal(payload)
	_ = json.Unmarshal(rawBytes, &opts)

	if opts.SourceId == "builtin-mts" {
		page := 1
		if p, ok := opts.Cursor.(float64); ok && p > 0 {
			page = int(p)
		} else if pStr, ok := opts.Cursor.(string); ok {
			var parsed int
			if _, err := fmt.Sscanf(pStr, "%d", &parsed); err == nil && parsed > 0 {
				page = parsed
			}
		}

		cat := 0
		if c, ok := opts.Cat.(float64); ok && c > 0 {
			cat = int(c)
		} else if cStr, ok := opts.Cat.(string); ok {
			var parsed int
			if _, err := fmt.Sscanf(cStr, "%d", &parsed); err == nil && parsed > 0 {
				cat = parsed
			}
		}

		sort := opts.Sort
		if sort == "" {
			sort = "new"
		}

		items, nextPg, err := FetchMtsFeedAdvanced(page, sort, cat)
		if err != nil {
			return SourceFeedResult{Ok: false, Error: err.Error()}
		}

		var nextCursor any
		if nextPg > 0 {
			nextCursor = nextPg
		}

		return SourceFeedResult{
			Ok:         true,
			Items:      items,
			Label:      "ModTheSims · Sims 4",
			NextCursor: nextCursor,
		}
	}

	if opts.SourceId == "builtin-tsr" {
		page := toInt(opts.Cursor)
		if page < 1 {
			page = 1
		}
		catStr, _ := opts.Cat.(string)
		items, nextPg, err := FetchTsrFeedFiltered(page, "", opts.Sort, catStr)
		if err != nil {
			return SourceFeedResult{Ok: false, Error: err.Error()}
		}
		var nextCursor any
		if nextPg > 0 {
			nextCursor = nextPg
		}
		return SourceFeedResult{
			Ok:         true,
			Items:      items,
			Label:      "The Sims Resource · Sims 4",
			NextCursor: nextCursor,
		}
	}

	if opts.SourceId == "builtin-itch" {
		page := toInt(opts.Cursor)
		if page < 1 {
			page = 1
		}
		items, nextPg, err := FetchItchBrowseFeed(page)
		if err != nil {
			return SourceFeedResult{Ok: false, Error: err.Error()}
		}
		var nextCursor any
		if nextPg > 0 {
			nextCursor = nextPg
		}
		return SourceFeedResult{
			Ok:         true,
			Items:      items,
			Label:      "Itch.io · Sims 4",
			NextCursor: nextCursor,
		}
	}

	if opts.SourceId == "builtin-github" {
		page := toInt(opts.Cursor)
		if page < 1 {
			page = 1
		}
		items, nextPg, err := FetchGitHubBrowseFeedSorted(page, opts.Sort)
		if err != nil {
			return SourceFeedResult{Ok: false, Error: err.Error()}
		}
		var nextCursor any
		if nextPg > 0 {
			nextCursor = nextPg
		}
		return SourceFeedResult{
			Ok:         true,
			Items:      items,
			Label:      "GitHub · Sims 4",
			NextCursor: nextCursor,
		}
	}

	if opts.SourceId == "builtin-boosty" {
		cursorStr := ""
		if c, ok := opts.Cursor.(string); ok {
			cursorStr = c
		}
		items, nextC, err := FetchBoostyClusterFeed(cursorStr)
		if err != nil {
			return SourceFeedResult{Ok: false, Error: err.Error()}
		}
		var nextCursor any
		if nextC != "" {
			nextCursor = nextC
		}
		return SourceFeedResult{
			Ok:         true,
			Items:      items,
			Label:      "Boosty · Sims 4 Creators",
			NextCursor: nextCursor,
		}
	}

	sources := GetSources()
	target := resolveDynamicSource(opts.SourceId, sources)
	if target == nil {
		return SourceFeedResult{Ok: false, Error: "Источник не найден"}
	}

	switch target.Type {
	case "patreon":
		cursorStr := ""
		if c, ok := opts.Cursor.(string); ok {
			cursorStr = c
		}
		items, nextC, err := FetchPatreonFeed(*target, cursorStr)
		if err != nil {
			return SourceFeedResult{Ok: false, Error: err.Error()}
		}
		var nextCursor any
		if nextC != "" {
			nextCursor = nextC
		}
		return SourceFeedResult{
			Ok:         true,
			Items:      items,
			Label:      target.Label,
			NextCursor: nextCursor,
		}

	case "tumblr":
		start := 0
		if c, ok := opts.Cursor.(float64); ok && c > 0 {
			start = int(c)
		} else if cStr, ok := opts.Cursor.(string); ok {
			var parsed int
			if _, err := fmt.Sscanf(cStr, "%d", &parsed); err == nil && parsed > 0 {
				start = parsed
			}
		}
		items, err := FetchTumblrFeed(*target, start)
		if err != nil {
			return SourceFeedResult{Ok: false, Error: err.Error()}
		}
		var nextCursor any
		if len(items) >= 40 {
			nextCursor = start + len(items)
		}
		return SourceFeedResult{
			Ok:         true,
			Items:      items,
			Label:      target.Label,
			NextCursor: nextCursor,
		}

	case "pinterest":
		bookmark := ""
		if c, ok := opts.Cursor.(string); ok {
			bookmark = c
		}
		items, nextBm, err := FetchPinterestUserFeed(*target, bookmark)
		if err != nil || len(items) == 0 {
			if bookmark == "" {
				rssItems, rssErr := FetchPinterestFeed(*target)
				if rssErr != nil && err != nil {
					return SourceFeedResult{Ok: false, Error: err.Error()}
				}
				items = rssItems
			}
		}
		for i := range items {
			items[i].SourceId = target.Id
			if target.Label != "" {
				items[i].SourceLabel = target.Label
			}
		}
		var nextCursor any
		if nextBm != "" {
			nextCursor = nextBm
		}
		return SourceFeedResult{
			Ok:         true,
			Items:      items,
			Label:      target.Label,
			NextCursor: nextCursor,
		}

	case "boosty":
		offsetStr := ""
		if c, ok := opts.Cursor.(string); ok {
			offsetStr = c
		}
		items, nextOff, err := FetchBoostyFeed(*target, offsetStr)
		if err != nil {
			return SourceFeedResult{Ok: false, Error: err.Error()}
		}
		var nextCursor any
		if nextOff != "" {
			nextCursor = nextOff
		}
		return SourceFeedResult{
			Ok:         true,
			Items:      items,
			Label:      target.Label,
			NextCursor: nextCursor,
		}

	case "tsr":
		page := toInt(opts.Cursor)
		if page < 1 {
			page = 1
		}
		items, nextPg, err := FetchTsrSourceFeed(*target, page)
		if err != nil {
			return SourceFeedResult{Ok: false, Error: err.Error()}
		}
		var nextCursor any
		if nextPg > 0 {
			nextCursor = nextPg
		}
		return SourceFeedResult{
			Ok:         true,
			Items:      items,
			Label:      target.Label,
			NextCursor: nextCursor,
		}

	case "itch":
		items, err := FetchItchFeed(*target)
		if err != nil {
			return SourceFeedResult{Ok: false, Error: err.Error()}
		}
		return SourceFeedResult{
			Ok:    true,
			Items: items,
			Label: target.Label,
		}

	case "github":
		page := toInt(opts.Cursor)
		if page < 1 {
			page = 1
		}
		items, nextPg, err := FetchGitHubFeed(*target, page)
		if err != nil {
			return SourceFeedResult{Ok: false, Error: err.Error()}
		}
		var nextCursor any
		if nextPg > 0 {
			nextCursor = nextPg
		}
		return SourceFeedResult{
			Ok:         true,
			Items:      items,
			Label:      target.Label,
			NextCursor: nextCursor,
		}

	case "mts", "modthesims":
		page := toInt(opts.Cursor)
		if page < 1 {
			page = 1
		}
		items, nextPg, err := FetchMtsCreatorFeed(page, opts.Sort, 0, target.Input)
		if err != nil {
			return SourceFeedResult{Ok: false, Error: err.Error()}
		}
		for i := range items {
			items[i].SourceId = target.Id
		}
		var nextCursor any
		if nextPg > 0 {
			nextCursor = nextPg
		}
		return SourceFeedResult{
			Ok:         true,
			Items:      items,
			Label:      target.Label,
			NextCursor: nextCursor,
		}
	}

	return SourceFeedResult{Ok: false, Error: "Неизвестный тип источника"}
}

// ----------------- Агрегатор ленты Discover -----------------

func FetchDiscover(opts any) DiscoverFeedResult {
	discLock.Lock()
	sources := getSourcesLocked()
	prevBySource := make(map[string][]DiscoverItem)
	if cachedFeed != nil {
		for _, it := range cachedFeed.Items {
			prevBySource[it.SourceId] = append(prevBySource[it.SourceId], it)
		}
	}
	discLock.Unlock()

	var allItems []DiscoverItem
	var wg sync.WaitGroup
	var itemLock sync.Mutex
	localCursors := make(map[string]any)
	errBySource := make(map[string]string)

	// Параллельно загружаем посты из источников (до 16 одновременных горутин без удержания discLock!)
	sem := make(chan struct{}, 16)

	for _, s := range sources {
		source := s
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			var fetched []DiscoverItem
			var nextCursor any
			var fetchErr error

			switch source.Type {
			case "modthesims":
				mtsItems, nextPg, err := FetchMtsFeedAdvanced(1, "new", 0)
				fetched, fetchErr = mtsItems, err
				if nextPg > 0 {
					nextCursor = nextPg
				}
			case "tsr":
				var tsrItems []DiscoverItem
				var nextPg int
				var err error
				if source.Builtin || source.Input == "" {
					tsrItems, nextPg, err = FetchTsrFeedAdvanced(1, "")
				} else {
					tsrItems, nextPg, err = FetchTsrSourceFeed(source, 1)
				}
				fetched, fetchErr = tsrItems, err
				if nextPg > 0 {
					nextCursor = nextPg
				}
			case "patreon":
				pItems, nextC, err := FetchPatreonFeed(source, "")
				fetched, fetchErr = pItems, err
				if nextC != "" {
					nextCursor = nextC
				}
			case "tumblr":
				tItems, err := FetchTumblrFeed(source, 0)
				fetched, fetchErr = tItems, err
				if len(tItems) >= 50 {
					nextCursor = 50
				}
			case "pinterest":
				pinItems, err := FetchPinterestFeed(source)
				fetched, fetchErr = pinItems, err
			case "boosty":
				bItems, nextOff, err := FetchBoostyFeed(source, "")
				fetched, fetchErr = bItems, err
				if nextOff != "" {
					nextCursor = nextOff
				}
			case "itch":
				iItems, err := FetchItchFeed(source)
				fetched, fetchErr = iItems, err
			case "github":
				ghItems, nextPg, err := FetchGitHubFeed(source, 1)
				fetched, fetchErr = ghItems, err
				if nextPg > 0 {
					nextCursor = nextPg
				}
			}

			itemLock.Lock()
			if len(fetched) > 0 {
				allItems = append(allItems, fetched...)
				if nextCursor != nil {
					localCursors[source.Id] = nextCursor
				}
			} else if prev, ok := prevBySource[source.Id]; ok && len(prev) > 0 {
				// Сохраняем закэшированные посты автора, если сеть временно вернула ошибку/таймаут
				allItems = append(allItems, prev...)
			} else if fetchErr != nil {
				errBySource[source.Id] = fetchErr.Error()
			}
			itemLock.Unlock()
		}()
	}

	wg.Wait()

	// Дедупликация по ID и подсчет постов по каждому источнику
	seenIds := make(map[string]bool)
	countsBySource := make(map[string]int)
	var deduped []DiscoverItem
	for _, it := range allItems {
		if !seenIds[it.Id] {
			seenIds[it.Id] = true
			if it.SourceType == "patreon" && len(it.Downloads) == 0 && len(it.Links) == 0 && !it.Locked {
				it.Locked = true
			}
			deduped = append(deduped, it)
			countsBySource[it.SourceId]++
			if it.SourceType == "modthesims" {
				countsBySource["builtin-mts"]++
			} else if it.SourceType == "tsr" {
				countsBySource["builtin-tsr"]++
			}
		}
	}

	// Сортировка по дате публикации (свежие сверху)
	sort.Slice(deduped, func(i, j int) bool {
		return deduped[i].Date > deduped[j].Date
	})

	discLock.Lock()
	defer discLock.Unlock()

	sources = getSourcesLocked()
	for i := range sources {
		id := sources[i].Id
		sources[i].Count = countsBySource[id]
		if eStr, ok := errBySource[id]; ok && countsBySource[id] == 0 {
			msg := eStr
			sources[i].Error = &msg
		} else {
			sources[i].Error = nil
		}
	}

	for k, v := range localCursors {
		sourceCursors[k] = v
	}
	hasMore := len(sourceCursors) > 0

	res := DiscoverFeedResult{
		Ok:        true,
		Items:     deduped,
		Sources:   sources,
		FetchedAt: time.Now().UTC().Format(time.RFC3339),
		HasMore:   hasMore,
		Cursors:   sourceCursors,
	}

	cachedFeed = &res
	raw, err := json.MarshalIndent(res, "", "  ")
	if err == nil {
		_ = os.WriteFile(getDiscoverCachePath(), raw, 0644)
	}

	return res
}

func FetchMoreDiscover() DiscoverFeedResult {
	discLock.Lock()
	sources := getSourcesLocked()
	cursorsCopy := make(map[string]any, len(sourceCursors))
	for k, v := range sourceCursors {
		cursorsCopy[k] = v
	}
	discLock.Unlock()

	var freshItems []DiscoverItem
	var wg sync.WaitGroup
	var itemLock sync.Mutex
	nextCursors := make(map[string]any)
	exhausted := make(map[string]bool)
	sem := make(chan struct{}, 12)

	for _, s := range sources {
		source := s
		cur, exists := cursorsCopy[source.Id]
		if !exists || cur == nil || cur == "" || cur == 0 {
			if source.Type == "modthesims" || source.Type == "tsr" {
				cur = 2
			} else if source.Type == "tumblr" {
				cur = 50
			} else {
				continue
			}
		}

		wg.Add(1)
		go func(cursorVal any) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			switch source.Type {
			case "patreon":
				cStr, _ := cursorVal.(string)
				items, nextC, err := FetchPatreonFeed(source, cStr)
				if err == nil {
					itemLock.Lock()
					freshItems = append(freshItems, items...)
					if nextC != "" {
						nextCursors[source.Id] = nextC
					} else {
						exhausted[source.Id] = true
					}
					itemLock.Unlock()
				}
			case "modthesims":
				pg := toInt(cursorVal)
				if pg <= 0 {
					pg = 2
				}
				items, nextPg, err := FetchMtsFeedAdvanced(pg, "new", 0)
				if err == nil {
					itemLock.Lock()
					freshItems = append(freshItems, items...)
					if nextPg > 0 {
						nextCursors[source.Id] = nextPg
					} else {
						exhausted[source.Id] = true
					}
					itemLock.Unlock()
				}
			case "tsr":
				pg := toInt(cursorVal)
				if pg <= 0 {
					pg = 2
				}
				var items []DiscoverItem
				var nextPg int
				var err error
				if source.Builtin || source.Input == "" {
					items, nextPg, err = FetchTsrFeedAdvanced(pg, "")
				} else {
					items, nextPg, err = FetchTsrSourceFeed(source, pg)
				}
				if err == nil {
					itemLock.Lock()
					freshItems = append(freshItems, items...)
					if nextPg > 0 {
						nextCursors[source.Id] = nextPg
					} else {
						exhausted[source.Id] = true
					}
					itemLock.Unlock()
				}
			case "tumblr":
				start := toInt(cursorVal)
				items, err := FetchTumblrFeed(source, start)
				if err == nil {
					itemLock.Lock()
					freshItems = append(freshItems, items...)
					if len(items) >= 50 {
						nextCursors[source.Id] = start + len(items)
					} else {
						exhausted[source.Id] = true
					}
					itemLock.Unlock()
				}
			case "boosty":
				offStr, _ := cursorVal.(string)
				items, nextOff, err := FetchBoostyFeed(source, offStr)
				if err == nil {
					itemLock.Lock()
					freshItems = append(freshItems, items...)
					if nextOff != "" {
						nextCursors[source.Id] = nextOff
					} else {
						exhausted[source.Id] = true
					}
					itemLock.Unlock()
				}
			case "github":
				pg := toInt(cursorVal)
				if pg <= 0 {
					pg = 2
				}
				items, nextPg, err := FetchGitHubFeed(source, pg)
				if err == nil {
					itemLock.Lock()
					freshItems = append(freshItems, items...)
					if nextPg > 0 {
						nextCursors[source.Id] = nextPg
					} else {
						exhausted[source.Id] = true
					}
					itemLock.Unlock()
				}
			}
		}(cur)
	}

	wg.Wait()

	discLock.Lock()
	defer discLock.Unlock()

	for k := range exhausted {
		delete(sourceCursors, k)
	}
	for k, v := range nextCursors {
		sourceCursors[k] = v
	}
	hasMore := len(sourceCursors) > 0

	if cachedFeed != nil {
		seen := make(map[string]bool)
		for _, it := range cachedFeed.Items {
			seen[it.Id] = true
		}
		var newOnly []DiscoverItem
		for _, it := range freshItems {
			if !seen[it.Id] {
				seen[it.Id] = true
				newOnly = append(newOnly, it)
			}
		}
		cachedFeed.Items = append(cachedFeed.Items, newOnly...)
		cachedFeed.HasMore = hasMore
		cachedFeed.Cursors = sourceCursors
		sources = getSourcesLocked()
		cachedFeed.Sources = sources
		raw, _ := json.MarshalIndent(cachedFeed, "", "  ")
		_ = os.WriteFile(getDiscoverCachePath(), raw, 0644)

		return DiscoverFeedResult{
			Ok:        true,
			Items:     newOnly,
			Sources:   sources,
			FetchedAt: time.Now().UTC().Format(time.RFC3339),
			HasMore:   hasMore,
			Cursors:   sourceCursors,
		}
	}

	return DiscoverFeedResult{
		Ok:      true,
		Items:   freshItems,
		Sources: getSourcesLocked(),
		HasMore: hasMore,
		Cursors: sourceCursors,
	}
}

func sanitizeCachedItem(it *DiscoverItem) {
	if it.SourceType == "patreon" && len(it.Downloads) == 0 && len(it.Links) == 0 && !it.Locked {
		it.Locked = true
	}
	if it.SourceType == "boosty" {
		var validDownloads []resolver.DownloadFile
		for _, d := range it.Downloads {
			if strings.Contains(d.Url, "cdn.boosty.to/file/") && !strings.Contains(d.Url, "sign=") {
				continue
			}
			validDownloads = append(validDownloads, d)
		}
		it.Downloads = validDownloads
		var validLinks []string
		for _, l := range it.Links {
			if isPriorityModLink(l) {
				validLinks = append(validLinks, l)
			}
		}
		it.Links = validLinks
		it.CandidateLinks = validLinks
		if len(it.Downloads) == 0 && len(it.Links) == 0 {
			it.Locked = true
		}
	}
	if (it.SourceId == "" || it.SourceId == "builtin-mts") && it.SourceType == "modthesims" && it.Author != "" && it.Author != "ModTheSims" {
		it.SourceId = "mts:" + it.Author
	}
	if (it.SourceId == "" || it.SourceId == "builtin-tsr") && it.SourceType == "tsr" && it.Author != "" && it.Author != "The Sims Resource" {
		it.SourceId = "tsr:" + it.Author
	}
	if (it.SourceId == "" || it.SourceId == "tumblr-tag") && it.SourceType == "tumblr" && it.Author != "" {
		it.SourceId = "tumblr:" + it.Author
	}
	if (it.SourceId == "" || it.SourceId == "builtin-itch") && it.SourceType == "itch" {
		if slug := extractItchCreatorFromUrl(it.Url); slug != "" {
			it.SourceId = "itch:" + slug
		}
	}
}

func GetCachedDiscover() DiscoverFeedResult {
	discLock.Lock()
	defer discLock.Unlock()

	if cachedFeed != nil && len(cachedFeed.Items) > 0 {
		for i := range cachedFeed.Items {
			sanitizeCachedItem(&cachedFeed.Items[i])
		}
		cachedFeed.Sources = getSourcesLocked()
		return *cachedFeed
	}

	data, err := os.ReadFile(getDiscoverCachePath())
	if err == nil && len(data) > 0 {
		data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
		var res DiscoverFeedResult
		if err := json.Unmarshal(data, &res); err == nil && len(res.Items) > 0 {
			res.Ok = true
			for i := range res.Items {
				sanitizeCachedItem(&res.Items[i])
			}
			if res.Cursors != nil {
				for k, v := range res.Cursors {
					sourceCursors[k] = v
				}
			}
			cachedFeed = &res
			res.Sources = getSourcesLocked()
			return res
		}
	}

	// Если кэша еще нет на диске, возвращаем полный список отслеживаемых источников без фейкового кэша,
	// чтобы фронтенд показал скелетон загрузки и сразу знал всех 105+ авторов.
	sources := getSourcesLocked()
	return DiscoverFeedResult{
		Ok:        false,
		Items:     nil,
		Sources:   sources,
		FetchedAt: time.Now().UTC().Format(time.RFC3339),
		HasMore:   false,
	}
}

// ----------------- Скачивание файлов Discover -----------------

var ProgressHook func(p DiscoverProgress)

type countingDiscoverWriter struct {
	writer    io.Writer
	itemId    string
	total     int64
	written   int64
	ctx       context.Context
	fileIndex int
	fileCount int
	lastEmit  time.Time
}

func safeEmit(ctx context.Context, eventName string, data any) {
	if eventName == "discover:progress" {
		if dp, ok := data.(DiscoverProgress); ok && ProgressHook != nil {
			ProgressHook(dp)
		}
	}
	if ctx == nil || ctx.Value("events") == nil {
		return
	}
	defer func() {
		_ = recover()
	}()
	runtime.EventsEmit(ctx, eventName, data)
}

func (cw *countingDiscoverWriter) Write(p []byte) (int, error) {
	n, err := cw.writer.Write(p)
	cw.written += int64(n)
	now := time.Now()
	if cw.total > 0 && (now.Sub(cw.lastEmit) > 80*time.Millisecond || cw.written == cw.total) {
		cw.lastEmit = now
		pct := int((float64(cw.written) / float64(cw.total)) * 100)
		if pct > 100 {
			pct = 100
		}
		safeEmit(cw.ctx, "discover:progress", DiscoverProgress{
			ItemId:    cw.itemId,
			Received:  cw.written,
			Total:     cw.total,
			Percent:   pct,
			Status:    "downloading",
			FileIndex: cw.fileIndex,
			FileCount: cw.fileCount,
			Phase:     "downloading",
		})
	}
	return n, err
}

func recordDiscoverDownload(itemId, fileName, installedPath, title string) {
	discLock.Lock()
	defer discLock.Unlock()

	p := getDiscoverDownloadsPath()
	data, _ := os.ReadFile(p)
	var records map[string]struct {
		Paths []string `json:"paths"`
		Files []string `json:"files"`
		Title string   `json:"title,omitempty"`
	}
	if json.Unmarshal(data, &records) != nil || records == nil {
		records = make(map[string]struct {
			Paths []string `json:"paths"`
			Files []string `json:"files"`
			Title string   `json:"title,omitempty"`
		})
	}

	rec := records[itemId]
	rec.Paths = append(rec.Paths, installedPath)
	rec.Files = append(rec.Files, fileName)
	rec.Title = title
	records[itemId] = rec

	raw, _ := json.MarshalIndent(records, "", "  ")
	_ = os.WriteFile(p, raw, 0644)
}

func downloadSingleFile(ctx context.Context, itemId, rawUrl, fileName, modsFolder string, fileIdx, fileCount int) (string, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	var bodyReader io.ReadCloser
	var totalSize int64

	if strings.HasPrefix(rawUrl, "mega://") {
		streamReader, sz, megaFn, err := resolver.OpenMegaStream(ctx, rawUrl)
		if err != nil {
			return "", err
		}
		bodyReader = streamReader
		totalSize = sz
		if fileName == "" && megaFn != "" {
			fileName = megaFn
		}
	} else {
		req, err := http.NewRequestWithContext(ctx, "GET", rawUrl, nil)
		if err != nil {
			return "", err
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

		client := &http.Client{Timeout: 30 * time.Minute}
		resp, err := client.Do(req)
		if err != nil {
			return "", err
		}
		if resp.StatusCode >= 400 {
			resp.Body.Close()
			return "", fmt.Errorf("HTTP %d", resp.StatusCode)
		}
		bodyReader = resp.Body
		totalSize = resp.ContentLength

		if fileName == "" {
			cd := resp.Header.Get("Content-Disposition")
			if cd != "" {
				re := regexp.MustCompile(`filename\*?=(?:UTF-8'')?["']?([^"';]+)`)
				if m := re.FindStringSubmatch(cd); len(m) > 1 {
					fileName = m[1]
				}
			}
		}
	}
	defer bodyReader.Close()

	if fileName == "" {
		if parsed, err := url.Parse(rawUrl); err == nil {
			fileName = filepath.Base(parsed.Path)
		} else {
			fileName = filepath.Base(rawUrl)
		}
	}
	if idx := strings.Index(fileName, "?"); idx != -1 {
		fileName = fileName[:idx]
	}
	if unesc, err := url.QueryUnescape(fileName); err == nil && unesc != "" {
		fileName = unesc
	}
	if fileName == "" || fileName == "/" || fileName == "." {
		fileName = "download.package"
	}

	tempPath := filepath.Join(modsFolder, fileName+".download")
	finalPath := filepath.Join(modsFolder, fileName)

	outFile, err := os.OpenFile(tempPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return "", err
	}
	defer outFile.Close()

	bufWriter := bufio.NewWriterSize(outFile, 256*1024)
	cw := &countingDiscoverWriter{
		writer:    bufWriter,
		itemId:    itemId,
		total:     totalSize,
		ctx:       ctx,
		fileIndex: fileIdx,
		fileCount: fileCount,
	}

	bufReader := bufio.NewReaderSize(bodyReader, 256*1024)
	if _, err := io.Copy(cw, bufReader); err != nil {
		_ = os.Remove(tempPath)
		return "", err
	}

	_ = bufWriter.Flush()
	_ = outFile.Close()
	_ = os.Remove(finalPath)
	if err := os.Rename(tempPath, finalPath); err != nil {
		_ = os.Remove(tempPath)
		return "", err
	}

	if extractor.IsArchiveExt(filepath.Ext(finalPath)) {
		safeEmit(ctx, "discover:progress", DiscoverProgress{
			ItemId:    itemId,
			Percent:   100,
			Status:    "installing",
			Phase:     "installing",
			FileIndex: fileIdx,
			FileCount: fileCount,
		})
		extRes := extractor.ExtractLocalArchive(finalPath)
		if extRes.Ok && extRes.Folder != "" {
			return extRes.Folder, nil
		}
	}

	return finalPath, nil
}

// Главная точка скачивания элементов Discover (поддерживает 1..N файлов, архивы, авто-резолвинг ссылок и сохранение обложки в кэш)
func DownloadDiscoverItem(ctx context.Context, item any) DownloadResult {
	cfg := config.ReadConfig()
	modsFolder := cfg.ModsFolder
	if modsFolder == "" {
		return DownloadResult{Ok: false, Errors: []string{"Папка Mods не задана в настройках"}}
	}

	rawBytes, err := json.Marshal(item)
	if err != nil {
		return DownloadResult{Ok: false, Errors: []string{"Некорректный объект элемента"}}
	}

	var dItem struct {
		Id          string                  `json:"id"`
		Title       string                  `json:"title"`
		Url         string                  `json:"url"`
		PinUrl      string                  `json:"pinUrl"`
		DownloadUrl string                  `json:"downloadUrl"`
		ImageUrl    string                  `json:"imageUrl"`
		SourceType  string                  `json:"sourceType"`
		Saved       bool                    `json:"saved"`
		Links       []string                `json:"links"`
		Downloads   []resolver.DownloadFile `json:"downloads"`
	}
	if err := json.Unmarshal(rawBytes, &dItem); err != nil {
		return DownloadResult{Ok: false, Errors: []string{"Ошибка структуры элемента"}}
	}

	downloads := dItem.Downloads
	coverUrl := dItem.ImageUrl

	// Для сохраненных ссылок пере-резолвим оригинальный URL (ссылки Patreon и TSR имеют временную подпись)
	if dItem.Saved && (dItem.PinUrl != "" || dItem.Url != "") {
		srcUrl := dItem.PinUrl
		if srcUrl == "" {
			srcUrl = dItem.Url
		}
		fresh := resolver.ResolveLink(srcUrl)
		if fresh.Ok && len(fresh.Downloads) > 0 {
			downloads = fresh.Downloads
			if coverUrl == "" && fresh.ImageUrl != "" {
				coverUrl = fresh.ImageUrl
			}
		}
	}

	// Если список downloads пуст, но есть ссылка — пробуем авто-резолвинг
	if len(downloads) == 0 {
		targetUrl := dItem.DownloadUrl
		if targetUrl == "" {
			targetUrl = dItem.Url
		}

		if dItem.SourceType == "modthesims" && targetUrl != "" {
			mtsRes := GetMtsDetail(targetUrl)
			if len(mtsRes.Downloads) > 0 {
				downloads = mtsRes.Downloads
			}
			if coverUrl == "" && len(mtsRes.Images) > 0 {
				coverUrl = mtsRes.Images[0]
			}
		} else if len(dItem.Links) > 0 {
			tRes := GetTumblrDetail(dItem.Links)
			if len(tRes.Downloads) > 0 {
				downloads = tRes.Downloads
			}
			if coverUrl == "" && len(tRes.Images) > 0 {
				coverUrl = tRes.Images[0]
			}
		}

		if len(downloads) == 0 && targetUrl != "" {
			resolved := resolver.ResolveLink(targetUrl)
			if resolved.Ok && len(resolved.Downloads) > 0 {
				downloads = resolved.Downloads
			} else if resolved.DirectUrl != "" {
				downloads = append(downloads, resolver.DownloadFile{
					Name: resolved.FileName,
					Url:  resolved.DirectUrl,
					Via:  "resolver",
				})
			}
			if coverUrl == "" && resolved.ImageUrl != "" {
				coverUrl = resolved.ImageUrl
			}
		}
	}

	if len(downloads) == 0 {
		return DownloadResult{Ok: false, Errors: []string{"В этом посте нет доступных для скачивания файлов"}}
	}

	var installed []string
	var errors []string
	count := len(downloads)

	for idx, d := range downloads {
		finalPath, err := downloadSingleFile(ctx, dItem.Id, d.Url, d.Name, modsFolder, idx+1, count)
		if err != nil {
			errors = append(errors, fmt.Sprintf("%s: %s", d.Name, err.Error()))
		} else {
			installed = append(installed, finalPath)
			recordDiscoverDownload(dItem.Id, d.Name, finalPath, dItem.Title)
			if coverUrl != "" {
				scanner.SaveExternalThumbnail(finalPath, coverUrl)
			}
		}
	}

	safeEmit(ctx, "discover:progress", DiscoverProgress{
		ItemId:  dItem.Id,
		Percent: 100,
		Status:  "completed",
		Phase:   "done",
	})

	// Фоновый рескан библиотеки
	go func() {
		scanner.ScanMods()
	}()

	return DownloadResult{
		Ok:        len(installed) > 0,
		Installed: installed,
		Errors:    errors,
	}
}

func AddSavedLink(entry any) any {
	discLock.Lock()
	defer discLock.Unlock()

	p := getSavedLinksPath()
	data, _ := os.ReadFile(p)
	var list []map[string]any
	_ = json.Unmarshal(data, &list)

	rawBytes, _ := json.Marshal(entry)
	var itemMap map[string]any
	_ = json.Unmarshal(rawBytes, &itemMap)

	if itemMap == nil || itemMap["id"] == nil {
		return nil
	}

	id := fmt.Sprintf("%v", itemMap["id"])
	itemMap["savedAt"] = time.Now().UTC().Format(time.RFC3339)

	var next []map[string]any
	next = append(next, itemMap)
	for _, it := range list {
		if fmt.Sprintf("%v", it["id"]) != id {
			next = append(next, it)
			if len(next) >= 300 {
				break
			}
		}
	}

	raw, _ := json.MarshalIndent(next, "", "  ")
	_ = os.WriteFile(p, raw, 0644)
	return itemMap
}

func GetSavedLinks() []any {
	discLock.Lock()
	defer discLock.Unlock()

	data, err := os.ReadFile(getSavedLinksPath())
	if err != nil {
		return []any{}
	}
	var res []any
	if json.Unmarshal(data, &res) != nil || res == nil {
		return []any{}
	}
	return res
}

func RemoveSavedLink(id string) bool {
	discLock.Lock()
	defer discLock.Unlock()

	data, err := os.ReadFile(getSavedLinksPath())
	if err != nil {
		return true
	}
	var res []map[string]any
	if json.Unmarshal(data, &res) != nil {
		return true
	}
	var updated []map[string]any
	for _, item := range res {
		if itemId, ok := item["id"].(string); ok && itemId == id {
			continue
		}
		updated = append(updated, item)
	}
	raw, _ := json.MarshalIndent(updated, "", "  ")
	_ = os.WriteFile(getSavedLinksPath(), raw, 0644)
	return true
}

func GetDownloadedDiscover() DownloadedDiscoverResult {
	discLock.Lock()
	defer discLock.Unlock()

	data, err := os.ReadFile(getDiscoverDownloadsPath())
	if err != nil {
		return DownloadedDiscoverResult{Ids: []string{}, Files: []string{}}
	}

	var rawMap map[string]struct {
		Paths []string `json:"paths"`
		Files []string `json:"files"`
		Title string   `json:"title,omitempty"`
	}
	if json.Unmarshal(data, &rawMap) != nil {
		return DownloadedDiscoverResult{Ids: []string{}, Files: []string{}}
	}

	ids := make([]string, 0, len(rawMap))
	files := make([]string, 0)
	changed := false

	for id, it := range rawMap {
		if len(it.Paths) > 0 {
			anyAlive := false
			for _, p := range it.Paths {
				if p != "" {
					if _, err := os.Stat(p); err == nil {
						anyAlive = true
						break
					}
				}
			}
			if !anyAlive {
				delete(rawMap, id)
				changed = true
				continue
			}
		}
		ids = append(ids, id)
		files = append(files, it.Files...)
	}

	if changed {
		if raw, err := json.MarshalIndent(rawMap, "", "  "); err == nil {
			_ = os.WriteFile(getDiscoverDownloadsPath(), raw, 0644)
		}
	}

	return DownloadedDiscoverResult{Ids: ids, Files: files}
}
