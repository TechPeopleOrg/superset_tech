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
import { SyntheticEvent } from 'react';
import domToImage from 'dom-to-image-more';
import { kebabCase } from 'lodash';
import { t } from '@apache-superset/core/translation';
import { logging } from '@apache-superset/core/utils';
import { SupersetTheme } from '@apache-superset/core/theme';
import { addWarningToast } from 'src/components/MessageToasts/actions';
import type { AgGridContainerElement } from '@superset-ui/core/components';

const IMAGE_DOWNLOAD_QUALITY = 0.95;
const TRANSPARENT_RGBA = 'transparent';
const POLL_INTERVAL_MS = 100;

// Tracks original cell styles to restore after capture
type CellFixup = { el: HTMLElement; minHeight: string; overflow: string };

/**
 * generate a consistent file stem from a description and date
 *
 * @param description title or description of content of file
 * @param date date when file was generated
 */
const generateFileStem = (description: string, date = new Date()) =>
  `${kebabCase(description)}-${date.toISOString().replace(/[: ]/g, '-')}`;

const CRITICAL_STYLE_PROPERTIES = new Set([
  'display',
  'position',
  'width',
  'height',
  'max-width',
  'max-height',
  'margin',
  'padding',
  'top',
  'right',
  'bottom',
  'left',
  'font',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-align',
  'text-decoration',
  'color',
  'background-color',
  'border',
  'border-width',
  'border-style',
  'border-color',
  'opacity',
  'visibility',
  'overflow',
  'z-index',
  'transform',
  'flex',
  'flex-direction',
  'justify-content',
  'align-items',
  'grid',
  'grid-template',
  'grid-area',
  'table-layout',
  'vertical-align',
  'text-align',
  'box-sizing',
  'min-height',
  'min-width',
]);

const styleCache = new WeakMap<Element, CSSStyleDeclaration>();

const copyAllComputedStyles = (
  original: Element,
  clone: Element,
  theme?: SupersetTheme,
) => {
  const queue: Array<[Element, Element]> = [[original, clone]];
  const processed = new WeakSet<Element>();

  while (queue.length) {
    const [origNode, cloneNode] = queue.shift()!;
    if (processed.has(origNode)) continue;
    processed.add(origNode);

    let computed = styleCache.get(origNode);
    if (!computed) {
      computed = window.getComputedStyle(origNode);
      styleCache.set(origNode, computed);
    }

    // eslint-disable-next-line unicorn/prefer-spread
    for (const property of CRITICAL_STYLE_PROPERTIES) {
      const value = computed.getPropertyValue(property);
      if (value && value !== 'initial' && value !== 'inherit') {
        (cloneNode as HTMLElement).style.setProperty(
          property,
          value,
          computed.getPropertyPriority(property),
        );
      }
    }

    if (origNode.textContent?.trim()) {
      const { color } = computed;
      if (!color || color === 'transparent' || color === TRANSPARENT_RGBA) {
        (cloneNode as HTMLElement).style.color =
          theme?.colorTextBase || 'black';
      }
      (cloneNode as HTMLElement).style.visibility = 'visible';
      if (computed.display === 'none') {
        (cloneNode as HTMLElement).style.display = 'block';
      }
    }

    for (let i = 0; i < origNode.children.length; i += 1) {
      queue.push([origNode.children[i], cloneNode.children[i]]);
    }
  }
};

