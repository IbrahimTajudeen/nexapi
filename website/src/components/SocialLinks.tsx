import { SOCIAL_NETWORKS, isHttps } from "../admin/form";

/** Links to a person's profiles. Only https links are rendered, whatever the database holds. */
export function SocialLinks({
  name,
  socials,
  website,
}: {
  name: string;
  socials: Record<string, string>;
  website?: string | null;
}) {
  const links = [
    ...SOCIAL_NETWORKS.filter((n) => n.key !== "website")
      .map((n) => ({ label: n.label, href: socials[n.key] }))
      .filter(
        (l): l is { label: string; href: string } => typeof l.href === "string" && isHttps(l.href),
      ),
    ...(website && isHttps(website) ? [{ label: "Website", href: website }] : []),
  ];
  if (links.length === 0) return null;
  return (
    <ul className="social-links" aria-label={`${name} on the web`}>
      {links.map((l) => (
        <li key={l.label}>
          <a
            href={l.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            aria-label={`${name} on ${l.label}`}
          >
            {l.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
