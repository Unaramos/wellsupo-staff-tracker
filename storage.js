const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'data.json');
const STORE_KEY = 'wellsupo:store';

let redis = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const { Redis } = require('@upstash/redis');
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

let saveChain = Promise.resolve();
let savingPaused = false;

async function loadStore() {
  if (redis) {
    const data = await redis.get(STORE_KEY);
    if (!data) return null;
    return typeof data === 'string' ? JSON.parse(data) : data;
  }
  if (fs.existsSync(DATA_PATH)) {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  }
  return null;
}

function persistStore(storeObj) {
  if (savingPaused) return saveChain;

  saveChain = saveChain.then(async () => {
    if (redis) {
      await redis.set(STORE_KEY, storeObj);
      return;
    }
    fs.writeFileSync(DATA_PATH, JSON.stringify(storeObj, null, 2), 'utf8');
  }).catch((err) => {
    console.error('Failed to persist store:', err);
  });

  return saveChain;
}

function flushStore() {
  return saveChain;
}

function setSavingPaused(paused) {
  savingPaused = paused;
}

function usesRemoteStorage() {
  return !!redis;
}

module.exports = {
  loadStore,
  persistStore,
  flushStore,
  setSavingPaused,
  usesRemoteStorage,
};
