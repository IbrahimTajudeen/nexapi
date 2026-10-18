import * as core from "@nexapi/core";
import { createApi } from "../demo/api/index";
import { createMockServer, type MockServer } from "../demo/mock-server";

export interface Engine {
  nex: core.NexClient;
  api: ReturnType<typeof createApi>;
  server: MockServer;
  core: typeof core;
}

/** A fresh client + cache + mock backend. One per playground, so demos never share state. */
export function createEngine(): Engine {
  const server = createMockServer();
  const nex = core.createNexClient({
    baseUrl: "https://api.example.com/v1",
    transport: server.transport,
    queryClient: { defaultOptions: { queries: { retry: false } } },
  });
  return { nex, api: createApi(nex), server, core };
}
