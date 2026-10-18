export namespace actions {
	
	export class ToggleResult {
	    ok: boolean;
	    mod?: scanner.LocalModDTO;
	    oldPath?: string;
	    newPath?: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new ToggleResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.mod = this.convertValues(source["mod"], scanner.LocalModDTO);
	        this.oldPath = source["oldPath"];
	        this.newPath = source["newPath"];
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BatchToggleResult {
	    ok: boolean;
	    count: number;
	    results: ToggleResult[];
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new BatchToggleResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.count = source["count"];
	        this.results = this.convertValues(source["results"], ToggleResult);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DeleteResult {
	    ok: boolean;
	    count: number;
	    removed: string[];
	    deleted: string[];
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new DeleteResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.count = source["count"];
	        this.removed = source["removed"];
	        this.deleted = source["deleted"];
	        this.error = source["error"];
	    }
	}

}

export namespace config {
	
	export class CacheResult {
	    success: boolean;
	    alreadyGone?: boolean;
	    cleared: string[];
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new CacheResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.alreadyGone = source["alreadyGone"];
	        this.cleared = source["cleared"];
	        this.error = source["error"];
	    }
	}
	export class Config {
	    modsFolder: string;
	    gamePath: string;
	    gameLanguage: string;
	    curseForgeApiKey: string;
	    tumblrApiKey: string;
	    tumblrFeedTags?: string[];
	    theme: string;
	    locale: string;
	    language: string;
	    autoScan: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.modsFolder = source["modsFolder"];
	        this.gamePath = source["gamePath"];
	        this.gameLanguage = source["gameLanguage"];
	        this.curseForgeApiKey = source["curseForgeApiKey"];
	        this.tumblrApiKey = source["tumblrApiKey"];
	        this.tumblrFeedTags = source["tumblrFeedTags"];
	        this.theme = source["theme"];
	        this.locale = source["locale"];
	        this.language = source["language"];
	        this.autoScan = source["autoScan"];
	    }
	}
	export class ValidationResult {
	    ok: boolean;
	    exists: boolean;
	    valid: boolean;
	    looksValid: boolean;
	    isMods: boolean;
	    inSims4Path: boolean;
	    hasResourceCfg: boolean;
	    hasPackages: boolean;
	    packageCount: number;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new ValidationResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.exists = source["exists"];
	        this.valid = source["valid"];
	        this.looksValid = source["looksValid"];
	        this.isMods = source["isMods"];
	        this.inSims4Path = source["inSims4Path"];
	        this.hasResourceCfg = source["hasResourceCfg"];
	        this.hasPackages = source["hasPackages"];
	        this.packageCount = source["packageCount"];
	        this.message = source["message"];
	    }
	}

}

export namespace conflicts {
	
	export class ConflictResource {
	    key: string;
	    typeHex: string;
	    typeName: string;
	
	    static createFrom(source: any = {}) {
	        return new ConflictResource(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.typeHex = source["typeHex"];
	        this.typeName = source["typeName"];
	    }
	}
	export class FileItem {
	    filePath: string;
	    fileName: string;
	    relativePath: string;
	    size: number;
	    modifiedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new FileItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filePath = source["filePath"];
	        this.fileName = source["fileName"];
	        this.relativePath = source["relativePath"];
	        this.size = source["size"];
	        this.modifiedAt = source["modifiedAt"];
	    }
	}
	export class ConflictPair {
	    id: string;
	    fileA: FileItem;
	    fileB: FileItem;
	    resources: ConflictResource[];
	
