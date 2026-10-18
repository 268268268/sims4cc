package dbpf

import (
	"encoding/binary"
	"testing"
	"unicode/utf16"
)

func TestParseStblV5(t *testing.T) {
	name := "Настоящее Имя Мода"
	nameBytes := []byte(name)

	buf := make([]byte, 21+7+len(nameBytes))
	copy(buf[0:4], "STBL")
	binary.LittleEndian.PutUint16(buf[4:6], 5)
	buf[6] = 0 // uncompressed
	binary.LittleEndian.PutUint64(buf[7:15], 1)
	binary.LittleEndian.PutUint32(buf[17:21], uint32(len(nameBytes)))

	off := 21
	binary.LittleEndian.PutUint32(buf[off:off+4], 0x12345678)
	buf[off+4] = 0
	binary.LittleEndian.PutUint16(buf[off+5:off+7], uint16(len(nameBytes)))
	copy(buf[off+7:], nameBytes)

	got := ParseStblV5(buf)
	if got != name {
		t.Fatalf("expected '%s', got '%s'", name, got)
	}
}

func TestParseStblLegacy(t *testing.T) {
	name := "Hello Mod"
	u16 := utf16.Encode([]rune(name))
	u16Bytes := make([]byte, len(u16)*2)
	for i, v := range u16 {
		binary.LittleEndian.PutUint16(u16Bytes[i*2:i*2+2], v)
	}

	buf := make([]byte, 12+10+len(u16Bytes))
	copy(buf[0:4], "STBL")
	binary.LittleEndian.PutUint16(buf[4:6], 5)
	binary.LittleEndian.PutUint32(buf[6:10], 1)

	off := 12
	binary.LittleEndian.PutUint16(buf[off+8:off+10], uint16(len(u16Bytes)))
	copy(buf[off+10:], u16Bytes)

	got := ParseStblLegacy(buf)
	if got != name {
		t.Fatalf("expected '%s', got '%s'", name, got)
	}
}
