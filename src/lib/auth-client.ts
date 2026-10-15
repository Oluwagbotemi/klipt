import { createAuthClient } from "better-auth/react";

/** Browser auth client. Talks to /api/auth on the current origin. */
export const authClient = createAuthClient();
