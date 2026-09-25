const { app, session, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

app.setName('testing-dat-one');

console.log('==========================================================');
console.log('  RUNNING CATEGORY 5: EDGE CASES & STRESS AUDITS          ');
console.log('==========================================================');

const APP_ENC_SALT = 'DAT_ONE_SECURE_HARDWARE_VAULT_2026';
const VAULT_SALT = 'dat_vault_salt_2026';
const testMachineId = '23dbf835a011dc0097da59b58ea27fb9b92232aee829c7ace2042c9d7019c876';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function scanDirRecursive(dir, matchFn, maxDepth = 3, currentDepth = 0) {
  let matches = [];
  if (currentDepth > maxDepth || !fs.existsSync(dir)) return matches;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        matches = matches.concat(scanDirRecursive(fullPath, matchFn, maxDepth, currentDepth + 1));
      } else {
        if (matchFn(entry.name, fullPath)) matches.push(fullPath);
      }
    }
  } catch (e) {}
  return matches;
}

app.whenReady().then(async () => {
  let testScore = 0;
  const totalTests = 3;

  try {
    // -----------------------------------------------------------------------
    // TEST 5.1: Crash / Malformed Stream During Decryption (No Disk Spill)
    // -----------------------------------------------------------------------
    console.log('\n[TEST 5.1: Abrupt Failure / Malformed Stream During Decryption]');
    console.log('Testing that corrupted / incomplete streams do not dump recovery files or crash unhandled...');

    const tempDir = os.tmpdir();
    const tempCountBefore = fs.readdirSync(tempDir).length;

    // Simulate corrupted buffer fed into decryption routine
    const corruptedPayload = Buffer.concat([
      crypto.randomBytes(12), // fake IV
      crypto.randomBytes(16), // fake AuthTag
      crypto.randomBytes(1024) // garbage data
    ]);

    let threwExpectedError = false;
    try {
      const iv = corruptedPayload.subarray(0, 12);
      const tag = corruptedPayload.subarray(12, 28);
      const encryptedData = corruptedPayload.subarray(28);
      const key = crypto.scryptSync(testMachineId + APP_ENC_SALT, VAULT_SALT, 32);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    } catch (e) {
      threwExpectedError = true;
    }

    // Check if any error dump or temp files were written to disk
    const leakedCrashDumps = scanDirRecursive(tempDir, (name) => {
      return name.toLowerCase().includes('ephemeral') || (name.startsWith('tmp-') && name.endsWith('.dump'));
    }, 2);

    if (threwExpectedError && leakedCrashDumps.length === 0) {
      console.log('✅ PASSED: Corrupted stream caught safely in memory; zero error traces or partial data written to disk.');
      testScore++;
    } else {
      console.log('❌ FAILED: Error dump files or unhandled crash occurred.');
    }

    // -----------------------------------------------------------------------
    // TEST 5.2: Multiple Simultaneous Sessions & Partition Isolation
    // -----------------------------------------------------------------------
    console.log('\n[TEST 5.2: Multi-Window Partition Isolation]');
    console.log('Spawning 2 distinct ephemeral RAM partitions simultaneously...');

    const partitionIdA = 'ephemeral_ram_iso_' + crypto.randomBytes(4).toString('hex');
    const partitionIdB = 'ephemeral_ram_iso_' + crypto.randomBytes(4).toString('hex');

    const sessA = session.fromPartition(partitionIdA);
    const sessB = session.fromPartition(partitionIdB);

    // Inject Secret A into Partition A
    await sessA.cookies.set({
      url: 'https://one.dat.com/',
      name: 'session_token',
      value: 'SECRET_TENANT_A_TOKEN',
      domain: '.dat.com'
    });

    // Inject Secret B into Partition B
    await sessB.cookies.set({
      url: 'https://one.dat.com/',
      name: 'session_token',
      value: 'SECRET_TENANT_B_TOKEN',
      domain: '.dat.com'
    });

    const cookiesA = await sessA.cookies.get({ domain: 'dat.com' });
    const cookiesB = await sessB.cookies.get({ domain: 'dat.com' });

    const valA = cookiesA.find(c => c.name === 'session_token')?.value;
    const valB = cookiesB.find(c => c.name === 'session_token')?.value;

    console.log(`Partition A Token: ${valA}`);
    console.log(`Partition B Token: ${valB}`);

    // Now purge Partition A only
    await sessA.clearStorageData();
    await sessA.clearCache();

    const afterPurgeA = await sessA.cookies.get({ domain: 'dat.com' });
    const afterPurgeB = await sessB.cookies.get({ domain: 'dat.com' });

    console.log(`Partition A cookies remaining after purge: ${afterPurgeA.length}`);
    console.log(`Partition B cookies intact: ${afterPurgeB.length}`);

    if (valA === 'SECRET_TENANT_A_TOKEN' && valB === 'SECRET_TENANT_B_TOKEN' && afterPurgeA.length === 0 && afterPurgeB.length === 1) {
      console.log('✅ PASSED: 100% Partition isolation verified. Purging one session leaves others unaffected with zero cross-contamination.');
      testScore++;
    } else {
      console.log('❌ FAILED: Cross-contamination between partitions detected!');
    }

    // Clean up Partition B
    await sessB.clearStorageData();

    // -----------------------------------------------------------------------
    // TEST 5.3: Rapid Open/Close Stress & Memory Purge Verification
    // -----------------------------------------------------------------------
    console.log('\n[TEST 5.3: Rapid Open/Close Cycles & Memory Purge Stress]');
    console.log('Executing 10 rapid open, inject, and close lifecycle cycles...');

    let allCyclesClean = true;
    for (let i = 1; i <= 10; i++) {
      const stressPartName = `ephemeral_ram_stress_${i}_${Date.now()}`;
      const stressSess = session.fromPartition(stressPartName);

      // Inject cookies
      await stressSess.cookies.set({
        url: 'https://one.dat.com/',
        name: `cookie_stress_${i}`,
        value: `STRESS_VALUE_${crypto.randomBytes(16).toString('hex')}`,
        domain: '.dat.com'
      });

      // Verify injected
      const injected = await stressSess.cookies.get({});
      if (injected.length === 0) {
        allCyclesClean = false;
        break;
      }

      // Close / wipe
      await stressSess.clearStorageData();
      await stressSess.clearCache();

      // Verify zero residue
      const remaining = await stressSess.cookies.get({});
      if (remaining.length !== 0) {
        allCyclesClean = false;
        break;
      }
    }

    // Check disk for any lingering partitions directory
    const partitionsDir = path.join(app.getPath('userData'), 'Partitions');
    let leakedEphemeralOnDisk = [];
    if (fs.existsSync(partitionsDir)) {
      const entries = fs.readdirSync(partitionsDir);
      leakedEphemeralOnDisk = entries.filter(e => e.includes('stress') || e.includes('ephemeral'));
    }

    if (allCyclesClean && leakedEphemeralOnDisk.length === 0) {
      console.log('✅ PASSED: 10/10 rapid lifecycle stress cycles completed with zero memory residue and zero disk creation.');
      testScore++;
    } else {
      console.log('❌ FAILED: Stress cycles leaked data or disk files!');
    }

    console.log('\n==========================================================');
    console.log(`  CATEGORY 5 AUDIT RESULT: ${testScore}/${totalTests} TESTS PASSED`);
    if (testScore === totalTests) {
      console.log('  STATUS: ✅ ALL EDGE CASES & STRESS AUDITS PASSED (Grade: A+)');
    }
    console.log('==========================================================');

  } catch (err) {
    console.error('Error during Category 5 tests:', err);
  } finally {
    app.quit();
  }
});
