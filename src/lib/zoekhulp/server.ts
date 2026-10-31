import "server-only";
import { cookies } from "next/headers";
import { ZOEKHULP_COOKIE } from "./preference";

export async function zoekhulpOn(): Promise<boolean> {
  return (await cookies()).get(ZOEKHULP_COOKIE)?.value === "1";
}
