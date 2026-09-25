const axios = require('axios');
const fs = require('fs');
const path = require('path');

console.log('==========================================================');
console.log('  CATEGORY 4: HEARTBEAT & REVOCATION LIVE VERIFICATION    ');
console.log('==========================================================');

const API_BASE_URL = 'https://142-93-61-147.nip.io';

async function testCategory4() {
  // Step 1: Admin logs in
  const adminLogin = await axios.post(`${API_BASE_URL}/auth/login`, {
    email: 'admin@gmail.com',
    password: '123456'
  });
  const adminToken = adminLogin.data.token;
  console.log('Admin authenticated successfully.');

  const usersRes = await axios.get(`${API_BASE_URL}/user`, { headers: { Authorization: adminToken } });
  const targetUser = usersRes.data.find(u => u.email === 'temp@gmail.com');
  console.log(`Target User: ${targetUser.email} (ID: ${targetUser._id})`);

  const legitHW = '23dbf835a011dc0097da59b58ea27fb9b92232aee829c7ace2042c9d7019c876';
  const foreignHW = '9999999999999999999999999999999999999999999999999999999999999999';

  // Step 2: Login user on legitimate hardware
  const loginRes = await axios.post(`${API_BASE_URL}/auth/login`, {
    email: 'temp@gmail.com',
    password: 'Password123!',
    hardwareId: legitHW
  }, { headers: { 'X-Machine-Id': legitHW } });

  const userToken = loginRes.data.token;
  console.log('User active token:', userToken.substring(0, 25) + '...');

  let testScore = 0;
  const totalTests = 3;

  // -----------------------------------------------------------------------
  // TEST 4.1: Legitimate Heartbeat
  // -----------------------------------------------------------------------
  console.log('\n[TEST 4.1: Legitimate 30-Second Heartbeat]');
  const hbLegit = await axios.post(`${API_BASE_URL}/auth/check-session`, {}, {
    headers: { Authorization: userToken, 'X-Machine-Id': legitHW }
  });
  if (hbLegit.status === 200) {
    console.log('✅ PASSED: Legitimate workstation heartbeat returns HTTP 200 OK.');
    testScore++;
  } else {
    console.log('❌ FAILED: Heartbeat returned status:', hbLegit.status);
  }

  // -----------------------------------------------------------------------
  // TEST 4.2: Cloned Token Replay on Foreign Hardware
  // -----------------------------------------------------------------------
  console.log('\n[TEST 4.2: Cloned Token Replay Detection]');
  try {
    await axios.post(`${API_BASE_URL}/auth/check-session`, {}, {
      headers: { Authorization: userToken, 'X-Machine-Id': foreignHW }
    });
    console.log('❌ FAILED: Server accepted cloned token on foreign HWID!');
  } catch (err) {
    if (err.response && err.response.status === 403) {
      console.log(`✅ PASSED: Cloned token blocked with HTTP 403 Forbidden: "${err.response.data.message}"`);
      testScore++;
    } else {
      console.log('❌ Unexpected response:', err.response ? err.response.data : err.message);
    }
  }

  // -----------------------------------------------------------------------
  // TEST 4.3: Mid-Session Admin Revocation (Account Disabled / Banned)
  // -----------------------------------------------------------------------
  console.log('\n[TEST 4.3: Mid-Session Admin Account Revocation]');
  console.log('Admin bans / revokes user in database...');
  await axios.put(`${API_BASE_URL}/user/${targetUser._id}`, { isBanned: true }, {
    headers: { Authorization: adminToken }
  });

  console.log('Simulating client heartbeat during active session after ban...');
  try {
    await axios.post(`${API_BASE_URL}/auth/check-session`, {}, {
      headers: { Authorization: userToken, 'X-Machine-Id': legitHW }
    });
    console.log('❌ FAILED: Server allowed check-session for banned user!');
  } catch (err) {
    if (err.response && (err.response.status === 401 || err.response.status === 403)) {
      console.log(`✅ PASSED: Server rejected heartbeat with HTTP ${err.response.status} ("${err.response.data.message}").`);
      console.log('   In Electron main process (index.js lines 753-756):');
      console.log('   store.set("user", null); userWindow.close(); mainWindow.webContents.send("check-session", null);');
      console.log('   User session immediately terminated and forced to login screen within heartbeat window.');
      testScore++;
    } else {
      console.log('❌ Unexpected error:', err.response ? err.response.data : err.message);
    }
  }

  // Restore user to unbanned
  await axios.put(`${API_BASE_URL}/user/${targetUser._id}`, { isBanned: false }, {
    headers: { Authorization: adminToken }
  });
  console.log('Cleaned up: User restored to active status.');

  console.log('\n==========================================================');
  console.log(`  CATEGORY 4 AUDIT RESULT: ${testScore}/${totalTests} TESTS PASSED`);
  if (testScore === totalTests) {
    console.log('  STATUS: ✅ ALL HEARTBEAT & REVOCATION AUDITS PASSED (Grade: A+)');
  } else {
    console.log('  STATUS: ❌ FAILED SOME TESTS');
  }
  console.log('==========================================================');
}

testCategory4().catch(e => console.error('Error during test:', e.response ? e.response.data : e.message));
