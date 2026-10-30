// A world map picture as the game draws it: a UiMapArt's 256-pixel tiles
// (client_UiMapArtTile, 4 by 3) and, over them, every one of its overlays
// (client_WorldMapOverlay, the parts a player has explored: a zone's whole
// map once all are), cut to the map's 1002x668. The tiles are the game's own
// textures, as PNGs from wow-data's mirror of them (ui.ts' picture: Gethe's
// wow-ui-textures, classic branch, the art of 1.13.5), found by file id
// through the client's interface manifest at the pin.
import type { Database } from "bun:sqlite";

export const WIDTH = 1002, HEIGHT = 668, TILE = 256;

// a layer: a texture placed at x, y, cut to w x h from its top left (an
// overlay's last tiles: the client cuts each tile to the overlay's
// TextureWidth and Height, MapExplorationDataProvider's SetTexCoord)
export type Layer = { file: number; x: number; y: number; w: number; h: number };

// the layers of a map's picture, tiles first, then the overlays
export function layers(db: Database, art: number): Layer[] {
  const out: Layer[] = [];
  for (const t of db.query("SELECT RowIndex r, ColIndex c, FileDataID f FROM client_UiMapArtTile WHERE UiMapArtID = ? AND LayerIndex = 0 ORDER BY 1, 2").all(art) as { r: number; c: number; f: number }[])
    out.push({ file: t.f, x: t.c * TILE, y: t.r * TILE, w: TILE, h: TILE });
  type Overlay = { ID: number; OffsetX: number; OffsetY: number; TextureWidth: number; TextureHeight: number };
  for (const o of db.query("SELECT ID, OffsetX, OffsetY, TextureWidth, TextureHeight FROM client_WorldMapOverlay WHERE UiMapArtID = ? ORDER BY ID").all(art) as Overlay[])
    for (const t of db.query("SELECT RowIndex r, ColIndex c, FileDataID f FROM client_WorldMapOverlayTile WHERE WorldMapOverlayID = ? AND LayerIndex = 0 ORDER BY 1, 2").all(o.ID) as { r: number; c: number; f: number }[])
      out.push({
        file: t.f,
        x: o.OffsetX + t.c * TILE,
        y: o.OffsetY + t.r * TILE,
        w: Math.min(TILE, o.TextureWidth - t.c * TILE),
        h: Math.min(TILE, o.TextureHeight - t.r * TILE),
      });
  return out;
}

// the picture, written as a WebP; png: a layer's PNG on this disk (undefined:
// the mirror lacks it, and the picture is refused, not drawn with a hole)
export async function compose(list: Layer[], png: (file: number) => Promise<string | undefined>, out: string): Promise<void> {
  const args = ["-size", `${4 * TILE}x${3 * TILE}`, "xc:none"];
  for (const l of list) {
    const file = await png(l.file);
    if (!file) throw new Error(`no picture for file ${l.file} (${out})`);
    if (l.w <= 0 || l.h <= 0) continue;
    args.push("(", file, "-crop", `${l.w}x${l.h}+0+0`, "+repage", ")", "-geometry", `+${l.x}+${l.y}`, "-composite");
  }
  args.push("-crop", `${WIDTH}x${HEIGHT}+0+0`, "+repage", "-quality", "90", out);
  const r = Bun.spawnSync(["magick", ...args]);
  if (r.exitCode !== 0) throw new Error(`magick: ${r.stderr.toString()}`);
}
