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
import { useEffect, useRef } from 'react';
import { styled } from '@apache-superset/core/theme';
import SVGCore from './lib/svgcore';
import { SvgChartProps } from './types';
import { useSvgMode } from './useSvgMode';
import { useSvgFilters } from './useSvgFilters';

const Container = styled.div`
  position: relative;
  overflow: hidden;
`;

const BackButton = styled.button`
  position: absolute;
  top: 0;
  left: 8px;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 14px;
  line-height: 1;
  font-size: 13px;
  color: ${({ theme }) => theme.colorText};
  background: ${({ theme }) => theme.colorBgContainer};
  border: 1px solid ${({ theme }) => theme.colorBorder};
  border-radius: ${({ theme }) => theme.borderRadius}px;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colorBgTextHover};
  }
`;

export default function SvgChart(props: SvgChartProps) {
  const { width, height, data, formData, svgOptions } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useSvgMode(formData.sliceId);
  const filters = useSvgFilters(['house', 'entrance', 'floor']);

  function setFilters(value: string) {
    if (value && value.includes('Квартира')) return;
    setMode('floor');
    if (value) {
      filters.house.set([value as string]);
      filters.entrance.set([1]);
      filters.floor.set([1]);
    }
  }

  function clearFilters() {
    setMode('house');
    filters.house.set([]);
    filters.entrance.set([]);
    filters.floor.set([]);
  }

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return undefined;
    }

    // SVGCore parses the markup string and appends the <svg> to the container,
    // so clear any previous render before instantiating.
    node.innerHTML = '';

    const svg = mode === 'house' ? data?.[0].complex_map : data?.[0].floor_map;
    const transformData = data.map(item => {
      return {
        name: mode === 'house' ? String(item.house) : String(item.name),
        value: item.percent,
        status: item.status,
      };
    });

    if (!svg) {
      return undefined;
    }
    // @ts-ignore
    const instance = new SVGCore(node, svg);
    instance.setOption({
      type: mode === 'house' ? 'range' : 'status',
      colorRange: svgOptions.colorRange,
      colorStatus: svgOptions.colorStatus,
      tooltip: {
        show: svgOptions.tooltip.show,
        positionAuto: svgOptions.tooltip.positionAuto,
        color: svgOptions.tooltip.color,
        position: svgOptions.tooltip.position,
        borderRadius: svgOptions.tooltip.borderRadius,
        borderColor: svgOptions.tooltip.borderColor,
        fontSize: svgOptions.tooltip.fontSize,
        fontFamily: svgOptions.tooltip.fontFamily,
        padding: svgOptions.tooltip.padding,
        background: svgOptions.tooltip.background,
        formatter: str => {
          const target = data.find(
            item => String(item.house) === str || item.name === str,
          );
          if (!target) return str;
          if (mode === 'house') {
            return `<b>ЖК ${target.complex_name}</b><br>Дом №${target.house}<br>Продано: ${target.percent}%`;
          }
          {
            return `<b>${target.name}</b><br>Площадь: ${target.square} м²<br>Стоимость: ${target.price} руб.<br>Статус: ${target.status}`;
          }
        },
        className: 'tooltip-custom',
      },
      events: {
        click: value => setFilters(value as string),
        dblclick: () => clearFilters(),
      },
      label: {
        show: svgOptions.label.show,
        fontSize: svgOptions.label.fontSize,
        fontFamily: svgOptions.label.fontFamily,
        color: svgOptions.label.color,
      },
      // @ts-ignore
      data: transformData,
    });
    return () => {
      instance.destroy();
      node.innerHTML = '';
    };
  }, [width, height, data, mode, svgOptions]);

  return (
    <Container style={{ width, height }}>
      {mode === 'floor' && (
        <BackButton type="button" onClick={() => clearFilters()}>
          ← Назад
        </BackButton>
      )}
      <div ref={containerRef} style={{ width, height }} />
    </Container>
  );
}
