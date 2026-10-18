package dbpf

import (
	"bytes"
	"compress/zlib"
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"strings"
	"unicode/utf16"
)

// Известные типы ресурсов Sims 4
const (
	TypeThumbnail       uint32 = 0x3c1af1f2
	TypeObjectThumbnail uint32 = 0x3c2a8647
	TypeTextureRLE2     uint32 = 0x3453cf95
	TypeTextureDST      uint32 = 0x2bc04edf
	TypeTextureImage    uint32 = 0x00b2d882
	TypeCasPart         uint32 = 0x034aeecb
	TypeObjectDef       uint32 = 0x319e4f1d
	TypeObjectCatalog   uint32 = 0xc0db5ae7
	TypeSimData         uint32 = 0x545ac67a
	TypeStringTable     uint32 = 0x220557da
	TypePythonTuning    uint32 = 0x6017e896
	TypeXmlTuning       uint32 = 0x0333406c
	TypeAnimation       uint32 = 0x02d5df13
	TypeGeomModel       uint32 = 0x015a1849
	TypeGeomModelAlt    uint32 = 0x01661233
	TypeModelMaterial   uint32 = 0x01d0e75d
)

const (
	CompNone uint16 = 0x0000
	CompZlib uint16 = 0x5a42
)

type Entry struct {
	Type             uint32 `json:"type"`
	Group            uint32 `json:"group"`
	Instance         uint64 `json:"instance"`
	Position         uint32 `json:"position"`
	Size             uint32 `json:"size"`
	DecompressedSize uint32 `json:"decompressedSize"`
	Compression      uint16 `json:"compression"`
}

// Извлекает список записей ресурсов из заголовка пакета DBPF
func ParseEntries(filePath string) ([]Entry, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	header := make([]byte, 96)
	if _, err := io.ReadFull(f, header); err != nil {
		return nil, err
	}

	if string(header[0:4]) != "DBPF" {
		return nil, fmt.Errorf("неверный формат DBPF")
	}

	count := binary.LittleEndian.Uint32(header[0x24:0x28])
	indexSize := binary.LittleEndian.Uint32(header[0x2c:0x30])
	indexPos := binary.LittleEndian.Uint64(header[0x40:0x48])

	if count < 1 || count > 500000 || indexPos < 96 || indexSize < 4 || indexSize > 64*1024*1024 {
		return nil, fmt.Errorf("пустой или поврежденный индекс DBPF")
	}

	if _, err := f.Seek(int64(indexPos), io.SeekStart); err != nil {
		return nil, err
	}

	idxBuf := make([]byte, indexSize)
	if _, err := io.ReadFull(f, idxBuf); err != nil {
		return nil, err
	}

	offset := 0
	flags := binary.LittleEndian.Uint32(idxBuf[offset : offset+4])
	offset += 4

	var cType, cGroup, cInstHi uint32
	if flags&0x1 != 0 {
		cType = binary.LittleEndian.Uint32(idxBuf[offset : offset+4])
		offset += 4
	}
	if flags&0x2 != 0 {
		cGroup = binary.LittleEndian.Uint32(idxBuf[offset : offset+4])
		offset += 4
	}
	if flags&0x4 != 0 {
		cInstHi = binary.LittleEndian.Uint32(idxBuf[offset : offset+4])
		offset += 4
	}

	entries := make([]Entry, 0, count)
	for i := uint32(0); i < count; i++ {
		t, g, iHi := cType, cGroup, cInstHi
		if flags&0x1 == 0 {
			t = binary.LittleEndian.Uint32(idxBuf[offset : offset+4])
			offset += 4
		}
		if flags&0x2 == 0 {
			g = binary.LittleEndian.Uint32(idxBuf[offset : offset+4])
			offset += 4
		}
		if flags&0x4 == 0 {
			iHi = binary.LittleEndian.Uint32(idxBuf[offset : offset+4])
			offset += 4
		}

		iLo := binary.LittleEndian.Uint32(idxBuf[offset : offset+4])
		offset += 4
		pos := binary.LittleEndian.Uint32(idxBuf[offset : offset+4])
		offset += 4
		sizeField := binary.LittleEndian.Uint32(idxBuf[offset : offset+4])
		offset += 4

		size := sizeField & 0x7fffffff
		hasExt := (sizeField & 0x80000000) != 0

		decompSize := binary.LittleEndian.Uint32(idxBuf[offset : offset+4])
		offset += 4

		comp := CompNone
		if hasExt {
			comp = binary.LittleEndian.Uint16(idxBuf[offset : offset+2])
			offset += 4 // uint16 compression + uint16 committed
		}

		inst := (uint64(iHi) << 32) | uint64(iLo)
		entries = append(entries, Entry{
			Type:             t,
			Group:            g,
			Instance:         inst,
			Position:         pos,
			Size:             size,
			DecompressedSize: decompSize,
			Compression:      comp,
		})
	}

	return entries, nil
}

