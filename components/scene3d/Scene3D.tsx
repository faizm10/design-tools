"use client";

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { usePlanner } from "@/lib/store";
import { viewBridge } from "@/lib/bridge";
import { clampOpeningOffset, footprint, nearestWall, round1, snapPosition, surfaceElevations, wallLength, type Vec2 } from "@/lib/geometry";
import { formatDims } from "@/lib/units";
import type { FurnitureItem, Opening, Room } from "@/lib/types";
import { FurnitureModel } from "./models";
import { Floor, Walls, useHiddenWalls } from "./Room3D";
import { useWarnings } from "../planner/useWarnings";

const ACCENT = "#2f6fed";
const WARN = "#dc4a3d";

const toWorld = (room: Room, p: Vec2) => new THREE.Vector3((p.x - room.width / 2) / 100, 0, (p.z - room.length / 2) / 100);
const toPlan = (room: Room, v: THREE.Vector3): Vec2 => ({ x: v.x * 100 + room.width / 2, z: v.z * 100 + room.length / 2 });

function defaultCamera(room: Room) {
  const W = room.width / 100;
  const L = room.length / 100;
  const r = Math.max(W, L);
  return { position: new THREE.Vector3(W * 0.6 + r * 0.45, r * 1.3 + 1.4, L * 0.7 + r * 0.9), target: new THREE.Vector3(0, 0.4, 0) };
}

let webglSupport: boolean | undefined;
function hasWebGL() {
  if (webglSupport === undefined) {
    try {
      const c = document.createElement("canvas");
      webglSupport = !!(c.getContext("webgl2") ?? c.getContext("webgl"));
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}

export default function Scene3D() {
  const room = usePlanner((s) => s.scene.room);
  const cam = useMemo(() => defaultCamera(room), [room]);
  const down = useRef<{ x: number; y: number } | null>(null);

  if (!hasWebGL()) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#efece7] p-6">
        <div className="max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl ring-1 ring-stone-200">
          <h3 className="text-[14px] font-semibold text-stone-900">3D isn’t available in this browser</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-stone-500">WebGL couldn’t start, so the 3D view can’t render. Your plan is safe and fully editable in 2D.</p>
          <button type="button" onClick={() => usePlanner.getState().setPref("view", "2d")} className="mt-4 rounded-lg bg-stone-900 px-3.5 py-2 text-[12.5px] font-medium text-white hover:bg-stone-700">
            Open the 2D plan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0"
      onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        camera={{ position: cam.position.toArray(), fov: 42, near: 0.05, far: 200 }}
        onPointerMissed={(e) => {
          const d = down.current;
          if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) usePlanner.getState().select(null);
        }}
      >
        <color attach="background" args={["#efece7"]} />
        <fog attach="fog" args={["#efece7", 18, 45]} />
        <SceneContents />
      </Canvas>
    </div>
  );
}

function Lights({ room }: { room: Room }) {
  const r = Math.max(room.width, room.length) / 100;
  const light = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    const c = l.shadow.camera;
    c.left = c.bottom = -r;
    c.right = c.top = r;
    c.updateProjectionMatrix();
  }, [r]);
  return (
    <>
      <hemisphereLight args={["#ffffff", "#d8cfc2", 1.1]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        ref={light}
        position={[r * 0.6, r * 1.6, r * 0.9]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-r, r, -r * 0.5]} intensity={0.35} />
    </>
  );
}

