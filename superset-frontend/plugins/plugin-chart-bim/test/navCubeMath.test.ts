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
  cameraToCubeRotation,
  AREAS,
  FACE_AREAS,
  CORNER_AREAS,
  Vec3,
} from '../src/navCubeMath';

const ORIGIN: Vec3 = [0, 0, 0];

test('camera on +Z (front view) yields no rotation', () => {
  const { rx, ry } = cameraToCubeRotation([0, 0, 10], ORIGIN);
  expect(rx).toBeCloseTo(0);
  expect(ry).toBeCloseTo(0);
});

test('camera distance does not affect rotation, only direction', () => {
  const near = cameraToCubeRotation([0, 0, 1], ORIGIN);
  const far = cameraToCubeRotation([0, 0, 1000], ORIGIN);
  expect(near).toEqual(far);
});

test('camera above the model tips the cube to show its top', () => {
  const { rx, ry } = cameraToCubeRotation([0, 10, 0], ORIGIN);
  expect(rx).toBeCloseTo(90);
  expect(ry).toBeCloseTo(0);
});

test('camera below the model tips the cube the other way', () => {
  const { rx } = cameraToCubeRotation([0, -10, 0], ORIGIN);
  expect(rx).toBeCloseTo(-90);
});

test('camera on +X (right view) yields a quarter turn', () => {
  const { rx, ry } = cameraToCubeRotation([10, 0, 0], ORIGIN);
  expect(rx).toBeCloseTo(0);
  expect(ry).toBeCloseTo(-90);
});

test('camera on -X (left view) turns the opposite way', () => {
  const { ry } = cameraToCubeRotation([-10, 0, 0], ORIGIN);
  expect(ry).toBeCloseTo(90);
});

test('camera behind the model yields a half turn', () => {
  const { ry } = cameraToCubeRotation([0, 0, -10], ORIGIN);
  expect(Math.abs(ry)).toBeCloseTo(180);
});

test('rotation is relative to look, not to the world origin', () => {
  // Camera offset from a model that does not sit at the origin: same relative
  // direction as the front view, so the same rotation.
  const look: Vec3 = [100, 50, 20];
  expect(cameraToCubeRotation([100, 50, 30], look)).toEqual(
    cameraToCubeRotation([0, 0, 10], ORIGIN),
  );
});

test('degenerate camera (eye equals look) falls back to a neutral view', () => {
  expect(cameraToCubeRotation(ORIGIN, ORIGIN)).toEqual({ rx: 0, ry: 0 });
});

test('non-finite camera input does not produce NaN rotations', () => {
  const { rx, ry } = cameraToCubeRotation([NaN, 0, 0], ORIGIN);
  expect(Number.isFinite(rx)).toBe(true);
  expect(Number.isFinite(ry)).toBe(true);
});

test('there are 14 clickable areas: 6 faces and 8 corners', () => {
  expect(Object.keys(FACE_AREAS)).toHaveLength(6);
  expect(CORNER_AREAS).toHaveLength(8);
  expect(Object.keys(AREAS)).toHaveLength(14);
});

test('every area has a normalized non-zero direction', () => {
  Object.values(AREAS).forEach(area => {
    const len = Math.hypot(...area.dir);
    expect(len).toBeCloseTo(1);
  });
});

test('every area has a unit up vector perpendicular to its direction', () => {
  Object.values(AREAS).forEach(area => {
    expect(Math.hypot(...area.up)).toBeCloseTo(1);
    const [dx, dy, dz] = area.dir;
    const [ux, uy, uz] = area.up;
    const dot = dx * ux + dy * uy + dz * uz;
    // A camera whose up vector is parallel to its view direction has an
    // undefined orientation; corners use +Y up, which is never parallel to a
    // diagonal, and the top/bottom faces use -Z/+Z for exactly this reason.
    expect(Math.abs(dot)).toBeLessThan(0.99);
  });
});

test('area ids are unique and corners name their vertical half', () => {
  const ids = Object.values(AREAS).map(a => a.id);
  expect(new Set(ids).size).toBe(ids.length);
  CORNER_AREAS.forEach(c => {
    expect(c.id).toMatch(/^(top|bottom)-(front|back)-(left|right)$/);
  });
});

test('opposite faces point in opposite directions', () => {
  // Compared componentwise: negating a 0 component yields -0, which toEqual
  // treats as distinct from 0.
  const opposite = (a: Vec3, b: Vec3) =>
    a.forEach((v, i) => expect(v).toBeCloseTo(-b[i]));
  opposite(FACE_AREAS.front.dir, FACE_AREAS.back.dir);
  opposite(FACE_AREAS.left.dir, FACE_AREAS.right.dir);
  opposite(FACE_AREAS.top.dir, FACE_AREAS.bottom.dir);
});

test('flying to a face puts the camera where the cube expects it', () => {
  // Round-trip: the rotation derived from a face's own dir must match the
  // rotation for a camera sitting along that dir. This is the invariant that
  // keeps clicking "top" from leaving the cube showing something else.
  Object.values(FACE_AREAS).forEach(area => {
    const eye = area.dir.map(v => v * 10) as Vec3;
    const fromDir = cameraToCubeRotation(area.dir, ORIGIN);
    const fromEye = cameraToCubeRotation(eye, ORIGIN);
    expect(fromEye.rx).toBeCloseTo(fromDir.rx);
    expect(fromEye.ry).toBeCloseTo(fromDir.ry);
  });
});
