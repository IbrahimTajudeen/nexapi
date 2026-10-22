import { useMutation } from "@nyxapi/react";
import { backendMode, loadBackend } from "../backend";
import { checkImage } from "../backend/cloudinary";
import type { MediaRow } from "../backend/types";
import { api } from "./client";
import { listKey } from "./resources";

interface UploadInput {
  file: File;
  folder: string;
  alt: string;
}

interface CloudinaryReply {
  public_id?: unknown;
  secure_url?: unknown;
  width?: unknown;
  height?: unknown;
  format?: unknown;
  bytes?: unknown;
  error?: { message?: unknown };
}
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

/**
 * Upload an image and register it in the media library.
 *
 * Real builds: ask the API to sign the upload (the Cloudinary secret never reaches the browser),
 * send the file straight to Cloudinary, then register the result with the API.
 * Demo builds keep a small copy in this browser instead.
 */
export async function uploadImage({ file, folder, alt }: UploadInput): Promise<MediaRow> {
  const problem = checkImage(file);
  if (problem) throw new Error(problem);

  if (backendMode === "demo") {
    const backend = await loadBackend();
    if (!backend?.uploadImage) throw new Error("No backend is available.");
    return backend.uploadImage(file, folder, alt);
  }

  const signed = await api.media.sign.post({ folder });
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", signed.apiKey);
  form.append("timestamp", String(signed.timestamp));
  form.append("signature", signed.signature);
  form.append("folder", signed.folder);
  form.append("allowed_formats", signed.allowedFormats);
  const res = await fetch(signed.uploadUrl, { method: "POST", body: form });
  const reply = (await res.json().catch(() => ({}))) as CloudinaryReply;
  if (!res.ok || typeof reply.secure_url !== "string" || typeof reply.public_id !== "string") {
    const why =
      typeof reply.error?.message === "string"
        ? reply.error.message
        : `status ${String(res.status)}`;
    throw new Error(`Cloudinary refused the upload: ${why}`);
  }
  const body = {
    public_id: reply.public_id,
    url: reply.secure_url,
    width: num(reply.width),
    height: num(reply.height),
    format: typeof reply.format === "string" ? reply.format : null,
    bytes: num(reply.bytes),
    folder: signed.folder,
    alt,
  };
  return await api.media.post(body);
}

/** `mutateAsync({ file, folder, alt })`; the media library refreshes by itself afterwards. */
export function useUploadImage() {
  return useMutation<MediaRow, Error, UploadInput>({
    mutationFn: uploadImage,
    invalidates: [listKey("media")],
  });
}
