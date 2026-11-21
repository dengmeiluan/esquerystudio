/**
 * 全站原生控件禁令扫描：可见交互控件一律组件化（NSelect/NCheckbox/NInputNumber/
 * NDatePicker/NSlider/NRadio/CollapsePanel/NPopover/JsonArea/SuggestInput 等承载）。
 * 禁令面：原生 select/datalist/details/summary/裸 textarea，及 input 的
 * checkbox/radio/number/range/date/time/month/week/datetime-local 形态。
 * 豁免：自研基础输入件（SuggestInput/LuceneInput/SettingsKeyInput/TableQSearch/
 * SearchFilterBar——内部以原生 input 为承载的实现层）与隐藏 file input（a11y 惯例）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..');
const EXEMPT = new Set([
  'components/SuggestInput.vue',
  'components/LuceneInput.vue',
  'components/SettingsKeyInput.vue',
  'components/TableQSearch.vue',
  'components/SearchFilterBar.vue',
]);

function collectVue(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collectVue(p, out);
    else if (name.endsWith('.vue')) out.push(p);
  }
  return out;
}

type Ban = { re: RegExp; label: string };
const BANS: Ban[] = [
  { re: /<select[\s>]/, label: '原生 select' },
  { re: /<datalist[\s>]/, label: 'datalist' },
  { re: /<details[\s>]/, label: 'details 折叠' },
  { re: /<summary[\s>]/, label: 'summary' },
  { re: /<textarea[\s>]/, label: '裸 textarea' },
  { re: /<input[^>]*type="checkbox"/, label: '原生 checkbox' },
  { re: /<input[^>]*type="radio"/, label: '原生 radio' },
  { re: /<input[^>]*type="number"/, label: '原生 number spinner' },
  { re: /<input[^>]*type="range"/, label: '原生 range 滑杆' },
  { re: /<input[^>]*type="datetime-local"/, label: '原生 datetime-local' },
  { re: /<input[^>]*type="(?:date|time|month|week)"/, label: '原生日期时间控件' },
];

const files = collectVue(join(SRC, 'components'))
  .concat(collectVue(join(SRC, 'views')))
  .map((p) => relative(SRC, p).replace(/\\/g, '/'))
  .filter((p) => !EXEMPT.has(p));

describe('全站原生控件禁令（可见交互控件一律组件化）', () => {
  it('扫描面非空（components+views 全量 vue 文件）', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('无原生 select/datalist/details/summary/textarea/checkbox/radio/number/range/日期时间控件残留', () => {
    const offenders: string[] = [];
    for (const rel of files) {
      const text = readFileSync(join(SRC, rel), 'utf-8');
      for (const { re, label } of BANS) {
        const m = text.match(re);
        if (m) offenders.push(`${rel} → ${label}（${m[0].slice(0, 40)}…）`);
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('file input 仅允许隐藏形态（sr-only / display:none，配合触发按钮的 a11y 惯例）', () => {
    const offenders: string[] = [];
    for (const rel of files) {
      const text = readFileSync(join(SRC, rel), 'utf-8');
      for (const line of text.split('\n')) {
        if (!/<input[^>]*type="file"/.test(line)) continue;
        if (!/sr-only|display:\s*none/.test(line)) offenders.push(`${rel} → 可见 file input`);
      }
    }
    expect(offenders.join('\n')).toBe('');
  });

  it('自研基础输入件豁免名单与实际文件对齐（防名单腐化）', () => {
    for (const rel of EXEMPT) {
      expect(readFileSync(join(SRC, rel), 'utf-8'), `${rel} 应存在`).toBeTruthy();
    }
  });
});
