/**
 * Cloudinary helpers. Uploads go straight from the browser with an *unsigned upload preset*, so no
 * secret ever reaches the site. Create the preset in Cloudinary (Settings, Upload) and restrict it:
 * allowed formats, a folder, a maximum file size, and (optionally) moderation. See docs/BACKEND.md.
 */
import type { UploadedImage } from "./types";

export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const cloudinaryConfig = {
  cloudName: process.env["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"] ?? "",
  uploadPreset: process.env["NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET"] ?? "",
};

export const cloudinaryConfigured = (): boolean =>
  cloudinaryConfig.cloudName !== "" && cloudinaryConfig.uploadPreset !== "";

/** A message when the file cannot be uploaded, otherwise null. */
export function checkImage(file: { type: string; size: number; name?: string }): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return "Use a PNG, JPEG, WebP, GIF or AVIF image.";
  if (file.size > MAX_IMAGE_BYTES) return "The image is larger than 5 MB. Resize it and try again.";
  return null;
}

interface CloudinaryResponse {
  public_id?: unknown;
  secure_url?: unknown;
  width?: unknown;
  height?: unknown;
  format?: unknown;
  bytes?: unknown;
  error?: { message?: unknown };
}
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

export async function uploadToCloudinary(
  file: File,
  folder: string,
  fetcher: typeof fetch = fetch,
): Promise<UploadedImage> {
  const problem = checkImage(file);
  if (problem) throw new Error(problem);
  if (!cloudinaryConfigured())
    throw new Error(
      "Cloudinary is not configured. Set the cloud name and upload preset (see docs/BACKEND.md).",
    );
  const body = new FormData();
  body.append("file", file);
  body.append("upload_preset", cloudinaryConfig.uploadPreset);
  if (folder) body.append("folder", folder);
  const res = await fetcher(
    `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`,
    {
      method: "POST",
      body,
    },
  );
  const json = (await res.json().catch(() => ({}))) as CloudinaryResponse;
  if (!res.ok || typeof json.secure_url !== "string" || typeof json.public_id !== "string") {
    const why =
      typeof json.error?.message === "string" ? json.error.message : `status ${String(res.status)}`;
    throw new Error(`Cloudinary refused the upload: ${why}`);
  }
  return {
    public_id: json.public_id,
    url: json.secure_url,
    width: num(json.width),
    height: num(json.height),
    format: typeof json.format === "string" ? json.format : null,
    bytes: num(json.bytes),
  };
}

export interface Transform {
  width?: number;
  height?: number;
  /** Crop to a square around the face when there is one. */
  face?: boolean;
}

/**
 * Ask Cloudinary for a resized, auto-format copy. URLs that are not Cloudinary URLs (or already
 * carry a transformation) are returned unchanged.
 */
export function imageUrl(url: string | null | undefined, t: Transform = {}): string | undefined {
  if (!url) return undefined;
  const m =
    /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(?!([a-z]{1,3}_[^/]*,?)+\/)(.+)$/.exec(
      url,
    );
  if (!m) return url;
  const parts = ["f_auto", "q_auto"];
  if (t.width) parts.push(`w_${String(t.width)}`);
  if (t.height) parts.push(`h_${String(t.height)}`);
  if (t.width || t.height) parts.push("c_fill");
  if (t.face) parts.push("g_face");
  return `${m[1] ?? ""}${parts.join(",")}/${m[3] ?? ""}`;
}
