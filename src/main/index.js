import { app, shell, BrowserWindow, ipcMain, session, screen, globalShortcut, safeStorage } from 'electron'
import path, { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import axios from 'axios'
import FormData from 'form-data'
import AdmZip from 'adm-zip'
import fs from 'fs'
import tmp from 'tmp'
import crypto from 'crypto'
import { execSync, spawnSync } from 'child_process'
import Store from './store'

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Clamp tab count to valid range [1, 100].
 * Returns 1 if value is missing, NaN, or out of range.
 */
function clampTabs(value) {
  const n = parseInt(value, 10)
  if (isNaN(n)) return 1
  return Math.max(1, Math.min(100, n))
}

// Automatically load .env file from project root
try {
  const envCandidates = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '../../.env'),
    path.join(__dirname, '../.env')
  ]
  for (const envFile of envCandidates) {
    if (fs.existsSync(envFile)) {
      const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/)
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [k, ...v] = trimmed.split('=')
          process.env[k.trim()] = v.join('=').trim()
        }
      }
      break
    }
  }
} catch (e) {}

let rawApiUrl = (process.env.API_BASE_URL || 'https://159.223.116.5.nip.io').trim()
if (!rawApiUrl.startsWith('http://') && !rawApiUrl.startsWith('https://')) {
  rawApiUrl = 'http://' + rawApiUrl
}
const API_BASE_URL = rawApiUrl.replace(/\/+$/, '')
console.log('>>> [DAT-ONE-MAIN] Active API_BASE_URL:', API_BASE_URL)
const APP_ENC_SALT = 'DAT_ONE_SECURE_HARDWARE_VAULT_2026'

let cachedHardwareFingerprint = null

function getLiveMachineGuid() {
  if (process.platform === 'win32') {
    try {
      const out = execSync('REG QUERY HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid', {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 3000
      })
      const match = out.match(/MachineGuid\s+REG_SZ\s+([a-f0-9\-]+)/i)
      if (match) return match[1].trim()
    } catch (e) {
      console.error('Error reading live MachineGuid:', e.message)
    }
  }
  return ''
}

function getMachineId() {
  if (cachedHardwareFingerprint) return cachedHardwareFingerprint

  const liveGuid = getLiveMachineGuid()

  // 1. Authenticate cached fingerprint against live hardware and signature
  try {
    const vaultPath = path.join(app.getPath('userData'), 'device_vault.json')
    if (fs.existsSync(vaultPath)) {
      let rawContent = ''
      try {
        const fileBuffer = fs.readFileSync(vaultPath)
        if (safeStorage && safeStorage.isEncryptionAvailable()) {
          try {
            rawContent = safeStorage.decryptString(fileBuffer)
          } catch (dpapiErr) {
            rawContent = fileBuffer.toString('utf8')
          }
        } else {
          rawContent = fileBuffer.toString('utf8')
        }
      } catch (readErr) {
        rawContent = fs.readFileSync(vaultPath, 'utf8')
      }

      if (rawContent && rawContent.startsWith('{')) {
        const data = JSON.parse(rawContent)
        if (data && data.hardwareId && data.hardwareId.length === 64) {
          const vaultGuid = (data.systemGuid || '').trim().toLowerCase()
          const currentGuid = (liveGuid || '').trim().toLowerCase()

          // On Windows, systemGuid MUST match the live Registry MachineGuid
          if (process.platform === 'win32') {
            if (vaultGuid && currentGuid && vaultGuid === currentGuid) {
              const expectedSig = crypto
                .createHmac('sha256', currentGuid + APP_ENC_SALT)
                .update(data.hardwareId)
                .digest('hex')
              if (data.sig === expectedSig) {
                cachedHardwareFingerprint = data.hardwareId
                return cachedHardwareFingerprint
              } else {
                console.warn('Tamper alert: device_vault signature mismatch. Recalculating...')
              }
            } else {
              console.warn('Tamper alert: device_vault systemGuid mismatch (foreign machine clone detected). Rejecting vault!')
            }
          } else {
            cachedHardwareFingerprint = data.hardwareId
            return cachedHardwareFingerprint
          }
        }
      }
    }
  } catch (e) {
    console.warn('Could not authenticate device_vault cache:', e.message)
  }

  let rawFingerprint = ''

  if (process.platform === 'win32') {
    let machineGuid = liveGuid
    let mbUuid = ''

    // 2. Motherboard UUID via CIM (10-second timeout to prevent cold-start timeouts)
    try {
      const out = execSync('powershell.exe -NoProfile -NonInteractive -Command "(Get-CimInstance -Class Win32_ComputerSystemProduct).UUID"', {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 10000
      })
      const cleaned = out.replace(/[\r\n\t ]/g, '')
      if (cleaned && cleaned.length >= 16) {
        mbUuid = cleaned
      }
    } catch (e) {
      console.warn('PowerShell Motherboard UUID query delayed, using BIOS registry fallback:', e.message)
    }

    // 3. Fallback to Motherboard BIOS Product from Registry if PowerShell failed
    if (!mbUuid) {
      try {
        const out = execSync('REG QUERY HKEY_LOCAL_MACHINE\\HARDWARE\\DESCRIPTION\\System\\BIOS /v BaseBoardProduct', {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 2000
        })
        const match = out.match(/BaseBoardProduct\s+REG_SZ\s+([^\r\n]+)/i)
        if (match) mbUuid = 'BB_' + match[1].trim()
      } catch (e) {}
    }

    rawFingerprint = `WIN_${mbUuid || 'MBUUID_NONE'}_${machineGuid || 'GUID_NONE'}`
  } else if (process.platform === 'darwin') {
    // macOS: IOPlatformUUID (Apple hardware identity)
    let macUuid = ''
    try {
      const out = execSync('ioreg -rd1 -c IOPlatformExpertDevice', {
        encoding: 'utf8',
        timeout: 4000
      })
      const match = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/i)
      if (match) macUuid = match[1].trim()
    } catch (e) {
      console.error('Error reading IOPlatformUUID:', e.message)
    }

    if (!macUuid) {
      try {
        const out = execSync('system_profiler SPHardwareDataType', {
          encoding: 'utf8',
          timeout: 6000
        })
        const match = out.match(/Hardware UUID:\s*([A-F0-9\-]+)/i)
        if (match) macUuid = match[1].trim()
      } catch (e) {
        console.error('Error reading system_profiler Hardware UUID:', e.message)
      }
    }

    rawFingerprint = `MAC_${macUuid || 'MAC_UUID_NONE'}`
  } else if (process.platform === 'linux') {
    // Linux: /etc/machine-id, /var/lib/dbus/machine-id, or product_uuid
    let linuxId = ''
    try {
      if (fs.existsSync('/etc/machine-id')) {
        linuxId = fs.readFileSync('/etc/machine-id', 'utf8').trim()
      } else if (fs.existsSync('/var/lib/dbus/machine-id')) {
        linuxId = fs.readFileSync('/var/lib/dbus/machine-id', 'utf8').trim()
      }
    } catch (e) {
      console.error('Error reading linux machine-id:', e.message)
    }

    let dmiUuid = ''
    try {
      if (fs.existsSync('/sys/class/dmi/id/product_uuid')) {
        dmiUuid = fs.readFileSync('/sys/class/dmi/id/product_uuid', 'utf8').trim()
      }
    } catch (e) {}

    rawFingerprint = `LINUX_${dmiUuid || 'DMI_NONE'}_${linuxId || 'MACHINEID_NONE'}`
  } else {
    rawFingerprint = `GENERIC_${process.platform}_${process.arch}`
  }

  cachedHardwareFingerprint = crypto.createHash('sha256').update(rawFingerprint).digest('hex')

  // Save to persistent storage with DPAPI encryption and live hardware signature
  try {
    const vaultPath = path.join(app.getPath('userData'), 'device_vault.json')
    const sig = crypto
      .createHmac('sha256', (liveGuid || '').trim().toLowerCase() + APP_ENC_SALT)
      .update(cachedHardwareFingerprint)
      .digest('hex')

    const vaultPayload = JSON.stringify({
      hardwareId: cachedHardwareFingerprint,
      systemGuid: liveGuid,
      sig: sig
    })

    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      const encryptedBuffer = safeStorage.encryptString(vaultPayload)
      fs.writeFileSync(vaultPath, encryptedBuffer)
    } else {
      fs.writeFileSync(vaultPath, vaultPayload, 'utf8')
    }
  } catch (e) {
    console.error('Error saving protected device_vault:', e.message)
  }

  return cachedHardwareFingerprint
}

