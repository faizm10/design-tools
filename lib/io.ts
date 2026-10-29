import { validateScene } from "./store";
import type { Scene } from "./types";

function slug(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "bedroom";
}

function download(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function exportSceneJson(scene: Scene) {
  const blob = new Blob([JSON.stringify(scene, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  download(url, `${slug(scene.room.name)}.json`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readSceneFile(file: File): Promise<Scene> {
  const text = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn’t valid JSON.");
  }
  // Accept either a bare scene or an autosave envelope { scene, prefs }.
  const candidate = data && typeof data === "object" && "scene" in data ? (data as { scene: unknown }).scene : data;
  const scene = validateScene(candidate);
  if (!scene) throw new Error("That file doesn’t look like a room plan.");
  return scene;
}

export function downloadPng(dataUrl: string, name: string, view: string) {
  download(dataUrl, `${slug(name)}-${view}.png`);
}
