// The family folder (~/code/wow-addons: addon-kit/ and wow-data/ side by
// side), the way the addons' scripts find it (addon-kit/root.ts): from
// WOW_ADDONS_ROOT, up from here, or up from the repository's main checkout
// (a worktree elsewhere on the disk). wow-data is reached through it, never
// copied.
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();
const isFamily = (dir: string) => isDir(join(dir, "addon-kit")) && isDir(join(dir, "wow-data"));

function findUp(from: string): string | undefined {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if (isFamily(dir)) return dir;
    if (dirname(dir) === dir) return undefined;
  }
}

export function familyRoot(): string {
  const env = process.env.WOW_ADDONS_ROOT;
  if (env) {
    if (isFamily(env)) return resolve(env);
    throw new Error(`WOW_ADDONS_ROOT=${env} holds no addon-kit/ and wow-data/`);
  }
  const git = Bun.spawnSync(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: import.meta.dir, stderr: "ignore" });
  const common = git.exitCode === 0 ? git.stdout.toString().trim() : undefined;
  const found = findUp(import.meta.dir) ?? (common && findUp(dirname(common))) ?? findUp(process.cwd());
  if (found) return found;
  throw new Error("no family folder (addon-kit/ and wow-data/ side by side) above geoguessr: set WOW_ADDONS_ROOT");
}

export const familyPath = (...parts: string[]) => join(familyRoot(), ...parts);
