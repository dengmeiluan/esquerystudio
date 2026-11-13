<template>
  <div class="sq-page">
    <!-- 整页无页头合并 PageHeader 统一件（同族 SqlBridge/PainlessLab 口径），动作按钮组入 #actions 槽 -->
    <PageHeader :icon="Database" title="SQL 控制台" subtitle="_sql 查询 · translate 转 DSL · cursor 深分页">
      <template #actions>
        <!-- 页头挂只读当前索引 chip（AnalysisSettingsView 范式；补全字段源/示例
 FROM 静默消费 store.pickedIdx 却无可视锚，此处补齐；空索引时组件自身不渲染） -->
        <CurrentIdxChip />
        <button class="btn ghost sm" @click="loadSample">
          <BookOpen :size="12" /> 示例
        </button>
        <button class="btn ghost sm" @click="doSchema" :disabled="!indexOf() || busy" title="探测当前索引字段，提前提醒哪些会引发 SQL 报错">
          <ShieldAlert :size="12" /> 字段体检
        </button>
        <!-- 1328：此前这两个钮既无 title 也无 aria-label——页头一排里其余三个都有说明，
             只有它俩要用户猜「转 DSL 是干什么的」「收藏存到哪」。补上，并让禁用原因可读
             （禁用态浏览器不弹 title，所以文案本身要写清前置条件）。 -->
        <button class="btn ghost sm" @click="doTranslate" :disabled="!sql.trim() || busy"
          :title="busy ? '执行中，完成后再转换' : (!sql.trim() ? '先写一条 SQL，再用它翻译成等价的 DSL 请求体' : '把当前 SQL 翻译成等价的 DSL 请求体（_sql/translate），可带到 DSL 页继续改')">
          <Braces :size="12" /> 转 DSL
        </button>
        <button class="btn ghost sm" @click="doFav" :disabled="!sql.trim()"
          :title="!sql.trim() ? '先写一条 SQL，再收藏为常用查询' : '收藏当前 SQL（可在「收藏夹」里一键回放）'">
          <Star :size="12" /> 收藏
        </button>
        <!-- 页内历史入口（四视图统一，DslQueryView 弹窗范式）——doRun 一直在
 push mode=sql 历史（此前页内零出口 -->
        <button class="btn ghost sm" data-test="open-hist" @click="histOpen = true" title="查询历史"><History :size="12" /> 历史</button>
        <!-- W10：title 随态——空 SQL 保持禁用原因可发现性（契约），
        有 SQL 时提示快捷键（execHint 单一出处，⌘/Ctrl 不再写死）。
        「执行中」读秒标签只随执行链（qr.running）：字段体检/转 DSL/分页等旁路操作
        共享 busy 但不走 useQueryRun，误显读秒会把陈旧耗时挂到无关操作头上 -->
        <button class="btn primary sm" :title="sql.trim() ? (selScope ? '仅执行选中的 ' + selScope.lines + ' 行（' + execHint + '）；清除选区后执行整篇' : (multiStmt ? '仅执行光标所在语句（第 ' + cursorStmtNo + ' 条 / 共 ' + stmtScopes.length + ' 条；' + execHint + '）；选中一段可只跑选段' : '执行（' + execHint + '）')) : '请输入 SQL 语句'" @click="doRun" :disabled="!sql.trim() || busy">
          <Play :size="12" /> {{ qr.running.value ? '执行中（' + (qr.elapsedMs.value / 1000).toFixed(1) + 's）…' : (selScope ? '执行选段' : (multiStmt ? '执行当前语句' : '执行')) }} <span class="kbd inline">{{ execHint }}</span>
        </button>
        <!-- 取消只对执行链有意义（qr.begin 签发的 signal）；旁路 busy 期间出现死取消钮=示能谎言 -->
        <button v-if="qr.running.value" class="btn sm" @click="qr.cancel()"><XCircle :size="12" /> 取消</button>
      </template>
    </PageHeader>

    <div class="sq-grid" :class="{ 'rail-off': !railOpen, 'editor-collapsed': editorCollapsed }" :style="{ '--sq-rail-w': railW + 'px' }">      <!-- sq-editor 编辑器壳退役（约定③内容直贴，Kibana 同语言）——分界由
 sq-card-hd 既有 border-bottom 承接；Monaco 防撑破 overflow 承接保留（CSS 侧） -->
      <div class="sq-editor" :class="{ collapsed: editorCollapsed }">
        <div class="sq-card-hd">
          <span>SQL</span>
          <div class="sq-card-hd-r">
            <!-- 展开/收起双钮合一——原「工具行模板展开钮（v-if=!railOpen）+ 侧栏头收起钮」
 分置两处的平铺双钮反模式，合并为工具行常驻单 toggle（data-sq-rail-toggle）：
 同钮随态换文案 模板/收起 + chevron 随态旋转（XmigrateView 页头单钮先例同语言）；
 railOpen usePref 状态机零改动（sqlConsoleAdjustW2 锚同步更新） -->
            <button type="button" class="btn ghost xs" data-sq-editor-toggle :aria-expanded="!editorCollapsed"
              :aria-label="editorCollapsed ? '展开 SQL 编辑器' : '收起 SQL 编辑器'"
              :title="editorCollapsed ? '展开 SQL 编辑器' : '收起 SQL 编辑器（给结果表让位）'"
              @click="editorCollapsed = !editorCollapsed">
              <ChevronUp v-if="editorCollapsed" :size="11" /><ChevronDown v-else :size="11" />
              编辑器
            </button>
            <button ref="toggleEl" class="btn ghost xs" data-sq-rail-toggle :title="railOpen ? '收起模板侧栏' : '展开模板侧栏'" @click="railOpen = !railOpen">
              <ChevronRight :size="11" :style="{ transform: railOpen ? '' : 'rotate(180deg)', transition: 'transform var(--tr)' }" />
              {{ railOpen ? '收起' : '模板' }}
            </button>
            <!-- 1439：预览折叠时不再常驻一行「DSL 预览」标题条——展开入口收进 SQL 工具行，
                 结果表直接上移（此前折叠态也占 45px，表格头被推到页面中部，用户反馈「表头横在中间」）。 -->
            <button v-if="dslPreview" type="button" class="btn ghost xs" data-test="sql-preview-toggle"
              :aria-expanded="previewOpen" aria-controls="sq-dsl-preview"
              :title="previewOpen ? '收起 DSL 预览（给结果表让位）' : '展开 DSL 预览（_sql/translate）'"
              @click="previewOpen = !previewOpen">
              <Braces :size="11" /> {{ previewOpen ? '收起预览' : 'DSL 预览' }}
            </button>
            <label class="sq-fs">
              fetch_size
              <input type="number" v-model.number="fetchSize" min="1" max="10000" class="sq-fs-i" />
            </label>
            <!-- 1055：time_zone——影响 CURRENT_DATE/NOW/DATE_TRUNC 等日期函数与时间列返回格式；
                 cursor 续页 ES 只认 columnar/time_zone，翻页自动沿用同一时区 -->
            <label class="sq-fs" title="SQL 时区：影响 CURRENT_DATE/NOW/DATE_TRUNC 等日期函数与时间列格式；cursor 翻页自动沿用">
              time_zone
              <select v-model="timeZone" class="sq-fs-i sq-tz-i" aria-label="SQL 时区">
                <option value="">UTC（集群默认）</option>
                <option value="Asia/Shanghai">Asia/Shanghai</option>
                <option value="Asia/Hong_Kong">Asia/Hong_Kong</option>
                <option value="Asia/Tokyo">Asia/Tokyo</option>
                <option value="Europe/London">Europe/London</option>
                <option value="America/New_York">America/New_York</option>
              </select>
            </label>
            <!-- 1066：page_timeout——单页计算超时（ES 默认 1m）；保护高开销查询。
                 注意：带 cursor 续页时 ES 只认 columnar/time_zone，此参数会被忽略 -->
            <label class="sq-fs" title="单页查询超时 page_timeout（ES 默认 1m）；仅首查生效，cursor 续页 ES 会忽略">
              page_timeout
              <select v-model="pageTimeout" class="sq-fs-i sq-to-i" aria-label="SQL 单页超时">
                <option value="">默认</option>
                <option value="10s">10s</option>
                <option value="30s">30s</option>
                <option value="1m">1m</option>
                <option value="5m">5m</option>
              </select>
            </label>
            <!-- 1070：位置参数——SQL 用 ? 占位，params 数组按顺序绑定；仅首查生效
                 （ES cursor 续页只认 columnar/time_zone，不携带 params） -->
            <button type="button" class="btn ghost xs sq-param-btn" :class="{ on: paramOpen || paramCount }"
              :aria-expanded="paramOpen" aria-controls="sq-param-bar"
              title="SQL 参数：SQL 里用 ? 占位，按顺序填 JSON 数组（如 [&quot;宁德时代&quot;, 10]）；cursor 续页不携带参数"
              @click="paramOpen = !paramOpen">
              参数<span v-if="paramCount" class="sq-param-badge">{{ paramCount }}</span>
            </button>
            <label class="sq-fs sq-tog" title="开启后、SQL 对数组字段 SELECT 不报错（取首值），自动注入 field_multi_value_leniency=true">
              <input type="checkbox" v-model="lenient" />
              <span>宽容模式</span>
            </label>
            <!-- 1075：columnar 列式返回（ES cursor 续页只认 columnar/time_zone）；表格仍按行展示 -->
            <label class="sq-fs sq-tog" title="列式返回（columnar）：大结果/图表/导出更稳；cursor 续页自动沿用同一形态。表格仍按行展示">
              <input type="checkbox" v-model="columnar" />
              <span>列式</span>
            </label>
          </div>
        </div>
        <!-- 1080：字段源换源提示条——只在 FROM 与顶栏选中不一致时出现一行，
             解释补全/体检/列名纠错为何按另一索引匹配（独立行，不挤占工具行） -->
        <div v-if="fromMismatch" class="sq-from-note" role="note">
          <span class="chip xs static" data-test="sql-from-chip"
            :title="`字段补全/体检/列名纠错跟随 FROM「${effectiveSqlIndex}」；执行成功后顶栏切到该索引（当前「${store.pickedIdx}」）`">
            FROM {{ effectiveSqlIndex }}
          </span>
          <span>字段补全 / 字段体检 / 列名纠错按此索引匹配；执行成功后顶栏索引跟随 FROM（别名/未知索引除外，当前停在 <b>{{ store.pickedIdx }}</b>）</span>
        </div>
        <!-- P0-3：SQL 静态 lint 划线通道挂点（banner 保留双通道，见 script queueSqlLintMarkers） -->
        <MonacoEditor v-if="!editorCollapsed" ref="sqlMonaco" v-model="sql" language="sql" height="100%" @execute="doRun" @selection="selScope = $event" @cursor="cursorPos = $event" />
        <!-- 1070：参数条（紧凑单行，JSON 数组；实时显示占位符/参数匹配情况，不阻塞合法查询） -->
        <div v-if="paramOpen" id="sq-param-bar" class="sq-param-bar" role="group" aria-label="SQL 位置参数">
          <span class="sq-param-lb mono">params</span>
          <input v-model="paramsText" class="inp sq-param-i mono" spellcheck="false" autocomplete="off"
            placeholder='["宁德时代", "2026-01-01", 10]'
            aria-label="SQL 参数（JSON 数组，按 ? 出现顺序）"
            @keydown.esc.prevent="paramsText = ''" />
          <span class="sq-param-stat" :class="paramStat.tone">{{ paramStat.text }}</span>
          <button type="button" class="btn ghost xs" title="清空参数" @click="paramsText = ''">清空</button>
        </div>
        <!-- P0-3：SQL 静态体检提示条（utils/sqlLint 纯函数，随输入防抖重估；
 零阻塞不拦执行——lint 只提示，执行门仍是既有 doRun；自动高度不进编辑器高度链）。
 .sq-sql-lint 私造形态改用 theme.css .lint-bar 单源（sq-sql-lint 锚并存，role 与文案逐字不动） -->
        <div v-if="sqlLintFindings.length" class="lint-bar sq-sql-lint lint-bar-warn" role="status">
          <span v-for="(f, i) in shownLintFindings" :key="i">· <button type="button" class="sq-lint-ln"
            :title="'定位到第 ' + f.line + ' 行'" @click="locateLine(f.line)">第 {{ f.line }} 行</button>：{{ f.message }} — {{ f.suggestion }}</span>
          <!-- 1391：默认只列前 2 条，其余折起。3 条以上会把编辑区挤到没法改稿（1280×720 实测），
               但「看不见的问题」同样是坑——所以给一个明确的展开入口，条数一直写在按钮上。 -->
          <button v-if="sqlLintFindings.length > LINT_VISIBLE" type="button" class="btn xs sq-lint-more"
            :aria-expanded="lintExpanded" @click="lintExpanded = !lintExpanded">
            {{ lintExpanded ? '收起' : `还有 ${sqlLintFindings.length - LINT_VISIBLE} 条` }}
          </button>
        </div>
        <!-- 1050：高开销/易误读结构提示（GROUP BY 无 WHERE / SELECT * 无 LIMIT / 前置 % LIKE）
             ——只提示不拦截；可一键补 LIMIT 控制返回量（不宣称降低扫描成本）。 -->
        <div v-if="costHints.length || canExpandStar || starBlockedReason" class="lint-bar sq-cost-hint lint-bar-warn" role="status">
          <span v-for="h in costHints" :key="h.id" class="sq-cost-item">
            <b>{{ h.message }}</b> — {{ h.suggestion }}
          </span>
          <span v-if="!costHints.length && canExpandStar" class="sq-cost-item">
            <b>SELECT *</b> — 返回全部字段；可展开为字段清单，减少 payload 与歧义
          </span>
          <!-- 1105：SELECT * 一键展开为字段清单（按当前 mapping；超长截断并提示） -->
          <button v-if="canExpandStar" type="button" class="btn xs" data-test="sql-expand-star" @click="expandStar">展开字段</button>
          <!-- 1387：有 SELECT * 但 FROM 不是单一具体索引时，不给按钮也不留死胡同 -->
          <span v-else-if="starBlockedReason" class="sq-cost-item" data-test="sql-expand-star-blocked">
            <b>SELECT *</b> — {{ starBlockedReason }}
          </span>
          <button v-if="costFixLimit" type="button" class="btn xs" @click="applyCostLimit">补 LIMIT 1000</button>
        </div>
      </div>

      <!-- 模板侧栏壳降层（li:hover/键盘交互在行不在壳，wt/fv 不适用；
 分界同由 hd border-bottom 承接，与左侧编辑器行同语言对称）。
 头部「收起」钮随双钮合一退役（收起入口归工具行常驻单 toggle），宽度档钮留守 -->
      <div v-if="railOpen" ref="samplesEl" class="sq-samples">
        <div class="sq-card-hd">
          <span>常用模板</span>
          <div class="sq-card-hd-r">
            <button class="btn ghost xs" data-sq-rail-w :title="'模板栏宽度档：' + railW + 'px'" @click="cycleRailW">宽</button>
          </div>
        </div>
        <ul class="sq-tpl">
          <li v-for="t in TEMPLATES_VIEW" :key="t.k" :class="{ off: !t.ready }"
              :title="t.ready ? '插入模板并按当前 mapping 绑定字段' : '缺少 ' + t.missing.join('、') + '：先在顶栏选择有该字段的索引'"
              @click="applyTemplate(t)" role="button" tabindex="0" :aria-disabled="!t.ready"
              @keydown.enter.prevent="applyTemplate(t)" @keydown.space.prevent="applyTemplate(t)">
            <span class="sq-tpl-k">{{ t.k }}</span>
            <span class="sq-tpl-d">{{ t.desc }}<em v-if="!t.ready" class="sq-tpl-miss"> · 缺 {{ t.missing.join('、') }}</em><em v-else-if="t.binds.length" class="sq-tpl-bind" :title="'按当前 mapping 自动绑定：' + t.binds.join('、')"> · {{ t.binds.join(' · ') }}</em></span>
          </li>
        </ul>
      </div>

      <!-- DSL 预览大容器框退役（约定④，pt-sec 538 同语言）→ sq-sec border-top 分节
           1439：折叠态整段不渲染（展开入口在 SQL 工具行）——此前折叠仍占 45px 标题条，把表格头推到页面中部 -->
      <div v-if="dslPreview && previewOpen" class="sq-sec wide">
        <div class="sq-card-hd">
          <span>DSL 预览（_sql/translate）<em v-if="dslPreviewStale" class="sq-prev-stale" data-test="sql-preview-stale"
            title="SQL 已修改，预览仍是上一版——点顶部「到 DSL」重新生成">预览来自上一版 SQL</em></span>
          <div class="sq-card-hd-r">
            <button class="btn ghost xs" data-sq-code-h :title="'DSL 预览高度档：' + codeH + 'px'" @click="cycleCodeH">高</button>
            <button class="btn ghost xs" @click="gotoDsl" :disabled="!dslPreview || dslPreviewStale"
                    :title="dslPreviewStale ? '预览来自上一版 SQL——请先点顶部「到 DSL」重新生成' : '先执行 SQL 转换生成 DSL'"><ChevronRight :size="11" /> 到 DSL 页</button>
            <button class="btn ghost xs" @click="copyDsl" :disabled="dslPreviewStale"
                    :title="dslPreviewStale ? '预览来自上一版 SQL——请先重新生成' : '复制 DSL'"><Copy :size="11" /> 复制</button>
            <button class="btn ghost xs" @click="dslPreview = null; previewOpen = false">关闭</button>
          </div>
        </div>
        <!-- 裸插值 → highlightJson 范式（SynonymsManager/ClusterSettings 同款，输出已转义）；
 W2 批：封顶高度走 usePref（默认 300=原值），「高」档位钮切换记忆；1136 默认折叠让结果表吃满 -->
        <pre id="sq-dsl-preview" class="sq-code json-view" :class="{ 'sq-prev-dim': dslPreviewStale }" v-html="dslHtml" :style="{ maxHeight: codeH + 'px' }"></pre>
      </div>

      <!-- err/warn 语义卡豁免（语义边框保留约定）——sq-card 壳迁 sq-panel 语义面板，视觉零变化 -->
      <div v-if="unavailable" class="sq-panel wide sq-alert">
        <AlertCircle :size="14" />
        <div class="sq-alert-body">
          <div><b>_sql 接口不可用</b></div>
          <div class="sq-sub">当前集群未启用 SQL（OSS / 未授权）。请使用 DSL 查询面板。</div>
          <div class="sq-sub" v-if="reason">原因：{{ reason }}</div>
          <!-- 不留死胡同——自动探测其他连接档案，可用则一键切换重跑 -->
          <div class="sq-alert-acts">
            <button class="btn sm" :disabled="probing" @click="probeSqlTargets">
              {{ probing ? '探测中…' : '探测支持 SQL 的集群' }}
            </button>
            <template v-if="probed">
              <button v-for="c in sqlCapable" :key="c.id" class="btn sm pri" @click="switchAndRerun(c)">
                切到「{{ c.name }}」重跑
              </button>
              <span v-if="!sqlCapable.length" class="sq-sub">全部 {{ probedN }} 个连接均无 SQL 能力</span>
            </template>
          </div>
        </div>
      </div>

      <div v-if="schemaWarnings.length" class="sq-panel wide sq-warn">
        <ShieldAlert :size="14" />
        <div class="sq-warn-body">
          <div class="sq-warn-tt"><b>字段体检提醒</b><span class="sq-warn-cnt">{{ schemaWarnings.length }} 项风险</span></div>
          <ul class="sq-warn-list">
            <li v-for="(w, i) in schemaWarnings" :key="i">{{ w }}</li>
          </ul>
          <div class="sq-warn-hint">当遇到 <code>Arrays are not supported</code> / <code>Nested fields not supported</code>，请切到 <b>Lucene 面板</b> 或 <b>PIT 深度分页</b>（彻底无限制）。</div>
        </div>
      </div>

      <!-- 执行失败内联面板：错误全文可回看 + 一键重试（样式复用 sq-alert 自救面板体系） -->
      <div v-if="runErr" class="sq-panel wide sq-alert">
        <AlertCircle :size="14" />
        <div class="sq-alert-body">
          <!-- 标题行走 friendlyEsError 人话 + pre 换 errPreHtml v-html 全文双轨
 （含 { 走 highlightJson 着色、否则转义平文；LuceneQuery/SearchSandbox 双轨先例）。
 改用双参——errMeta(runErrObj) 旁路对象读 code/endpoint（runErr 已压串
 读不出），meta 空时输出与单参逐字节一致（errPre524 锚），字符串全文回看语义不变 -->
          <div>
            <b>SQL 执行失败</b>
            <!-- 1109：报错锚点一键定位（ES `line X:Y` 前缀）——长 SQL 不必自己数行 -->
            <button v-if="runErrPos && !runErrStale" type="button" class="sq-err-loc mono" data-test="sql-err-locate"
                    :title="'ES 报错位置' + (runErrScope ? (runErrScope.kind === 'statement' ? '（语句内，已换算到全文）' : '（选段内，已换算到全文）') : '') + '：第 ' + runErrPos.line + ' 行第 ' + runErrPos.column + ' 列——点击定位到该处'"
                    @click="locateRunErr">定位 {{ runErrPos.line }}:{{ runErrPos.column }}</button>
            <span v-if="runErrScope && runErrPos && !runErrStale" class="sq-err-stale" data-test="sql-err-scope">{{ runErrScope.kind === 'statement' ? '语句内报错，行号已换算到全文' : '选段内报错，行号已换算到全文' }}</span>
            <span v-if="runErrStale" class="sq-err-stale" data-test="sql-err-stale">错误来自上一版 SQL</span>
            · {{ friendlyRunErr }}
          </div>
          <pre class="sq-err-body" v-html="errPreHtml(runErr, errMeta(runErrObj))"></pre>
          <!-- 1043：UnknownColumn 智能纠错——相近字段 chips 一键替换列名（editDistance top-3） -->
          <div v-if="colFix" class="sq-colfix" role="group" aria-label="相近字段建议">
            <span class="sq-colfix-t">列 [{{ colFix.col }}] 不存在——相近字段：</span>
            <button v-for="s in colFix.suggestions" :key="s.path" type="button" class="btn sm"
                    :title="'替换 SQL 中的 ' + colFix.col + ' 为 ' + s.path"
                    @click="applyColFix(s.path)">{{ s.path }}</button>
          </div>
          <!-- 1045：索引名拼错同款纠错（Unknown index / no such index） -->
          <div v-if="idxFix" class="sq-colfix" role="group" aria-label="相近索引建议">
            <span class="sq-colfix-t">索引 [{{ idxFix.index }}] 不存在——相近索引：</span>
            <button v-for="s in idxFix.suggestions" :key="s.path" type="button" class="btn sm"
                    :title="'替换 SQL 中的 ' + idxFix.index + ' 为 ' + s.path"
                    @click="applyIdxFix(s.path)">{{ s.path }}</button>
          </div>
          <!-- 1110：未知函数同款纠错（Unknown function / Scalar function）——只给有相近候选的 -->
          <div v-if="fnFix && fnFix.suggestions.length" class="sq-colfix" role="group" aria-label="相近函数建议">
            <span class="sq-colfix-t">函数 [{{ fnFix.fn }}] 不存在——相近函数：</span>
            <button v-for="s in fnFix.suggestions" :key="s.name" type="button" class="btn sm" data-test="sql-fn-fix"
                    :title="'替换 SQL 中的 ' + fnFix.fn + ' 为 ' + s.name"
                    @click="applyFnFix(s.name)">{{ s.name }}</button>
          </div>
          <!-- 1121：结果窗口超限（LIMIT/OFFSET → from+size > 10000）——改写后走 cursor -->
          <div v-if="windowFix" class="sq-colfix" role="group" aria-label="结果窗口自救">
            <span class="sq-colfix-t">SQL 结果窗口上限 10000（LIMIT/OFFSET → from+size）：</span>
            <button type="button" class="btn sm" data-test="sql-window-fix"
                    :title="windowFix.note" @click="applyWindowFix">
              {{ windowFix.reason === 'offset' ? '去掉 OFFSET 用 cursor' : '把 LIMIT 降到 10000' }}
            </button>
          </div>
          <div class="sq-alert-acts">
            <!-- 1095：数组字段失配时给一键自救——不必理解 field_multi_value_leniency，开关+重试一步到位 -->
            <button v-if="arrayLenientFix" class="btn sm" data-test="sql-array-lenient"
                    title="开启宽容模式：数组字段取首值（自动注入 field_multi_value_leniency），然后重新执行"
                    @click="enableLenientRetry">开启宽容模式并重试</button>
            <!-- 1102：SQL 通道不支持 nested 字段——给两条真正能完成查询的通道，不留死胡同 -->
            <template v-if="nestedLimitFix">
              <span class="sq-sub">SQL 不支持 nested 字段，可改用：</span>
              <button class="btn sm" data-test="sql-goto-lucene" @click="switchQhMode('lucene')">去 Lucene 面板</button>
              <button class="btn sm" data-test="sql-goto-pit" @click="switchQhMode('pit')">去 PIT 分页</button>
            </template>
            <button class="btn sm" @click="doRun" :disabled="!sql.trim() || busy">重试</button>
          </div>
        </div>
      </div>

        <!-- 结果大容器框退役（约定④，pt-sec 538 同语言）→ sq-sec border-top 分节 -->
        <div v-if="cols.length" ref="resultSecEl" class="sq-sec wide">
        <div v-if="runLenient && rows.length && !resultStale" class="sq-lenient-note" role="status">
          <b>宽容模式结果</b>
          <span>数组/多值字段只显示首值；关闭「宽容模式」重跑可保留数组语义（SQL 严格模式可能报 Arrays are not supported，可改用 Lucene / PIT）。</span>
        </div>
        <!-- 1141：结果工具行并入表格内核工具行（QRT tableBar 内存态）——dbx 式单行
 chrome：左=计数 MetaStrip + 内建搜索，右=控制台独占动作（原始 IO/高度档/cursor 翻页）
 经 bar-extra 注入，导出/视图/列选由内核共享件承接（宿主不再手写 CSV/NDJSON 导出）。
 无 cursor 时不挂禁用翻页钮（1136）。 -->
        <!-- 刷新钮（refreshable）= 按当前 SQL 与参数重跑，Lucene 结果表同口径；
 此前只有页头主钮，结果表内想「去掉快速过滤再取一次」得先把视线移回页头。
 只 emit 'refresh' 意图，取数仍走 doRun 单一路径，不另造取数链。 -->
        <!-- 1439：SQL 正文每次敲键都会重渲染本视图；不加缓存时 200×23 的结果表
             会跟着父级重渲染（实测逐键 70ms、尖峰 196ms）。下表列出的都是结果侧
             真正会变的输入——打字不碰它们，Vue 直接跳过整个子树的更新。 -->
        <QueryResultTable
          v-memo="[runSeq, rows, colNames, busy, cursor, barMoreOpen, resultH, fillHeight, timeZone, resultStale, effectiveSqlIndex]"
          :key="runSeq"
          ref="resultTbl"
          :loading="busy"
          :cols="colNames"
          :rows="rows"
          sortable
          row-drawer
          sem-on
          use-as-condition
          table-bar
          searchable
          refreshable
          @refresh="doRun"
          view-seg
          view-pref-key="esquerystudio.pref.sqlResultView"
          export-name="sql"
          export-ndjson
          :export-note="exportCaveat(!!cursor, resultStale)"
          :storage-key="effectiveSqlIndex ? 'sql:' + effectiveSqlIndex : undefined"
          skip-cols-memory
          :show-col-count="false"
          :sem-raw-cols="sqlSemRawCols"
          :field-types="sqlFieldTypes"
          :max-height="resultMaxHeight"
          :min-height="resultMinHeight"
          selectable
          :more-rows="!!cursor"
          empty-text="查询成功但命中 0 行，检查 WHERE 条件或索引名"
          @use-as-condition="useAsCondition"
          @sort-by="sortByColumn"
        >
          <template #bar-prepend>
            <!-- 结果计数行走 MetaStrip 统一件（ fmtNum 千分位口径保留）；cursor 段 warn tone -->
            <MetaStrip :items="resultMeta" />
          </template>
          <template #bar-extra>
            <!-- 1353：宿主侧两项（原始 IO / 高度档）收成一个「结果表 ⋯」菜单。
                 1440 下工具行原本挤成 2 行、1280 下 3 行——两个图标钮各占一格，
                 而它们都是低频（原始 IO 只在排查时看、高度档调一次就记住）。
                 内核 Actions/视图菜单同款形态（.qrt-menu：点开、点外关、Esc 关）。 -->
            <!-- 1363：SQL 结果表此前没有多选（RT 有）——用户反复问「为什么能力没共享」。
                 开启 selectable 后必须给出「选中能干什么」：动作面收进 QRT 内核底部状态栏
                 （复制 TSV / JSON / 清除），与本视图工具行不重复占位。 -->
            <span class="menu-wrap sq-bar-more-wrap">
              <button class="btn ghost xs sq-icon-btn" data-test="sq-bar-more" aria-label="结果表更多（原始 IO / 高度档）"
                aria-haspopup="menu" :aria-expanded="barMoreOpen" title="结果表更多：原始 IO、结果表高度档"
                @click.stop="barMoreOpen = !barMoreOpen" @keydown.esc="barMoreOpen = false">
                <MoreHorizontal :size="12" />
              </button>
              <div v-if="barMoreOpen" class="qrt-menu sq-bar-more" role="menu" aria-label="结果表更多" @click.stop>
                <div class="qrt-m-t">结果表高度（当前 {{ resultHLabel }}）</div>
                <button v-for="h in RESULT_H_TIERS" :key="h" class="qrt-mi" role="menuitemradio"
                  :class="{ on: resultH === h }" :aria-checked="resultH === h"
                  @click="setResultH(h)">{{ h === 'fill' ? '填满剩余空间' : h + 'px' }}</button>
                <div class="qrt-m-sep" role="separator"></div>
                <button class="qrt-mi" role="menuitem" data-test="raw-io" aria-label="查看原始 IO（SQL 执行）"
                  title="最近一次 SQL 请求/响应原文（复制/回放/语义分档高亮）"
                  @click="barMoreOpen = false; openRawIo()">
                  <Terminal :size="12" /> 查看原始 IO
                </button>
              </div>
            </span>
            <template v-if="cursor">
              <button class="btn ghost xs" @click="nextPage" :disabled="busy">
                <ChevronRight :size="11" /> 下一页
              </button>
              <button class="btn ghost xs" @click="closeCursor" :disabled="busy">
                <XCircle :size="11" /> 关闭 cursor
              </button>
            </template>
          </template>
        </QueryResultTable>
        <!-- 1045：cursor 未取完时表头排序只作用于已加载行——诚实标注，避免把局部序当全量序 -->
        <div v-if="cursor && rows.length" class="sq-sort-note" role="status">
          cursor 未取完：表头排序仅作用于已加载 {{ rows.length }} 行；需要全量排序请在 SQL 里写 ORDER BY
        </div>
        <!-- 1048：两列聚合结果自动出分布图（label + count）——统计查询不再只有表格；
             非聚合形状不猜、不占位（sqlAggSeries 纯函数判定）。 -->
        <div v-if="aggSeries" class="sq-chart">
          <div class="sq-chart-hd">
            <span class="sq-chart-t"><BarChart3 :size="12" /> 聚合分布
              <span class="sq-chart-meta mono">{{ aggSeries.labelCol }} → {{ aggSeries.valueCol }} · {{ aggSeries.buckets.length }} 组 · 合计 {{ fmtNum(aggSeries.total) }}</span>
            </span>
            <button class="btn ghost xs" :aria-expanded="aggChartOpen" @click="aggChartOpen = !aggChartOpen">{{ aggChartOpen ? '收起' : '展开' }}</button>
          </div>
          <div v-show="aggChartOpen" class="sq-chart-body">
            <AggBarChart :buckets="aggSeries.buckets" :height="96" />
          </div>
        </div>
        </div>

      <!-- 初始/执行中空态（裸文字合并 EmptyState compact；
 快捷键文案走 execHint 单一出处——不再硬编码 ⌘/Ctrl+Enter 与按钮角标漂移） -->
      <!-- busy/初始空态大容器框退役（约定④空态不留整块空框）——EmptyState 直贴，
 sq-blank 仅留 wide 网格占位（无壳无线） -->
      <div v-else-if="busy" class="sq-blank">
        <EmptyState compact :icon="Loader2" text="正在执行 SQL…" />
      </div>
      <div v-else-if="!unavailable && !runErr" class="sq-blank">
        <EmptyState compact :icon="Database" :text="'编写 SQL 后按 ' + execHint + ' 执行'"
          hint="不确定语法可先点右侧模板或「示例」，结果表格将显示在这里"
          action-text="插入示例" @action="loadSample" />
      </div>
    </div>

    <!-- 页内查询历史（mode=sql 单档过滤，DslQueryView 弹窗范式）。
 play=回填草稿并执行、fill=仅回填；导入/清空入口关闭（同沙盒口径） -->
    <n-modal v-model:show="histOpen" preset="card" title="查询历史（SQL 控制台）" style="width:640px;max-width:92vw" :bordered="false">
      <QueryHistoryPanel
        :items="histRows" :actions="['play', 'fill', 'copy', 'del']" :clearable="false" :importable="false"
        empty-text="执行成功后自动记录（上限 100 条），可一键回填重跑"
        @play="h => replayHistRow(h, true)" @fill="h => replayHistRow(h, false)" @del="h => qh.removeOne(h.id)"
      />
    </n-modal>

    <!-- 原始 IO 弹窗（宿主受控开关；起 rec=最近一条 /cluster/sql/ 非 translate 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { BookOpen, Braces, Star, Play, Copy, AlertCircle, ChevronRight, ChevronDown, ChevronUp, XCircle, ShieldAlert, Database, Loader2, History, Terminal, BarChart3, MoreHorizontal } from 'lucide-vue-next';
import { NModal } from 'naive-ui';
/* 页内历史面板合并 QueryHistoryPanel 共享件（DslQueryView 弹窗范式） */
import QueryHistoryPanel from '../components/QueryHistoryPanel.vue';
import { api, ioRecorder, type RawIoRec } from '../api';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { encodeDslParam } from '../utils/queryHub';
import { useQueryHistoryStore } from '../stores/queryHistory';
import { useQueryRun } from '../composables/useQueryRun';
import { usePref } from '../composables/urlState';
import { useTierCycle } from '../composables/useTierCycle'; /* ：sql.railW/resultH/codeH 三件套合并 */
import { useScopedDraft } from '../composables/useScopedDraft';
import { isDemoMode } from '../platform/demoApi';
import { copyText, fmtTime, fmtNum } from '../utils/format';
import MonacoEditor from '../components/MonacoEditor.vue';
import QueryResultTable from '../components/QueryResultTable.vue';
import AggBarChart from '../components/AggBarChart.vue';
import { sqlAggSeries } from '../utils/sqlChart';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环） */
import RawIoModal from '../components/RawIoModal.vue';
/* 页头/空态/元信息/JSON 高亮四处统一件合并 */
import PageHeader from '../components/PageHeader.vue';
import EmptyState from '../components/EmptyState.vue';
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue';
import CurrentIdxChip from '../components/CurrentIdxChip.vue'; /* ：页头只读当前索引锚 */
import { highlightJson } from '../utils/jsonc';
/* 错误面板 errPreHtml v-html 内核 + friendlyEsError 人话标题行；
 补 errMeta 帮手（双参改用，原始错误对象旁路见 runErrObj） */
import { errPreHtml, errMeta } from '../utils/errPre';
import { friendlyEsError } from '../utils/esError';
/* W2 批：SQL 补全单例接入——与 SqlBridge 共享同一份语言级 provider（引用计数，挂载 ensure/卸载 dispose） */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { useIndexFields } from '../composables/useIndexFields';
import { indexFromSql } from '../utils/sqlIndex';
import { describeSqlOpts } from '../utils/sqlOpts';
import { ensureSqlCompletion, suggestColumnsFor, suggestFunctionsFor, suggestIndicesFor, type SqlCompletionCtx } from '../utils/sqlCompletion';
import { lintSql } from '../utils/sqlLint'; /* P0-3：SQL 静态 lint */
/* 1109：ES 报错 `line X:Y` 锚点 → 编辑器行列定位 */
import { parseSqlErrorPos } from '../utils/sqlErrorPos';
import { autoQuoteFromIndex } from '../utils/sqlQuote';
import { expandStarColumns } from '../utils/sqlStar';
import { selectionScope, statementsOf, statementScopeAt, replaceScopeText, mapScopedPos, type SqlScope } from '../utils/sqlScope';
/* 1121：LIMIT/OFFSET 超结果窗口（from+size ≤ 10000）→ 去掉 OFFSET / 压 LIMIT 用 cursor */
import { fixSqlResultWindow } from '../utils/sqlWindowFix';
/* 1126：结果值下钻——简单 SELECT 追加 WHERE（安全转义；复杂结构降级为复制条件） */
import { appendSqlFilter, appendSqlOrder, sqlPredicate } from '../utils/sqlFilter';
import { fieldRoleOf } from '../utils/fieldRole';
import { sqlCostHints, appendSqlLimit } from '../utils/sqlCost'; /* 1050：高开销结构提示 */
import { countSqlPlaceholders, parseSqlParams } from '../utils/sqlParams'; /* 1070：? 位置参数 */
import { columnarToRows, exportCaveat, hasSqlRowsShape } from '../utils/sqlResult'; /* 1075 列式转行；1078 导出注脚；1079 形态守卫 */
import { useDebounceFn } from '../composables/useDebounceFn'; /* P0-3：划线防抖统一件 */
import { writeStoredRaw, removeStoredRaw } from '../utils/safeJson';

const store = useAppStore();
const auth = useAuthStore();
const router = useRouter();
/* w80：执行快捷键角标跟平台——Mac 显示 ⌘⏎，Windows/Linux 显示 Ctrl+⏎（此前硬编码 Mac 符号） */
const isMac = navigator.platform.toUpperCase().includes('MAC');
const execHint = isMac ? '⌘⏎' : 'Ctrl+⏎';
/* 手写 SQL 进 sessionStorage 草稿——刷新/误导航不丢稿（可重入） */
/* 草稿：SQL 草稿迁 useScopedDraft（按集群目标隔离） */
const sql = useScopedDraft('sql', {
  route: 'sql-console',
}, isDemoMode ? 'SELECT * FROM "research_report" LIMIT 100' : '').text;

/* P0-3：SQL 静态 lint 双通道——
 ① 编辑器划线：setLineMarkers 行号直射（SynonymsManagerView 范式，owner='es-sql-lint'
 多 lint 源互不清），useDebounceFn 250ms 防 findMatches 级重扫（行号直射本廉价，防抖
 与全站 lint 通道对齐）；空 lint 输出 [] 即清旧划线。
 ② 页内 banner：sqlLintFindings 逐条「第 N 行」提示条（自动高度，不进编辑器高度链）。
 lint 纯函数规则宁少勿误报（合法语句零误报由 sqlLint534 契约钉），零阻塞不拦执行。 */
const sqlMonaco = ref<InstanceType<typeof MonacoEditor> | null>(null);
/* 1386：带已知索引清单——FROM 里的裸索引名能被认出是「漏了引号」而不是拼错。
   1389：带字段类型——GROUP BY / ORDER BY 打在无 .keyword 子域的 text 字段上会必失败，
   执行前就在编辑器里点名（类型来自同一个字段源，补全/体检/纠错共用）。 */
const sqlLintFieldTypes = computed<Record<string, string>>(() => {
  const out: Record<string, string> = {};
  for (const f of sqlFieldsCtx.fields.value) out[f.path] = f.type;
  return out;
});
const sqlLintFindings = computed(() => lintSql(sql.value || '', sqlIndexPool.value, sqlLintFieldTypes.value));
/* 1391：默认只列 1 条（第一条通常就是最该先修的）。规则变多以后（⑥⑦⑧ 全命中 +
   同字段多子句）提示条会顶到编辑器上方：1280×720 实测编辑区只剩 39~54px，
   用户看得见问题却改不动稿——「自动高度不进编辑器高度链」这条注释是错的，实测它会挤。
   「折叠」不是隐藏问题：按钮上写着还差几条，点开全可见（另有 88px 封顶 + 内部滚动）。 */
const LINT_VISIBLE = 1;
const lintExpanded = ref(false);
const shownLintFindings = computed(() => (lintExpanded.value
  ? sqlLintFindings.value
  : sqlLintFindings.value.slice(0, LINT_VISIBLE)));
/* 1050：成本/结构提示（编辑即算，纯函数；最多 2 条防噪音）——1130 起只评估当前
   选区/光标语句，多语句稿不会拿另一条的缺失来提示这一条 */
const costHints = computed(() => sqlCostHints(advisoryText.value || ''));
const costFixLimit = computed(() => costHints.value.some(h => h.fix === 'limit'));
/* 1105：SELECT * 一键展开为字段清单——字段源跟随 FROM/顶栏（sqlFieldsCtx），
   上限 60 个以免把编辑器写爆；不在本地伪造字段（字段源空则不出现按钮）。
   1130：只展开当前选区/光标语句里的 SELECT *，并原位放回，其他语句零触碰。
   1387：两条真机缺陷收口——① 容器字段（object/nested）不能当列，剔除逻辑下沉
   utils/sqlStar（此前 `publisher` 被写进 SELECT，展开完照样报错）；
   ② 字段源必须属于语句自己的 FROM：通配/多表时 effectiveSqlIndex 回落顶栏索引，
   展开会把 A 索引的列写进查 B 的语句。 */
const STAR_CAP = 60;
const starHasMarker = computed(() => /\bSELECT\s+\*/i.test(advisoryText.value || ''));
const canExpandStar = computed(() => starHasMarker.value
  && sqlFieldsCtx.fields.value.length > 0 && !!sqlFromIdx.value);
const starBlockedReason = computed(() => {
  if (!starHasMarker.value || !sqlFieldsCtx.fields.value.length || sqlFromIdx.value) return '';
  return 'FROM 没有写明一个具体索引（通配 / 多表 / 未知名），无法确定用哪个索引的字段展开';
});
function expandStar() {
  const ex = expandStarColumns(sqlFieldsCtx.fields.value, STAR_CAP);
  if (!ex.picked) return;
  const next = advisoryText.value.replace(/\bSELECT\s+\*/i, 'SELECT ' + ex.cols);
  if (next === advisoryText.value) return;
  applyScopedEdit(next);
  const extra = [
    ex.pool > ex.picked ? `共 ${ex.pool} 个，已截断前 ${STAR_CAP}` : '',
    ex.skippedContainers ? `跳过 ${ex.skippedContainers} 个 object/nested 容器字段（SQL 不能直接选）` : '',
  ].filter(Boolean).join('；');
  store.notify('info', `已展开 ${ex.picked} 个字段${extra ? '（' + extra + '）' : ''}`, { duration: 3200 });
}
function applyCostLimit() {
  const src = advisoryText.value;
  const semi = /;\s*$/.test(src) ? ';' : '';
  const next = appendSqlLimit(src.replace(/;\s*$/, ''), 1000) + semi;
  if (next === src) return;
  applyScopedEdit(next);
  store.notify('info', '已补 LIMIT 1000：只限制返回量，不减少索引扫描', { duration: 3000 });
}
const queueSqlLintMarkers = useDebounceFn(() => {
  sqlMonaco.value?.setLineMarkers?.(
    sqlLintFindings.value.map(f => ({ line: f.line, message: f.message + '（' + f.suggestion + '）' })),
    'es-sql-lint',
  );
}, 250);
watch(sql, () => { queueSqlLintMarkers(); }, { immediate: true });
/* 执行参数作为偏好跨会话记忆 */
const fetchSize = usePref('sql.fetchSize', 200);
const timeZone = usePref('sql.timeZone', '');
const pageTimeout = usePref('sql.pageTimeout', '');
/* 默认严格模式：宽容模式会把数组/多值字段压成首值，属于改变查询语义；
   必须由用户显式开启，并在结果区持续标明。 */
const lenient = usePref('sql.lenient', false);
/* 1075：columnar 列式返回——大结果/深翻页用；cursor 续页必须与首查同形态 */
const columnar = usePref('sql.columnar', false);
/* 1070：位置参数（? 占位 + params 数组）。参数文本跨会话记忆；参数条默认仅在有值时展开，
   不挤占每次进页的编辑器高度。占位符计数忽略字符串/注释里的问号（utils/sqlParams）。 */
const paramsText = usePref('sql.params', '');
const paramOpen = ref(!!paramsText.value);
const paramPlaceholders = computed(() => countSqlPlaceholders(sql.value || ''));
const paramParse = computed(() => parseSqlParams(paramsText.value));
const paramCount = computed(() => (paramParse.value.ok ? paramParse.value.value.length : 0));
const paramStat = computed<{ text: string; tone: 'ok' | 'warn' | 'bad' | '' }>(() => {
  const p = paramParse.value;
  if (!p.ok) return { text: p.error, tone: 'bad' };
  const n = p.value.length;
  const ph = paramPlaceholders.value;
  if (!ph && !n) return { text: '未使用参数', tone: '' };
  if (!n) return { text: `SQL 有 ${ph} 个 ? 未填参数`, tone: 'warn' };
  if (n === ph) return { text: `${ph} / ${n} 匹配`, tone: 'ok' };
  return { text: `占位 ? ${ph} · 参数 ${n}（数量不一致）`, tone: 'warn' };
});
/* W2 批：布局可调三件全走 usePref 跨会话记忆——
 ① 模板侧栏：可折叠（sql.railOpen）+ 宽度三档（sql.railW，默认 300=原 minmax 上限）；
 ② 结果表高度档（sql.resultH，默认 500=原写死值）；
 ③ DSL 预览高度档（sql.codeH，默认 300=原 .sq-code 写死值） */
const railOpen = usePref('sql.railOpen', true);
/* SQL 编辑器折叠（给结果表让位）：1280 高下 34vh 编辑器会把结果压到最小 96px；
   折叠只留卡头工具行，结果区上移，展开即恢复且不遗留空档（usePref 跨会话记忆）。 */
const editorCollapsed = usePref('sql.editorCollapsed', false);
/* 三件套（TIERS+usePref+手写 cycle）合并 useTierCycle 单源（键不变=零迁移）。
 三处默认档均非首位（300/500/300 在各自档值数组第二位），defVal 必须显式传，
 缺省会漂到 tiers[0] 破坏「默认 300/500/300=原写死值」口径；cycle 语义等值 */
const RAIL_W_TIERS = [240, 300, 360];
const { v: railW, cycle: cycleRailW } = useTierCycle('sql.railW', RAIL_W_TIERS, 300);
const RESULT_H_TIERS = ['fill', 500, 800] as const;
const { v: resultH } = useTierCycle('sql.resultH', RESULT_H_TIERS, 'fill');
watch(editorCollapsed, async (collapsed) => {
  if (collapsed) railOpen.value = false;
  await nextTick();
  measureResultTop();
});
/* 1354：默认档改成「填满剩余空间」——此前默认写死 500px，实测结果卡下方空白：
   2560×1440 = 589px、1920×1080 = 351px、1440×900 = 232px —— 屏幕越大浪费越多，
   正是用户说的「默认可视表格特别窄，下面还有那么多空间」。
   填满公式：视口高 − 结果卡顶部偏移（运行时量 ref，滚动/切档都不硬编码）− 底部呼吸 16px。
   下限 320px 兜底（极矮视口仍可读）；上限不设——剩余空间本来就是给结果的。 */
const resultSecEl = ref<HTMLElement | null>(null);
const resultTopOffset = ref(0);
/* 量的是**表体**（.qrt-wrap）的顶，不是结果卡顶：卡头 45px 在两者之间，
   用卡顶会把表体顶高 45px；而表体尚未渲染（无结果/加载态）时用卡顶估计。
   1439：可用高度必须把表体**下方**仍要占位的行扣掉（状态栏/排序注/图表/页底呼吸）——
   只算到视口底会把页面撑高几十像素，滚动到最大时 SQL 卡头正好卡在 sticky 模式条下
   被切掉半行（用户反馈「表头横在中间」）。滚动位置用「内容坐标」抵消：页面已滚动时
   量到的 rect.top 会带上 scrollTop，必须加回去，否则每次滚动都会改高度、反复抖动。 */
function measureResultTop() {
  const el = resultSecEl.value;
  if (!el) return;
  /* 量当前可见的结果体（表格体或 JSON/Tree/卡片 alt 体）：两档共用同一组 tool 行/文档导航，
     只换视图时不因被隐藏的 wrap 0 高度抖动（切档高度稳定，不产生反馈环） */
  const target = [...el.querySelectorAll<HTMLElement>('.qrt-wrap, .qrt-alt-body')].find(x => x.offsetParent !== null)
    || el.querySelector<HTMLElement>('.qrt-bar') || el;
  const pager = el.closest('.page') as HTMLElement | null;
  if (!pager) {
    resultAvailH.value = Math.round(window.innerHeight - target.getBoundingClientRect().top - 32);
    return;
  }
  const pagerRect = pager.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  /* 内容坐标（含 .page 顶部内衬），与当前滚动位置无关 */
  const topInPage = rect.top - pagerRect.top + pager.scrollTop;
  /* 表体之下真实占位（状态栏/排序注/图表/页底内衬）——不用页面 scrollHeight：
     页面 min-height 的空白会被当成「下方内容」，形成「表体越窄→空白越多→可用高度越小」
     的正反馈（产线实报宽表只剩 3 行、下方大片空白）。 */
  let below = Math.max(0, el.getBoundingClientRect().bottom - (rect.top + rect.height));
  let sib = el.nextElementSibling as HTMLElement | null;
  while (sib) {
    if (sib.offsetParent !== null) below += sib.getBoundingClientRect().height;
    sib = sib.nextElementSibling as HTMLElement | null;
  }
  const padBottom = parseFloat(getComputedStyle(pager).paddingBottom) || 0;
  const avail = Math.floor(pager.clientHeight - topInPage - below - padBottom - 8);
  resultTopOffset.value = Math.round(rect.top);
  resultAvailH.value = avail;
}
const resultHLabel = computed(() => resultH.value === 'fill' ? '填满剩余空间' : resultH.value + 'px');
/* 可用高度 = 页面视口高 − 表体顶（内容坐标）− 表体下方占位 − 8px 呼吸。
   用实测差值而不是 100vh - offset：页面自身可滚动，100vh 会把「已滚出的部分」
   也算进来，2560×1440 实测多出 136px。 */
const resultAvailH = ref(0);
/* 脏值/未测量时用 240px 保守兜底。
   1391：**下限要有**——1280×720 且带 lint 提示时实测只剩 42px（表头一行就占满），
   结果等于看不见。1439：下限从 160 调成 96（表头 + 约 2 行）——160 在有状态栏/排序注
   的页面上会把页面顶出视口，滚动后卡头被 sticky 模式条切半（用户反馈）；96 只占
   「能放两行」的底线，再小的视口仍允许页面滚动，但正常 1440×760 起不再产生溢出。 */
const RESULT_MIN_FILL = 96;
const fillHeight = computed(() => resultAvailH.value > 0
  ? `${Math.max(resultAvailH.value, RESULT_MIN_FILL)}px`
  : 'min(420px, 60vh)');
const resultMaxHeight = computed(() => resultH.value === 'fill' ? fillHeight.value : resultH.value + 'px');
/* 1354：表体下限同口径——max-height 只封顶不收底，行少时表体塌成一条（实测 52px、
   下方空 589px）。填满档同时给 min-height，行少也占满剩余视口。 */
const resultMinHeight = computed(() => resultH.value === 'fill' ? fillHeight.value : undefined);

/* 1353：高度档从「连点循环」升级为显式三选（菜单里带当前档），循环函数保留给键盘/兼容路径 */
const barMoreOpen = ref(false);
/* 1363：结果表多选（RT 同款通道）——动作面（复制 TSV/JSON、清除）在 QRT 内核底部状态栏，
   宿主只负责开启 selectable，不再维护第二套复制实现。 */
function setResultH(h: (typeof RESULT_H_TIERS)[number]) {
  resultH.value = h;
  barMoreOpen.value = false;
}
const CODE_H_TIERS = [200, 300, 500];
const { v: codeH, cycle: cycleCodeH } = useTierCycle('sql.codeH', CODE_H_TIERS, 300);
const schemaWarnings = ref<string[]>([]);

/* 模板栏变浮层后必须能随手关掉——它盖在编辑器内容区右上角（实测遮住约 23% 编辑区）。
   收起方式沿用浮层惯例：点外部 / Esc。两个监听只在展开时挂，收起即摘（与 CellContextMenu 同款配对）。
   toggle 钮本身与浮层内点击不算「外部」——否则点模板就把它自己关了。 */
const samplesEl = ref<HTMLElement | null>(null);
const toggleEl = ref<HTMLElement | null>(null);
function onDocDownForRail(e: MouseEvent) {
  const t = e.target as Node | null;
  if (!t) return;
  if (samplesEl.value?.contains(t)) return;
  if (toggleEl.value?.contains(t)) return;
  railOpen.value = false;
}
function onDocKeyForRail(e: KeyboardEvent) {
  if (e.key === 'Escape') railOpen.value = false;
}
watch(railOpen, (v) => {
  const on = v === true;
  document.addEventListener('mousedown', onDocDownForRail, true);
  document.addEventListener('keydown', onDocKeyForRail, true);
  if (!on) {
    document.removeEventListener('mousedown', onDocDownForRail, true);
    document.removeEventListener('keydown', onDocKeyForRail, true);
  }
}, { immediate: true });
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocDownForRail, true);
  document.removeEventListener('keydown', onDocKeyForRail, true);
  document.removeEventListener('mousedown', onDocDownForBarMore, true);
  window.removeEventListener('resize', measureResultTop);
  roResult?.disconnect();
  roResult = null;
});
/* 1353：结果表「更多」菜单点外部关闭（与 rail 同一套 capture 监听，仅在展开时挂） */
function onDocDownForBarMore(e: MouseEvent) {
  const t = e.target as HTMLElement | null;
  if (t?.closest('.sq-bar-more-wrap')) return;
  barMoreOpen.value = false;
}
watch(barMoreOpen, on => {
  if (on) document.addEventListener('mousedown', onDocDownForBarMore, true);
  else document.removeEventListener('mousedown', onDocDownForBarMore, true);
});
const cols = ref<Array<{ name: string; type: string }>>([]);
/* 测量时机：结果出来（cols 变化）→ 表体挂载 → 尺寸落定。
   只在 nextTick 量会早一拍（.qrt-wrap 还没进 DOM 或还是旧高），用 ResizeObserver
   跟住表体/容器尺寸，任何一次布局变化都重算——视口缩放、切档、结果增减都覆盖。 */
