// R2 object keys are decoded Unicode strings, while URL paths are percent-encoded.
export function decodeObjectKey(pathname) {
  try {
    return decodeURIComponent(pathname.slice(1));
  } catch {
    return null;
  }
}

// Keep the R2 key's directory separators, but escape every path segment.
export function encodeObjectKey(key) {
  return key.split('/').map(segment => encodeURIComponent(segment)).join('/');
}
