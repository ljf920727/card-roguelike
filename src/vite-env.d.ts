/** Declares the build-time multiplayer endpoint injected by Vite. */
/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_MULTIPLAYER_URL?: string;
}
