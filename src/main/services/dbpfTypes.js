// Shared Sims 4 DBPF resource-type knowledge.

// Friendly names for the resource types worth surfacing to the user in the
// inspector. Anything unmapped is grouped under "Other".
export const TYPE_LABELS = {
  0x3c1af1f2: 'Thumbnail',
  0x3453cf95: 'Texture',
  0x2bc04edf: 'Texture (DST)',
  0x00b2d882: 'Texture (image)',
  0x034aeecb: 'CAS part',
  0x319e4f1d: 'Object definition',
  0x545ac67a: 'Data (SimData)',
  0x220557da: 'String table',
  0x6017e896: 'Python/tuning',
  0x02d5df13: 'Animation',
  0x01661233: 'Model (geometry)',
  0x01d0e75d: 'Model (material)'
}

// Coarse card badges: resource type → what kind of mod content it signals.
export const KIND_OF_TYPE = {
  0x034aeecb: 'CAS',
  0x319e4f1d: 'Object',
  0xc0db5ae7: 'Object', // object catalog
  0x6017e896: 'Tuning',
  0x0333406c: 'Tuning', // XML tuning
  0x545ac67a: 'Tuning', // SimData rides along with tuning
  0x02d5df13: 'Animation'
}

// TS4 String Table resource (display names live here)
export const STBL_TYPE = 0x220557da
