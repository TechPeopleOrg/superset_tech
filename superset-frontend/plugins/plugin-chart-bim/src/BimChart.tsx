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
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@apache-superset/core/translation';
import { styled, useTheme, isThemeDark } from '@apache-superset/core/theme';
import { Alert } from '@apache-superset/core/components';
import { Button, Loading } from '@superset-ui/core/components';
import useXeokitViewer, { type NavMode } from './useXeokitViewer';
import ModelTree from './ModelTree';
import ViewerControls from './ViewerControls';
import NavCube, { type NavCubeHandle } from './NavCube';
import { AREAS, cameraToCubeRotation } from './navCubeMath';
import buildColorMapping, { hexToRgb01, idsOutsideRange } from './colorMapping';
import ColorLegend from './ColorLegend';
import { BimChartProps } from './types';
import {
  buildCrossFilterDataMask,
  selectedGlobalIdsFromFilterState,
  globalIdsFromAppliedFilters,
} from './crossFilter';

const Container = styled.div`
  position: relative;
  overflow: hidden;

  .sk-fading-circle .sk-circle:before {
    background-color: ${({ theme }) => theme.colorPrimary};
  }
`;

const Center = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.sizeUnit * 4}px;
  text-align: center;
  color: ${({ theme }) => theme.colorTextTertiary};
`;

const Diagnostic = styled.div`
  position: absolute;
  left: ${({ theme }) => theme.sizeUnit * 2}px;
  bottom: ${({ theme }) => theme.sizeUnit * 2}px;
  z-index: 10;
  padding: ${({ theme }) => theme.sizeUnit}px
    ${({ theme }) => theme.sizeUnit * 2}px;
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme }) => theme.colorTextTertiary};
  background: ${({ theme }) => theme.colorBgContainer};
  border-radius: ${({ theme }) => theme.borderRadius}px;
`;

// Small non-intrusive badge shown while the chart re-fetches data (e.g. a
// cross-filter from another chart). The heavy 3D model is intentionally kept
// mounted rather than reloaded, so without this hint the viewer would look
// frozen. Sits below the orientation cube, which owns the top-right corner.
const RefreshBadge = styled.div`
  position: absolute;
  top: ${({ theme }) => theme.sizeUnit * 16}px;
  right: ${({ theme }) => theme.sizeUnit * 2}px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.sizeUnit}px;
  padding: ${({ theme }) => theme.sizeUnit}px
    ${({ theme }) => theme.sizeUnit * 2}px;
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme }) => theme.colorTextSecondary};
  background: ${({ theme }) => theme.colorBgElevated};
  border: 1px solid ${({ theme }) => theme.colorBorderSecondary};
  border-radius: ${({ theme }) => theme.borderRadius}px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  pointer-events: none;