watch([resultH, () => cols.value.length], async () => {
  await nextTick(); measureResultTop();
}, { immediate: true });
let roResult: ResizeObserver | null = null;
onMounted(() => {
  measureResultTop();
  window.addEventListener('resize', measureResultTop);
  if (typeof ResizeObserver !== 'undefined') {
    roResult = new ResizeObserver(() => measureResultTop());
    const el = resultSecEl.value;
    if (el) roResult.observe(el);
    const page = document.querySelector('.sq-page');
    if (page) roResult.observe(page);
  }
});
const rows = ref<any[][]>([]);
/* 本次结果实际使用的宽容档：开关可在结果后继续切换，标记不能跟着当前 UI 漂移。 */
const runLenient = ref(false);
/* 通用表只读 cols 是 string[]；type 子标签属 SQL 特定细节，不塞进通用表 */
const colNames = computed(() => cols.value.map(c => c.name));
/* 1108：SQL 返回列自带 ES 类型 → 显式喂给 QRT（列头类型徽标/数值对齐/date 本地化），
   不再只靠值采样猜（全 null/混合列采样不到）。聚合表达式列无稳定类型，排除。 */
const sqlFieldTypes = computed<Record<string, string>>(() => {
  const out: Record<string, string> = {};
  for (const c of cols.value) {
    if (!c.type || c.name.includes('(') || c.name.includes('*')) continue;
    out[c.name] = c.type;
  }
  return out;
});
/* SQL 结果列一律抑制 semFormat「按值推断」：
   ES SQL 列类型是 long/double/boolean/keyword 等原始类型，按值把 410000 判成
   410.0s、把 0/1 判成百分比会直接改写业务语义（数组字段被压成首值后尤其明显）。
   SQL 通道没有可靠的 bytes/duration/percent 显式类型来源，所以显示保持 raw；
   数值右对齐、千分位与日期本地化仍由显式 fieldTypes/date 链承担。
   本表不传 storage-key（tableDimGuard 锁）。 */
