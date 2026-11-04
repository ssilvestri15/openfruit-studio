// Parser for the OPENFRUIT preview agent stream (native/preview-agent in
// OPENFRUIT). All integers are little-endian:
//   header  "OFPV" u32 version
//   message u32 type, u32 length, payload
//     type 1 video: u64 presentation_us, u8 keyframe, u16 width, u16 height,
//                   Annex B H.264 access unit

export interface PreviewFrame {
  presentationUs: number;
  keyframe: boolean;
  width: number;
  height: number;
  data: Uint8Array;
}

const MAX_MESSAGE_BYTES = 32 * 1024 * 1024;

export class PreviewStreamParser {
  private buffer = new Uint8Array(0);
  private header = false;

  reset() { this.buffer = new Uint8Array(0); this.header = false; }

  push(chunk: Uint8Array): PreviewFrame[] {
    const merged = new Uint8Array(this.buffer.length + chunk.length);
    merged.set(this.buffer); merged.set(chunk, this.buffer.length);
    this.buffer = merged;
    const frames: PreviewFrame[] = [];
    const view = () => new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
    if (!this.header) {
      if (this.buffer.length < 8) return frames;
      const magic = String.fromCharCode(...this.buffer.subarray(0, 4));
      if (magic !== 'OFPV') throw new Error('Stream di preview non riconosciuto');
      const version = view().getUint32(4, true);
      if (version !== 1) throw new Error(`Versione dello stream di preview non supportata: ${version}`);
      this.buffer = this.buffer.subarray(8);
      this.header = true;
    }
    while (this.buffer.length >= 8) {
      const v = view();
      const type = v.getUint32(0, true), length = v.getUint32(4, true);
      if (length > MAX_MESSAGE_BYTES) throw new Error('Messaggio di preview troppo grande');
      if (this.buffer.length < 8 + length) break;
      const payload = this.buffer.subarray(8, 8 + length);
      if (type === 1 && length >= 13) {
        const p = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
        frames.push({
          presentationUs: Number(p.getBigUint64(0, true)),
          keyframe: p.getUint8(8) === 1,
          width: p.getUint16(9, true),
          height: p.getUint16(11, true),
          data: payload.slice(13)
        });
      }
      // Unknown message types are skipped for forward compatibility.
      this.buffer = this.buffer.subarray(8 + length);
    }
    return frames;
  }
}

// WebCodecs codec string ("avc1.PPCCLL") from the access unit's SPS.
export function h264Codec(data: Uint8Array): string | undefined {
  for (let i = 0; i + 7 < data.length; i++) {
    const startCode = data[i] === 0 && data[i + 1] === 0 && (data[i + 2] === 1 || (data[i + 2] === 0 && data[i + 3] === 1));
    if (!startCode) continue;
    const nal = i + (data[i + 2] === 1 ? 3 : 4);
    if ((data[nal] & 0x1f) === 7) {
      const hex = (byte: number) => byte.toString(16).padStart(2, '0');
      return `avc1.${hex(data[nal + 1])}${hex(data[nal + 2])}${hex(data[nal + 3])}`;
    }
  }
}
