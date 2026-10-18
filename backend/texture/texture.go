package texture

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"image"
	"image/png"
)

type mipHeader struct {
	commandOffset uint32
	offset2       uint32
	offset3       uint32
	offset0       uint32
	offset1       uint32
}

// Преобразует распакованный буфер ресурса RLE2 в стандартный заголовок и блоки DDS DXT5
func Rle2ToDds(buf []byte) []byte {
	if len(buf) < 16 {
		return nil
	}

	width := binary.LittleEndian.Uint16(buf[8:10])
	height := binary.LittleEndian.Uint16(buf[10:12])
	mipCount := binary.LittleEndian.Uint16(buf[12:14])

	if width == 0 || height == 0 || mipCount == 0 || mipCount > 20 {
		return nil
	}

	mipHeaders := make([]mipHeader, 0, mipCount+1)
	pos := 16
	for i := uint16(0); i < mipCount; i++ {
		if pos+20 > len(buf) {
			break
		}
		mipHeaders = append(mipHeaders, mipHeader{
			commandOffset: binary.LittleEndian.Uint32(buf[pos : pos+4]),
			offset2:       binary.LittleEndian.Uint32(buf[pos+4 : pos+8]),
			offset3:       binary.LittleEndian.Uint32(buf[pos+8 : pos+12]),
			offset0:       binary.LittleEndian.Uint32(buf[pos+12 : pos+16]),
			offset1:       binary.LittleEndian.Uint32(buf[pos+16 : pos+20]),
		})
		pos += 20
	}

	if len(mipHeaders) < int(mipCount) {
		return nil
	}

	mipHeaders = append(mipHeaders, mipHeader{
		commandOffset: mipHeaders[0].commandOffset,
		offset2:       mipHeaders[0].offset2,
		offset3:       mipHeaders[0].offset3,
		offset0:       mipHeaders[0].offset0,
		offset1:       uint32(len(buf)),
	})

	// DDS Header (128 байт)
	ddsHeader := make([]byte, 128)
	copy(ddsHeader[0:4], "DDS ")
	binary.LittleEndian.PutUint32(ddsHeader[4:8], 124)        // dwSize
	binary.LittleEndian.PutUint32(ddsHeader[8:12], 0x000a1007) // dwFlags
	binary.LittleEndian.PutUint32(ddsHeader[12:16], uint32(height))
	binary.LittleEndian.PutUint32(ddsHeader[16:20], uint32(width))
	pitch := uint32((int(width)+3)/4) * 16
	if pitch == 0 {
		pitch = 16
	}
	binary.LittleEndian.PutUint32(ddsHeader[20:24], pitch)
	binary.LittleEndian.PutUint32(ddsHeader[24:28], 1) // depth
	binary.LittleEndian.PutUint32(ddsHeader[28:32], uint32(mipCount))

	// DDPF: FourCC всегда DXT5 для Sims 4 RLE2
	binary.LittleEndian.PutUint32(ddsHeader[76:80], 32) // dwSize
	binary.LittleEndian.PutUint32(ddsHeader[80:84], 4)  // DDPF_FOURCC
	copy(ddsHeader[84:88], "DXT5")

	// Caps
	binary.LittleEndian.PutUint32(ddsHeader[108:112], 0x00401008)

	// ВАЖНО: полностью прозрачный черный блок (все 16 байт = 0, никакого зеленого 0x0500!)
	fullTransparent := make([]byte, 16)
	fullOpaqueAlpha := []byte{
		0x00, 0x05, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
	}

	var out bytes.Buffer
	out.Write(ddsHeader)

	for m := 0; m < int(mipCount); m++ {
		cur := mipHeaders[m]
		next := mipHeaders[m+1]
		b0 := int(cur.offset0)
		b1 := int(cur.offset1)
		b2 := int(cur.offset2)
		b3 := int(cur.offset3)

		for cOff := int(cur.commandOffset); cOff < int(next.commandOffset); cOff += 2 {
			if cOff+2 > len(buf) {
				break
			}
			cmd := binary.LittleEndian.Uint16(buf[cOff : cOff+2])
			op := cmd & 3
			count := int(cmd >> 2)

			switch op {
			case 0:
				for j := 0; j < count; j++ {
					out.Write(fullTransparent)
				}
			case 1:
				for j := 0; j < count; j++ {
					if b0+2 > len(buf) || b1+6 > len(buf) || b2+4 > len(buf) || b3+4 > len(buf) {
						break
					}
					out.Write(buf[b0 : b0+2])
					out.Write(buf[b1 : b1+6])
					out.Write(buf[b2 : b2+4])
					out.Write(buf[b3 : b3+4])
					b0 += 2
					b1 += 6
					b2 += 4
					b3 += 4
				}
			case 2:
				for j := 0; j < count; j++ {
					if b2+4 > len(buf) || b3+4 > len(buf) {
						break
					}
					out.Write(fullOpaqueAlpha)
					out.Write(buf[b2 : b2+4])
					out.Write(buf[b3 : b3+4])
					b2 += 4
					b3 += 4
				}
			}
		}
	}

	blockBytes := 16
	expectedTotal := 128
	w := int(width)
	h := int(height)
	for m := 0; m < int(mipCount); m++ {
		dataLen := ((max(4, w)) / 4) * ((max(4, h)) / 4) * blockBytes
		expectedTotal += dataLen
		w = max(w>>1, 1)
		h = max(h>>1, 1)
	}

	result := out.Bytes()
	if len(result) < expectedTotal {
		padding := make([]byte, expectedTotal-len(result))
		result = append(result, padding...)
	}

	return result
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

type rgb struct {
	r, g, b uint8
}

func alphaArray(a0, a1 uint8) [8]uint8 {
	var arr [8]uint8
	arr[0] = a0
	arr[1] = a1
	if a0 > a1 {
		arr[2] = uint8((6*uint32(a0) + 1*uint32(a1)) / 7)
		arr[3] = uint8((5*uint32(a0) + 2*uint32(a1)) / 7)
		arr[4] = uint8((4*uint32(a0) + 3*uint32(a1)) / 7)
		arr[5] = uint8((3*uint32(a0) + 4*uint32(a1)) / 7)
		arr[6] = uint8((2*uint32(a0) + 5*uint32(a1)) / 7)
		arr[7] = uint8((1*uint32(a0) + 6*uint32(a1)) / 7)
	} else {
		arr[2] = uint8((4*uint32(a0) + 1*uint32(a1)) / 5)
		arr[3] = uint8((3*uint32(a0) + 2*uint32(a1)) / 5)
		arr[4] = uint8((2*uint32(a0) + 3*uint32(a1)) / 5)
		arr[5] = uint8((1*uint32(a0) + 4*uint32(a1)) / 5)
		arr[6] = 0
		arr[7] = 255
	}
	return arr
}

func colorArray(c0, c1 uint16) [4]rgb {
	r0 := uint8(((c0 >> 11) & 0x1F) << 3 | ((c0 >> 11) & 0x1F) >> 2)
	g0 := uint8(((c0 >> 5) & 0x3F) << 2 | ((c0 >> 5) & 0x3F) >> 4)
	b0 := uint8((c0 & 0x1F) << 3 | (c0 & 0x1F) >> 2)

	r1 := uint8(((c1 >> 11) & 0x1F) << 3 | ((c1 >> 11) & 0x1F) >> 2)
	g1 := uint8(((c1 >> 5) & 0x3F) << 2 | ((c1 >> 5) & 0x3F) >> 4)
	b1 := uint8((c1 & 0x1F) << 3 | (c1 & 0x1F) >> 2)

	col0 := rgb{r0, g0, b0}
	col1 := rgb{r1, g1, b1}

	var arr [4]rgb
	arr[0] = col0
	arr[1] = col1

	if c0 > c1 {
		arr[2] = rgb{
			r: uint8((2*uint32(col0.r) + uint32(col1.r)) / 3),
			g: uint8((2*uint32(col0.g) + uint32(col1.g)) / 3),
			b: uint8((2*uint32(col0.b) + uint32(col1.b)) / 3),
		}
		arr[3] = rgb{
			r: uint8((uint32(col0.r) + 2*uint32(col1.r)) / 3),
			g: uint8((uint32(col0.g) + 2*uint32(col1.g)) / 3),
			b: uint8((uint32(col0.b) + 2*uint32(col1.b)) / 3),
		}
	} else {
		arr[2] = rgb{
			r: uint8((uint32(col0.r) + uint32(col1.r)) / 2),
			g: uint8((uint32(col0.g) + uint32(col1.g)) / 2),
			b: uint8((uint32(col0.b) + uint32(col1.b)) / 2),
		}
		arr[3] = rgb{0, 0, 0}
	}
	return arr
}

// Прямой декодер RLE2 в RGBA без промежуточных потерь (алгоритм S4MM Rel2Helper)
func DecodeRLE2Direct(buf []byte) (*image.NRGBA, error) {
	if len(buf) < 16 {
		return nil, fmt.Errorf("buffer too short")
	}
	width := int(binary.LittleEndian.Uint16(buf[8:10]))
	height := int(binary.LittleEndian.Uint16(buf[10:12]))
	mipCount := int(binary.LittleEndian.Uint16(buf[12:14]))

	if width <= 0 || height <= 0 || mipCount <= 0 {
		return nil, fmt.Errorf("invalid dimensions")
	}

	type mipHdr struct {
		cmdOff, off2, off3, off0, off1 int
	}

	mipHeaders := make([]mipHdr, 0, mipCount+1)
	pos := 16
	for i := 0; i < mipCount; i++ {
		if pos+20 > len(buf) {
			break
		}
		mipHeaders = append(mipHeaders, mipHdr{
			cmdOff: int(binary.LittleEndian.Uint32(buf[pos : pos+4])),
			off2:   int(binary.LittleEndian.Uint32(buf[pos+4 : pos+8])),
			off3:   int(binary.LittleEndian.Uint32(buf[pos+8 : pos+12])),
			off0:   int(binary.LittleEndian.Uint32(buf[pos+12 : pos+16])),
			off1:   int(binary.LittleEndian.Uint32(buf[pos+16 : pos+20])),
		})
		pos += 20
	}

	if len(mipHeaders) < 1 {
		return nil, fmt.Errorf("no mip headers")
	}

	nextCmdOff := len(buf)
	if len(mipHeaders) > 1 {
		nextCmdOff = mipHeaders[1].cmdOff
	}

	img := image.NewNRGBA(image.Rect(0, 0, width, height))

	mip0 := mipHeaders[0]
	bOff0 := mip0.off0
	bOff1 := mip0.off1
	bOff2 := mip0.off2
	bOff3 := mip0.off3

	xOffset := 0
	yOffset := 0

	for cmdOff := mip0.cmdOff; cmdOff < nextCmdOff; cmdOff += 2 {
		if cmdOff+2 > len(buf) {
			break
		}
		cmd := binary.LittleEndian.Uint16(buf[cmdOff : cmdOff+2])
		op := cmd & 3
		count := int(cmd >> 2)

		switch op {
		case 0:
			// Прозрачный черный блок (0, 0, 0, 0) — точно как в S4MM Rel2Helper
			for j := 0; j < count; j++ {
				xOffset += 4
				if xOffset >= width {
					xOffset = 0
					yOffset += 4
				}
			}
		case 1:
			for j := 0; j < count; j++ {
				if bOff0+2 > len(buf) || bOff1+6 > len(buf) || bOff2+4 > len(buf) || bOff3+4 > len(buf) {
					break
				}
				a0 := buf[bOff0]
				a1 := buf[bOff0+1]
				bOff0 += 2

				var aMap uint64
				for i := 0; i < 6; i++ {
					aMap |= uint64(buf[bOff1+i]) << (8 * i)
				}
				bOff1 += 6
				alphaArr := alphaArray(a0, a1)

				c0 := binary.LittleEndian.Uint16(buf[bOff2 : bOff2+2])
				c1 := binary.LittleEndian.Uint16(buf[bOff2+2 : bOff2+4])
				bOff2 += 4

				cMap := binary.LittleEndian.Uint32(buf[bOff3 : bOff3+4])
				bOff3 += 4
				colArr := colorArray(c0, c1)

				curPos := 0
				for y := 0; y < 4; y++ {
					for x := 0; x < 4; x++ {
						ax := xOffset + x
						ay := yOffset + y
						if ax < width && ay < height {
							colPos := (cMap >> (2 * curPos)) & 3
							alphaPos := (aMap >> (3 * curPos)) & 7
							col := colArr[colPos]
							a := alphaArr[alphaPos]

							pIdx := (ay*width + ax) * 4
							img.Pix[pIdx] = col.r
							img.Pix[pIdx+1] = col.g
							img.Pix[pIdx+2] = col.b
							img.Pix[pIdx+3] = a
						}
						curPos++
					}
				}
				xOffset += 4
				if xOffset >= width {
					xOffset = 0
					yOffset += 4
				}
			}
		case 2:
			for j := 0; j < count; j++ {
				if bOff2+4 > len(buf) || bOff3+4 > len(buf) {
					break
				}
				c0 := binary.LittleEndian.Uint16(buf[bOff2 : bOff2+2])
				c1 := binary.LittleEndian.Uint16(buf[bOff2+2 : bOff2+4])
				bOff2 += 4

				cMap := binary.LittleEndian.Uint32(buf[bOff3 : bOff3+4])
				bOff3 += 4
				colArr := colorArray(c0, c1)

				curPos := 0
				for y := 0; y < 4; y++ {
					for x := 0; x < 4; x++ {
						ax := xOffset + x
						ay := yOffset + y
						if ax < width && ay < height {
							colPos := (cMap >> (2 * curPos)) & 3
							col := colArr[colPos]
							pIdx := (ay*width + ax) * 4
							img.Pix[pIdx] = col.r
							img.Pix[pIdx+1] = col.g
							img.Pix[pIdx+2] = col.b
							img.Pix[pIdx+3] = 255
						}
						curPos++
					}
				}
				xOffset += 4
				if xOffset >= width {
					xOffset = 0
					yOffset += 4
				}
			}
		}
	}
	return img, nil
}

// Преобразует ресурс RLE2 в готовый PNG буфер (быстро, нативно, без артефактов зеленого)
func Rle2ToPng(rle2Buf []byte) ([]byte, error) {
	img, err := DecodeRLE2Direct(rle2Buf)
	if err == nil {
		var buf bytes.Buffer
		if err := png.Encode(&buf, img); err == nil {
			return buf.Bytes(), nil
		}
	}

	// Fallback через DDS
	dds := Rle2ToDds(rle2Buf)
	if len(dds) == 0 {
		return nil, fmt.Errorf("failed to decompress RLE2")
	}
	return DdsToPng(dds)
}

// Конвертация 16-битного цвета RGB565 в 24-битный RGB
func dxtColorToRGB(c uint16) rgb {
	return rgb{
		r: uint8(uint32((c>>11)&0x1F) * 255 / 31),
		g: uint8(uint32((c>>5)&0x3F) * 255 / 63),
		b: uint8(uint32(c&0x1F) * 255 / 31),
	}
}

func interpolateRGB(c0, c1 rgb, w0, w1, total uint32) rgb {
	return rgb{
		r: uint8((uint32(c0.r)*w0 + uint32(c1.r)*w1) / total),
		g: uint8((uint32(c0.g)*w0 + uint32(c1.g)*w1) / total),
		b: uint8((uint32(c0.b)*w0 + uint32(c1.b)*w1) / total),
	}
}

func getAlphaDXT5(a0, a1 uint8, alphaIndex int) uint8 {
	if a0 > a1 {
		switch alphaIndex {
		case 0:
			return a0
		case 1:
			return a1
		case 2:
			return uint8((6*uint32(a0) + 1*uint32(a1)) / 7)
		case 3:
			return uint8((5*uint32(a0) + 2*uint32(a1)) / 7)
		case 4:
			return uint8((4*uint32(a0) + 3*uint32(a1)) / 7)
		case 5:
			return uint8((3*uint32(a0) + 4*uint32(a1)) / 7)
		case 6:
			return uint8((2*uint32(a0) + 5*uint32(a1)) / 7)
		case 7:
			return uint8((1*uint32(a0) + 6*uint32(a1)) / 7)
		default:
			return 0
		}
	} else {
		switch alphaIndex {
		case 0:
			return a0
		case 1:
			return a1
		case 2:
			return uint8((4*uint32(a0) + 1*uint32(a1)) / 5)
		case 3:
			return uint8((3*uint32(a0) + 2*uint32(a1)) / 5)
		case 4:
			return uint8((2*uint32(a0) + 3*uint32(a1)) / 5)
		case 5:
			return uint8((1*uint32(a0) + 4*uint32(a1)) / 5)
		case 6:
			return 0
		case 7:
			return 255
		default:
			return 0
		}
	}
}

// Распаковка первого мипмапа DXT5 в несжатый массив пикселей
func DecodeDXT5(dds []byte) (*image.NRGBA, error) {
	if len(dds) < 128 {
		return nil, fmt.Errorf("dds data too short")
	}
	height := int(binary.LittleEndian.Uint32(dds[12:16]))
	width := int(binary.LittleEndian.Uint32(dds[16:20]))
	if width <= 0 || height <= 0 || width > 8192 || height > 8192 {
		return nil, fmt.Errorf("invalid dimensions: %dx%d", width, height)
	}

	img := image.NewNRGBA(image.Rect(0, 0, width, height))
	offset := 128

	for y := 0; y < height; y += 4 {
		for x := 0; x < width; x += 4 {
			if offset+16 > len(dds) {
				return img, nil
			}
			a0 := dds[offset]
			a1 := dds[offset+1]
			aMapLow := uint64(binary.LittleEndian.Uint16(dds[offset+2 : offset+4]))
			aMapMid := uint64(binary.LittleEndian.Uint16(dds[offset+4 : offset+6]))
			aMapHigh := uint64(binary.LittleEndian.Uint16(dds[offset+6 : offset+8]))
			fullAMap := (aMapHigh << 32) | (aMapMid << 16) | aMapLow

			c0 := binary.LittleEndian.Uint16(dds[offset+8 : offset+10])
			c1 := binary.LittleEndian.Uint16(dds[offset+10 : offset+12])
			cMap := binary.LittleEndian.Uint32(dds[offset+12 : offset+16])
			offset += 16

			col0 := dxtColorToRGB(c0)
			col1 := dxtColorToRGB(c1)
			palette := [4]rgb{
				col0,
				col1,
				interpolateRGB(col0, col1, 2, 1, 3),
				interpolateRGB(col0, col1, 1, 2, 3),
			}

			for i := 0; i < 16; i++ {
				px := x + (i % 4)
				py := y + (i / 4)
				if px < width && py < height {
					colorIndex := (cMap >> (i * 2)) & 0x03
					c := palette[colorIndex]
					alphaIndex := int((fullAMap >> (i * 3)) & 0x07)
					a := getAlphaDXT5(a0, a1, alphaIndex)

					pIdx := (py*width + px) * 4
					img.Pix[pIdx] = c.r
					img.Pix[pIdx+1] = c.g
					img.Pix[pIdx+2] = c.b
					img.Pix[pIdx+3] = a
				}
			}
		}
	}

	return img, nil
}

// Распаковка первого мипмапа DXT1 в несжатый массив пикселей
func DecodeDXT1(dds []byte) (*image.NRGBA, error) {
	if len(dds) < 128 {
		return nil, fmt.Errorf("dds data too short")
	}
	height := int(binary.LittleEndian.Uint32(dds[12:16]))
	width := int(binary.LittleEndian.Uint32(dds[16:20]))
	if width <= 0 || height <= 0 || width > 8192 || height > 8192 {
		return nil, fmt.Errorf("invalid dimensions: %dx%d", width, height)
	}

	img := image.NewNRGBA(image.Rect(0, 0, width, height))
	offset := 128

	for y := 0; y < height; y += 4 {
		for x := 0; x < width; x += 4 {
			if offset+8 > len(dds) {
				return img, nil
			}
			c0 := binary.LittleEndian.Uint16(dds[offset : offset+2])
			c1 := binary.LittleEndian.Uint16(dds[offset+2 : offset+4])
			cMap := binary.LittleEndian.Uint32(dds[offset+4 : offset+8])
			offset += 8

			col0 := dxtColorToRGB(c0)
			col1 := dxtColorToRGB(c1)
			isOpaque := c0 > c1

			var palette [4]rgb
			palette[0] = col0
			palette[1] = col1
			if isOpaque {
				palette[2] = interpolateRGB(col0, col1, 2, 1, 3)
				palette[3] = interpolateRGB(col0, col1, 1, 2, 3)
			} else {
				palette[2] = interpolateRGB(col0, col1, 1, 1, 2)
				palette[3] = rgb{0, 0, 0}
			}

			for i := 0; i < 16; i++ {
				px := x + (i % 4)
				py := y + (i / 4)
				if px < width && py < height {
					colorIndex := (cMap >> (i * 2)) & 0x03
					c := palette[colorIndex]
					var a uint8 = 255
					if !isOpaque && colorIndex == 3 {
						a = 0
					}

					pIdx := (py*width + px) * 4
					img.Pix[pIdx] = c.r
					img.Pix[pIdx+1] = c.g
					img.Pix[pIdx+2] = c.b
					img.Pix[pIdx+3] = a
				}
			}
		}
	}

	return img, nil
}

// Преобразует DDS (DXT5 или DXT1) в стандартный PNG буфер
func DdsToPng(dds []byte) ([]byte, error) {
	if len(dds) < 128 {
		return nil, fmt.Errorf("dds data too short")
	}
	fourcc := binary.LittleEndian.Uint32(dds[84:88])

	var img *image.NRGBA
	var err error
	if fourcc == 0x35545844 { // 'DXT5'
		img, err = DecodeDXT5(dds)
	} else if fourcc == 0x31545844 { // 'DXT1'
		img, err = DecodeDXT1(dds)
	} else {
		img, err = DecodeDXT5(dds)
	}

	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// Преобразует текстуру Sims 4 DST (DST1 / DST5 с перемешанными блоками) в стандартный DDS (DXT1 / DXT5)
func DstToDds(buf []byte) []byte {
	if len(buf) < 128 || string(buf[:4]) != "DDS " {
		return buf
	}
	fourcc := binary.LittleEndian.Uint32(buf[84:88])
	payload := buf[128:]

	if fourcc == 0x31545344 { // "DST1" -> "DXT1"
		blockCount := len(payload) / 8
		if blockCount <= 0 {
			return buf
		}
		out := make([]byte, 128+blockCount*8)
		copy(out[:128], buf[:128])
		copy(out[84:88], "DXT1")

		off0 := 0
		off1 := blockCount * 4
		dstPos := 128
		for i := 0; i < blockCount; i++ {
			copy(out[dstPos:dstPos+4], payload[off0+i*4:off0+i*4+4])
			copy(out[dstPos+4:dstPos+8], payload[off1+i*4:off1+i*4+4])
			dstPos += 8
		}
		return out
	}

	if fourcc == 0x35545344 { // "DST5" -> "DXT5"
		blockCount := len(payload) / 16
		if blockCount <= 0 {
			return buf
		}
		out := make([]byte, 128+blockCount*16)
		copy(out[:128], buf[:128])
		copy(out[84:88], "DXT5")

		off0 := 0               // 2 байта alpha endpoints
		off2 := blockCount * 2  // 4 байта color endpoints
		off1 := blockCount * 6  // 6 байт alpha indices
		off3 := blockCount * 12 // 4 байта color indices
		dstPos := 128
		for i := 0; i < blockCount; i++ {
			copy(out[dstPos:dstPos+2], payload[off0+i*2:off0+i*2+2])
			copy(out[dstPos+2:dstPos+8], payload[off1+i*6:off1+i*6+6])
			copy(out[dstPos+8:dstPos+12], payload[off2+i*4:off2+i*4+4])
			copy(out[dstPos+12:dstPos+16], payload[off3+i*4:off3+i*4+4])
			dstPos += 16
		}
		return out
	}

	return buf
}
