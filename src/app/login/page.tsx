import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isLoginError, loginErrorMessages } from "@/lib/auth/login-error";
import { createClient } from "@/lib/supabase/server";
import { logInWithSpotify } from "./actions";
import { HashError } from "./hash-error";
import styles from "./page.module.css";

async function LoginForm({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) {
    redirect("/");
  }

  const { fout } = await searchParams;
  const message = isLoginError(fout) ? loginErrorMessages[fout] : null;

  return (
    <>
      {message && (
        <p className={styles.message} role="alert">
          {message}
        </p>
      )}
      <form action={logInWithSpotify}>
        <button type="submit" className={styles.spotify}>
          <svg className={styles.logo} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm5.5 17.3a.75.75 0 0 1-1 .25c-2.8-1.7-6.4-2.1-10.6-1.2a.75.75 0 1 1-.33-1.46c4.6-1 8.6-.6 11.7 1.4.36.22.47.69.25 1.03Zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.2-2-8.1-2.5-11.9-1.4a.94.94 0 1 1-.54-1.8c4.3-1.3 9.7-.7 13.4 1.6.44.27.58.85.31 1.29Zm.13-3.4C15.2 8.3 8.9 8.1 5.2 9.2a1.13 1.13 0 1 1-.65-2.16c4.2-1.3 11.2-1 15.7 1.6a1.13 1.13 0 0 1-1.15 1.94Z" />
          </svg>
          Inloggen met Spotify
        </button>
      </form>
    </>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className={styles.page}>
      <div className={styles.record} aria-hidden="true" />
      <div className={styles.intro}>
        <h1 className={styles.title}>Jaartal</h1>
        <p className={styles.tagline}>Oefenen voor Hitster</p>
      </div>

      <div className={styles.actions}>
        <Suspense fallback={<div className={styles.placeholder} />}>
          <LoginForm searchParams={searchParams} />
        </Suspense>
        <p className={styles.note}>Je hebt Spotify Premium nodig om muziek af te spelen.</p>
      </div>

      <HashError />
      <p className={styles.footer}>Privé oefenapp, niet van Hitster of Jumbo.</p>
    </main>
  );
}
