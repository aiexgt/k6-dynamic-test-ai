/**
 * Utility for bidirectional synchronization between URL endpoints and JSON parameters.
 */

function safeEncodeParam(str: string): string {
  if (!str) return '';
  // Preserve template interpolation tags like {{varName}}
  const parts = str.split(/(\{\{[^}]+\}\})/g);
  return parts
    .map(part => {
      if (part.startsWith('{{') && part.endsWith('}}')) {
        return part;
      }
      return encodeURIComponent(part);
    })
    .join('');
}

function safeDecodeParam(str: string): string {
  if (!str) return '';
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

/**
 * Parses a full URL or relative path, separating the base path from query parameters as an object and JSON string.
 */
export function parseUrlToPathAndParams(fullUrlOrPath: string): {
  basePath: string;
  params: Record<string, string>;
  paramsJson: string;
} {
  if (!fullUrlOrPath) {
    return { basePath: '', params: {}, paramsJson: '{}' };
  }

  const queryIndex = fullUrlOrPath.indexOf('?');
  if (queryIndex === -1) {
    return { basePath: fullUrlOrPath, params: {}, paramsJson: '{}' };
  }

  const basePath = fullUrlOrPath.substring(0, queryIndex);
  const queryString = fullUrlOrPath.substring(queryIndex + 1);
  const params: Record<string, string> = {};

  if (queryString.trim()) {
    const pairs = queryString.split('&');
    for (const pair of pairs) {
      if (!pair) continue;
      const eqIndex = pair.indexOf('=');
      if (eqIndex === -1) {
        const key = safeDecodeParam(pair);
        params[key] = '';
      } else {
        const key = safeDecodeParam(pair.substring(0, eqIndex));
        const val = safeDecodeParam(pair.substring(eqIndex + 1));
        params[key] = val;
      }
    }
  }

  return {
    basePath,
    params,
    paramsJson: JSON.stringify(params, null, 2)
  };
}

/**
 * Reconstructs a full URL or relative path from a base path and a params object or JSON string.
 */
export function buildUrlFromPathAndParams(
  basePath: string,
  params: Record<string, any> | string
): string {
  let parsedParams: Record<string, any> = {};

  if (typeof params === 'string') {
    try {
      const parsed = JSON.parse(params || '{}');
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        parsedParams = parsed;
      } else {
        return basePath.split('?')[0];
      }
    } catch {
      // While user is typing invalid JSON, keep existing URL query
      return basePath;
    }
  } else if (params && typeof params === 'object') {
    parsedParams = params;
  }

  const cleanBase = (basePath || '').split('?')[0];
  const keys = Object.keys(parsedParams);
  if (keys.length === 0) {
    return cleanBase;
  }

  const queryString = keys
    .map(key => {
      const val = parsedParams[key];
      const encodedKey = safeEncodeParam(key);
      const encodedVal = val !== undefined && val !== null ? safeEncodeParam(String(val)) : '';
      return `${encodedKey}=${encodedVal}`;
    })
    .join('&');

  return queryString ? `${cleanBase}?${queryString}` : cleanBase;
}
