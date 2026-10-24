// Upload retention policy shared by single PUT/POST uploads and R2 multipart.
// The default is a reusable 1-hour link. Set DEFAULT_EXPIRATION_SECONDS=0 to
// restore the legacy one-time default, or request one-time explicitly.
export function getMaximumExpirationSeconds(env) {
  const max = Number(env.MAX_AGE_FOR_MULTIDOWNLOAD ?? '86400');
  if (!Number.isSafeInteger(max) || max < 1) {
    throw new RangeError('MAX_AGE_FOR_MULTIDOWNLOAD must be a positive integer');
  }
  return max;
}

export function getDefaultExpirationSeconds(env) {
  const value = Number(env.DEFAULT_EXPIRATION_SECONDS ?? '3600');
  const max = getMaximumExpirationSeconds(env);
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new RangeError('DEFAULT_EXPIRATION_SECONDS must be an integer from 0 to MAX_AGE_FOR_MULTIDOWNLOAD');
  }
  return value;
}

export function resolveUploadExpiration(env, { expirationSeconds, oneTime = false } = {}) {
  const defaultSeconds = getDefaultExpirationSeconds(env);
  if (oneTime) {
    if (expirationSeconds !== undefined && expirationSeconds !== null) {
      throw new RangeError('Cannot request one-time download and an expiration time together');
    }
    return null;
  }
  if (expirationSeconds === undefined || expirationSeconds === null) {
    return defaultSeconds || null;
  }
  if (typeof expirationSeconds === 'string' && !/^[0-9]+$/.test(expirationSeconds)) {
    throw new RangeError('X-Expiration-Seconds must be a positive integer');
  }
  const seconds = Number(expirationSeconds);
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > getMaximumExpirationSeconds(env)) {
    throw new RangeError('Expiration must be between 1 and MAX_AGE_FOR_MULTIDOWNLOAD seconds');
  }
  return seconds;
}
