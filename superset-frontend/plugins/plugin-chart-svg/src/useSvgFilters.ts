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
import { useCallback, useMemo } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';

export type FilterValue = (string | number | boolean | null)[];

// Значение нативного select-фильтра в Redux.
interface FilterState {
  value?: FilterValue | null;
  label?: string;
}

interface DataMaskState {
  [filterId: string]: {
    filterState?: FilterState;
  };
}

// Конфиг нативного фильтра (нас интересует только колонка, на которую он смотрит).
interface NativeFilter {
  id: string;
  targets?: { column?: { name?: string } }[];
}

interface NativeFiltersState {
  filters?: Record<string, NativeFilter>;
}

interface RootState {
  dataMask?: DataMaskState;
  nativeFilters?: NativeFiltersState;
}

// Строковый тип экшена редьюсера dataMask — публичный контракт, чтобы не
// импортировать src/ из плагина.
const UPDATE_DATA_MASK = 'UPDATE_DATA_MASK';

// Управление одним нативным фильтром.
export interface SvgFilterControl {
  // id найденного нативного фильтра (undefined, если фильтра по колонке нет).
  filterId?: string;
  // текущее значение фильтра.
  value?: FilterValue | null;
  // выставить значение (IN). Пустой массив = сбросить.
  set: (next: FilterValue) => void;
  // сбросить фильтр.
  clear: () => void;
}

function buildDataMask(column: string, next: FilterValue) {
  return {
    extraFormData: {
      filters: next.length
        ? [{ col: column, op: 'IN' as const, val: next }]
        : [],
    },
    filterState: {
      value: next.length ? next : null,
      label: next.length ? next.join(', ') : undefined,
    },
  };
}

/**
 * Хук для программного управления значениями нативных фильтров дашборда.
 *
 * Находит фильтры по именам колонок и отдаёт по контролу на каждую: текущее
 * значение, set/clear. Под капотом диспатчит тот же UPDATE_DATA_MASK, что и
 * штатный FilterBar, поэтому фильтры применяются ко всему дашборду нативно.
 *
 * Пример с несколькими фильтрами:
 *   const filters = useSvgFilters(['complex_name', 'house', 'entrance', 'floor']);
 *   filters.house.set([10]);          // house IN [10]
 *   filters.complex_name.value;       // текущее значение
 *   filters.setMany({ house: [10], entrance: [1] }); // выставить пачкой
 *   filters.clearAll();               // сбросить все
 */
export function useSvgFilters<C extends string>(
  columns: C[],
): {
  setMany: (values: Partial<Record<C, FilterValue>>) => void;
  clearAll: () => void;
} & Record<C, SvgFilterControl> {
  const dispatch = useDispatch();

  // Колонка -> id нативного фильтра.
  const filterIdByColumn = useSelector<RootState, Record<string, string>>(
    state => {
      const filters = state.nativeFilters?.filters ?? {};
      const map: Record<string, string> = {};
      Object.values(filters).forEach(f => {
        const col = f.targets?.[0]?.column?.name;
        if (col && columns.includes(col as C)) {
          map[col] = f.id;
        }
      });
      return map;
    },
    shallowEqual,
  );

  // Колонка -> текущее значение фильтра.
  const valueByColumn = useSelector<RootState, Record<string, FilterValue | null | undefined>>(
    state => {
      const result: Record<string, FilterValue | null | undefined> = {};
      columns.forEach(col => {
        const id = filterIdByColumn[col];
        result[col] = id
          ? state.dataMask?.[id]?.filterState?.value
          : undefined;
      });
      return result;
    },
    shallowEqual,
  );

  const setOne = useCallback(
    (column: string, next: FilterValue) => {
      const filterId = filterIdByColumn[column];
      if (!filterId) {
        // eslint-disable-next-line no-console
        console.warn(
          `[useSvgFilters] нет нативного фильтра по колонке "${column}"`,
        );
        return;
      }
      dispatch({
        type: UPDATE_DATA_MASK,
        filterId,
        dataMask: buildDataMask(column, next),
      });
    },
    [dispatch, filterIdByColumn],
  );

  const setMany = useCallback(
    (values: Partial<Record<C, FilterValue>>) => {
      (Object.keys(values) as C[]).forEach(col => {
        const next = values[col];
        if (next) setOne(col, next);
      });
    },
    [setOne],
  );

  const clearAll = useCallback(() => {
    columns.forEach(col => setOne(col, []));
  }, [columns, setOne]);

  return useMemo(() => {
    const controls = {} as Record<C, SvgFilterControl>;
    columns.forEach(col => {
      controls[col] = {
        filterId: filterIdByColumn[col],
        value: valueByColumn[col],
        set: (next: FilterValue) => setOne(col, next),
        clear: () => setOne(col, []),
      };
    });
    return { ...controls, setMany, clearAll };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterIdByColumn, valueByColumn, setOne, setMany, clearAll]);
}
