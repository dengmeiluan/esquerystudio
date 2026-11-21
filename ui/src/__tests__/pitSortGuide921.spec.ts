/**
 * PIT 拉取 _shard_doc 400 指引的可执行性契约——部分 ES 版本（7.10.x 形态，QA 集群实测）
 * 对 body pit 显式 _shard_doc 排序回 400 No mapping found，catch 臂给出可行动指引。
 * 两约着床：
 * ① 请求形态必须保持 canonical（sort 恒显式携带，空档回退 _shard_doc 字面）——实测省略
 *    sort 键的「绕行」会让 hits 丢排序值，search_after 断链，拉取循环原地重拉同批文档
 *    （缓冲全是重复），故省略形态禁止回潮；
 * ② 指引必须真实可达——旧措辞「清空 sort field 后重新拉取」是死循环（清空后仍回退
 *    _shard_doc 显式形态，同一 400），指引改为「选一个可排序字段」并实测该路径分页推进。
 * 锁定（静态）：canonical sort 形态在场；死循环措辞退役；catch 甄别与 warning 通道守恒
 * （pitShardDocHint 家族延续）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/PitScrollView.vue'), 'utf-8');

describe('PIT _shard_doc 400 指引可执行性', () => {
  it('请求形态 canonical：sort 恒显式（空档回退 _shard_doc），省略绕行形态不回潮', () => {
    /* 1439：sort 改读会话快照（sessionSortField/sessionSortOrder）——形态仍是
       恒显式 + 空档回退 _shard_doc，省略 sort 的绕行形态同样禁止 */
    expect(src).toMatch(/\[\{ \[sessionSortField\.value \|\| '_shard_doc'\]: \{ order: sessionSortOrder\.value \} \}\]/);
    expect(src, '省略 sort 的绕行形态（hits 丢排序值断 search_after）禁止回潮')
      .not.toMatch(/sortField\.value\.trim\(\) !== '_shard_doc'\) body\.sort/);
  });

  it('指引真实可达：指向选可排序字段，死循环措辞退役', () => {
    expect(src).toMatch(/在「sort field」选一个可排序字段（date\/keyword 等）后重新拉取/);
    expect(src, '清空档位的死循环措辞退役（清空后仍回退 _shard_doc 同一 400）')
      .not.toMatch(/清空「sort field」后重新拉取/);
    expect(src).toMatch(/msg\.includes\('_shard_doc'\) && msg\.includes\('No mapping found'\)/);
    expect(src).toMatch(/store\.notify\('warning', tip\)/);
  });
});