	    static createFrom(source: any = {}) {
	        return new ConflictPair(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.fileA = this.convertValues(source["fileA"], FileItem);
	        this.fileB = this.convertValues(source["fileB"], FileItem);
	        this.resources = this.convertValues(source["resources"], ConflictResource);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ConflictStats {
	    totalFilesScanned: number;
	    duplicateGroupsCount: number;
	    duplicateFilesCount: number;
	    totalWastedBytes: number;
	    tgiConflictsCount: number;
	
	    static createFrom(source: any = {}) {
	        return new ConflictStats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.totalFilesScanned = source["totalFilesScanned"];
	        this.duplicateGroupsCount = source["duplicateGroupsCount"];
	        this.duplicateFilesCount = source["duplicateFilesCount"];
	        this.totalWastedBytes = source["totalWastedBytes"];
	        this.tgiConflictsCount = source["tgiConflictsCount"];
	    }
	}
	export class DuplicateGroup {
	    hash: string;
	    size: number;
	    wastedBytes: number;
	    files: FileItem[];
	
	    static createFrom(source: any = {}) {
	        return new DuplicateGroup(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hash = source["hash"];
	        this.size = source["size"];
	        this.wastedBytes = source["wastedBytes"];
	        this.files = this.convertValues(source["files"], FileItem);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ConflictScanResult {
	    ok: boolean;
	    duplicates: DuplicateGroup[];
	    conflicts: ConflictPair[];
	    stats: ConflictStats;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new ConflictScanResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.duplicates = this.convertValues(source["duplicates"], DuplicateGroup);
	        this.conflicts = this.convertValues(source["conflicts"], ConflictPair);
	        this.stats = this.convertValues(source["stats"], ConflictStats);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	

}

export namespace curseforge {
	
	export class ApiResponse {
	    data: any;
	    pagination?: any;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new ApiResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.data = source["data"];
	        this.pagination = source["pagination"];
	        this.error = source["error"];
	    }
	}
	export class CheckUpdatesResult {
	    ok: boolean;
	    fromCache?: boolean;
	    checkedAt: string;
	    updates: any[];
	    mods: any[];
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new CheckUpdatesResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.fromCache = source["fromCache"];
	        this.checkedAt = source["checkedAt"];
	        this.updates = source["updates"];
	        this.mods = source["mods"];
	        this.error = source["error"];
	    }
	}
	export class DescriptionResult {
	    html: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new DescriptionResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.html = source["html"];
	        this.error = source["error"];
	    }
	}
	export class DownloadResult {
	    ok: boolean;
	    path?: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new DownloadResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.path = source["path"];
	        this.error = source["error"];
	    }
	}
	export class SearchParams {
	    searchFilter: string;
	    classId?: number;
	    categoryId?: number;
	    categoryIds: number[];
	    index: number;
	    pageSize: number;
	    sortField?: number;
	    sortOrder?: string;
	
	    static createFrom(source: any = {}) {
	        return new SearchParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.searchFilter = source["searchFilter"];
	        this.classId = source["classId"];
	        this.categoryId = source["categoryId"];
	        this.categoryIds = source["categoryIds"];
	        this.index = source["index"];
	        this.pageSize = source["pageSize"];
	        this.sortField = source["sortField"];
	        this.sortOrder = source["sortOrder"];
	    }
	}

}

export namespace discover {
	
	export class Source {
	    id: string;
	    type: string;
	    input: string;
	    label: string;
	    addedAt: string;
	    builtin?: boolean;
	    count: number;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new Source(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.input = source["input"];
	        this.label = source["label"];
	        this.addedAt = source["addedAt"];
	        this.builtin = source["builtin"];
	        this.count = source["count"];
	        this.error = source["error"];
	    }
	}
	export class DiscoverItem {
	    id: string;
	    sourceId: string;
	    sourceLabel: string;
	    sourceType: string;
	    title: string;
	    author: string;
	    avatarUrl?: string;
	    summary: string;
	    imageUrl: string;
	    images?: string[];
	    downloadUrl?: string;
	    url: string;
	    pageUrl?: string;
	    date: string;
	    publishedAt?: string;
	    contentType?: string;
	    locked: boolean;
	    downloads?: resolver.DownloadFile[];
	    candidateLinks?: string[];
	    links?: string[];
	    tags?: string[];
	    notes?: number;
	    reblog?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DiscoverItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.sourceId = source["sourceId"];
	        this.sourceLabel = source["sourceLabel"];
	        this.sourceType = source["sourceType"];
	        this.title = source["title"];
	        this.author = source["author"];
	        this.avatarUrl = source["avatarUrl"];
	        this.summary = source["summary"];
	        this.imageUrl = source["imageUrl"];
	        this.images = source["images"];
	        this.downloadUrl = source["downloadUrl"];
	        this.url = source["url"];
	        this.pageUrl = source["pageUrl"];
	        this.date = source["date"];
	        this.publishedAt = source["publishedAt"];
	        this.contentType = source["contentType"];
	        this.locked = source["locked"];
	        this.downloads = this.convertValues(source["downloads"], resolver.DownloadFile);
	        this.candidateLinks = source["candidateLinks"];
	        this.links = source["links"];
	        this.tags = source["tags"];
	        this.notes = source["notes"];
	        this.reblog = source["reblog"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DiscoverFeedResult {
	    ok: boolean;
	    items: DiscoverItem[];
	    sources: Source[];
	    fetchedAt: string;
	    hasMore: boolean;
	    cursor?: string;
	    cursors?: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new DiscoverFeedResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.items = this.convertValues(source["items"], DiscoverItem);
	        this.sources = this.convertValues(source["sources"], Source);
	        this.fetchedAt = source["fetchedAt"];
	        this.hasMore = source["hasMore"];
	        this.cursor = source["cursor"];
	        this.cursors = source["cursors"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class DownloadResult {
	    ok: boolean;
	    installed: string[];
	    errors: string[];
	
	    static createFrom(source: any = {}) {
	        return new DownloadResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.installed = source["installed"];
	        this.errors = source["errors"];
	    }
	}
	export class DownloadedDiscoverResult {
	    ids: string[];
	    files: string[];
	
	    static createFrom(source: any = {}) {
	        return new DownloadedDiscoverResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ids = source["ids"];
	        this.files = source["files"];
	    }
	}
	export class FollowPayload {
	    type: string;
	    input: string;
	    label?: string;
	
	    static createFrom(source: any = {}) {
	        return new FollowPayload(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.input = source["input"];
	        this.label = source["label"];
	    }
	}
	export class MtsDetailResult {
	    ok: boolean;
	    downloads: resolver.DownloadFile[];
	    images: string[];
	
	    static createFrom(source: any = {}) {
	        return new MtsDetailResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.downloads = this.convertValues(source["downloads"], resolver.DownloadFile);
	        this.images = source["images"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PinterestTagFeedResult {
	    ok: boolean;
	    items: DiscoverItem[];
	    cursors: Record<string, string>;
	    hasMore: boolean;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new PinterestTagFeedResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.items = this.convertValues(source["items"], DiscoverItem);
	        this.cursors = source["cursors"];
	        this.hasMore = source["hasMore"];
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class SourceFeedResult {
	    ok: boolean;
	    items: DiscoverItem[];
	    label: string;
	    nextCursor: any;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new SourceFeedResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.items = this.convertValues(source["items"], DiscoverItem);
	        this.label = source["label"];
	        this.nextCursor = source["nextCursor"];
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SourceTypeInfo {
	    type: string;
	    label: string;
	    hint: string;
	
	    static createFrom(source: any = {}) {
	        return new SourceTypeInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.label = source["label"];
	        this.hint = source["hint"];
	    }
	}
	export class SuggestedSource {
	    type: string;
	    input: string;
	    label: string;
	    tag: string;
	    followed: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SuggestedSource(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.input = source["input"];
	        this.label = source["label"];
	        this.tag = source["tag"];
	        this.followed = source["followed"];
	    }
	}
	export class TumblrDetailResult {
	    ok: boolean;
	    downloads: resolver.DownloadFile[];
	    images?: string[];
	
	    static createFrom(source: any = {}) {
	        return new TumblrDetailResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.downloads = this.convertValues(source["downloads"], resolver.DownloadFile);
	        this.images = source["images"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TumblrTagFeedResult {
	    ok: boolean;
	    items: DiscoverItem[];
	    cursors: Record<string, number>;
	    hasMore: boolean;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new TumblrTagFeedResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.items = this.convertValues(source["items"], DiscoverItem);
	        this.cursors = source["cursors"];
	        this.hasMore = source["hasMore"];
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace downloader {
	
	export class QueueJob {
	    id: string;
	    kind: string;
	    itemId: string;
	    modId?: number;
	    sourceType: string;
	    title: string;
	    author?: string;
	    imageUrl?: string;
	    isUpdate?: boolean;
	    status: string;
	    phase: string;
	    percent: number;
	    received: number;
	    total: number;
	    fileIndex?: number;
	    fileCount?: number;
	    error?: string;
	    installedPaths?: string[];
	    createdAt: string;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new QueueJob(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.kind = source["kind"];
	        this.itemId = source["itemId"];
	        this.modId = source["modId"];
	        this.sourceType = source["sourceType"];
	        this.title = source["title"];
	        this.author = source["author"];
	        this.imageUrl = source["imageUrl"];
	        this.isUpdate = source["isUpdate"];
	        this.status = source["status"];
	        this.phase = source["phase"];
	        this.percent = source["percent"];
	        this.received = source["received"];
	        this.total = source["total"];
	        this.fileIndex = source["fileIndex"];
	        this.fileCount = source["fileCount"];
	        this.error = source["error"];
	        this.installedPaths = source["installedPaths"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}

}

export namespace extractor {
	
	export class ExtractFailure {
	    name: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new ExtractFailure(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.error = source["error"];
	    }
	}
	export class ExtractAllResult {
	    ok: boolean;
	    extracted: number;
	    failed: ExtractFailure[];
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new ExtractAllResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.extracted = source["extracted"];
	        this.failed = this.convertValues(source["failed"], ExtractFailure);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ExtractResult {
	    ok: boolean;
	    folder?: string;
	    files?: string[];
	    trayFiles?: string[];
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new ExtractResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.folder = source["folder"];
	        this.files = source["files"];
	        this.trayFiles = source["trayFiles"];
	        this.error = source["error"];
	    }
	}
	export class ImportItemResult {
	    source: string;
	    kind: string;
	    ok: boolean;
	    dest?: string;
	    folder?: string;
	    files?: string[];
	    trayFiles?: string[];
	    note?: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new ImportItemResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.source = source["source"];
	        this.kind = source["kind"];
	        this.ok = source["ok"];
	        this.dest = source["dest"];
	        this.folder = source["folder"];
	        this.files = source["files"];
	        this.trayFiles = source["trayFiles"];
	        this.note = source["note"];
	        this.error = source["error"];
	    }
	}
	export class ImportFilesResult {
	    ok: boolean;
	    results: ImportItemResult[];
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new ImportFilesResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.results = this.convertValues(source["results"], ImportItemResult);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace geom {
	
	export class Chunk {
	    positions: number[];
	    normals: number[];
	    uvs: number[];
	    indices: number[];
	
	    static createFrom(source: any = {}) {
	        return new Chunk(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.positions = source["positions"];
	        this.normals = source["normals"];
	        this.uvs = source["uvs"];
	        this.indices = source["indices"];
	    }
	}

}

export namespace inspector {
	
	export class ResourceTypeCount {
	    label: string;
	    count: number;
	
	    static createFrom(source: any = {}) {
	        return new ResourceTypeCount(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.label = source["label"];
	        this.count = source["count"];
	    }
	}
	export class PackageContentsSummary {
	    total: number;
	    types: ResourceTypeCount[];
	
	    static createFrom(source: any = {}) {
	        return new PackageContentsSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.total = source["total"];
	        this.types = this.convertValues(source["types"], ResourceTypeCount);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SiblingFile {
	    name: string;
	    size: number;
	    ext: string;
	    isSelf: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SiblingFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.size = source["size"];
	        this.ext = source["ext"];
	        this.isSelf = source["isSelf"];
	    }
	}
	export class InspectResult {
	    ok: boolean;
	    folder: string;
	    files: SiblingFile[];
	    packageContents?: PackageContentsSummary;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new InspectResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.folder = source["folder"];
	        this.files = this.convertValues(source["files"], SiblingFile);
	        this.packageContents = this.convertValues(source["packageContents"], PackageContentsSummary);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	

}

export namespace main {
	
	export class CatalogResult {
	    last_updated?: string;
	    creators: any[];
	    items: any[];
	
	    static createFrom(source: any = {}) {
	        return new CatalogResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.last_updated = source["last_updated"];
	        this.creators = source["creators"];
	        this.items = source["items"];
	    }
	}

}

export namespace model3d {
	
	export class SwatchItem {
	    index: number;
	    colors: string[];
	
	    static createFrom(source: any = {}) {
	        return new SwatchItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.index = source["index"];
	        this.colors = source["colors"];
	    }
	}
	export class Model3DResult {
	    has3D: boolean;
	    type?: string;
	    bodyType?: number;
	    swatches?: SwatchItem[];
	    currentSwatchIndex: number;
	    meshes?: geom.Chunk[];
	    mannequinMeshes?: any[];
	    textureUrl?: string;
	    textureDdsBase64?: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new Model3DResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.has3D = source["has3D"];
	        this.type = source["type"];
	        this.bodyType = source["bodyType"];
	        this.swatches = this.convertValues(source["swatches"], SwatchItem);
	        this.currentSwatchIndex = source["currentSwatchIndex"];
	        this.meshes = this.convertValues(source["meshes"], geom.Chunk);
	        this.mannequinMeshes = source["mannequinMeshes"];
	        this.textureUrl = source["textureUrl"];
	        this.textureDdsBase64 = source["textureDdsBase64"];
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace polycount {
	
	export class PolyModItem {
	    filePath: string;
	    fileName: string;
	    relativePath: string;
	    size: number;
	    enabled: boolean;
	    polygons: number;
	    totalPolygons: number;
	    vertices: number;
	    geomCount: number;
	    severity: string;
	
	    static createFrom(source: any = {}) {
	        return new PolyModItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filePath = source["filePath"];
	        this.fileName = source["fileName"];
	        this.relativePath = source["relativePath"];
	        this.size = source["size"];
	        this.enabled = source["enabled"];
	        this.polygons = source["polygons"];
	        this.totalPolygons = source["totalPolygons"];
	        this.vertices = source["vertices"];
	        this.geomCount = source["geomCount"];
	        this.severity = source["severity"];
	    }
	}
	export class PolySummary {
	    totalScannedWithGeom: number;
	    criticalCount: number;
	    heavyCount: number;
	    mediumCount: number;
	    lowCount: number;
	
	    static createFrom(source: any = {}) {
	        return new PolySummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.totalScannedWithGeom = source["totalScannedWithGeom"];
	        this.criticalCount = source["criticalCount"];
	        this.heavyCount = source["heavyCount"];
	        this.mediumCount = source["mediumCount"];
	        this.lowCount = source["lowCount"];
	    }
	}
	export class PolyScanResult {
	    ok: boolean;
	    mods: PolyModItem[];
	    summary: PolySummary;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new PolyScanResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.mods = this.convertValues(source["mods"], PolyModItem);
	        this.summary = this.convertValues(source["summary"], PolySummary);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace profiles {
	
	export class ProfileToggleError {
	    file: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new ProfileToggleError(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.file = source["file"];
	        this.error = source["error"];
	    }
	}
	export class ApplyProfileResult {
	    ok: boolean;
	    changed: number;
	    errors?: ProfileToggleError[];
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new ApplyProfileResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.changed = source["changed"];
	        this.errors = this.convertValues(source["errors"], ProfileToggleError);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Profile {
	    id: string;
	    name: string;
	    createdAt: string;
	    states: Record<string, boolean>;
	
	    static createFrom(source: any = {}) {
	        return new Profile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.createdAt = source["createdAt"];
	        this.states = source["states"];
	    }
	}
	export class ProfileStoreData {
	    profiles: Profile[];
	    activeId?: string;
	
	    static createFrom(source: any = {}) {
	        return new ProfileStoreData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.profiles = this.convertValues(source["profiles"], Profile);
	        this.activeId = source["activeId"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class SaveProfilePayload {
	    id?: string;
	    name: string;
	    mods: scanner.LocalModDTO[];
	
	    static createFrom(source: any = {}) {
	        return new SaveProfilePayload(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.mods = this.convertValues(source["mods"], scanner.LocalModDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace resolver {
	
	export class DownloadFile {
	    name: string;
	    url: string;
	    via?: string;
	
	    static createFrom(source: any = {}) {
	        return new DownloadFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.url = source["url"];
	        this.via = source["via"];
	    }
	}
	export class ResolvedLink {
	    ok: boolean;
	    id?: string;
	    title?: string;
	    author?: string;
	    avatarUrl?: string;
	    summary?: string;
	    sourceType?: string;
	    url?: string;
	    directUrl?: string;
	    fileName?: string;
	    imageUrl?: string;
	    images?: string[];
	    openUrl?: string;
	    reason?: string;
	    locked?: boolean;
	    via?: string;
	    downloads?: DownloadFile[];
	
	    static createFrom(source: any = {}) {
	        return new ResolvedLink(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.id = source["id"];
	        this.title = source["title"];
	        this.author = source["author"];
	        this.avatarUrl = source["avatarUrl"];
	        this.summary = source["summary"];
	        this.sourceType = source["sourceType"];
	        this.url = source["url"];
	        this.directUrl = source["directUrl"];
	        this.fileName = source["fileName"];
	        this.imageUrl = source["imageUrl"];
	        this.images = source["images"];
	        this.openUrl = source["openUrl"];
	        this.reason = source["reason"];
	        this.locked = source["locked"];
	        this.via = source["via"];
	        this.downloads = this.convertValues(source["downloads"], DownloadFile);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace saves {
	
	export class SaveFileDTO {
	    fileName: string;
	    filePath: string;
	    size: number;
	    modifiedAt: number;
	    thumbnailUrl?: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveFileDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.fileName = source["fileName"];
	        this.filePath = source["filePath"];
	        this.size = source["size"];
	        this.modifiedAt = source["modifiedAt"];
	        this.thumbnailUrl = source["thumbnailUrl"];
	    }
	}
	export class ListSavesResult {
	    ok: boolean;
	    savesFolder: string;
	    saves: SaveFileDTO[];
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new ListSavesResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.savesFolder = source["savesFolder"];
	        this.saves = this.convertValues(source["saves"], SaveFileDTO);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SaveAnalysisStats {
	    totalModsCount: number;
	    usedCount: number;
	    unusedCount: number;
	    usedSizeBytes: number;
	    unusedSizeBytes: number;
	    totalSizeBytes: number;
	
	    static createFrom(source: any = {}) {
	        return new SaveAnalysisStats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.totalModsCount = source["totalModsCount"];
	        this.usedCount = source["usedCount"];
	        this.unusedCount = source["unusedCount"];
	        this.usedSizeBytes = source["usedSizeBytes"];
	        this.unusedSizeBytes = source["unusedSizeBytes"];
	        this.totalSizeBytes = source["totalSizeBytes"];
	    }
	}
	export class SaveModInfo {
	    fileName: string;
	    filePath: string;
	    relativePath: string;
	    size: number;
	    enabled: boolean;
	    modifiedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new SaveModInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.fileName = source["fileName"];
	        this.filePath = source["filePath"];
	        this.relativePath = source["relativePath"];
	        this.size = source["size"];
	        this.enabled = source["enabled"];
	        this.modifiedAt = source["modifiedAt"];
	    }
	}
	export class SaveAnalysisResult {
	    ok: boolean;
	    savePath: string;
	    saveName: string;
	    usedMods: SaveModInfo[];
	    unusedMods: SaveModInfo[];
	    stats: SaveAnalysisStats;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveAnalysisResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.savePath = source["savePath"];
	        this.saveName = source["saveName"];
	        this.usedMods = this.convertValues(source["usedMods"], SaveModInfo);
	        this.unusedMods = this.convertValues(source["unusedMods"], SaveModInfo);
	        this.stats = this.convertValues(source["stats"], SaveAnalysisStats);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	

}

export namespace scanner {
	
	export class ThumbnailDTO {
	    source: string;
	    path?: string;
	
	    static createFrom(source: any = {}) {
	        return new ThumbnailDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.source = source["source"];
	        this.path = source["path"];
	    }
	}
	export class LocalModDTO {
	    id: string;
	    name: string;
	    author?: string;
	    fileName: string;
	    filePath: string;
	    relativePath: string;
	    folderPath: string;
	    type: string;
	    enabled: boolean;
	    size: number;
	    modifiedAt: string;
	    dateAdded?: string;
	    kinds: string[];
	    has3D: boolean;
	    thumbnail: ThumbnailDTO;
	    parseStatus: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new LocalModDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.author = source["author"];
	        this.fileName = source["fileName"];
	        this.filePath = source["filePath"];
	        this.relativePath = source["relativePath"];
	        this.folderPath = source["folderPath"];
	        this.type = source["type"];
	        this.enabled = source["enabled"];
	        this.size = source["size"];
	        this.modifiedAt = source["modifiedAt"];
	        this.dateAdded = source["dateAdded"];
	        this.kinds = source["kinds"];
	        this.has3D = source["has3D"];
	        this.thumbnail = this.convertValues(source["thumbnail"], ThumbnailDTO);
	        this.parseStatus = source["parseStatus"];
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ScanError {
	    file: string;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new ScanError(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.file = source["file"];
	        this.message = source["message"];
	    }
	}
	export class ScanResult {
	    ok: boolean;
	    count: number;
	    scannedAt: string;
	    mods: LocalModDTO[];
	    errors: ScanError[];
	
	    static createFrom(source: any = {}) {
	        return new ScanResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.count = source["count"];
	        this.scannedAt = source["scannedAt"];
	        this.mods = this.convertValues(source["mods"], LocalModDTO);
	        this.errors = this.convertValues(source["errors"], ScanError);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace swiper {
	
	export class MobileServerStatus {
	    running: boolean;
	    port: number;
	    ip: string;
	    url: string;
	    qrCodeDataUrl: string;
	
	    static createFrom(source: any = {}) {
	        return new MobileServerStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.running = source["running"];
	        this.port = source["port"];
	        this.ip = source["ip"];
	        this.url = source["url"];
	        this.qrCodeDataUrl = source["qrCodeDataUrl"];
	    }
	}
	export class SwiperActionPayload {
	    modId: string;
	    filePath: string;
	    action: string;
	
	    static createFrom(source: any = {}) {
	        return new SwiperActionPayload(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.modId = source["modId"];
	        this.filePath = source["filePath"];
	        this.action = source["action"];
	    }
	}
	export class SwiperActionResult {
	    ok: boolean;
	    action: string;
	    card?: scanner.LocalModDTO;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new SwiperActionResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.action = source["action"];
	        this.card = this.convertValues(source["card"], scanner.LocalModDTO);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SwiperStats {
	    total: number;
	    reviewed: number;
	    remaining: number;
	    historyCount: number;
	
	    static createFrom(source: any = {}) {
	        return new SwiperStats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.total = source["total"];
	        this.reviewed = source["reviewed"];
	        this.remaining = source["remaining"];
	        this.historyCount = source["historyCount"];
	    }
	}
	export class SwiperCardsResult {
	    cards: scanner.LocalModDTO[];
	    stats: SwiperStats;
	
	    static createFrom(source: any = {}) {
	        return new SwiperCardsResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cards = this.convertValues(source["cards"], scanner.LocalModDTO);
	        this.stats = this.convertValues(source["stats"], SwiperStats);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SwiperQueryOpts {
	    filter: string;
	    folder: string;
	    onlyUnreviewed: boolean;
	    shuffle: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SwiperQueryOpts(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filter = source["filter"];
	        this.folder = source["folder"];
	        this.onlyUnreviewed = source["onlyUnreviewed"];
	        this.shuffle = source["shuffle"];
	    }
	}

}

export namespace updater {
	
	export class UpdateInfo {
	    currentVersion: string;
	    latestVersion: string;
	    hasUpdate: boolean;
	    releaseName: string;
	    releaseNotes: string;
	    publishedAt: string;
	    downloadUrl: string;
	    assetSize: number;
	    assetName: string;
	    isZip: boolean;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.currentVersion = source["currentVersion"];
	        this.latestVersion = source["latestVersion"];
	        this.hasUpdate = source["hasUpdate"];
	        this.releaseName = source["releaseName"];
	        this.releaseNotes = source["releaseNotes"];
	        this.publishedAt = source["publishedAt"];
	        this.downloadUrl = source["downloadUrl"];
	        this.assetSize = source["assetSize"];
	        this.assetName = source["assetName"];
	        this.isZip = source["isZip"];
	    }
	}

}

export namespace watcher {
	
	export class InstallCaughtResult {
	    ok: boolean;
	    results: extractor.ImportItemResult[];
	    recordedModId?: number;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new InstallCaughtResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.results = this.convertValues(source["results"], extractor.ImportItemResult);
	        this.recordedModId = source["recordedModId"];
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class InstallPayload {
	    path: string;
	    filePath: string;
	    mod?: any;
	
	    static createFrom(source: any = {}) {
	        return new InstallPayload(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.filePath = source["filePath"];
	        this.mod = source["mod"];
	    }
	}

}

