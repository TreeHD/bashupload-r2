import { encodeObjectKey } from './url-path.js';
import { resolveUploadExpiration } from './expiration.js';

export const MULTIPART_PART_SIZE = 90 * 1024 * 1024; // 90 MiB = 94,371,840 bytes
export const MULTIPART_SESSION_PREFIX = '_internal/multipart/';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PARTS = 10000;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function fail(message, status = 400) {
  return json({ error: message }, status);
}

function authenticate(request, env) {
  if (!env.PASSWORD) return true;
  const header = request.headers.get('Authorization') || '';
  if (header.startsWith('Basic ')) {
    try {
      const credentials = atob(header.slice(6));
      return credentials.slice(credentials.indexOf(':') + 1) === env.PASSWORD;
    } catch {
      return false;
    }
  }
  return header === env.PASSWORD;
}

function validSessionId(value) {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value);
}

async function readSession(env, id) {
  if (!validSessionId(id)) return null;
  const object = await env.R2_BUCKET.get(MULTIPART_SESSION_PREFIX + id);
  if (!object) return null;
  const session = await object.json();
  if (!session || session.id !== id || Date.now() >= session.expiresAt) return null;
  return session;
}

function expectedPartBytes(session, partNumber) {
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > session.partCount) {
    return null;
  }
  return Math.min(session.partSize, session.size - (partNumber - 1) * session.partSize);
}

async function readJson(request) {
  const length = Number(request.headers.get('Content-Length'));
  if (length > 100_000) throw new Error('Request metadata is too large');
  const body = await request.text();
  if (body.length > 100_000) throw new Error('Request metadata is too large');
  return JSON.parse(body);
}

export function resolveExpirationTime(object) {
  const metadata = object?.customMetadata || {};
  if (metadata.expirationTime) return metadata.expirationTime;
  const seconds = Number(metadata.expirationSeconds);
  if (Number.isFinite(seconds) && seconds > 0 && object?.uploaded) {
    return new Date(new Date(object.uploaded).getTime() + seconds * 1000).toISOString();
  }
  return null;
}

export async function cleanupMultipartSession(env, key) {
  try {
    const object = await env.R2_BUCKET.get(key);
    if (object) {
      const session = await object.json();
      if (session?.key && session?.uploadId) {
        await env.R2_BUCKET.resumeMultipartUpload(session.key, session.uploadId).abort();
      }
    }
  } catch (error) {
    console.warn('[Multipart cleanup] Could not abort abandoned upload:', error);
  } finally {
    await env.R2_BUCKET.delete(key);
  }
}