// Option B Architecture: Pure In-Memory Sessions (Zero Disk Footprint)
// No file handles or NTFS folder locking required as sessions never touch disk.

const loginHandlers = new Map()

app.on('login', (event, webContents, request, authInfo, callback) => {
  const { host } = authInfo

  if (loginHandlers.has(host)) {
    const { username, password } = loginHandlers.get(host)
    callback(username, password)
    loginHandlers.delete(host)
    event.preventDefault()
  } else {
    event.preventDefault()
  }
})

async function uploadZipFile(datSessionId, folderPath) {
  // Create a temporary zip file
  const tempZipFile = tmp.fileSync({ postfix: '.zip' })

  // Initialize adm-zip and add the specified folder to the zip
  const zip = new AdmZip()
  zip.addLocalFolder(folderPath)

  // Write the zip to the temporary file
  zip.writeZip(tempZipFile.name)

  const form = new FormData()
  form.append('file', fs.createReadStream(tempZipFile.name))

  const user = store.get('user')

  // Upload the zip file to the server
  await axios.post(`${API_BASE_URL}/file/upload/` + datSessionId, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: user.token
    },
    maxBodyLength: Infinity
  })

  // Remove the temporary zip file
  tempZipFile.removeCallback()
  console.log('Temporary zip file deleted.')
}

function extractCookiesFromZipBuffer(zipBuffer) {
  try {
    const tmpZip = tmp.fileSync({ postfix: '.zip' })
    fs.writeFileSync(tmpZip.name, zipBuffer)
    const pyScript = `
import sys, os, zipfile, sqlite3, json, tempfile
zip_path = sys.argv[1]
with zipfile.ZipFile(zip_path, 'r') as z:
    cookie_entry = None
    for name in z.namelist():
        if name.endswith('Network/Cookies') or name.endswith('/Cookies') or name == 'Cookies':
            cookie_entry = name
            break
    if not cookie_entry:
        print(json.dumps([]))
        sys.exit(0)
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(z.read(cookie_entry))
        tmp_path = tmp.name
try:
    conn = sqlite3.connect(tmp_path)
    c = conn.cursor()
    c.execute("SELECT host_key, name, value, path, expires_utc, is_secure, is_httponly, samesite FROM cookies")
    rows = c.fetchall()
    cookies = []
    for r in rows:
        cookies.append({
            'domain': r[0], 'name': r[1], 'value': r[2], 'path': r[3],
            'secure': bool(r[5]), 'httpOnly': bool(r[6]),
            'sameSite': 'no_restriction' if r[7] == 0 else ('lax' if r[7] == 1 else 'strict')
        })
    conn.close()
    print(json.dumps(cookies))
except Exception as e:
    sys.exit(1)
finally:
    if os.path.exists(tmp_path):
        try:
            os.remove(tmp_path)
        except:
            pass
`
    let res = spawnSync('python', ['-c', pyScript, tmpZip.name], { encoding: 'utf8' })
    if (res.error || res.status !== 0) {
      res = spawnSync('python3', ['-c', pyScript, tmpZip.name], { encoding: 'utf8' })
    }
    tmpZip.removeCallback()
    if (res.stdout) {
      return JSON.parse(res.stdout.trim())
    }
  } catch (e) {
    console.error('Fallback in-memory cookie extraction error:', e.message)
  }
  return []
}

async function streamAndInjectRamSession(datSessionId, targetSession) {
  try {
    const user = store.get('user')
    if (!user || !user.token) {
      throw new Error('User not authenticated')
    }

    const machineId = getMachineId()

    // Request hardware-locked encrypted session payload directly into RAM buffer
    const response = await axios.request({
      method: 'get',
      url: `${API_BASE_URL}/file/stream/` + datSessionId,
      headers: {
        Authorization: user.token,
        'X-Machine-Id': machineId
      },
      responseType: 'arraybuffer',
      maxBodyLength: Infinity
    })

    const payload = Buffer.from(response.data)
    if (payload.length < 28) {
      throw new Error('Invalid encrypted payload received from server')
    }

    // Decrypt hardware-locked payload using machine fingerprint in RAM
    const iv = payload.subarray(0, 12)
    const tag = payload.subarray(12, 28)
    const encryptedData = payload.subarray(28)

    const key = crypto.scryptSync(machineId + APP_ENC_SALT, 'dat_vault_salt_2026', 32)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const decryptedBuffer = Buffer.concat([decipher.update(encryptedData), decipher.final()])

    let sessionData = null
    const textStart = decryptedBuffer.slice(0, 50).toString('utf8').trim()
    if (textStart.startsWith('{')) {
      try {
        sessionData = JSON.parse(decryptedBuffer.toString('utf8'))
      } catch (e) {
        console.error('Failed to parse decrypted session JSON:', e.message)
      }
    }

    if (!sessionData) {
      console.log('Legacy zip payload detected in stream; extracting cookies on the fly in RAM...')
      const fallbackCookies = extractCookiesFromZipBuffer(decryptedBuffer)
      if (fallbackCookies && fallbackCookies.length > 0) {
        sessionData = {
          type: 'ram_session',
          cookies: fallbackCookies,
          localStorage: {}
        }
      }
    }

    if (sessionData && Array.isArray(sessionData.cookies)) {
      console.log(`Injecting ${sessionData.cookies.length} session cookies into 100% ephemeral RAM partition...`)
      for (const cookie of sessionData.cookies) {
        try {
          const protocol = cookie.secure ? 'https' : 'http'
          const domainClean = (cookie.domain || '').replace(/^\./, '')
          const cookieUrl = `${protocol}://${domainClean}${cookie.path || '/'}`
          await targetSession.cookies.set({
            url: cookieUrl,
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path || '/',
            secure: Boolean(cookie.secure),
            httpOnly: Boolean(cookie.httpOnly),
            sameSite: cookie.sameSite || 'no_restriction'
          })
        } catch (cookieErr) {
          // Ignore individual cookie format issues
        }
      }
      console.log('Zero-disk RAM session injection completed successfully.')
      return sessionData
    }

    console.warn('No session cookies found in payload.')
    return null
  } catch (error) {
    console.error('Error streaming and injecting session:', error.response ? error.response.data : error.message)
    throw error
  }
}

