/**
 * 986：DevTools 非 ADMIN 写范围预暴露（与后端 raw 数据面白名单同口径）。
 * 只读请求始终可执行；系统管理写/别名/快照/模板/脚本必须在客户端就显示为不可执行。
 */
import { describe, it, expect } from 'vitest';
import { nonAdminDataPlaneWriteAllowed as ok } from '../utils/devtoolsScope';

describe('DevTools 非 ADMIN 数据面白名单', () => {
  it('检索/文档/批量/SQL 数据面写放行', () => {
    expect(ok('POST', '/_bulk')).toBe(true);
    expect(ok('POST', '/_msearch')).toBe(true);
    expect(ok('POST', '/_mget')).toBe(true);
    expect(ok('POST', '/_sql')).toBe(true);
    expect(ok('POST', '/_sql/close')).toBe(true);
    expect(ok('POST', '/logs/_doc/1')).toBe(true);
    expect(ok('PUT', '/logs/_doc/1')).toBe(true);
    expect(ok('POST', '/logs/_update/1')).toBe(true);
    expect(ok('POST', '/logs/_delete_by_query')).toBe(true);
    /* 1005：_cat 索引目录必须 format=json（服务端靠它做行级过滤），HEAD 同口径 */
    expect(ok('HEAD', '/_cat/indices?format=json')).toBe(true);
    expect(ok('HEAD', '/_cat/indices')).toBe(false);
  });

  it('系统管理/别名/快照/模板/脚本等写拒绝', () => {
    expect(ok('PUT', '/_cluster/settings')).toBe(false);
    expect(ok('POST', '/_aliases')).toBe(false);
    expect(ok('POST', '/_snapshot/r/s/_restore')).toBe(false);
    expect(ok('PUT', '/_index_template/t')).toBe(false);
    expect(ok('PUT', '/_scripts/x')).toBe(false);
    expect(ok('POST', '/_security/user/x')).toBe(false);
    expect(ok('POST', '/_reindex')).toBe(false);
    expect(ok('POST', '/logs/_mapping')).toBe(false);
    expect(ok('POST', '/logs/_alias/a')).toBe(false);
    expect(ok('DELETE', '/logs')).toBe(false);
    expect(ok('POST', '/logs/_close')).toBe(false);
    expect(ok('POST', '/_nodes/reload_secure_settings')).toBe(false);
  });

  /* 988：根级 PIT/scroll 按方法收口——POST 开全集群 PIT/续读 scroll 等价全量读，
     与后端 guardRawGuarded 987 口径一致；限定索引的 POST /logs/_pit 仍走索引级白名单。 */
  it('根级 PIT 与 scroll 仅 DELETE 放行（988）', () => {
    expect(ok('POST', '/_pit')).toBe(false);
    expect(ok('DELETE', '/_pit')).toBe(true);
    expect(ok('POST', '/_search/scroll')).toBe(false);
    expect(ok('DELETE', '/_search/scroll')).toBe(true);
    expect(ok('POST', '/logs/_pit')).toBe(true);
  });

  /* 992：系统读拒绝清单镜像（后端 guardRawSystemRead/RAW_SYSTEM_READ_DENY 同源）——
     非 ADMIN 的系统管理读在客户端即禁用，不再亮钮后端 403（所见即所得）。 */
  it('系统管理读在客户端即禁用（992 读侧镜像）', () => {
    expect(ok('GET', '/_cluster/settings')).toBe(false); /* 986 旧锁随迁：读门从「不拦读」升为镜像后端清单 */
    expect(ok('GET', '/_security/user')).toBe(false);
    expect(ok('GET', '/_nodes/stats')).toBe(false);
    expect(ok('GET', '/_tasks')).toBe(false);
    expect(ok('GET', '/_snapshot')).toBe(false);
    expect(ok('GET', '/_cat/nodes?v')).toBe(false);
    expect(ok('GET', '/_aliases')).toBe(false);
    expect(ok('GET', '/_ilm/policy/x')).toBe(false); /* 段前缀：deny 后跟新段同拒 */
    expect(ok('GET', '/_search/scroll?scroll=1m')).toBe(false);
    expect(ok('GET', '/_security/_authenticate')).toBe(true); /* 后端同款特例：客户端自省 */
    expect(ok('GET', '/logs/_search')).toBe(true); /* 索引级读不受限 */
    expect(ok('GET', '/_cat/indices?format=json&h=index')).toBe(true); /* 行过滤族不在清单 */
    expect(ok('GET', '/logs/_refresh')).toBe(false); /* 索引级 mutating GET 镜像 */
    expect(ok('GET', '/logs/_search/scroll')).toBe(true); /* 索引级 scroll 读不在镜像面（后端按 id 判） */
    expect(ok('OPTIONS', '/logs/_search')).toBe(false); /* UI 外方法按后端白名单拒（L-6） */
  });

  it('路径规范化对齐后端 canonicalRawPath（992）', () => {
    expect(ok('POST', '/_bulk/')).toBe(true); /* 尾斜杠折叠 */
    expect(ok('POST', '//_bulk')).toBe(true); /* 双斜杠折叠 */
    expect(ok('POST', '/_%73ql/close')).toBe(true); /* 段内百分号编码解码后走 _sql 白名单 */
    expect(ok('POST', '/logs/./_doc/1')).toBe(true); /* `.` 段折叠 */
    expect(ok('GET', '/_%73ecurity/user')).toBe(false); /* 解码后的系统读同样被镜像拦 */
    expect(ok('POST', '/_bu%6Ck')).toBe(true); /* 段内编码解码后命中白名单 */
  });
});
