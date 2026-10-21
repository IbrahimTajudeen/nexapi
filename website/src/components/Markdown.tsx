import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders Markdown written in the admin panel. Raw HTML is never rendered and unsafe link schemes are dropped. */
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // the page title is the only h1, so headings in the body start at h2
        h1: ({ children: c }) => <h2>{c}</h2>,
        h2: ({ children: c }) => <h3>{c}</h3>,
        h3: ({ children: c }) => <h4>{c}</h4>,
        h4: ({ children: c }) => <h5>{c}</h5>,
        a: ({ href, children: c }) =>
          href?.startsWith("/") || href?.startsWith("#") ? (
            <a href={href}>{c}</a>
          ) : (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {c}
            </a>
          ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
