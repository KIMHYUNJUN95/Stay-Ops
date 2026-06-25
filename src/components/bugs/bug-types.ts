// Re-export the canonical types from the server-only domain module so components can import
// from a client-safe path without pulling `server-only` into the client bundle.
export type { BugReport, BugStatus } from "@/lib/bug-reports";
