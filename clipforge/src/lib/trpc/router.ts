import { router } from "./server";
import { projectRouter } from "./routers/project";
import { apiKeyRouter } from "./routers/apiKey";

export const appRouter = router({
  project: projectRouter,
  apiKey: apiKeyRouter,
});

export type AppRouter = typeof appRouter;