let newWindows = []
let mainWindow
let proxyWindow
let userWindow
let intervalId
let store


async function createProxyWindow({ proxyUrl, partitionName, datSessionId }) {
  const [host, port, username, password] = proxyUrl.split(':')
  const newSession = session.fromPartition(partitionName)
  // Set the proxy for the session
  try {
    await newSession.setProxy({
      proxyRules: `http://${host}:${port}`
    })
  } catch (error) {
    console.error('Error setting proxy:', error)
  }

  loginHandlers.set(host, {
    username: username,
    password: password
  })

  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  proxyWindow = new BrowserWindow({
    width,
    height,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      webgl: false,
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      preload: join(__dirname, '../preload/index.js'),
      partition: partitionName, // Use dynamic partition
      sandbox: false
    }
  })

  // Modify User-Agent to use a Chrome-based string
  const customUserAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
  proxyWindow.webContents.setUserAgent(customUserAgent)

  proxyWindow.on('ready-to-show', () => {
    proxyWindow.show()
  })

  proxyWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Proxy window did-fail-load:', errorCode, errorDescription)
    proxyWindow.show()
  })

  proxyWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' }
  })

  proxyWindow.loadURL('https://one.dat.com')

  // Prevent DevTools from opening programmatically
  proxyWindow.webContents.on('devtools-opened', () => {
    proxyWindow.webContents.closeDevTools()
  })

  // Prevent DevTools from opening with common shortcuts
  proxyWindow.webContents.on('before-input-event', (event, input) => {
    if (
      (input.control && input.shift && input.key.toLowerCase() === 'i') ||
      input.key.toLowerCase() === 'f12' ||
      (input.control && input.shift && input.key.toLowerCase() === 'j')
    ) {
      event.preventDefault()
    }
  })

  proxyWindow.webContents.on('will-navigate', async (event, navigationUrl) => {
    console.log(navigationUrl)
    // Parse the navigation URL to check its path
    const parsedUrl = new URL(navigationUrl)

    // Check if the base URL is not 'https://login.dat.com'
    if (parsedUrl.hostname !== 'login.dat.com') {
      const user = store.get('user')
      let config = {
        method: 'put',
        maxBodyLength: Infinity,
        url: `${API_BASE_URL}/session/` + datSessionId,
        headers: {
          'Content-Type': 'application/json',
          Authorization: user.token
        },
        data: JSON.stringify({ isLoggedIn: true })
      }
      await axios.request(config)
    }
  })

  proxyWindow.on('close', async () => {
    proxyWindow = null
  })

  return proxyWindow
}

function showNetworkError() {
  // dialog.showErrorBox('Network Error', message)
}

function trackURLLoad(window, url) {
  window.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    if (validatedURL === url) {
      console.error('Failed to load URL:', url, 'with error:', errorDescription)
      showNetworkError('Failed to load the page. Please check your network or proxy settings.')
    }
  })

  window.webContents.on('did-finish-load', () => {
    console.log('URL loaded successfully:', url)
  })

  window.webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl !== url) {
      console.warn('Navigation error:', navigationUrl)
      showNetworkError('Navigation error. Please check your network or proxy settings.')
    }
  })
}



