import fs from 'fs'
import path from 'path'
import { app, safeStorage } from 'electron'

class SimpleStore {
  constructor() {
    this.path = path.join(app.getPath('userData'), 'config.json')
    this.data = this._read()
  }

  _read() {
    try {
      if (fs.existsSync(this.path)) {
        const fileBuffer = fs.readFileSync(this.path)
        let raw = ''

        // Try decrypting with safeStorage (DPAPI) first
        if (safeStorage && safeStorage.isEncryptionAvailable()) {
          try {
            raw = safeStorage.decryptString(fileBuffer)
          } catch (decErr) {
            // If DPAPI decryption fails, it may be a legacy plaintext JSON file
            raw = fileBuffer.toString('utf-8')
          }
        } else {
          raw = fileBuffer.toString('utf-8')
        }

        if (raw && raw.trim().startsWith('{')) {
          const parsed = JSON.parse(raw)
          // If the file on disk was unencrypted plaintext JSON and encryption is available,
          // automatically migrate and encrypt it on disk immediately
          if (
            fileBuffer.toString('utf-8').trim().startsWith('{') &&
            safeStorage &&
            safeStorage.isEncryptionAvailable()
          ) {
            try {
              fs.writeFileSync(this.path, safeStorage.encryptString(raw))
              console.log('[SimpleStore] Auto-migrated legacy plaintext config.json to DPAPI encrypted storage.')
            } catch (migErr) {
              console.error('Failed to auto-migrate config.json to DPAPI:', migErr.message)
            }
          }
          return parsed
        }
      }
    } catch (e) {
      console.error('Failed to read config.json:', e)
    }
    return {}
  }

  _write() {
    try {
      const dir = path.dirname(this.path)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      const rawString = JSON.stringify(this.data)
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(rawString)
        fs.writeFileSync(this.path, encrypted)
      } else {
        fs.writeFileSync(this.path, rawString, 'utf-8')
      }
    } catch (e) {
      console.error('Failed to write config.json:', e)
    }
  }

  get(key, defaultValue) {
    return this.data[key] !== undefined ? this.data[key] : defaultValue
  }

  set(key, value) {
    if (value === undefined) {
      delete this.data[key]
    } else {
      this.data[key] = value
    }
    this._write()
  }

  delete(key) {
    delete this.data[key]
    this._write()
  }

  clear() {
    this.data = {}
    this._write()
  }
}

export default SimpleStore
