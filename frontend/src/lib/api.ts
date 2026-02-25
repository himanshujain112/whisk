import { hc } from "hono/client";
import type { AppType } from "backend";

const client = hc<AppType>("http://localhost:8787");

export default client;