const sqlSemRawCols = computed<string[]>(() => cols.value.map(c => c.name));
const resultTbl = ref<InstanceType<typeof QueryResultTable>>();
/* 1048：聚合分布图（两列 label+数值才出；不猜非聚合形状） */
const aggSeries = computed(() => sqlAggSeries(cols.value, rows.value));
const aggChartOpen = usePref('sql.aggChartOpen', true);
/* 每次执行重挂表，把排序态回到 SQL 原始行序，避免陈旧排序误导 */
const runSeq = ref(0);
const cursor = ref<string | null>(null);
/* 1045：cursor 与产生它的 SQL 快照绑定——改稿后继续「下一页」不得把旧查询的后续页
   追加到新查询结果下（旧实现无条件 concat，结果串台且 cursor 泄漏）。 */
const cursorSql = ref<string | null>(null);
/* 结果已过期（SQL 改动/新查询失败但仍显示旧行）——表头计数区诚实标注 */
const resultStale = ref(false);
/* 1088：过期原因——改参数/切时区/切列式/取消/失败都标「已过期」，但徽标必须说清是哪一种 */
const staleLabel = ref('SQL 已修改');
/* 1082：上一次成功执行的实际输入快照——没有 cursor 时改稿同样要标过期，
   否则表里上一轮的行会一直冒充当前结果（模板换源/补 LIMIT 都会被误读） */
