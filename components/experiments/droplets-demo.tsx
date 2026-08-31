"use client";

import { Droplets } from "@/components/canvasui/Droplets";

export function DropletsDemoExperiment() {
  return (
    <Droplets
      blur={0.2}
      className="h-[calc(100vh-88px)] min-h-[420px] overflow-hidden border border-black bg-black"
      dropLength={1.25}
      dropWidth={1.2}
      fallSpeed={1.25}
      intensity={0.9}
      refraction={0.34}
      scale={0.7}
      staticDrops={0.55}
      tint={[1, 1, 1]}
      tintStrength={0.9}
      vignette={0.35}
    >
      <div className="relative min-h-full bg-black">
        <div className="absolute left-[8%] top-[10%] h-32 w-32 border border-white/20 bg-white" />
        <div className="absolute right-[12%] top-[18%] h-48 w-28 border border-white/20 bg-gray-700" />
        <div className="absolute bottom-[12%] left-[24%] h-20 w-56 border border-white/20 bg-gray-300" />
        <div className="absolute bottom-[18%] right-[18%] h-36 w-36 border border-white/20 bg-gray-900" />
        <div className="absolute inset-x-0 top-1/2 border-t border-white/10" />
        <div className="absolute inset-y-0 left-1/2 border-l border-white/10" />
      </div>
    </Droplets>
  );
}
