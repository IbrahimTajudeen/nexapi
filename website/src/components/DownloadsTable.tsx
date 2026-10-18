import data from "@/generated/downloads.json";

const DESCRIPTION: Record<string, string> = {
  core: "HTTP client, query cache and mutations",
  codegen: "OpenAPI to TypeScript generator",
  cli: "The nyx command",
  react: "React hooks",
  devtools: "Cache inspector and React panel",
};

function size(bytes: number): string {
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
}

export function DownloadsTable() {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>File</th>
            <th>What it is</th>
            <th>Size</th>
            <th>SHA-256</th>
          </tr>
        </thead>
        <tbody>
          {data.files.map((f) => {
            const pkg = /^nyxapi-([a-z]+)-/.exec(f.file)?.[1] ?? "";
            return (
              <tr key={f.file}>
                <td>
                  <a href={`/downloads/${f.file}`} download>
                    {f.file}
                  </a>
                </td>
                <td>
                  {f.kind === "source"
                    ? "Full source code, ready to build"
                    : f.kind === "starter"
                      ? "Starter project: a pet shop API and a ready-to-run program"
                      : (DESCRIPTION[pkg] ?? "Package")}
                </td>
                <td>{size(f.bytes)}</td>
                <td>
                  <code style={{ fontSize: "0.74rem", wordBreak: "break-all" }}>
                    {f.sha256.slice(0, 16)}…
                  </code>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
