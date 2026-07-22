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
import { RefObject, useEffect, useState } from 'react';
import buildTree, { MetaObjectLike } from './buildTree';
import { TreeNode, XeokitApi } from './types';

export type NavMode = 'orbit' | 'firstPerson' | 'planView';

export interface UseXeokitViewerOptions {
  modelUrl: string;
  backgroundColor?: string;
  showEdges?: boolean;
  // xeokit CameraControl navigation mode. 'orbit' rotates around a pivot (good
  // for inspecting a model from outside); 'firstPerson' rotates around the
  // camera itself (walk-through / look-around from inside a room); 'planView'
  // is a top-down style. Defaults to 'orbit'.
  navMode?: NavMode;
}

export interface UseXeokitViewerState {
  loading: boolean;
  error?: string;
  tree?: TreeNode[];
  api?: XeokitApi;
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

    setState({ loading: true, error: undefined });

    (async () => {
      try {
        node.innerHTML = '';
        const canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        node.appendChild(canvas);

        const { Viewer, XKTLoaderPlugin } = await import('@xeokit/xeokit-sdk');
        if (cancelled) return;

        // NOTE: backgroundColor is reserved and will be applied in the
        // data-binding stage.
        viewer = new Viewer({ canvasElement: canvas, transparent: false });

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

        const scene = viewer.scene as unknown as {
          objects: Record<string, { visible: boolean; colorize: number[] }>;
        };
        const metaScene2 = viewer.metaScene as unknown as {
          getObjectIDsInSubtree: (id: string) => string[];
        };
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
          resetColors: ids => {
            const target = ids ?? Object.keys(scene.objects);
            target.forEach(id => {
              const obj = scene.objects[id];
              if (obj) obj.colorize = [1, 1, 1];
            });
          },
          expandToLeaves: id =>
            metaScene2
              .getObjectIDsInSubtree(id)
              .filter(oid => !!scene.objects[oid]),
          allObjectIds: () => Object.keys(scene.objects),
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
            const aabb = viewer.scene.aabb;
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
              // Frame the whole model from outside.
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
          }));
        });

        if (cancelled) return;
        // Expose api immediately after loader.load() returns so callers can
        // call visibility methods before the 'loaded' event fires. The
        // 'loaded' handler re-applies api (from closure) alongside tree and
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
      if (node) node.innerHTML = '';
    };
    // containerRef is intentionally excluded from the dep array: ref objects
    // change identity on every render but their `.current` is stable; including
    // the ref would cause infinite re-renders when using createRef() in tests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl, showEdges, navMode]);

  return state;
}
