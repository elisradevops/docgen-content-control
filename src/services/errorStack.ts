// The top frames of an error's stack, for the error response sent to api-gate. Frames only: the
// header line repeats the message (already sent as `message`) and may span several lines. Bounded in
// count and size so a deep or odd stack cannot flood the run record, and nothing but code locations
// leaves the service - never the message text twice, never request data.
const MAX_FRAMES = 8;
const MAX_STACK_CHARS = 1500;

export function boundedStack(error: unknown): string | undefined {
  const stack = (error as { stack?: unknown } | null | undefined)?.stack;
  if (typeof stack !== "string") return undefined;
  const frames = stack
    .split("\n")
    .filter((line) => /^\s+at\s/.test(line))
    .slice(0, MAX_FRAMES)
    .map((line) => line.trimEnd())
    .join("\n");
  return frames ? frames.slice(0, MAX_STACK_CHARS) : undefined;
}
