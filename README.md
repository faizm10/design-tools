# design-tools

A neutral Next.js design playground for trying frontend components, animation
libraries, CLI-installed UI kits, and one-off interaction experiments.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Add an Experiment

Create a component in `components/experiments/`, then register it in
`components/experiments/registry.ts`.

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
