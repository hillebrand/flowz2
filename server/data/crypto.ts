import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { Resource } from 'sst'

// Encryptie-at-rest voor de Google Calendar-tokens (code review 2026-07-30, besluit
// Hillebrand). Zonder dit heeft iedereen met het Turso-databasetoken, een database-export
// of een lek aan Turso's kant doorlopende toegang tot Eveliens échte agenda — volledig
// buiten Flowz om. AD-5 dekt app-secrets, niet gebruikerstokens; dit sluit dat gat.
//
// AES-256-GCM: authenticated encryption, dus geknoei met de ciphertext in de database komt
// als een decryptiefout naar boven i.p.v. als stilletjes verkeerde bytes.
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96 bits, de aanbevolen nonce-lengte voor GCM
const KEY_LENGTH = 32 // 256 bits

let _key: Buffer | undefined

function getKey(): Buffer {
  if (!_key) {
    // Lazy, net als `getDb()` en de OAuth-handler: `Resource.*` gooit bij een inactieve
    // SST-link, en op module-scope zou dat elke route meetrekken die deze module aanraakt.
    const key = Buffer.from(Resource.TokenEncryptionKey.value, 'base64')

    if (key.length !== KEY_LENGTH) {
      throw new Error(
        `TokenEncryptionKey moet ${KEY_LENGTH} bytes base64 zijn (nu ${key.length}). `
        + 'Genereer een nieuwe met `openssl rand -base64 32`.'
      )
    }

    _key = key
  }

  return _key
}

// Opslagvorm: `iv.authTag.ciphertext`, alle drie base64. Een punt is veilig als scheidingsteken
// omdat base64 zelf geen punten bevat.
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])

  return [
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64')
  ].join('.')
}

export function decryptToken(payload: string): string {
  const [iv, authTag, ciphertext] = payload.split('.')

  if (!iv || !authTag || !ciphertext) {
    throw new Error('Versleuteld token heeft niet de verwachte vorm `iv.authTag.ciphertext`.')
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8')
}
