import { describe, it, expect } from 'vitest';
import { friendlyEsError, isBenignEsError } from '../esError';

/* R85：错误友好化契约锁——通知是用户遇到故障时唯一的信息来源，
   「Failed to fetch」这类浏览器原生文案零信息量，翻译与上下文保留都不能回退。 */

describe('friendlyEsError 网络层错误（R85）', () => {
  it('Failed to fetch 翻译为人话并保留操作上下文前缀', () => {
    const out = friendlyEsError('inspect 失败: Failed to fetch');
    expect(out).toContain('inspect 失败：');
    expect(out).toContain('网络请求失败');
    expect(out).not.toContain('Failed to fetch');
    /* R93 #86 四轮：只锁「刷新」二字挡不住指引反转——「请勿点「刷新」重试」同样含该词。
       指引的价值在于「让用户重试」，故对动作语义取值判定，并排斥反向指引。 */
    expect(out).toMatch(/稍后点「刷新」重试/);
    expect(out).not.toMatch(/请勿|不要|禁止/);
  });

  it('无前缀的裸网络错误直接翻译，JS 异常名噪音不当上下文', () => {
    expect(friendlyEsError('Failed to fetch')).toContain('网络请求失败');
    expect(friendlyEsError('TypeError: Failed to fetch').startsWith('网络请求失败')).toBe(true);
  });

  it('超长/含 JSON 的前缀不当作操作上下文拼回', () => {
    const out = friendlyEsError('{"error":"whatever"} Failed to fetch');
    expect(out.startsWith('网络请求失败')).toBe(true);
  });
});

describe('friendlyEsError ES 错误（既有行为不回退）', () => {
  it('已知异常翻译并附 reason 短句', () => {
    const raw = '保存失败: {"error":{"root_cause":[{"type":"index_not_found_exception","reason":"no such index [foo]"}]}}';
    const out = friendlyEsError(raw);
    expect(out).toContain('索引不存在');
    expect(out).toContain('no such index [foo]');
    /* R93 #86 四轮：同类不同因——把「索引不存在」解读成权限问题时，
       「索引不存在」子串仍在，用户却被指去找管理员开权限。故排斥异因措辞。 */
    expect(out).not.toMatch(/权限|授权|账号|管理员/);
  });

  it('未知错误提取 reason，无 reason 原样限长', () => {
    expect(friendlyEsError('{"error":{"reason":"boom detail"}}')).toBe('boom detail');
    expect(friendlyEsError('plain message')).toBe('plain message');
    expect(friendlyEsError('x'.repeat(300)).length).toBeLessThanOrEqual(262);
  });

  it('isBenignEsError 只认无害健康态', () => {
    expect(isBenignEsError('unable to find any unassigned shards to explain')).toBe(true);
    expect(isBenignEsError('Failed to fetch')).toBe(false);
  });

  /* R102：用户截图报「诊断失败: ResponseException: ... status line [HTTP/1.1 404 Not Found]」
     整坨原文摔到界面上。实测（ES 7.10.1）_explain 打不存在的 doc 返回
     404 + 正常 body（无 error 字段），所以 KNOWN 里的 *_exception 全不命中、
     extractReason 也取不到 reason，最终落到「原样限长」那条分支。 */
  describe('R102 _explain 文档不存在', () => {
    /** 取自真实响应：ResponseException 信封 + 404 + 无 error 字段的 body */
    const RAW_404 = '诊断失败: ResponseException: method [POST], host [http://10.68.24.5:9200], '
      + 'URI [/qa_sentiment_news_published_adhoc_20260730155649/_explain/1], '
      + 'status line [HTTP/1.1 404 Not Found] '
      + '{"_index":"qa_sentiment_news_published_adhoc_20260730155649","_type":"_doc","_id":"1","matched":false}';

    it('说清可操作事实：哪个 id、哪个索引、下一步怎么办', () => {
      const out = friendlyEsError(RAW_404);

      expect(out).toContain('_id="1"');
      expect(out).toContain('qa_sentiment_news_published_adhoc_20260730155649');
      expect(out).toContain('不存在');
      /* 判据不能只看「含某词」：必须证明原始 Java 异常信封没再摔出来 */
      expect(out).not.toContain('ResponseException');
      expect(out).not.toContain('status line');
      /* 顺带：内网集群 host:port 不该出现在这条用户可读消息里 */
      expect(out).not.toContain('10.68.24.5');
    });

    it('不误判：HTTP 200 的 matched:false 是正常「未命中」，不许当错误', () => {
      const ok200 = '{"_index":"idx","_type":"_doc","_id":"7","matched":false}';
      const out = friendlyEsError(ok200);

      expect(out).not.toContain('不存在');
    });

    it('不误判：非 _explain 路径的 404 不走这条规则', () => {
      const other = 'ResponseException: URI [/idx/_search], status line [HTTP/1.1 404 Not Found] '
        + '{"_id":"1","matched":false}';
      const out = friendlyEsError(other);

      expect(out).not.toContain('_explain 只能解释');
    });
  });

  /* 五百二十七批：KNOWN 三场景扩容契约锁。三个用例都取「包装型异常 + 叶子原因同串共存」
     的真实形态（esError.ts 位置立法：叶子匹配串列在包装型之前），并断言泛文案
     （查询执行失败/DSL 解析失败）不被返回——用户 DSL 根本没有错时不得误导去查语法。 */
  describe('五百二十七批 KNOWN 扩容（索引关闭 / PIT 过期 / 字段类型不识别）', () => {
    it('index_closed_exception → 索引已关闭指引（不被 search_phase 包装文案吞掉）', () => {
      const raw = '查询失败: {"error":{"root_cause":[{"type":"index_closed_exception","reason":"closed"}]}}';
      const out = friendlyEsError(raw);
      expect(out).toContain('索引已关闭');
      expect(out).toContain('开启该索引');
      expect(out).not.toContain('查询执行失败');
    });

    it('search_context_missing_exception → PIT 已过期指引重建（不被泛文案吞掉）', () => {
      const raw = '翻页失败: SearchPhaseExecutionException[...]; {"error":{"root_cause":'
        + '[{"type":"search_context_missing_exception","reason":"pit id [xyz] not found"}]}}';
      const out = friendlyEsError(raw);
      expect(out).toContain('PIT 已过期');
      expect(out).toContain('重新创建 PIT');
      expect(out).not.toContain('查询执行失败');
    });

    it('No handler for type → 字段类型拼写指引（specific 压过 mapper_parsing/search_phase 泛文案）', () => {
      const raw = '保存失败: {"error":{"root_cause":[{"type":"mapper_parsing_exception",'
        + '"reason":"Failed to parse mapping: No handler for type [flaot]"}]}}';
      const out = friendlyEsError(raw);
      expect(out).toContain('mapping 字段类型不识别');
      expect(out).toContain('flaot');
      expect(out).not.toContain('DSL 解析失败');
      expect(out).not.toContain('查询执行失败');
    });
  });
});