function SceneContents() {
  const scene = usePlanner((s) => s.scene);
  const selection = usePlanner((s) => s.selection);
  const wallMode = usePlanner((s) => s.wallVisibility);
  const unit = usePlanner((s) => s.unit);
  const showDims = usePlanner((s) => s.showDimensions);
  const { byItem } = useWarnings();
  const { room, furniture, openings } = scene;
  const hidden = useHiddenWalls(room, wallMode);
  const elevations = useMemo(() => surfaceElevations(furniture), [furniture]);

  const { camera, gl, scene: threeScene } = useThree();
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const getThree = useThree((s) => s.get);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  const rayToPlane = useCallback(
    (clientX: number, clientY: number, height: number) => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), hit) ? hit : null;
    },
    [camera, gl, raycaster],
  );

  // Register view hooks for the toolbar and catalogue drops.
  useEffect(() => {
    viewBridge.screenToFloor = (x, y) => {
      const hit = rayToPlane(x, y, 0);
      return hit ? toPlan(usePlanner.getState().scene.room, hit) : null;
    };
    viewBridge.screenshot = async () => {
      gl.render(threeScene, camera);
      return gl.domElement.toDataURL("image/png");
    };
    viewBridge.resetCamera = () => {
      const c = defaultCamera(usePlanner.getState().scene.room);
      camera.position.copy(c.position);
      controls?.target.copy(c.target);
      controls?.update();
    };
    viewBridge.zoom = (factor) => {
      if (!controls) return;
      const offset = camera.position.clone().sub(controls.target);
      const len = THREE.MathUtils.clamp(offset.length() / factor, controls.minDistance || 0.5, controls.maxDistance || 60);
      camera.position.copy(controls.target).add(offset.setLength(len));
      controls.update();
    };
    return () => {
      viewBridge.screenToFloor = null;
      viewBridge.screenshot = null;
      viewBridge.resetCamera = null;
      viewBridge.zoom = null;
    };
  }, [rayToPlane, gl, threeScene, camera, controls]);

  /**
   * Shared drag loop: raycast against a horizontal plane at the grab height
   * so the point under the cursor stays under the cursor, with orbit
   * controls disabled for the duration.
   */
  const startDrag = useCallback(
    (e: ThreeEvent<PointerEvent>, onMove: (p: Vec2, ev: PointerEvent) => void) => {
      const height = e.point.y;
      const st = usePlanner.getState();
      st.beginGesture();
      st.setDragging(true);
      // Freeze the camera for the whole gesture so dragging never orbits.
      const three = getThree();
      const orbit = three.controls as OrbitControlsImpl | null;
      const canvas = three.gl.domElement;
      if (orbit) orbit.enabled = false;
      canvas.style.cursor = "grabbing";
      const move = (ev: PointerEvent) => {
        const hit = rayToPlane(ev.clientX, ev.clientY, height);
        if (hit) onMove(toPlan(usePlanner.getState().scene.room, hit), ev);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        if (orbit) orbit.enabled = true;
        canvas.style.cursor = "";
        const s = usePlanner.getState();
        s.endGesture();
        s.setDragging(false);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [getThree, rayToPlane],
  );

  const onItemDown = useCallback(
    (e: ThreeEvent<PointerEvent>, id: string) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const st = usePlanner.getState();
      st.select({ kind: "furniture", id });
      const it = st.scene.furniture.find((f) => f.id === id);
      if (!it) return;
      const grab = toPlan(st.scene.room, e.point);
      const offset = { x: it.x - grab.x, z: it.z - grab.z };
      startDrag(e, (p, ev) => {
        const s = usePlanner.getState();
        s.gestureUpdate((sc) => {
          const cur = sc.furniture.find((f) => f.id === id);
          if (!cur) return sc;
          const target = { x: p.x + offset.x, z: p.z + offset.z };
          const snapped = ev.altKey
            ? { x: round1(target.x), z: round1(target.z) }
            : snapPosition(cur, target, sc.room, sc.furniture, { grid: s.gridSnap ? s.gridSize : null, walls: s.wallSnap });
          if (snapped.x === cur.x && snapped.z === cur.z) return sc;
          return { ...sc, furniture: sc.furniture.map((f) => (f.id === id ? { ...f, ...snapped } : f)) };
        });
      });
    },
    [startDrag],
  );

  const onOpeningDown = useCallback(
    (e: ThreeEvent<PointerEvent>, o: Opening) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      usePlanner.getState().select({ kind: "opening", id: o.id });
      startDrag(e, (p, ev) => {
        const s = usePlanner.getState();
        s.gestureUpdate((sc) => {
          const cur = sc.openings.find((x) => x.id === o.id);
          if (!cur) return sc;
          const { wall, offset } = nearestWall(sc.room, p);
          const width = Math.min(cur.width, wallLength(sc.room, wall));
          let off = offset;
          if (s.gridSnap && !ev.altKey) off = Math.round(off / s.gridSize) * s.gridSize;
          off = round1(clampOpeningOffset(sc.room, { wall, width }, off));
          if (wall === cur.wall && off === cur.offset) return sc;
          return { ...sc, openings: sc.openings.map((x) => (x.id === o.id ? { ...x, wall, width, offset: off } : x)) };
        });
      });
    },
    [startDrag],
  );

  const onFloorClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (e.delta < 5) usePlanner.getState().select(null);
  }, []);

  const selectedId = selection?.kind === "furniture" ? selection.id : undefined;
  const selected = furniture.find((f) => f.id === selectedId);
  const maxDim = Math.max(room.width, room.length) / 100;

  return (
    <>
      <Lights room={room} />
      <Floor room={room} onClick={onFloorClick} />
      <Walls room={room} openings={openings} hidden={hidden} selectedOpening={selection?.kind === "opening" ? selection.id : undefined} onOpeningDown={onOpeningDown} />
      {furniture.map((it) => (
        <Furniture key={it.id} it={it} room={room} elevation={elevations.get(it.id) ?? 0} onDown={onItemDown} />
      ))}
      {furniture.map((it) =>
        it.id === selectedId || byItem.has(it.id) ? (
          <Footprint key={`fp-${it.id}`} it={it} room={room} color={byItem.has(it.id) ? WARN : ACCENT} />
        ) : null,
      )}
      {selected && showDims && (
        <Html
          position={toWorld(room, selected).setY((selected.height + (elevations.get(selected.id) ?? 0)) / 100 + 0.12)}
          center
          zIndexRange={[20, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div className="whitespace-nowrap rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-stone-700 shadow-md ring-1 ring-black/5">
            {formatDims(selected.width, selected.depth, unit, selected.height)}
          </div>
        </Html>
      )}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.12}
        target={[0, 0.4, 0]}
        minDistance={0.8}
        maxDistance={maxDim * 6 + 8}
        maxPolarAngle={Math.PI / 2 - 0.04}
        screenSpacePanning
      />
    </>
  );
}

