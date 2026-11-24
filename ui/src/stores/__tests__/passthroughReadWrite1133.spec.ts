/**
 * 1133：DevTools / REST 透传按内层 ES 请求分读、写两档（前端侧）。
 *
 * 缺陷现场（产线 1.0.68）：x1 在 PROD 连接上只有 conn:{id}:devtools / conn:{id}:rest 读键，
 * 前端却按 admin 写档判定 → 执行钮整块灰掉、只读请求也发不出。
 * 「有读权限就允许只读请求、有写权限才允许写」必须在能力层成立，否则 UI 与后端不同源。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../auth';
import { isReadonlyEsRequest, isPassthroughPath } from '../../utils/passthroughScope';

const DEVTOOLS = '/internal/es/index/cluster/devtools/execute';
const RAW = '/internal/es/index/cluster/raw';

function withGrants(grants: string[]) {
  const a = useAuthStore();
  a.beginProbe();
  a.me = {
    username: 'deng_test_x1', role: 'VIEWER', fallback: false, delegated: true,
    grantedPages: grants,
  } as any;
  return a;
}

const readOnlyOnProd = () => withGrants(['conn:c1:devtools', 'conn:c1:rest']);
const writerOnProd = () => withGrants([
  'conn:c1:devtools', 'conn:c1:w:devtools', 'conn:c1:rest', 'conn:c1:w:rest',
]);

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); });

describe('1133 内层只读判定与后端同口径', () => {
  it('GET/HEAD/OPTIONS 与查询类 POST 是只读', () => {
    expect(isReadonlyEsRequest('GET', '/_cluster/health')).toBe(true);
    expect(isReadonlyEsRequest('HEAD', '/idx')).toBe(true);
    expect(isReadonlyEsRequest('POST', '/idx/_search')).toBe(true);
    expect(isReadonlyEsRequest('POST', '/_msearch')).toBe(true);
    expect(isReadonlyEsRequest('POST', '/_sql')).toBe(true);
    expect(isReadonlyEsRequest('POST', '/_cat/indices?format=json')).toBe(true);
  });

  it('写方法与写端点一律判写（fail-closed）', () => {
    expect(isReadonlyEsRequest('PUT', '/idx')).toBe(false);
    expect(isReadonlyEsRequest('DELETE', '/idx')).toBe(false);
    expect(isReadonlyEsRequest('POST', '/_bulk')).toBe(false);
    expect(isReadonlyEsRequest('POST', '/_reindex')).toBe(false);
    expect(isReadonlyEsRequest('', '/_search')).toBe(false);
    expect(isReadonlyEsRequest('POST', '')).toBe(false);
  });

  it('透传端点识别', () => {
    expect(isPassthroughPath(DEVTOOLS)).toBe(true);
    expect(isPassthroughPath(RAW)).toBe(true);
    expect(isPassthroughPath(RAW + '?x=1')).toBe(true);
    expect(isPassthroughPath('/internal/es/index/cluster/search-dsl')).toBe(false);
  });
});

describe('1133 只读身份：读键可执行只读请求，写请求仍被拒', () => {
  it('读键 → 透传读能力为真（这正是被误收的那一半）', () => {
    const a = readOnlyOnProd();
    expect(a.canPassthroughRead(DEVTOOLS, 'c1')).toBe(true);
    expect(a.canPassthroughRead(RAW, 'c1')).toBe(true);
  });

  it('读键 → 透传写能力为假', () => {
    const a = readOnlyOnProd();
    expect(a.canPassthroughWrite(DEVTOOLS, 'c1')).toBe(false);
    expect(a.canPassthroughWrite(RAW, 'c1')).toBe(false);
  });

  it('内层 GET/_search 可执行，内层 PUT/_bulk 不可执行', () => {
    const a = readOnlyOnProd();
    expect(a.canExecutePassthrough('GET', '/_cluster/health', DEVTOOLS, 'c1')).toBe(true);
    expect(a.canExecutePassthrough('POST', '/idx/_search', DEVTOOLS, 'c1')).toBe(true);
    expect(a.canExecutePassthrough('PUT', '/new-index', DEVTOOLS, 'c1')).toBe(false);
    expect(a.canExecutePassthrough('POST', '/_bulk', DEVTOOLS, 'c1')).toBe(false);
    expect(a.canExecutePassthrough('DELETE', '/idx', RAW, 'c1')).toBe(false);
  });

  it('API 写门对透传端点不再整段拦死（否则只读请求发不出）', () => {
    const a = readOnlyOnProd();
    expect(a.canEmitWrite('POST', DEVTOOLS, 'c1')).toBe(true);
    expect(a.canEmitWrite('POST', RAW, 'c1')).toBe(true);
  });
});

describe('1133 写键身份：读写都可执行', () => {
  it('写键 → 读与写能力都为真', () => {
    const a = writerOnProd();
    expect(a.canPassthroughRead(DEVTOOLS, 'c1')).toBe(true);
    expect(a.canPassthroughWrite(DEVTOOLS, 'c1')).toBe(true);
    expect(a.canExecutePassthrough('PUT', '/new-index', DEVTOOLS, 'c1')).toBe(true);
    expect(a.canExecutePassthrough('POST', '/_bulk', RAW, 'c1')).toBe(true);
  });
});

describe('1133 零权限/无关写键：连只读也进不去', () => {
  it('零授权 → 读写都为假', () => {
    const a = withGrants([]);
    expect(a.canPassthroughRead(DEVTOOLS, 'c1')).toBe(false);
    expect(a.canPassthroughWrite(DEVTOOLS, 'c1')).toBe(false);
    expect(a.canEmitWrite('POST', DEVTOOLS, 'c1')).toBe(false);
  });

  it('只有别的页写键（indices）→ 透传仍为假', () => {
    const a = withGrants(['conn:c1:w:indices']);
    expect(a.canPassthroughRead(DEVTOOLS, 'c1')).toBe(false);
    expect(a.canPassthroughWrite(DEVTOOLS, 'c1')).toBe(false);
  });
});

describe('1133 env 模板：读键不得成为环境封顶的旁路', () => {
  it('PROD 模板排除 devtools 时只读能力也为假', () => {
    const a = readOnlyOnProd();
    a.me = {
      username: 'deng_test_x1', role: 'VIEWER', fallback: false, delegated: true,
      grantedPages: ['conn:c1:devtools', 'conn:c1:rest'],
      envPages: { PROD: ['indices'] },
    } as any;
    a.setConnEnvs([{ id: 'c1', env: 'PROD' }]);
    expect(a.canPassthroughRead(DEVTOOLS, 'c1')).toBe(false);
    expect(a.canPassthroughWrite(DEVTOOLS, 'c1')).toBe(false);
  });
});
