# Room Planner

A 3D bedroom planner that runs entirely in the browser. Set the room size, place doors and windows, drag furniture in from a catalogue, and switch between a top-down plan and an interactive 3D view. Every model and floor texture is generated in code, so it needs no external assets. Saving to an account uses Neon (Auth and Postgres); without an account the planner runs fully in the browser.

Built with Next.js 16 (App Router), TypeScript, Tailwind CSS 4, React Three Fiber, Drei, Zustand and Neon.

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

On first visit the app loads a furnished example bedroom. Your work is saved to `localStorage` as you go, so a reload keeps your room. Use **Templates** in the toolbar to switch to another starting room: the furnished example, “My bedroom” (a 7.5 × 3.7 m room traced from a sketch), or an empty room. Loading a template can be undone.

## Accounts and cloud saves (Neon)

Planning never requires an account: everything works anonymously and autosaves in the browser. Pressing **Save** (or **⌘S**) while signed out opens a sign-in dialog; once you create an account or sign in, the plan is saved straight away. Signed in, **Save** updates the plan you're working on, and the account menu has **My plans** (open or delete), **Save as a copy**, and **Sign out**. Loading a template or importing a file starts a new plan, so the next Save won't overwrite the old one.

Identity is [Neon Auth](https://neon.com/docs/auth/overview) (managed Better Auth): email and password, plus Google through Neon's shared development keys. Plans live in a `plans` table in the same Neon Postgres database, storing the scene as JSONB. Every `/api/plans` route checks the session and filters by the signed-in user's id, so one account can never read or change another's plans.

### Set up Neon locally

1. Install the CLI and sign in: `npm i -g neon`, then `neon login`.
2. Link this folder to a Neon project (creates `.neon` and writes `DATABASE_URL` and the Auth URLs to `.env.local`):
   ```bash
   neon link --project-name room-planner --region-id aws-us-east-2   # or --project-id <existing id>
   neon deploy                                                       # applies neon.ts (enables Auth)
   ```
3. Add a cookie secret: `echo "NEON_AUTH_COOKIE_SECRET=$(openssl rand -base64 32)" >> .env.local`
4. Create the tables: `npm run db:migrate`

`.env.example` lists every variable. Before deploying, set the same variables on your host, add the production origin as a trusted domain (`neon neon-auth domain add https://your-app.example`), and replace the shared Google keys and shared email sender with your own (see Neon's [production checklist](https://neon.com/docs/auth/production-checklist)).

## Using it

| Action | How |
| --- | --- |
| Add furniture | Drag a card from the catalogue into the room, or click it to drop it in a free spot |
| Move | Drag the item in either view. Hold **Alt** while dragging to turn snapping off |
| Rotate | **R** / **Shift+R**, the toolbar buttons, the rotation field, or the round handle in 2D (15° steps, hold **Shift** for 1°) |
| Resize | The square edge handles in 2D, or exact width, depth and height in the properties panel |
| Wall and ceiling pieces | Shelves, art, mirrors, slat panels, curtains, LED strips and pendants have a **Height off floor** field. Clicking one in the catalogue mounts it on a free stretch of wall (curtains go over a window) |
| Nudge | Arrow keys (one grid step, or 1 cm with **Shift**) |
| Duplicate / delete | **⌘/Ctrl+D** / **Delete** |
| Save to account | **⌘/Ctrl+S** or the Save button |
| Undo / redo | **⌘/Ctrl+Z** / **⇧⌘Z** or **Ctrl+Y** |
| Switch views | **2** / **3**, or the toggle in the header |
| Doors and windows | Add from the room panel (shown when nothing is selected), then drag along a wall. They jump to whichever wall is closest |
| Camera (3D) | Left-drag to orbit, right-drag to pan, scroll to zoom, ⤢ to reset |
| Walls (3D) | Cycle **Auto-hide** (hides walls between you and the room), **Show all**, **Cut away** |

Snapping aligns item edges to the grid (1, 5, 10 or 25 cm), then pulls them flush against walls and nearby furniture. The scene flags items that leave the room, overlap each other, stand taller than the ceiling, or block a door's swing. Rugs never count as overlapping, items at different heights (a shelf above a desk) don't collide, and table lamps, TVs, vases and books rest on whatever surface is beneath them.

**Import/export** saves or loads the whole plan as JSON. **Screenshot** downloads a PNG of whichever view is showing.

## How it fits together

```
lib/
  types.ts        Scene model: room, openings, furniture. All lengths in cm
  store.ts        Zustand store: actions, snapshot undo/redo, persistence, import validation
  geometry.ts     Footprints, SAT overlap test, snapping, warnings, wall maths
  catalog.ts      Catalogue entries with real-world default sizes and finishes
  textures.ts     Procedural floor textures (canvas), shared by both views
  scene.ts        Scene validation, shared by the browser and the API
  cloud.ts        Client-side save/open/delete state for signed-in users
  auth/           Neon Auth server instance and browser client
  db.ts           Neon Postgres client (server only)
app/api/
  auth/[...path]  Neon Auth proxy
  plans/          List, create, read, update and delete saved plans
db/migrations/    SQL migrations, applied by `npm run db:migrate`
components/
  planner/        App shell: toolbar, catalogue, properties panel, overlays, shortcuts
  account/        Save button, sign-in dialog, account menu and My plans
  plan2d/         SVG plan view and furniture plan symbols (also the catalogue thumbnails)
  scene3d/        R3F scene, procedural furniture models, walls with real openings
```

- **One source of truth.** Both views render from the same scene in centimetres. Plan coordinates start at the north-west inner corner (+x east, +z south, clockwise rotation). The 3D view maps 100 cm to 1 m and centres the room. Floor textures use the same canvas and tile size in both views.
- **Dragging in 3D** raycasts against a horizontal plane at the height where you grabbed the item, so the point under the cursor stays under the cursor. Orbit controls are turned off for the whole gesture.
- **Undo history** stores whole-scene snapshots. A drag records one step when it first moves, and quick repeated edits to the same field (typing, colour picking) merge into one step.
- **No WebGL?** The 3D view shows a notice and sends you to the 2D plan, which still has every feature.