async function createUserWindow({
  proxyUrl,
  permissions,
  datSessionId,
  domain
}) {
  // Generate an ephemeral randomized partition ID for RAM (no 'persist:' prefix = 100% in-memory)
  const ephemeralId = 'ephemeral_ram_' + crypto.randomBytes(8).toString('hex')
  const partitionName = ephemeralId
  const newSession = session.fromPartition(partitionName)

  let injectedSessionData = null
  if (datSessionId) {
    injectedSessionData = await streamAndInjectRamSession(datSessionId, newSession)
  }

  // Configure automatic CSV and document download interceptor directly to Downloads folder
  newSession.on('will-download', (event, item) => {
    const downloadFileName = item.getFilename()
    const ext = path.extname(downloadFileName).toLowerCase()
    if (['.csv', '.xlsx', '.xls', '.pdf', '.txt'].includes(ext)) {
      const downloadsPath = app.getPath('downloads')
      const savePath = path.join(downloadsPath, downloadFileName)
      item.setSavePath(savePath)
      item.once('done', (event, state) => {
        if (state === 'completed') {
          console.log('Document download completed successfully:', savePath)
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-complete', { fileName: downloadFileName, savePath })
          }
        }
      })
    } else {
      console.log('Blocked non-document download attempt:', downloadFileName)
      event.preventDefault()
    }
  })
  // Set the proxy for the session
  const [host, port, username, password] = proxyUrl.split(':')

  try {
    await newSession.setProxy({
      proxyRules: `http://${host}:${port}`
    })
  } catch (error) {
    console.error('Error setting proxy:', error)
    showNetworkError('Error setting proxy. Please check your proxy settings.')
  }

  loginHandlers.set(host, {
    username: username,
    password: password
  })

  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  userWindow = new BrowserWindow({
    width,
    height,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      webgl: false,
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      preload: join(__dirname, '../preload/index.js'),
      partition: partitionName, // Use dynamic partition
      sandbox: false
    }
  })

  // Prevent DevTools from opening programmatically
  userWindow.webContents.on('devtools-opened', () => {
    userWindow.webContents.closeDevTools()
  })

  // Prevent DevTools from opening with common shortcuts
  userWindow.webContents.on('before-input-event', (event, input) => {
    if (
      (input.control && input.shift && input.key.toLowerCase() === 'i') ||
      input.key.toLowerCase() === 'f12' ||
      (input.control && input.shift && input.key.toLowerCase() === 'j')
    ) {
      event.preventDefault()
    }
  })

  userWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.log('Failed to load:', errorDescription)

    // Handle proxy failure (e.g., display error, retry, or fallback)
    if (errorDescription.includes('ERR_PROXY_CONNECTION_FAILED')) {
      console.log('Proxy connection failed!')
    }
  })

  // Modify User-Agent to use a Chrome-based string
  const customUserAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
  userWindow.webContents.setUserAgent(customUserAgent)

  userWindow.on('ready-to-show', () => {
    userWindow.show()
    mainWindow.hide()
  })

  // If localStorage data is present in decrypted session, inject it into the DOM
  if (injectedSessionData && injectedSessionData.localStorage && Object.keys(injectedSessionData.localStorage).length > 0) {
    const storageScript = `
      try {
        const storageItems = ${JSON.stringify(injectedSessionData.localStorage)};
        for (const [key, value] of Object.entries(storageItems)) {
          window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        }
        console.log('[DAT-ONE] In-memory localStorage restored successfully.');
      } catch (e) {
        console.error('[DAT-ONE] Failed restoring localStorage:', e);
      }
    `
    userWindow.webContents.on('dom-ready', () => {
      userWindow.webContents.executeJavaScript(storageScript).catch(() => {})
    })
  }

  // Track URL loading
  trackURLLoad(userWindow, domain)
  userWindow.loadURL(domain)

  intervalId = setInterval(async () => {
    try {
      const user = store.get('user')

      if (!user || !user.token) {
        // No user data or token present, skip the check
        return
      }

      const machineId = getMachineId()
      const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `${API_BASE_URL}/auth/check-session`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: user.token,
          'X-Machine-Id': machineId
        }
      }

      const response = await axios.request(config)
      const userData = response.data

      // ── Live tab-count update (no logout needed for tab count changes) ──
      const oldAllowedTabs = clampTabs(
        user.permission?.searchLoadsMultitab ? (user.permission?.searchLoadsNoMultitab ?? 1) : 1
      )
      const newAllowedTabs = clampTabs(
        userData.permission?.searchLoadsMultitab ? (userData.permission?.searchLoadsNoMultitab ?? 1) : 1
      )
      if (oldAllowedTabs !== newAllowedTabs) {
        console.log(`[MISMATCH] allowedTabs changed from ${oldAllowedTabs} to ${newAllowedTabs}, updating UI...`)
        if (userWindow && !userWindow.isDestroyed()) {
          userWindow.webContents
            .executeJavaScript(`window.__updateAllowedTabs && window.__updateAllowedTabs(${newAllowedTabs})`)
            .catch((e) => console.error(e))
        }
      }

      // 1. Only check critical account flags instead of full deepEqual on the whole payload
      if (userData.isBanned || userData.user?.isBanned) {
        store.set('user', null)
        if (userWindow) userWindow.close()
        if (mainWindow) mainWindow.webContents.send('check-session', null)
        return
      }

      // 2. Only log out if vital credentials changed (token or role)
      if (user.token !== userData.token || user.role !== userData.role) {
        store.set('user', null)
        if (userWindow) userWindow.close()
        if (mainWindow) mainWindow.webContents.send('check-session', null)
        return
      }

      // Keep the local store up to date with new permissions/flags without logging them out
      store.set('user', userData)

    } catch (error) {
      console.error('Error during session check:', error.message)
      // 3. IGNORE network errors, timeouts, or 500s. Only log out on explicit 401/403
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        store.set('user', null)
        if (userWindow) userWindow.close()
        if (mainWindow) mainWindow.webContents.send('check-session', null)
      } else {
        console.warn('Session check failed due to network/server error. Retrying later...')
      }
    }
  }, 30000)

  let lastRequestTime = 0
  userWindow.webContents.on('did-start-navigation', async (event, url) => {
    const parsedUrl = new URL(url)
    if (datSessionId && parsedUrl.hostname !== 'login.dat.com') {
      const currentTime = Date.now()
      if (currentTime - lastRequestTime >= 120000) {
        lastRequestTime = currentTime
        console.log('isLoggedIn', true)
        const user = store.get('user')
        let config = {
          method: 'put',
          maxBodyLength: Infinity,
          url: `${API_BASE_URL}/session/` + datSessionId,
          headers: {
            'Content-Type': 'application/json',
            Authorization: user.token
          },
          data: JSON.stringify({ isLoggedIn: true })
        }
        await axios.request(config)
      }
    }
  })

  // Listen for navigation (when a redirect or navigation happens)
  userWindow.webContents.on('will-navigate', async (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)
    // Check if the base URL is 'https://login.dat.com'
    if (datSessionId && parsedUrl.hostname === 'login.dat.com') {
      event.preventDefault() // Prevent the redirection
      mainWindow.webContents.send('maintenance-mode', true)
      userWindow.close()
      const user = store.get('user')

      let config = {
        method: 'put',
        maxBodyLength: Infinity,
        url: `${API_BASE_URL}/session/` + datSessionId,
        headers: {
          'Content-Type': 'application/json',
          Authorization: user.token
        },
        data: JSON.stringify({ isLoggedIn: false })
      }
      await axios.request(config)
    }
  })

  userWindow.on('closed', async () => {
    store.set('user', null)
    mainWindow.webContents.send('check-session', null)
    newWindows.forEach((win) => {
      try {
        if (!win.isDestroyed()) {
          win.close()
        }
      } catch (error) {
        console.error('Error closing window:', error)
      }
    })
    newWindows.length = 0
    userWindow = null
    mainWindow.show()
    clearInterval(intervalId)

    // Complete RAM purge: clear all cookies, cache, and storage data from Chromium in-memory partition
    try {
      await newSession.clearStorageData()
      await newSession.clearCache()
      console.log(`Ephemeral RAM partition [${partitionName}] securely cleared & wiped from memory.`)
    } catch (wipeErr) {
      console.error('Error purging ephemeral RAM partition:', wipeErr.message)
    }
  })

  userWindow.webContents.setWindowOpenHandler((details) => {
    // Set proxy settings for the new session
    const { width, height } = screen.getPrimaryDisplay().workAreaSize

    const newWindow = new BrowserWindow({
      width,
      height,
      autoHideMenuBar: true,
      webPreferences: {
        webgl: false,
        contextIsolation: true,
        nodeIntegration: false,
        enableRemoteModule: false,
        preload: join(__dirname, '../preload/index.js'),
        partition: partitionName, // Use dynamic partition
        sandbox: false
      }
    })

    const customUserAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    newWindow.webContents.setUserAgent(customUserAgent)

    newWindow.webContents.setWindowOpenHandler(() => {
      // Prevent the default behavior
      return { action: 'deny' }
    })

    newWindow.webContents.on('devtools-opened', () => {
      newWindow.webContents.closeDevTools()
    })

    // Prevent DevTools from opening with common shortcuts
    newWindow.webContents.on('before-input-event', (event, input) => {
      if (
        (input.control && input.shift && input.key.toLowerCase() === 'i') ||
        input.key.toLowerCase() === 'f12' ||
        (input.control && input.shift && input.key.toLowerCase() === 'j')
      ) {
        event.preventDefault()
      }
    })

    const newCSS = `
      .mat-drawer-side {
        display: none !important;
      }
      .mat-drawer-content {
        margin-left: 0px !important;
      }
      dat-header.ng-trigger {
        display: none !important;
      }
      mat-toolbar.beta-banner {
        display: none !important;
      }
    `
    newWindow.webContents.on('page-title-updated', () => {
      newWindow.webContents.insertCSS(newCSS)
    })

    newWindow.webContents.on('did-finish-load', () => {
      newWindow.webContents.insertCSS(newCSS)
    })

    // Track URL loading
    trackURLLoad(userWindow, details.url)

    newWindow.loadURL(details.url)
    newWindows.push(newWindow)

    // Prevent the default behavior
    return { action: 'deny' }
  })

  // Inject CSS once the page is loaded
  let css = `
    body {
      visibility: visible !important;
      opacity: 1 !important;
    }
    .details.dropdown-menu hr ~ * {
      display: none !important;
    }
    .details.dropdown-menu hr {
      display: none !important;
    }
    .searchLoads nav {
      display: none !important;
    }
    .app-message-box {
      display: none !important;
    }
    .stn-wdgt, .stn-wdgt-content {
      display: none !important;
    }
    .nav-logo-clickable {
      pointer-events: none !important;
      cursor: not-allowed !important;
    }
  `
  // Style the native DAT add-button - collapse wrapper gap + label
  css += `
    /* Collapse the Angular mat-tab-label wrapper and override mat-tab-disabled opacity */
    .mat-tab-label:has(.add-closeall-container) {
      min-width: max-content !important;
      max-width: none !important;
      width: max-content !important;
      flex: 0 0 max-content !important;
      padding: 0 !important;
      opacity: 1 !important;
      overflow: visible !important;
    }
    .mat-tab-label:has(.add-closeall-container) .mat-tab-label-content {
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      padding: 0 12px !important;
      width: max-content !important;
    }
    /* Hide the native "CLOSE ALL" button to avoid overlap */
    [data-test="close-all-tabs-button"], .closeall-button-updated {
      display: none !important;
    }
    .add-closeall-container {
      display: flex !important;
      align-items: center !important;
      padding: 0 !important;
      height: 100% !important;
      width: max-content !important;
    }
    .add-closeall-container .add-button {
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      min-width: max-content !important;
      max-width: none !important;
      padding: 0 14px !important;
      height: 100% !important;
      background: transparent !important;
      color: rgba(0,0,0,0.75) !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      letter-spacing: normal !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      opacity: 1 !important;
      overflow: visible !important;
      transition: background 0.2s !important;
    }
    .add-closeall-container .add-button:hover {
      background: rgba(0,0,0,0.08) !important;
      color: rgba(0,0,0,0.9) !important;
    }
    .add-closeall-container .add-button .tab-add-icon {
      font-size: 18px !important;
      width: 18px !important;
      height: 18px !important;
      line-height: 18px !important;
      opacity: 1 !important;
      color: rgba(0,0,0,0.75) !important;
    }
    .add-closeall-container .custom-tab-wrapper {
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      overflow: visible !important;
    }
    .custom-tab-text {
      font-family: inherit !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      white-space: nowrap !important;
      color: rgba(0,0,0,0.75) !important;
      display: inline !important;
    }
    .add-closeall-container .mat-button-focus-overlay {
      display: none !important;
    }
    /* Suppress Angular ripple z-index clipping */
    .add-closeall-container .mat-ripple {
      overflow: visible !important;
    }
  `
  if (!permissions.dashboard) {
    css += `
    a[href="/dashboard"] {
      pointer-events: none !important;
      opacity: 0.5 !important;
      cursor: not-allowed !important;
    }
  `
  }
  if (!permissions.searchTrucks) {
    css += `
    a[href="/search-trucks-ow"] {
      pointer-events: none !important;
      opacity: 0.5 !important;
      cursor: not-allowed !important;
    }
  `
  }
  if (!permissions.privateLoads) {
    css += `
    a[href="/private-loads"] {
      pointer-events: none !important;
      opacity: 0.5 !important;
      cursor: not-allowed !important;
    }
  `
  }
  if (!permissions.myLoads) {
    css += `
    a[href="/my-loads/list/carrier"] {
      pointer-events: none !important;
      opacity: 0.5 !important;
      cursor: not-allowed !important;
    }
  `
  }
  if (!permissions.privateNetwork) {
    css += `
    a[href="/private-network"] {
      pointer-events: none !important;
      opacity: 0.5 !important;
      cursor: not-allowed !important;
    }
  `
  }
  if (!permissions.myTrucks) {
    css += `
    a[href="/my-trucks"] {
      pointer-events: none !important;
      opacity: 0.5 !important;
      cursor: not-allowed !important;
    }
  `
  }
  if (!permissions.liveSupport) {
    css += `
    .link-chat {
      pointer-events: none !important;
      opacity: 0.5 !important;
      cursor: not-allowed !important;
    }
  `
  }
  if (!permissions.tools) {
    css += `
    a[href="/tools"] {
      pointer-events: none !important;
      opacity: 0.5 !important;
      cursor: not-allowed !important;
    }
  `
  }
  if (!permissions.sendFeedback) {
    css += `
    .nav-feedback {
      pointer-events: none !important;
      opacity: 0.5 !important;
      cursor: not-allowed !important;
      display: none !important;
    }
  `
  }
  if (!permissions.notifications) {
    css += `
    .nav-notification-inbox {
      pointer-events: none !important;
      opacity: 0.5 !important;
      cursor: not-allowed !important;
      display: none !important;
    }
  `
  }
  if (!permissions.profile) {
    css += `
    .mat-expansion-panel:not([class*=mat-elevation-z]) {
      pointer-events: none !important;
      opacity: 0.5 !important;
      cursor: not-allowed !important;
      display: none !important;
    }
  `
  }
  if (!permissions.searchLoadsLaneRate) {
    css += `
    .lane-rates {
      pointer-events: none !important;
      opacity: 0.5 !important;
      cursor: not-allowed !important;
    }
    .trihaul {
      pointer-events: none !important;
      opacity: 0.5 !important;
      cursor: not-allowed !important;
    }
    .external-links > :nth-child(3) {
      pointer-events: none !important;
      opacity: 0.5 !important;
      cursor: not-allowed !important;
    }
  `
  }
  // if (!permissions.searchLoadsLaneRate) {
  //   css += `
  //   .links-container {
  //     pointer-events: none !important;
  //     opacity: 0.5 !important;
  //     cursor: not-allowed !important;
  //   }
  // `
  // }
  if (!permissions.searchLoadsViewRoute) {
    css += `
    .details-subheader-route {
      pointer-events: none !important;
      opacity: 0.5 !important;
      cursor: not-allowed !important;
      display: none !important;
    }
  `
  }
  if (!permissions.searchLoadsRateview) {
    css += `
    .rateview-link {
      pointer-events: none !important;
      opacity: 0.5 !important;
      cursor: not-allowed !important;
      display: none !important;
    }
  `
  }
  if (!permissions.searchLoadsViewDirectory) {
    css += `
    .directory {
      pointer-events: none !important;
      opacity: 0.5 !important;
      cursor: not-allowed !important;
      display: none !important;
    }
    mat-icon[data-mat-icon-name="chevron-up"][data-mat-icon-namespace="app"] {
      display: none !important;
    }
  `
  }
  // -- Tab Limit Enforcement --
  // searchLoadsMultitab=true  -> use searchLoadsNoMultitab (number of tabs allowed)
  // searchLoadsMultitab=false -> cap at 1 tab (add button always hidden)
  const allowedTabs = clampTabs(
    permissions.searchLoadsMultitab ? (permissions.searchLoadsNoMultitab ?? 1) : 1
  )

  // -- INJECT CSS + JS on every page load --
  userWindow.webContents.on('page-title-updated', () => {
    if (userWindow && !userWindow.isDestroyed()) {
      userWindow.webContents.insertCSS(css)
    }
  })

  userWindow.webContents.on('did-finish-load', () => {
    if (!userWindow || userWindow.isDestroyed()) return

    userWindow.webContents.insertCSS(css)

    // Native DAT Tab Enforcer
    // DAT has its own Angular Material tab system with a native add button.
    // We override DAT's own disabled state and enforce our own limit.
    // Poll every 200ms to survive Angular re-renders.
    userWindow.webContents.executeJavaScript(
      '(function () {' +
      '  if (window.__tabLimitInstalled) return;' +
      '  window.__tabLimitInstalled = true;' +
      '  window.__allowedTabs = ' + allowedTabs + ';' +
      '  function enforceTabLimit() {' +
      '    var labelsContainer = document.querySelector(".mat-tab-labels");' +
      '    if (!labelsContainer) return;' +
      '    var allLabels = Array.from(labelsContainer.querySelectorAll(":scope > .mat-tab-label"));' +
      '    var addBtnContainer = null;' +
      '    var realTabs = [];' +
      '    allLabels.forEach(function(el) {' +
      '      if (el.querySelector("[data-test=\\"new-tab-button\\"], .add-button")) {' +
      '        addBtnContainer = el;' +
      '      } else {' +
      '        realTabs.push(el);' +
      '      }' +
      '    });' +
      '    if (!addBtnContainer) return;' +
      '    var addBtn = addBtnContainer.querySelector("[data-test=\\"new-tab-button\\"], .add-button");' +
      '    if (realTabs.length >= window.__allowedTabs) {' +
      '      addBtnContainer.style.setProperty("display", "none", "important");' +
      '    } else {' +
      '      addBtnContainer.style.removeProperty("display");' +
      '      addBtnContainer.classList.remove("mat-tab-disabled");' +
      '      addBtnContainer.removeAttribute("aria-disabled");' +
      '      if (addBtn) {' +
      '        addBtn.removeAttribute("disabled");' +
      '        addBtn.classList.remove("mat-button-disabled");' +
      '        if (!addBtn.querySelector(".custom-tab-wrapper")) {' +
      '          var customWrapper = document.createElement("div");' +
      '          customWrapper.className = "custom-tab-wrapper";' +
      '          customWrapper.innerHTML = "<span class=\\"tab-add-icon material-icons\\">add</span><span class=\\"custom-tab-text\\">Add a new tab</span>";' +
      '          addBtn.appendChild(customWrapper);' +
      '          var oldWrapper = addBtn.querySelector(".mat-button-wrapper");' +
      '          if (oldWrapper) oldWrapper.style.display = "none";' +
      '        }' +
      '      }' +
      '    }' +
      '    realTabs.forEach(function(el, index) {' +
      '      if (index >= window.__allowedTabs) {' +
      '        el.style.setProperty("display", "none", "important");' +
      '      } else {' +
      '        el.style.removeProperty("display");' +
      '      }' +
      '    });' +
      '  }' +
      '  setInterval(enforceTabLimit, 200);' +
      '  window.__updateAllowedTabs = function(limit) {' +
      '    window.__allowedTabs = Math.max(1, parseInt(limit, 10) || 1);' +
      '    enforceTabLimit();' +
      '  };' +
      '})();'
    ).catch(function(err) { console.error('[TAB LIMIT] executeJavaScript failed:', err) })
  })

  return userWindow
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width,
    height,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      partition: 'persist:main',
      sandbox: false
    }
  })

  // Prevent DevTools from opening programmatically
  // mainWindow.webContents.on('devtools-opened', () => {
  //   mainWindow.webContents.closeDevTools()
  // })

  // // Prevent DevTools from opening with common shortcuts
  // mainWindow.webContents.on('before-input-event', (event, input) => {
  //   if (
  //     (input.control && input.shift && input.key.toLowerCase() === 'i') ||
  //     input.key.toLowerCase() === 'f12' ||
  //     (input.control && input.shift && input.key.toLowerCase() === 'j')
  //   ) {
  //     event.preventDefault()
  //   }
  // })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    if (proxyWindow) {
      proxyWindow.close()
      proxyWindow = null
    }
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}


