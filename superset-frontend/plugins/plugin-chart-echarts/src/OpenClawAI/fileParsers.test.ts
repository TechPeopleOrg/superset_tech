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
import { utils, write } from 'xlsx';
import {
  parseAttachment,
  MAX_FILE_BYTES,
  MAX_CHARS,
  TRUNCATION_MARKER,
} from './fileParsers';

// jsdom's Blob/File don't implement text()/arrayBuffer(); polyfill via FileReader.
beforeAll(() => {
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function arrayBuffer() {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }
  if (!Blob.prototype.text) {
    Blob.prototype.text = function text() {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(this);
      });
    };
  }
});

function textFile(name: string, content: string, type = 'text/plain'): File {
  return new File([content], name, { type });
}

function xlsxFile(name: string, sheets: Record<string, unknown[][]>): File {
  const wb = utils.book_new();
  Object.entries(sheets).forEach(([sheetName, rows]) => {
    utils.book_append_sheet(wb, utils.aoa_to_sheet(rows), sheetName);
  });
  const buf = write(wb, { type: 'array', bookType: 'xlsx' });
  return new File([buf], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

test('reads a .txt file through unchanged', async () => {
  const result = await parseAttachment(textFile('notes.txt', 'hello world'));
  expect(result).toEqual({ name: 'notes.txt', content: 'hello world' });
});

test('reads a .md file through unchanged', async () => {
  const result = await parseAttachment(
    textFile('readme.md', '# Title', 'text/markdown'),
  );
  expect(result.content).toBe('# Title');
});

test('parses an .xlsx file to per-sheet CSV with a sheet header', async () => {
  const file = xlsxFile('data.xlsx', {
    Sales: [
      ['SKU', 'Revenue'],
      ['A', 100],
      ['B', 200],
    ],
  });
  const { content } = await parseAttachment(file);
  expect(content).toContain('### Лист: Sales');
  expect(content).toContain('SKU,Revenue');
  expect(content).toContain('A,100');
  expect(content).toContain('B,200');
});

test('includes every sheet of a multi-sheet workbook', async () => {
  const file = xlsxFile('multi.xlsx', {
    One: [['x'], [1]],
    Two: [['y'], [2]],
  });
  const { content } = await parseAttachment(file);
  expect(content).toContain('### Лист: One');
  expect(content).toContain('### Лист: Two');
});

test('rejects a file larger than the size limit', async () => {
  const big = textFile('big.txt', 'x');
  Object.defineProperty(big, 'size', { value: MAX_FILE_BYTES + 1 });
  await expect(parseAttachment(big)).rejects.toThrow();
});

test('truncates parsed text longer than MAX_CHARS and appends the marker', async () => {
  const huge = 'a'.repeat(MAX_CHARS + 5000);
  const { content } = await parseAttachment(textFile('huge.txt', huge));
  expect(content.length).toBeLessThan(huge.length);
  expect(content.endsWith(TRUNCATION_MARKER)).toBe(true);
});

test('rejects an unsupported file type', async () => {
  const bin = new File(['...'], 'image.png', { type: 'image/png' });
  await expect(parseAttachment(bin)).rejects.toThrow();
});
