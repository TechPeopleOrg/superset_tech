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
import { useCallback, useState } from 'react';

export type SvgMode = 'house' | 'floor';

const DEFAULT_MODE: SvgMode = 'house';

/**
 * Хранилище режима живёт в памяти модуля, а не в session/localStorage.
 * Это даёт ровно нужное поведение:
 *  - изменение фильтров перемонтирует виджет, но НЕ перезагружает страницу,
 *    поэтому модуль остаётся в памяти и режим сохраняется;
 *  - перезагрузка страницы (F5), выход и возврат на дашборд, новая вкладка —
 *    это свежая загрузка JS, модуль создаётся заново пустым, режим = 'house'.
 * Ключ — id виджета, чтобы режимы разных SVG-виджетов не пересекались.
 */
const modeStore = new Map<string | number, SvgMode>();

export function useSvgMode(chartId: string | number) {
  const [mode, setModeState] = useState<SvgMode>(
    () => modeStore.get(chartId) ?? DEFAULT_MODE,
  );

  const setMode = useCallback(
    (next: SvgMode) => {
      modeStore.set(chartId, next);
      setModeState(next);
    },
    [chartId],
  );

  return [mode, setMode] as const;
}
