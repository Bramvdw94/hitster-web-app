import "server-only";

type ServerEnv = {
  supabaseSecretKey: string;
  spotifyClientId: string;
  spotifyClientSecret: string;
};

// Secrets for Route Handlers only. Never import this from a Client Component.
export function readServerEnv(): ServerEnv {
  const values = {
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
  };
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing server environment variables: ${missing.join(", ")}`);
  }

  return {
    supabaseSecretKey: values.SUPABASE_SECRET_KEY!,
    spotifyClientId: values.SPOTIFY_CLIENT_ID!,
    spotifyClientSecret: values.SPOTIFY_CLIENT_SECRET!,
  };
}