/* ═══ 1150：包装型异常下潜取叶子原因 ═══
   此前 search_phase_execution_exception 只有 reason「all shards failed」时，
   界面就显示这句无信息量的话；真实原因常在 caused_by / 后续 root_cause 里。 */
describe('1150 错误原因下潜（all shards failed 不再当原因）', () => {
  const wrapperOnly = '{"error":{"root_cause":[{"type":"search_phase_execution_exception","reason":"all shards failed"}],"type":"search_phase_execution_exception","reason":"all shards failed"},"status":400}';
  it('只有包装词时给可行动指引（不再把 all shards failed 当原因）', () => {
    const msg = friendlyEsError(wrapperOnly);
    expect(msg).toContain('查询执行失败');
    expect(msg).toContain('原始 IO');
    expect(msg).not.toContain('all shards failed');
  });
  it('caused_by 里的叶子原因被带出来', () => {
    const raw = '{"error":{"root_cause":[{"type":"search_phase_execution_exception","reason":"all shards failed"}],"type":"search_phase_execution_exception","reason":"all shards failed","caused_by":{"type":"illegal_argument_exception","reason":"Fielddata is disabled on text fields by default."}},"status":400}';
    expect(friendlyEsError(raw)).toContain('Fielddata is disabled');
  });
  it('root_cause 第二项是叶子时也取到（首项为包装词）', () => {
    const raw = '{"error":{"root_cause":[{"reason":"all shards failed"},{"type":"query_shard_exception","reason":"Cannot search on field [status] since it is not indexed."}],"type":"search_phase_execution_exception","reason":"all shards failed"},"status":400}';
    expect(friendlyEsError(raw)).toContain('Cannot search on field [status]');
  });
});
