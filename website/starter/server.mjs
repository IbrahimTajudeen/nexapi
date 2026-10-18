// A tiny pet shop API, so you have something real to call. Run it with: npm run api
// It keeps data in memory and resets when you stop it.
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 3000);
const pets = [
  { id: "1", name: "Miso", species: "cat" },
  { id: "2", name: "Biscuit", species: "dog" },
  { id: "3", name: "Pepper", species: "cat" },
];
let nextId = 4;

const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(body === undefined ? undefined : JSON.stringify(body));
};

const readJson = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : undefined;
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  console.log(req.method, url.pathname + url.search);
  await new Promise((r) => setTimeout(r, 150)); // pretend the network is a little slow

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
    });
    return res.end();
  }
  if (url.pathname === "/pets" && req.method === "GET") {
    const species = url.searchParams.get("species");
    return send(
      res,
      200,
      pets.filter((p) => !species || p.species === species),
    );
  }
  if (url.pathname === "/pets" && req.method === "POST") {
    let body;
    try {
      body = await readJson(req);
    } catch {
      return send(res, 422, { code: "invalid_json", message: "The body is not valid JSON" });
    }
    if (
      !body ||
      typeof body.name !== "string" ||
      body.name.trim() === "" ||
      !["cat", "dog"].includes(body.species)
    )
      return send(res, 422, {
        code: "invalid_pet",
        message: "A pet needs a name and a species (cat or dog)",
      });
    const pet = { id: String(nextId++), name: body.name.trim(), species: body.species };
    pets.push(pet);
    return send(res, 201, pet);
  }
  const one = /^\/pets\/([^/]+)$/.exec(url.pathname);
  if (one && req.method === "GET") {
    const pet = pets.find((p) => p.id === decodeURIComponent(one[1]));
    return pet
      ? send(res, 200, pet)
      : send(res, 404, { code: "not_found", message: `No pet with id ${one[1]}` });
  }
  send(res, 404, { code: "not_found", message: "Unknown route" });
}).listen(PORT, () =>
  console.log(`Pet shop API running at http://localhost:${PORT} (Ctrl+C to stop)`),
);
