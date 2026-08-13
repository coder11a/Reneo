/**
 * Client-side password hashing using Web Crypto API (SHA-256).
 * Uses email as a per-user salt to prevent rainbow table attacks.
 *
 * NOTE: For production, passwords should be hashed server-side with
 * bcrypt/argon2. SHA-256 is used here because we're doing client-side
 * auth without a dedicated auth server.
 */

const APP_SALT = 'reneo_live_2024';

export async function hashPassword(password: string, email: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${APP_SALT}:${email.toLowerCase()}:${password}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(
  password: string,
  email: string,
  storedHash: string
): Promise<boolean> {
  const hash = await hashPassword(password, email);
  return hash === storedHash;
}
