import type { CookieOptions } from 'express';

export const REFRESH_TOKEN_COOKIE_NAME = 'ssi_refresh_token';

export const REFRESH_TOKEN_COOKIE_PATH = '/api/v1/auth';

export function getRefreshTokenCookieOptions(
  isProduction: boolean,
): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: REFRESH_TOKEN_COOKIE_PATH,
  };
}
