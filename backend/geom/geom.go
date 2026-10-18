package geom

import (
	"encoding/binary"
	"math"
)

type Chunk struct {
	Positions []float32 `json:"positions"`
	Normals   []float32 `json:"normals"`
	UVs       []float32 `json:"uvs"`
	Indices   []uint16  `json:"indices"`
}

type GeomData struct {
	Chunks []Chunk `json:"chunks"`
}

type binaryReader struct {
	buf []byte
	pos int
}

func (r *binaryReader) getUint32() uint32 {
	if r.pos+4 > len(r.buf) {
		r.pos = len(r.buf)
		return 0
	}
	val := binary.LittleEndian.Uint32(r.buf[r.pos : r.pos+4])
	r.pos += 4
	return val
}

func (r *binaryReader) getInt() int32 {
	return int32(r.getUint32())
}

func (r *binaryReader) getShort() uint16 {
	if r.pos+2 > len(r.buf) {
		r.pos = len(r.buf)
		return 0
	}
	val := binary.LittleEndian.Uint16(r.buf[r.pos : r.pos+2])
	r.pos += 2
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

func (r *binaryReader) getFloat() float32 {
	if r.pos+4 > len(r.buf) {
		r.pos = len(r.buf)
		return 0
	}
	bits := binary.LittleEndian.Uint32(r.buf[r.pos : r.pos+4])
	r.pos += 4
	return math.Float32frombits(bits)
}

func (r *binaryReader) skip(n int) {
	r.pos += n
	if r.pos > len(r.buf) {
		r.pos = len(r.buf)
	}
}

const TAG_GEOM = 0x4D4F4547 // "GEOM" (Little Endian)

// Парсер GEOM по алгоритму Sims 4 CC Manager (S4CCM / DBPFReader)
func ParseGeom(buf []byte) *GeomData {
	if len(buf) < 24 {
		return nil
	}

	chunks := parseGeomS4MM(buf)
	if len(chunks) > 0 {
		return &GeomData{Chunks: chunks}
	}

	// Запасной путь парсинга (legacy heuristic)
	chunks = parseGeomLegacy(buf)
	if len(chunks) > 0 {
		return &GeomData{Chunks: chunks}
	}

	return nil
}

type chunkIndex struct {
	position int
	length   int
}

type vertexFormatItem struct {
	value int32 // usage: 1=pos, 2=normal, 3=uv, 7=color
	e1    int32 // dataType
	e2    int   // elementSize
}

func parseGeomS4MM(buf []byte) []Chunk {
	r := &binaryReader{buf: buf, pos: 0}
	_ = r.getInt() // version
	r.skip(8)      // publicChunks, unused
	resourceCount := int(r.getInt())
	chunkCount := int(r.getInt())

	if chunkCount <= 0 || chunkCount > 64 || resourceCount < 0 || resourceCount > 256 {
		return nil
	}

	// Chunk TGIs & External resource TGIs (16 bytes each)
	r.skip(chunkCount*16 + resourceCount*16)
	if r.pos > len(buf) {
		return nil
	}

	indices := make([]chunkIndex, chunkCount)
	for i := 0; i < chunkCount; i++ {
		indices[i] = chunkIndex{
			position: int(r.getInt()),
			length:   int(r.getInt()),
		}
	}

	if chunkCount == 1 {
		indices[0].position = 0x2c + resourceCount*16
		indices[0].length = len(buf) - indices[0].position
	}

	var result []Chunk

	for _, idx := range indices {
		if idx.position < 0 || idx.position >= len(buf) {
			continue
		}
		r.pos = idx.position

		tag := r.getUint32()
		if tag != TAG_GEOM {
			continue
		}

		_ = r.getInt() // chunkVersion
		r.skip(8)      // TGI block list offset & size
		shader := r.getInt()
		if shader != 0 {
			mtnfSize := int(r.getInt())
			mtnfStart := r.pos
			r.pos = mtnfStart + mtnfSize
			if r.pos > len(buf) {
				continue
			}
		}

		_ = r.getInt() // mergeGroup
		_ = r.getInt() // sortOrder
		vertexCount := int(r.getInt())
		if vertexCount <= 0 || vertexCount > 250000 {
			continue
		}

		formatCount := int(r.getInt())
		if formatCount <= 0 || formatCount > 32 {
			continue
		}

		formats := make([]vertexFormatItem, formatCount)
		vertexPartLength := 0
		for f := 0; f < formatCount; f++ {
			val := r.getInt()
			e1 := r.getInt()
			e2 := int(r.getByte())
			formats[f] = vertexFormatItem{value: val, e1: e1, e2: e2}
			vertexPartLength += e2
		}

		if r.pos+vertexPartLength*vertexCount > len(buf) {
			continue
		}

		positions := make([]float32, 0, vertexCount*3)
		normals := make([]float32, 0, vertexCount*3)
		uvs := make([]float32, 0, vertexCount*2)

		for v := 0; v < vertexCount; v++ {
			hasUV := false
			for _, fmtItem := range formats {
				start := r.pos
				switch fmtItem.value {
				case 1:
					positions = append(positions, r.getFloat(), r.getFloat(), r.getFloat())
				case 2:
					normals = append(normals, r.getFloat(), r.getFloat(), r.getFloat())
				case 3:
					u := r.getFloat()
					vCoord := r.getFloat()
					if !hasUV {
						uvs = append(uvs, u, 1.0-vCoord)
						hasUV = true
					}
				}
				r.pos = start + fmtItem.e2
			}
		}

		_ = r.getInt() // numSubMeshes
		facePointSize := int(r.getByte())
		if facePointSize != 2 && facePointSize != 4 {
			continue
		}

		faceDataTotal := int(r.getInt())
		faceCount := faceDataTotal / 3
		if faceCount <= 0 || faceCount > 500000 {
			continue
		}

		if r.pos+faceDataTotal*facePointSize > len(buf) {
			continue
		}

		faceIndices := make([]uint16, 0, faceCount*3)
		for f := 0; f < faceCount*3; f++ {
			if facePointSize == 2 {
				faceIndices = append(faceIndices, r.getShort())
			} else {
				faceIndices = append(faceIndices, uint16(r.getUint32()&0xFFFF))
			}
		}

		if len(positions) > 0 && len(faceIndices) > 0 {
			result = append(result, Chunk{
				Positions: positions,
				Normals:   normals,
				UVs:       uvs,
				Indices:   faceIndices,
			})
		}
	}

	return result
}

func parseGeomLegacy(buf []byte) []Chunk {
	r := &binaryReader{buf: buf, pos: 0}
	_ = r.getInt()
	r.skip(12)
	chunkCount := int(r.getInt())
	if chunkCount <= 0 || chunkCount > 64 {
		return nil
	}

	var chunks []Chunk
	for c := 0; c < chunkCount; c++ {
		r.skip(24)
		_ = r.getInt()
		_ = r.getInt()
		r.skip(28)
		shaderDataLen := int(r.getInt())
		for s := 0; s < shaderDataLen; s++ {
			_ = r.getInt()
			r.skip(12)
		}
		r.skip(8)

		found := false
		pre1, pre2 := int32(1), int32(1)
		maxSearch := 512
		if len(buf)-r.pos-16 < maxSearch {
			maxSearch = len(buf) - r.pos - 16
		}

		for k := maxSearch; k >= 0; k-- {
			v := r.getInt()
			next := r.getInt()
			r.pos -= 4
			if v > 0 && v < 12 && next > 0 && next < 12 && pre1 == 0 && pre2 != 0 {
				r.pos -= 8
				found = true
				break
			}
			pre1 = pre2
			pre2 = v
		}

		if !found {
			continue
		}

		vertexCount := int(r.getInt())
		formatCount := int(r.getInt())
		if vertexCount <= 0 || vertexCount > 250000 || formatCount <= 0 || formatCount > 32 {
			continue
		}

		type vf struct {
			fType int32
			e1    int32
			e2    byte
		}
		formats := make([]vf, formatCount)
		for f := 0; f < formatCount; f++ {
			formats[f] = vf{
				fType: r.getInt(),
				e1:    r.getInt(),
				e2:    r.getByte(),
			}
		}

		positions := make([]float32, 0, vertexCount*3)
		normals := make([]float32, 0, vertexCount*3)
		uvs := make([]float32, 0, vertexCount*2)

		for v := 0; v < vertexCount; v++ {
			hasUV := false
			for _, fmtItem := range formats {
				switch fmtItem.fType {
				case 1:
					positions = append(positions, r.getFloat(), r.getFloat(), r.getFloat())
				case 2:
					normals = append(normals, r.getFloat(), r.getFloat(), r.getFloat())
				case 3:
					u := r.getFloat()
					vCoord := r.getFloat()
					if !hasUV {
						uvs = append(uvs, u, 1.0-vCoord)
						hasUV = true
					}
				case 7:
					_ = r.getInt()
				case 4, 5, 0xa:
					r.skip(4)
				case 6:
					r.skip(12)
				default:
					r.skip(4)
				}
			}
		}

		r.skip(5)
		faceDataTotal := int(r.getInt())
		faceCount := faceDataTotal / 3
		if faceCount <= 0 || faceCount > 500000 {
			continue
		}

		indices := make([]uint16, 0, faceCount*3)
		for f := 0; f < faceCount; f++ {
			indices = append(indices, r.getShort(), r.getShort(), r.getShort())
		}

		chunks = append(chunks, Chunk{
			Positions: positions,
			Normals:   normals,
			UVs:       uvs,
			Indices:   indices,
		})
	}
	return chunks
}
