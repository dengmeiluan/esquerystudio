#!/usr/bin/env node
/*
 * 原生产控件普查门：整个 UI 不允许再出现「廉价原生控件」。
 *
 * 判定：
 *  - <select> / <textarea>：一律不允许（项目已有 Select/JsonArea/TextArea 件）；
 *  - <input>：只允许两种情况——
 *      1) 统一组件自身的实现体（TextInput / SuggestInput / LuceneInput / FieldPicker /
 *         IndexPicker / SettingsKeyInput / EndpointPathInput）——它们就是「高质量组件」本体；
 *      2) type="file" 的隐藏取值器（由按钮/标签触发，用户看不到原生控件）；
 *  - 单元格就地编辑器为显式豁免项，必须逐文件登记原因与允许数量（表格几何 + IME + Tab
 *    语义与表格强耦合，抽成通用件反而会破坏键盘导航）；登记变了就要在同一处更新原因。
 *
 * 用法：node scripts/check-native-controls.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const uiSrc = join(root, 'ui', 'src');

/** 统一组件本体的实现文件：这里的原生 input 是被包装的对象，不是「用户直接用的控件」。 */
const COMPONENT_IMPL = new Set([
  'components/TextInput.vue',
  'components/SuggestInput.vue',
  'components/LuceneInput.vue',
  'components/FieldPicker.vue',
  'components/IndexPicker.vue',
  'components/SettingsKeyInput.vue',
  'components/devtools/EndpointPathInput.vue',
]);

/** 显式豁免：文件 → { max, reason }。数量与原因同处登记，漂移即红。 */
const EXEMPT = new Map([
  ['components/ResultTable.vue', {
    max: 1,
    reason: '单元格就地编辑器：与表格几何、IME 组合、Tab 跨格导航强耦合；样式由 .rt-edit 令牌化，抽通用件会破坏键盘导航',
  }],
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.vue')) out.push(p);
  }
  return out;
}

const violations = [];
const counts = new Map();
for (const file of walk(uiSrc)) {
  const rel = relative(uiSrc, file).replace(/\\/g, '/');
  const source = readFileSync(file, 'utf8');
  const template = source.split('<script', 1)[0].replace(/<!--[\s\S]*?-->/g, '');
  if (COMPONENT_IMPL.has(rel)) continue;

  const selects = (template.match(/<select\b/g) || []).length;
  const textareas = (template.match(/<textarea\b/g) || []).length;
  for (const [tag, n] of [['select', selects], ['textarea', textareas]]) {
    if (n) violations.push(`${rel}: <${tag}> × ${n}（请用设计系统件）`);
  }

  const inputs = template.match(/<input\b[^>]*>/g) || [];
  let counted = 0;
  for (const tag of inputs) {
    if (/\btype\s*=\s*["']file["']/.test(tag)) continue; /* 隐藏取值器 */
    counted += 1;
  }
  if (counted) {
    const exempt = EXEMPT.get(rel);
    if (!exempt) {
      violations.push(`${rel}: 原生 <input> × ${counted}（禁止廉价原生控件；用 TextInput/NInput）`);
    } else if (counted > exempt.max) {
      violations.push(`${rel}: 原生 <input> × ${counted} 超出登记 ${exempt.max}（${exempt.reason}）`);
    }
    counts.set(rel, counted);
  }
}

/* 反向校验：豁免登记必须仍然命中（避免「登记了但代码早改掉」的僵尸豁免）。 */
for (const [rel, entry] of EXEMPT) {
  if (!counts.has(rel)) violations.push(`${rel}: 豁免已过期（文件里已无原生 input），请删除登记`);
}

if (violations.length) {
  console.error('[native-controls] 发现廉价原生控件 ' + violations.length + ' 处：');
  for (const v of violations) console.error('  - ' + v);
  process.exit(1);
}
const exemptDesc = [...counts.entries()].map(([k, v]) => `${k}×${v}`).join(', ') || '无';
console.log('[native-controls] OK — 无裸 select/textarea；裸 input 仅限统一组件本体、隐藏 file 选择器与登记豁免（' + exemptDesc + '）');