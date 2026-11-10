// Web Crypto API-based PBKDF2 password hashing compatible with Cloudflare Workers and Node.js >= 18
// ZERO plaintext password compatibility. Only cryptographically verified PBKDF2 hashes are accepted.

const ITERATIONS = 100000;
const KEY_LEN = 32; // 256 bits
const DIGEST = 'SHA-256';

export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: DIGEST,
    },
    passwordKey,
    KEY_LEN * 8
  );

  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(derivedBits)).map((b) => b.toString(16).padStart(2, '0')).join('');

  return `pbkdf2$${ITERATIONS}$${saltHex}$${hashHex}`;
}

export async function verifyPassword(password: string, storedHash?: string | null): Promise<boolean> {
  if (!password || !storedHash) return false;

  const parts = storedHash.split('$');
  // Strict format enforcement: must be pbkdf2$<iterations>$<saltHex>$<hashHex>
  // Plaintext and legacy unsalted formats are strictly rejected
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
    return false;
  }

  const iterations = parseInt(parts[1], 10);
  if (isNaN(iterations) || iterations < 10000) return false;

  const saltHex = parts[2];
  const originalHashHex = parts[3];

  const saltBytes = new Uint8Array(
    saltHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
  );
  if (saltBytes.length !== 16) return false;

  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: DIGEST,
    },
    passwordKey,
    KEY_LEN * 8
  );

  const derivedHex = Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time string comparison to prevent timing attacks
  if (derivedHex.length !== originalHashHex.length) return false;
  let mismatch = 0;
  for (let i = 0; i < derivedHex.length; i++) {
    mismatch |= derivedHex.charCodeAt(i) ^ originalHashHex.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function hashToken(token: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(token));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateSecureToken(prefix = 'tok'): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(24));
  const hex = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}

export function generateSessionToken(): string {
  return generateSecureToken('sess');
}

export async function generateCsrfToken(sessionToken: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`${sessionToken}:csrf-protection-secret-v1`));
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `csrf_${hex.substring(0, 32)}`;
}