const runSql = ref<string | null>(null);
const runParams = ref<string | null>(null);
/* 1128：编辑器选区态（行/字符/偏移）——驱动「执行选段」示能与结果来源标注 */
const selScope = ref<{ lines: number; chars: number; start: number; end: number } | null>(null);
/* 1129：光标偏移 + 顶层语句切分——多语句稿不选中时执行光标所在语句（Kibana/DataGrip 同习惯），
   单语句稿仍按整篇（行为零变化） */
const cursorPos = ref(0);
const stmtScopes = computed(() => statementsOf(sql.value));
const cursorStmt = computed(() => statementScopeAt(sql.value, cursorPos.value));
const multiStmt = computed(() => stmtScopes.value.length > 1);
const cursorStmtNo = computed(() => {
  const c = cursorStmt.value;
  if (!c) return 0;
  const i = stmtScopes.value.findIndex(s => s.start === c.start);
  return i < 0 ? 0 : i + 1;
});
/* 1130：就地建议/改写的目标范围——选区优先，其次光标语句；单语句稿=整篇。
   展开字段/补 LIMIT 等动作只改这一段，不再盲改第一条或整篇尾部。 */
const editScope = computed<SqlScope | null>(() => {
  if (selScope.value) return selectionScope(sql.value, selScope.value.start, selScope.value.end);
  return multiStmt.value ? cursorStmt.value : null;
});
const advisoryText = computed(() => editScope.value?.text ?? sql.value);
function applyScopedEdit(next: string) {
  sql.value = replaceScopeText(sql.value, editScope.value, next);
}
/* 1128：本次结果来自哪段选区（null=整篇）；只标注来源，不改过期判定口径：
   runSql/runErrSql 仍存整篇快照，改到选区外任何一处都算「输入已变」，宁可保守。 */
const runScope = ref<SqlScope | null>(null);
/* 1135：局部结果的下钻/排序在「稿未变」时只改执行过的那条语句，并强制下一次 run
   仍跑这条（点结果表会移走光标，不能依赖当前选区）。 */
let forcedRunScope: SqlScope | null = null;
/* 改稿即作废旧 cursor：静默关闭服务端上下文，保留已加载行但明确标「已过期」 */
watch(sql, () => {
  if (rows.value.length && runSql.value !== null && sql.value !== runSql.value) {
    resultStale.value = true;
    staleLabel.value = 'SQL 已修改';
  }
  if (cursor.value && cursorSql.value !== null && sql.value !== cursorSql.value) {
    resultStale.value = true;
    staleLabel.value = 'SQL 已修改';
    void closeCursorQuiet();
  }
});
/* 1070：参数属于结果上下文——改 params 后旧 cursor 的后续页对应旧参数，必须作废，
   否则「下一页」会把上一组参数的结果续到新参数现场（与改 SQL 同口径的诚实性）。
   1082：无 cursor 时改参数也标过期，行仍属于旧参数。 */
watch(paramsText, () => {
  if (rows.value.length && runParams.value !== null && paramsText.value.trim() !== runParams.value) {
    resultStale.value = true;
    staleLabel.value = '参数已修改';
  }
  if (cursor.value) {
    resultStale.value = true;
    staleLabel.value = '参数已修改';
    void closeCursorQuiet();
  }
});
/* 1075：columnar 是结果形态的一部分——切形态后旧 cursor 的后续页形态不一致，必须作废 */
watch(columnar, () => {
  if (cursor.value) {
    resultStale.value = true;
    staleLabel.value = '列式形态已切换';
    void closeCursorQuiet();
  }
});
/* 1088：time_zone 属于结果上下文——cursor 续页按发起时的时区回显日期列；
   中途改时区会让新页与已加载页格式不一致（同一表两套时间口径），同 columnar 作废 */
watch(timeZone, () => {
  if (cursor.value) {
    resultStale.value = true;
    staleLabel.value = '时区已修改';
    void closeCursorQuiet();
  }
});
/* 宽容档改变查询语义：已加载结果必须标过期，不能被当成当前口径继续读。 */
watch(lenient, () => {
  if (rows.value.length) {
    resultStale.value = true;
    staleLabel.value = '宽容模式已切换';
  }
  if (cursor.value) void closeCursorQuiet();
});
const dslPreview = ref<string | null>(null);
/* 1136：DSL 预览默认折叠——结果网格优先（dbx 式）；自动 translate 只备好内容，
   手动「转 DSL」才展开；展开后跨查询保留操作者选择。 */
const previewOpen = ref(false);
/* 1125：预览绑定生成时的 SQL 快照——改稿后旧翻译不可再复制/跳转（可能带着旧 FROM/旧索引） */
const dslPreviewSql = ref('');
/* 1128：预览对应的索引名——选段翻译时按选段的 FROM 走，跳 DSL 页不落到整篇的另一条语句上 */
const dslPreviewIdx = ref('');
const dslPreviewStale = computed(() => !!dslPreview.value && sql.value !== dslPreviewSql.value);
const unavailable = ref(false);
const reason = ref('');
/* 执行失败持久错误面板：ES 长错误全文留痕可回看，toast 6 秒即逝不作唯一载体 */
const runErr = ref('');
/* errPre 双参改用旁路——下方 doRun catch 把 ApiError 压串进 runErr
 （既有行为不动，全文回看语义逐字保留），原始错误对象旁路留存供 errMeta 读 code/
 endpoint（错误码徽标+「失败于」端点行，533/ errPre 内核能力）；重跑即清 */
const runErrObj = ref<unknown>(null);
/* 错误面板标题行的人话摘要（pre 仍保全文，SearchSandboxView 同款双轨） */
const friendlyRunErr = computed(() => friendlyEsError(runErr.value));
/* 1109：ES SQL 报错带 `line X:Y` 锚点——解析后给「定位 X:Y」入口，
 执行错误同时在编辑器对应行标红（owner 与静态 lint 分离，互不清）。
 错误锚点绑定失败时的 SQL 快照：改稿后旧行号不再可信，chip/marker 立即撤下，
 面板保留全文但标「错误来自上一版 SQL」——不让旧错误看起来像当前稿的错误。 */