`;

export default function BimChart(props: BimChartProps) {
  const {
    width,
    height,
    modelUrl,
    showEdges,
    navMode: navModeProp,
    rows,
    linkColumn,
    colorBy,
    colorFn,
    overrides,
    colorMode,
    gradientScaleId,
    gradientMin,
    gradientMax,
    colorScheme,
    emitCrossFilters,
    setDataMask,
    filterState,
    appliedFilters,
    contextMode,
    contextOpacity,
    noDataColor,
    highlightColor,
    showTree,
    showLegend,
    showMatched,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  // Bump to force the hook effect to re-run on retry without changing modelUrl.
  const [retryKey, setRetryKey] = useState(0);
  // Navigation mode is switchable at runtime from the viewer controls. The
  // chart's configured navMode is only the initial value; the hook applies
  // changes to the live viewer without reloading the model.
  const [navMode, setNavMode] = useState<NavMode>(navModeProp ?? 'orbit');
  // Whether the model tree panel is open. Toggled from the viewer toolbar; the
  // tree starts closed. Only meaningful when the chart enables the tree
  // (showTree) and a model is loaded.
  const [treeOpen, setTreeOpen] = useState(false);

  const { loading, error, tree, api, ready } = useXeokitViewer(containerRef, {
    modelUrl: modelUrl ? `${modelUrl}#${retryKey}` : '',
    showEdges,
    navMode,
    theme: isThemeDark(theme) ? 'dark' : 'light',
  });

  // Content-based key for the color mapping. transformProps runs on every
  // chart re-render (resize, refresh, filter changes), not only when the
  // underlying data changes, and it hands back a new `colorFn` reference and
  // a new `overrides` array/reference each time even when their content is
  // identical. Keying the memo below off serialized content (rather than off
  // those references directly) means the mapping — and the paint effect that
  // depends on it — only recomputes when rows/linkColumn/colorBy/overrides
  // actually change, not on every re-render. `colorScheme` is included so a
  // dashboard-level palette change invalidates the key too: colorFn resolves
  // against the scheme but is intentionally excluded from the memo's deps
  // (see below), so without the scheme string here a scheme change would
  // leave stale colors on the model.
  const mappingKey = JSON.stringify({
    rows,
    linkColumn,
    colorBy,
    overrides,
    colorScheme,
    colorMode,
    gradientScaleId,
    gradientMin,
    gradientMax,
  });

  // Value -> color mapping derived from the query rows; empty when the chart
  // isn't configured for data-binding yet (no link/color-by column chosen).
  const { colorById, legend, gradientLegend, idsByValue, numericById } =
    useMemo(() => {
      if (!linkColumn || !colorBy) {
        return {
          colorById: new Map<string, [number, number, number]>(),
          legend: [] as { value: string; color: string }[],
          idsByValue: new Map<string, string[]>(),
          numericById: new Map<string, number>(),
          gradientLegend: undefined,
        };
      }
      return buildColorMapping({
        rows,
        linkColumn,
        colorBy,
        colorFn,
        overrides,
        mode: colorMode,
        gradientScaleId,
        gradientMin,
        gradientMax,
      });
      // mappingKey already encodes rows/linkColumn/colorBy/overrides/colorScheme
      // by content, so it is the only dependency that should trigger a
      // recompute. colorFn is deterministic for a given value and scheme
      // (backed by the shared categorical palette) and is intentionally
      // excluded: transformProps hands back a new colorFn/overrides reference
      // on every re-render, and depending on those references directly would
      // rebuild the mapping (and re-run the paint effect below) on every render
      // instead of only when the data or scheme changes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mappingKey]);

  const [matched, setMatched] = useState<{ m: number; n: number } | null>(null);
  // Categories switched off from the legend. Visual only: no cross-filter, and
  // visibility is left alone so the tree stays the sole owner of what is shown.
  const [dimmedValues, setDimmedValues] = useState<Set<string>>(new Set());
  const [gradientRange, setGradientRange] = useState<[number, number] | null>(
    null,
  );
  const dimmedKey = Array.from(dimmedValues).sort().join('\u0000');

  // Paint the scene whenever the mapping or the live api changes: reset to a
  // neutral base (so unmatched elements read as "no data"), then paint every
  // matched GlobalId's geometry leaves with its mapped color.
  useEffect(() => {
    if (!api || !ready || !colorById.size) {
      setMatched(null);
      return;
    }
    api.resetColors();
    api.showAll();
    // Neutral "no data" look for elements with no matching row. hexToRgb01
    // guards against non-hex input (a bad value can't paint the model green).
    const neutral = hexToRgb01(noDataColor);
    const allIds = api.allObjectIds();
    if (contextMode === 'hidden') {
      // Show only the matched elements; hide the rest as context.
      api.setVisible(allIds, false);
    } else {
      api.colorize(allIds, neutral);
      // faded => reduced opacity; opaque => fully solid grey.
      api.setOpacity(allIds, contextMode === 'faded' ? contextOpacity : 1);
    }
    const present = new Set(allIds);
    // Diagnostic counts data keys, not geometry leaves: a single container
    // GlobalId (e.g. a storey) can expand into many leaves, and counting
    // leaves for `m` while `n` counts data keys produces a nonsensical
    // "Matched 50 of 1". Counting a data key as matched once it has at least
    // one present leaf keeps m <= n and reports something a user can reason
    // about ("this many of my rows landed on the model").
    let matchedKeys = 0;
    colorById.forEach((rgb, gid) => {
      const leaves = api.expandToLeaves(gid).filter(id => present.has(id));
      if (leaves.length) {
        // In hidden mode matched elements were hidden with the rest; show them.
        if (contextMode === 'hidden') api.setVisible(leaves, true);
        api.colorize(leaves, rgb);
        // Matched elements are fully opaque so they stand out from the context.
        api.setOpacity(leaves, 1);
        matchedKeys += 1;
      }
    });
    setMatched({ m: matchedKeys, n: colorById.size });

    dimmedValues.forEach(value => {
      const ids = idsByValue.get(value) ?? [];
      const leaves = ids.flatMap(gid =>
        api.expandToLeaves(gid).filter(id => present.has(id)),
      );
      if (leaves.length) api.setOpacity(leaves, contextOpacity);
    });

    const outside = idsOutsideRange(numericById, gradientRange).flatMap(gid =>
      api.expandToLeaves(gid).filter(id => present.has(id)),
    );
    if (outside.length) api.setOpacity(outside, contextOpacity);
    // dimmedKey encodes dimmedValues by content; idsByValue moves with colorById.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    api,
    colorById,
    ready,
    contextMode,
    contextOpacity,
    noDataColor,
    dimmedKey,
    gradientRange,
  ]);

  // Apply the highlight colour from the control whenever it changes, without
  // recreating the (heavy) viewer.
  useEffect(() => {
    if (!api) return;
    api.setHighlightColor(highlightColor);
  }, [api, highlightColor]);

  // Orientation cube. The camera fires on every frame of a drag, so the cube's
  // rotation is pushed straight into the DOM through this handle instead of
  // through state — re-rendering the chart that often would stutter the viewer.
  const navCubeRef = useRef<NavCubeHandle>(null);

  // Keep the cube in sync with the camera. Gated on `ready`: `api` is a stable
  // reference handed out before the scene is populated, so subscribing earlier
  // would read an empty scene.
  useEffect(() => {
    if (!api || !ready) return undefined;
    return api.onCameraChange((eye, look, up) => {
      navCubeRef.current?.setRotation(cameraToCubeRotation(eye, look, up));
    });
  }, [api, ready]);

  // Current single selection, kept outside React state so the outgoing pick
  // handler (closed over once per api/ready/linkColumn combination) can read
  // the latest value for the toggle-off comparison without re-subscribing.
  const selectedRef = useRef<string | null>(null);

  // Outgoing: clicking an element emits a cross-filter (or, when
  // cross-filtering is disabled, highlights locally instead). Single-select:
  // clicking the currently-selected element or empty space clears it.
  useEffect(() => {
    if (!api || !ready || !linkColumn) return undefined;
    const unsubscribe = api.onPick(gid => {
      const next = gid && gid !== selectedRef.current ? gid : null;
      selectedRef.current = next;
      if (emitCrossFilters) {
        setDataMask(buildCrossFilterDataMask(linkColumn, next));
      } else {
        // No round-trip through filterState in this mode: highlight locally.
        api.highlight(next ? [next] : []);
      }
    });
    return unsubscribe;
  }, [api, ready, linkColumn, emitCrossFilters, setDataMask]);

  // Incoming: when cross-filtering is on, highlight follows two sources, both
  // resolved to GlobalIds:
  //  - this chart's own click, round-tripped by Superset into filterState;
  //  - cross-filters from other charts (e.g. a pie's status dimension), which
  //    arrive via appliedFilters (extra_form_data) on a foreign column and are
  //    mapped to GlobalIds through the chart's own rows.
  // When cross-filtering is off, this effect is inert; the outgoing handler
  // above covers local highlight.
  const hasAppliedFilters = (appliedFilters ?? []).length > 0;
  const ownSelection = selectedGlobalIdsFromFilterState(filterState);
  const incomingIds = emitCrossFilters
    ? Array.from(
        new Set([
          ...ownSelection,
          ...globalIdsFromAppliedFilters(
            appliedFilters ?? [],
            rows,
            linkColumn,
          ),
        ]),
      )
    : null;
  // During a re-fetch rows momentarily empties, which would resolve applied
  // filters to zero GlobalIds and briefly clear the highlight (a flicker).
  // When there ARE applied filters but rows is empty, skip the update and keep
  // the previous highlight until the data returns. A genuine empty selection
  // (no filters and no own selection) still clears.
  const staleDuringRefetch =
    hasAppliedFilters && rows.length === 0 && ownSelection.length === 0;
  const incomingKey = JSON.stringify(incomingIds);
  useEffect(() => {
    // This effect syncs the scene highlight to an external system (the
    // dashboard's filterState), not to a local component event, so the
    // guard clause below is not the "effect as event handler" anti-pattern
    // the no-event-handler rule targets — its heuristic cannot distinguish
    // the two, so it is disabled for this line specifically.
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler
    if (!api || !ready || incomingIds === null || staleDuringRefetch) return;
    api.highlight(incomingIds);
    // Keep the ref in sync so a toggle-off click compares against what's shown.
    selectedRef.current = incomingIds[0] ?? null;
    // incomingKey encodes incomingIds by content; api/ready gate scene access.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, ready, incomingKey, staleDuringRefetch]);

  // The model is kept mounted across re-fetches (a deliberate optimization for
  // the heavy 3D viewer — see the SuppressRefetchSpinner behavior). During a
  // re-fetch queriesData momentarily empties while the model stays on screen;
  // detect that to show a small "updating" hint so the viewer doesn't look
  // frozen. Only when the chart is data-bound (linkColumn set) and already
  // rendered (api ready, not in initial load/error).
  const refreshing =
    !!api && !!ready && !loading && !error && !!linkColumn && rows.length === 0;

  return (
    <Container style={{ width, height, background: '#ffffff' }}>
      <div
        ref={containerRef}
        style={{ width, height }}
        data-test="bim-container"
      />
      {modelUrl && !loading && !error && api && (
        <ViewerControls
          navMode={navMode}
          onNavModeChange={setNavMode}
          onFit={() => api.fit()}
          treeOpen={showTree ? treeOpen : undefined}
          onToggleTree={showTree ? () => setTreeOpen(o => !o) : undefined}
        />
      )}
      {modelUrl && !loading && !error && api && (
        <NavCube
          ref={navCubeRef}
          onSelectArea={areaId => {
            const area = AREAS[areaId];
            if (area) api.flyToDir(area.dir, area.up);
          }}
        />
      )}
      {refreshing && (
        <RefreshBadge data-test="bim-refreshing">
          <Loading position="inline-centered" size="s" />
          {t('Updating…')}
        </RefreshBadge>
      )}
      {showTree && modelUrl && !loading && !error && api && (
        <ModelTree
          tree={tree}
          api={api}
          open={treeOpen}
          onClose={() => setTreeOpen(false)}
        />
      )}
      {showLegend && modelUrl && !loading && !error && api && (
        <ColorLegend
          legend={legend}
          gradient={gradientLegend}
          range={gradientRange ?? undefined}
          onRangeChange={setGradientRange}
          dimmed={dimmedValues}
          onToggle={value =>
            setDimmedValues(prev => {
              const next = new Set(prev);
              if (!next.delete(value)) next.add(value);
              return next;
            })
          }
        />
      )}
      {showMatched && matched && (
        <Diagnostic data-test="bim-diagnostic" data-testid="bim-diagnostic">
          {t('Matched %s of %s', matched.m, matched.n)}
        </Diagnostic>
      )}
      {!modelUrl && (
        <Center>{t('Select a model column with a model UUID.')}</Center>
      )}
      {modelUrl && loading && (
        <Center>
          <Loading />
        </Center>
      )}
      {modelUrl && error && (
        <Center>
          <Alert
            type="error"
            showIcon
            closable={false}
            description={error}
            action={
              <Button
                buttonSize="small"
                onClick={() => setRetryKey(k => k + 1)}
              >
                {t('Retry')}
              </Button>
            }
          >
            {t('File storage is currently unavailable.')}
          </Alert>
        </Center>
      )}
    </Container>
  );
}
