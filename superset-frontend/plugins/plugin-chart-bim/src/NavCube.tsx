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
const HALF = 22;
// Corner hit zone, kept clickable as the cube shrinks.
const CORNER = 14;

export interface NavCubeHandle {
  // Written straight to the DOM: the camera fires on every frame of a drag.
  setRotation(rotation: CubeRotation): void;
}

export interface NavCubeProps {
  // Called with the clicked area id, e.g. 'top' or 'top-front-left'.
  onSelectArea: (areaId: string) => void;
}

// 3D viewport. Pointer events off so empty space does not swallow model drags.
const Stage = styled.div`
  position: absolute;
  right: ${({ theme }) => theme.sizeUnit * 6}px;
  /* Level with the toolbar; the colour legend owns the bottom-right. */
  top: ${({ theme }) => theme.sizeUnit * 2}px;
  z-index: 10;
  width: ${HALF * 2}px;
  height: ${HALF * 2}px;
  /* Scaled with the cube so the projection stays consistent at any size. */
  perspective: ${HALF * 10}px;
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
  font-size: ${({ theme }) => theme.fontSizeXS}px;
  font-weight: ${({ theme }) => theme.fontWeightStrong};
  line-height: 1;
  /* Labels must not spill past the face they belong to. */
  overflow: hidden;
  color: ${({ theme }) => theme.colorTextSecondary};
  background: ${({ theme }) => theme.colorBgElevated};
  border: 1px solid ${({ theme }) => theme.colorBorderSecondary};
  /* Same rounding as the toolbar. */
  border-radius: ${({ theme }) => theme.borderRadius}px;
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

// Outside the 3D transform, so corners stay clickable at any orientation.
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

// CSS's Y axis points down, so rotateX(-90deg) — not +90 — is the top face.
const FACE_TRANSFORMS: Record<FaceId, string> = {
  front: `translateZ(${HALF}px)`,
  back: `rotateY(180deg) translateZ(${HALF}px)`,
  right: `rotateY(90deg) translateZ(${HALF}px)`,
  left: `rotateY(-90deg) translateZ(${HALF}px)`,
  top: `rotateX(-90deg) translateZ(${HALF}px)`,
  bottom: `rotateX(90deg) translateZ(${HALF}px)`,
};

const FACE_LABELS: Record<FaceId, string> = {
  front: t('Front'),
  back: t('Back'),
  right: t('Right'),
  left: t('Left'),
  top: t('Top'),
  bottom: t('Bottom'),
};

// Box offsets, not CSS axes: +Y is `top`. Far corners inset to stay clickable.
function cornerPosition(dir: readonly number[]) {
  const near = -CORNER / 2;
  const far = CORNER;
  const offset = dir[2] > 0 ? near : far;
  return {
    [dir[0] > 0 ? 'right' : 'left']: offset,
    [dir[1] > 0 ? 'top' : 'bottom']: offset,
  } as const;
}

// DOM-based on purpose: xeokit's NavCubePlugin needs a second WebGL context,
// which several viewers on one dashboard exhaust.
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
