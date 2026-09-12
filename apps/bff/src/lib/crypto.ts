import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from './env'

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12

function key(): Buffer {
  const raw = Buffer.from(env().SESSION_ENC_KEY, 'base64')
  if (raw.length !== 32) {
    throw new Error('SESSION_ENC_KEY must be 32 bytes, base64 encoded')
  }
  return raw
}

/** iv.ciphertext.tag, each base64url, joined by "." */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [iv, ct, cipher.getAuthTag()].map((b) => b.toString('base64url')).join('.')
}

export function decrypt(blob: string): string {
  const [iv, ct, tag] = blob.split('.').map((p) => Buffer.from(p, 'base64url'))
  if (!iv || !ct || !tag) throw new Error('malformed ciphertext')
  const decipher = createDecipheriv(ALGO, key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

/** 32 bytes of entropy, base64url. Used for session ids and OAuth state. */
export function opaqueId(): string {
  return randomBytes(32).toString('base64url')
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}
