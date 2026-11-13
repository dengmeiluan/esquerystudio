/**
 * 四百四十三批：NDJSON 配对校验纯函数行为单测——427 内联 computed 抽为
 * utils/bulkNdjson.ndjsonLint 后的五态契约：空输入 null/正常配对 ok/
 * delete 免配对/行数不匹配 warn/非法 JSON 行 warn（优先于配对判断）。
 */
import { describe, it, expect } from 'vitest';
import { ndjsonLint } from '../bulkNdjson';

const act = (op: string, id = '1') => JSON.stringify({ [op]: { _id: id } });
const doc = (n = 1) => JSON.stringify({ n });

describe('ndjsonLint 行为契约（443 批）', () => {
  it('空/纯空白输入 → null（不出提示条）', () => {
    expect(ndjsonLint('')).toBeNull();
    expect(ndjsonLint('  \n \n')).toBeNull();
  });

  it('正常配对 ok；delete 行免配对', () => {
    const ok = ndjsonLint(`${act('index')}\n${doc(1)}\n${act('delete', '9')}`);
    expect(ok?.level).toBe('ok');
    expect(ok?.msg).toContain('配对正常');
    expect(ok?.msg).toContain('delete 1');
  });

  it('行数不匹配 → warn 并给出期望行数', () => {
    const warn = ndjsonLint(`${act('index')}\n${act('index')}\n${doc(1)}`);
    expect(warn?.level).toBe('warn');
    expect(warn?.msg).toContain('数量不匹配');
  });

  it('非法 JSON 行 → warn 优先提示', () => {
    const warn = ndjsonLint(`{broken\n${act('index')}\n${doc(1)}`);
    expect(warn?.level).toBe('warn');
    expect(warn?.msg).toContain('不是合法 JSON');
  });

  it('纯文档行（无动作）按配对失败处理（bulk 必须以动作行开始）', () => {
    const warn = ndjsonLint(doc(1));
    expect(warn?.level).toBe('warn');
  });
});
