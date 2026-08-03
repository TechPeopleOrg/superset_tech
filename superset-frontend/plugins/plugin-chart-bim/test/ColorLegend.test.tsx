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
import { render, screen, fireEvent } from 'spec/helpers/testing-library';
import ColorLegend from '../src/ColorLegend';

const legend = [
  { value: 'Done', color: '#00ff00' },
  { value: 'Late', color: '#ff0000' },
];

test('renders one chip per legend entry', () => {
  render(
    <ColorLegend
      legend={[
        { value: 'Done', color: '#00ff00' },
        { value: 'Late', color: '#ff0000' },
      ]}
    />,
  );
  expect(screen.getByText('Done')).toBeInTheDocument();
  expect(screen.getByText('Late')).toBeInTheDocument();
});

test('renders nothing when legend is empty', () => {
  const { container } = render(<ColorLegend legend={[]} />);
  expect(container).toBeEmptyDOMElement();
});

test('renders a gradient bar with min/max labels in gradient mode', () => {
  render(
    <ColorLegend
      legend={[]}
      gradient={{ scaleId: 'grey-green', min: 0, max: 100 }}
    />,
  );
  expect(screen.getByTestId('bim-legend-gradient')).toBeInTheDocument();
  expect(screen.getByText('0')).toBeInTheDocument();
  expect(screen.getByText('100')).toBeInTheDocument();
});

test('gradient legend formats fractional bounds compactly', () => {
  render(
    <ColorLegend
      legend={[]}
      gradient={{ scaleId: 'blue', min: 1.23456, max: 9876.5 }}
    />,
  );
  // Rounded to a compact form, not the raw float.
  expect(screen.getByText('1.23')).toBeInTheDocument();
  expect(screen.getByText('9,876.5')).toBeInTheDocument();
});

test('clicking a legend entry toggles that value', () => {
  const onToggle = jest.fn();
  render(<ColorLegend legend={legend} onToggle={onToggle} />);

  fireEvent.click(screen.getByTestId('bim-legend-item-Done'));
  expect(onToggle).toHaveBeenCalledWith('Done');
});

test('a dimmed entry reads as switched off', () => {
  render(
    <ColorLegend
      legend={legend}
      dimmed={new Set(['Done'])}
      onToggle={jest.fn()}
    />,
  );
  expect(screen.getByTestId('bim-legend-item-Done')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(screen.getByTestId('bim-legend-item-Late')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('without onToggle the legend is not interactive', () => {
  render(<ColorLegend legend={legend} />);
  expect(screen.getByTestId('bim-legend-item-Done')).not.toHaveAttribute(
    'aria-pressed',
  );
});

const gradient = { scaleId: 'viridis', min: 0, max: 100 };

test('shows a range slider on the gradient legend when interactive', () => {
  render(
    <ColorLegend legend={[]} gradient={gradient} onRangeChange={jest.fn()} />,
  );
  expect(screen.getByTestId('bim-legend-range')).toBeInTheDocument();
});

test('omits the slider when the legend is not interactive', () => {
  render(<ColorLegend legend={[]} gradient={gradient} />);
  expect(screen.queryByTestId('bim-legend-range')).not.toBeInTheDocument();
});

test('the bounds follow the selected range', () => {
  render(
    <ColorLegend
      legend={[]}
      gradient={gradient}
      range={[40, 70]}
      onRangeChange={jest.fn()}
    />,
  );
  expect(screen.getByText('40')).toBeInTheDocument();
  expect(screen.getByText('70')).toBeInTheDocument();
});

test('the bounds fall back to the full scale with no range set', () => {
  render(
    <ColorLegend legend={[]} gradient={gradient} onRangeChange={jest.fn()} />,
  );
  expect(screen.getByText('0')).toBeInTheDocument();
  expect(screen.getByText('100')).toBeInTheDocument();
});

test('omits the slider on a degenerate scale', () => {
  render(
    <ColorLegend
      legend={[]}
      gradient={{ scaleId: 'viridis', min: 5, max: 5 }}
      onRangeChange={jest.fn()}
    />,
  );
  expect(screen.queryByTestId('bim-legend-range')).not.toBeInTheDocument();
});
