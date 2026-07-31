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

export type Vec3 = [number, number, number];

// Rotation applied to the cube element, in degrees. Composed by the component as
// `rotateX(rx) rotateY(ry)` — see NavCube.
export interface CubeRotation {
  rx: number;
  ry: number;
}

// A clickable region of the cube. `dir` is the unit vector pointing from the
// model's center toward the camera for that view; `up` is the camera's up
// vector once there. Both are consumed by XeokitApi.flyToDir.
export interface CubeArea {
  id: string;
  // Human-readable name, used for the tooltip/aria-label.
  label: string;
  dir: Vec3;
  up: Vec3;
}

// Faces of the cube in the CSS 3D box. The scene is Y-up (xeokit's default for
// the models this plugin loads), so "top" looks down the +Y axis.
export type FaceId = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

const SQRT3 = Math.sqrt(3);
// Diagonal unit component: 1/sqrt(3) on each axis for a corner view.
const D = 1 / SQRT3;

// The six orthogonal views. `dir` points from the model center toward the eye.
export const FACE_AREAS: Record<FaceId, CubeArea> = {
  front: { id: 'front', label: 'Front', dir: [0, 0, 1], up: [0, 1, 0] },
  back: { id: 'back', label: 'Back', dir: [0, 0, -1], up: [0, 1, 0] },
  right: { id: 'right', label: 'Right', dir: [1, 0, 0], up: [0, 1, 0] },
  left: { id: 'left', label: 'Left', dir: [-1, 0, 0], up: [0, 1, 0] },
  // Looking straight down/up, the camera's up vector cannot be +Y (it would be
  // parallel to the view direction and the view would be undefined), so use -Z
  // for top and +Z for bottom — the same convention the built-in cube uses.
  top: { id: 'top', label: 'Top', dir: [0, 1, 0], up: [0, 0, -1] },
  bottom: { id: 'bottom', label: 'Bottom', dir: [0, -1, 0], up: [0, 0, 1] },
};

// The eight corner views (isometric). Each combines one horizontal quadrant
// with either the top or the bottom, e.g. "top-front-right".
function cornerArea(sx: number, sy: number, sz: number): CubeArea {
  const vert = sy > 0 ? 'top' : 'bottom';
  const depth = sz > 0 ? 'front' : 'back';
  const side = sx > 0 ? 'right' : 'left';
  const label = `${vert === 'top' ? 'Top' : 'Bottom'} ${depth} ${side}`;
  return {
    id: `${vert}-${depth}-${side}`,
    label,
    dir: [sx * D, sy * D, sz * D],
    up: [0, 1, 0],
  };
}

export const CORNER_AREAS: CubeArea[] = [
  cornerArea(1, 1, 1),
  cornerArea(-1, 1, 1),
  cornerArea(1, 1, -1),
  cornerArea(-1, 1, -1),
  cornerArea(1, -1, 1),
  cornerArea(-1, -1, 1),
  cornerArea(1, -1, -1),
  cornerArea(-1, -1, -1),
];

// Every clickable area, keyed by id. 6 faces + 8 corners = 14.
export const AREAS: Record<string, CubeArea> = Object.fromEntries(
  [...Object.values(FACE_AREAS), ...CORNER_AREAS].map(a => [a.id, a]),
);

const RAD_TO_DEG = 180 / Math.PI;

// Derive the cube's CSS rotation from the camera's orientation.
//
// The cube shows the model's orientation as seen from the camera, so it is
// rotated by the inverse of the camera's rotation. With the composition
// `rotateX(rx) rotateY(ry)` the face normals land where the corresponding model
// faces appear on screen: when the camera looks down (+Y), the top face is
// toward the viewer.
//
// Only the view direction matters, not distance: the vector from look to eye is
// normalized. `up` is accepted for symmetry with the camera API and to allow a
// future roll term, but a Y-up scene needs no roll — the cube never tilts
// sideways, matching the built-in cube's behaviour.
export function cameraToCubeRotation(
  eye: Vec3,
  look: Vec3,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  up?: Vec3,
): CubeRotation {
  const dx = eye[0] - look[0];
  const dy = eye[1] - look[1];
  const dz = eye[2] - look[2];
  const len = Math.hypot(dx, dy, dz);
  // Degenerate camera (eye == look): fall back to a neutral front view rather
  // than emitting NaN transforms that would blank the cube.
  if (!Number.isFinite(len) || len === 0) return { rx: 0, ry: 0 };

  const nx = dx / len;
  const ny = dy / len;
  const nz = dz / len;

  // Elevation: how far above/below the horizon the camera sits. Positive ny
  // (camera above the model) tips the cube forward so its top face shows.
  const rx = Math.asin(Math.max(-1, Math.min(1, ny))) * RAD_TO_DEG;
  // Azimuth around the vertical axis, measured so that a camera on +Z (the
  // default front view) yields 0.
  const ry = -Math.atan2(nx, nz) * RAD_TO_DEG;

  return { rx, ry };
}
