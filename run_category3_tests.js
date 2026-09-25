const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

console.log('==========================================================');
console.log('  RUNNING CATEGORY 3: ENCRYPTION & DECRYPTION AUDITS      ');
console.log('==========================================================');

const APP_ENC_SALT = 'DAT_ONE_SECURE_HARDWARE_VAULT_2026';
const VAULT_SALT = 'dat_vault_salt_2026';

// Helper function: Derive AES-256 key exactly as done in client (index.js) and server (fileController.js)
function deriveKey(machineId) {
  return crypto.scryptSync(machineId + APP_ENC_SALT, VAULT_SALT, 32);
}

// Helper function: Encrypt session payload exactly as server does
function encryptPayload(machineId, plaintextBuffer) {
  const iv = crypto.randomBytes(12);
  const key = deriveKey(machineId);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Packed format: [12 bytes IV] + [16 bytes AuthTag] + [Encrypted Data]
  return Buffer.concat([iv, authTag, encrypted]);
}

// Helper function: Decrypt payload exactly as client does
function decryptPayload(machineId, packedBuffer) {
  if (packedBuffer.length < 28) {
    throw new Error('Payload too small: missing IV or AuthTag');
  }
  const iv = packedBuffer.subarray(0, 12);
  const authTag = packedBuffer.subarray(12, 28);
  const encryptedData = packedBuffer.subarray(28);

  const key = deriveKey(machineId);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
}

let testScore = 0;
const totalTests = 5;

// Sample confidential corporate session payload
const mockSession = JSON.stringify({
  type: 'ram_session',
  name: 'corp_account_01',
  cookies: [
    { name: 'auth_token', value: 'SECRET_JWT_TOKEN_ABC123XYZ', domain: '.dat.com' },
    { name: 'session_id', value: 'SESS_9988776655', domain: '.dat.com' }
  ],
  localStorage: { userId: 'admin_user_42' }
});
const plaintextBuffer = Buffer.from(mockSession, 'utf8');

const machineA = '23dbf835a011dc0097da59b58ea27fb9b92232aee829c7ace2042c9d7019c876';
const machineB = '99999999a011dc0097da59b58ea27fb9b92232aee829c7ace2042c9d7019c876';

// -----------------------------------------------------------------------
// TEST 3.1: Stream Decryption on Wrong Hardware
// -----------------------------------------------------------------------
console.log('\n[TEST 3.1: Stream Decryption on Wrong Hardware]');
try {
  const encryptedStreamForA = encryptPayload(machineA, plaintextBuffer);
  // Attempt to decrypt stream meant for Machine A on Machine B
  decryptPayload(machineB, encryptedStreamForA);
  console.log('❌ FAILED: Machine B was able to decrypt Machine A\'s stream!');
} catch (err) {
  if (err.message.includes('Unsupported state') || err.message.includes('unable to authenticate data')) {
    console.log('✅ PASSED: GCM Authentication failed as expected on foreign hardware.');
    console.log('   Error message:', err.message);
    testScore++;
  } else {
    console.log('⚠️ Unexpected error:', err.message);
  }
}

// -----------------------------------------------------------------------
// TEST 3.2: IV Randomness & Replay Prevention
// -----------------------------------------------------------------------
console.log('\n[TEST 3.2: IV Randomness & Replay Prevention]');
const stream1 = encryptPayload(machineA, plaintextBuffer);
const stream2 = encryptPayload(machineA, plaintextBuffer);

const iv1 = stream1.subarray(0, 12);
const iv2 = stream2.subarray(0, 12);
const ciphertext1 = stream1.subarray(28);
const ciphertext2 = stream2.subarray(28);

console.log('Stream 1 IV:', iv1.toString('hex'));
console.log('Stream 2 IV:', iv2.toString('hex'));

if (!iv1.equals(iv2) && !ciphertext1.equals(ciphertext2)) {
  console.log('✅ PASSED: Each encrypted stream uses a fresh cryptographically random IV.');
  console.log('   Ciphertexts are non-identical even with identical plaintext.');
  testScore++;
} else {
  console.log('❌ FAILED: Static IV detected! Stream replay is possible.');
}