autoUpdater.setFeedURL({
  provider: 'generic',
  url: `${API_BASE_URL}/file/update`
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Clean up any stale ephemeral sessions on app startup
  try {
    const partitionsDir = path.join(app.getPath('userData'), 'Partitions')
    if (fs.existsSync(partitionsDir)) {
      const dirs = fs.readdirSync(partitionsDir)
      for (const dir of dirs) {
        if (dir.startsWith('ephemeral_')) {
          const targetDir = path.join(partitionsDir, dir)
          if (process.platform === 'win32') {
            try {
              execSync(`attrib -h -s "${targetDir}"`, { windowsHide: true })
            } catch (e) {}
          }
          fs.rmSync(targetDir, { recursive: true, force: true })
        }
      }
    }
  } catch (err) {
    console.error('Startup cleanup error:', err.message)
  }

  autoUpdater.checkForUpdates().catch((err) => {
    console.error('Update check failed:', err.message)
  })
  store = new Store()

  // Handle electron-store IPC messages
  ipcMain.handle('electron-store-get', (event, key) => {
    return store.get(key)
  })

  ipcMain.handle('electron-store-set', (event, key, value) => {
    store.set(key, value)
  })

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.dat.one')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Register global shortcuts for zooming with regular and numpad keys
  globalShortcut.register('Control+=', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (focusedWindow && focusedWindow.isFocused()) {
      const webContents = focusedWindow.webContents
      const zoomLevel = webContents.getZoomLevel()
      webContents.setZoomLevel(zoomLevel + 0.5) // Increase zoom level by 0.5
    }
  })

  globalShortcut.register('Control+-', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (focusedWindow && focusedWindow.isFocused()) {
      const webContents = focusedWindow.webContents
      const zoomLevel = webContents.getZoomLevel()
      webContents.setZoomLevel(zoomLevel - 0.5) // Decrease zoom level by 0.5
    }
  })

  globalShortcut.register('Control+0', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (focusedWindow && focusedWindow.isFocused()) {
      focusedWindow.webContents.setZoomLevel(0) // Reset zoom level to default
    }
  })
})

