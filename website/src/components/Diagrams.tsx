import type { ReactNode } from "react";

/** Small inline SVG diagrams. They use the site's colour variables, so they follow the theme. */
function Frame({
  label,
  children,
  w,
  h,
}: {
  label: string;
  children: ReactNode;
  w: number;
  h: number;
}) {
  return (
    <figure className="diagram">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
        <defs>
          <marker
            id="arr"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M0 0 L10 5 L0 10 z" fill="var(--muted)" />
          </marker>
        </defs>
        {children}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function Box({
  x,
  y,
  w,
  h,
  title,
  sub,
  tone,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub?: string;
  tone?: "read" | "write" | "plain";
}) {
  const stroke =
    tone === "read" ? "var(--blue)" : tone === "write" ? "var(--green)" : "var(--line)";
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx="6"
        fill="var(--surface)"
        stroke={stroke}
        strokeWidth="1.5"
      />
      <text
        x={x + w / 2}
        y={y + (sub ? h / 2 - 3 : h / 2 + 4)}
        textAnchor="middle"
        fontSize="13"
        fontWeight="650"
        fill="var(--ink)"
      >
        {title}
      </text>
      {sub && (
        <text
          x={x + w / 2}
          y={y + h / 2 + 14}
          textAnchor="middle"
          fontSize="11"
          fill="var(--muted)"
        >
          {sub}
        </text>
      )}
    </g>
  );
}

function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke="var(--muted)"
      strokeWidth="1.5"
      markerEnd="url(#arr)"
    />
  );
}

/** How one read travels through NyxAPI. */
export function RequestFlow() {
  return (
    <Frame
      label="What happens when you ask for data: the cache answers if it can, otherwise one shared request goes out."
      w={760}
      h={190}
    >
      <Box x={10} y={70} w={110} h={50} title="Your code" sub="fetchQuery / hook" tone="plain" />
      <Arrow x1={120} y1={95} x2={150} y2={95} />
      <Box
        x={150}
        y={70}
        w={110}
        h={50}
        title="Cache key"
        sub="method + path + input"
        tone="read"
      />
      <Arrow x1={260} y1={95} x2={290} y2={95} />
      <Box x={290} y={70} w={110} h={50} title="Fresh?" sub="staleTime" tone="read" />
      <Arrow x1={345} y1={70} x2={345} y2={36} />
      <Box x={290} y={4} w={110} h={32} title="Return cached" tone="plain" />
      <Arrow x1={400} y1={95} x2={430} y2={95} />
      <Box
        x={430}
        y={70}
        w={110}
        h={50}
        title="Single flight"
        sub="share in-flight call"
        tone="read"
      />
      <Arrow x1={540} y1={95} x2={570} y2={95} />
      <Box x={570} y={70} w={90} h={50} title="Transport" sub="fetch + middleware" tone="plain" />
      <Arrow x1={660} y1={95} x2={690} y2={95} />
      <Box x={690} y={70} w={64} h={50} title="Decode" sub="json" tone="plain" />
      <Arrow x1={722} y1={120} x2={722} y2={150} />
      <Box x={560} y={150} w={194} h={34} title="Data, or a typed error" tone="plain" />
      <Arrow x1={560} y1={167} x2={206} y2={167} />
      <Box x={90} y={150} w={116} h={34} title="Written to cache" tone="read" />
    </Frame>
  );
}

/** Which kind of endpoint to reach for. */
export function ChooseApproach() {
  return (
    <Frame
      label="Choosing how to define an endpoint: generate when a schema exists, define by hand when it does not."
      w={760}
      h={200}
    >
      <Box
        x={10}
        y={75}
        w={150}
        h={50}
        title="Do you have a schema?"
        sub="OpenAPI, Swagger, GraphQL"
        tone="plain"
      />
      <Arrow x1={160} y1={90} x2={230} y2={50} />
      <text x={190} y={58} fontSize="11" fill="var(--muted)">
        yes
      </text>
      <Box
        x={230}
        y={25}
        w={200}
        h={50}
        title="nyx generate"
        sub="typed client from the schema"
        tone="read"
      />
      <Arrow x1={160} y1={110} x2={230} y2={150} />
      <text x={190} y={146} fontSize="11" fill="var(--muted)">
        no
      </text>
      <Box
        x={230}
        y={125}
        w={200}
        h={50}
        title="nyx.query / nyx.mutation"
        sub="describe each endpoint"
        tone="write"
      />
      <Arrow x1={430} y1={50} x2={500} y2={50} />
      <Arrow x1={430} y1={150} x2={500} y2={150} />
      <Box
        x={500}
        y={25}
        w={250}
        h={50}
        title="Same cache, same hooks"
        sub="keys, retries, optimistic updates"
        tone="plain"
      />
      <Box
        x={500}
        y={125}
        w={250}
        h={50}
        title="Same cache, same hooks"
        sub="you supply the types"
        tone="plain"
      />
    </Frame>
  );
}

/** Where each concern lives in an app. */
export function AppLayers() {
  return (
    <Frame
      label="The layers of an app that uses NyxAPI. Only the bottom layer talks to the network."
      w={760}
      h={210}
    >
      <Box
        x={10}
        y={10}
        w={740}
        h={42}
        title="Components"
        sub="useQuery / useMutation, or plain functions"
        tone="plain"
      />
      <Arrow x1={380} y1={52} x2={380} y2={72} />
      <Box
        x={10}
        y={72}
        w={740}
        h={42}
        title="Query client (one per user or request)"
        sub="cache, keys, retries, optimistic updates, invalidation"
        tone="read"
      />
      <Arrow x1={380} y1={114} x2={380} y2={134} />
      <Box
        x={10}
        y={134}
        w={740}
        h={42}
        title="Endpoints (generated or hand-written)"
        sub="paths, parameters, bodies, typed errors"
        tone="write"
      />
      <Arrow x1={380} y1={176} x2={380} y2={196} />
      <text x={392} y={194} fontSize="11" fill="var(--muted)">
        HTTP: pinned origin, token, middleware, timeout
      </text>
    </Frame>
  );
}