export async function handleMultipart(request, env, options = {}) {
  const url = new URL(request.url);
  const action = url.pathname;
  const partSize = options.partSize || MULTIPART_PART_SIZE;

  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return fail('Cross-origin upload is not allowed', 403);
  if (!authenticate(request, env)) return fail('Unauthorized', 401);

  try {
    if (action === '/api/multipart/init' && request.method === 'POST') {
      const body = await readJson(request);
      const name = body?.name;
      const size = body?.size;
      const maxSize = Number(env.MAX_UPLOAD_SIZE || 5368709120);
      if (typeof name !== 'string' || !name || /[\\/\x00-\x1f\x7f]/.test(name)) {
        return fail('Invalid filename');
      }
      if (new TextEncoder().encode(name).byteLength > 900) {
        return fail('Filename is too long');
      }
      if (!Number.isSafeInteger(size) || size <= partSize || size > maxSize) {
        return fail('File size is invalid or exceeds MAX_UPLOAD_SIZE', 413);
      }
      const partCount = Math.ceil(size / partSize);
      if (partCount > MAX_PARTS) return fail('Too many parts', 413);

      let expirationSeconds;
      try {
        expirationSeconds = resolveUploadExpiration(env, {
          expirationSeconds: body.expirationSeconds,
          oneTime: body.oneTime === true,
        });
      } catch (error) {
        return fail(error.message);
      }

      const contentType = typeof body.type === 'string' && body.type.length <= 255 && !/[\r\n]/.test(body.type)
        ? body.type || 'application/octet-stream' : 'application/octet-stream';
      const id = crypto.randomUUID();
      const key = id.replace(/-/g, '').slice(0, 12) + '/' + name;
      const metadata = {
        oneTime: expirationSeconds === null ? 'true' : 'false'
      };
      // Use R2's final object upload timestamp for expiration, not multipart initiation time.
      if (expirationSeconds !== null) metadata.expirationSeconds = String(expirationSeconds);
      const upload = await env.R2_BUCKET.createMultipartUpload(key, {
        httpMetadata: { contentType },
        customMetadata: metadata,
      });
      const session = {
        id, key, uploadId: upload.uploadId, size, partSize, partCount,
        shortUrl: body.shortUrl === true,
        expiresAt: Date.now() + SESSION_TTL_MS,
      };
      try {
        await env.R2_BUCKET.put(MULTIPART_SESSION_PREFIX + id, JSON.stringify(session), {
          httpMetadata: { contentType: 'application/json' },
          customMetadata: { expirationTime: new Date(session.expiresAt).toISOString() },
        });
      } catch (error) {
        await upload.abort();
        throw error;
      }
      return json({ sessionId: id, partSize, partCount });
    }

    if (action === '/api/multipart/part' && request.method === 'PUT') {
      const id = url.searchParams.get('sessionId');
      const session = await readSession(env, id);
      if (!session) return fail('Upload session not found or expired', 404);
      const partNumber = Number(url.searchParams.get('partNumber'));
      const expected = expectedPartBytes(session, partNumber);
      if (expected === null || !request.body) return fail('Invalid part number or empty part');
      const lengthHeader = request.headers.get('Content-Length');
      // Browser Blob uploads have a fixed Content-Length. Checking it before
      // streaming prevents oversized or truncated parts being accepted.
      if (lengthHeader === null) {
        return fail('Content-Length is required for multipart parts', 411);
      }
      if (!Number.isSafeInteger(Number(lengthHeader)) || Number(lengthHeader) !== expected) {
        return fail(`Incorrect size for part ${partNumber}: expected ${expected} bytes, got ${lengthHeader}`, 413);
      }

      // R2 requires a ReadableStream with a known length. TransformStream
      // strips the fixed-length metadata from the incoming request body.
      // Pass request.body through unchanged, as in the official R2 example.
      // Neither buffering nor a content-transform is needed here.
      const upload = env.R2_BUCKET.resumeMultipartUpload(session.key, session.uploadId);
      try {
        const part = await upload.uploadPart(partNumber, request.body);
        return json({ partNumber: part.partNumber, etag: part.etag });
      } catch (error) {
        console.error(`[Multipart part ${partNumber}] Upload failed (expected ${expected} bytes):`, error);
        return fail(`Chunk ${partNumber}: ${error?.message || 'R2 upload failed'}`, 400);
      }
    }

    if (action === '/api/multipart/complete' && request.method === 'POST') {
      const body = await readJson(request);
      const session = await readSession(env, body?.sessionId);
      if (!session) return fail('Upload session not found or expired', 404);
      if (!Array.isArray(body.parts) || body.parts.length !== session.partCount) {
        return fail('Incomplete part list');
      }
      const parts = [...body.parts].sort((a, b) => a.partNumber - b.partNumber);
      if (!parts.every((part, i) =>
        part && part.partNumber === i + 1 &&
        typeof part.etag === 'string' && part.etag.length > 0 && part.etag.length <= 256)) {
        return fail('Invalid part list');
      }
      const upload = env.R2_BUCKET.resumeMultipartUpload(session.key, session.uploadId);
      const object = await upload.complete(parts);
      if (object.size !== session.size) {
        await env.R2_BUCKET.delete(session.key);
        await env.R2_BUCKET.delete(MULTIPART_SESSION_PREFIX + session.id);
        return fail('Completed object size does not match the declared file size');
      }
      await env.R2_BUCKET.delete(MULTIPART_SESSION_PREFIX + session.id);

      let fileUrl = url.origin + '/' + encodeObjectKey(session.key);
      if (session.shortUrl && env.SHORT_URL_SERVICE) {
        try {
          const shortResponse = await fetch(env.SHORT_URL_SERVICE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'longUrl=' + encodeURIComponent(btoa(fileUrl)),
          });
          if (shortResponse.ok) {
            const data = await shortResponse.json();
            if (data.Code === 1 && data.ShortUrl) fileUrl = data.ShortUrl;
          }
        } catch (error) {
          console.warn('[Multipart] Short URL failed:', error);
        }
      }
      return json({ url: fileUrl, size: object.size });
    }

    if (action === '/api/multipart/abort' && request.method === 'DELETE') {
      const body = await readJson(request);
      const session = await readSession(env, body?.sessionId);
      if (!session) return json({ aborted: true });
      try {
        await env.R2_BUCKET.resumeMultipartUpload(session.key, session.uploadId).abort();
      } finally {
        await env.R2_BUCKET.delete(MULTIPART_SESSION_PREFIX + session.id);
      }
      return json({ aborted: true });
    }

    return fail('Not Found', 404);
  } catch (error) {
    console.error('[Multipart] Request failed:', error);
    return fail('Multipart upload failed: ' + error.message, 400);
  }
}