// Listen for update available event
autoUpdater.on('update-available', () => {
  try {
    const data = {
      available: true,
      message: 'A new version is available.'
    }
    store.set('update-msg', data)
    mainWindow.webContents.send('update-msg', data)
    autoUpdater.downloadUpdate()
  } catch (error) {
    console.log(error)
  }
})

autoUpdater.on('update-not-available', () => {
  try {
    const data = {
      available: false,
      message: 'No updates available.'
    }
    store.set('update-msg', data)
    mainWindow.webContents.send('update-msg', data)
  } catch (error) {
    console.log(error)
  }
})

autoUpdater.on('download-progress', (progressObj) => {
  try {
    const data = {
      available: true,
      message: `Downloading... (${Math.round(progressObj.percent)}%)`
    }
    store.set('update-msg', data)
    mainWindow.webContents.send('update-msg', data)
  } catch (error) {
    console.log(error)
  }
})

// Listen for update downloaded event
autoUpdater.on('update-downloaded', () => {
  try {
    const data = {
      available: true,
      downloaded: true,
      message: 'New version downloaded, Restarting...'
    }
    store.set('update-msg', data)
    mainWindow.webContents.send('update-msg', data)
    setTimeout(() => {
      store.set('update-msg', null)
      autoUpdater.quitAndInstall()
    }, 5000)
  } catch (error) {
    console.log(error)
  }
})