const processCloneForVisibility = (clone: HTMLElement) => {
  const cloneStyle = clone.style;
  cloneStyle.height = 'auto';
  cloneStyle.maxHeight = 'none';

  const scrollableSelectors = [
    '[style*="overflow"]',
    '.scrollable',
    '.table-responsive',
    '.ant-table-body',
    '.table-container',
    '.ant-table-container',
    '.table-wrapper',
    '.ant-table-tbody',
    'tbody',
    '.table-body',
    '.virtual-table',
    '.react-window',
    '.react-virtualized',
  ];

  scrollableSelectors.forEach(selector => {
    clone.querySelectorAll(selector).forEach(el => {
      const element = el as HTMLElement;
      element.style.overflow = 'visible';
      element.style.height = 'auto';
      element.style.maxHeight = 'none';
    });
  });

  clone
    .querySelectorAll('table, .ant-table, .table-container, .data-table')
    .forEach(table => {
      const el = table as HTMLElement;
      el.style.margin = '0 auto';
      el.style.display = 'table';
      el.style.width = '100%';
      el.style.tableLayout = 'auto';
    });

  clone
    .querySelectorAll('tr, .ant-table-row, .table-row, .data-row')
    .forEach(row => {
      const el = row as HTMLElement;
      el.style.display = 'table-row';
      el.style.visibility = 'visible';
      el.style.height = 'auto';
    });

  clone
    .querySelectorAll('td, th, .ant-table-cell, .table-cell')
    .forEach(cell => {
      const el = cell as HTMLElement;
      el.style.display = 'table-cell';
      el.style.visibility = 'visible';
    });

  clone.querySelectorAll('*').forEach(el => {
    const element = el as HTMLElement;
    if (element.textContent?.trim()) {
      const computed = window.getComputedStyle(element);
      if (computed.color === 'transparent') {
        element.style.color = 'black';
      }
      element.style.visibility = 'visible';
      if (computed.display === 'none') {
        element.style.display = 'block';
      }
    }
  });

  clone
    .querySelectorAll('[data-virtualized], .virtualized, .lazy-load')
    .forEach(el => {
      const element = el as HTMLElement;
      element.style.height = 'auto';
      element.style.maxHeight = 'none';
    });
};

const preserveCanvasContent = (original: Element, clone: Element) => {
  const originalCanvases = original.querySelectorAll('canvas');
  const clonedCanvases = clone.querySelectorAll('canvas');

  originalCanvases.forEach((originalCanvas, i) => {
    if (originalCanvases[i] && clonedCanvases[i]) {
      // A zero-sized canvas (an offscreen or not-yet-laid-out one, as the 3D
      // viewer keeps alongside its visible canvas) makes drawImage throw and
      // would abort the whole capture.
      if (!originalCanvas.width || !originalCanvas.height) {
        return;
      }
      const clonedCanvas = clonedCanvases[i] as HTMLCanvasElement;
      // A canvas's drawing buffer and its on-screen box are separate sizes
      // (a WebGL viewer commonly renders at a lower buffer resolution). Copying
      // the bitmap sets the buffer, so pin the box too, or the bitmap is
      // stretched to whatever width the clone's layout gives it.
      const rect = originalCanvas.getBoundingClientRect();
      if (rect.width && rect.height) {
        clonedCanvas.style.width = `${rect.width}px`;
        clonedCanvas.style.height = `${rect.height}px`;
      }
      const ctx = clonedCanvas.getContext('2d');
      if (ctx) {
        clonedCanvas.width = originalCanvas.width;
        clonedCanvas.height = originalCanvas.height;
        try {
          ctx.drawImage(originalCanvas, 0, 0);
        } catch (error) {
          // One unreadable canvas (tainted by cross-origin content, or a
          // context lost mid-capture) must not cost the entire snapshot.
          logging.warn('Could not copy a canvas into the capture', error);
        }
      }
    }
  });
};

const createEnhancedClone = (
  originalElement: Element,
  theme?: SupersetTheme,
): { clone: HTMLElement; cleanup: () => void } => {
  const clone = originalElement.cloneNode(true) as HTMLElement;
  copyAllComputedStyles(originalElement, clone, theme);
  preserveCanvasContent(originalElement, clone);

  // The off-screen container is absolutely positioned, so it imposes no width
  // of its own: without one the clone shrink-wraps (a dashboard collapses from
  // its on-screen width to a few dozen pixels), the layout reflows into a
  // different shape, and the copied canvas bitmaps land in boxes that no longer
  // match them. Pinning the original's width keeps the capture true to what the
  // user sees. Height is left free so processCloneForVisibility can still
  // expand scrollable content.
  const { width } = originalElement.getBoundingClientRect();

  const tempContainer = document.createElement('div');
  tempContainer.style.cssText = `
    position: absolute;
    left: -20000px;
    top: -20000px;
    visibility: hidden;
    pointer-events: none;
    z-index: -1000;
  `;
  if (width) {
    tempContainer.style.width = `${width}px`;
    clone.style.width = `${width}px`;
  }
  tempContainer.appendChild(clone);
  document.body.appendChild(tempContainer);

  processCloneForVisibility(clone);

  const cleanup = () => {
    styleCache.delete?.(originalElement);
    if (tempContainer.parentElement) {
      tempContainer.parentElement.removeChild(tempContainer);
    }
  };

  return { clone, cleanup };
};

