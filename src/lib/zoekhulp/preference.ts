// Zoekhulp is a per-phone choice made on the start screens of Spel and Oefenen. A cookie, so
// the server renders the game screen with or without suggestions and a reload keeps it.
export const ZOEKHULP_COOKIE = "zoekhulp";

export function writeZoekhulp(on: boolean): void {
  const year = 60 * 60 * 24 * 365;
  document.cookie = `${ZOEKHULP_COOKIE}=${on ? "1" : "0"}; path=/; max-age=${year}; samesite=lax`;
}
