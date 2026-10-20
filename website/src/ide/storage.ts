/**
 * Browser persistence for the IDE. The workspace is stored in IndexedDB, with localStorage as a
 * fallback when IndexedDB is unavailable (some private windows). Everything stays on this device.
 */
import type { Snapshot } from "./vfs";

export interface Workspace {
  version: 1;
  snapshot: Snapshot;
  open: string[];
  active: string | null;
  cwd: string;
}

const DB = "nyxapi-ide";
const STORE = "kv";
const KEY = "workspace";
const LS_KEY = "nyxapi.ide.workspace.v1";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB failed"));
  });
}

export function isWorkspace(v: unknown): v is Workspace {
  if (typeof v !== "object" || v === null) return false;
  const w = v as Partial<Workspace>;
  return (
    w.version === 1 &&
    typeof w.snapshot === "object" &&
    w.snapshot !== null &&
    typeof w.snapshot.files === "object" &&
    Array.isArray(w.snapshot.dirs) &&
    Array.isArray(w.open)
  );
}

export async function loadWorkspace(): Promise<Workspace | null> {
  try {
    const db = await idb();
    const value = await new Promise<unknown>((resolve, reject) => {
      const r = db.transaction(STORE).objectStore(STORE).get(KEY);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error ?? new Error("read failed"));
    });
    db.close();
    if (isWorkspace(value)) return value;
  } catch {
    /* fall through to localStorage */
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isWorkspace(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Resolves to "idb", "local" or the error message when nothing could be stored. */
export async function saveWorkspace(w: Workspace): Promise<string> {
  try {
    const db = await idb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(w, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("write failed"));
    });
    db.close();
    return "idb";
  } catch {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(w));
      return "local";
    } catch (e) {
      return e instanceof Error ? e.message : "storage is unavailable";
    }
  }
}

export async function clearWorkspace(): Promise<void> {
  try {
    const db = await idb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}
