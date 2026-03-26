import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Delete stored images older than 7 days (3am UTC daily)
crons.daily(
  "cleanup-old-images",
  { hourUTC: 3, minuteUTC: 0 },
  internal.storage.deleteOldImages
);

export default crons;