// Polls until scrollHeight is stable for minStablePolls consecutive intervals or maxMs elapses.
// ag-grid has no "layout settled" event, so polling is the recommended workaround.
export const waitForStableScrollHeight = (
  el: HTMLElement,
  maxMs = 5000,
  minStablePolls = 2,
): Promise<void> =>
  new Promise<void>(resolve => {
    const deadline = Date.now() + maxMs;
    let lastHeight = el.scrollHeight;
    let stableCount = 0;

    const poll = () => {
      if (Date.now() >= deadline) {
        resolve();
        return;
      }
      try {
        const h = el.scrollHeight;
        if (h === lastHeight) {
          stableCount += 1;
          if (stableCount >= minStablePolls) {
            resolve();
            return;
          }
        } else {
          stableCount = 0;
          lastHeight = h;
        }
      } catch {
        resolve(); // element removed from DOM
        return;
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    };

    setTimeout(poll, POLL_INTERVAL_MS);
  });

// Raised when an ag-grid chart has not rendered its first data yet, so a
// capture would produce an empty image. Callers turn this into a "still
// loading" message rather than a generic failure.
export class ChartNotReadyError extends Error {}

export type CaptureFormat = 'jpeg' | 'png';

// File extension matching a capture format, for naming the produced file.
export const captureFileExtension = (format: CaptureFormat) =>
  format === 'png' ? 'png' : 'jpg';

/**
 * Capture a DOM element as an image data URL.
 *
 * Split out of the download flow so the same capture can be sent somewhere
 * other than the user's disk (e.g. saved to file storage as a report). The
 * download path below is a thin wrapper over this.
 *
 * @throws ChartNotReadyError when an ag-grid chart has no data rendered yet.
 */
export async function captureElementAsDataUrl(
  elementToPrint: Element,
  format: CaptureFormat = 'jpeg',
  theme?: SupersetTheme,
  { visibleOnly = false }: { visibleOnly?: boolean } = {},
): Promise<string> {
  const encode = format === 'png' ? domToImage.toPng : domToImage.toJpeg;

  const filter = (node: Element) =>
    typeof node.className === 'string'
      ? !node.className.includes('mapboxgl-control-container') &&
        !node.className.includes('header-controls') &&
        // Inactive tabs are laid out but not visible; rendering them stacks
        // every tab's content into the image.
        !node.className.includes('ant-tabs-tabpane-hidden')
      : true;

  // Only apply ag-grid path for single-chart captures.
  // Skip entirely for dashboard-level exports (selector targets the .dashboard root).
  const isDashboardCapture = (elementToPrint as HTMLElement).classList.contains(
    'dashboard',
  );
  const agContainers = isDashboardCapture
    ? []
    : elementToPrint.querySelectorAll('[data-themed-ag-grid]');
  const agContainer =
    agContainers.length === 1
      ? (agContainers[0] as AgGridContainerElement)
      : null;
  const agRootWrapper = agContainer
    ? (agContainer.querySelector('.ag-root-wrapper') as HTMLElement | null)
    : null;

  if (agContainer && agRootWrapper) {
    const api = agContainer._agGridApi;
    const isFirstDataRendered = agContainer._agGridFirstDataRendered === true;

    if (!isFirstDataRendered) {
      throw new ChartNotReadyError('ag-grid has not rendered its first data');
    }

    // Capture resolved pixel widths before print layout can re-trigger sizeColumnsToFit.
    // sizeColumnsToFit() sets flex (not pixel widths), so after print layout expands the
    // container it recalculates column widths wider. We restore with flex: null to force
    // pixel widths when calling applyColumnState after the layout switch.
    const savedColumnState = api?.getColumnState?.();
    const visibleColumnState = savedColumnState?.filter(col => !col.hide) ?? [];
    const originalWidth =
      visibleColumnState.reduce((sum, col) => sum + (col.width ?? 0), 0) ||
      agRootWrapper.offsetWidth;

    // Chrome SVG foreignObject bug: % min-height resolves against canvas height,
    // causing cells to expand to full image height and overlap adjacent rows.
    const cellFixups: CellFixup[] = [];

    try {
      await document.fonts.ready;

      if (api) {
        api.setGridOption('domLayout', 'print');

        // Wait for ResizeObserver + any triggered sizeColumnsToFit() to settle,
        // then restore column widths before measurement.
        await new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );

        if (visibleColumnState.length > 0) {
          api.applyColumnState?.({
            state: visibleColumnState.map(col => ({
              colId: col.colId,
              width: col.width,
              flex: null,
            })),
            applyOrder: false,
          });
        }

        // Rows never scrolled into view have stale cached heights; remeasure all.
        api.resetRowHeights?.();

        // 5 polls × POLL_INTERVAL_MS = 500 ms; autoHeight rows batch-measure slowly.
        await waitForStableScrollHeight(agRootWrapper, 5000, 5);
      }

      agRootWrapper.querySelectorAll('.ag-cell').forEach(cell => {
        const el = cell as HTMLElement;
        const rowHeight = (el.parentElement as HTMLElement)?.offsetHeight ?? 0;
        // scrollHeight catches any cells where resetRowHeights lagged behind.
        const minH = Math.max(rowHeight, el.scrollHeight);
        cellFixups.push({
          el,
          minHeight: el.style.minHeight,
          overflow: el.style.overflow,
        });
        el.style.minHeight = minH > 0 ? `${minH}px` : '0px';
        el.style.overflow = 'hidden';
      });

      const imageHeight = agRootWrapper.scrollHeight;

      return await encode(agRootWrapper, {
        bgcolor: theme?.colorBgContainer,
        filter,
        quality: IMAGE_DOWNLOAD_QUALITY,
        height: imageHeight,
        width: originalWidth,
        cacheBust: true,
      });
    } finally {
      cellFixups.forEach(({ el, minHeight, overflow }) => {
        el.style.minHeight = minHeight;
        el.style.overflow = overflow;
      });
      if (api) {
        api.setGridOption('domLayout', 'normal');
        if (savedColumnState) {
          api.applyColumnState?.({
            state: savedColumnState,
            applyOrder: false,
          });
        }
      }
    }
  }

  // "Visible area only": render the live element as it stands. Nothing is
  // rebuilt, so the frame is exactly what is on screen — at the cost of
  // whatever is scrolled out of view. The clone path below is the opposite
  // trade: it re-lays-out the content to reach hidden rows.
  if (visibleOnly) {
    await document.fonts.ready;
    const el = elementToPrint as HTMLElement;
    return encode(elementToPrint, {
      bgcolor: theme?.colorBgContainer,
      filter,
      quality: IMAGE_DOWNLOAD_QUALITY,
      cacheBust: true,
      height: el.clientHeight || undefined,
      width: el.clientWidth || undefined,
    });
  }

  // All other chart types: use the clone-based approach
  let cleanup: (() => void) | null = null;

  try {
    const { clone, cleanup: cleanupFn } = createEnhancedClone(
      elementToPrint,
      theme,
    );
    cleanup = cleanupFn;

    return await encode(clone, {
      bgcolor: theme?.colorBgContainer,
      filter,
      quality: IMAGE_DOWNLOAD_QUALITY,
      height: clone.scrollHeight,
      width: clone.scrollWidth,
      cacheBust: true,
    });
  } finally {
    if (cleanup) cleanup();
  }
}

export default function downloadAsImageOptimized(
  selector: string,
  description: string,
  isExactSelector = false,
  theme?: SupersetTheme,
  // Whole page by default; visible-only skips the clone path and captures the
  // frame as it stands on screen.
  visibleOnly = false,
) {
  return async (event: SyntheticEvent) => {
    const elementToPrint = isExactSelector
      ? document.querySelector(selector)
      : event.currentTarget.closest(selector);

    if (!elementToPrint) {
      addWarningToast(
        t('Image download failed, please refresh and try again.'),
      );
      return;
    }

    try {
      const dataUrl = await captureElementAsDataUrl(
        elementToPrint,
        'jpeg',
        theme,
        { visibleOnly },
      );
      const link = document.createElement('a');
      link.download = `${generateFileStem(description)}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      if (error instanceof ChartNotReadyError) {
        addWarningToast(
          t('The chart is still loading. Please wait a moment and try again.'),
        );
        return;
      }
      console.error('Creating image failed', error);
      addWarningToast(
        t('Image download failed, please refresh and try again.'),
      );
    }
  };
}
