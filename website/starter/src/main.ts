import { createNexClient, HttpError } from "@nexapi/core";
import { createApi } from "./api/index.js";

// Count the requests that really leave this program, so you can see what the cache saves.
let requestsSent = 0;
const nex = createNexClient({
  baseUrl: process.env.API_URL ?? "http://localhost:3000",
  middleware: [
    async (request, next) => {
      requestsSent++;
      return next(request);
    },
  ],
});
const api = createApi(nex);

console.log("1. List all pets");
console.log(await api.pets.get());

console.log("\n2. Only cats (a query parameter, checked by TypeScript)");
console.log(await api.pets.get({ query: { species: "cat" } }));

console.log("\n3. Add a pet (the body is the first argument)");
const created = await api.pets.post({ name: "Noodle", species: "dog" });
console.log(created);

console.log("\n4. A typed error");
try {
  await api.pets.byId("999").get();
} catch (error) {
  if (error instanceof HttpError && error.status === 404)
    console.log("Server said:", error.body.message);
  else throw error;
}

console.log("\n5. Five callers ask for the same pet at once");
requestsSent = 0;
const options = api.pets.byId(created.id).get.options();
await Promise.all(Array.from({ length: 5 }, () => nex.queryClient.fetchQuery(options)));
console.log("Requests sent:", requestsSent, "(not 5)");

console.log("\n6. Ask again with staleTime, so the cache answers");
requestsSent = 0;
const fresh = api.pets.byId("1").get.options(undefined, { staleTime: 60_000 });
await nex.queryClient.fetchQuery(fresh);
await nex.queryClient.fetchQuery(fresh);
console.log(
  "Requests sent:",
  requestsSent,
  "(two questions, one request: the second came from the cache)",
);
