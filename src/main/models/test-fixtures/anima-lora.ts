/** Real ordinary F32 Linear LoRA payloads; no mocked qualifier or model-service boundary. */
export type AnimaLoraTensorFixture = {
  dtype?: 'BF16' | 'F16' | 'F32'
  key: string
  scalarBits?: number
  shape: readonly number[]
  value?: number
}

export function packAnimaLora(entries: readonly AnimaLoraTensorFixture[]): Buffer {
  const header: Record<string, { data_offsets: number[]; dtype: string; shape: number[] }> = {}
  const chunks: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const dtype = entry.dtype ?? 'F32'
    const elements = entry.shape.reduce((total, dimension) => total * dimension, 1)
    const bytes = Buffer.alloc(elements * (dtype === 'F32' ? 4 : 2))
    for (let index = 0; index < elements; index++) {
      if (dtype === 'F32') {
        bytes.writeFloatLE(entry.value ?? 0.125, index * 4)
      } else {
        bytes.writeUInt16LE(entry.scalarBits ?? 0, index * 2)
      }
    }
    header[entry.key] = {
      data_offsets: [offset, offset + bytes.length],
      dtype,
      shape: [...entry.shape],
    }
    chunks.push(bytes)
    offset += bytes.length
  }
  const json = Buffer.from(JSON.stringify(header))
  const padded = Buffer.concat([json, Buffer.alloc((8 - (json.length % 8)) % 8, 0x20)])
  const prefix = Buffer.alloc(8)
  prefix.writeBigUInt64LE(BigInt(padded.length))
  return Buffer.concat([prefix, padded, ...chunks])
}

export function animaLoraFixture(value = 0.125): Buffer {
  const stem = 'lora_unet_blocks_0_cross_attn_k_proj'
  return packAnimaLora([
    { key: `${stem}.lora_down.weight`, shape: [1, 1024], value },
    { key: `${stem}.lora_up.weight`, shape: [2048, 1], value },
    { key: `${stem}.alpha`, shape: [], value: 1 },
  ])
}