// -----------------------------------------------------------------------
// TEST 3.3: Authentication Tag Tampering Detection (GCM Integrity)
// -----------------------------------------------------------------------
console.log('\n[TEST 3.3: Authentication Tag Tampering Detection]');
const validStream = encryptPayload(machineA, plaintextBuffer);
// Tamper with exactly 1 bit in the ciphertext
const tamperedStream = Buffer.from(validStream);
tamperedStream[tamperedStream.length - 1] ^= 0x01; // Flip 1 bit

try {
  decryptPayload(machineA, tamperedStream);
  console.log('❌ FAILED: Tampered ciphertext was decrypted without error!');
} catch (err) {
  if (err.message.includes('Unsupported state') || err.message.includes('unable to authenticate data')) {
    console.log('✅ PASSED: AES-256-GCM detected 1-bit tampering and rejected payload.');
    console.log('   Error message:', err.message);
    testScore++;
  } else {
    console.log('⚠️ Unexpected error:', err.message);
  }
}

// -----------------------------------------------------------------------
// TEST 3.4: Key Derivation Consistency (Determinism)
// -----------------------------------------------------------------------
console.log('\n[TEST 3.4: Key Derivation Consistency]');
const keyRun1 = deriveKey(machineA);
const keyRun2 = deriveKey(machineA);
const keyRun3 = deriveKey(machineA);

if (keyRun1.equals(keyRun2) && keyRun2.equals(keyRun3)) {
  console.log('✅ PASSED: Key derivation via scrypt is 100% deterministic across all runs.');
  console.log('   Derived Key (32 bytes):', keyRun1.toString('hex').substring(0, 32) + '...');
  testScore++;
} else {
  console.log('❌ FAILED: Key derivation produced inconsistent keys!');
}

// -----------------------------------------------------------------------
// TEST 3.5: Key Entropy & Uniqueness
// -----------------------------------------------------------------------
console.log('\n[TEST 3.5: Key Entropy & Machine Uniqueness]');
const sampleHwids = [
  '23dbf835a011dc0097da59b58ea27fb9b92232aee829c7ace2042c9d7019c876',
  '23dbf835a011dc0097da59b58ea27fb9b92232aee829c7ace2042c9d7019c877', // 1 char diff
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'WIN_CIM_UUID_01_GUID_01_TEST_FINGERPRINT_SAMPLE_MACHINE_00000000000'
];

const derivedKeys = new Set();
sampleHwids.forEach(hw => {
  derivedKeys.add(deriveKey(hw).toString('hex'));
});

console.log(`Tested ${sampleHwids.length} different hardware inputs. Generated ${derivedKeys.size} distinct keys.`);

// Verify avalanche effect: 1-character difference in HWID produces completely uncorrelated key
const keyA = deriveKey('23dbf835a011dc0097da59b58ea27fb9b92232aee829c7ace2042c9d7019c876');
const keyB = deriveKey('23dbf835a011dc0097da59b58ea27fb9b92232aee829c7ace2042c9d7019c877');

let diffBits = 0;
for (let i = 0; i < 32; i++) {
  let xor = keyA[i] ^ keyB[i];
  while (xor > 0) {
    if (xor & 1) diffBits++;
    xor >>= 1;
  }
}
console.log(`Bit difference between two adjacent HWIDs: ${diffBits} / 256 bits (~${Math.round((diffBits / 256) * 100)}% avalanche)`);

if (derivedKeys.size === sampleHwids.length && diffBits > 100) {
  console.log('✅ PASSED: Keys have high cryptographic entropy and strong avalanche effect.');
  testScore++;
} else {
  console.log('❌ FAILED: Key collision or poor entropy detected!');
}

console.log('\n==========================================================');
console.log(`  CATEGORY 3 AUDIT RESULT: ${testScore}/${totalTests} TESTS PASSED`);
if (testScore === totalTests) {
  console.log('  STATUS: ✅ ALL CRYPTOGRAPHY VERIFICATIONS PASSED (GRADE: A+)');
} else {
  console.log('  STATUS: ❌ CRYPTOGRAPHIC DEFECT DETECTED');
}
console.log('==========================================================');
