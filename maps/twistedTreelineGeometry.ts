import type { MapGeometry } from "@moba2d/core/content/ContentPack";
import mapJsonRaw from "./twistedTreeline_map.json?raw";

/**
 * Twisted Treeline's heavy half — the walls, bushes, slots and both lanes.
 * The map is drawn by hand in the editor (`moba2d-game/map-editor`) and
 * exported here, so a retune is a re-export, not an edit in this file.
 */
export const twistedTreelineGeometry: MapGeometry = JSON.parse(mapJsonRaw);