// Распаковывает сжатые данные ресурса
func Decompress(data []byte, comp uint16) ([]byte, error) {
	if comp == CompNone {
		return data, nil
	}
	if comp == CompZlib {
		zr, err := zlib.NewReader(bytes.NewReader(data))
		if err != nil {
			return nil, err
		}
		defer zr.Close()
		return io.ReadAll(zr)
	}
	return data, nil
}

// Читает и распаковывает конкретную запись из файла
func ReadEntry(f *os.File, e Entry) ([]byte, error) {
	if e.Size == 0 || e.Size > 64*1024*1024 || e.DecompressedSize > 64*1024*1024 {
		return nil, fmt.Errorf("недопустимый размер ресурса DBPF")
	}
	if _, err := f.Seek(int64(e.Position), io.SeekStart); err != nil {
		return nil, err
	}
	raw := make([]byte, e.Size)
	if _, err := io.ReadFull(f, raw); err != nil {
		return nil, err
	}
	return Decompress(raw, e.Compression)
}

// Парсит STBL v5 (основной формат строк The Sims 4)
func ParseStblV5(buf []byte) string {
	if len(buf) < 21 || string(buf[0:4]) != "STBL" {
		return ""
	}
	version := binary.LittleEndian.Uint16(buf[4:6])
	if version != 5 {
		return ""
	}

	count := binary.LittleEndian.Uint64(buf[7:15])
	if count == 0 || count > 1000000 {
		return ""
	}

	off := 21
	for i := uint64(0); i < count && off+7 <= len(buf); i++ {
		off += 4 // keyHash
		off += 1 // flags
		length := int(binary.LittleEndian.Uint16(buf[off : off+2]))
		off += 2

		if off+length > len(buf) {
			break
		}

		str := strings.TrimSpace(string(buf[off : off+length]))
		off += length

		if str != "" {
			return cleanString(str)
		}
	}
	return ""
}

// Парсит устаревший формат STBL (UTF-16LE)
func ParseStblLegacy(buf []byte) string {
	if len(buf) < 12 || string(buf[0:4]) != "STBL" {
		return ""
	}
	count := int(binary.LittleEndian.Uint32(buf[6:10]))
	off := 12
	for i := 0; i < count && off+10 <= len(buf); i++ {
		off += 8 // key
		byteLen := int(binary.LittleEndian.Uint16(buf[off : off+2]))
		off += 2

		if off+byteLen > len(buf) {
			break
		}

		raw := buf[off : off+byteLen]
		off += byteLen

		u16 := make([]uint16, len(raw)/2)
		for j := 0; j < len(u16); j++ {
			u16[j] = binary.LittleEndian.Uint16(raw[j*2 : j*2+2])
		}
		str := strings.TrimRight(string(utf16.Decode(u16)), "\x00")
		str = strings.TrimSpace(str)
		if str != "" {
			return cleanString(str)
		}
	}
	return ""
}

func cleanString(s string) string {
	s = strings.ReplaceAll(s, "\\n", " ")
	s = strings.ReplaceAll(s, "\\r", " ")
	s = strings.ReplaceAll(s, "\\t", " ")
	return strings.TrimSpace(s)
}

// Извлекает метаданные пакета: имя из STBL и категории (CAS, Object, Tuning и т.д.)
func ExtractPackageMeta(filePath string, entries []Entry) (string, []string) {
	kindsMap := make(map[string]bool)
	var stblEntries []Entry

	for _, e := range entries {
		switch e.Type {
		case TypeCasPart:
			kindsMap["CAS"] = true
		case TypeObjectDef, TypeObjectCatalog:
			kindsMap["Object"] = true
		case TypePythonTuning, TypeXmlTuning, TypeSimData:
			kindsMap["Tuning"] = true
		case TypeAnimation:
			kindsMap["Animation"] = true
		case TypeStringTable:
			if e.Size > 0 && e.DecompressedSize <= (1<<20) {
				stblEntries = append(stblEntries, e)
			}
		}
	}

	var kinds []string
	for k := range kindsMap {
		kinds = append(kinds, k)
	}

	name := ""
	if len(stblEntries) > 0 {
		f, err := os.Open(filePath)
		if err == nil {
			defer f.Close()
			for _, se := range stblEntries {
				data, err := ReadEntry(f, se)
				if err == nil {
					name = ParseStblV5(data)
					if name == "" {
						name = ParseStblLegacy(data)
					}
					if name != "" {
						break
					}
				}
			}
		}
	}

	return name, kinds
}
