/**
 * Encriptación AES-256-GCM para credenciales de FedeGolf.
 *
 * Las credenciales se almacenan encriptadas en la tabla fedegolf_credentials.
 * La clave de encriptación viene de FEDEGOLF_ENCRYPTION_KEY en .env.local.
 */

import crypto from 'crypto'

const ENCRYPTION_KEY = process.env.FEDEGOLF_ENCRYPTION_KEY || ''
const ALGORITHM = 'aes-256-gcm'

/**
 * Encripta un texto usando AES-256-GCM.
 * Formato de salida: iv:authTag:ciphertext (todo en hex)
 */
export function encrypt(text: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('FEDEGOLF_ENCRYPTION_KEY no configurada')
  }

  const iv = crypto.randomBytes(16)
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')
  return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

/**
 * Desencripta un texto encriptado con encrypt().
 * Espera formato: iv:authTag:ciphertext (todo en hex)
 */
export function decrypt(encrypted: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('FEDEGOLF_ENCRYPTION_KEY no configurada')
  }

  const parts = encrypted.split(':')
  if (parts.length !== 3) {
    throw new Error('Formato de datos encriptados inválido')
  }

  const [ivHex, authTagHex, data] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(data, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
