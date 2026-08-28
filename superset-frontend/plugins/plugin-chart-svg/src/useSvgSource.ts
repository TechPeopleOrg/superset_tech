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
import { useEffect, useState } from 'react';
import { buildSvgUrl } from './transformProps';

export interface SvgSource {
  svg: string;
  loading: boolean;
  error?: string;
}

// Result of a finished request, tagged with the uuid it was made for. Tagging
// lets the render decide whether the stored result still matches the requested
// uuid, so no state has to be reset when the uuid changes.
interface Fetched {
  uuid: string;
  svg: string;
  error?: string;
}

const EMPTY: SvgSource = { svg: '', loading: false };

/**
 * Загружает разметку SVG из файлового хранилища по UUID.
 * Кэша нет — каждая смена UUID это новый запрос. Предыдущий запрос отменяется,
 * чтобы поздний ответ не затёр текущую картинку при быстром переключении режима.
 */
export function useSvgSource(uuid: string): SvgSource {
  const [fetched, setFetched] = useState<Fetched | undefined>();

  useEffect(() => {
    if (!uuid) {
      return undefined;
    }

    const controller = new AbortController();

    fetch(buildSvgUrl(uuid), { signal: controller.signal })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.text();
      })
      .then(svg => {
        if (!controller.signal.aborted) {
          setFetched({ uuid, svg });
        }
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setFetched({ uuid, svg: '', error: String(err) });
        }
      });

    return () => controller.abort();
  }, [uuid]);

  if (!uuid) {
    return EMPTY;
  }
  // A result for a different uuid means this one is still in flight.
  if (!fetched || fetched.uuid !== uuid) {
    return { svg: '', loading: true };
  }
  return { svg: fetched.svg, loading: false, error: fetched.error };
}
