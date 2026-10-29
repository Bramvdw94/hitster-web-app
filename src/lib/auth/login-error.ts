export type LoginError = "gastenlijst" | "afgebroken" | "onbekend";

export const loginErrorMessages: Record<LoginError, string> = {
  gastenlijst: "Je staat nog niet op de gastenlijst. Vraag Bram om je toe te voegen.",
  afgebroken: "Inloggen is afgebroken. Probeer het nog een keer.",
  onbekend: "Inloggen lukte niet. Probeer het nog een keer.",
};

// Supabase sends Spotify's refusal back as `error` + `error_description`. A Spotify
// account that is not on the dev app's allowlist gets through Spotify's consent screen,
// but then Spotify refuses to hand over the profile, which Supabase reports as below.
export function classifyLoginError(error: string | null, description: string | null): LoginError {
  const text = `${error ?? ""} ${description ?? ""}`.toLowerCase();

  if (text.includes("user profile") || text.includes("not registered") || text.includes("user not approved")) {
    return "gastenlijst";
  }
  if (error === "access_denied") {
    return "afgebroken";
  }
  return "onbekend";
}

export function isLoginError(value: unknown): value is LoginError {
  return typeof value === "string" && Object.hasOwn(loginErrorMessages, value);
}
