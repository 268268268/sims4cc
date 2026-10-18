package casp

import (
	"encoding/binary"
	"fmt"
)

type CaspData struct {
	BodyType   int      `json:"bodyType"`
	Swatches   []string `json:"swatches"`
	DiffuseKey string   `json:"diffuseKey"`
	GeomKeys   []string `json:"geomKeys"`
}

type binaryReader struct {
	buf []byte
	pos int
}

func (r *binaryReader) getInt() int32 {
	if r.pos+4 > len(r.buf) {
		return 0
	}
	val := int32(binary.LittleEndian.Uint32(r.buf[r.pos : r.pos+4]))
	r.pos += 4
	return val
}

func (r *binaryReader) getByte() byte {
	if r.pos >= len(r.buf) {
		return 0
	}
	val := r.buf[r.pos]
	r.pos++
	return val
}

func (r *binaryReader) skip(n int) {
	r.pos += n
	if r.pos > len(r.buf) {
		r.pos = len(r.buf)
	}
}

// Парсит ресурс CASP
func ParseCasp(buf []byte) *CaspData {
	if len(buf) < 32 {
		return nil
	}

	r := &binaryReader{buf: buf, pos: 0}
	version := int(r.getInt())
	tgiOffset := int(r.getInt()) + 8
	_ = r.getInt() // presetCount

	// Чтение LEB128 имени
	nameLen := 0
	shift := 0
	for {
		b := r.getByte()
		nameLen |= int(b&0x7f) << shift
		if (b & 0x80) == 0 {
			break
		}
		shift += 7
	}
	r.skip(nameLen)
	r.skip(4 + 2 + 4 + 4)

	if version >= 0x32 {
		r.skip(28)
	} else if version >= 0x29 {
		r.skip(26)
	} else if version == 0x28 {
		r.skip(18)
	} else if version == 0x25 {
		r.skip(17)
	} else if version <= 0x20 {
		r.skip(13)
	}

	lengthFlag := int(r.getInt() & 0xff)
	for i := 0; i < lengthFlag; i++ {
		r.skip(4)
		if version >= 0x21 {
			r.skip(2)
		}
	}

	if version >= 0x2b {
		r.skip(17)
	} else if version <= 0x2a {
		r.skip(13)
	}

	bodyType := int(r.getInt())
	r.skip(8) // bodySubType, ageGender

	if version >= 0x25 {
		r.skip(16)
	} else if version == 0x20 {
		r.skip(6)
	} else {
		r.skip(2)
	}

	swatchCount := int(r.getByte())
	var swatches []string
	for s := 0; s < swatchCount; s++ {
		c := uint32(r.getInt())
		rCol := (c >> 16) & 0xff
		gCol := (c >> 8) & 0xff
		bCol := c & 0xff
		swatches = append(swatches, fmt.Sprintf("rgb(%d,%d,%d)", rCol, gCol, bCol))
	}

	if version >= 0x2e {
		r.skip(102 - 4)
	} else if version >= 0x28 {
		r.skip(49 - 4)
	} else if version == 0x20 {
		r.skip(33 - 4)
	} else {
		r.skip(12)
	}

	_ = r.getInt() // sortLayer
	lodLength := int(r.getByte())

	type lodItem struct {
		level       byte
		geomIndices []byte
	}
	var lods []lodItem

	for l := 0; l < lodLength; l++ {
		level := r.getByte()
		r.skip(4)
		assetListLen := int(r.getByte())
		r.skip(assetListLen * 12)
		geomIndexLen := int(r.getByte())
		var geomIndices []byte
		for gi := 0; gi < geomIndexLen; gi++ {
			geomIndices = append(geomIndices, r.getByte())
		}
		lods = append(lods, lodItem{level: level, geomIndices: geomIndices})
	}

	slotLen := int(r.getByte())
	r.skip(slotLen)

	diffuseIndex := int(r.getByte())

	// Таблица TGI
	r.pos = tgiOffset
	tgiCount := int(r.getByte())
	var tgis []string
	for i := 0; i < tgiCount; i++ {
		if r.pos+16 > len(buf) {
			break
		}
		inst := binary.LittleEndian.Uint64(buf[r.pos : r.pos+8])
		r.pos += 8
		grp := binary.LittleEndian.Uint32(buf[r.pos : r.pos+4])
		r.pos += 4
		typ := binary.LittleEndian.Uint32(buf[r.pos : r.pos+4])
		r.pos += 4

		tgis = append(tgis, fmt.Sprintf("%08x-%08x-%016x", typ, grp, inst))
	}

	diffuseKey := ""
	if diffuseIndex < len(tgis) {
		diffuseKey = tgis[diffuseIndex]
	}

	var geomKeys []string
	var chosenLod *lodItem
	for i := range lods {
		if lods[i].level == 0 {
			chosenLod = &lods[i]
			break
		}
	}
	if chosenLod == nil && len(lods) > 0 {
		chosenLod = &lods[0]
	}

	if chosenLod != nil {
		for _, idx := range chosenLod.geomIndices {
			if int(idx) < len(tgis) {
				geomKeys = append(geomKeys, tgis[idx])
			}
		}
	}

	if len(swatches) == 0 {
		swatches = []string{"#888888"}
	}

	return &CaspData{
		BodyType:   bodyType,
		Swatches:   swatches,
		DiffuseKey: diffuseKey,
		GeomKeys:   geomKeys,
	}
}