// Listen for update error event
autoUpdater.on('error', (error) => {
  try {
    console.log(error)
    const data = { available: false, error }
    store.set('update-msg', data)
    mainWindow.webContents.send('update-msg', data)
  } catch (error) {
    console.log(error)
  }
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.

ipcMain.handle('login', async (event, arg) => {
  try {
    const machineId = getMachineId()
    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: `${API_BASE_URL}/auth/login`,
      headers: {
        'Content-Type': 'application/json',
        'X-Machine-Id': machineId
      },
      data: JSON.stringify({ ...arg, hardwareId: machineId })
    }

    const response = await axios.request(config)
    store.set('user', response.data)

    // You can send additional data if needed
    return response.data // This will be sent back to the renderer
  } catch (error) {
    if (error.response) {
      return typeof error.response.data === 'string'
        ? { message: error.response.data }
        : error.response.data
    } else {
      console.error('Login error:', error.message)
      return { message: 'Unable to connect to the server. Please check your internet connection.' }
    }
  }
})

ipcMain.handle('getAllUsers', async (event, arg) => {
  try {
    const user = store.get('user')

    let config = {
      method: 'get',
      maxBodyLength: Infinity,
      url: `${API_BASE_URL}/user`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: user.token
      },
      data: JSON.stringify(arg)
    }

    const response = await axios.request(config)
    // You can send additional data if needed
    return response.data // This will be sent back to the renderer
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401 && error.response.statusText == 'Unauthorized') {
        store.set('user', null)
        mainWindow.webContents.send('check-session', null)
      } else {
        return error.response.data
      }
    } else {
      console.error('Error:', error)
    }
  }
})

ipcMain.handle('create-user', async (event, arg) => {
  try {
    const user = store.get('user')

    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: `${API_BASE_URL}/user`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: user.token
      },
      data: JSON.stringify(arg)
    }

    const response = await axios.request(config)
    // You can send additional data if needed
    return response.data // This will be sent back to the renderer
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401 && error.response.statusText == 'Unauthorized') {
        store.set('user', null)
        mainWindow.webContents.send('check-session', null)
      } else {
        return error.response.data
      }
    } else {
      console.error('Error:', error)
    }
  }
})

ipcMain.handle('update-user', async (event, arg) => {
  try {
    const user = store.get('user')

    let config = {
      method: 'put',
      maxBodyLength: Infinity,
      url: `${API_BASE_URL}/user/` + arg._id,
      headers: {
        'Content-Type': 'application/json',
        Authorization: user.token
      },
      data: JSON.stringify(arg)
    }

    const response = await axios.request(config)
    // You can send additional data if needed
    return response.data // This will be sent back to the renderer
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401 && error.response.statusText == 'Unauthorized') {
        store.set('user', null)
        mainWindow.webContents.send('check-session', null)
      } else {
        return error.response.data
      }
    }
    console.error('Error:', error)
  }
})

ipcMain.handle('delete-user', async (event, arg) => {
  try {
    const user = store.get('user')

    let config = {
      method: 'delete',
      maxBodyLength: Infinity,
      url: `${API_BASE_URL}/user/` + arg.userId,
      headers: {
        'Content-Type': 'application/json',
        Authorization: user.token
      },
      data: JSON.stringify(arg)
    }

    const response = await axios.request(config)

    return response.data
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401 && error.response.statusText == 'Unauthorized') {
        store.set('user', null)
        mainWindow.webContents.send('check-session', null)
      } else {
        return error.response.data
      }
    } else {
      console.error('Error:', error)
    }
  }
})

ipcMain.handle('getAllDatAccounts', async (event, arg) => {
  try {
    const user = store.get('user')

    let config = {
      method: 'get',
      maxBodyLength: Infinity,
      url: `${API_BASE_URL}/session`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: user.token
      },
      data: JSON.stringify(arg)
    }

    const response = await axios.request(config)
    // You can send additional data if needed
    return response.data // This will be sent back to the renderer
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401 && error.response.statusText == 'Unauthorized') {
        store.set('user', null)
        mainWindow.webContents.send('check-session', null)
      } else {
        return error.response.data
      }
    } else {
      console.error('Error:', error)
    }
  }
})

ipcMain.handle('create-datSession', async (event, arg) => {
  try {
    const user = store.get('user')

    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: `${API_BASE_URL}/session`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: user.token
      },
      data: JSON.stringify(arg)
    }

    const response = await axios.request(config)
    // You can send additional data if needed
    return response.data // This will be sent back to the renderer
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401 && error.response.statusText == 'Unauthorized') {
        store.set('user', null)
        mainWindow.webContents.send('check-session', null)
      } else {
        return error.response.data
      }
    } else {
      console.error('Error:', error)
    }
  }
})

ipcMain.handle('update-datSession', async (event, arg) => {
  try {
    const user = store.get('user')

    let config = {
      method: 'put',
      maxBodyLength: Infinity,
      url: `${API_BASE_URL}/session/` + arg._id,
      headers: {
        'Content-Type': 'application/json',
        Authorization: user.token
      },
      data: JSON.stringify(arg)
    }

    const response = await axios.request(config)
    // You can send additional data if needed
    return response.data // This will be sent back to the renderer
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401 && error.response.statusText == 'Unauthorized') {
        store.set('user', null)
        mainWindow.webContents.send('check-session', null)
      } else {
        return error.response.data
      }
    }
    console.error('Error:', error)
  }
})

