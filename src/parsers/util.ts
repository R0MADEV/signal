import { isAbsolute, relative } from "node:path";

export function relativizePath(p: string, root: string): string {
  if (!isAbsolute(p)) return p;
  const rel = relative(root, p);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return p;
  return rel;
}
