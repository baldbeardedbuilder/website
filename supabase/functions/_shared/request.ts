import {
  hashIp as hashIpValue,
  isLikeTarget,
  isTargetKey,
  isTargetKind
} from '../../../src/lib/reader.ts';

export { isLikeTarget, isTargetKey, isTargetKind };
export type { LikeTarget, TargetKind } from '../../../src/lib/reader.ts';

export function isBrowserToken(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const addresses = forwarded.split(',').map((address) => address.trim()).filter(Boolean);
    if (addresses.length) return addresses[addresses.length - 1];
  }
  return request.headers.get('x-real-ip')?.trim() || '0.0.0.0';
}

export function hashIp(ip: string): Promise<string> {
  return hashIpValue(ip, Deno.env.get('LIKE_IP_SECRET'));
}
