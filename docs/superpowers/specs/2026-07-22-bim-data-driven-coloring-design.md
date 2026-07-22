# BIM chart — окраска элементов по данным (data → 3D)

Дата: 2026-07-22
Плагин: `superset-frontend/plugins/plugin-chart-bim`
Ветка: `feat/bim-viewer-chart`

## Цель

Сделать первый шаг «живого среза» а-ля VCAD для Power BI: **данные дашборда
управляют раскраской 3D-модели**. Элементы BIM-модели окрашиваются по значению
колонки датасета. Плагин остаётся **универсальным** — без хардкода под конкретную
модель или конкретный набор данных.

Эта итерация покрывает только направление **данные → 3D (окраска по категории)**.
Вне области: клик по 3D → cross-filter (`setDataMask`), изоляция/xray по данным,
градиент по числу. Они — следующие итерации.

## Ключ связки (фактически проверено)

В наших `.xkt` (XKT v12, metadata встроена в файл, отдельный JSON не нужен):

- у каждого `metaObject` поле **`id` = IFC GlobalId** (напр. `0PDdco_2jAQutunre274HA`);
- этот же `id` = `objectId` объекта сцены (`scene.objects[id]`), которым мы уже
  тоггаем видимость и строим дерево;
- поле `originalSystemId` в этих файлах пустое — GlobalId живёт именно в `id`;
- есть `propertySets` и иерархия IfcProject→Site→Building→Storey→элементы.

Отсюда сквозной ключ:

```
link_column (значение из данных) == metaObject.id == scene.objects[id] == IFC GlobalId
```

Контейнерный GlobalId (этаж/сборка) разворачивается в геометрические листья через
`metaScene.getObjectIDsInSubtree(id)`.

**Требование к данным:** в датасете должна быть колонка с GlobalId элемента
(`link_column`). Для источников без GlobalId (напр. выгрузка Primavera P6) это
решается на стороне данных (маппинг-таблица). Плагин про это не знает — он
универсален.

## Аналогия с VCAD

VCAD получает пары «элемент → значение» не как сырые строки: Power BI **всегда
группирует** по полям визуала и агрегирует меры, отдавая одну строку на элемент.
Мы воспроизводим это стандартным механизмом Superset: `buildQuery` формирует
`groupby[link_column, color_by]`, Superset сам сворачивает строки. На выходе — одна
строка на GlobalId. Отличие от VCAD: у них таблицу свойств элементов поставляет их
конвертер (GlobalId гарантирован), у нас источник — любой датасет пользователя,
поэтому наличие `link_column` — ответственность пользователя.

## Архитектура

Расширяем существующий плагин, следуя его паттерну (чистые модули + engine-only
хук). Ничего не переписываем.

```
Датасет (Superset)
   │  buildQuery: groupby[link_column, color_by] + row_limit
   ▼
queriesData[0].data  →  transformProps  →  BimChartProps
   ▼
BimChart (оркестратор)
   ├── colorMapping.ts  (ЧИСТЫЙ: rows → Map<globalId,rgb> + legend + stats)
   ├── useXeokitViewer  (ENGINE-ONLY: api.colorize / resetColors / expandToLeaves)
   ├── <ColorLegend/>   (компактный оверлей: чип цвет—значение)
   └── строка диагностики «совпало X из Y»
```

Границы ответственности:

| Модуль | Ответственность | Знает про | НЕ знает про |
|---|---|---|---|
| `colorMapping.ts` | значения → цвета, палитра, оверрайд, статистика | данные, палитру | xeokit, React, DOM |
| `useXeokitViewer` | грузит модель, красит объекты по id | xeokit | данные, цвета, палитру |
| `BimChart` | mapping → разворот контейнеров → colorize; легенда; диагностика | оба | внутренности xeokit-типов |
| `ColorLegend` | рисует легенду | цвета/значения | всё остальное |

## Контролы (control panel)

Новая секция **«Data binding»** в `controlPanel.tsx`. Все значения — из
датасета/темы, ничего не зашито.

- **`link_column`** — `SelectControl`, `choices = columnChoices(datasource)`.
  Колонка с GlobalId элемента. Пусто по умолчанию.
- **`color_by`** — `SelectControl`, `choices = columnChoices(datasource)`.
  Колонка-измерение для окраски. Пусто по умолчанию.
- **`color_overrides`** — опциональный ручной маппинг `{value, color}[]`
  поверх автопалитры. Пусто по умолчанию. Точная форма UI фиксируется в плане
  (на модель данных не влияет).

Поведение:

- оба пусты → плагин работает как сейчас (только 3D), окраски нет;
- `link_column` есть, `color_by` пуст → красить нечем, окраски нет (без спец-эффекта);
- оба заданы → окраска включается;
- **автопалитра** берётся из `CategoricalColorNamespace` Superset (единая палитра
  дашборда, не наш хардкод);
- **нейтральный серый** для несовпавших — из токена темы, не хардкод-хекс.

Загрузка модели (ручной `model_uuid` / `model_column`) не меняется.

## `colorMapping.ts` — чистый модуль

```ts
buildColorMapping(input: {
  rows: DataRecord[];
  linkColumn: string;
  colorBy: string;
  palette: string[];                              // hex из CategoricalColorNamespace
  overrides?: { value: string; color: string }[];
}): {
  colorById: Map<string, [number, number, number]>; // globalId → rgb 0..1
  legend: { value: string; color: string }[];        // уникальные значения → цвет
  stats: { dataKeys: number };                        // число уникальных GlobalId
}
```