ipcMain.handle('delete-datSession', async (event, arg) => {
  try {
    const user = store.get('user')

    let config = {
      method: 'delete',
      maxBodyLength: Infinity,
      url: `${API_BASE_URL}/session/` + arg.datSessionId,
      headers: {
        'Content-Type': 'application/json',
        Authorization: user.token
      },
      data: JSON.stringify(arg)
    }

    const response = await axios.request(config)

    return response.data
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401 && error.response.statusText == 'Unauthorized') {
        store.set('user', null)
        mainWindow.webContents.send('check-session', null)
      } else {
        return error.response.data
      }
    } else {
      console.error('Error:', error)
    }
  }
})

ipcMain.handle('getAllDomains', async (event, arg) => {
  try {
    const user = store.get('user')

    let config = {
      method: 'get',
      maxBodyLength: Infinity,
      url: `${API_BASE_URL}/domain`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: user.token
      },
      data: JSON.stringify(arg)
    }

    const response = await axios.request(config)
    // You can send additional data if needed
    return response.data // This will be sent back to the renderer
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401 && error.response.statusText == 'Unauthorized') {
        store.set('user', null)
        mainWindow.webContents.send('check-session', null)
      } else {
        return error.response.data
      }
    } else {
      console.error('Error:', error)
    }
  }
})

ipcMain.handle('create-domain', async (event, arg) => {
  try {
    const user = store.get('user')

    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: `${API_BASE_URL}/domain`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: user.token
      },
      data: JSON.stringify(arg)
    }

    const response = await axios.request(config)
    // You can send additional data if needed
    return response.data // This will be sent back to the renderer
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401 && error.response.statusText == 'Unauthorized') {
        store.set('user', null)
        mainWindow.webContents.send('check-session', null)
      } else {
        return error.response.data
      }
    } else {
      console.error('Error:', error)
    }
  }
})

ipcMain.handle('update-domain', async (event, arg) => {
  try {
    const user = store.get('user')

    let config = {
      method: 'put',
      maxBodyLength: Infinity,
      url: `${API_BASE_URL}/domain/` + arg._id,
      headers: {
        'Content-Type': 'application/json',
        Authorization: user.token
      },
      data: JSON.stringify(arg)
    }

    const response = await axios.request(config)
    // You can send additional data if needed
    return response.data // This will be sent back to the renderer
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401 && error.response.statusText == 'Unauthorized') {
        store.set('user', null)
        mainWindow.webContents.send('check-session', null)
      } else {
        return error.response.data
      }
    }
    console.error('Error:', error)
  }
})

ipcMain.handle('delete-domain', async (event, arg) => {
  try {
    const user = store.get('user')

    let config = {
      method: 'delete',
      maxBodyLength: Infinity,
      url: `${API_BASE_URL}/domain/` + arg.domainId,
      headers: {
        'Content-Type': 'application/json',
        Authorization: user.token
      },
      data: JSON.stringify(arg)
    }

    const response = await axios.request(config)

    return response.data
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401 && error.response.statusText == 'Unauthorized') {
        store.set('user', null)
        mainWindow.webContents.send('check-session', null)
      } else {
        return error.response.data
      }
    } else {
      console.error('Error:', error)
    }
  }
})

ipcMain.handle('open-dat-session', async (event, arg) => {
  try {
    createProxyWindow({
      proxyUrl: arg.proxy,
      partitionName: 'persist:' + arg.name,
      datSessionId: arg.datSessionId
    })
  } catch (error) {
    console.error('Error:', error)
  }
})

ipcMain.handle('save-dat-session', async (event, arg) => {
  try {
    const adminSession = session.fromPartition('persist:' + arg.name)
    const allCookies = await adminSession.cookies.get({})
    let localStorageData = {}
    if (proxyWindow && !proxyWindow.isDestroyed()) {
      try {
        const rawStorage = await proxyWindow.webContents.executeJavaScript('JSON.stringify(window.localStorage)')
        localStorageData = JSON.parse(rawStorage || '{}')
      } catch (e) {}
    }

    const sessionPayload = {
      type: 'ram_session',
      name: arg.name,
      cookies: allCookies,
      localStorage: localStorageData
    }

    const tempJsonFile = tmp.fileSync({ postfix: '.json' })
    fs.writeFileSync(tempJsonFile.name, JSON.stringify(sessionPayload, null, 2), 'utf8')

    const form = new FormData()
    form.append('file', fs.createReadStream(tempJsonFile.name))

    const user = store.get('user')
    await axios.post(`${API_BASE_URL}/file/upload/` + arg.datSessionId, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: user.token
      },
      maxBodyLength: Infinity
    })

    tempJsonFile.removeCallback()

    // Also upload full zip as backward compatibility if directory exists
    try {
      const userDataPath = app.getPath('userData')
      const partitionsPath = path.join(userDataPath, 'Partitions', arg.name)
      if (fs.existsSync(partitionsPath)) {
        await uploadZipFile(arg.datSessionId, partitionsPath)
      }
    } catch (zipErr) {}

    return { status: 'success', message: 'Session successfully saved to RAM vault.' }
  } catch (error) {
    console.error('Error saving session:', error)
    return {
      status: 'error',
      message: error.response?.data?.message || 'Unable to connect to the server. Please check your internet connection.'
    }
  }
})

ipcMain.handle('clear-dat-session', async (event, arg) => {
  try {
    const userDataPath = app.getPath('userData')
    const partitionsPath = path.join(userDataPath, 'Partitions', arg.name)
    fs.rmSync(partitionsPath, { recursive: true, force: true })

    const user = store.get('user')

    let config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: `${API_BASE_URL}/file/delete/` + arg.datSessionId,
      headers: {
        'Content-Type': 'application/json',
        Authorization: user.token
      }
    }

    const response = await axios.request(config)
    return { status: 'success', ...response.data }
  } catch (error) {
    console.log('Error:', error.message)
    return {
      status: 'error',
      message: error.response?.data?.message || 'Unable to connect to the server. Please check your internet connection.'
    }
  }
})

ipcMain.handle('open-dat-user-session', async (event, arg) => {
  try {
    await delay(5000)
    const user = store.get('user')

    user &&
      createUserWindow({
        proxyUrl: arg.proxy,
        partitionName: 'persist:' + arg.name,
        permissions: arg.permissions,
        fileName: arg.fileName,
        datSessionId: arg.datSessionId,
        domain: arg.domain
      })
  } catch (error) {
    console.error('Error:', error)
  }
})

ipcMain.handle('download-dat-session', async () => {
  return { status: 'success' }
})

ipcMain.handle('close-main-app', async () => {
  try {
    app.quit()
  } catch (error) {
    console.error('Error:', error)
  }
})
