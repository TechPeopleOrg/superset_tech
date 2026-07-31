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
import { createRef } from 'react';
import { render, screen, fireEvent } from 'spec/helpers/testing-library';
import NavCube, { NavCubeHandle } from '../src/NavCube';
import { AREAS, CORNER_AREAS } from '../src/navCubeMath';

test('clicking a face selects that view', () => {
  const onSelectArea = jest.fn();
  render(<NavCube onSelectArea={onSelectArea} />);

  fireEvent.click(screen.getByTestId('bim-navcube-face-top'));
  expect(onSelectArea).toHaveBeenCalledWith('top');

  fireEvent.click(screen.getByTestId('bim-navcube-face-front'));
  expect(onSelectArea).toHaveBeenLastCalledWith('front');
});

test('all six faces are rendered and selectable', () => {
  const onSelectArea = jest.fn();
  render(<NavCube onSelectArea={onSelectArea} />);

  ['front', 'back', 'left', 'right', 'top', 'bottom'].forEach(face => {
    fireEvent.click(screen.getByTestId(`bim-navcube-face-${face}`));
    expect(onSelectArea).toHaveBeenLastCalledWith(face);
  });
  expect(onSelectArea).toHaveBeenCalledTimes(6);
});

test('clicking a corner selects the isometric view', () => {
  const onSelectArea = jest.fn();
  render(<NavCube onSelectArea={onSelectArea} />);

  fireEvent.click(screen.getByTestId('bim-navcube-corner-top-front-left'));
  expect(onSelectArea).toHaveBeenCalledWith('top-front-left');
});

test('every corner area is individually clickable', () => {
  // All eight must be reachable, not just the four screen quadrants.
  const onSelectArea = jest.fn();
  render(<NavCube onSelectArea={onSelectArea} />);

  CORNER_AREAS.forEach(area => {
    fireEvent.click(screen.getByTestId(`bim-navcube-corner-${area.id}`));
    expect(onSelectArea).toHaveBeenLastCalledWith(area.id);
  });
  expect(onSelectArea).toHaveBeenCalledTimes(CORNER_AREAS.length);
});

test('near and far corners of a quadrant occupy different screen positions', () => {
  // Same quadrant: sharing a position would hide one under the other.
  render(<NavCube onSelectArea={jest.fn()} />);

  const near = screen.getByTestId('bim-navcube-corner-top-front-right');
  const far = screen.getByTestId('bim-navcube-corner-top-back-right');
  expect(near.style.top).not.toBe(far.style.top);
  expect(near.style.right).not.toBe(far.style.right);
});

test('every selectable id maps to a known area', () => {
  const onSelectArea = jest.fn();
  render(<NavCube onSelectArea={onSelectArea} />);

  const ids = [
    ...['front', 'back', 'left', 'right', 'top', 'bottom'],
    ...CORNER_AREAS.map(a => a.id),
  ];
  ids.forEach(id => expect(AREAS[id]).toBeDefined());
});

test('setRotation writes the transform straight to the DOM', () => {
  const ref = createRef<NavCubeHandle>();
  render(<NavCube ref={ref} onSelectArea={jest.fn()} />);

  ref.current!.setRotation({ rx: 30, ry: -45 });

  const cube = screen.getByTestId('bim-navcube-cube');
  expect(cube.style.transform).toBe('rotateX(30deg) rotateY(-45deg)');
});

test('setRotation is safe to call repeatedly, as during a camera drag', () => {
  const ref = createRef<NavCubeHandle>();
  render(<NavCube ref={ref} onSelectArea={jest.fn()} />);

  ref.current!.setRotation({ rx: 10, ry: 10 });
  ref.current!.setRotation({ rx: 20, ry: 20 });

  const cube = screen.getByTestId('bim-navcube-cube');
  expect(cube.style.transform).toBe('rotateX(20deg) rotateY(20deg)');
});

test('the top face tips away from the viewer, the bottom toward it', () => {
  // Swapping these puts "Bottom" on the upper face of the cube.
  render(<NavCube onSelectArea={jest.fn()} />);

  const top = screen.getByTestId('bim-navcube-face-top');
  const bottom = screen.getByTestId('bim-navcube-face-bottom');
  expect(top.style.transform).toMatch(/rotateX\(-90deg\)/);
  expect(bottom.style.transform).toMatch(/rotateX\(90deg\)/);
});

test('opposite faces are half a turn apart', () => {
  render(<NavCube onSelectArea={jest.fn()} />);
  const face = (id: string) =>
    screen.getByTestId(`bim-navcube-face-${id}`).style.transform;

  expect(face('front')).not.toContain('rotate');
  expect(face('back')).toMatch(/rotateY\(180deg\)/);
  expect(face('right')).toMatch(/rotateY\(90deg\)/);
  expect(face('left')).toMatch(/rotateY\(-90deg\)/);
});

test('sits in the top-right, clear of the bottom-right colour legend', () => {
  render(<NavCube onSelectArea={jest.fn()} />);
  const style = getComputedStyle(screen.getByTestId('bim-navcube'));
  expect(style.top).not.toBe('');
  expect(style.right).not.toBe('');
  expect(style.bottom).toBe('');
});

test('faces carry accessible labels', () => {
  render(<NavCube onSelectArea={jest.fn()} />);
  expect(screen.getByLabelText('Top')).toBeInTheDocument();
  expect(screen.getByLabelText('Front')).toBeInTheDocument();
});