const runErrSql = ref('');
/* 1128：失败那次执行若来自选区——报错 `line X:Y` 是相对选段的，需按锚点换算回全文 */
const runErrScope = ref<SqlScope | null>(null);
const runErrPosRaw = computed(() => (runErr.value ? parseSqlErrorPos(runErr.value) : null));
const runErrPos = computed(() => mapScopedPos(runErrPosRaw.value, runErrScope.value));
const runErrStale = computed(() => !!runErr.value && sql.value !== runErrSql.value);
function locateRunErr() {
  const p = runErrPos.value;
  if (p) sqlMonaco.value?.revealPosition?.(p.line, p.column);
}
function locateLine(line: number) {
  sqlMonaco.value?.revealPosition?.(line, 1);
}
function syncRunErrMarker() {
  const p = runErrStale.value ? null : runErrPos.value;
  sqlMonaco.value?.setLineMarkers?.(
    p ? [{ line: p.line, message: '执行错误：' + friendlyRunErr.value }] : [],
    'es-sql-runerr', 'error',
  );
}
watch(sql, () => { if (runErr.value) syncRunErrMarker(); });
/* 1095：数组字段报错 + 宽容模式未开 → 给「一键开启并重试」；不动 SQL 文本 */
const arrayLenientFix = computed(() => !lenient.value && !!runErr.value
  && /Arrays are not supported|field_multi_value_leniency|multi[-_ ]value/i.test(runErr.value));
function enableLenientRetry() {
  lenient.value = true;
  store.notify('info', '已开启宽容模式（数组字段取首值），正在重新执行');
  void doRun();
}
/* 1102：SQL 通道不支持 nested 字段——切到支持嵌套的查询通道（保留 idx/mode 之外的 URL 现场） */
const nestedLimitFix = computed(() => !!runErr.value && /Nested fields not supported/i.test(runErr.value));
function switchQhMode(mode: 'lucene' | 'pit') {
  const usp = new URLSearchParams(location.hash.split('?')[1] || '');
  usp.set('mode', mode);
  location.hash = (location.hash.split('?')[0] || '#/search') + '?' + usp.toString();
}
/* 1043：UnknownColumn 智能纠错——错误文本解析列名 + editDistance 相近字段 top-3；
   无 UnknownColumn 字样/字段源为空 → null（面板零增量）。字段冷缓存时顺带
   ensure（fire-and-forget，computed 随 fields.value 更新自愈重算）。 */
const colFix = computed(() => {
  /* 1130：错误锚点已撤（改稿）时不再给替换建议——避免把旧错误的改名盖到新稿 */
  if (!runErr.value || runErrStale.value) return null;
  const fields = sqlFieldsCtx.fields.value;
  /* 无索引时 ensure 无意义；且空字段下反复 ensure 会写新数组触发自身重算（递归更新） */
  if (!fields.length) { if (effectiveSqlIndex.value) void sqlFieldsCtx.ensure(); return null; }
  return suggestColumnsFor(runErr.value, fields);
});
/* 1130：失败来自选段/光标语句时，替换只落在该段；整篇执行维持原全局替换。
   返回 false=段内没找到目标（调用方提示而不是盲目全局改）。 */
