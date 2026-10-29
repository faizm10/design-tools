import { useMemo } from "react";
import { computeWarnings, type Warning } from "@/lib/geometry";
import { usePlanner } from "@/lib/store";

export function useWarnings() {
  const scene = usePlanner((s) => s.scene);
  return useMemo(() => {
    const list = computeWarnings(scene.room, scene.furniture, scene.openings);
    const byItem = new Map<string, Warning[]>();
    for (const w of list) byItem.set(w.itemId, [...(byItem.get(w.itemId) ?? []), w]);
    return { list, byItem };
  }, [scene]);
}
