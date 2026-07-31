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
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { t } from '@apache-superset/core/translation';
import { styled } from '@apache-superset/core/theme';
import { CORNER_AREAS, CubeRotation, FACE_AREAS, FaceId } from './navCubeMath';

// Half the cube's edge length, in px: each face is translated out by this much.
const HALF = 32;
// Size of the square hit zone sitting over each corner of the cube's box.
const CORNER = 16;

export interface NavCubeHandle {
  // Set the cube's orientation without going through React state. The camera
  // fires on every frame of a drag; re-rendering the chart that often would
  // stutter the viewer, so the transform is written straight to the DOM.
  setRotation(rotation: CubeRotation): void;
}

export interface NavCubeProps {
  // Called with the area id (e.g. 'top' or 'top-front-left') when a face or
  // corner is clicked.
  onSelectArea: (areaId: string) => void;
}

// Wrapper establishing the 3D viewport. Pointer events are off here so the
// empty space around the cube does not swallow drags meant for the model; the
// faces and corners re-enable them individually.
const Stage = styled.div`
  position: absolute;
  right: ${({ theme }) => theme.sizeUnit * 3}px;
  /* Below the refresh badge's row so the two never overlap while it shows;
     the colour legend owns the bottom-right corner. */
  top: ${({ theme }) => theme.sizeUnit * 12}px;
  z-index: 10;
  width: ${HALF * 2}px;
  height: ${HALF * 2}px;
  perspective: 320px;
  pointer-events: none;
`;

const Cube = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  /* The camera drives this directly; a transition would lag behind a drag. */
  transform: rotateX(0deg) rotateY(0deg);
`;

const Face = styled.button`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  pointer-events: auto;
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  font-weight: ${({ theme }) => theme.fontWeightStrong};
  line-height: 1;
  color: ${({ theme }) => theme.colorTextSecondary};
  background: ${({ theme }) => theme.colorBgElevated};
  border: 1px solid ${({ theme }) => theme.colorBorderSecondary};
  /* Faces are opaque so the far side of the cube never shows through. */
  backface-visibility: hidden;
  transition:
    background 120ms ease,
    color 120ms ease;

  &:hover {
    color: ${({ theme }) => theme.colorPrimary};
    background: ${({ theme }) => theme.colorBgTextHover};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colorPrimary};
    outline-offset: 1px;
  }
`;

// Corner hit zones sit in front of the cube's box, outside its 3D transform, so
// they stay clickable at any orientation. They are invisible until hovered.
const Corner = styled.button`
  position: absolute;
  width: ${CORNER}px;
  height: ${CORNER}px;
  padding: 0;
  cursor: pointer;
  pointer-events: auto;
  background: transparent;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius}px;

  &:hover {
    background: ${({ theme }) => theme.colorPrimaryBg};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colorPrimary};
    outline-offset: 1px;
  }
`;

// Per-face placement inside the 3D box. Matches the direction vectors in
// navCubeMath: +Z is front, +Y is top, +X is right.
const FACE_TRANSFORMS: Record<FaceId, string> = {
  front: `translateZ(${HALF}px)`,
  back: `rotateY(180deg) translateZ(${HALF}px)`,
  right: `rotateY(90deg) translateZ(${HALF}px)`,
  left: `rotateY(-90deg) translateZ(${HALF}px)`,
  top: `rotateX(90deg) translateZ(${HALF}px)`,
  bottom: `rotateX(-90deg) translateZ(${HALF}px)`,
};

const FACE_LABELS: Record<FaceId, string> = {
  front: t('Front'),
  back: t('Back'),
  right: t('Right'),
  left: t('Left'),
  top: t('Top'),
  bottom: t('Bottom'),
};

// A corner's 2D position on the stage, derived from its direction vector: +X is
// right, +Y is up (so it pins to the top edge).
//
// The near (+Z) and far (-Z) corners of a quadrant project onto the same screen
// position, which would leave four of the eight zones permanently covered by
// the other four. Far corners are inset toward the middle so every zone stays
// reachable — the cube is small, so the offset reads as depth rather than as
// misalignment.
function cornerPosition(dir: readonly number[]) {
  const near = -CORNER / 2;
  const far = CORNER;
  const offset = dir[2] > 0 ? near : far;
  return {
    [dir[0] > 0 ? 'right' : 'left']: offset,
    [dir[1] > 0 ? 'top' : 'bottom']: offset,
  } as const;
}

// An orientation cube for jumping to standard views. Deliberately built from DOM
// elements rather than xeokit's NavCubePlugin: that plugin renders into its own
// WebGL scene, and a dashboard with several viewers being mounted and destroyed
// exhausts the GL context, leaving an empty square and a flood of GL errors.
const NavCube = forwardRef<NavCubeHandle, NavCubeProps>(
  ({ onSelectArea }, ref) => {
    const cubeRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      setRotation: ({ rx, ry }: CubeRotation) => {
        const node = cubeRef.current;
        if (!node) return;
        node.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
      },
    }));

    return (
      <Stage data-test="bim-navcube">
        <Cube ref={cubeRef} data-test="bim-navcube-cube">
          {(Object.keys(FACE_TRANSFORMS) as FaceId[]).map(face => (
            <Face
              key={face}
              type="button"
              style={{ transform: FACE_TRANSFORMS[face] }}
              aria-label={FACE_LABELS[face]}
              title={FACE_LABELS[face]}
              data-test={`bim-navcube-face-${face}`}
              onClick={() => onSelectArea(FACE_AREAS[face].id)}
            >
              {FACE_LABELS[face]}
            </Face>
          ))}
        </Cube>
        {CORNER_AREAS.map(area => (
          <Corner
            key={area.id}
            type="button"
            style={cornerPosition(area.dir)}
            aria-label={area.label}
            title={area.label}
            data-test={`bim-navcube-corner-${area.id}`}
            onClick={() => onSelectArea(area.id)}
          />
        ))}
      </Stage>
    );
  },
);

export default NavCube;