function replaceInRunScope(re: RegExp, to: string): boolean {
  const sc = runErrScope.value;
  if (!sc || runErrStale.value) return false;
  const body = sql.value.slice(sc.start, sc.end);
  if (!new RegExp(re.source, re.flags).test(body)) return false;
  sql.value = replaceScopeText(sql.value, sc, body.replace(new RegExp(re.source, re.flags), to));
  return true;
}
function applyColFix(path: string) {
  const col = colFix.value?.col;
  if (!col) return;
  const re = new RegExp(col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  if (runErrScope.value) {
    if (!replaceInRunScope(re, path)) {
      store.notify('warning', `当前${runErrScope.value.kind === 'statement' ? '语句' : '选段'}内未找到列 ${col}`);
      return;
    }
  } else {
    sql.value = sql.value.replace(re, path);
  }
  store.notify('info', `已将列 ${col} 替换为 ${path}，可重新执行`);
}
/* 1045：索引名纠错（Unknown index / no such index）——与列名纠错同交互 */
const idxFix = computed(() => (runErr.value && !runErrStale.value ? suggestIndicesFor(runErr.value, store.indices) : null));
function applyIdxFix(path: string) {
  const index = idxFix.value?.index;
  if (!index) return;
  const re = new RegExp(index.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  if (runErrScope.value) {
    if (!replaceInRunScope(re, path)) {
      store.notify('warning', `当前${runErrScope.value.kind === 'statement' ? '语句' : '选段'}内未找到索引 ${index}`);
      return;
    }
  } else {
    sql.value = sql.value.replace(re, path);
  }
  store.notify('info', `已将索引 ${index} 替换为 ${path}，可重新执行`);
}
/* 1110：Unknown function / Scalar function 纠错——候选池为 ES SQL 官方标量+聚合函数表，
   与列名/索引名纠错同交互（替换后由「重试」执行，不暗跑）。 */
const fnFix = computed(() => (runErr.value && !runErrStale.value ? suggestFunctionsFor(runErr.value) : null));
function applyFnFix(name: string) {
  const fn = fnFix.value?.fn;
  if (!fn) return;
  const re = new RegExp('\\b' + fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
  if (runErrScope.value) {
    if (!replaceInRunScope(re, name)) {
      store.notify('warning', `当前${runErrScope.value.kind === 'statement' ? '语句' : '选段'}内未找到函数 ${fn}`);
      return;
    }
  } else {
    sql.value = sql.value.replace(re, name);
  }
  store.notify('info', `已将函数 ${fn} 替换为 ${name}，可重新执行`);
}
/* 1121：结果窗口超限自救——LIMIT/OFFSET 翻译成 from+size，超 10000 必 400；
 删除 OFFSET（或将超窗 LIMIT 压到 10000）后走 cursor 分页。只对失败那一版 SQL 生效，
 改稿后（stale）不提供，避免把旧改写盖到新稿上。 */
const windowFix = computed(() => {
  if (!runErr.value || runErrStale.value) return null;
  if (!/Result window is too large|from \+ size must be less than or equal to|max_result_window/i.test(runErr.value)) return null;
  return fixSqlResultWindow(runErrSql.value || sql.value);
});
function applyWindowFix() {
  const f = windowFix.value;
  if (!f) return;
  /* 1130：失败来自选段/语句时只改该段，保留段外原文；整篇执行维持原行为 */
  const sc = runErrScope.value;
  if (sc) {
    const semi = sql.value[sc.end - 1] === ';' ? ';' : '';
    sql.value = replaceScopeText(sql.value, sc, f.sql + semi);
  } else {
    sql.value = f.sql;
  }
  store.notify('info', f.note, { duration: 5200 });
  void doRun();
}

/* DSL 预览裸插值 → highlightJson（dslPreview 已是 pretty 串，着色 + json-view 全局范式） */
const dslHtml = computed(() => highlightJson(dslPreview.value ?? ''));
/* 结果行走 MetaStrip 统一件——行/列计数保留 fmtNum 千分位口径；
 cursor 段 warn tone（结果集未取完，SQL 通道无 total 假分母口径不变） */
const resultMeta = computed<MetaStripItem[]>(() => [
  { value: fmtNum(rows.value.length), label: '行' },
  { value: fmtNum(cols.value.length), label: '列' },
  ...(timeZone.value ? [{ value: timeZone.value, label: '时区', tip: '结果日期列按此 SQL time_zone 渲染；cursor 续页沿用同一口径' }] : []),
  ...(cursor.value ? [{ value: '有更多', label: 'cursor', tone: 'warn' as const, tip: '结果集未取完，点「下一页」继续取' }] : []),
  ...(runScope.value ? [{
    value: runScope.value.kind === 'statement' ? '语句' : '选段',
    label: runScope.value.kind === 'statement' ? '仅执行当前语句' : '仅执行片段',
    tone: 'info' as const,
    tip: runScope.value.kind === 'statement'
      ? '结果来自光标所在的那一条 SQL，不是整篇内容；改到该条外也会标过期'
      : `结果来自编辑器中选中的 ${runScope.value.text.split('\n').length} 行 SQL，不是整篇内容；改到选区外也会标过期`,
  }] : []),
  ...(resultStale.value ? [{ value: '已过期', label: staleLabel.value, tone: 'warn' as const, tip: '当前结果来自上一次执行的 SQL；重新执行以更新' }] : []),
]);

/* SQL 失能自救——并发探测宿主+全部连接档案，可用则一键切换重跑，不留死胡同 */
const probing = ref(false);
const probed = ref(false);
const probedN = ref(0);
const sqlCapable = ref<Array<{ id: string; name: string }>>([]);
/* 探测结论 5 分钟缓存（集群 SQL 能力短期不变）——反复触发降级时秒回，不重复打全部集群 */
const PROBE_CACHE_KEY = 'esquerystudio.sql.probe-cache';
const PROBE_TTL = 5 * 60 * 1000;
async function probeSqlTargets() {
  const cached = (() => {
    try {
      const c = JSON.parse(sessionStorage.getItem(PROBE_CACHE_KEY) || 'null');
      return c && c.exclude === store.target && Date.now() - c.ts < PROBE_TTL ? c : null;
    } catch { return null; }
  })();
  if (cached) {
    sqlCapable.value = cached.hits; probedN.value = cached.n; probed.value = true;
    return;
  }
  probing.value = true; probed.value = false; sqlCapable.value = [];
  try {
    if (!store.conns.length) await store.loadConns();
    const cands: Array<{ id: string; name: string }> = [
      ...(store.hostVisible && auth.canSeeConn('host') ? [{ id: '', name: '宿主集群' }] : []),
      ...store.conns.filter(c => auth.canSeeConn(c.id)).map(c => ({ id: c.id, name: c.name })),
    ].filter(c => c.id !== store.target); // 当前目标已证不可用，跳过
    probedN.value = cands.length;
    const hits = await Promise.all(cands.map(async c => {
      try { const r = await api.sqlProbe(c.id); return r?.available !== false ? c : null; }
      catch { return null; }
    }));
    sqlCapable.value = hits.filter((x): x is { id: string; name: string } => !!x);
    try {
      writeStoredRaw(sessionStorage, PROBE_CACHE_KEY, JSON.stringify({ ts: Date.now(), exclude: store.target, hits: sqlCapable.value, n: probedN.value }));
    } catch { /* 存储满容忍 */ }
  } finally { probing.value = false; probed.value = true; }
}
function switchAndRerun(c: { id: string; name: string }) {
  /* 切 target 会按 key 整页重挂载，直接 doRun 的结果会写进已卸载的旧实例——
 改走 prefill 键，新实例 onMounted 消费后自动执行（与命令面板快速 SQL 同一链路） */
  writeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill', sql.value);
  /* 1071：切集群重跑同样要带上参数，否则重跑的「同一条 SQL」语义已变 */
  const carryParams = paramsText.value.trim();
  if (carryParams) writeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill.params', carryParams);
  else removeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill.params');
  store.setTarget(c.id, c.name);
  store.notify('success', `已切换到「${c.name}」，正在重跑 SQL`);
}
const busy = ref(false);
/* 1388：自动补引号的「教一次」记忆（索引名 → 已提示）。同一条稿反复重查
 （排序/下钻/翻页）只教一次；换索引才再提示。会话级即可，不落盘。 */
const autoQuoteTaught = new Set<string>();
const qr = useQueryRun(); // 长查询读秒 + 取消（ 范式）

/* 原始 IO 快查——取记录环最近一条本页执行链记录开弹窗；判空口径见 openRawIo（548 统一 notify）。
 特征收紧：doRun 每次成功后 fire-and-forget 追发的 /cluster/sql/translate（见 doRun
 尾部）也落账且恒新于执行记录，旧特征 last('/cluster/sql/') 常态误中 translate——用户点「原始 IO」
 看到的是 translate 而非执行结果。
 546 find 补丁退役 → last('/cluster/sql/', 'sql') 双参收口——api 层对执行链
 （query/lenient/cursor/close）经 ioKind 通道打标 kind='sql'，translate 未打标天然排除，
 546 收紧语义等价（历史保留备查）。 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  /* 550 双参收口（546 find 补丁退役）：kind='sql' 只落在执行链，translate 天然排除 */
  const rec = ioRecorder.last('/cluster/sql/', 'sql');
  /* W3 判空口径统一（546 裁决=notify 不开空弹窗，rawIoPave546 六视图同款形态同步更新）：
 无记录 notify 引导并返回，不再以空 rec 开弹窗（EmptyState 仍归 RawIoModal 自身兜底） */
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

/* 1058：场景模板按 mapping 业务角色绑定字段——不再写死 status/score/tags 等假字段。
   need 声明模板依赖的角色；缺角色时入口置灰并说明（行内“缺 …”），点击只解释不插入，
   不伪造字段、不生成注定报错的 SQL。 */
type TmplRole = 'date' | 'entity' | 'category' | 'text';
interface SqlTemplate { k: string; desc: string; sql: string; need?: TmplRole[] }
const TEMPLATES: SqlTemplate[] = [
  { k: 'top100', desc: '前 100 条', sql: 'SELECT * FROM "my-index" LIMIT 100' },
  { k: 'recent7d', desc: '最近 7 天', sql: 'SELECT * FROM "my-index" WHERE {date} >= NOW() - INTERVAL 7 DAY ORDER BY {date} DESC LIMIT 100', need: ['date'] },
  { k: 'daily', desc: '每日趋势', sql: 'SELECT HISTOGRAM({date}, INTERVAL 1 DAY) AS day, COUNT(*) AS cnt FROM "my-index" GROUP BY day ORDER BY day ASC LIMIT 60', need: ['date'] },
  { k: 'entity-top', desc: '主体 Top20', sql: 'SELECT {entity} AS name, COUNT(*) AS cnt FROM "my-index" GROUP BY {entity} ORDER BY cnt DESC LIMIT 20', need: ['entity'] },
  { k: 'category-top', desc: '分类分布', sql: 'SELECT {category} AS bucket, COUNT(*) AS cnt FROM "my-index" GROUP BY {category} ORDER BY cnt DESC LIMIT 20', need: ['category'] },
  { k: 'text-like', desc: '关键词检索', sql: "SELECT * FROM \"my-index\" WHERE {text} LIKE '%error%' LIMIT 50", need: ['text'] },
  { k: 'null-audit', desc: '空值体检', sql: 'SELECT * FROM "my-index" WHERE {category} IS NULL LIMIT 100', need: ['category'] },
];
const ROLE_LABEL: Record<TmplRole, string> = { date: 'date 字段', entity: '主体/名称字段', category: '分类字段', text: 'text 字段' };
const SQL_KW_TYPES = new Set(['keyword', 'constant_keyword', 'wildcard', 'ip', 'version']);
const isMultiField = (path: string) => path.endsWith('.keyword');

/** 角色 → 当前索引真实字段（只返回可绑定候选，宁少勿假）：
    text 取任意 text 系字段；entity 优先 keyword 实体字段，退化到 text 实体的 .keyword 子域；
    category 只要 keyword 族（排除 .keyword 多字段，避免把 title.keyword 当业务分类）。 */
function pickRoleFields(role: TmplRole): string[] {
  const fs = sqlFieldsCtx.fields.value;
  if (!fs.length) return [];
  if (role === 'date') return fs.filter(f => f.type === 'date' || f.type === 'date_nanos').map(f => f.path);
  if (role === 'text') return fs.filter(f => f.type === 'text' || f.type === 'match_only_text').map(f => f.path);
  if (role === 'category') {
    return fs.filter(f => SQL_KW_TYPES.has(f.type) && !isMultiField(f.path) && fieldRoleOf(f.path, f.type) === 'category').map(f => f.path);
  }
  const kw = fs.filter(f => SQL_KW_TYPES.has(f.type) && !isMultiField(f.path) && fieldRoleOf(f.path, f.type) === 'entity').map(f => f.path);
  if (kw.length) return kw;
  return fs.filter(f => f.type === 'text' && fieldRoleOf(f.path, f.type) === 'entity'
    && fs.some(x => x.path === f.path + '.keyword')).map(f => f.path + '.keyword');
}
function missingRoles(t: SqlTemplate): string[] {
  return (t.need || []).filter(r => !pickRoleFields(r).length).map(r => ROLE_LABEL[r]);
}
const TEMPLATES_VIEW = computed(() => TEMPLATES.map(t => {
  const missing = missingRoles(t);
  /* 1101：可用模板先把「会绑定到哪些字段」亮出来——点开前就知道自动匹配结果 */
  const binds = (t.need || []).map(r => pickRoleFields(r)[0]).filter(Boolean);
  return { ...t, missing, ready: missing.length === 0, binds };
}));

/* 1045→1058：模板落地即绑定当前索引与角色字段。占位符 {date}/{entity}/{category}/{text}
   由 mapping 解析；缺字段模板不插入（no fake fields）。 */
async function applyTemplate(t: SqlTemplate) {
  try { await sqlFieldsCtx.ensure(); } catch { /* 字段源失败：按缺字段处理 */ }
  const missing = missingRoles(t);
  if (missing.length) {
    store.notify('info', `模板「${t.desc}」缺少${missing.join('、')}：当前语句目标索引没有该字段——换一个索引（顶栏选择或改写 FROM）`);
    return;
  }
  /* 1081：模板落到语句实际目标索引（FROM 优先）——字段角色也取自同一索引，
     不能出现「字段来自 A、表名却写顶栏 B」的注定报错 SQL */
  const tplIdx = effectiveSqlIndex.value;
  const idx = tplIdx ? `"${tplIdx}"` : '"my-index"';
  let next = t.sql.replace(/"my-index"/g, idx).replace(/\{index\}/g, idx);
  const binds: string[] = [];
  for (const r of t.need || []) {
    const f = pickRoleFields(r)[0];
    next = next.replace(new RegExp(`\\{${r}\\}`, 'g'), f);
    binds.push(f);
  }
  sql.value = next;
  if (tplIdx) {
    store.notify('info', `模板已绑定索引 ${tplIdx}${tplIdx === store.pickedIdx ? '' : '（跟随 FROM）'}${binds.length ? ' · ' + binds.join(' · ') : ''}`, { duration: 2600 });
  }
}
function loadSample() {
  void applyTemplate(TEMPLATES[0]);
}

/* 1075：统一行形态——原生 rows 优先；columnar 响应 values 转行（畸形返回 []，不伪造） */
function sqlRowsOf(r: any): any[][] {
  if (Array.isArray(r?.rows)) return r.rows;
  return columnarToRows(r?.values);
}
/* translate 不吃 columnar（转 DSL 与行/列形态无关） */
function withoutColumnar(body: string): string {
  try {
    const o = JSON.parse(body);
    delete o.columnar;
    return JSON.stringify(o);
  } catch { return body; }
}
function buildBody(text = sql.value): string {
  const b: any = { query: text };
  /* ES SQL fetch_size 上限 10000：输入框 max 属性拦不住键入与偏好落盘的超限值，
     超限直发会被 ES 400 拒——构建时夹取兜底；非正数维持不进构建体（走 ES 默认） */
  if (fetchSize.value > 0) b.fetch_size = Math.min(fetchSize.value, 10000);
  /* 1055：非空才写 time_zone（空 = 跟随集群默认 UTC，不伪造参数） */
  if (timeZone.value) b.time_zone = timeZone.value;
  if (pageTimeout.value) b.page_timeout = pageTimeout.value;
  if (columnar.value) b.columnar = true;
  /* 1070：合法且非空的数组才写 params；非法 JSON 由 doRun 前置拦截（不静默丢参数执行） */
  const pp = paramParse.value;
  if (pp.ok && pp.value.length) b.params = pp.value;
  return JSON.stringify(b);
}

/* 1128：当前编辑器选区 → 执行范围。编辑器实例未就绪/无选区/纯空白 → null（整篇）。
   点「执行」时焦点已离开编辑器，选区仍在 Monaco 里，与 Ctrl+Enter 同源取。 */
function currentSelectionScope(): SqlScope | null {
  const ed = sqlMonaco.value?.getEditor?.();
  const model = ed?.getModel?.();
  const sel = ed?.getSelection?.();
  if (!ed || !model || !sel) return null;
  return selectionScope(sql.value, model.getOffsetAt(sel.getStartPosition()), model.getOffsetAt(sel.getEndPosition()));
}

async function doRun() {
  /* 2.1.6：执行体防重（Ctrl+Enter/自动预填与按钮同汇入；按钮 disabled 之外的第二道门） */
  if (busy.value) return;
  if (!sql.value.trim()) return;
  const pp = paramParse.value;
  if (!pp.ok) {
    paramOpen.value = true;
    store.notify('error', 'SQL 参数无法解析：' + pp.error);
    return;
  }
  /* 1128/1129：优先跑选段；没有选区且稿内有多个顶层语句时跑光标所在语句；
     单语句稿维持整篇（行为零变化）。分号是客户端语句分隔符，执行前剥掉尾分号；
     请求体/历史/预览都绑这段文本，过期判定仍绑整篇快照。 */
  const forced = forcedRunScope;
  forcedRunScope = null;
  const picked = currentSelectionScope();
  const scope = forced ?? picked ?? (multiStmt.value ? cursorStmt.value : null);
  const execSnapshot = scope ? scope.text.replace(/;+\s*$/, '') : sql.value;
  /* 1386：FROM 里的索引名没加双引号时自动补上（只在**发出去的文本**上改，
     编辑器里的稿子保持用户原样）。用户原话：「索引要求 ""，但用户自己录入的
     索引名字没有带 ""，直接报错体验很差」。只在名字确实命中已知索引时才改，
     通配符/多表/子查询/已有引号一律不动。 */
  const quotedFix = autoQuoteFromIndex(execSnapshot, sqlIndexPool.value);
  const execSql = quotedFix.sql;
  /* 新查询开始即释放上一轮 cursor（服务端上下文），旧行在成功回包前继续可见 */
  if (cursor.value) void closeCursorQuiet();
  busy.value = true; unavailable.value = false; reason.value = ''; runErr.value = ''; runErrObj.value = null;
  runErrSql.value = '';
  runErrScope.value = null;
  syncRunErrMarker();
  resultStale.value = false;
  const signal = qr.begin();
  /* 执行现场快照：参数/文本在 await 期间可能被继续编辑，历史与 cursor 必须绑定
     实际发出去的那一份（否则「回放」记到新稿、cursor 续页绑到新参数）。 */
  const sqlSnapshot = sql.value;
  const paramsSnapshot = pp.value.length ? paramsText.value.trim() : undefined;
  const body = buildBody(execSql);
  /* 1386：告诉用户「这次帮你补了引号」——静默改写会让人以为编辑器里本来就带引号，
     下次复制走那段 SQL 又踩同一个坑。提示里给出正式写法，教一次。
     1388：同一条 SQL 反复重查（表头排序、下钻、翻页）不该每次都弹——见过一次就够了，
     按「索引名」记忆，改的是稿子（换索引/别名）才会再教一回。 */
  if (quotedFix.quoted && !autoQuoteTaught.has(quotedFix.quoted)) {
    autoQuoteTaught.add(quotedFix.quoted);
    store.notify('info', `索引名「${quotedFix.quoted}」已自动加双引号后执行（ES SQL 要求标识符带引号；编辑器原文未改动）`, { duration: 3600 });
  }
  try {
    runLenient.value = lenient.value;
    const r = lenient.value ? await api.sqlLenient(body, signal) : await api.sqlJson(body, signal);
    if (r?.available === false) { unavailable.value = true; reason.value = r.reason || ''; return; }
    if (!hasSqlRowsShape(r)) throw new Error('SQL 响应形态异常：缺少 rows/values（未按 0 行成功处理）');
    cols.value = r.columns || [];
    rows.value = sqlRowsOf(r);
    cursor.value = r.cursor || null;
    cursorSql.value = r.cursor ? sqlSnapshot : null;
    /* 1082：记下这次实际执行的输入；若执行期间用户已改稿，结果立刻标过期。
       1126：成功回包按快照重算 stale——程序化改稿后立即重跑（下钻/窗口自救）时，
       watch(sql) 会在 run 起手清标后又把它置 true；回包与快照一致必须清掉。 */
    runSql.value = sqlSnapshot;
    runParams.value = paramsSnapshot ?? '';
    const paramsNow = paramParse.value.ok && paramParse.value.value.length ? paramsText.value.trim() : '';
    const inputChanged = sql.value !== sqlSnapshot || paramsNow !== runParams.value;
    resultStale.value = inputChanged;
    if (inputChanged) {
      staleLabel.value = '执行期间输入已修改';
    }
    runSeq.value++; // ：新结果回到 SQL 原始行序（重挂表重置排序），避免陈旧排序误导
    runScope.value = scope;
    /* 1439：顶栏跟随 SQL FROM——用户反馈「查询的不是这个索引」（FROM 指向 A、
       顶栏还停在 B，字段补全/体检却按 A 解释）。成功回包才切：失败/索引不存在不动；
       多表/通配 indexFromSql 返回空也不猜；执行期间稿子已改成别的 FROM 时不抢上下文。 */
    const executedIdx = indexFromSql(execSql, sqlIndexPool.value);
    if (!inputChanged && executedIdx && executedIdx !== store.pickedIdx
        && sqlIndexPool.value.includes(executedIdx)) {
      store.pick(executedIdx);
      store.notify('info', `顶栏索引已跟随 SQL FROM 切到「${executedIdx}」`, { duration: 2800 });
    }
    /* 执行成功记跨模式历史（目标索引从实际执行的文本推导，选段/整篇同口径）；
       1071：参数一并入历史，回放时恢复，避免带 ? 的语句回放变成无参执行 */
    useQueryHistoryStore().push('sql', execSnapshot, indexFromSql(execSnapshot, sqlIndexPool.value) || indexOf(), undefined, true, paramsSnapshot, sqlRunOpts());
    /* W10：run 成功后台顺带 translate——试跑→落 DSL 由 2 击减 1 击
 （此前必须「转 DSL」→「到 DSL 页」两步才能深跳）。fire-and-forget：不置 busy、
 不阻塞结果展示；实参 buildBody() 在此求值即 SQL 快照，稍后改稿不串味。
 失败静默——预览不出，「到 DSL 页」原 disabled 语义自兜底。 */
    void api.sqlTranslate(withoutColumnar(body)).then(r => {
      if (!r || r.available === false) return;
      dslPreview.value = JSON.stringify(r, null, 2);
      /* 1125：预览绑定实际执行的 SQL 快照（执行期间改稿→立即标过期） */
      dslPreviewSql.value = sqlSnapshot;
      dslPreviewIdx.value = indexFromSql(execSnapshot, sqlIndexPool.value) || indexOf();
    }).catch(() => { /* translate 失败不干扰查询结果 */ });
  } catch (e: any) {
    /* 主动取消不报失败（DslQueryView 取消甄别同语义）：轻提示即返，错误面板留给真失败。
       已有旧行时必须标过期——否则用户会把上一轮结果当成这次被取消查询的产物。 */
    if (e?.name === 'AbortError') {
      if (rows.value.length) {
        resultStale.value = true;
        staleLabel.value = '查询已取消';
      }
      store.notify('info', `已取消查询（${(qr.elapsedMs.value / 1000).toFixed(1)}s）${rows.value.length ? ' · 旧结果已标记过期' : ''}`);
      return;
    }
    runErr.value = String(e?.message || e);
    runErrObj.value = e; /* ：原始错误对象旁路留存（压串前的 ApiError 供 errMeta） */
    runErrSql.value = sqlSnapshot;
    runErrScope.value = scope;
    syncRunErrMarker();
    /* 1122：失败语句也入历史（ok=false + 错误摘要）——生产排障常要从失败现场回填/重试；
       与成功条目同键去重，重跑成功会清掉错误摘要。 */
    try {
      useQueryHistoryStore().push('sql', execSnapshot, indexFromSql(execSnapshot, sqlIndexPool.value) || indexOf(), undefined, false, paramsSnapshot, sqlRunOpts(), runErr.value);
    } catch { /* 历史失败不阻塞错误面板 */ }
    if (rows.value.length) {
      resultStale.value = true;
      staleLabel.value = '查询失败';
    }
    /* toast 裸串并轨 friendlyEsError（vrErr 面板 口径，obsWave560 FFE 同范式） */
    store.notify('error', 'SQL 执行失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { busy.value = false; qr.finish(); }
}

/* 命令面板/跨模式回放的预填自动执行：身份探测是异步的，probe 未落地时不能直接发；
   无鉴权部署 authDisabled 必须放行，普通读者按「search 页读权限」放行（不是写权限）。
   被门挡住的预填挂起一次，身份/目标变化后补跑，避免静默丢稿。 */
let prefillAutoPending = false;
const prefillAutoAllowed = () => auth.authDisabled
  || !auth.probeStarted /* 探测未启动（无鉴权嵌入/测试宿主）视同身份已定，与 Dsl/Lucene/Sandbox/Bridge 同口径 */
  || (auth.probed && auth.me != null && auth.canReadPage('search', store.target));
watch(() => [auth.probed, auth.authDisabled, auth.me?.username, store.target], () => {
  if (!prefillAutoPending || !prefillAutoAllowed()) return;
  prefillAutoPending = false;
  doRun();
});

/* 命令面板「快速 SQL」预填接收，进页自动执行 */
onMounted(() => {
  /* 静态演示：带一条可执行 SQL 进来，等首帧落定后自动跑一次，打开就是结果现场。 */
  if (isDemoMode && sql.value.trim()) {
    setTimeout(() => { try { doRun(); } catch { /* demo 查询失败不影响页面 */ } }, 600);
  }
  /* 1058：模板可用性随 mapping 角色判定——进页即拉字段，缺字段模板显式置灰
     （1080：字段源读 effectiveSqlIndex 的 FROM 优先于顶栏选中） */
  if (effectiveSqlIndex.value) void sqlFieldsCtx.ensure();
  /* W2 批：SQL 补全单例——字段源吃当前工作索引（与顶栏选中同源），FROM 表名位由单例模块内部解析 */
  sqlCompletion = ensureSqlCompletion(monaco, sqlCtx);
  /* 1071：跨模式历史回放会随 SQL 一起投递参数快照（无参数则不留旧键） */
  const prefillParams = sessionStorage.getItem('esquerystudio.sql.prefill.params');
  if (prefillParams != null) {
    removeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill.params');
    paramsText.value = prefillParams;
    paramOpen.value = true;
  }
  /* 1086：收藏/回放携带的索引现场——先切源再执行（无键则维持顶栏选择） */
  const prefillIdx = sessionStorage.getItem('esquerystudio.sql.prefill.index');
  if (prefillIdx != null) {
    removeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill.index');
    if (prefillIdx && prefillIdx !== store.pickedIdx) store.pick(prefillIdx);
  }
  /* 1087：执行选项随收藏/回放恢复（数值夹取同 buildBody 口径） */
  const prefillOpts = sessionStorage.getItem('esquerystudio.sql.prefill.opts');
  if (prefillOpts != null) {
    removeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill.opts');
    try {
      const o = JSON.parse(prefillOpts) || {};
      applySqlOpts(o);
    } catch { /* 损坏的选项快照不阻塞 SQL 回放 */ }
  }
  const prefill = sessionStorage.getItem('esquerystudio.sql.prefill');
  if (prefill) {
    removeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill');
    sql.value = prefill;
    /* 身份/读页门：probe 未落地不发；无鉴权/有读页权限才自动执行 */
    if (prefillAutoAllowed()) doRun();
    else prefillAutoPending = true;
  }
});

/* 页内历史回放/回填——play=回填草稿并执行、fill=仅回填。
 草稿通道=useScopedDraft sql，与手工编辑同一条写入路径 */
const qh = useQueryHistoryStore();
const histOpen = ref(false);
const histRows = computed(() => qh.items.filter(i => i.mode === 'sql').map(i => {
  const sub = describeSqlOpts(i.opts);
  return sub ? { ...i, sub } : i;
}));
function replayHistRow(row: { query: string; params?: string; index?: string; opts?: Record<string, unknown> }, runIt: boolean) {
  /* 1085：历史条目记录的索引现场先还原（QueryHub 跨模式 SQL 回放同语义），
     否则历史来自 A、顶栏停在 B 时，补全与「字段体检」会以 B 为底稿解释 A 的语句 */
  const idx = row.index || '';
  if (idx && idx !== store.pickedIdx) {
    store.pick(idx);
    store.notify('info', `已切到历史记录索引 ${idx} 并回放 SQL`);
  }
  /* 1089：执行选项一并还原（时区/页超时/列式/宽容/取数） */
  if (row.opts) applySqlOpts(row.opts);
  sql.value = row.query;
  /* 1071：参数随查询文本一起恢复；旧条目无参数则清空当前参数（如实还原当时现场，
     不让上一轮参数偷偷套到另一条 SQL 上） */
  paramsText.value = row.params || '';
  if (row.params) paramOpen.value = true;
  histOpen.value = false;
  if (runIt) doRunAuto();
}

/* 历史回放自动执行的身份门（1124）：与命令面板预填同口径——回放载荷可能来自上一账号，
   probe 未落地时旧 target 的查询会先发出去。手动点「执行」不拦，后端仍按 search 页读键裁决。 */
function doRunAuto() {
  if (prefillAutoAllowed()) { prefillAutoPending = false; void doRun(); return; }
  prefillAutoPending = true;
}
onBeforeUnmount(() => { void closeCursorQuiet(); });
onBeforeUnmount(() => { sqlCompletion?.dispose(); sqlCompletion = null; });

/* W2 批：SQL 补全单例上下文（闭包现读，注册不随数据变化重挂）。
   1080：字段源跟随语句自身的 FROM（单个索引），裸词只认已加载清单；
   通配/多表/派生表回落顶栏选中——补全、列名纠错、字段体检、历史推导同源。 */
const sqlIndexPool = computed(() => store.indices.map(i => String(i.index || '')).filter(Boolean));
const sqlFromIdx = computed(() => indexFromSql(sql.value, sqlIndexPool.value));
const effectiveSqlIndex = computed(() => sqlFromIdx.value || store.pickedIdx || '');
const fromMismatch = computed(() => !!sqlFromIdx.value && !!store.pickedIdx && sqlFromIdx.value !== store.pickedIdx);
const sqlFieldsCtx = useIndexFields(() => effectiveSqlIndex.value);
/* 改 FROM / 换顶栏索引：先清旧字段清单再拉新 mapping（回包前不混用上一个索引的字段做补全/纠错） */
watch(effectiveSqlIndex, idx => { sqlFieldsCtx.reset(); if (idx) void sqlFieldsCtx.ensure(); });
function sqlCtx(): SqlCompletionCtx {
  return {
    indices: () => store.indices,
    pickedIdx: () => effectiveSqlIndex.value,
    curFields: () => sqlFieldsCtx.fields.value,
    /* 去 void 包装直返 Promise（契约本就 void|Promise<void>，④值位冷缓存首轮
 await 到位再分派—— ③A3 契约半边补齐） */
    ensureCurFields: () => sqlFieldsCtx.ensure(),
  };
}
let sqlCompletion: { dispose(): void } | null = null;

/* 字段体检 */
/* 目标索引提取走 FROM 锚定——SELECT 列表的引号串是列名（如 SELECT "status" … FROM "idx"），
 全文首个引号串会把列名当索引用，字段体检/历史推导随之错位；1080 起与补全/纠错同源 */
function indexOf(): string {
  return effectiveSqlIndex.value;
}
async function doSchema() {
  const idx = indexOf();
  if (!idx) { store.notify('warning', '未探测到目标索引（SQL FROM 或側栏选中）'); return; }
  busy.value = true;
  try {
    const r: any = await api.resolveSchema(idx);
    schemaWarnings.value = r?.warnings || [];
    if (!schemaWarnings.value.length) store.notify('success', `体检完成：${idx} 无 SQL 限制风险`);
    else store.notify('warning', `${idx} 命中 ${schemaWarnings.value.length} 项 SQL 失能字段，详情见下方面板`);
  } catch (e: any) { store.notify('error', '字段体检失败：' + friendlyEsError(String(e?.message ?? e))); } /* ：裸串并轨 */
  finally { busy.value = false; }
}

async function nextPage() {
  if (!cursor.value) return;
  /* 1045：cursor 属于产生它的 SQL 快照；改稿后禁止续取，避免旧页拼进新结果 */
  if (cursorSql.value !== null && sql.value !== cursorSql.value) {
    await closeCursorQuiet();
    resultStale.value = true;
    staleLabel.value = 'SQL 已修改';
    store.notify('warning', 'SQL 已修改，上次查询的 cursor 已关闭——请重新执行后再翻页');
    return;
  }
  busy.value = true;
  try {
    const r = await api.sqlCursor(cursor.value, timeZone.value || undefined, columnar.value || undefined);
    if (!hasSqlRowsShape(r)) {
      store.notify('error', '分页响应形态异常（缺少 rows/values）；cursor 已保留，可重试');
      return;
    }
    const add = sqlRowsOf(r);
    rows.value = rows.value.concat(add);
    cursor.value = r.cursor || null;
    store.notify('success', `已加载 ${add.length} 行`);
  } catch (e: any) {
    store.notify('error', '分页失败：' + friendlyEsError(String(e?.message ?? e)) + '（cursor 已保留，可重试）'); /* ：裸串并轨 */
  } finally { busy.value = false; }
}

/* 静默释放 cursor（改稿/重跑/卸载）——不弹成功 toast，避免编辑时噪音 */
async function closeCursorQuiet() {
  const c = cursor.value;
  cursor.value = null;
  cursorSql.value = null;
  if (!c) return;
  try { await api.sqlClose(c); } catch { /* 服务端上下文可能已过期：静默 */ }
}

async function closeCursor() {
  if (!cursor.value) return;
  try { await api.sqlClose(cursor.value); cursor.value = null; cursorSql.value = null; store.notify('success', 'cursor 已关闭'); }
  catch (e: any) { store.notify('error', '关闭失败：' + friendlyEsError(String(e?.message ?? e))); } /* ：裸串并轨 */
}

async function doTranslate() {
  busy.value = true;
  const sqlAt = sql.value;
  /* 1128/1129：选中一段只翻译这段；多语句稿无选区时翻译光标所在语句——与执行同源 */
  const picked = currentSelectionScope();
  const scope = picked ?? (multiStmt.value ? cursorStmt.value : null);
  const text = scope ? scope.text.replace(/;+\s*$/, '') : sql.value;
  try {
    const r = await api.sqlTranslate(withoutColumnar(buildBody(text)));
    if (r?.available === false) { unavailable.value = true; reason.value = r.reason || ''; return; }
    dslPreview.value = JSON.stringify(r, null, 2);
    previewOpen.value = true;
    /* 1125：快照是请求时的 SQL；await 期间改稿则预览立即进入过期态 */
    dslPreviewSql.value = sqlAt;
    dslPreviewIdx.value = indexFromSql(text, sqlIndexPool.value) || indexOf();
  } catch (e: any) {
    store.notify('error', 'translate 失败：' + friendlyEsError(String(e?.message ?? e))); /* ：裸串并轨 */
  } finally { busy.value = false; }
}

function copyDsl() {
  if (!dslPreview.value) return;
  /* 诚实口径扫尾（282 复查漏网） */
  copyText(dslPreview.value).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制 DSL' : '复制失败'));
}

/* 1135：局部结果的动作若稿未变——只改执行过的那条语句，并强制下一次重跑它。
   返回 false 表示稿已改/没有局部范围，调用方走复制降级。 */
function rewriteRunScope(nextText: string, note: string): boolean {
  const sc = runScope.value;
  if (!sc || sql.value !== runSql.value) return false;
  sql.value = replaceScopeText(sql.value, sc, nextText);
  forcedRunScope = { ...sc, text: nextText, end: sc.start + nextText.length };
  store.notify('info', note);
  void doRun();
  return true;
}

/* 1126：结果单元格 → 查询条件下钻（与 DSL 命中表 filter-hit 同动线）。
   简单 SELECT 追加 WHERE 并重查；GROUP BY/JOIN/派生表不猜，降级为复制条件。 */
async function useAsCondition({ field, value, type, not }: { field: string; value: unknown; type?: string; not?: boolean }) {
  const negate = !!not;
  const verb = negate ? '排除' : '追加';
  /* 1128/1135：结果来自局部执行时，稿未变就只改那条语句并重跑它（不再要求用户手动改）；
     稿已改/结构不支持才降级为复制条件。 */
  const sc = runScope.value;
  if (sc && (sc.start > 0 || sc.end < sql.value.length)) {
    if (sql.value === runSql.value) {
      const sr = appendSqlFilter(sc.text, field, value, type, negate);
      if (sr && rewriteRunScope(sr.sql, `已在当前语句${verb}条件 ${sr.predicate}，正在重查`)) return;
    }
    const p = sqlPredicate(field, value, type, negate);
    if (!p) { store.notify('warning', '该列名无法安全转成 SQL 条件'); return; }
    const copied = await copyText(p);
    store.notify('warning', `当前结果来自局部执行（选段/单条语句），不自动改写整篇 SQL；${copied ? '条件已复制：' + p : '复制条件失败'}`);
    return;
  }
  const r = appendSqlFilter(sql.value, field, value, type, negate);
  if (r) {
    sql.value = r.sql;
    store.notify('info', `已${verb}条件 ${r.predicate}，正在重查`);
    void doRun();
    return;
  }
  const p = sqlPredicate(field, value, type, negate);
  if (!p) { store.notify('warning', '该列名无法安全转成 SQL 条件'); return; }
  const ok = await copyText(p);
  store.notify('warning', `当前 SQL 含 GROUP BY/JOIN/派生表，不自动改写；${ok ? '条件已复制：' + p : '复制条件失败'}`);
}

/* 1132：结果列 → 查询级排序（改顶层 ORDER BY 并重查），与表头本地排序语义分开。
   局部执行（选段/光标语句）时不猜整篇；UNION/派生表/不安全列名降级复制排序子句。 */
async function sortByColumn({ field, dir }: { field: string; dir: 'asc' | 'desc' }) {
  const ident = '"' + String(field).replace(/"/g, '""') + '"';
  const clause = `ORDER BY ${ident} ${dir === 'asc' ? 'ASC' : 'DESC'}`;
  const sc = runScope.value;
  if (sc && (sc.start > 0 || sc.end < sql.value.length)) {
    if (sql.value === runSql.value) {
      const sr = appendSqlOrder(sc.text, field, dir);
      if (sr && rewriteRunScope(sr.sql, `已在当前语句按 ${field} ${dir === 'asc' ? '升序' : '降序'}排序，正在重查`)) return;
    }
    const copied = await copyText(clause);
    store.notify('warning', `当前结果来自局部执行（选段/单条语句），不自动改写整篇 SQL；${copied ? '排序子句已复制：' + clause : '复制失败'}`);
    return;
  }
  const r = appendSqlOrder(sql.value, field, dir);
  if (!r) {
    const copied = await copyText(clause);
    store.notify('warning', `当前 SQL 结构不支持自动改写排序（UNION/派生表或列名不安全）；${copied ? '排序子句已复制：' + clause : '复制失败'}`);
    return;
  }
  sql.value = r.sql;
  store.notify('info', `已按 ${field} ${dir === 'asc' ? '升序' : '降序'}排序，正在重查`);
  void doRun();
}

/* 转出的 DSL 继续去查询工作台调试（复用 SqlBridge 的 esquerystudio.dsl.body 契约） */
function gotoDsl() {
  if (!dslPreview.value) return;
  /* w77 修复:原走 esquerystudio.dsl.body 死信箱(DslQueryView 不读且会被旧稿覆写),改走 ?dsl= 深链 */
  /* 1083：目标索引随语句走——SQL 的 FROM 可能是另一索引，DSL 页若沿用顶栏选中会在错索引上执行 */
  const idx = dslPreviewIdx.value || indexOf();
  router.push({ path: '/search', query: { mode: 'dsl', ...(idx ? { idx } : {}), dsl: encodeDslParam(dslPreview.value) } });
}

/* 1087/1089：执行选项现场（收藏、历史、回放共用一份形状） */
function sqlRunOpts(): Record<string, string | number | boolean> {
  return {
    fetchSize: fetchSize.value,
    ...(timeZone.value ? { timeZone: timeZone.value } : {}),
    ...(pageTimeout.value ? { pageTimeout: pageTimeout.value } : {}),
    ...(columnar.value ? { columnar: true } : {}),
    ...(lenient.value ? { lenient: true } : {}),
  };
}
function applySqlOpts(o: Record<string, unknown>) {
  if (Number.isFinite(o.fetchSize) && Number(o.fetchSize) > 0) fetchSize.value = Math.min(Number(o.fetchSize), 10000);
  if (typeof o.timeZone === 'string') timeZone.value = o.timeZone;
  if (typeof o.pageTimeout === 'string') pageTimeout.value = o.pageTimeout;
  if (typeof o.columnar === 'boolean') columnar.value = o.columnar;
  if (typeof o.lenient === 'boolean') lenient.value = o.lenient;
}

function doFav() {
  /* 1086：收藏=完整现场（索引 + 参数）——只存 SQL 会让回放在别的索引/丢参数下重跑 */
  const idx = indexOf();
  const params = paramParse.value.ok && paramParse.value.value.length ? paramsText.value.trim() : '';
  /* 1087：执行选项同样影响结果（时区/页超时/列式/宽容/取数）——一并入现场 */
  const opts = sqlRunOpts();
  store.addFavorite({
    kind: 'rest', title: `SQL @${fmtTime(Date.now())}`,
    subtitle: sql.value.slice(0, 100),
    payload: { sql: sql.value, fetchSize: fetchSize.value, ...(idx ? { index: idx } : {}), ...(params ? { params } : {}), opts },
    tags: ['sql'],
  });
  store.notify('success', '已收藏 SQL');
}

/* 1141：CSV/NDJSON 导出退役（宿主手写版）——表格内核「导出 ▾」五格式+NDJSON 单源承接，
 导出注脚经 :export-note 传入（cursor 未取完/结果过期口径不变）。 */

</script>

<style scoped>
/* --sp 间距 token 收口（theme.css:100-103 裁决，只收精确等值字面；
 14/20 等刻意值与 1px/5px 微调保字面） */
.sq-page { padding: var(--sp-3) var(--sp-4) var(--sp-5); }
/* 1353：结果表「更多」菜单——与 QueryResultTable 的 .qrt-menu 同名同形，
 但那边是 scoped（样式不外溢），宿主这一份必须自带：此前只写类名不补样式，
 菜单会掉进文档流把工具栏挤成 3 行（实测）。数值逐字对齐内核口径。 */
.sq-bar-more-wrap { position: relative; display: inline-flex; }
.sq-bar-more { position: absolute; top: calc(100% + var(--sp-1)); right: 0; z-index: 60; background: var(--bg1);
  border: 1px solid var(--line-strong); border-radius: var(--r-m); box-shadow: 0 8px 24px rgba(0, 0, 0, .5);
  padding: var(--sp-1h); min-width: 200px; }
.sq-bar-more .qrt-mi { display: flex; align-items: center; gap: var(--sp-2); width: 100%; padding: var(--sp-1h) var(--sp-2h);
  border: 0; background: transparent; border-radius: var(--r-s); color: var(--tx1); font-size: var(--fs-xs);
  cursor: pointer; text-align: left; white-space: nowrap; }
.sq-bar-more .qrt-mi:hover:not(:disabled) { background: var(--bg2); color: var(--tx0); }
.sq-bar-more .qrt-mi.on { color: var(--ac-hi); }
.sq-bar-more .qrt-m-t { padding: var(--sp-1) var(--sp-2h) 0; font-size: var(--fs-2xs); color: var(--tx2); letter-spacing: .05em; }
.sq-bar-more .qrt-m-sep { height: 1px; background: var(--line); margin: var(--sp-1) var(--sp-2); }
/* 模板侧栏宽度档走 --sq-rail-w（usePref sql.railW，默认 300=原 minmax 上限）。
 模板栏改**浮层**——此前它是 grid 第二列，展开时把编辑器挤到 840px，
 而结果区 `.sq-sec.wide` 横跨两列占满 1152px，上下右缘差 312px（实际使用中反馈"不对齐"）。
 改成：grid 恒单列（编辑器始终满宽，与结果区右缘对齐）；模板栏绝对定位浮在编辑器右上方，
 不占栅格。浮层用与表格卡头同族的底色/描边/阴影，并限制高度内滚。 */
.sq-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--sp-3); min-height: 0; position: relative; }
.sq-samples {
  /* 下移到卡头之下——卡头右侧是 fetch_size / time_zone / page_timeout 等控件，
     浮层若贴 top:0 会把它们盖住（实测截图：page_timeout 被切成 "page_time"）。
     卡头高约 30px，+gap 留出呼吸后再起浮。 */
  position: absolute; top: 38px; right: 0; z-index: 5;
  width: var(--sq-rail-w, 300px); max-height: min(420px, calc(34vh - 50px)); overflow-y: auto;
  background: var(--card-bg); border: 1px solid var(--line-strong); border-radius: var(--r-m);
  box-shadow: var(--shadow-pop);
}
/* 编辑器折叠：只保留卡头工具行（fetch_size/time_zone/参数仍可达），结果区上移；
   展开走同一行高链恢复，无遗留高度（折叠段不留标题条/空档）。 */
.sq-grid.editor-collapsed,
.sq-grid.editor-collapsed:has(.sq-sql-lint),
.sq-grid.editor-collapsed:has(.sq-cost-hint) { grid-template-rows: auto; }
.sq-editor.collapsed > :deep(.monaco-host),
.sq-editor.collapsed > .sq-param-bar,
.sq-editor.collapsed > .sq-sql-lint,
.sq-editor.collapsed > .sq-cost-hint { display: none; }
/* SQL 编辑器弹性（原 170px 写死）：首行行高 minmax(150px, 34vh) 随视口伸缩、150px 兜底；
 1136：42vh→34vh 把高度让给结果网格（DBX 式结果优先，编辑器内部仍可滚动）；
 页面需随结果表滚动，故不能把整页锁 100% 高，只弹编辑器行 */
.sq-grid { grid-template-rows: minmax(150px, 34vh); }
/* 1.0.45 · 结果优先：有结果表时编辑器收至 22vh（约 8 行），把释放的高度全部给表格；
   空态/首次编辑仍保留 34vh。用户仍可用「编辑器」折叠钮进一步让位。 */
.sq-grid:has(.sq-sec.wide) { grid-template-rows: minmax(120px, 22vh); }
.sq-editor { display: flex; flex-direction: column; min-height: 0; }
/* 编辑器壳退役（约定③）后 Monaco 100% 高容器防撑破 overflow 承接保留
 （rd/sy 540 先例：overflow 是结构语义非 chrome）；sqlLint534 骨架锁行逐字不动，单列一条零触锁 */
.sq-editor { overflow: hidden; }
.sq-editor > :deep(.monaco-host) { flex: 1 1 0; min-height: 0; }
/* 轨4：编辑器外框退役（约定③，558(b) av-left/br-pane 同语言独立追加——
 sqlLint534/ 逐字锁原行零触）；sq-card-hd 既有 border-bottom 承接分界 */
.sq-editor > :deep(.monaco-host) { border: none; border-radius: 0; }
/* .sq-sql-lint 私造形态（含 warn-line 边线）随改用 lint-bar 单源退役；
 自动高度 flex none 语义归 .lint-bar，编辑器 flex:1 min-height:0 既有高度链确定解不动 */
/* 1391：命中多条时提示条要封顶。实测 1440×900 三条命中 → 条高 103px、编辑器从 268 掉到 113；
   1280×720 同稿编辑器只剩 39px（基本没法改稿）。上限取 3 行正文高度（约 88px），超出内部滚动：
   提示仍全部可达（可滚、可点行号定位），但永远不会把编辑器挤到没法用。 */
/* 1391：有 lint 提示时，编辑格按内容长高而不是压 Monaco。
   `.sq-grid` 的编辑器行是 `minmax(150px, 34vh)`，提示条与 Monaco 同在该格里；
   提示条吃掉多少，Monaco 就少多少（1280×720 实测只剩 86px，改不动稿）。
   做法：栅格行改成「至少装了 Monaco 150 + 提示条实际高度」，即 auto 行 + 内容自带
   flex-basis 下限；页面本来允许滚动，多出来的高度不会把结果表挤走。 */
.sq-grid:has(.sq-sql-lint), .sq-grid:has(.sq-cost-hint) { grid-template-rows: minmax(min-content, 34vh); }
.sq-editor > :deep(.monaco-host) { flex: 1 0 150px; }
.sq-editor > .sq-sql-lint, .sq-editor > .sq-cost-hint { flex: 0 0 auto; }
.sq-sql-lint { max-height: 88px; overflow-y: auto; }
.sq-sql-lint > span { flex: 0 0 auto; }
/* 展开/收起按钮固定在条底（提示区滚到哪都在），浅色小钮 */
.sq-lint-more { align-self: flex-start; }
/* 1050：成本提示行——多条纵向/横向排布，动作钮右端 */
.sq-cost-hint { display: flex; flex-direction: row; align-items: center; flex-wrap: wrap; gap: var(--sp-2); }
.sq-cost-item { flex: 1 1 260px; min-width: 0; }
/* sq-card 大容器壳（bg+border+radius）退役（v 约定①④，pt-sec/uq-sec 538 同语言）
 → sq-sec border-top 分节（DSL 预览/结果卡）；sq-blank 空态直贴仅留 wide 网格占位
 （EmptyState 不套空框）；sq-panel 语义面板（err/warn 豁免档）完整壳保留，视觉零变化 */
.sq-sec { border-top: 1px solid var(--border); padding-top: var(--sp-1h); }
.sq-sec.wide { grid-column: 1 / -1; }
.sq-lenient-note {
  display: flex; align-items: flex-start; gap: var(--sp-1h);
  margin: var(--sp-1h) 0 var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--warn-line);
  border-radius: var(--r-m);
  background: var(--warn-soft);
  color: var(--tx1);
  font-size: var(--fs-xs);
  line-height: 1.6;
}
.sq-lenient-note b { color: var(--warn); white-space: nowrap; }
.sq-blank { grid-column: 1 / -1; }
.sq-panel { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--r-m); overflow: hidden; }
.sq-panel.wide { grid-column: 1 / -1; }
/* hd 随壳退役改行首横排档（538 .uq-script-hd→约定② 同语言：border-bottom 分界 + 650） */
.sq-card-hd { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); font-size: var(--fs-sm); font-weight: 650; }
.sq-card-hd-r { display: flex; gap: var(--sp-1h); align-items: center; }
/* 1090：1024 档工具行不再把「宽容模式/列式」挤成单字竖排——右组占满剩余宽度并在内部换行，
   左侧「SQL」保持同行；1440 全在一行时零视觉变化（仅在空间不足时生效） */
.sq-card-hd { flex-wrap: wrap; row-gap: var(--sp-1); }
.sq-card-hd-r { flex: 1 1 0; min-width: 0; flex-wrap: wrap; row-gap: var(--sp-1h); justify-content: flex-end; }
.sq-fs { white-space: nowrap; }
.sq-fs.sq-tog { flex-shrink: 0; }
/* 1080：FROM 换源提示条（静态说明，不占工具行宽度） */
.sq-from-note { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2); padding: var(--sp-1) var(--sp-3); border-bottom: 1px solid var(--border); font-size: var(--fs-xs); color: var(--muted); }
.sq-from-note .chip { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sq-fs { font-size: var(--fs-xs); color: var(--muted); }
.sq-fs-i { width: 60px; border: 1px solid var(--border); border-radius: 3px; padding: var(--sp-0) 5px; font-size: var(--fs-xs); background: var(--card-bg); color: var(--fg); }
.sq-tz-i { width: 146px; }
.sq-to-i { width: 92px; }
/* 1070：参数开关与参数条（紧凑单行，编辑器宽度自适应；状态色用 token） */
.sq-param-btn.on { border-color: var(--brand); color: var(--brand); }
.sq-param-badge {
  margin-left: var(--sp-1); padding: 0 var(--sp-1); border-radius: 999px; font-size: var(--fs-2xs);
  background: var(--brand); color: var(--card-bg); font-variant-numeric: tabular-nums;
}
.sq-param-bar {
  display: flex; align-items: center; gap: var(--sp-2); flex-wrap: nowrap;
  padding: var(--sp-1) var(--sp-2); border-bottom: 1px solid var(--line); background: var(--code-bg);
}
.sq-param-lb { font-size: var(--fs-xs); color: var(--muted); flex: 0 0 auto; }
.sq-param-i { flex: 1 1 240px; min-width: 0; height: 24px; }
.sq-param-stat { font-size: var(--fs-xs); color: var(--muted); white-space: nowrap; flex: 0 0 auto; }
.sq-param-stat.ok { color: var(--brand); }
.sq-param-stat.warn { color: var(--warn); }
.sq-param-stat.bad { color: var(--danger); }
.sq-tpl { list-style: none; padding: 0; margin: 0; }
.sq-tpl li { padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); font-size: var(--fs-xs); cursor: pointer; }
.sq-tpl li:last-child { border-bottom: 0; }
.sq-tpl li:hover { background: var(--code-bg); }
/* 1058：缺角色字段的场景模板置灰（仍可点，仅解释原因，不插入假字段 SQL） */
.sq-tpl li.off { opacity: .55; cursor: not-allowed; }
.sq-tpl li.off:hover { background: transparent; }
.sq-tpl-miss { font-style: normal; color: var(--warn); font-size: var(--fs-2xs); }
.sq-tpl-bind { font-style: normal; color: var(--brand); font-size: var(--fs-2xs); }
.sq-tpl-k { display: inline-block; font-family: var(--mono); color: var(--brand); font-weight: 400; margin-right: var(--sp-1h); }
.sq-tpl-d { color: var(--muted); }
.sq-code { padding: var(--sp-3); margin: 0; font-family: var(--mono); font-size: var(--fs-xs); background: var(--code-bg); overflow-x: auto; }
.sq-alert { display: flex; gap: var(--sp-2h); padding: 14px var(--sp-4); color: var(--danger); }
.sq-sub { font-size: var(--fs-xs); color: var(--muted); margin-top: var(--sp-1); }
.sq-alert-body { flex: 1; }
.sq-alert-acts { display: flex; gap: var(--sp-1h); align-items: center; flex-wrap: wrap; margin-top: var(--sp-2); }
.sq-err-body { margin: var(--sp-1h) 0 0; font-family: var(--mono); font-size: var(--fs-xs); white-space: pre-wrap; word-break: break-word; color: var(--fg); max-height: 200px; overflow: auto; }
/* 1043：UnknownColumn 纠错 chips 行（列名不存在→相近字段一键替换） */
.sq-colfix { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; margin-top: var(--sp-1h); }
.sq-colfix-t { font-size: var(--fs-xs); color: var(--tx2); }
/* 1109：报错锚点 chip（标题行内，点击定位到行列；mono 让 line:col 数字对齐）
   与静态 lint 的行号跳转同一交互语言：位置本身就是入口。 */