const Furniture = memo(function Furniture({
  it,
  room,
  elevation,
  onDown,
}: {
  it: FurnitureItem;
  room: Room;
  elevation: number;
  onDown: (e: ThreeEvent<PointerEvent>, id: string) => void;
}) {
  const pos = toWorld(room, it);
  return (
    <group
      position={[pos.x, elevation / 100, pos.z]}
      rotation={[0, (-it.rotation * Math.PI) / 180, 0]}
      onPointerDown={(e) => onDown(e, it.id)}
      onPointerOver={(e) => {
        e.stopPropagation();
        if (!usePlanner.getState().dragging) document.body.style.cursor = "grab";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      <FurnitureModel type={it.type} w={it.width / 100} d={it.depth / 100} h={it.height / 100} color={it.color} />
    </group>
  );
});

/** Outline on the floor showing selection or a warning, matching the 2D footprint. */
function Footprint({ it, room, color }: { it: FurnitureItem; room: Room; color: string }) {
  const geom = useMemo(() => {
    const pts = footprint(it).map((p) => toWorld(room, p).setY(0.012));
    const g = new THREE.BufferGeometry().setFromPoints([...pts, pts[0]]);
    return g;
  }, [it, room]);
  useEffect(() => () => geom.dispose(), [geom]);
  const fill = useMemo(() => {
    const pts = footprint(it).map((p) => toWorld(room, p));
    const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.z)));
    return new THREE.ShapeGeometry(shape);
  }, [it, room]);
  useEffect(() => () => fill.dispose(), [fill]);
  return (
    <group>
      <lineLoop geometry={geom}>
        <lineBasicMaterial color={color} linewidth={2} depthTest={false} transparent />
      </lineLoop>
      <mesh geometry={fill} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.011, 0]} renderOrder={1}>
        <meshBasicMaterial color={color} transparent opacity={0.16} depthWrite={false} />
      </mesh>
    </group>
  );
}
