/**
 * 三百一十四批：DevTools「复制为代码」下拉（codegen 既有 toJs/toPython 挂上工具条）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toJs, toPython } from '../utils/codegen';

const v = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

describe('复制为代码（314 批）', () => {
  it('下拉接线+copyAsCode 分发', () => {
    /* 原生 select 升档 NSelect（W3b）——option 字面迁 CODEGEN_OPTS 常量，锁面随迁源码锁 */
    expect(v).toContain("label: 'JavaScript (fetch)', value: 'js'");
    expect(v).toContain("label: 'Python (requests)', value: 'python'");
    expect(v).toMatch(/function copyAsCode\(kind: string\)/);
    expect(v).toContain("import { toJs, toPython } from '../utils/codegen';");
  });
  it('codegen 纯函数回归（JS/Python 含方法与路径）', () => {
    expect(toJs('POST', '/idx/_search', '{"size":1}')).toContain('fetch("http://localhost:9200/idx/_search"');
    expect(toPython('GET', '/idx/_doc/1')).toContain('"http://localhost:9200/idx/_doc/1"');
  });
});