.sq-err-loc { margin-left: var(--sp-2); padding: 1px var(--sp-1h); font-size: var(--fs-2xs); line-height: 1.5;
  color: var(--danger); background: var(--err-soft);
  border: 1px solid var(--err-line); border-radius: var(--r-xs);
  cursor: pointer; }
.sq-err-loc:hover { border-color: var(--danger); }
.sq-err-stale { margin-left: var(--sp-2); padding: 1px var(--sp-1h); font-size: var(--fs-2xs);
  color: var(--warn); background: var(--warn-soft); border: 1px solid var(--warn-line); border-radius: var(--r-xs); }
/* 1125：DSL 预览与当前 SQL 不同步——标题黄标 + 正文降透明，跳转/复制禁用 */
.sq-prev-stale { margin-left: var(--sp-2); padding: 1px var(--sp-1h); font-size: var(--fs-2xs); font-style: normal;
  color: var(--warn); background: var(--warn-soft); border: 1px solid var(--warn-line); border-radius: var(--r-xs); }
.sq-prev-dim { opacity: .55; }
.sq-lint-ln { padding: 0; border: 0; background: none; font: inherit; color: inherit;
  text-decoration: underline dotted; text-underline-offset: 2px; cursor: pointer; }
.sq-lint-ln:hover { color: var(--brand); text-decoration-color: var(--brand); }
/* 1045：cursor 未取完的局部排序诚实提示 */
.sq-sort-note { padding: var(--sp-1) var(--sp-3); font-size: var(--fs-2xs); color: var(--warn); background: var(--warn-soft); border-bottom: 1px solid var(--line); }
/* 1136：结果工具行图标钮（原始 IO/高度档）——方角小钮，文字说明走 title */
.sq-icon-btn { width: 22px; height: 20px; padding: 0; justify-content: center; }
/* 1048：聚合分布图（两列 label+count 结果自动生成；非聚合形状不渲染） */
.sq-chart { border-bottom: 1px solid var(--line); }
.sq-chart-hd { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); padding: var(--sp-1h) var(--sp-3); }
.sq-chart-t { display: inline-flex; align-items: center; gap: var(--sp-1h); font-size: var(--fs-xs); font-weight: 600; min-width: 0; }
.sq-chart-meta { font-size: var(--fs-2xs); font-weight: 400; color: var(--tx2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sq-chart-body { padding: 0 var(--sp-3) var(--sp-2); }
.sq-tog { display: inline-flex; align-items: center; gap: var(--sp-1); margin-left: var(--sp-2); }
.sq-tog input { margin: 0; }
.sq-warn { display: flex; gap: var(--sp-2h); padding: var(--sp-2) 14px; background: var(--warn-soft); border-color: var(--warn-line); color: var(--warning, var(--warn)); }
.sq-warn-body { flex: 1; }
.sq-warn-tt { font-size: var(--fs-sm); margin-bottom: var(--sp-1h); }
.sq-warn-cnt { font-size: var(--fs-xs); margin-left: var(--sp-2); padding: 1px 5px; background: var(--warn-soft); border-radius: 3px; }
.sq-warn-list { margin: var(--sp-1) 0 var(--sp-1h) 20px; padding: 0; font-size: var(--fs-xs); color: var(--fg); }
.sq-warn-hint { font-size: var(--fs-xs); color: var(--muted); }
.sq-warn-hint code { background: var(--code-bg); padding: 1px var(--sp-1); border-radius: 2px; }

/* 窄容器塌单栏，断点同 theme.css:584 的 （iframe 可用宽 ~866px） */
@media (max-width: 1100px) {
  .sq-grid { grid-template-columns: minmax(0, 1fr); }
  /* 1136：单栏时模板侧栏排到结果区之后——结果表紧跟编辑器，不再被模板列表推到首屏外 */
  .sq-grid > .sq-samples { order: 3; }
}

/* 900 紧凑微调档（ 口径；q 遗留补齐，W-D）——模板轨折叠/单栏已由
 1100 档与 rail-off 合并（codeH 走 usePref 内联不归 CSS），此处收页侧距，卡头与
 告警/黄条行允许换行（结果表横滚兜底在 QRT 内核，不在此重复造） */
@media (max-width: 900px) {
  .sq-page { padding: var(--sp-2) var(--sp-2h) var(--sp-4); }
  .sq-card-hd { flex-wrap: wrap; row-gap: var(--sp-1); }
  .sq-alert { flex-wrap: wrap; }
  .sq-warn { flex-wrap: wrap; }
}
</style>
