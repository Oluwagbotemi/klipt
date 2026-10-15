import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth";

async function handle(request: Request) {
  const auth = await getAuth();
  return auth.handler(request);
}

// toNextJsHandler is used for its method mapping; the auth instance is created lazily.
const { GET, POST } = toNextJsHandler(handle);
export { GET, POST };
