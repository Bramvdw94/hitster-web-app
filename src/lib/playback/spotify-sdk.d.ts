// The parts of the Spotify Web Playback SDK (https://sdk.scdn.co/spotify-player.js) we use.
// Spotify ships no types, so these follow the SDK reference.

declare namespace Spotify {
  type ErrorEvent = "initialization_error" | "authentication_error" | "account_error" | "playback_error";

  interface WebPlaybackError {
    message: string;
  }

  interface WebPlaybackInstance {
    device_id: string;
  }

  interface WebPlaybackState {
    paused: boolean;
    position: number;
    duration: number;
    timestamp: number;
  }

  interface PlayerInit {
    name: string;
    getOAuthToken: (callback: (accessToken: string) => void) => void;
    volume?: number;
  }

  class Player {
    constructor(options: PlayerInit);
    connect(): Promise<boolean>;
    disconnect(): void;
    activateElement(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    seek(positionMs: number): Promise<void>;
    getCurrentState(): Promise<WebPlaybackState | null>;
    addListener(event: "ready" | "not_ready", callback: (instance: WebPlaybackInstance) => void): boolean;
    addListener(event: "player_state_changed", callback: (state: WebPlaybackState | null) => void): boolean;
    addListener(event: ErrorEvent, callback: (error: WebPlaybackError) => void): boolean;
    addListener(event: "autoplay_failed", callback: () => void): boolean;
  }
}

interface Window {
  Spotify?: typeof Spotify;
  onSpotifyWebPlaybackSDKReady?: () => void;
}
