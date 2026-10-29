import type { Vec2 } from "./geometry";

/**
 * Imperative hooks registered by whichever view (2D plan or 3D scene) is
 * mounted, so toolbar buttons and catalogue drops don't need to know which
 * view is active.
 */
export const viewBridge: {
  screenToFloor: ((clientX: number, clientY: number) => Vec2 | null) | null;
  screenshot: (() => Promise<string>) | null;
  resetCamera: (() => void) | null;
  zoom: ((factor: number) => void) | null;
} = {
  screenToFloor: null,
  screenshot: null,
  resetCamera: null,
  zoom: null,
};
