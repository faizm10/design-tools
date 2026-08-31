# Design tools

A small Next.js playground for experimenting with different design directions.
Use it to try visual ideas, motion, components, and one-off interactions before
they become part of a larger product.

The home page is intentionally minimal: a white canvas with the current
animation experiment.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Try a new design

Start a component in `components/experiments/`, or use
`components/playground/scratchpad.tsx` for a quick prototype. When an idea is
ready to keep, register it in `components/experiments/registry.ts`.

```tsx
import { MagneticButton } from "@/components/experiments/magnetic-button";

export const experiments = [
  {
    name: "Magnetic Button",
    description: "Pointer-following button test.",
    component: MagneticButton,
  },
];
```

Temporary work can start in `components/playground/scratchpad.tsx` while running
the dev server.