Логика (детерминированная, без хардкода под данные):

1. по `rows`: `id = String(row[linkColumn])`, `val = row[colorBy]`; null/'' → пропуск;
2. собрать уникальные значения `colorBy` в порядке первого появления;
3. каждому значению цвет: сначала `overrides[value]`, иначе следующий из `palette`
   по кругу (палитра короче числа значений → циклически);
4. hex → `[r,g,b]` 0..1 (формат `entity.colorize`);
5. заполнить `colorById: id → rgb значения`;
6. вернуть `legend` и `stats.dataKeys`.

Крайние случаи: пустые rows → пустая карта/легенда; `colorBy` не в строке → пропуск;
дубликаты id — «последний выигрывает» (после groupby дублей на практике нет).

Матч с моделью здесь НЕ считается — модуль не знает про сцену. `matched X из Y`
считает `BimChart`, пересекая ключи с объектами сцены (после разворота контейнеров).

## `useXeokitViewer` — расширение API (engine-only)

Добавить в `XeokitApi` (`types.ts`):

```ts
colorize(objectIds: string[], rgb: [number, number, number]): void;
resetColors(objectIds?: string[]): void;   // undefined → сбросить все
expandToLeaves(id: string): string[];       // metaScene.getObjectIDsInSubtree, только геометрия
```

Реализация в хуке:

- `colorize` — `scene.objects[id].colorize = rgb`; несуществующие id молча пропускаются;
- `resetColors` — `colorize = [1,1,1]` (нейтральный множитель = исходный цвет модели)
  для указанных или всех объектов;
- `expandToLeaves(id)` — `metaScene.getObjectIDsInSubtree(id)`, отфильтровать по
  наличию в `scene.objects`; для листа возвращается он сам.

Причина держать это в хуке: `scene.objects` и `metaScene` — это xeokit; правило «весь
доступ к движку за интерфейсом» уже действует в плагине. `BimChart` не касается
xeokit-типов; замена движка (AGPL) остаётся локальной.

Методы добавляются в тот же объект `api`, что уже отдаётся из события `loaded`.

## `BimChart` — оркестрация, легенда, диагностика

Поток:

1. `transformProps` кладёт в props: `rows`, `linkColumn`, `colorBy`,
   `palette` (`CategoricalColorNamespace.getScale()`), `overrides`,
   `neutralColor` (токен темы);
2. `useMemo` → `buildColorMapping(...)` → `{ colorById, legend, stats }`
   (пересчёт только при смене данных/конфига);
3. `useEffect` (зависит от `api`, `colorById`, `neutralColor`) при готовом `api`:
   - `api.resetColors()` — снять прошлую окраску;
   - нейтральный серый на всё: `api.colorize(allSceneIds, neutralRgb)` — база «нет данных»;
   - для каждой пары `(globalId, rgb)`: `ids = api.expandToLeaves(globalId)`,
     `api.colorize(ids, rgb)`, накопить matched-id в `Set`;
   - `matched = |Set ∩ scene.objects|`, `total = colorById.size` → строка диагностики;
4. рендер: контейнер вьюера (как есть) + `<ColorLegend legend={legend}/>` +
   строка «совпало M из N» (ненавязчиво, угол).

Реактивность: окраска — эффект, не разовое действие. Смена данных перекрашивает без
ремоунта модели. Смена модели ремоунтит вьюер, эффект переигрывается на новой сцене.
Порядок «серый → цвета» гарантирует: несовпавшие серые, совпавшие поверх. Один проход,
без React-ререндеров на объект — дёшево на 9000+ элементов.

`ColorLegend` — presentational: чипы `цвет — значение`, оверлей в углу вьюера (зеркало
панели дерева), токены темы, без своей логики.

## Тестирование

Jest + RTL; чистые модули — без моков движка; unit > integration.

**`colorMapping.test.ts`** (основная масса):
- уникальные значения → цвета по кругу (детерминизм, порядок первого появления);
- `overrides` перекрывают автопалитру;
- пустые rows / пустой `colorBy` → пустая карта и легенда;
- null/'' в `colorBy` → строка пропущена;
- hex→rgb 0..1 корректен;
- `stats.dataKeys` = число уникальных GlobalId;
- палитра короче числа значений → циклическое переиспользование.

**`useXeokitViewer.test`** (фейковая сцена):
- `colorize` красит только существующие объекты, несуществующие — молча;
- `resetColors()` без аргумента сбрасывает все, с аргументом — только указанные;
- `expandToLeaves` возвращает геометрические листья поддерева; для листа — его самого;
  фильтрует не-геометрию.

**`BimChart.test.tsx`** (мок `api`):
- порядок вызовов: `resetColors` → нейтральный `colorize` на всё → цветной на матчи;
- контейнерный GlobalId разворачивается (`expandToLeaves` вызван) и красит потомков;
- легенда рендерит по чипу на уникальное значение;
- строка диагностики показывает «M из N»;
- нет данных / нет `color_by` → окраски нет, легенды нет, вьюер жив.

**`transformProps.test` / `buildQuery.test`**:
- `buildQuery` кладёт `link_column` и `color_by` в groupby, когда заданы; без них — как раньше;
- `transformProps` прокидывает rows/имена/палитру/overrides в props.

## Не входит в эту итерацию (следующие шаги)

- 3D → данные: клик по элементу → `setDataMask` (cross-filter дашборда);
- изоляция / xray по данным;
- градиент по числовой колонке;
- таблица свойств элемента (из `propertySets`) а-ля VCAD.
