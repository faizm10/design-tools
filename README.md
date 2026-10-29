# Room Planner

A 3D bedroom planner that runs entirely in the browser. Set the room size, place doors and windows, drag furniture in from a catalogue, and switch between a top-down plan and an interactive 3D view. It needs no backend, no API keys and no external assets: every model and floor texture is generated in code.

Built with Next.js 16 (App Router), TypeScript, Tailwind CSS 4, React Three Fiber, Drei and Zustand.

## Run it

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev          # http://localhost:3000
```

Production build:

```bash
npm run build && npm start
```

On first visit the app loads a furnished example bedroom. Your work is saved to `localStorage` as you go, so a reload keeps your room. Use **Reset** in the toolbar to bring back the example (you can undo this).

## Using it

| Action | How |
| --- | --- |
| Add furniture | Drag a card from the catalogue into the room, or click it to drop it in a free spot |
| Move | Drag the item in either view. Hold **Alt** while dragging to turn snapping off |
| Rotate | **R** / **Shift+R**, the toolbar buttons, the rotation field, or the round handle in 2D (15° steps, hold **Shift** for 1°) |
| Resize | The square edge handles in 2D, or exact width, depth and height in the properties panel |
| Nudge | Arrow keys (one grid step, or 1 cm with **Shift**) |
| Duplicate / delete | **⌘/Ctrl+D** / **Delete** |
| Undo / redo | **⌘/Ctrl+Z** / **⇧⌘Z** or **Ctrl+Y** |
| Switch views | **2** / **3**, or the toggle in the header |
| Doors and windows | Add from the room panel (shown when nothing is selected), then drag along a wall. They jump to whichever wall is closest |
| Camera (3D) | Left-drag to orbit, right-drag to pan, scroll to zoom, ⤢ to reset |
| Walls (3D) | Cycle **Auto-hide** (hides walls between you and the room), **Show all**, **Cut away** |

Snapping aligns item edges to the grid (1, 5, 10 or 25 cm), then pulls them flush against walls and nearby furniture. The scene flags items that leave the room, overlap each other, stand taller than the ceiling, or block a door's swing. Rugs never count as overlapping, and table lamps rest on nightstands, desks and dressers.

**Import/export** saves or loads the whole plan as JSON. **Screenshot** downloads a PNG of whichever view is showing.

## How it fits together

```
lib/
  types.ts        Scene model: room, openings, furniture. All lengths in cm
  store.ts        Zustand store: actions, snapshot undo/redo, persistence, import validation
  geometry.ts     Footprints, SAT overlap test, snapping, warnings, wall maths
  catalog.ts      Catalogue entries with real-world default sizes and finishes
  textures.ts     Procedural floor textures (canvas), shared by both views
components/
  planner/        App shell: toolbar, catalogue, properties panel, overlays, shortcuts
  plan2d/         SVG plan view and furniture plan symbols (also the catalogue thumbnails)
  scene3d/        R3F scene, procedural furniture models, walls with real openings
```

- **One source of truth.** Both views render from the same scene in centimetres. Plan coordinates start at the north-west inner corner (+x east, +z south, clockwise rotation). The 3D view maps 100 cm to 1 m and centres the room. Floor textures use the same canvas and tile size in both views.
- **Dragging in 3D** raycasts against a horizontal plane at the height where you grabbed the item, so the point under the cursor stays under the cursor. Orbit controls are turned off for the whole gesture.
- **Undo history** stores whole-scene snapshots. A drag records one step when it first moves, and quick repeated edits to the same field (typing, colour picking) merge into one step.
- **No WebGL?** The 3D view shows a notice and sends you to the 2D plan, which still has every feature.
