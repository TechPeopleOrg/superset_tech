/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { RefObject, useEffect, useRef, useState } from 'react';
import buildTree, { MetaObjectLike } from './buildTree';
import { hexToRgb01 } from './colorMapping';
import { TreeNode, XeokitApi } from './types';

export type NavMode = 'orbit' | 'firstPerson' | 'planView';

export interface UseXeokitViewerOptions {
  modelUrl: string;
  showEdges?: boolean;
  // xeokit CameraControl navigation mode. 'orbit' rotates around a pivot (good
  // for inspecting a model from outside); 'firstPerson' rotates around the
  // camera itself (walk-through / look-around from inside a room); 'planView'
  // is a top-down style. Defaults to 'orbit'.
  navMode?: NavMode;
  // Chart theme, used to colour the NavCube so it reads on both light and dark
  // dashboard backgrounds. Defaults to light when unset.
  theme?: 'light' | 'dark';
}

export interface UseXeokitViewerState {
  loading: boolean;
  error?: string;
  tree?: TreeNode[];
  api?: XeokitApi;
  // True only once the 'loaded' event has fired and scene/metaScene are
  // populated. `api` is exposed earlier (right after loader.load()) so
  // callers can register handlers, but its methods walk an empty scene until
  // this flips true. Consumers that read scene contents through `api` (e.g.
  // data-driven coloring) must wait for `ready` rather than react to `api`
  // alone, since `api` is the same stable reference before and after load.
  ready?: boolean;
}

