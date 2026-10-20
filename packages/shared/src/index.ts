import { z } from "zod";

export const JobStatus = z.enum(["pending", "running", "done", "failed", "paused"]);
export type JobStatus = z.infer<typeof JobStatus>;

export const IngestStats = z.object({
  pending: z.number(),
  running: z.number(),
  done: z.number(),
  failed: z.number(),
  paused: z.number(),
});
export type IngestStats = z.infer<typeof IngestStats>;

export const SearchHit = z.object({
  fileId: z.number(),
  path: z.string(),
  paths: z.array(z.string()),
  title: z.string(),
  snippet: z.string(),
  score: z.number(),
  page: z.number().nullable(),
});
export type SearchHit = z.infer<typeof SearchHit>;
