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

export interface UseXeokitViewerOptions {
  modelUrl: string;
  backgroundColor?: string;
  showEdges?: boolean;
}

export interface UseXeokitViewerState {
  loading: boolean;
  error?: string;
}

// All xeokit access is isolated here. The engine is dynamically imported so its
// weight stays out of the main bundle, and every call is wrapped so an engine
// failure sets `error` instead of throwing through the React tree.
export default function useXeokitViewer(
  containerRef: RefObject<HTMLElement>,
  options: UseXeokitViewerOptions,
): UseXeokitViewerState {
  const { modelUrl, showEdges } = options;
  const [state, setState] = useState<UseXeokitViewerState>({ loading: false });

  useEffect(() => {
    const node = containerRef.current;
    if (!node || !modelUrl) {
      setState({ loading: false });
      return undefined;
    }

    let cancelled = false;
    // Kept mutable so cleanup can tear down whatever was created, even if the
    // effect is cancelled mid-load.
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

        // NOTE: backgroundColor is reserved and will be applied in the data-binding stage.
        viewer = new Viewer({ canvasElement: canvas, transparent: false });
        const loader = new XKTLoaderPlugin(viewer);
        model = loader.load({ id: 'bim-model', src: modelUrl, edges: showEdges });

        if (cancelled) return;
        setState({ loading: false });
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
  }, [modelUrl, showEdges]);

  return state;
}
