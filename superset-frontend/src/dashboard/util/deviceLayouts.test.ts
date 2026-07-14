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
import {
  resolveDeviceByWidth,
  isDeviceLayoutsEnabled,
  getDeviceLayoutTrees,
  resolveActiveLayoutDevice,
  buildDeviceLayoutsPayload,
} from './deviceLayouts';
import { DashboardLayout } from '../types';

const tree = (marker: string) =>
  ({
    [marker]: { id: marker, type: 'ROW', children: [] },
  }) as unknown as DashboardLayout;

test('resolveDeviceByWidth maps widths to devices', () => {
  expect(resolveDeviceByWidth(375)).toBe('mobile');
  expect(resolveDeviceByWidth(767)).toBe('mobile');
  expect(resolveDeviceByWidth(768)).toBe('tablet');
  expect(resolveDeviceByWidth(1023)).toBe('tablet');
  expect(resolveDeviceByWidth(1024)).toBe('desktop');
  expect(resolveDeviceByWidth(1920)).toBe('desktop');
});

test('isDeviceLayoutsEnabled reads the metadata flag', () => {
  expect(isDeviceLayoutsEnabled({ device_layouts_enabled: true })).toBe(true);
  expect(isDeviceLayoutsEnabled({ device_layouts_enabled: false })).toBe(false);
  expect(isDeviceLayoutsEnabled({})).toBe(false);
  expect(isDeviceLayoutsEnabled(null)).toBe(false);
});

test('getDeviceLayoutTrees returns only valid trees', () => {
  expect(getDeviceLayoutTrees(null)).toEqual({});
  expect(
    getDeviceLayoutTrees({ device_layouts: { mobile: tree('m') } }),
  ).toEqual({
    mobile: tree('m'),
  });
  expect(
    getDeviceLayoutTrees({
      device_layouts: { mobile: 'garbage', tablet: null },
    }),
  ).toEqual({});
});

test('resolveActiveLayoutDevice cascades mobile→tablet→desktop', () => {
  const md = {
    device_layouts_enabled: true,
    device_layouts: { tablet: tree('t') },
  };
  expect(resolveActiveLayoutDevice(md, 375)).toBe('tablet'); // no mobile tree → tablet
  expect(resolveActiveLayoutDevice(md, 800)).toBe('tablet');
  expect(resolveActiveLayoutDevice(md, 1400)).toBe('desktop');
  const mdFull = {
    device_layouts_enabled: true,
    device_layouts: { tablet: tree('t'), mobile: tree('m') },
  };
  expect(resolveActiveLayoutDevice(mdFull, 375)).toBe('mobile');
  expect(resolveActiveLayoutDevice({ device_layouts_enabled: true }, 375)).toBe(
    'desktop',
  );
  // feature disabled → always desktop even if trees exist
  expect(
    resolveActiveLayoutDevice({ device_layouts: { mobile: tree('m') } }, 375),
  ).toBe('desktop');
});

test('buildDeviceLayoutsPayload always returns desktop positions', () => {
  const desktop = tree('d');
  const mobile = tree('m');
  // active device is mobile with edits → mobile persisted, desktop from parked
  const withEdits = buildDeviceLayoutsPayload({
    present: mobile,
    pastLength: 2,
    activeDevice: 'mobile',
    inactiveDeviceLayouts: { desktop },
    customizedDeviceLayouts: [],
  });
  expect(withEdits.positions).toBe(desktop);
  expect(withEdits.deviceLayouts).toEqual({ mobile });
  // untouched copy is NOT persisted
  const untouched = buildDeviceLayoutsPayload({
    present: mobile,
    pastLength: 0,
    activeDevice: 'mobile',
    inactiveDeviceLayouts: { desktop },
    customizedDeviceLayouts: [],
  });
  expect(untouched.positions).toBe(desktop);
  expect(untouched.deviceLayouts).toBeUndefined();
  // previously customized parked tree stays persisted
  const parked = buildDeviceLayoutsPayload({
    present: desktop,
    pastLength: 5,
    activeDevice: 'desktop',
    inactiveDeviceLayouts: { tablet: tree('t') },
    customizedDeviceLayouts: ['tablet'],
  });
  expect(parked.positions).toBe(desktop);
  expect(parked.deviceLayouts).toEqual({ tablet: tree('t') });
});
