/**
 * R130 四十一批：PIT 拉取 _shard_doc 兼容性提示守卫（源码静态锁定）。
 * 背景：控制集群 ES（10.68.24.5:9200）对 body pit + 显式 _shard_doc 排序返回
 * 400 No mapping found（版本限制）——PitScrollView 拉取 catch 需对该错误给出
 * 「清空 sort field 重试」的可行动指引，而非裸 toast。
 * 不挂组件原因：拉取循环依赖真实 ES 响应与 setInterval 轮询，静态锁定+真机已验。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(__dirname, '../views/PitScrollView.vue'), 'utf-8');

describe('PIT _shard_doc 兼容性提示（四十一批）', () => {
  it('catch 分支识别 _shard_doc + No mapping found 并给 warn 指引', () => {
    expect(src.includes("msg.includes('_shard_doc') && msg.includes('No mapping found')")).toBe(true);
    /* 指引措辞随批更新：旧「清空 sort field」是死循环（清空后仍回退 _shard_doc 同一 400），
       改指「选可排序字段」——实测该路径分页推进（pitSortGuide921 锁定） */
    expect(src.includes('在「sort field」选一个可排序字段（date/keyword 等）后重新拉取')).toBe(true);
    expect(src.includes("store.notify('warning', tip)")).toBe(true);
  });

  it('非该错误的拉取失败仍走 error 通道（不误伤）', () => {
    /* 五百六十批同步更新：error 臂合并 friendlyEsError 单源翻译（前缀逐字保留，语义=非 _shard_doc
       错误仍走 error 通道不变）；warning 指引臂零触 */
    expect(src.includes("store.notify('error', '拉取失败：' + friendlyEsError(msg))")).toBe(true);
  });
});
