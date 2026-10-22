/**
 * Cloudinary helpers shared by the browser and the server. Uploads are signed by the API (see
 * src/server/supabase-deps.ts), so no secret ever reaches the site. See docs/BACKEND.md.
 */
export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** A message when the file cannot be uploaded, otherwise null. */
export function checkImage(file: { type: string; size: number; name?: string }): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return "Use a PNG, JPEG, WebP, GIF or AVIF image.";
  if (file.size > MAX_IMAGE_BYTES) return "The image is larger than 5 MB. Resize it and try again.";
  return null;
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
