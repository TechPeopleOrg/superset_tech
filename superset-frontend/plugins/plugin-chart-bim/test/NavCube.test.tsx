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
  // Guards against corners collapsing onto each other: all eight directions
  // must be reachable, not just the four screen quadrants they project into.
  const onSelectArea = jest.fn();
  render(<NavCube onSelectArea={onSelectArea} />);

  CORNER_AREAS.forEach(area => {
    fireEvent.click(screen.getByTestId(`bim-navcube-corner-${area.id}`));
    expect(onSelectArea).toHaveBeenLastCalledWith(area.id);
  });
  expect(onSelectArea).toHaveBeenCalledTimes(CORNER_AREAS.length);
});

test('near and far corners of a quadrant occupy different screen positions', () => {
  // Both project into the same quadrant; if they also shared a position, the
  // one later in the DOM would cover the other and four of the eight corner
  // views would be unclickable in a browser (jsdom finds covered nodes fine,
  // so only comparing the styles catches this).
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

test('faces carry accessible labels', () => {
  render(<NavCube onSelectArea={jest.fn()} />);
  expect(screen.getByLabelText('Top')).toBeInTheDocument();
  expect(screen.getByLabelText('Front')).toBeInTheDocument();
});