// All xeokit access is isolated here. The engine is dynamically imported so its
// weight stays out of the main bundle, and every call is wrapped so an engine
// failure sets `error` instead of throwing through the React tree.
export default function useXeokitViewer(
  containerRef: RefObject<HTMLElement>,
  options: UseXeokitViewerOptions,
): UseXeokitViewerState {
  const { modelUrl, showEdges, navMode = 'orbit' } = options;
  const [state, setState] = useState<UseXeokitViewerState>({ loading: false });
  // Holds the live viewer's cameraControl so navMode can be switched on the
  // running viewer (see the navMode effect below) without tearing down and
  // reloading the whole model. Populated when the viewer is created and cleared
  // on teardown.
  const cameraControlRef = useRef<{
    navMode?: string;
    followPointer?: boolean;
  } | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || !modelUrl) {
      setState({ loading: false });
      return undefined;
    }

    let cancelled = false;
    // Using `import()` return type inference avoids a hard dependency on the
    // xeokit type declarations while still keeping the code free of `any`.
    type XeokitModule = typeof import('@xeokit/xeokit-sdk');
    let viewer: InstanceType<XeokitModule['Viewer']> | undefined;
    let model: { destroy: () => void } | undefined;

    // xeokit's wheel listener is passive (can't preventDefault); cancel page scroll ourselves.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
    };
    node.addEventListener('wheel', onWheel, { passive: false });

    setState({ loading: true, error: undefined });

    (async () => {
      try {
        node.innerHTML = '';
        // The container must establish a positioning context so the NavCube's
        // absolutely-positioned canvas anchors to the viewer's top-right corner
        // rather than the page.
        if (getComputedStyle(node).position === 'static') {
          node.style.position = 'relative';
        }
        const canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        node.appendChild(canvas);

        // Separate small canvas for the NavCube (orientation cube). It sits in
        // the top-right corner over the main canvas; pointer events on it drive
        // the NavCubePlugin without interfering with model interaction.
        const navCubeCanvas = document.createElement('canvas');
        navCubeCanvas.width = 130;
        navCubeCanvas.height = 130;
        navCubeCanvas.style.position = 'absolute';
        navCubeCanvas.style.top = '10px';
        navCubeCanvas.style.right = '10px';
        navCubeCanvas.style.width = '130px';
        navCubeCanvas.style.height = '130px';
        navCubeCanvas.style.zIndex = '2';
        node.appendChild(navCubeCanvas);

        const { Viewer, XKTLoaderPlugin, NavCubePlugin } =
          await import('@xeokit/xeokit-sdk');
        if (cancelled) return;

        viewer = new Viewer({ canvasElement: canvas, transparent: false });

        // Orientation cube: click a face/edge/corner to fly the camera to that
        // view (front/back/top/side/isometric). Colours follow the chart theme.
        // Destroyed automatically when the viewer is destroyed in cleanup.
        const dark = options.theme === 'dark';
        // eslint-disable-next-line no-new
        new NavCubePlugin(viewer, {
          canvasElement: navCubeCanvas,
          visible: true,
          cameraFly: true,
          cameraFlyDuration: 0.5,
          cameraFitFOV: 45,
          color: dark ? '#3a3f47' : '#e6e4de',
          hoverColor: dark ? '#e89442' : '#d97e26',
          textColor: dark ? '#eceae4' : '#1c1f24',
          shadowVisible: false,
        });

        // The default highlight material is a faint 20%-alpha grey fill, nearly
        // invisible over data-coloured elements. Make cross-filter highlighting
        // clearly visible: a strong fill with bright edges and glowThrough so
        // highlighted elements read even when occluded by walls. The colour is
        // set from the control via api.setHighlightColor (default applied here).
        const highlightMaterial = viewer.scene.highlightMaterial as unknown as {
          fill: boolean;
          fillColor: number[];
          fillAlpha: number;
          edges: boolean;
          edgeColor: number[];
          edgeAlpha: number;
          glowThrough: boolean;
        };
        highlightMaterial.fill = true;
        highlightMaterial.fillAlpha = 0.7;
        highlightMaterial.edges = true;
        highlightMaterial.edgeAlpha = 1.0;
        highlightMaterial.glowThrough = true;
        const applyHighlightColor = (hex: string) => {
          const [r, g, b] = hexToRgb01(hex);
          highlightMaterial.fillColor = [r, g, b];
          highlightMaterial.edgeColor = [r * 0.6, g * 0.6, b * 0.6];
        };
        applyHighlightColor('#00d9ff');

        // Navigation mode. In 'orbit'/'planView' the camera rotates around a
        // pivot and following the pointer keeps a model placed away from the
        // world origin centered. In 'firstPerson' the camera rotates around
        // itself (look-around from inside a room), so followPointer is off.
        const cc = viewer.cameraControl as unknown as {
          navMode?: string;
          followPointer?: boolean;
        };
        cc.navMode = navMode;
        cc.followPointer = navMode !== 'firstPerson';
        // Expose the live cameraControl so the navMode effect can switch modes
        // on the running viewer without a full rebuild.
        cameraControlRef.current = cc;

        const scene = viewer.scene as unknown as {
          objects: Record<
            string,
            {
              visible: boolean;
              colorize: number[];
              highlighted: boolean;
              opacity: number;
            }
          >;
          // input is nulled out by xeokit when the viewer is destroyed, so a
          // late unsubscribe must treat it as possibly-null.
          input: {
            on: (event: string, cb: (coords: unknown) => void) => number;
            off: (id: number) => void;
          } | null;
          pick: (params: { canvasPos: unknown }) => {
            entity?: { id?: string };
          } | null;
        };
        const metaScene2 = viewer.metaScene as unknown as {
          getObjectIDsInSubtree: (id: string) => string[];
        };
        // Expand a metaObject id to its geometry leaves. Shared by
        // api.expandToLeaves and api.highlight (kept as a standalone function,
        // not a call through `api`, to avoid a use-before-assign reference to
        // the `api` const from within its own object literal).
        const expandToLeaves = (id: string): string[] =>
          metaScene2
            .getObjectIDsInSubtree(id)
            .filter(oid => !!scene.objects[oid]);
        // Tracks the geometry leaf ids currently highlighted so api.highlight
        // can clear exactly those before applying a new selection.
        const highlightedIds = new Set<string>();
        // api is declared before the 'loaded' handler so the handler closes
        // over it. This makes the final setState in 'loaded' atomic regardless
        // of whether the event fires synchronously (inside loader.load) or
        // asynchronously after the await.
        const api: XeokitApi = {
          setVisible: (ids, visible) => {
            ids.forEach(id => {
              const obj = scene.objects[id];
              if (obj) obj.visible = visible;
            });
          },
          isolate: ids => {
            const show = new Set(ids);
            Object.keys(scene.objects).forEach(id => {
              scene.objects[id].visible = show.has(id);
            });
          },
          showAll: () => {
            Object.keys(scene.objects).forEach(id => {
              scene.objects[id].visible = true;
            });
          },
          getVisibility: () => {
            const out: Record<string, boolean> = {};
            Object.keys(scene.objects).forEach(id => {
              out[id] = scene.objects[id].visible;
            });
            return out;
          },
          colorize: (ids, rgb) => {
            ids.forEach(id => {
              const obj = scene.objects[id];
              if (obj) obj.colorize = rgb;
            });
          },
          setOpacity: (ids, opacity) => {
            ids.forEach(id => {
              const obj = scene.objects[id];
              if (obj) obj.opacity = opacity;
            });
          },
          resetColors: ids => {
            const target = ids ?? Object.keys(scene.objects);
            target.forEach(id => {
              const obj = scene.objects[id];
              if (obj) {
                obj.colorize = [1, 1, 1];
                obj.opacity = 1;
              }
            });
          },
          expandToLeaves,
          allObjectIds: () => Object.keys(scene.objects),
          onPick: cb => {
            // Subscription happens while the scene is alive (BimChart gates on
            // `ready`); if input is somehow gone, hand back a no-op unsubscribe.
            if (!scene.input) return () => {};
            const subId = scene.input.on('mouseclicked', coords => {
              const hit = scene.pick({ canvasPos: coords });
              // A picked SceneModelEntity's `id` is the bare GlobalId — the same
              // key scene.objects/coloring use (globalizeObjectIds=false).
              const gid = hit?.entity?.id;
              cb(gid ?? null);
            });
            // scene.input is nulled out when the viewer is destroyed (model
            // switch / unmount). A consumer's unsubscribe can fire after that
            // teardown, so guard against the dead scene: the subscription is
            // already gone with the scene, nothing to detach.
            return () => scene.input?.off(subId);
          },
          highlight: objectIds => {
            // Clear previous highlight.
            highlightedIds.forEach(id => {
              const obj = scene.objects[id];
              if (obj) obj.highlighted = false;
            });
            highlightedIds.clear();
            // Apply new highlight on the geometry leaves of each id.
            objectIds.forEach(gid => {
              expandToLeaves(gid).forEach(leaf => {
                const obj = scene.objects[leaf];
                if (obj) {
                  obj.highlighted = true;
                  highlightedIds.add(leaf);
                }
              });
            });
          },
          setHighlightColor: applyHighlightColor,
          fit: () => {
            // Frame the whole model: same fit used on load. Reads the current
            // scene AABB so it also works after visibility changes.
            if (!viewer) return;
            try {
              viewer.cameraFlight.flyTo({ aabb: viewer.scene.aabb });
            } catch {
              // camera/scene not ready; ignore.
            }
          },
        };

        const loader = new XKTLoaderPlugin(viewer);
        model = loader.load({
          id: 'bim-model',
          src: modelUrl,
          edges: showEdges,
        });

        // Once geometry is in, position the camera relative to the model's real
        // world bounds (IFC/xkt models rarely sit at the origin).
        const loadedModel = model as unknown as {
          on?: (event: string, cb: () => void) => void;
        };
        loadedModel.on?.('loaded', () => {
          if (cancelled || !viewer) return;
          try {
            const { aabb } = viewer.scene;
            if (navMode === 'firstPerson') {
              // Stand inside the model: place the eye at the center, looking
              // toward one side, so rotation is a look-around in place.
              const cx = (aabb[0] + aabb[3]) / 2;
              const cy = (aabb[1] + aabb[4]) / 2;
              const cz = (aabb[2] + aabb[5]) / 2;
              const camera = viewer.camera as unknown as {
                eye: number[];
                look: number[];
                up: number[];
              };
              camera.eye = [cx, cy, cz];
              camera.look = [aabb[3], cy, cz];
              camera.up = [0, 1, 0];
            } else {
              // Frame the whole model from outside: let xeokit pick the fitting
              // distance and its default viewing angle for the bounds.
              viewer.cameraFlight.flyTo({ aabb });
            }
          } catch {
            // camera not ready; ignore.
          }
          const metaScene = viewer.metaScene as unknown as {
            metaObjects: Record<string, MetaObjectLike>;
          };
          // No optional chain: metaScene is cast above and always defined here.
          const mObjects = metaScene.metaObjects ?? {};
          // Only elements with an entity in the scene carry geometry; restrict
          // the tree to those (plus their container ancestors) so it does not
          // list property sets / metadata-only nodes the user cannot toggle.
          const geometryIds = new Set(Object.keys(scene.objects));
          const roots = buildTree(mObjects, geometryIds);
          // A single functional update sets loading, api, and tree atomically.
          // This is safe whether 'loaded' fires synchronously (inside
          // loader.load below) or asynchronously: api is captured by closure
          // and the spread merges whatever state existed before.
          setState(prev => ({
            ...prev,
            loading: false,
            api,
            tree: roots.length ? roots : undefined,
            ready: true,
          }));
        });

        if (cancelled) return;
        // Expose api immediately after loader.load() returns so callers can
        // call visibility methods before the 'loaded' event fires. `ready` is
        // intentionally left unset here: the scene is still empty at this
        // point, and only the 'loaded' handler above (setting ready: true)
        // marks it safe to read scene contents through `api`. The 'loaded'
        // handler re-applies api (from closure) alongside tree, ready, and
        // loading:false in a single update, keeping state consistent whether
        // 'loaded' fires synchronously or asynchronously.
        setState(prev => ({ ...prev, api }));
      } catch (err) {
        if (cancelled) return;
        setState({
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return () => {
      cancelled = true;
      try {
        model?.destroy();
      } catch {
        // model may not have been created; ignore.
      }
      try {
        viewer?.destroy();
      } catch {
        // viewer may not have been created; ignore.
      }
      cameraControlRef.current = null;
      node.removeEventListener('wheel', onWheel);
      if (node) node.innerHTML = '';
    };
    // navMode is intentionally excluded: it is applied to the live viewer by a
    // separate effect below, so switching modes does not rebuild the viewer and
    // reload the (heavy) model. containerRef is also excluded: ref objects
    // change identity on every render but their `.current` is stable; including
    // the ref would cause infinite re-renders when using createRef() in tests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl, showEdges]);

  // Apply the navigation mode to the running viewer whenever it changes,
  // without recreating the viewer. cameraControlRef is populated once the
  // viewer exists; before that this is a no-op and the initial mode is set
  // inline during viewer creation above.
  useEffect(() => {
    const cc = cameraControlRef.current;
    if (!cc) return;
    cc.navMode = navMode;
    cc.followPointer = navMode !== 'firstPerson';
  }, [navMode]);

  return state;
}
