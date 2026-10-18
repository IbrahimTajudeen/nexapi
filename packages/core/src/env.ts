/** Injectable environment signals. Defaults use `document`/`window` when present, else are inert. */
export interface FocusManager {
  isFocused(): boolean;
  /** Subscribe to focus-regained events. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export interface OnlineManager {
  isOnline(): boolean;
  /** Subscribe to reconnect events. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/** A manually driven manager, ideal for tests and non-browser runtimes (React Native, Electron...). */
export class ManualEnvironment implements FocusManager, OnlineManager {
  #focused = true;
  #online = true;
  readonly #focusListeners = new Set<() => void>();
  readonly #onlineListeners = new Set<() => void>();
  readonly focus: FocusManager = {
    isFocused: () => this.#focused,
    subscribe: (l) => {
      this.#focusListeners.add(l);
      return () => void this.#focusListeners.delete(l);
    },
  };
  readonly online: OnlineManager = {
    isOnline: () => this.#online,
    subscribe: (l) => {
      this.#onlineListeners.add(l);
      return () => void this.#onlineListeners.delete(l);
    },
  };
  isFocused(): boolean {
    return this.#focused;
  }
  isOnline(): boolean {
    return this.#online;
  }
  subscribe(listener: () => void): () => void {
    return this.focus.subscribe(listener);
  }
  /** Fires focus listeners when transitioning to focused. */
  setFocused(focused: boolean): void {
    const changed = focused !== this.#focused;
    this.#focused = focused;
    if (changed && focused) for (const l of [...this.#focusListeners]) l();
  }
  /** Fires reconnect listeners when transitioning to online. */
  setOnline(online: boolean): void {
    const changed = online !== this.#online;
    this.#online = online;
    if (changed && online) for (const l of [...this.#onlineListeners]) l();
  }
}

export function createBrowserFocusManager(): FocusManager {
  return {
    isFocused: () => typeof document === "undefined" || document.visibilityState !== "hidden",
    subscribe(listener) {
      if (typeof document === "undefined") return () => undefined;
      const handler = (): void => {
        if (document.visibilityState === "visible") listener();
      };
      document.addEventListener("visibilitychange", handler);
      return () => document.removeEventListener("visibilitychange", handler);
    },
  };
}

export function createBrowserOnlineManager(): OnlineManager {
  return {
    // Only a browser that can also tell us when it comes back online may report "offline":
    // Node (>= 21) has a `navigator` without `onLine`, and pausing there would never resume.
    isOnline: () =>
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      navigator.onLine !== false,
    subscribe(listener) {
      if (typeof window === "undefined") return () => undefined;
      window.addEventListener("online", listener);
      return () => window.removeEventListener("online", listener);
    },
  };
}
