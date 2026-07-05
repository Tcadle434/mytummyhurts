// Post-build prerender: renders the app to HTML and injects it into the built
// index.html so the page is fully readable without JS (BRIEF requirement).
import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT_INDEX = resolve(import.meta.dirname, '../../../server/landing/index.html');
const SSR_ENTRY = resolve(import.meta.dirname, '../dist-ssr/entry-server.js');

const { render } = await import(SSR_ENTRY);
const appHtml = render();

const template = await readFile(OUT_INDEX, 'utf8');
if (!template.includes('<!--app-html-->')) {
  throw new Error('index.html is missing the <!--app-html--> placeholder');
}
await writeFile(OUT_INDEX, template.replace('<!--app-html-->', appHtml));
await rm(resolve(import.meta.dirname, '../dist-ssr'), { recursive: true, force: true });
console.log('prerendered index.html');
