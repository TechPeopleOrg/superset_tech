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
import { JsonObject } from '@superset-ui/core';
import { DashboardLayout } from '../types';

export type DashboardDevice = 'desktop' | 'tablet' | 'mobile';
export type DeviceLayoutKey = 'tablet' | 'mobile';

export const MOBILE_MAX_SCREEN_WIDTH = 768;
export const TABLET_MAX_SCREEN_WIDTH = 1024;

export const DEVICE_EDIT_CANVAS_WIDTH: Record<DeviceLayoutKey, number> = {
  tablet: 768,
  mobile: 375,
};

export function resolveDeviceByWidth(width: number): DashboardDevice {
  if (width < MOBILE_MAX_SCREEN_WIDTH) return 'mobile';
  if (width < TABLET_MAX_SCREEN_WIDTH) return 'tablet';
  return 'desktop';
}

export function isDeviceLayoutsEnabled(metadata?: JsonObject | null): boolean {
  return Boolean(metadata?.device_layouts_enabled);
}

/**
 * Superset pages ship without a viewport meta tag, so on mobile browsers
 * window.innerWidth reports the ~980px virtual layout viewport instead of the
 * real screen width. For device detection we therefore use the physical
 * screen size on mobile/tablet devices — the smaller side, so the detected
 * class stays stable across rotation — and fall back to the live window width
 * on desktop browsers, where innerWidth is accurate and lets a narrowed
 * window preview the other versions.
 */
export function getDeviceScreenWidth(): number {
  if (typeof window === 'undefined') return TABLET_MAX_SCREEN_WIDTH;
  const ua = window.navigator?.userAgent ?? '';
  const isMobileDevice =
    /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ||
    // iPadOS Safari masquerades as desktop Mac but is a touch device
    (/Macintosh/.test(ua) && (window.navigator?.maxTouchPoints ?? 0) > 1);
  if (isMobileDevice && window.screen) {
    return Math.min(window.screen.width, window.screen.height);
  }
  return window.innerWidth;
}

export function getDeviceLayoutTrees(
  metadata?: JsonObject | null,
): Partial<Record<DeviceLayoutKey, DashboardLayout>> {
  const stored = (metadata?.device_layouts ?? {}) as JsonObject;
  const trees: Partial<Record<DeviceLayoutKey, DashboardLayout>> = {};
  (['tablet', 'mobile'] as DeviceLayoutKey[]).forEach(device => {
    const tree = stored[device];
    if (tree && typeof tree === 'object' && !Array.isArray(tree)) {
      trees[device] = tree as DashboardLayout;
    }
  });
  return trees;
}

export function resolveActiveLayoutDevice(
  metadata: JsonObject | null | undefined,
  width: number,
): DashboardDevice {
  if (!isDeviceLayoutsEnabled(metadata)) return 'desktop';
  const trees = getDeviceLayoutTrees(metadata);
  const device = resolveDeviceByWidth(width);
  if (device === 'mobile') {
    if (trees.mobile) return 'mobile';
    if (trees.tablet) return 'tablet';
    return 'desktop';
  }
  if (device === 'tablet') {
    return trees.tablet ? 'tablet' : 'desktop';
  }
  return 'desktop';
}

export interface DeviceLayoutsPayloadPieces {
  present: DashboardLayout;
  pastLength: number;
  activeDevice: DashboardDevice;
  inactiveDeviceLayouts: Partial<Record<DashboardDevice, DashboardLayout>>;
  customizedDeviceLayouts: DashboardDevice[];
}

export function buildDeviceLayoutsPayload(pieces: DeviceLayoutsPayloadPieces): {
  positions: DashboardLayout;
  deviceLayouts?: Partial<Record<DeviceLayoutKey, DashboardLayout>>;
} {
  const {
    present,
    pastLength,
    activeDevice,
    inactiveDeviceLayouts,
    customizedDeviceLayouts,
  } = pieces;
  const treeOf = (device: DashboardDevice): DashboardLayout | undefined =>
    device === activeDevice ? present : inactiveDeviceLayouts[device];
  const customized = new Set<DashboardDevice>(customizedDeviceLayouts);
  if (activeDevice !== 'desktop' && pastLength > 0) {
    customized.add(activeDevice);
  }
  const deviceLayouts: Partial<Record<DeviceLayoutKey, DashboardLayout>> = {};
  (['tablet', 'mobile'] as DeviceLayoutKey[]).forEach(device => {
    const layoutTree = treeOf(device);
    if (customized.has(device) && layoutTree) {
      deviceLayouts[device] = layoutTree;
    }
  });
  return {
    positions: treeOf('desktop') ?? present,
    deviceLayouts: Object.keys(deviceLayouts).length
      ? deviceLayouts
      : undefined,
  };
}
