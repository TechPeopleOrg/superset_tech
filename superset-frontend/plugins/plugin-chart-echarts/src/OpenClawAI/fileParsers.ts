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
import { read, utils } from 'xlsx';

/** Reject files larger than this before parsing (protects the browser). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Truncate parsed text longer than this (protects the model's context). */
export const MAX_CHARS = 100_000;

export const TRUNCATION_MARKER = '\n\n[...текст обрезан, файл слишком большой]';

export interface ParsedAttachment {
  name: string;
  content: string;
}

const isExtension = (name: string, re: RegExp) => re.test(name);

/** Excel workbook → one CSV block per sheet, each under a `### Лист:` header. */
function workbookToText(buffer: ArrayBuffer): string {
  const workbook = read(buffer, { type: 'array' });
  return workbook.SheetNames.map(sheetName => {
    const csv = utils.sheet_to_csv(workbook.Sheets[sheetName]);
    return `### Лист: ${sheetName}\n${csv}`;
  }).join('\n\n');
}

/** PDF → page text, each page under a `[Стр. N]` header. pdf.js is lazy-loaded
 *  so it never enters the main bundle — only when a PDF is actually attached. */
async function pdfToText(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  // Point pdf.js at its worker; the entry is resolved by webpack at build time.
  // The worker-entry module ships no type declarations, hence the ts-ignore.
  // @ts-ignore
  const worker = await import('pdfjs-dist/build/pdf.worker.entry');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default ?? worker;

  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    // Pages are read sequentially; parallelizing gives no real benefit here.
    // eslint-disable-next-line no-await-in-loop
    const page = await doc.getPage(pageNum);

    // Text layer of the page content stream.
    // eslint-disable-next-line no-await-in-loop
    const textContent = await page.getTextContent();
    const bodyText = textContent.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim();

    // Filled forms and stamped documents keep their text in annotations
    // (FreeText / form fields), not in the page content stream — so read both.
    // eslint-disable-next-line no-await-in-loop
    const annotations = await page.getAnnotations();
    const annotationText = annotations
      .map((a: any) => a.contentsObj?.str || a.contents || a.fieldValue || '')
      .filter(Boolean)
      .join('\n')
      .trim();

    const pageText = [bodyText, annotationText].filter(Boolean).join('\n');
    pages.push(`[Стр. ${pageNum}]\n${pageText}`);
  }
  return pages.join('\n\n');
}

/** Clamp parsed text to MAX_CHARS, marking it when truncated. */
function clampText(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  return text.slice(0, MAX_CHARS) + TRUNCATION_MARKER;
}

/**
 * Read an attached file into plain text for the chat context.
 * Supports txt, md, xlsx/xls and pdf. Rejects oversized or unsupported files.
 */
export async function parseAttachment(file: File): Promise<ParsedAttachment> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`Файл больше ${MAX_FILE_BYTES / (1024 * 1024)} МБ`);
  }

  const { name, type } = file;
  let content: string;

  if (isExtension(name, /\.(txt|md)$/i) || type.startsWith('text/')) {
    content = await file.text();
  } else if (isExtension(name, /\.(xlsx|xls)$/i)) {
    content = workbookToText(await file.arrayBuffer());
  } else if (isExtension(name, /\.pdf$/i) || type === 'application/pdf') {
    content = await pdfToText(await file.arrayBuffer());
  } else {
    throw new Error('Неподдерживаемый тип файла');
  }

  return { name, content: clampText(content) };
}
