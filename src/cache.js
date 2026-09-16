import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { logger } from './utils/logger.js';

export function getCacheDir() {
  const dir = process.env.AGIKEY_HOME || path.join(os.homedir(), '.agikey');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

export function getCacheFilePath() {
  return path.join(getCacheDir(), 'discovery.json');
}

export function saveDiscoveryCache(data) {
  try {
    const filePath = getCacheFilePath();
    const payload = {
      version: '1.0.1',
      schemaVersion: 2,
      savedAt: new Date().toISOString(),
      ...data,
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    logger.info(`Discovery cache saved to ${filePath}`);
    return filePath;
  } catch (err) {
    logger.warn(`Failed to save discovery cache: ${err.message}`);
    return null;
  }
}

export function loadDiscoveryCache(maxAgeMs = 24 * 60 * 60 * 1000) {
  try {
    const filePath = getCacheFilePath();
    if (!fs.existsSync(filePath)) return null;

    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (data.schemaVersion !== 2) return null;

    if (maxAgeMs && data.savedAt) {
      const age = Date.now() - new Date(data.savedAt).getTime();
      if (age > maxAgeMs) {
        logger.debug('Discovery cache expired');
        return null;
      }
    }

    logger.info(`Loaded discovery cache from ${filePath} (saved at ${data.savedAt})`);
    return data;
  } catch (err) {
    logger.debug(`Cache read error: ${err.message}`);
    return null;
  }
}

export function clearDiscoveryCache() {
  try {
    const filePath = getCacheFilePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info('Discovery cache cleared.');
      return true;
    }
  } catch {}
  return false;
}
