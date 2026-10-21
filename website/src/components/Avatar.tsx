import { imageUrl } from "../lib/backend/cloudinary";

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0]?.toUpperCase() ?? "")
    .join("");

/** A person's photo, or a coloured monogram when they have none. Always decorative: the name is next to it. */
export function Avatar({
  name,
  url,
  size = 72,
}: {
  name: string;
  url: string | null;
  size?: number;
}) {
  const src = imageUrl(url, { width: size * 2, height: size * 2, face: true });
  if (src) {
    return (
      <img
        className="avatar"
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
      />
    );
  }
  let hue = 0;
  for (const ch of name) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      className="avatar mono"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(135deg, hsl(${String(hue)} 70% 52%), hsl(${String((hue + 50) % 360)} 70% 42%))`,
      }}
    >
      {initials(name)}
    </span>
  );
}
