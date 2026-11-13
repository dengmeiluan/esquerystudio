<template>
  <div class="ih-page">
    <!-- 执行中局部进度条（ind-bar 全站范式） -->
    <div class="pg-progress ind-bar" :class="{ on: docsLoading || qryLoading }"></div>
    <!-- 联动性：选中索引一键去托管重建（goto 自带 store.pick(cur)，AdhocRebuild 从全局选中索引接上下文） -->
    <PageHeader :icon="Boxes" title="索引工作区" subtitle="索引列表 · 元信息排序 · 别名/重建/分片运维入口">
      <template #actions>
    <!-- 列表改抽屉,开关常驻页头;放大/还原=工作区全屏(整行含主表,.fs-active 见样式区)。
         计数徽标：开关本身带全量索引数（显眼度——不看钮文不知列表内有多少索引） -->
    <button aria-label="索引列表" class="btn sm ghost" :title="(listOpen ? '关闭索引列表（Esc 也可）' : '打开索引列表（搜索/健康过滤/排序）') + (store.indices.length ? ' · 共 ' + store.indices.length + ' 个' : '')" @click="listOpen = !listOpen"><List :size="13" /> 索引列表<span v-if="store.indices.length" class="ih-ilct mono">{{ store.indices.length }}</span></button>
        <button v-if="cur && canRebuild" aria-label="托管重建当前索引" class="btn sm ghost" title="托管重建当前索引（粘贴期望配置 / 探测 / 校验 / 切换一条龙）" @click="goto('/adhoc-rebuild')"><Rocket :size="13" /> 托管重建</button>
      </template>
    </PageHeader>
    <!-- 回补:①放大钮并入 ih-lbar 工具行(headless);②聚焦面 .fs-active 包整个 .ih(列表+主表整行) -->
    <div class="ih" :class="{ 'fs-active': fsActive }">

    <!-- 右：索引 360 详情 -->
    <div class="ih-right scroll-y">
      <!-- 未选索引：引导态。：引导整卡空框（card ih-guide，原 64px 居中即手写
 EmptyState 形态）退役——EmptyState centered 直贴（538「空态不留整块空框」，
 AnalyzerLabView:49 是 546 先例）；ih-guide-t/-s 文案逐字迁 props。
 ⚠重锁区：仅动本 ih-guide 块，工作区其余（ih-card-flush 等）零触 -->
      <EmptyState v-if="!cur" centered :icon="Boxes"
        text="点击「索引列表」或搜索选择索引，进入索引工作区"
        hint="文档检索 · DSL 查询 · Settings · Mapping · 分片 · 运维操作，一个索引的全生命周期在一个页面完成" />

      <template v-else>
        <!-- v3.0.1 三横幅重设计(实报「不喜欢三横幅」):索引名行+KPI 统计卡+tab 卡三合一带
 ——单卡连体:行1 名字+pill+复制,行2 inline 元信息串(docs·size·分片·创建·别名),
 KPI 大卡退役;5 层横幅堆叠 → 头部条+tab 两层,表格多拿 ~90px 高 -->
        <!-- card ih-card-flush 大卡壳退役 → .ih-ws 分节容器（547 壳退役语言续刀）——
 .ih-hd/.ih-tabs 两条 border-bottom+表格自带边框承接分节；547 豁免正锁同步更新
 （cardPrimitiveVerdict547/emptyFrameZero547/paneShellWave547 三处字面改退役形） -->
        <div class="ih-ws" :class="{ 'ih-ws-fill': tab === 'docs' && docsView === 'table' }">
          <div class="ih-hd">
            <div class="ih-hd-l">
              <span class="ih-hdot lg" :style="{ background: healthColor(curInfo?.health || '') }" :title="curInfo?.health"></span>
              <span class="ih-hd-nm mono" :title="cur">{{ cur }}</span>
              <!-- 裸 status 串+手滚 pill 三元退役 → StatusPill 统一件+indexStatusZh
 （en 档英文小字：中文主体「已打开/已关闭」+弱化 open/close 原码，未知态回落原文不丢信息） -->
              <StatusPill :tone="curInfo?.status === 'open' ? 'g' : 'n'" :label="indexStatusZh(curInfo?.status) || (curInfo?.status || '?')" :en="curInfo?.status || undefined" :title="curInfo?.status || undefined" />
              <button aria-label="复制索引名" class="btn sm ghost" title="复制索引名" @click="copyName"><Copy :size="11" /></button>
            </div>
            <div class="ih-hd-acts">
              <!-- 放大态还原钮必须置于聚焦面内的工作区卡片头——历史事故：
 .fs-active(fixed inset12 z300) 盖住页头，「还原」钮鼠标不可达，
 全屏态唯一退出路径只剩 Esc（纯鼠标用户被锁死）。面内还原钮保证放大/还原两个方向都有鼠标路径 -->
              <button v-if="fsActive" aria-label="还原工作区" class="btn sm" title="还原工作区（Esc 也可）" @click="fsActive = false"><Minimize2 :size="11" /> 还原</button>
              <!-- 文档/查询/Mapping 已工作区就地化（下方 Tab），头部留跳页入口；
 改 Setting 放开全员可见——IndexSettingsView 读取/分析全角色可用，
 页内写控件仍按 rank 门禁（permGating 两保存出口照旧锁 rank3+）；
 别名（带 ?idx= 深链直达该索引分组）与 Mapping 为纯读入口一并上头部
 （Mapping 原入口只藏在 tab tip 小字里，2 击） -->
              <button class="btn sm" @click="goto('/index-settings')"><Sliders :size="11" /> 改 Setting</button>
              <button class="btn sm" @click="goto('/aliases?idx=' + encodeURIComponent(cur))"><Link2 :size="11" /> 别名</button>
              <button class="btn sm" @click="goto('/mapping')"><FolderTree :size="11" /> Mapping</button>
              <button v-if="canRebuild" class="btn sm" @click="goto('/adhoc-rebuild')"><Hammer :size="11" /> 重建</button>
              <!-- 头部「删除索引」入口退役（与运维操作危险区双入口收敛）——
 删除是 critical 级不可逆动作，唯一入口收在 ops 危险区（确认守卫同 askDelIndex 不变），
 头部不再给一键直达的红色扳机 -->
            </div>
            <!-- 元信息串合并 MetaStrip 统一件（源头视图闭环）：文档/存储(单位拆分)/分片副本/创建走 items，
 mono/值亮/标签暗/·分隔形态全由统一件承担；别名段留默认插槽（前 3 截断 + 「管控」跳转交互原样）；
 整条 hover title 原文留根：title 里的别名是全量列表而显示只截前 3，拆段 tip 会丢这份兜底信息 -->
            <!-- 插槽前手写 sep 退役——组件「有默认插槽自动渲染 .ms-sep」承担 -->
            <MetaStrip class="ih-meta-pos" :items="ihMeta" :title="ihMetaTip">
              <span class="ih-meta-alias">
                <i>别名</i>
                <template v-if="curAliases.length"><b>{{ curAliases.slice(0, 3).map(a => a.alias).join('、') }}</b><span v-if="curAliases.length > 3" class="dim"> +{{ curAliases.length - 3 }}</span></template>
                <span v-else class="dim">无</span>
                <a class="ih-link" role="link" tabindex="0" @click="goto('/aliases?idx=' + encodeURIComponent(cur))" @keydown.enter.prevent="goto('/aliases?idx=' + encodeURIComponent(cur))">管控</a>
              </span>
            </MetaStrip>
          </div>

          <div class="seg ih-tabs">
            <button v-for="t in TABS" :key="t.k" :class="[{ on: tab === t.k }, 'ih-t-' + t.k]" @click="tab = t.k">{{ t.t }}<span v-if="tabCount(t.k)" class="ih-tab-n mono">{{ tabCount(t.k) }}</span></button>
            <button class="btn sm ghost" title="启动期 Mapping 自动补全的对账报告" @click="rrOpen = true">
              <ScrollText :size="11" /> 启动对账
            </button>
            <span style="flex:1"></span>
            <!-- settings/mapping 区高度三档档位钮（⇕，对齐抽屉宽度档钮形态；
 各自 tab 在场才显——档位只作用于对应 tab 的主体区，别处无意义） -->
            <button v-if="tab === 'settings'" aria-label="Settings 高度档位" class="btn sm ghost" style="margin:var(--sp-1h) var(--sp-2)" :title="'Settings 区高度：' + settingsH + '（点击循环 三档）'" @click="cycleSettingsH"><ArrowUpDown :size="11" /></button>
            <button v-if="tab === 'mapping'" aria-label="Mapping 高度档位" class="btn sm ghost" style="margin:var(--sp-1h) var(--sp-2)" :title="'Mapping 区高度：' + mapH + '（点击循环 三档）'" @click="cycleMapH"><ArrowUpDown :size="11" /></button>
            <button class="btn sm ghost" style="margin:var(--sp-1h) var(--sp-2)" :disabled="detailLoading" @click="loadDetail(true)">
              <RefreshCw :size="11" :class="{ spinning: detailLoading }" /> 刷新
            </button>
          </div>

          <div class="ih-tab-body" :class="{ 'ih-fill': tab === 'docs' && docsView === 'table' }">
            <!-- -A2：详情拉取失败页面级透传（部分失败也提示，不能让 settings/mapping 区静默空白） -->
            <div v-if="detailErr && !detailLoading" role="alert" class="err-bar rise-in" style="margin:var(--sp-2)">
              {{ detailErr }}
              <button class="btn sm" :disabled="detailLoading" @click="loadDetail(true)"><RefreshCw :size="12" :class="{ spinning: detailLoading }" /> 重试</button>
            </div>
            <div v-if="detailLoading && (tab === 'settings' || tab === 'mapping' || tab === 'shards' || tab === 'ops')" style="padding:var(--sp-2)">
              <SkeletonBox v-for="i in 5" :key="i" height="16px" round style="margin-bottom:var(--sp-2)" :width="(90 - i * 12) + '%'" />
            </div>

            <!-- 文档——就地检索/浏览/编辑文档，不再跳 DSL 查询页 -->
            <template v-else-if="tab === 'docs'">
              <div class="ih-docs-bar">
                <!-- W2 ：docsQ 走 buildDocsDsl → query_string（非空时），换 LuceneInput 出字段/terms 补全；
 原 @keyup.enter=runDocs 语义由 @enter 原样承接。index=cur（当前选中索引），
 容器为普通 div 不在弹层内，弹层默认 Teleport body 即可。 -->
                <LuceneInput
                  v-model="docsQ" class="ih-q" :index="cur"
                  placeholder="搜文档：关键词或 field:value AND …（空 = 全部文档，回车执行）"
                  @enter="runDocsNew()"
                />
                <!-- P0-A：执行可取消+读秒（DslQueryView L96-99 useQueryRun 范式）——
 慢检索不再只能干等；「执行中 X.Xs」句式全站统一；取消钮入既有工具行（零布局变动） -->
                <button class="btn sm pri" :disabled="docsLoading" @click="runDocsNew()"><Play :size="11" /> {{ docsLoading ? '执行中 ' + (docsQr.elapsedMs.value / 1000).toFixed(1) + 's' : '检索' }}</button>
                <button v-if="docsLoading" class="btn sm" @click="docsQr.cancel()"><X :size="11" /> 取消</button>
                <!-- 带词跳转——docsQ 非空经 ?q= 直达查询工作台并预填 DSL（跨页联动闭环） -->
                <button aria-label="在查询工作台打开（变量/聚合图/Profile）" class="btn sm ghost" :title="docsQ.trim() ? '在查询工作台打开当前查询词（变量/聚合图/Profile）' : '在查询工作台打开（变量/聚合图/Profile）'" @click="goto(docsQ.trim() ? '/search?q=' + encodeURIComponent(docsQ.trim()) : '/search')"><ExternalLink :size="11" /></button>
                <!-- P1：失败态 RawIo 常驻——RT 内 Terminal 钮只随 docsRan 成功态渲染，
 检索失败（docsErr）时全页无取数入口；工具行常驻钮补失败现场回看（openRawIo 双特征回退单源零触） -->
                <button class="btn sm ghost" aria-label="查看原始 IO（检索行）" title="最近一次检索的请求/响应原文（失败现场也可回看；语义分档高亮 + 复制/curl 回放）" @click="openRawIo('query')"><Terminal :size="11" /></button>
                <!-- cURL 快速复制（DevToolsView copyCurl 钮形）——当前检索词经
 buildDocsDslWithSort() 组 POST /{idx}/_search -d body，工单/群聊直贴 -->
                <button class="btn sm ghost" aria-label="复制 cURL" title="把当前检索复制为 cURL 命令（含排序/分页，直贴终端回放）" @click="copyDocsCurl"><Terminal :size="11" /> cURL</button>
                <!-- 检索历史入口（docs 检索自 一直入 lucene 历史但无入口）——
 复用本页 histOpen 历史面板（lucene 行并显，回放走 docsQ 草稿路径） -->
                <button class="btn sm ghost" data-test="docs-hist" @click="histOpen = true" title="检索历史"><History :size="11" /> 历史</button>
              </div>
              <!-- 语义高亮批：Lucene 括号失配纠错——只报组件内联检查（LuceneInput：引号/尾随运算符）
 不覆盖的括号失配，避免与组件提示条重复播报；警告档 --warn；纯提示不拦截，
 Enter 仍按原语义执行（不改请求行为） -->
              <div v-if="docsQLint" class="ih-qlint" role="status">
                <AlertTriangle :size="11" /> {{ docsQLint }}
              </div>
              <!-- 直方图节组件化接线（DQ 同套组件同位序——检索区后、结果表前，
 节头恒在场 同步更新）。桶由 runDocs 响应回填（useHistAgg.onResp），注入/
 降级链在 runDocs；偏好键 ih.docs.* 与 DQ 键分开。brush 刷选改写 DSL 是 DQ
 视图域语义（docs tab 无 DSL 面），不接（下批评估） -->
              <HistogramSection
                :buckets="docsHist.histBuckets.value" :open="docsHist.histSecOpen.value"
                :meta="docsHist.histHeadMeta.value" :no-date-field="docsHist.histNoDateField.value"
                v-model:auto-hist="docsHist.autoHist.value"
                @toggle="docsHist.histSecOpen.value = !docsHist.histSecOpen.value"
              />
              <!-- 部分分片失败黄条（DslQueryView .dq-partial 先例同判据，docs 侧独立
 computed）——runDocs 响应同 _shards 结构（API 裸透传），failed/timed_out>0 诚实呈现
 「结果可能不完整」；role=status 提示档，可关闭，新响应自动重现；独立块不进
 docsRan/docsErr v-if 链，高度链零触（内容增量） -->
              <div v-if="docsPartialHint && !docsPartialDismissed" class="ih-partial mono" role="status">
                <AlertTriangle :size="12" />
                <span>{{ docsPartialHint }}</span>
                <button class="ih-partial-x" aria-label="关闭提示" title="关闭提示" @click="docsPartialDismissed = true"><X :size="11" /></button>
              </div>
              <!-- 有旧结果时再检索失败：结果表仍在（docsRan 不复位），错误只能挤在右下角 toast
                   里、盖住表格正文。原位错误条把它搬回表格上方——不遮挡、可重试、旧结果标明
                   「上一版」，用户知道看到的是什么数据。首查失败走下方 docsErr 空态分支。 -->
              <div v-if="docsErr && docsRan" role="alert" class="err-bar rise-in ih-docs-err ih-docs-err-inline">
                <pre class="mono" v-html="errPreHtml(docsErr, errMeta(docsErrRaw))"></pre>
                <div class="ih-docs-err-acts">
                  <span class="ih-docs-err-note">下方仍是上一次检索成功的结果</span>
                  <button class="btn sm" @click="runDocs()" :disabled="docsLoading">重试</button>
                  <button class="btn sm ghost" aria-label="收起本次错误提示" @click="dismissDocsErr">收起</button>
                </div>
              </div>
              <template v-if="docsRan">
                <!-- 裁决「独立提示行太刺眼不划算」:教育文案收进表格工具行 Info 钮 tooltip;
 放大/查找内建表格(ResultTable focusable),不再视图层接线。
 hide-body=非表格档——视图切换后表格体隐藏、工具行常驻（
 「docs tab 无替换视图不接 hide-body」随视图 seg 接线退役），切非表格档
 自动退聚焦 rtFix552 内建零增量 -->
                <ResultTable ref="docsTbl"
                  export-name="ih-docs"
                  :bar-menu-extra="docsBarMenuExtra"
                  :hide-body="docsView !== 'table'"
                  :hits="docsHits" :total="docsTotal" :took="docsTook" :index="cur" :loading="docsLoading" :total-gte="docsTotalGte"
                  :field-types="fieldTypesMap"
                  remote-sort
                  refreshable
                  :searchable="true"
                  :sync-sort="docsSortSync"
                  @sort-change="onDocsSortChange"
                  :editable="canWrite" @edit-doc="h => openDoc(h, true)"
                  @open-doc="openDoc" @delete-doc="askDelDoc" @batch-delete="askBatchDel" @refresh="runDocs"
                  @filter-hit="onDocsFilterHit"
                >
                  <!-- 分页器寄居表格工具行（#bar-prepend，与查询工作台 DslQueryView 同语言）
 ——同款真分页（from/size 真检索+共享页大小记忆 es_pager_size）同步更新表格头。
 视图形式切换 seg 同寄居（DslQueryView 同款四档——表格/JSON/Tree/卡片，
 DQ 卡片档有实现故四档全上，不造没有的档）；JSON/Tree 档无翻页语义，
 分页器仅表格/卡片档在场（DQ 同款 v-if）。「顶满」钮不接：DQ 顶满=本页级收起
 构建区（buildCollapsed），docs tab 无构建区，语义不适用不做 -->
                  <template #bar-prepend>
                    <div class="seg ih-view-seg">
                      <button v-for="v in IH_VIEWS" :key="v.k" :class="{ on: docsView === v.k }" @click="docsView = v.k">{{ v.t }}</button>
                    </div>
                    <!-- 1439：改了检索词没重新检索时，表格里仍是上一次的结果——DSL/Lucene 同款芯片 -->
                    <span v-if="docsStale" class="pill warn stale-chip" role="status"
                      title="当前检索词已修改但还没执行——下方结果仍来自上一次检索（回车或点「检索」更新）">结果已过期</span>
                    <Pagination v-if="docsView !== 'json' && docsView !== 'tree'"
                      :page="docsPage" :total-pages="docsTotalPages" :page-size="docsSize"
                      :disabled="docsLoading" @update:page="goDocsPage" @update:page-size="setDocsSize" />
                  </template>
                  <template #bar-extra>
                    <!-- 1357：行内「原始 IO」钮退役——与工具行「更多 ⋯」里的 ih-raw-io-docs
 是同一动作同一入口函数，重复平铺违反项目右键约定；低频排查留在菜单内。 -->
                    <button class="btn sm ghost rt-tool-btn ih-tip-btn" aria-label="表格操作提示"
                      :title="`${docsQuerySummary(docsQ)}
表格内 Ctrl+F 查找并高亮命中；双击单元格就地编辑（保存即全量覆盖 _source）${canWrite ? '' : '；当前角色只读，双击不会进入编辑'}；↑↓ 行导航、Enter 打开文档`">
                      <Info :size="13" />
                    </button>
                  </template>
                  <!-- alt 三视图体（json/tree/cards 三档，表格档=表格体本体）——随默认插槽
                       入表格容器，放大态四视图同屏（与查询工作台同语言）；包裹层 v-show
                       容器类与高度链留宿主零触，max-height 56vh 三视图一口径（.ih-* 见样式区）。
                       json/tree 档挂文档导航条（遍历/_id 直达下拉/打开/编辑直达），编辑直达
                       仅 tree 档亮钮（editable 已接线 edit-doc-at） -->
                  <div v-show="docsView === 'json'" class="scroll-y ih-json-wrap ih-alt-body">
                    <AltHitsViews view="json" :json-html="docsJsonHtml" :doc-count="docsHits.length" :doc-ids="docsHits.map(h => h._id)" :editable="canWrite" @open-doc-at="i => { const h = docsHits[i]; if (h) openDoc(h) }" @edit-doc-at="i => { const h = docsHits[i]; if (h) openDoc(h, true) }" ref="docsJsonBox" />
                  </div>
                  <div v-show="docsView === 'tree'" class="scroll-y ih-tree-view ih-alt-body">
                    <AltHitsViews view="tree" :tree-data="docsAltData" :doc-count="docsAltData.length" :doc-ids="docsAltData.map(r => String(r._id ?? ''))" :editable="canWrite" @open-doc-at="i => openAltDocAt(docsAltData, i)" @edit-doc-at="i => openAltDocAt(docsAltData, i, true)" ref="docsTreeBox" />
                  </div>
                  <div v-show="docsView === 'cards'" class="ih-cards ih-alt-body">
                    <AltHitsViews view="cards" :hits="docsHits" @open-doc="openDoc" />
                  </div>
                </ResultTable>
              </template>
              <div v-else-if="docsErr" role="alert" class="err-bar rise-in ih-docs-err">
                <!-- 裸插值升级 errPreHtml+errMeta 双参（docsErrRaw 原始对象旁路；
                     DQ :270/XmigrateView :63 先例）——JSON 现场着色可回看、错误码/失败端点一眼可辨；
                     err-bar 形态/重试钮/v-if 链原样 -->
                <pre class="mono" v-html="errPreHtml(docsErr, errMeta(docsErrRaw))"></pre>
                <button class="btn sm" @click="runDocs()" :disabled="docsLoading">重试</button>
              </div>
              <!-- 五处裸 .empty 合并 EmptyState 统一件（下一步指引挪 hint、动作挪 actionText） -->
              <EmptyState v-else :icon="Search" text="回车或点「检索」开始浏览文档" />
            </template>

            <!-- 查询——就地 DSL 迷你控制台（Ctrl+Enter 执行，草稿防丢） -->
            <template v-else-if="tab === 'query'">
              <!-- DSL 编辑器高度四档（S/M/L/满）——查询工作台同款 editorTiers 统一件档位
                   + usePref 记忆（ih.editorH）；S/M/L 定高、满档沿用 42vh 视口弹性（口径），
                   JsonArea fill 吃满容器高；教育文案收进下方结果表工具行 Info 钮 tooltip（同款裁决）。
                    P2：qryH 自定态（拖柄落盘）覆写档位值——ih-h-full 满档语义保形
                   （自定态下 min-height 档不叠加，定高 px 直接接管） -->
              <div ref="dslWrapEl" class="ih-dsl-wrap" :class="{ 'ih-h-full': editorH === 'full' && qryH <= 0 }" :style="dslWrapStyle" @keydown.ctrl.enter.prevent="runDslNew">
                <JsonArea ref="dslJaRef" v-model="dsl" fill :dsl-assist="ihDslAssist" placeholder="{&quot;query&quot;: {&quot;match_all&quot;: {}}}" :font-size="ihFont" />
              </div>
              <!--  P2：编辑器高度拖柄（dq-height-handle 同款落位）。553 裁决=边界随指针：
                   本柄在编辑区下方（受控区上侧），向下拖=编辑区底缘下移=高度增大，与 dq.main 同向自然，
                   无需 553 结果柄的反向快照锚（该锚只适用于柄在受控区上方的形态） -->
              <SplitHandle
                class="ih-qry-handle"
                axis="horizontal"
                :size="qryHandleSize"
                :min="200"
                :max="qryHandleMax"
                label="调整 DSL 编辑器高度"
                @resize="onQryHResize"
                @resize-end="onQryHResize"
              />
              <!--  命中数/耗时并入 ResultTable 工具行（原执行行旁的命中 tip 与 rt-bar 贴脸重复） -->
              <div class="ih-docs-bar" style="margin-top:var(--sp-2)">
                <!--  P0-A：「执行中…」静止文案升 100ms tick 读秒+可取消（btn-run-lock 锁宽档
                     本就按 busy 态宽度给）；取消钮入既有工具行 -->
                <button class="btn sm pri btn-run-lock" :disabled="qryLoading" @click="runDslNew"><Play :size="11" /> {{ qryLoading ? '执行中 ' + (qryQr.elapsedMs.value / 1000).toFixed(1) + 's' : '执行查询' }}</button>
                <button v-if="qryLoading" class="btn sm" @click="qryQr.cancel()"><X :size="11" /> 取消</button>
                <!-- 在 DevTools 打开（473 同款，就地 DSL 带到多标签控制台） -->
                <button class="btn sm ghost" :disabled="!qryResp" @click="openQryInDevTools" title="把当前索引与 DSL 带到 DevTools 多标签控制台">
                  <ExternalLink :size="11" /> DevTools
                </button>
                <!--  P1：失败态 RawIo 常驻——RT 内 Terminal 钮只在 qryResp 成功态渲染
                     （v-else-if），查询失败（qryErr）时无取数入口；失败现场回看同 docs 检索行 -->
                <button class="btn sm ghost" aria-label="查看原始 IO（查询行）" title="最近一次查询的请求/响应原文（失败现场也可回看；语义分档高亮 + 复制/curl 回放）" @click="openRawIo('query')"><Terminal :size="11" /></button>
                <!-- cURL 快速复制（query 档）——编辑器 DSL 原文组 POST /{idx}/_search -->
                <button class="btn sm ghost" aria-label="复制 cURL" title="把当前 DSL 复制为 cURL 命令（直贴终端回放）" @click="copyQryCurl"><Terminal :size="11" /> cURL</button>
                <!-- 页内历史入口（Kibana 对标第四维）——runDsl 自 一直在
                     push('dsl') 历史，此前只写不显（其余模式出口在查询工作台抽屉） -->
                <button class="btn sm ghost" data-test="open-hist" @click="histOpen = true" title="查询历史"><History :size="11" /> 历史</button>
                <!-- Profile 开关（「组件就绪待接」落地）——开启后就地执行走
                     /cluster/profile 通道（body 透传 _search+profile:true，hits/aggregations 同形），
                     树回显 per-shard/分段耗时；形态=DQ 执行行 dq-sw 激活胶囊同语言（ih-sw 本页落款） -->
                <label class="ih-sw" :class="{ on: profileOn }" title="Query Profiler：返回 breakdown 耗时树（开启后就地执行走 Profile 通道）">
                  <input type="checkbox" v-model="profileOn" /> Profile
                </label>
                <!-- 编辑器高度四档钮（S/M/L/满，查询工作台 dq-eh 同款视觉）。
                      P2：拖柄自定态下档位钮全灭（qryH>0 覆写档位），点档位钮清零
                     回档位高度（DQ「回不去」根治同款） -->
                <div class="ih-eh" role="group" aria-label="编辑器高度档位" title="编辑器高度档位：S/M/L/满">
                  <button v-for="eh in EDITOR_H_TIERS" :key="eh.k" type="button" class="ih-eh-btn"
                    :class="{ on: editorH === eh.k && qryH <= 0 }" :aria-pressed="editorH === eh.k && qryH <= 0"
                    :title="'编辑器高度：' + eh.t" @click="editorH = eh.k; qryH = 0">{{ eh.t }}</button>
                </div>
                <!-- 编辑器字号三档 seg（ih.font 落盘；dq.font/dt.font 同源
                     EDITOR_FONT_TIERS 单源，编辑器设置族与高度档同排同语义） -->
                <span class="seg ih-font-seg" role="group" aria-label="编辑器字号档">
                  <button v-for="f in EDITOR_FONT_TIERS" :key="f" type="button" :class="{ on: ihFont === f }"
                    :title="'编辑器字号 ' + f + 'px'" @click="ihFont = f">{{ f }}</button>
                </span>
              </div>
              <!-- Profile 耗时树接线（件落地）——profileOn 开时 runDsl 走
                   /cluster/profile，树挂执行行后、直方图节前（DQ run-sec 内 Profile 块紧跟执行区
                   同位序）。ProfileTree 统一件 props 契约：node=shards[0].searches[0].query[0]、
                   total=树根 time_in_nanos；无 profile 数据树不渲染（空态=折叠不占位）；
                   高度受控：组件自带 max(240px,42vh) 定 max 内滚（固定 max 无棘轮面） -->
              <ProfileTree v-if="qryProfileTree" :node="qryProfileTree" :total="qryProfileTotal" @close="qryProfileTree = null" />
              <HistogramSection
                :buckets="qryHist.histBuckets.value" :open="qryHist.histSecOpen.value"
                :meta="qryHist.histHeadMeta.value" :no-date-field="qryHist.histNoDateField.value"
                v-model:auto-hist="qryHist.autoHist.value"
                @toggle="qryHist.histSecOpen.value = !qryHist.histSecOpen.value"
              />
              <!-- 部分分片失败黄条（docs tab 同判据，query 侧独立 computed 读直通
                   _shards）——独立块插直方图与 err-bar/RT 之间，不进 ih-qerr 既有 v-if/v-else-if
                   链（上游锁面零触）；role=status 提示档，可关闭，新响应自动重现（DQ watch 同款） -->
              <div v-if="qryPartialHint && !qryPartialDismissed" class="ih-partial mono" role="status">
                <AlertTriangle :size="12" />
                <span>{{ qryPartialHint }}</span>
                <button class="ih-partial-x" aria-label="关闭提示" title="关闭提示" @click="qryPartialDismissed = true"><X :size="11" /></button>
              </div>
              <!-- 私造红壳（border+err-soft+radius，样式 :ih-qerr 段）退役，合并全局
                   err-bar 形态（role=alert+重试钮+errPreHtml/errMeta 双参；DslQueryView :269 554
                   先例）。v-if/v-else-if 链同条件（qryErr→qryResp）保形 -->
              <div v-if="qryErr" role="alert" class="err-bar ih-qerr">
                <pre class="mono" v-html="errPreHtml(qryErr, errMeta(qryErrRaw))"></pre>
                <button class="btn sm" :disabled="qryLoading" @click="runDsl()">重试</button>
              </div>
              <ResultTable ref="qryTbl"
                export-name="ih-qry"
                :bar-menu-extra="queryBarMenuExtra"
                v-else-if="qryResp" style="margin-top:var(--sp-2)"
                :hide-body="qryView !== 'table'"
                :loading="qryLoading"
                refreshable
                :hits="qryResp.hits" :total="qryResp.total" :took="qryResp.took" :index="cur" :total-gte="qryResp.totalGte" show-relevance
                :field-types="fieldTypesMap"
                :searchable="true"
                :editable="canWrite" @edit-doc="h => openDoc(h, true)"
                @open-doc="openDoc" @delete-doc="askDelDoc" @batch-delete="askBatchDel" @refresh="runDsl"
                @explain-hit="whyHit" @xray-hit="xrayHit"
              >
                <!-- 分页器寄居表格工具行（#bar-prepend，与查询工作台 DslQueryView 同语言）
                     ——同款翻页（es_pager_size 共享，from/size 真检索）同步更新表格头。
                     视图形式切换 seg 同寄居（docs tab 同款四档同注释，顶满钮不接
                     ——query tab 的「构建区」是 DSL 编辑器，高度走 ih.editorH 档位+qryH 拖柄
                     受锁高度链，顶满语义已有等价能力备案不做）；JSON/Tree 档无翻页语义，
                     分页器仅表格/卡片档在场（DQ 同款 v-if） -->
                <template #bar-prepend>
                  <div class="seg ih-view-seg">
                    <button v-for="v in IH_VIEWS" :key="v.k" :class="{ on: qryView === v.k }" @click="qryView = v.k">{{ v.t }}</button>
                  </div>
                  <!-- 1439：改了 DSL 没重新执行时结果还是上一次的——docs/Lucene/工作台同款芯片 -->
                  <span v-if="qryStale" class="pill warn stale-chip" role="status"
                    title="当前 DSL 已修改但还没执行——下方结果仍来自上一次执行（Ctrl+Enter 或点「执行查询」更新）">结果已过期</span>
                  <Pagination v-if="qryView !== 'json' && qryView !== 'tree'"
                    :page="qryPage" :total-pages="qryTotalPages" :page-size="qrySize"
                    :disabled="qryLoading" @update:page="goQryPage" @update:page-size="setQrySize" />
                </template>
                <template #bar-extra>
                  <!-- 1357：行内「原始 IO」钮退役（与 ih-raw-io-query 菜单项重复，同 1357 裁决） -->
                  <!-- 查询 tab 教育文案合并 Info 钮 tooltip（docs tab 同款裁决，去常驻独立行） -->
                  <button class="btn sm ghost rt-tool-btn ih-tip-btn" aria-label="查询操作提示"
                    :title="`对 ${cur} 就地执行 DSL（Ctrl+Enter 执行）；变量、聚合可视化、Profile 等深度调试去「查询工作台」；表格内 Ctrl+F 查找并高亮命中，↑↓ 行导航、Enter 打开文档`">
                    <Info :size="13" />
                  </button>
                </template>
                <!-- alt 三视图体（docs tab 同款）——随默认插槽入表格容器，放大态四视图
                     同屏；json/tree 档挂文档导航条（遍历/_id 直达/打开/编辑直达，与查询
                     工作台同口径），随 RT 的 qryResp 守卫在场，原独立包裹层摘除 -->
                <div v-show="qryView === 'json'" class="scroll-y ih-json-wrap ih-alt-body">
                  <AltHitsViews view="json" :json-html="qryJsonHtml" :doc-count="qryResp?.hits?.length ?? 0" :doc-ids="qryResp?.hits?.map(h => h._id) ?? []" :editable="canWrite" @open-doc-at="i => { const h = qryResp?.hits?.[i]; if (h) openDoc(h) }" @edit-doc-at="i => { const h = qryResp?.hits?.[i]; if (h) openDoc(h, true) }" ref="qryJsonBox" />
                </div>
                <div v-show="qryView === 'tree'" class="scroll-y ih-tree-view ih-alt-body">
                  <AltHitsViews view="tree" :tree-data="qryAltData" :doc-count="qryAltData.length" :doc-ids="qryAltData.map(r => String(r._id ?? ''))" :editable="canWrite" @open-doc-at="i => openAltDocAt(qryAltData, i)" @edit-doc-at="i => openAltDocAt(qryAltData, i, true)" ref="qryTreeBox" />
                </div>
                <div v-show="qryView === 'cards'" class="ih-cards ih-alt-body">
                  <AltHitsViews view="cards" :hits="qryResp.hits" @open-doc="openDoc" />
                </div>
              </ResultTable>
              <!-- query tab 未执行就绪空态（DslQueryView :470 同件同文案风格）——
                   此前 err-bar→RT v-if/v-else-if 链在未执行态漏空白，首进无引导；
                   v-else-if="!qryErr" 与失败态互斥不双显（DQ 同链位） -->
              <EmptyState v-else-if="!qryErr" :icon="FileSearch"
                text="编写 DSL 后点击「执行查询」或按 Ctrl+Enter，命中结果、聚合与直方图将显示在这里" />
            </template>

            <!-- Settings -->
            <template v-else-if="tab === 'settings'">
              <!-- 热参数摘要——不翻 JSON 树也能一眼看到最常查的几个值。
                   与下方 SettingsGrid 去双排：摘要只留增量语义项；
                   摘要三格小卡（.ih-kv border+bg2）退役 → MetaStrip items 消费
                   （页头 ihMeta 同统一件；默认值兜底文案/写阻塞 err 档语义原样进 items）；
                    tip 钮保留（教育文案在场，随行内裸排） -->
              <div class="ih-kv-ms">
                <MetaStrip :items="settingsKvMeta" />
                <button class="btn sm ghost ih-tip-btn" type="button" aria-label="Settings 说明"
                  title="线上实际 settings（含系统键）。要改热参数用「改 Setting」，静态参数需重建。">
                  <Info :size="13" />
                </button>
              </div>
              <!-- SettingsGrid 中文释义——共享件禁改（无扩展 prop/插槽，grep 实证），
                   视图侧 SETTINGS_CATALOG 旁列速查（当前显式键命中目录者，cap 8 防刷屏） -->
              <MetaStrip v-if="catalogHints.length" class="ih-catalog-ms" :items="catalogHints" />
              <!-- JsonTree 换全站统一 SettingsGrid，与 Mapping 页右栏同一张脸 -->
              <SettingsGrid v-if="settings" :rows="settingRows" strip-prefix="index." filterable :max-height="settingsH" :analyze-index="cur || ''" />
              <EmptyState v-else :icon="Sliders" text="未获取到 settings" hint="点页签栏「刷新」重试，或从左侧索引列表切换目标" />
            </template>

            <!-- Mapping： 去 JSON dump，换统一字段树——后端 BO（tree/isNested/isObject）是内部结构，
                 直接摆给用户完全不可读；这里与 Mapping 页同一套口径（折叠/全路径/污染警示） -->
            <template v-else-if="tab === 'mapping'">
              <div class="ih-tip">
                共 <b class="mono">{{ fieldCount }}</b> 个字段。点字段名复制全路径；详细编辑/类型分布请进
                <a class="ih-link" role="link" tabindex="0" @click="goto('/mapping')" @keydown.enter.prevent="goto('/mapping')">Mapping 页</a>。
              </div>
              <MappingFieldTree v-if="mpProps" :properties="mpProps" :index="cur" :max-height="mapH" />
              <EmptyState v-else :icon="List" text="未获取到 mapping" hint="点页签栏「刷新」重试，或从左侧索引列表切换目标" />
            </template>

            <!-- 分片：节点分组可视化分布 + 异常分片警示 -->
            <template v-else-if="tab === 'shards'">
              <template v-if="shardRows.length">
                <div class="ih-sh-sum">
                  <!-- 四枚举手写 pill（STARTED 英文裸出与「迁移中/初始化/未分配」
                       中英混排）退役 → shardSumPills 数据驱动 + shardStateZh/shardStateTone 收口
                       （esEnumZh 跨工蚁契约），StatusPill en 档补英文小字——四档同构无混排 -->
                  <StatusPill v-for="p in shardSumPills" :key="p.state" :tone="shardStateTone(p.state)"
                    :label="shardStateZh(p.state) + ' ' + p.n" :en="p.state" />
                  <span class="ih-sh-total mono">共 {{ shardRows.length }} 分片（{{ curInfo?.pri }} 主 × {{ Number(curInfo?.rep || 0) + 1 }} 份）</span>
                  <span style="flex:1"></span>
                  <!-- 分片分布表复制（Markdown 群聊/工单直贴，与 复制组同语义） -->
                  <button class="btn sm ghost" title="复制分片分布表（Markdown）" @click="copyShardTable"><ClipboardList :size="11" /> 复制分布表</button>
                  <button v-if="shardStats.unassigned" class="btn sm" @click="goto('/diag')"><Stethoscope :size="11" /> 诊断未分配原因</button>
                </div>
                <div v-for="grp in shardsByNode" :key="grp.node" class="ih-sh-node">
                  <div class="ih-sh-node-nm mono" :class="{ bad: grp.node === UNASSIGNED }">
                    <Server :size="12" />{{ grp.node === UNASSIGNED ? '未分配（副本无处可放或分配失败）' : grp.node }}
                    <!--  计数 chip 改用 StatusPill 中性档（锚类 ih-sh-node-cnt 外挂 pill 根） -->
                    <StatusPill class="ih-sh-node-cnt" tone="n" :label="String(grp.shards.length)" />
                  </div>
                  <div class="ih-sh-blocks">
                    <div
                      v-for="(s, i) in grp.shards" :key="i"
                      class="ih-sh-block mono"
                      :class="[s.prirep === 'p' ? 'pri' : 'rep', { bad: s.state !== 'STARTED' }]"
                      :title="`分片 ${s.shard} · ${s.prirep === 'p' ? '主' : '副本'} · ${s.state}\n文档 ${fmtNum(s.docs)} · 存储 ${fmtSize(s.storeBytes)}\n点击复制分片定位`"
                      @click="copyShardLocate(grp.node, s)"
                     role="button" tabindex="0" @keydown.enter.prevent="copyShardLocate(grp.node, s)" @keydown.space.prevent="copyShardLocate(grp.node, s)">
{{ s.shard }}<span class="ih-sh-pr">{{ s.prirep === 'p' ? 'P' : 'R' }}</span>
</div>
                  </div>
                </div>
                <div class="ih-tip" style="margin-top:var(--sp-2h)">
                  <span class="ih-sh-lg pri"></span> 主分片 <span class="ih-sh-lg rep"></span> 副本 悬停块看文档数/存储；节点维度全局视角看
                  <a class="ih-link" role="link" tabindex="0" @click="goto('/topology')" @keydown.enter.prevent="goto('/topology')">拓扑图</a>
                </div>
              </template>
              <!-- 空态引导审计：裸「无分片信息」补下一步——关闭索引无分片数据是常见成因，指向概览页签核实 -->
              <EmptyState v-else :icon="Server" text="无分片信息" hint="索引处于关闭状态或分片尚未就绪，可切「概览」页签核实，或点页签栏「刷新」重试" />
            </template>

            <!-- 运维操作：按风险分区的操作中心；
                 权限门禁——raw 系（数据可见性/close-open/ForceMerge 走 /cluster/raw）仅 ADMIN，
                 settings 系与危险区 rank3+；VIEWER/OPERATOR 见自述空态（不再给会 403 的按钮）。
                 卡中卡降层（照  IndexSettings ir-card 三分节范式）——
                 ih-card-flush 内 11 张描边小卡降为分节网格区块，分节标题走全局 .sec-t 档、
                 分节间上边框分隔；仅危险区（删除等不可逆动作）保留描边档，全部操作入口零丢失 -->
            <template v-else-if="tab === 'ops'">
              <div v-if="!canOps && !canAdmin" class="ih-tip pad">
                当前角色（{{ auth.me?.role || '未识别' }}）为只读/普通写——索引运维操作需专项（CLUSTER_OP/REBUILD_OP）或 ADMIN 角色，联系管理员升权。
              </div>
              <div class="ih-op-sec" v-if="canAdmin">
                <div class="sec-t ih-op-hd">数据可见性<!--  手写胶囊改用 StatusPill（tone 映射：safe→g/success、warn→y/warning、crit→r/danger；锚类 ih-op-risk 外挂 pill 根，色值归 .pill 单源） --><StatusPill class="ih-op-risk" tone="g" label="安全" /></div>
                <div class="ih-op-grid">
                  <div class="ih-op-card">
                    <div class="ih-op-t sec-t"><RotateCw :size="13" /> Refresh 刷新</div><!-- ：中文主显句式（对照同排「Flush 刷盘」，K6 扫尾） -->
                    <div class="ih-op-d">让刚写入的文档立即可搜（正常由 refresh_interval 自动触发）</div>
                    <!--  P0-A：行级执行同款可取消+读秒（busy 文案换字+瞬时取消钮，ops 卡零布局重排） -->
                    <button class="btn sm" @click="opRaw('POST', `/${cur}/_refresh`, '已 refresh，写入立即可见')">{{ opsKey === `/${cur}/_refresh` ? '执行中 ' + (opsQr.elapsedMs.value / 1000).toFixed(1) + 's' : '执行' }}</button>
                    <button v-if="opsKey === `/${cur}/_refresh`" class="btn sm ghost" @click="opsQr.cancel()"><X :size="11" /> 取消</button>
                  </div>
                  <div class="ih-op-card">
                    <div class="ih-op-t sec-t"><Wind :size="13" /> Flush 刷盘</div>
                    <div class="ih-op-d">把内存缓冲落盘并清 translog，重启前/快照前可手动执行一次</div>
                    <!--  P0-A：行级执行同款可取消+读秒 -->
                    <button class="btn sm" @click="opRaw('POST', `/${cur}/_flush`, '已 flush 刷盘')">{{ opsKey === `/${cur}/_flush` ? '执行中 ' + (opsQr.elapsedMs.value / 1000).toFixed(1) + 's' : '执行' }}</button>
                    <button v-if="opsKey === `/${cur}/_flush`" class="btn sm ghost" @click="opsQr.cancel()"><X :size="11" /> 取消</button>
                  </div>
                  <div class="ih-op-card">
                    <div class="ih-op-t sec-t"><Eraser :size="13" /> 清查询缓存</div>
                    <div class="ih-op-d">缓存脏了或压测前清场用，对数据零影响，仅短暂拉低命中率</div>
                    <!--  P0-A：行级执行同款可取消+读秒 -->
                    <button class="btn sm" @click="opRaw('POST', `/${cur}/_cache/clear`, '已清除查询缓存')">{{ opsKey === `/${cur}/_cache/clear` ? '执行中 ' + (opsQr.elapsedMs.value / 1000).toFixed(1) + 's' : '执行' }}</button>
                    <button v-if="opsKey === `/${cur}/_cache/clear`" class="btn sm ghost" @click="opsQr.cancel()"><X :size="11" /> 取消</button>
                  </div>
                </div>
              </div>

              <div class="ih-op-sec" v-if="canSettings">
                <div class="sec-t ih-op-hd">性能维护<StatusPill class="ih-op-risk" tone="y" label="低峰期执行" /></div>
                <div class="ih-op-grid">
                  <div class="ih-op-card" v-if="canAdmin">
                    <div class="ih-op-t sec-t"><Shrink :size="13" /> ForceMerge 段合并</div>
                    <div class="ih-op-d">把段合并到 1 个提升查询性能；重 IO、不可中断，只对不再写的索引做</div>
                    <button class="btn sm" @click="askForceMerge">执行…</button>
                  </div>
                  <div class="ih-op-card">
                    <div class="ih-op-t sec-t"><Sliders :size="13" /> refresh_interval<span v-if="!settings" class="dim" style="margin-left:var(--sp-1h);font-size: var(--fs-2xs)">（配置未加载）</span></div>
                    <div class="ih-op-d">写入高峰调大（如 30s）提吞吐，批量导入时设 -1 关闭自动刷新</div>
                    <div class="ih-op-inline">
                      <n-select v-model:value="riDraft" :options="riOpts" size="small" style="width:110px" :disabled="!settings" />
                      <button class="btn sm" :disabled="!settings || riDraft === (settingOf('refresh_interval') || '1s')" @click="applyRefreshInterval">应用</button>
                    </div>
                  </div>
                  <div class="ih-op-card">
                    <div class="ih-op-t sec-t"><CopyPlus :size="13" /> 副本数<span v-if="!settings" class="dim" style="margin-left:var(--sp-1h);font-size: var(--fs-2xs)">（配置未加载）</span></div>
                    <div class="ih-op-d">加副本提查询并发与容灾；单节点集群设 0 才能 green</div>
                    <div class="ih-op-inline">
                      <input v-model="repDraft" class="inp" type="number" min="0" max="10" style="width:64px" :disabled="!settings" />
                      <button class="btn sm" :disabled="!settings || String(repDraft) === String(settingOf('number_of_replicas'))" @click="applyReplicas">应用</button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="ih-op-sec" v-if="canSettings">
                <div class="sec-t ih-op-hd">可用性<StatusPill class="ih-op-risk" tone="y" label="影响读写" /></div>
                <div class="ih-op-grid">
                  <div class="ih-op-card" v-if="canAdmin && curInfo?.status === 'open'">
                    <div class="ih-op-t sec-t"><Lock :size="13" /> 关闭索引</div>
                    <div class="ih-op-d">关闭后不可读写但数据保留，可随时重新打开；依赖方查询会立刻报错</div>
                    <button class="btn sm" @click="askClose">关闭…</button>
                  </div>
                  <div class="ih-op-card" v-else-if="canAdmin">
                    <div class="ih-op-t sec-t"><LockOpen :size="13" /> 打开索引</div>
                    <div class="ih-op-d">重新恢复读写，分片需重新分配，大索引可能需要几分钟</div>
                    <button class="btn sm" @click="askOpen">打开…</button>
                  </div>
                  <div class="ih-op-card" v-if="blocked">
                    <div class="ih-op-t sec-t" style="color:var(--err)"><ShieldAlert :size="13" /> 解除写阻塞</div>
                    <div class="ih-op-d">当前 blocks.{{ blocked }}；磁盘水位触发的 read_only_allow_delete 需先扩容量</div>
                    <button class="btn sm" @click="unblock">解除</button>
                  </div>
                </div>
              </div>

              <div class="ih-op-sec danger" v-if="canOps">
                <div class="sec-t ih-op-hd" style="color:var(--err)">危险区<StatusPill class="ih-op-risk" tone="r" label="不可逆" /></div>
                <div class="ih-op-grid">
                  <!-- 删除索引唯一入口（头部红钮同批退役，双入口收敛于此） -->
                  <div class="ih-op-card">
                    <div class="ih-op-t sec-t" style="color:var(--err)"><Trash2 :size="13" /> 删除索引</div>
                    <div class="ih-op-d">永久删除 {{ fmtNum(curInfo?.['docs.count']) }} 条文档（{{ semBytes(curInfo?.['store.size']) }}），需输入索引名确认</div>
                    <button class="btn sm danger" @click="askDelIndex">删除…</button>
                  </div>
                  <div class="ih-op-card">
                    <div class="ih-op-t sec-t"><Hammer :size="13" /> 零停机重建</div>
                    <div class="ih-op-d">改静态配置（分片数/分词器）走托管重建，别删库重导</div>
                    <button class="btn sm" @click="goto('/adhoc-rebuild')">去重建</button>
                  </div>
                </div>
              </div>

              <!-- ops 分节行尾原始 IO 快查——行级执行（opRaw→/cluster/raw）入记录环
                   但此前全页取数口只认 /cluster/query；Terminal 钮挂分节行尾（docs/query 两 tab 同款钮形），
                   门禁与行级执行同权（canOps || canAdmin） -->
              <div v-if="canOps || canAdmin" style="margin-top:var(--sp-2)">
                <button class="btn sm ghost" aria-label="查看原始 IO（运维操作）" title="最近一次运维操作的请求/响应原文（语义分档高亮 + 复制/curl 回放）" @click="openRawIo('ops')"><Terminal :size="13" /></button>
              </div>
            </template>
          </div>
        </div>
      </template>
    </div>

    <!-- 新建索引（?create=1 深链可直开，创建成功即选中联动右侧 360 详情）；
         无创建权限彻底卸载组件，深链 ?create=1 也开不出表单（点位隐藏挡不住深链） -->
    <CreateIndexModal v-if="canCreateIdx" :show="createOpen === '1'" @update:show="v => createOpen = v ? '1' : ''" @created="onCreated" />

    <!--  W4：删除索引/单条文档/批量文档三处直挂 ConfirmModal 退役，
         合并全局 askConfirm（askDelIndex/askDelDoc/askBatchDel）；facts 具名行、
         critical 守卫、别名指向后果语句语义原样迁入 -->

    <!-- 文档查看/编辑弹窗（工作区就地 CRUD 闭环）；：640 定宽 → min(720px, 80vw)
         视口弹性档（窄屏不超 80vw、宽屏放宽到 720 容 JSON 树；高度口径 docModalHeightsAssist 锁不动） -->
    <n-modal v-model:show="docOpen" preset="card" :title="'文档 ' + (activeDoc?._id || '')" style="width:min(720px, 80vw)" :bordered="false">
      <template v-if="!docEditMode">
        <!-- 查看态裸 pre 换只读 Monaco（DevTools respLang 模式）——JSON 折叠/行号/
             Ctrl+F 查找/复制齐活；编辑态 JsonArea 不动。高度 min(60vh,420px)：视口弹性、原 420px 兜底。
             挂 dsl-assist 白得通道——只读面补全天然无扰（doc 档键位零候选），
             字段 hover「type · path」白得；fields 复用同页查询口 ihDslAssist（同一 useIndexFields 出口） -->
        <!-- 弹窗字号档复用 ihFont（DevTools dt.font 同页同键约定先例——
             查看/编辑两态与 query tab 编辑器同字号，零新 usePref 键） -->
        <MonacoEditor :model-value="docEditText" language="json" :readonly="true" height="min(60vh,420px)"
          :dsl-assist="{ fields: ihDslAssist.fields, bodyKind: () => 'doc' }" :font-size="ihFont" />
        <div class="ih-docs-bar" style="margin-top:var(--sp-2h)">
          <button v-if="canWrite" class="btn sm pri" @click="docEditMode = true"><Pencil :size="11" /> 编辑</button>
          <button class="btn sm ghost" @click="copyDoc"><Copy :size="11" /> 复制 JSON</button>
        </div>
      </template>
      <template v-else>
        <!-- 编辑态补字段补全：fields 源透传同页查询口（ihDslAssist 同一 useIndexFields 出口）；
             bodyKind 升 'doc' 档（临时 'none'——彼时无 doc 档，缺省 ?? 'search'
             冒充查询体语义只能显式关掉；现 doc 档在档：键位零候选，field 值位白名单出字段候选）。
             rows=14 定高退役 → fill + 外包 min(60vh,420px) 定高 flex 容器
             （JsonArea 无 height 档，fill 链 monaco-host height:auto!important 吃满外包——
             同弹窗查看态同口径对齐）。
             外包定高升 useTierCycle 三档（ih.docH 落盘，dq.docH 同款档序列；
             静态 style 字面=docModalHeightsAssist 黑名单锁面零触，运行时档经 :style 覆盖
             height 位——Vue 合并规则动态优先，首档同值零漂移） -->
        <div class="ih-doc-edit-ja" style="height:min(60vh,420px);display:flex" :style="{ height: docH }">
          <JsonArea v-model="docEditText" fill :dsl-assist="{ fields: ihDslAssist.fields, bodyKind: () => 'doc' }" />
        </div>
        <div class="ih-docs-bar" style="margin-top:var(--sp-2h)">
          <button v-if="canWrite" class="btn sm pri" :disabled="docSaving" @click="saveDoc">{{ docSaving ? '保存中…' : '保存（全量覆盖 _source）' }}</button>
          <button class="btn sm ghost" @click="docEditMode = false">取消</button>
          <!-- 编辑器高度档钮（ih.docH useTierCycle 循环，title 实时回显当前档；
               dq.docH :500 档钮同款形态） -->
          <button class="btn sm ghost" :title="'编辑器高度档：' + docH + '（点击循环）'" @click="cycleDocH">高</button>
        </div>
      </template>
    </n-modal>
    </div>
    <!-- v3.0.1 三竖幅重造(实报「不还是三竖幅吗」):索引列表列退役改抽屉——
         两竖幅(导航+全宽详情);选索引走抽屉(搜索/过滤/排序/行高全能力保留)。
         「选完即收」退役——选中后抽屉保持打开(当前项 .on 高亮),支持跨索引
         反复对比;关闭走工具行关闭钮/Esc/遮罩三条既有路径,语义不变 -->
    <transition name="pop">
      <div v-if="listOpen" class="ih-drawer-mask" @click.self="listOpen = false">
        <div ref="drawerEl" class="ih-left ih-drawer" tabindex="-1" :style="{ width: drawerWCss }"><!-- ：card 壳摘除（556 设计稿 P1）——fixed 浮层上再包一层 .card 是空框感主源；.ih-drawer 既有 padding/shadow-pop/r-l 圆角+遮罩承担层级，bg0 直贴（theme.css .card 依赖随之消失；.ih-left/.ih-drawer 声明零改） -->
          <div class="ih-lbar">
            <button class="ih-collapse-btn" aria-label="关闭索引列表" title="关闭（Esc 也可）" @click="listOpen = false">
              <X :size="13" />
            </button>
            <div class="ih-search">
              <Search :size="12" class="ih-search-ic" />
              <input v-model="kwInput" class="inp" placeholder="搜索索引…（↓ 直入列表）" style="padding-left:26px" @keydown.enter.prevent="onHitKey" @keydown.down.prevent="focusList" @keydown.esc.prevent="onKwEsc" />
            </div>
            <!-- 搜索定位：命中计数 + 上/下一个（Enter/Shift+Enter 在搜索框接线） -->
            <HitNav :count="filtered.length" :current="hitCur" compact @next="hitNext" @prev="hitPrev" />
            <!-- B：元信息排序（字段下拉 + 升/降切换），状态进 URL -->
            <select v-model="sortKey" class="ih-sort-sel" title="排序字段">
              <option v-for="f in SORT_FIELDS" :key="f.k" :value="f.k">{{ f.t }}</option>
            </select>
            <button :aria-label="sortDir === 'asc' ? '升序' : '降序'" class="ih-sort-dir" :title="sortDir === 'asc' ? '升序' : '降序'" @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'">
              <ArrowUp v-if="sortDir === 'asc'" :size="13" />
              <ArrowDown v-else :size="13" />
            </button>
            <!-- 抽屉宽度三档循环钮（常规 32vw/宽 40vw/吃满 86vw），usePref 跨会话记忆（ih.editorH 同款范式） -->
            <button :aria-label="`抽屉宽度：当前${drawerWLabel}，点击循环三档`" class="ih-sort-dir" :title="`抽屉宽度：${drawerWLabel}（点击循环 常规→宽→吃满）`" @click="cycleDrawerW">
              <MoveHorizontal :size="13" />
            </button>
            <!-- 放大/还原双态钮（历史重构遗失，裁决回补）——同钮双态聚焦范式；
                 放大=工作区整行(.ih)全屏聚焦面 .fs-active，还原钮同步内置于工作区卡片头（防盖死） -->
            <button :aria-label="fsActive ? '还原工作区' : '放大工作区'" class="ih-collapse-btn ih-fs-btn" :class="{ on: fsActive }"
              :title="fsActive ? '还原工作区（Esc 也可）' : '放大工作区（列表+详情整行全屏）'" @click="toggleFs">
              <Minimize2 v-if="fsActive" :size="13" />
              <Maximize2 v-else :size="13" />
            </button>
            <button aria-label="刷新索引列表" class="btn sm ghost" title="刷新索引列表" :disabled="store.loadingIndices" @click="store.loadIndices()">
              <RefreshCw :size="12" :class="{ spinning: store.loadingIndices }" />
            </button>
            <!-- 新建索引一等入口；：rank3+ 可见（/cluster/create-index=CLUSTER 档） -->
            <button v-if="canCreateIdx" aria-label="新建索引（名称校验 + 分片/副本 + 别名 + 高级 JSON）" class="btn sm pri" title="新建索引（名称校验 + 分片/副本 + 别名 + 高级 JSON）" @click="createOpen = '1'">
              <Plus :size="12" />
            </button>
          </div>
          <div class="seg ih-seg ih-seg-wrap">
            <button v-for="h in healthTabs" :key="h.k" :class="{ on: healthF === h.k }" @click="healthF = h.k">
              <span v-if="h.dot" class="ih-hdot" :style="{ background: h.dot }"></span>{{ h.t }}
            </button>
            <!-- v3.0.1：行高三档钮同源同键(es_tbl_rowh/同循环序),与查询工作台行高心智一致 -->
            <button :aria-label="`行高：当前${rowHLabel}，点击循环三档`" class="ih-rowh-btn"
              :title="`行高：${rowHLabel}（点击循环 紧凑→标准→宽松）`" @click="cycleRowH">
              <AlignJustify :size="12" /> {{ rowHLabel }}
            </button>
          </div>
          <div class="ih-list scroll-y" ref="listEl" tabindex="0"
               @keydown="onRowNavKey" @focus="ihKb = true" @blur="ihKb = false">
            <div v-if="store.loadingIndices && !store.indices.length" style="padding:var(--sp-2)">
              <SkeletonBox v-for="i in 8" :key="i" height="30px" round style="margin-bottom:var(--sp-1h)" />
            </div>
            <div
              v-for="(idx, i) in filtered" :key="idx.index"
              class="ih-row" :class="{ on: idx.index === cur, 'ih-kb-focus': ihKb && i === ihFocus, 'ih-compact': rowH === 'compact', 'ih-cozy': rowH === 'cozy' }"
              :data-hit-idx="i + 1"
              @click="select(idx.index)"
              @contextmenu.prevent="openIdxMenu($event, idx.index)"
              @keydown="onIdxMenuKey($event, idx.index)"
              role="button" tabindex="0" @keydown.enter.prevent="select(idx.index)" @keydown.space.prevent="select(idx.index)">
              <span class="ih-hdot" :style="{ background: healthColor(idx.health) }"></span>
              <div class="ih-row-main">
                <div class="ih-row-top">
                  <span class="ih-row-nm mono" :title="idx.index"><MarkText :text="idx.index" :kw="kwInput" /></span>
                  <span
                    v-if="rowAliases(idx.index).length"
                    class="ih-row-alias" :title="'别名：' + rowAliases(idx.index).join(', ')"
                  >{{ rowAliases(idx.index).length }} 别名</span>
                  <span class="ih-row-docs mono">{{ fmtNum(idx['docs.count']) }}</span>
                </div>
                <div class="ih-row-meta mono" :title="`存储 ${idx['store.size'] || '-'} · ${idx.pri}/${idx.rep} 分片 · 创建 ${fmtDate(idx['creation.date.string'])}`">
                  <!-- 裸 ES 字节串退役 → semBytes 同页同口径（title 恒 raw 原串） -->
                  {{ semBytes(idx['store.size']) }} · {{ idx.pri }}/{{ idx.rep }} 分片
                </div>
              </div>
              <button :aria-label="'复制：' + idx.index" class="ih-row-copy" :title="'复制：' + idx.index" @click.stop="doCopyName(idx.index)"><Copy :size="10" /></button>
            </div>
            <EmptyState v-if="!filtered.length && store.indices.length" compact :icon="Search" text="无匹配索引" action-text="清除过滤" @action="kw = ''; healthF = 'all'" />
            <EmptyState v-else-if="!filtered.length && !store.loadingIndices" compact :icon="Boxes" text="集群暂无索引" />
          </div>
          <div class="ih-lfoot mono">{{ filtered.length }} / {{ store.indices.length }}<span v-if="ihKb" class="ih-kbd-hint" title="列表已获焦：↑↓ 浏览、Home/End 跳首末、Enter 选中">↑↓ Enter</span></div>
        </div>
      </div>
    </transition>
  </div>

  <ReconcileReportDrawer v-model:show="rrOpen" />

  <!-- 1142：索引行右键（此前列表行无右键）——选中/复制/打开工作区四 tab/带词进查询/
       别名与 Mapping 直达；分组菜单两跳可达，列表只留行选中与复制钮不膨胀。 -->
  <CellContextMenu v-if="idxMenu" :x="idxMenu.x" :y="idxMenu.y" :title="'索引 · ' + idxMenu.name"
    :items="idxMenuItems" @close="idxMenu = null" />

  <!-- 查询 tab 页内历史（mode=dsl 单档全量，不做 index 过滤——简单优先：
       就地 DSL 常跨索引复制调参，索引维度过滤反而藏条目；模式维度过滤在查询工作台抽屉已有）。
       play=回填 dsl 草稿并执行（走 runDslNew→runDsl 既有 JSON 合法性门与 from/size 注入草稿路径，
       不得绕过；push 存的是编辑器原文，回放安全）；fill=仅回填；导入/清空关闭（同 SqlConsole 口径）；
       actions 加 'fav'（面板内建行级门：本页 histRows 恒 mode='dsl'，星标钮全行可达），
       favHistRow 复制适配自 QueryHubView（直写 es_query_saved，共享件与 QueryHubView 零改）；
       actions 加 'curl'（552 内建行级钮，curl 组装归宿主 histCurl，DevTools 先例）；
       actions 加 'newtab'（561b 内建行级钮，带到 DevTools 新 Tab 组装归宿主
       ihHistNewTab，DQ openInDevTools _prefill 通道平移）+ histRows 并显 lucene 行
       （docs 检索历史 只写不显的入口闭环，show-mode 徽标区分两模式） -->
  <n-modal v-model:show="histOpen" preset="card" title="查询历史（索引工作区）" style="width:640px;max-width:92vw" :bordered="false">
    <QueryHistoryPanel
      :items="histRows" :actions="['play', 'fill', 'copy', 'fav', 'curl', 'newtab', 'del']" :clearable="false" :importable="false" :show-mode="true"
      empty-text="执行成功后自动记录（上限 100 条），可一键回填重跑"
      @play="h => replayIhHist(h, true)" @fill="h => replayIhHist(h, false)" @del="h => qh.removeOne(h.id)"
      @fav="favHistRow" @curl="histCurl" @newtab="ihHistNewTab"
    />
  </n-modal>

  <!-- 原始 IO 弹窗（宿主受控开关；rec=最近一次 /cluster/query 记录，docs/query 两 tab 共用） -->
  <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, onActivated, onDeactivated, watch, nextTick, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import { NSelect, NModal } from 'naive-ui';
import {
  Search, RefreshCw, Copy, Boxes, Sliders, Hammer, Trash2, ScrollText,
  RotateCw, Wind, Eraser, Shrink, Lock, LockOpen, FileSearch,
  Stethoscope, Server, CopyPlus, ShieldAlert, Plus, Play, ExternalLink, Pencil, ArrowUp, ArrowDown, ArrowUpDown, Rocket, ClipboardList, AlignJustify, X, List, AlertTriangle, Info,
  Link2, FolderTree, Maximize2, Minimize2, MoveHorizontal, History, Terminal} from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';
import MarkText from '../components/MarkText.vue';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue'; /* 1142：索引行右键 */
import { stripJsonComments, prettyJson, highlightJson } from '../utils/jsonc'; /* ：prettyJson/highlightJson——alt JSON 视图渲染源（DQ 同款） */
import { errPreHtml, errMeta } from '../utils/errPre'; /* ：失败态 err-bar pre v-html 内核+错误码/失败端点双参（DQ/Xmigrate 同源） */
import Pagination from '../components/Pagination.vue';
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue';
import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（docs/query 两个结果工具行共用，ioRecorder 记录环取数） */
import RawIoModal from '../components/RawIoModal.vue';
import ReconcileReportDrawer from '../components/ReconcileReportDrawer.vue';
import { friendlyEsError } from '../utils/esError';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useUrlState, useIdxState, usePref } from '../composables/urlState';
import { useTierCycle } from '../composables/useTierCycle'; /* ：抽屉宽度档循环合并统一件（ih.drawerW 键/档位零迁移） */
import { useScopedDraft } from '../composables/useScopedDraft';
import { useResultStale } from '../composables/useResultStale';
import { useHitLocate } from '../composables/useHitNav';
import { useRowNav } from '../composables/useRowNav';
import { askConfirm } from '../composables/confirm';
import { fmtNum, fmtSize, copyText, healthColor, fmtDate, splitSize } from '../utils/format';
import { sortIndices, type IndexSortKey } from '../utils/indexSort';
import { normalizePrefEnum } from '../utils/prefEnum';
import { buildDocsDsl, docsQuerySummary } from '../utils/workbench';
import { totalOf } from '../utils/format';
import { flattenMapping } from '../utils/mappingTree';
import { toSettingRows } from '../utils/settingsView';
/* SettingsGrid 中文释义——视图侧消费静态目录（共享件禁改，旁列速查） */
import { SETTINGS_CATALOG } from '../utils/indexSettingsCatalog';
import type { SearchHit, SearchResp } from '../types';
import LuceneInput from '../components/LuceneInput.vue';
import SettingsGrid from '../components/SettingsGrid.vue';
import JsonArea from '../components/JsonArea.vue';
import MonacoEditor from '../components/MonacoEditor.vue';
import ResultTable from '../components/ResultTable.vue';
import AltHitsViews from '../components/AltHitsViews.vue'; /* ：alt 三视图体内脏共享件（DQ/RT/QRT 后第四消费面；Tree 档渲染体由组件内承） */
import SplitHandle from '../components/SplitHandle.vue'; /*  P2：编辑器高度拖柄（dq.mainH 同款自定态） */
import HistogramSection from '../components/HistogramSection.vue'; /* ：直方图节组件化接线（DQ 同套组件同位序） */
import ProfileTree from '../components/ProfileTree.vue'; /* ：query tab Profile 耗时树（件落地） */
import { useHistAgg } from '../composables/useHistAgg'; /* ：直方图注入链统一件（DQ execQuery 同链合并） */
import SkeletonBox from '../components/SkeletonBox.vue';
import EmptyState from '../components/EmptyState.vue';
import CreateIndexModal from '../components/CreateIndexModal.vue';
import MappingFieldTree from '../components/MappingFieldTree.vue';
import HitNav from '../components/HitNav.vue';
import { useIndexFields } from '../composables/useIndexFields';
import { useTermsSuggest } from '../composables/useTermsSuggest';
import { useQueryHistoryStore } from '../stores/queryHistory';
import QueryHistoryPanel from '../components/QueryHistoryPanel.vue'; /* ：查询 tab 页内历史面板合并共享件（SqlConsoleView 范式） */
import { useTablePrefs } from '../composables/useTablePrefs';
import { usePagerSize } from '../composables/usePagerSize';
import { EDITOR_HEIGHTS, EDITOR_H_TIERS, EDITOR_FONT_TIERS, type EditorHKey } from '../utils/editorTiers';
/* 统一件四连合并——StatusPill（状态徽标）/esEnumZh（indexStatusZh+shardState 双件）/
useLinkCarry（rankdebug/xray 一次性 carry）/useDebounceFn（kw 搜索防抖）；semFormat+parseBytes
（store.size 裸 ES 串 bytes 化） */
import StatusPill from '../components/StatusPill.vue';
import { indexStatusZh, shardStateZh, shardStateTone } from '../utils/esEnumZh';
import { useLinkCarry } from '../composables/useLinkCarry';
import { useDebounceFn } from '../composables/useDebounceFn';
import { semFormat } from '../composables/useSemFormat';
import { parseBytes } from '../utils/format';
import { lintDsl } from '../utils/dslLint'; /* ：查询 tab JsonArea 划线体检（只消费既有出口） */
import { shardsHint } from '../utils/shardsHint'; /* ：部分分片失败黄条（DQ .dq-partial 先例同件同口径） */
import { useQueryRun } from '../composables/useQueryRun'; /*  P0-A：执行读秒+可取消（ 范式统一件） */
import { writeStoredRaw } from '../utils/safeJson';
import { resolveSortField } from '../utils/sortField';
import { appendLuceneClause } from '../utils/filterMerge';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';

const router = useRouter();
const store = useAppStore();
/* ═══ ：权限门禁（镜像后端拦截器，体验层防误点）═══
   raw 系（refresh/flush/close/open/forcemerge 走 /cluster/raw）=ADMIN；
   settings 系（applySetting→update-settings）/删索引/重建/新建索引=rank3(ops)；
   文档就地编辑=OPERATOR(write)。安全边界在后端，这里让越权按钮「不展示」 */
const auth = useAuthStore();
/* 端点级单一权限入口 canEndpoint——按钮按其真实调用的写端点裁决
   （页命中=精确本页写键；共享端点=任意连接写键；静态模型回落角色档） */
const canWrite = computed(() => auth.canEndpoint('write', 'POST', '/internal/es/index/cluster/update-partial', store.target));
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/delete-index', store.target));
/* 文档删除走 delete-by-id（shared: search/indices），与删索引的归属页不同；
   ResultTable 的删除钮按 delete-by-id 展示，执行体必须同门。 */
const canDeleteDoc = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/delete-by-id', store.target));
const canRebuild = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/adhoc-rebuild/start', store.target));
const canCreateIdx = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/create-index', store.target));
const canSettings = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/index-settings/update', store.target));
/* DevTools 入口能力（1124）：与 Snapshots/Ilm 同源（admin 档 = DevTools/REST 页写键或 ADMIN） */
const canDevtools = computed(() => auth.canEndpoint('admin', 'POST',
  '/internal/es/index/cluster/devtools/execute', store.target));
/* raw 系分节全是系统管理面（refresh/flush/cache/forcemerge/close/open）：
   非 ADMIN 即使持 w:rest 也会被 raw 守卫 403，入口与执行体同档。 */
const canAdmin = computed(() => auth.canAdminOps());

/* ==== 左列表 ==== */
const kw = useScopedDraft('kw', { route: 'indices' }, '').text;
/* 搜索防抖——大集群数百索引时逐击键全量过滤 + 写 URL 会卡手感；
   输入绑本地 ref，300ms 静默后才落 kw（URL 同步/过滤仍走 kw，分享链接不受影响）。
   手写 kwTimer（卸载后仍会触发一次）合并 useDebounceFn 统一件（卸载自动清） */
const kwInput = ref(kw.value);
const commitKw = useDebounceFn((v: string) => { kw.value = v; }, 300);
watch(kwInput, v => commitKw(v));
watch(kw, v => { if (v !== kwInput.value) kwInput.value = v; }); // 外部改 kw（URL 还原/清空）回灌输入框
const healthF = useScopedDraft('health', { route: 'indices' }, 'all').text as Ref<'all' | 'green' | 'yellow' | 'red'>;
const healthTabs = [
  { k: 'all', t: '全部', dot: '' },
  { k: 'green', t: 'green', dot: 'var(--ok)' },
  { k: 'yellow', t: 'yellow', dot: 'var(--warn)' },
  { k: 'red', t: 'red', dot: 'var(--err)' },
] as const;

/* B：索引列表元信息排序（sortKey/sortDir 进 URL 可重入；客户端排，后端不动） */
const sortKey = useUrlState('sort', 'index') as Ref<IndexSortKey>;
const sortDir = useUrlState('dir', 'asc') as Ref<'asc' | 'desc'>;
const SORT_FIELDS: { k: IndexSortKey; t: string }[] = [
  { k: 'index', t: '索引名' },
  { k: 'docs.count', t: '文档数' },
  { k: 'store.size', t: '存储大小' },
  { k: 'health', t: '健康' },
  { k: 'pri', t: '主分片' },
  { k: 'rep', t: '副本' },
  { k: 'creation.date.string', t: '创建时间' },
];

const filtered = computed(() => {
  let list = store.indices.slice();
  const k = kw.value.trim().toLowerCase();
  if (k) list = list.filter(i => i.index.toLowerCase().includes(k));
  if (healthF.value !== 'all') list = list.filter(i => i.health === healthF.value);
  return sortIndices(list, sortKey.value, sortDir.value);
});

/* 搜索定位：过滤结果即命中集，行按渲染序带 data-hit-idx，Enter/Shift+Enter 逐个跳 */
/* v3.0.1 三竖幅重造:列表列退役改抽屉(实报「不还是三竖幅吗」)——
   两竖幅(导航+全宽详情);选索引=抽屉(全能力)或引导页;起选中不自动关抽屉 */
/* 交互修复：listOpen 持久化（usePref 全站范式，键 esquerystudio.pref.ih.listOpen）——
   刷新后保持用户上次的开合状态；首次无存值默认关，与原行为一致 */
const listOpen = usePref('ih.listOpen', false) as Ref<boolean>;
const drawerEl = ref<HTMLElement | null>(null);
function onDrawerKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
  /* stopImmediatePropagation——放大态(.fs-active)与抽屉可能同时挂 Esc 监听，
     两层弹出必须逐层退出：先挂的处理器关自己的层后拦住同 target 的后挂处理器 */
  e.stopImmediatePropagation();
  listOpen.value = false;
}
watch(listOpen, on => {
  if (on) document.addEventListener('keydown', onDrawerKeydown, true);
  else document.removeEventListener('keydown', onDrawerKeydown, true);
});
onBeforeUnmount(() => document.removeEventListener('keydown', onDrawerKeydown, true));

/* ═══ ：工作区放大/还原（历史重构遗失回补，Lead 裁决）═══
   放大 = .ih 整行（详情工作区）进 .fs-active 全屏聚焦面（fixed inset12，z 走 --z-focus）；
   Esc 逐层退出（抽屉先收、聚焦面后退），监听范式与抽屉同款（watch 挂摘 + 卸载清理） */
const fsActive = ref(false);
/* 放大态触发钮存档——Esc 退出还档（铁律 D1#5；570 FocusableSurface 约定同款，
   自制放大态此前无焦点管理，退出后键盘用户丢位置） */
let fsTrigger: HTMLElement | null = null;
function toggleFs() {
  fsActive.value = !fsActive.value;
  /* 放大面 z(--z-focus=300) 高于抽屉(251)：开着抽屉放大会被面盖住成死区——放大即收抽屉 */
  if (fsActive.value) {
    fsTrigger = (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    listOpen.value = false;
  }
}
function onFsKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !fsActive.value) return;
  /* 抽屉开着时让位：抽屉处理器先收抽屉（同 target 竞争由挂载序/stopImmediate 裁决） */
  if (listOpen.value) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
  e.stopImmediatePropagation();
  fsActive.value = false;
  /* 还档=退出伴随效果——触发钮在抽屉内（放大即收抽屉=钮已卸载），
     亡档兜底回页头「索引列表」钮（放大链路入口，逐层退出后立即可再开抽屉） */
  if (fsTrigger && document.contains(fsTrigger)) fsTrigger.focus();
  else document.querySelector<HTMLElement>('[aria-label="索引列表"]')?.focus();
  fsTrigger = null;
}
watch(fsActive, on => {
  if (on) document.addEventListener('keydown', onFsKeydown, true);
  else document.removeEventListener('keydown', onFsKeydown, true);
});
onBeforeUnmount(() => document.removeEventListener('keydown', onFsKeydown, true));

/* ═══ ：抽屉宽度三档（常规 32vw / 宽 40vw 封顶 720 / 吃满 86vw），usePref 跨会话记忆 ═══
   原 v3.0.1 单档 clamp(400px,32vw,560px) 合并为「常规」档默认值；宽度走内联 style（档位数据驱动），
   .ih-left 只保留定位与 86vw 钳制不变量（responsiveGuard） */
const DRAWER_W_TIERS = [
  { k: 'regular', t: '常规', css: 'clamp(400px, 32vw, 560px)' },
  { k: 'wide', t: '宽', css: 'clamp(480px, 40vw, 720px)' },
  { k: 'full', t: '吃满', css: '86vw' },
] as const;
type DrawerWKey = typeof DRAWER_W_TIERS[number]['k'];
/* 档循环合并 useTierCycle 统一件（550/554 同范式）——k 数组驱动，cycle 的
   「当前档切下一档、末档回首档、越档脏值回首档」语义与原 findIndex 手写逐字等价；
   t/css 查表函数保留按选中 k 取值。pref 键 ih.drawerW 不变、默认档 regular 不变，
   用户已存档位零迁移。responsiveGuard239:26 字面锁 `usePref<DrawerWKey>('ih.drawerW', 'regular')`
   随批备案于本注释（断言面待同步更新批换锚 useTierCycle 形态），键与默认档语义不变 */
const { v: drawerW, cycle: cycleDrawerW } = useTierCycle<DrawerWKey>('ih.drawerW', DRAWER_W_TIERS.map(w => w.k), 'regular');
const drawerWTier = computed(() => DRAWER_W_TIERS.find(w => w.k === drawerW.value) || DRAWER_W_TIERS[0]);
const drawerWCss = computed(() => drawerWTier.value.css);
const drawerWLabel = computed(() => drawerWTier.value.t);
/* 交互修复：抽屉 Esc 死链——onDrawerKeydown 对 INPUT 目标直接放行（焦点在搜索框时不接管），
   此前搜索框 Esc 恒为清词，词已空时按 Esc 毫无反应、抽屉关不掉。改两级：词非空→清词；
   词已空→同一处理器关抽屉（关闭路径与 onDrawerKeydown 相同，watch(listOpen) 收监听器） */
function onKwEsc() {
  if (kwInput.value) { kwInput.value = ''; return; }
  listOpen.value = false;
}
const { current: hitCur, next: hitNext, prev: hitPrev } = useHitLocate(() => filtered.value.length, () => drawerEl.value);
function onHitKey(e: KeyboardEvent) { if (e.shiftKey) hitPrev(); else hitNext(); }

/* ═══ ：索引列表键盘导航（useRowNav 共享内核合并，RT/QRT 同语义）═══
   列表获焦（Tab/点击/搜索框 ↓ 直落）后 ↑↓/Home/End 移动高亮、Enter 选中、失焦清高亮；
   输入框聚焦时内核自动不接管（guard 内建）。滚动跟随由本视图接线（.ih-list 是滚动层） */
const listEl = ref<HTMLElement | null>(null);
const { focusIdx: ihFocus, tblFocus: ihKb, onRowNavKey } = useRowNav(
  computed(() => filtered.value.length),
  { onEnter: (i) => { const it = filtered.value[i]; if (it) select(it.index); } },
);
watch(ihFocus, (i) => {
  if (i < 0) return;
  nextTick(() => listEl.value?.querySelectorAll('.ih-row')[i]?.scrollIntoView({ block: 'nearest' }));
});
/* 搜索框 ↓ 直落列表（combobox 习惯）：焦点移交列表并高亮首行 */
function focusList() {
  listEl.value?.focus();
  if (ihFocus.value < 0 && filtered.value.length) ihFocus.value = 0;
}

/* ==== 选中索引（URL 深链 ?idx=，与全局 picked 联动） ==== */
const cur = useIdxState({ follow: true });

/* ?create=1 深链直开新建弹窗（命令面板/外部链接可重入） */
const createOpen = useUrlState('create');
function onCreated(name: string) {
  select(name); // 建完即选中，右侧 360 详情立即可视化验证
  loadAliases(); //  修复：建索引时原子挂的别名也要刷新，否则详情面板显示「无」误导
}
const curInfo = computed(() => store.indices.find(i => i.index === cur.value));
/* 存储大小拆分数值/单位，单位灰化弱显示（*/
const storeSizeParts = computed(() => splitSize(curInfo.value?.['store.size']));
/* 元信息串合并 MetaStrip 统一件：文档/存储(单位拆分弱显示)/分片副本/创建四段走 items，
   别名段保留默认插槽（前 3 截断显示 + 「管控」跳转交互原样）。整条 hover title 原文留根：
   title 里的别名是全量列表而显示只截前 3，拆段 tip 会丢这份兜底信息 */
const ihMeta = computed<MetaStripItem[]>(() => [
  { label: '文档', value: fmtNum(curInfo.value?.['docs.count']) },
  { label: '存储', value: storeSizeParts.value.num, unit: storeSizeParts.value.unit || undefined },
  { label: '分片/副本', value: (curInfo.value?.pri || '-') + '/' + (curInfo.value?.rep || '-') },
  { label: '创建', value: fmtDate(curInfo.value?.['creation.date.string']) },
]);
const ihMetaTip = computed(() =>
  '文档 ' + fmtNum(curInfo.value?.['docs.count']) + ' · 存储 ' + (curInfo.value?.['store.size'] || '-')
  + ' · ' + (curInfo.value?.pri || '-') + '/' + (curInfo.value?.rep || '-') + ' 分片/副本'
  + ' · 创建 ' + fmtDate(curInfo.value?.['creation.date.string'])
  + (curAliases.value.length ? ' · 别名 ' + curAliases.value.map(a => a.alias).join('、') : ' · 无别名'));
/* store.size 裸 ES 串（34.5gb）退役 → semFormat bytes（1024 档位制 34.5 GB 形态，
   与 .nf 数值呈现同族）；解析失败/缺席回落 '-'。title/确认弹窗 facts 恒 raw 不走此件 */
function semBytes(v: any): string {
  return semFormat(parseBytes(v), 'bytes')?.text ?? '-';
}
function select(name: string) {
  cur.value = name;
  store.pick(name); // 全局联动：跳查询/Mapping 等页免二次选索引
}

/* ==== 右详情数据 ==== */
/* 工作区 Tab 矩阵——文档/查询就地化后，一个索引的全生命周期不出本页；
   默认落在「文档」（看数据是选中索引后的第一诉求） */
const TABS = [
  { k: 'docs', t: '文档' },
  { k: 'query', t: '查询' },
  { k: 'mapping', t: 'Mapping' },
  { k: 'settings', t: 'Settings' },
  { k: 'shards', t: '分片' },
  { k: 'ops', t: '运维操作' },
] as const;
type TabKey = typeof TABS[number]['k'];
const tab = useUrlState('tab', 'docs') as Ref<TabKey>;

/* 语义高亮批：tab 行计数——只展示已在手的加载结果（文档=当次检索命中数、
   Mapping=字段数、分片=分片行数），零是「数据未加载」不显示，绝不因此触发请求 */
function tabCount(k: TabKey): number {
  if (k === 'docs') return docsRan.value ? docsTotal.value : 0;
  if (k === 'mapping') return fieldCount.value;
  if (k === 'shards') return shardRows.value.length;
  return 0;
}

const rrOpen = ref(false);
const detailLoading = ref(false);
const detailErr = ref('');
const settings = ref<any>(null);
const mapping = ref<any>(null);
const shardRows = ref<any[]>([]);
const allAliases = ref<any[]>([]);
const curAliases = computed(() => allAliases.value.filter(a => a.index === cur.value));

/* W3 D8：列表行别名徽章——复用详情面板已拉的 allAliases（行式 [{alias,index}]）做反查表 */
const aliasMap = computed(() => {
  const m = new Map<string, string[]>();
  (allAliases.value || []).forEach((a: any) => {
    if (!a?.alias || !a?.index) return;
    if (String(a.alias).startsWith('.')) return; /* 与 useAliases 口径对齐：系统别名不计入徽章 */
    const arr = m.get(a.index) || [];
    arr.push(a.alias);
    m.set(a.index, arr);
  });
  return m;
});
function rowAliases(idx: string): string[] { return aliasMap.value.get(idx) || []; }

/* 热参数取值：兼容 flat（index.number_of_replicas）/ 嵌套（index: { number_of_replicas }）两种返回形态 */
function settingOf(key: string): string {
  const s = settings.value;
  if (!s) return '-';
  const v = s['index.' + key] ?? s.index?.[key] ?? s[key];
  return v == null ? '' : String(v);
}
/* Settings Tab 统一行口径（嵌套→dot-key 拍平，与 Mapping 页同源） */
const settingRows = computed(() => toSettingRows(settings.value || {}));
/* settings 摘要三格 → MetaStrip items（.ih-kv 小卡格退役，页头 ihMeta 同件）——
   键值语义零丢失：默认值兜底文案/写阻塞 err 档原样进 items（值亮/标签暗/·分隔归统一件） */
const settingsKvMeta = computed<MetaStripItem[]>(() => [
  { label: 'refresh_interval', value: settingOf('refresh_interval') || '1s（默认）' },
  { label: '写阻塞', value: blocked.value ? '是（blocks.' + blocked.value + '）' : '否', tone: blocked.value ? 'err' : undefined },
  { label: 'max_result_window', value: settingOf('max_result_window') || '10000（默认）' },
]);
/* SettingsGrid 中文释义——共享件无扩展 prop/插槽（grep 实证），视图侧
   SETTINGS_CATALOG 旁列速查：当前显式 settings 键命中目录者给「键 · 中文释义」段
   （analysis.* 通配目录前缀命中；cap 8 防刷屏，零契约变更） */
const catalogHints = computed<MetaStripItem[]>(() => {
  const hits: MetaStripItem[] = [];
  for (const r of settingRows.value) {
    const k = r.k.replace(/^index\./, '');
    const e = SETTINGS_CATALOG.find(c => c.key === k || (c.key.endsWith('.*') && k.startsWith(c.key.slice(0, -1))));
    if (e) hits.push({ text: k + ' · ' + e.desc });
    if (hits.length >= 8) break;
  }
  return hits;
});
/* settings/mapping 区高度三档（useTierCycle 统一件，558 抽屉宽度档同范式）——
   SettingsGrid/MappingFieldTree 均收 max-height prop，宿主侧换值零组件改动；基线档=
   既有写死值（52vh/50vh）零视觉迁移，档位钮落 ih-tabs 刷新钮旁（⇕，按 tab 显隐） */
const { v: settingsH, cycle: cycleSettingsH } = useTierCycle('ih.settingsH', ['52vh', '70vh', '86vh'], '52vh');
const { v: mapH, cycle: cycleMapH } = useTierCycle('ih.mapH', ['50vh', '70vh', '86vh'], '50vh');
/* 写阻塞侦测：blocks.write / read_only / read_only_allow_delete 任一为 true */
const blocked = computed(() => {
  for (const b of ['read_only_allow_delete', 'read_only', 'write']) {
    const v = settingOf('blocks.' + b);
    if (v === 'true') return b;
  }
  return '';
});

/* 分片分布：状态汇总 + 按节点分组（未分配单独成组排最后） */
const UNASSIGNED = '__unassigned__';
const shardStats = computed(() => {
  const st = { started: 0, relocating: 0, initializing: 0, unassigned: 0 };
  for (const s of shardRows.value) {
    if (s.state === 'STARTED') st.started++;
    else if (s.state === 'RELOCATING') st.relocating++;
    else if (s.state === 'INITIALIZING') st.initializing++;
    else st.unassigned++;
  }
  return st;
});
/* 分片统计四枚举数据驱动（STARTED 恒显、其余非零才出，原显隐语义保留）——
   文案/色档统一走 esEnumZh shardStateZh/shardStateTone 单一出处 */
const shardSumPills = computed(() => ([
  { state: 'STARTED', n: shardStats.value.started, always: true },
  { state: 'RELOCATING', n: shardStats.value.relocating, always: false },
  { state: 'INITIALIZING', n: shardStats.value.initializing, always: false },
  { state: 'UNASSIGNED', n: shardStats.value.unassigned, always: false },
] as { state: string; n: number; always: boolean }[]).filter(p => p.always || p.n > 0));
const shardsByNode = computed(() => {
  const m = new Map<string, any[]>();
  for (const s of shardRows.value) {
    const node = s.node || UNASSIGNED;
    if (!m.has(node)) m.set(node, []);
    m.get(node)!.push(s);
  }
  return [...m.entries()]
    .map(([node, shards]) => ({ node, shards: shards.sort((a, b) => Number(a.shard) - Number(b.shard) || (a.prirep === 'p' ? -1 : 1)) }))
    .sort((a, b) => (a.node === UNASSIGNED ? 1 : b.node === UNASSIGNED ? -1 : a.node.localeCompare(b.node)));
});

/* 从 mapping-detail 响应里取出标准 ES properties 供统一字段树——
   后端返回 {index, tree, raw, stats}，raw 是 unwrap type 层后的 mappings；
   兼容旧形态（直接 _mapping 响应）做多级回退，取不到时给 null 走空态 */
const mpProps = computed<Record<string, any> | null>(() => {
  const m = mapping.value;
  if (!m) return null;
  if (m.raw?.properties) return m.raw.properties;
  const body = m[cur.value]?.mappings || m.mappings || m;
  if (body?.properties) return body.properties;
  for (const v of Object.values<any>(body || {})) if (v && v.properties) return v.properties;
  return null;
});

const fieldCount = computed(() => {
  /* 口径收敛：与字段树同源（flattenMapping 含 object 容器行，与 Mapping 页一致） */
  return mpProps.value ? flattenMapping(mpProps.value).length : 0;
});

/* 字段类型映射（列名→ES 类型）——传给 RT 列头类型徽标（dbx 学习）。
   只取顶层叶子字段（与 docs 检索返回的 _source 扁平键一致）；object 容器不进。
   multi-field 子域（title.keyword 等）同表登记：表头点击排序要按子域类型裁决
   （text 主字段只有 .keyword 子域可排），漏登记会把可排的 text 列误判成不可排。 */
const fieldTypesMap = computed<Record<string, string>>(() => {
  if (!mpProps.value) return {};
  const out: Record<string, string> = {};
  for (const [name, def] of Object.entries<any>(mpProps.value)) {
    if (def?.type) out[name] = def.type;
    for (const [sub, sd] of Object.entries<any>(def?.fields || {})) {
      if (sd?.type) out[name + '.' + sub] = sd.type;
    }
  }
  return out;
});
/* 查询 tab 补全字段源换代——原 ihDslFields 只遍历 mpProps 顶层，嵌套
   a.b.c 与 multi-field .keyword 全缺席；并轨 useIndexFields 全站字段源标准
   （mappingDetail 出口：递归拍平、已排序、缓存/竞态守卫内置，DslQueryView 同源同档）。
   闭包在 setup 作用域声明（模板内联对象箭头函数经 _ctx 代理，渗透 spec 红灯实证）。 */
const { fields: ihIdxFields, ensure: ensureIhFields } = useIndexFields(() => cur.value);
/* terms 通道接值位动态候选（658 DqlQueryView 首发姊妹刀）——仅 DSL 查询 tab
   消费本对象（doc 档两面只复用 .fields 不受涉）；索引源=cur 与 fields 同源，未选索引/异常
   恒 resolve [] 零请求零扰动 */
const ihTerms = useTermsSuggest(() => cur.value);
const ihDslAssist = { fields: () => ihIdxFields.value, bodyKind: () => 'search' as const, terms: (f: string, p: string) => ihTerms.suggestAsync(f, p) };

async function loadDetail(force = false) {
  if (!cur.value) return;
  if (detailLoading.value && !force) return;
  detailLoading.value = true;
  settings.value = null; mapping.value = null; shardRows.value = [];
  const idx = cur.value;
  ensureIhFields(); /* ：补全字段源同点预载（幂等+缓存，失败零降级=无候选） */
  try {
    const [st, mp, sh] = await Promise.allSettled([
      api.indexSettings(idx),
      api.mappingDetail(idx),
      api.shards(idx),
    ]);
    if (idx !== cur.value) return; // 加载途中切了索引：丢弃过期响应
    if (st.status === 'fulfilled') settings.value = st.value?.[idx]?.settings || st.value;
    if (mp.status === 'fulfilled') mapping.value = mp.value;
    if (sh.status === 'fulfilled') shardRows.value = Array.isArray(sh.value) ? sh.value : [];
    const fail = [st, mp, sh].find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
    if (fail) {
      detailErr.value = '部分详情加载失败：' + friendlyEsError(String(fail.reason?.message || fail.reason));
      store.notify('warning', detailErr.value);
    } else {
      detailErr.value = '';
    }
  } finally {
    if (idx === cur.value) detailLoading.value = false;
  }
}
function loadAliases() {
  api.aliases().then(a => { allAliases.value = Array.isArray(a) ? a : []; }).catch(() => { allAliases.value = []; });
}

/* ==== ：原始 IO 快查（docs/query 两 tab 工具行共用） ====
   docs 与 query 就地执行走同一 api.clusterQuery（/cluster/query），记录环按该特征取
   最近一条开弹窗。：判空同步更新（DslQueryView 550 口径逐字平移）——
   无记录 notify 引导不开空弹窗（EmptyState 仍归 RawIoModal 自身兜底）。
   特征串扩双参（551 ⑦c DslQueryView Profile 态双特征回退同形）——
   ops 行级执行（opRaw）走 /cluster/raw 入环，两通道任一有记录即可开弹窗。
   跨 tab 串台修——双参回退全页单源时，docs/query tab 点钮会捞到 ops
   行级执行的 /cluster/raw 记录、ops 钮也恒回退到 query 档旧记录，现场语义不诚实；
   加 scope 参分两路：'query'（docs/query 四钮）只取 /cluster/query（就地检索/DSL
   执行同通道）；'ops'（运维行尾钮）保留 552 双参由来——ops 行级执行走 api.raw=
   /cluster/raw 入环，未命中再回退 /cluster/query（部分 ops 读路径同走 query 通道）。
   判空 notify 文案随 scope 分档引导（记录环近 30 条口径不变）。 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
/* query 档特征链（DQ 侧五写路径口径的本页平移）：
   检索/Profile/文档编辑保存/单删
   批量删四特征回退；本页无新建文档/delete-by-query/PIT 面=负锚不入链。
   ops 档双参语义零触。 */
function openRawIo(scope: 'query' | 'ops' = 'query') {
  const rec = scope === 'ops'
    ? (ioRecorder.last('/cluster/raw') ?? ioRecorder.last('/cluster/query'))
    : (ioRecorder.last('/cluster/query')
      ?? ioRecorder.last('/cluster/profile')
      ?? ioRecorder.last('/cluster/update-document')
      ?? ioRecorder.last('/cluster/delete-by-id'));
  if (!rec) { store.notify('info', scope === 'ops' ? '暂无运维原始 IO 记录，先在本页执行一次运维操作（记录环近 30 条）再查看' : '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

/* ═══ 两 tab 结果表视图形式 seg（DslQueryView 同款四档，能力对齐）═══
   「展示形式统一在表格头」：seg 寄居 RT #bar-prepend，hideBody=非表格档
   （表格体隐藏、工具行常驻；切非表格档自动退聚焦内建零增量）。偏好 usePref 落盘
   ih.docs.view / ih.qry.view（DQ 用 useScopedDraft result-view 键，两页各记各档互不覆写）。
   JSON/Tree/卡片渲染体与 DQ 平移、改用 AltHitsViews 统一件（包裹层留宿主）；「顶满」钮不接——
   DQ 顶满=本页级收起构建区（buildCollapsed），docs tab 无构建区、query tab 的构建区是
   DSL 编辑器（高度走 ih.editorH 档位+qryH 拖柄受锁高度链，ih 编辑器高度档不动），
   语义不适用备案不做（负锚见 ihUnify554 spec 五）。 */
const IH_VIEWS = [
  { k: 'table', t: '表格' },
  { k: 'json', t: 'JSON' },
  { k: 'tree', t: 'Tree' },
  { k: 'cards', t: '卡片' },
] as const;
type IhViewKey = typeof IH_VIEWS[number]['k'];
const IH_VIEW_KEYS = IH_VIEWS.map(v => v.k);
const docsViewPref = usePref<string>('ih.docs.view', 'table');
const qryViewPref = usePref<string>('ih.qry.view', 'table');
const docsView = computed<IhViewKey>({
  get: () => normalizePrefEnum(docsViewPref.value, IH_VIEW_KEYS, 'table'),
  set: v => { docsViewPref.value = v; },
});
const qryView = computed<IhViewKey>({
  get: () => normalizePrefEnum(qryViewPref.value, IH_VIEW_KEYS, 'table'),
  set: v => { qryViewPref.value = v; },
});
/* alt 视图滚动位归零：滚动发生在宿主包裹层（.ih-json-wrap/.ih-tree-view 的 scroll-y），
 组件根（pre/树体）自身不滚；切视图与新一轮结果落定都把包裹层归零，避免 JSON 顶部
 信封行停在上次阅读位置（实报从 }, "hits": 开始） */
const docsJsonBox = ref<{ preEl: HTMLElement | null } | null>(null);
const docsTreeBox = ref<{ treeEl: HTMLElement | null } | null>(null);
const qryJsonBox = ref<{ preEl: HTMLElement | null } | null>(null);
const qryTreeBox = ref<{ treeEl: HTMLElement | null } | null>(null);
function resetAltScroll(view: IhViewKey, json: { preEl: HTMLElement | null } | null, tree: { treeEl: HTMLElement | null } | null) {
  const el = (view === 'json' ? json?.preEl : view === 'tree' ? tree?.treeEl : null)?.parentElement;
  if (el) el.scrollTop = 0;
}

/* ==== ：文档 Tab（就地检索 + 行内编辑 + 删除闭环） ====
   翻页范式与查询工作台统一——同款 Pagination 真分页（from/size 真检索），
   页大小共享记忆键 es_pager_size（与 DslQueryView 同键，一次调节两工作台一致）；
   旧「N 条重查」下拉与 ihub.docsSize 维度键退役（读侧兼容迁移） */
/* 文档 Tab 查询词按工作索引隔离(换索引即清)——查 A 索引的词不应落到 B 索引 */
const docsQDraft = useScopedDraft('q', { route: 'indices', index: () => store.pickedIdx || '' }, '');
const docsQ = docsQDraft.text;
watch(() => store.pickedIdx, () => docsQDraft.clear());
/* 页大小共享记忆合并 usePagerSize 统一件（读写 es_pager_size+档位钳制，
   旧 ihub.docsSize 兼容读平移进统一件）——本视图手写 readPagerSize/set 写盘退役 */
const { size: docsSize, set: writeDocsSize } = usePagerSize();
function setDocsSize(v: number) {
  writeDocsSize(v);
  if (docsRan.value) { docsPage.value = 1; void runDocs(); }
}
const docsPage = ref(1);
const docsTotalPages = computed(() => Math.max(1, Math.ceil(docsTotal.value / Math.max(1, docsSize.value))));
function goDocsPage(p: number) {
  if (p === docsPage.value || docsLoading.value) return;
  docsPage.value = p;
  void runDocs();
}
const docsHits = ref<SearchHit[]>([]);
const docsTotalGte = ref(false);
const docsTotal = ref(0);
const docsTook = ref(-1);
const docsLoading = ref(false);
const docsRan = ref(false);
/* 1439：结果「已过期」判据（DSL/Lucene 同款，useResultStale 共享件）——
   检索词改了但还没按回车/点检索时，表格里仍是上一次执行的内容。
   空词=浏览全部文档，签名就是空串，故哨兵用 null 而不是空串判「从未执行」。 */
const { stale: docsStale, markRun: markDocsRun } = useResultStale(() => docsQ.value, () => docsRan.value);
const docsErr = ref('');
/* 原始错误对象旁路（errMeta 读 code/endpoint；DslQueryView queryErrRaw 同款——
   catch 压串丢结构化字段，失败条双参展示要喂原对象） */
const docsErrRaw = ref<unknown>(null);
/* 部分分片失败黄条（DQ partialHint 先例同判据，docs 侧独立 computed）——runDocs
   响应不整存，成功路径旁路 _shards 落 docsShards 并复位 dismissed（新响应自动重现，等价 DQ
   watch(resp) 语义）；failed/timed_out>0 出黄条；切索引随 docs 清场归零 */
const docsShards = ref<SearchResp['shards']>(null);
const docsPartialDismissed = ref(false);
const docsPartialHint = computed(() => shardsHint(docsShards.value));
/* alt 视图数据源（DQ 同构：Tree= {_id, ..._source} 行集；JSON=响应信封高亮
   pretty 文本——jsonFind 高亮搜索链是 DQ 视图域增强不同步更新，IndexHub JSON 档=只读） */
const docsAltData = computed(() => docsHits.value.map(h => ({ _id: h._id, ...h._source })));
/* json 信封逐文档块化（j-doc-block data-doc-i，与查询工作台同款）——渲染数据直达的
 点击委托按块定位文档；head 保留 total/took 摘要 */
const docsJsonHtml = computed(() => {
  const head = highlightJson(prettyJson({ total: docsTotal.value, took: docsTook.value }));
  const blocks = docsHits.value.map((h, i) => `<span class="j-doc-block" data-doc-i="${i}">` + highlightJson(prettyJson(h._source)) + '</span>').join(',\n');
  return `${head},\n"hits": [\n${blocks}\n]`;
});

/* ═══ ：docs tab 直方图注入链接线（useHistAgg 统一件，DQ execQuery :894-965 同链）═══
   autoHist 开时 runDocs body 注入 __hist；ES 拒绝剥聚合降级重试一次（不连坐主查询）+ session
   拉黑该索引；响应 aggregations.__hist 回填桶。字段源并轨 ihIdxFields（mappingDetail 出口，
   date 型出 mappingDates、类型出 fieldType 分档），偏好键 ih.docs.* 与 DQ 键分开。 */
const docsHist = useHistAgg({
  prefPrefix: 'ih.docs',
  index: () => cur.value,
  mappingDates: () => ihIdxFields.value.filter(f => f.type === 'date').map(f => f.path),
  fieldType: (f) => ihIdxFields.value.find(x => x.path === f)?.type,
  hits: () => docsHits.value,
  mappingKnown: () => ihIdxFields.value.length > 0,
  verBelow650: () => store.verBelow('6.5.0'),
  hasResult: () => docsRan.value,
  notify: (l, m) => store.notify(l, m),
});

/* ═══  P0-A：执行可取消+读秒（DslQueryView L96-99/L817-820 useQueryRun 范式同款）═══
   检索/就地查询/行级 ops 三条执行链不再只能干等：begin() 返回 signal 传 api 既有 signal 参
   （api.clusterQuery/api.raw 第四参），100ms tick 驱动「执行中 X.Xs」；begin 即作废上一轮控制器
   （queryRunRace382 竞态语义随身）；既有 idx 快照竞态守卫一字不动 */
const docsQr = useQueryRun();
const qryQr = useQueryRun();
const opsQr = useQueryRun(); /* 行级执行（ops raw）：执行中钮文案换字+瞬时取消钮 */
const opsKey = ref('');

/* 新查询语义：页码归第 1 页再检索（翻页器用 goDocsPage 保留页码） */
function runDocsNew() {
  docsPage.value = 1;
  void runDocs();
}

/* 收起表格上方的本次错误提示（旧结果仍在，用户已读完原因）——
   只清提示不清错误态以外的东西；下次失败会重新出现。 */
/* 1191：单元格右键「以此值过滤并重查」在索引工作区此前**点了没反应**——
   RT 早已 emit filter-hit（DQ 侧接了），但本 View 的 ResultTable 实例没挂监听，
   菜单项渲染出来却是个死键。索引工作区的查询面是 Lucene 查询词（docsQ），
   所以这里把条件拼成 `field:"value"` 并与既有词 AND 起来再重查——
   与 DQ「条件并入 DSL 再跑」同一心智（就地追加、可撤销、给出回执）。 */
function onDocsFilterHit(p: { field: string; value: unknown; op?: 'term' | 'match'; not?: boolean }) {
  if (!p?.field) return;
  const v = p.value == null ? '' : String(p.value);
  if (!v) return;
  /* Lucene 字面量：值里的引号是唯一需要转义的字符（其余按短语整体匹配） */
  const clause = p.field + ':"' + v.replace(/"/g, '\\"') + '"';
  docsQ.value = appendLuceneClause(docsQ.value, clause, !!p.not);
  store.notify('info', (p.not ? '已排除 ' : '已下钻 ') + p.field + '=' + v + '（条件已并进检索词，可编辑后再跑）');
  runDocsNew();
}

function dismissDocsErr() {
  docsErr.value = '';
  docsErrRaw.value = null;
}

/* ═══  W3：remoteSort 消费侧接线（y 遗留，dbx「排序下推」对标）═══
   RT remote 档只 emit 意图（{f,d:'asc'|'desc'}|null，null=取消排序回原始序），取数归宿主：
   排序变化携 ES sort body 重查当前页（不归页 1——排序是浏览态，页码语义与翻页一致）；
   分页/页大小/刷新/新查询路径走 runDocs 天然携带 docsSort 态；切索引在 watch(cur) 清态。
   查询 tab（qryTbl）不接线：DSL 是用户手写，服务端 sort 下推会与用户 sort 子句冲突。 */
const docsSort = ref<{ f: string; d: 'asc' | 'desc' } | null>(null);
function onDocsSortChange(s: { f: string; d: 'asc' | 'desc' } | null) {
  /* 点 text 列直接下发 sort = fielddata 400；先裁决可排性（有 .keyword 子域→改写子域，
     没有则拦下并给可行动提示，查询现场不动）。docsSort 仍存列名，箭头回显对得上列头。 */
  if (s) {
    const r = resolveSortField(s.f, fieldTypesMap.value);
    if (!r.ok) { store.notify('warning', r.reason || '该列不支持排序'); return; }
  }
  docsSort.value = s;
  void runDocs();
}
/* sort body 注入收口：parse-merge 包一层（buildDocsDsl 是共享纯函数且 源码锁锚其
   字面调用形态，不改 utils/workbench.ts）；unmapped_type 防动态列/跨分片映射缺失 400。
   列名→真实 sort 路径在此裁决（text 有子域走 .keyword），避免 fielddata 400。 */
function buildDocsDslWithSort(): string {
  const o = JSON.parse(buildDocsDsl(docsQ.value, docsSize.value, (docsPage.value - 1) * docsSize.value)) as Record<string, unknown>;
  if (docsSort.value) {
    const r = resolveSortField(docsSort.value.f, fieldTypesMap.value);
    if (!r.ok) return JSON.stringify(o);
    o.sort = [{ [r.field]: { order: docsSort.value.d, unmapped_type: 'long' } }];
  }
  return JSON.stringify(o);
}
/* syncSort 回填通道（约定遗留收口）——docsSort 是宿主权威排序态，
   经此 computed 回填内核 remote 档箭头显示；切索引 watch(cur) 置 null 即内核箭头同步清。
   方向载荷按内核 prop 契约归一 1/-1（'asc'→1 / 'desc'→-1），内核内部再归一 'asc'|'desc'
   （535 公共契约）。computed 保持引用稳定（每次 docsSort 变更才产新对象，不踩内核回灌）。 */
const docsSortSync = computed(() => docsSort.value
  ? { f: docsSort.value.f, d: (docsSort.value.d === 'asc' ? 1 : -1) as 1 | -1 }
  : null);

/* 语义高亮批：Lucene 括号失配纠错（纯客户端确定性检查，零请求零拦截——Enter 照常执行）。
   只报「圆括号失配」一类：未闭合引号与尾随 AND/OR/NOT 已由 LuceneInput 组件内联
   提示条覆盖（语义高亮轮并行改动），这里再报会双重播报。检查前先把「转义对」
   （\( 等字面量）与「成对引号短语」摘成占位，短语内的括号是字面量不参与计数。 */
const docsQLint = computed(() => {
  const q = docsQ.value.trim();
  if (!q) return '';
  const unesc = q.replace(/\\./g, '\u0000');       /* 转义对摘除：\( 不再计括号 */
  const noStr = unesc.replace(/"[^"]*"/g, '\u0001'); /* 成对短语摘除（占位符不带括号）：串内括号是字面量 */
  const open = (noStr.match(/\(/g) || []).length;
  const close = (noStr.match(/\)/g) || []).length;
  if (open > close) return `括号未闭合：${open - close} 个 ( 没有对应的 )`;
  if (close > open) return `括号不匹配：${close - open} 个 ) 没有对应的 (`;
  return '';
});

/* 检索世代守卫（raceGuard858 同款）：docsQr.begin() 作废旧拍是连查合法通道（切索引
   自动重拉/排序变更/历史回放都直调本函数，不加本体闸），过期拍的 AbortError 与用户
   主动取消同形——按世代甄别：当前拍=真取消（播报），过期拍=静默丢弃；loading 与
   finish 同收世代（过期拍 finish 会清掉在途新拍的 AbortController=新拍取消钮失效） */
let docsSeq = 0;
/* 自动执行身份门（DQ autoRunAllowed 同口径）：挂载/切 tab/切索引/历史回放在宿主换 token
   的窗口里都可能触发——probe 未落地时 me=null，旧 target 的查询会先发出去，结果串到新账号
   界面。只读请求也必须在「身份已落地 + 当前目标可读」后才发。 */
const docsAutoAllowed = () => auth.authDisabled
  /* 探测未启动（无鉴权嵌入/测试宿主）视同身份已定——与 store.identityKnown 同口径；
     一旦开始探测，必须等 probed 且身份落地，防旧 target 请求串到新账号 */
  || !auth.probeStarted
  || (auth.probed && auth.me != null && auth.canReadPage('indices', store.target));
let docsAutoPending = false;
/* 用户主动点「检索/重试」不走挂起通道：弹一次提示即可，不排队等身份。
   自动通道（挂载/切 tab/切索引/历史回放）必须等身份落地——回放载荷可能来自上一账号。 */
function runDocsAuto() {
  if (docsAutoAllowed()) { docsAutoPending = false; void runDocs(); return; }
  /* 身份未落地/目标不可读：保留挂起，等 watch 补跑；不让旧 target 的请求先发出去 */
  docsAutoPending = true;
}
watch(() => [auth.probed, auth.authDisabled, auth.me?.username, store.target], () => {
  if (!docsAutoPending || !docsAutoAllowed()) return;
  docsAutoPending = false;
  void runDocs();
});
async function runDocs() {
  if (!cur.value) return;
  const seq = ++docsSeq;
  docsLoading.value = true;
  const idx = cur.value;
  /* 1439：快照取发送时的检索词——await 期间继续输入，结果回来仍要标过期 */
  const sigAtSend = docsQ.value;
  const signal = docsQr.begin(); /*  P0-A：signal 传 post() init；取消以 AbortError 落此 */
  try {
    /* 字段源到位再裁决直方图字段（DQ preloadMapping().then(firstRun) 等位
       语义——首查不等 mapping 时 mappingDates 空沿 → __hist 不注入，节头假阴性
       「未识别到可作直方图的字段」；ensure 幂等+缓存，缓存命中零请求） */
    await ensureIhFields();
    /* 直方图注入链（useHistAgg 统一件，DQ execQuery 同链）——autoHist 开时
       body 注入 __hist；ES 拒绝剥聚合降级重试一次（不连坐主查询），session 拉黑该索引 */
    const bodyObj = JSON.parse(buildDocsDslWithSort()) as Record<string, unknown>;
    const histInjected = docsHist.applyHistToBody(bodyObj);
    let r: SearchResp;
    try {
      r = await api.clusterQuery(idx, JSON.stringify(bodyObj), docsSize.value, signal);
    } catch (e: any) {
      /*  降级（DQ 同款）：自动注入的直方图聚合被 ES 拒不许连坐主查询——剥 __hist 重试一次
         （产线事故：嗅探选错字段/字段非日期型时，ES 400 把成功的主查询也报成「检索失败」） */
      if (!docsHist.shouldDegrade(e, histInjected)) throw e;
      docsHist.stripHist(bodyObj);
      r = await api.clusterQuery(idx, JSON.stringify(bodyObj), docsSize.value, signal);
      docsHist.markBroken();
    }
    if (idx !== cur.value) return; // 途中切索引：丢弃过期响应
    docsHits.value = r.hits || [];
    docsTotal.value = r.total || 0;
    docsTotalGte.value = r.totalGte ?? totalOf(r.hits as any).gte; /*  */
    docsTook.value = r.took ?? -1;
    docsShards.value = (r as any)._shards ?? r.shards ?? null; /* ：分片统计旁路（黄条消费位；qryResp 直通对位——响应不整存只留此件） */
    docsPartialDismissed.value = false; /* ：新响应黄条自动重现（DQ watch(resp) 等价语义——docs 响应不整存，直接在成功路径复位，免对象身份判定） */
    docsRan.value = true;
    markDocsRun(sigAtSend);
    docsErr.value = '';
    docsErrRaw.value = null; /* 原始错误对象随清（失败条旁路态） */
    docsHist.onResp(r); /* ：响应 aggregations.__hist 回填直方图桶 */
    /* 二次嗅探重放（DQ execQuery :1030-1054 同链，未接的补齐）——
       首查时字段源未到位/被拒（mappingDates 空沿）__hist 未注入，响应回来后从 hits 值形态
       补嗅探（epoch 毫秒/秒/ISO），命中则自动重放一次带 __hist 的查询回填直方图桶（主命中集
       已在手不重复回填；重放失败走既有降级拉黑，AbortError=用户取消不算拒绝）。门=未注入
       且无桶：自带 date_histogram / 已降级两态天然不重放，收敛无死循环 */
    if (!histInjected && !docsHist.histBuckets.value.length) {
      const sniffed = docsHist.sniffFromHits(r.hits || []);
      if (sniffed) {
        const retryBody = JSON.parse(buildDocsDslWithSort()) as Record<string, unknown>;
        docsHist.injectField(retryBody, sniffed);
        try {
          const r2 = await api.clusterQuery(idx, JSON.stringify(retryBody), docsSize.value, signal);
          if (idx === cur.value) docsHist.onResp(r2);
        } catch (e: any) {
          if (e?.name !== 'AbortError') docsHist.markBroken();
        }
      }
    }
    /* docs 检索入跨模式历史（mode='lucene'，下方 runDsl push('dsl') 契约同构）——
       查询词原文即 Lucene 串，回放走 QueryHubView replay 的 esquerystudio.lucene.q 既有通道；
       store 按 mode+query+index 去重（翻页/刷新同词不刷屏）。
       空词不入历史：切 docs tab 自动浏览（watch tab 的 runDocs 兜底）是页面行为不是用户查询，
       真机实证空串条目会每次进环刷屏，故仅显式词检索留痕 */
    if (sigAtSend.trim()) useQueryHistoryStore().push('lucene', sigAtSend, idx, r.took);
  } catch (e: any) {
    /*  P0-A：用户主动取消不算错误（DslQueryView  同语义），不进 docsErr 红条；
       被新拍 begin 作废的过期拍静默（假「已取消」播报退役=世代双支甄别） */
    if (e?.name === 'AbortError') { if (seq === docsSeq) store.notify('info', '已取消检索'); }
    else {
      docsErr.value = '文档检索失败：' + friendlyEsError(String(e?.message ?? e));
      docsErrRaw.value = e; /* ：原始对象旁路（errMeta 读 code/endpoint） */
      /* 原位错误条已占位（首查失败=全页错误态；有旧结果=表格上方条），不再叠一个
         右下角 toast 盖住结果表正文——历史仍记，需要时通知面板可回看。 */
      store.notify('error', docsErr.value, { logOnly: true });
      if (sigAtSend.trim()) useQueryHistoryStore().push('lucene', sigAtSend, idx, -1, false); /* 失败也标记（红点口径）；空词不入历史同上 */
    }
  } finally {
    if (seq === docsSeq) { docsLoading.value = false; docsQr.finish(); }
  }
}

/* ==== ：查询 Tab（就地 DSL 迷你控制台，草稿 sessionStorage 防丢） ====
   草稿走 useScopedDraft：按 route+target 维度隔离，切集群不串稿，凭据样键值落盘前掩埋 */
const DEFAULT_DSL = '{\n  "query": { "match_all": {} },\n  "size": 20\n}';
const dslDraft = useScopedDraft('dsl', { route: 'indices',}, DEFAULT_DSL);
const dsl = dslDraft.text;
/* 查询 tab DSL 编辑器高度四档记忆（查询工作台 W-A 同款 usePref 体系，键 ih.editorH，
   默认 S=200px 与原 168px 定高相邻；满档=42vh 视口弹性） */
/* 2.1.4：存量非法档归一（查询工作台同判据） */
const IH_EDITOR_H_KEYS = EDITOR_H_TIERS.map(t => t.k);
const editorHPref = usePref<string>('ih.editorH', 's');
const editorH = computed<EditorHKey>({
  get: () => normalizePrefEnum(editorHPref.value, IH_EDITOR_H_KEYS, 's'),
  set: v => { editorHPref.value = v; },
});
/* 编辑器字号三档（ih.font 落盘，默认 12.5=MonacoEditor 组件既有默认零漂移；
   dq.font/dt.font 同源 EDITOR_FONT_TIERS 单源，经 JsonArea fontSize 薄透传到内层 Monaco） */
const ihFont = usePref<number>('ih.font', 12.5);
/* ═══  P2：编辑器高度拖柄自定态（dq.mainH 同款范式：>0 覆写档位值、档位钮全灭，
   点档位钮清零回档位高度=「回不去」根治）═══
   553 裁决应用=边界随指针：本柄在编辑区下方（受控区上侧），向下拖=编辑区底缘下移=高度增大，
   与 dq.main 同向自然向，无需 553 结果柄的 pointerdown 反向快照锚（该锚只适用于柄在受控区
   上方、向下拖应收窄的形态）。高度链确定解：qryH>0 内联 px 定高 / 否则档位值，无 rAF 反馈 */
const qryH = usePref<number>('ih.qryH', 0);
const dslWrapStyle = computed(() => {
  if (qryH.value > 0) return { height: qryH.value + 'px' };
  return editorH.value === 'full' ? undefined : { height: EDITOR_HEIGHTS[editorH.value] };
});
/* 拖柄读数=编辑区真实高度（SplitHandle 的 aria-valuenow 与拖拽起点锚都消费此值）：
   自定态=落盘 px、档位态=档位 px、满档=容器 flex 实测高（ResizeObserver 写 ref，
   柄高独立于容器高不回写布局，无反馈环），量测不可用时回落满档 CSS 下界 42vh
   （.ih-h-full min-height 口径）——原缺省恒取 34% 视口高，与档位实高错位
   （读屏值失真+起拖首拍从错误锚起算） */
const dslWrapEl = ref<HTMLElement | null>(null);
const dslWrapH = ref(0);
let wrapRo: ResizeObserver | undefined;
watch(dslWrapEl, el => {
  wrapRo?.disconnect();
  wrapRo = undefined;
  if (el && typeof ResizeObserver !== 'undefined') {
    wrapRo = new ResizeObserver(list => { dslWrapH.value = list[0]?.contentRect.height ?? 0; });
    wrapRo.observe(el);
  }
});
onBeforeUnmount(() => wrapRo?.disconnect());
const qryHandleSize = computed(() => {
  if (qryH.value > 0) return qryH.value;
  if (editorH.value === 'full') return Math.round(dslWrapH.value) || Math.round(store.viewportH * 0.42);
  return parseInt(EDITOR_HEIGHTS[editorH.value], 10);
});
/* 上限走响应式视口高（非响应式 innerHeight 在嵌入容器挂载早期会读到 0 并永久缓存） */
const qryHandleMax = computed(() => Math.round(store.viewportH * 0.78));
function onQryHResize(size: number) {
  qryH.value = Math.round(Math.max(200, size));
}
const qryResp = ref<SearchResp | null>(null);
/* 1439：查询 tab 的结果过期判据（docs/Lucene/DSL 工作台同款共享件）——改了 DSL 没重新执行 */
const { stale: qryStale, markRun: markQryRun } = useResultStale(() => dsl.value, () => !!qryResp.value);
const qryErr = ref('');
/* 原始错误对象旁路（docsErrRaw 同款；DslQueryView queryErrRaw 同源） */
const qryErrRaw = ref<unknown>(null);
const qryLoading = ref(false);
/* alt 视图数据源（docs tab 同构；JSON 信封带 aggregations——qryResp 是完整响应）。
 json 信封逐文档块化（j-doc-block data-doc-i，docs tab 同款）——点击委托按块定位 */
const qryAltData = computed(() => (qryResp.value?.hits || []).map(h => ({ _id: h._id, ...h._source })));
const qryJsonHtml = computed(() => {
  const head = highlightJson(prettyJson({
    total: qryResp.value?.total || 0,
    took: qryResp.value?.took ?? -1,
    aggregations: qryResp.value?.aggregations,
  }));
  const blocks = (qryResp.value?.hits || []).map((h, i) => `<span class="j-doc-block" data-doc-i="${i}">` + highlightJson(prettyJson(h._source)) + '</span>').join(',\n');
  return `${head},\n"hits": { "hits": [\n${blocks}\n] }`;
});
/* 部分分片失败黄条（docs tab 同判据）——runDsl 装配 { ...r } 直通含 _shards
   （api.clusterQuery 裸透传未归一，类型侧 SearchResp.shards 为 预留消费位）；
   failed/timed_out>0 出黄条，可关闭，新响应自动重现（DQ watch 同款） */
const qryPartialDismissed = ref(false);
const qryPartialHint = computed(() => shardsHint((qryResp.value as any)?._shards ?? null));
watch(() => qryResp.value, () => { qryPartialDismissed.value = false; });
watch([docsView, docsHits], () => { nextTick(() => resetAltScroll(docsView.value, docsJsonBox.value, docsTreeBox.value)); });
watch([qryView, qryResp], () => { nextTick(() => resetAltScroll(qryView.value, qryJsonBox.value, qryTreeBox.value)); });

/* ═══ ：query tab Profile 耗时树（件落地，DQ execQuery profile 分支同链）═══
   profileOn 开时 runDsl 改走 api.profile（body 透传 _search+profile:true，hits/aggregations
   同形返回——响应消费链零分叉，仅 profile 信封多出 profile 键）；树回填判据同 DQ：
   profile.shards[0].searches[0].query[0]，total=树根 time_in_nanos。默认关（产线查询默认
   开 Profile 是开销源，DQ query.profile 同口径）。 */
const profileOn = usePref('ih.qry.profile', false);
const qryProfileTree = ref<Record<string, unknown> | null>(null);
const qryProfileTotal = ref(1);

/* ═══ ：query tab 直方图注入链（与 docs tab 同一件，偏好键 ih.qry.* 分开落盘）═══
   字段源同轨 ihIdxFields；hits 嗅探源=qryResp.hits（首查前为空——mapping 可用时走 mappingDates，
   不可用时等响应后再评，二次嗅探重放不接线备案）。 */
const qryHist = useHistAgg({
  prefPrefix: 'ih.qry',
  index: () => cur.value,
  mappingDates: () => ihIdxFields.value.filter(f => f.type === 'date').map(f => f.path),
  fieldType: (f) => ihIdxFields.value.find(x => x.path === f)?.type,
  hits: () => qryResp.value?.hits || [],
  mappingKnown: () => ihIdxFields.value.length > 0,
  verBelow650: () => store.verBelow('6.5.0'),
  hasResult: () => !!qryResp.value,
  notify: (l, m) => store.notify(l, m),
});

/* 查询 tab JsonArea 接 lintDsl 划线（PitScrollView 同款挂法——setMarkers 透传口
   注入内层 Monaco，info→hint 降级，debounce 250ms 防每敲一键全量 findMatches；非法 JSON 不
   lint——JsonArea 圆点已报；fields 用 ihIdxFields 现值，lint 不主动拉请求，字段未到位时
   类型规则自然缺席）。draft 稿读自 sessionStorage，immediate 首跑即出划线 */
const dslJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
const parsedIhDsl = computed<Record<string, unknown> | null>(() => {
  const t = dsl.value.trim();
  if (!t) return null;
  try {
    const o = JSON.parse(t);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch { return null; }
});
const queueDslLint = useDebounceFn(() => {
  const o = parsedIhDsl.value;
  if (!o) { dslJaRef.value?.setMarkers?.([]); return; }
  const findings = lintDsl(o, { fields: ihIdxFields.value });
  dslJaRef.value?.setMarkers?.(findings.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(dsl, () => queueDslLint(), { immediate: true });

/* ═══ ：query tab Ctrl+I 唤起补全（Kibana 控制台同键，DevToolsView 平移）═══
   经 JsonArea getEditor 转发通道（ expose 增量）拿内层 Monaco——组件本体零触。
   挂载时序：editor 在子组件 onMounted 创建，watch(ref)+nextTick 后置取防 undefined；
   happy-dom stub 无 getEditor/addCommand 出口 → 守卫跳过（DevToolsView 先例同口径）。
   ⚠ monaco 包走回调内动态 import：本页行为锁测试面（ 等 vi.mock
   MonacoEditor「斩断 monaco 导入链」）不能被静态链拉进真 monaco——558 实证静态 import
   即 5s 挂死（DevToolsView 静态链系 先例彼时无本页此 mock 组合在检）；键位
   KeyMod/KeyCode 单一出处不破。键位面板行由工蚁C 统一加（HotkeyPanel 归他人）。 */
watch(dslJaRef, (ja) => {
  if (!ja) return;
  nextTick(() => {
    const ed = ja.getEditor?.();
    if (!ed || typeof ed.addCommand !== 'function') return;
    void import('monaco-editor/esm/vs/editor/editor.api').then((m) => {
      ed.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyI, () => {
        ed.trigger('', 'editor.action.triggerSuggest', null);
      });
    }).catch(() => { /* 测试 stub 面/包缺失时静默：补全仍有 Ctrl+Space 既有键 */ });
  });
}, { immediate: true });

/* 查询 tab 翻页——runDsl 原硬编码 size 100 无翻页；对齐 docs tab 心智：
   同款 Pagination + 共享页大小记忆 es_pager_size（一次调节两工作台一致）。
   DSL 是用户手写的：执行前解析注入顶层 from/size（DslQueryView 同款覆写语义），
   解析已在 runDsl 的合法性门完成，这里直接消费。 */
const { size: qrySize, set: writeQrySize } = usePagerSize(); /* ：同上合并 usePagerSize（共享键一次调节两表一致） */
const qryPage = ref(1);
const qryTotalPages = computed(() => Math.max(1, Math.ceil((qryResp.value?.total || 0) / Math.max(1, qrySize.value))));
function setQrySize(v: number) {
  writeQrySize(v);
  /* ·实报「分页应按新参数重新请求」：原条件写法在非第 1 页改档时只归页码
     不重查（表格停留在旧页旧档数据）；改档必须以新 size 重新检索（from/size 真分页语义） */
  qryPage.value = 1;
  if (qryResp.value) void runDsl();
}
function goQryPage(p: number) {
  if (p === qryPage.value || qryLoading.value) return;
  qryPage.value = p;
  void runDsl();
}

/* 就地 DSL 带到 DevTools（_prefill 会话契约） */
function openQryInDevTools() {
  if (!qryResp.value) return;
  /* 入口能力前置（1124）：无 DevTools 权限时目标页只会「填入不执行」，在来源页就说清楚 */
  if (!canDevtools.value) { store.notify('warning', 'DevTools 入口需要 DevTools/REST 页写权限或 ADMIN'); return; }
  const idxPath = cur.value ? `/${cur.value}/_search` : '/_search';
  writeStoredRaw(sessionStorage, 'esquerystudio.devtools.open', JSON.stringify({
    title: cur.value || '_search',
    method: 'POST',
    path: idxPath,
    body: JSON.stringify(JSON.parse(stripJsonComments(dsl.value)), null, 2),
    run: true,
  }));
  router.push('/devtools');
}
/* 新查询语义——页码归第 1 页且立即执行（翻页器 goQryPage 保留页码），docs tab runDocsNew
   同款形态；归页与执行是「并」不是「或」（异或旧形态在非首页只拨页码零请求，执行钮/
   Ctrl+Enter/历史回放三通道都要点两次才真正执行） */
function runDslNew() {
  qryPage.value = 1;
  void runDsl();
}
/* 查询世代守卫（raceGuard858 同款，与 docs 链同构）：本体闸（qryLoading）保证同刻
   至多一拍在途，世代与闸等价但形态统一，且finally 清场不再挂 idx 条件——
   切索引后旧拍返回时 idx===cur 恒假，qryLoading 永久卡死（执行/重试钮永久 disabled、
   取消钮常驻，query 链无 docs 链的自动重拉自愈路径） */
let qrySeq = 0;
/* 查询 tab 同款身份门：dsl 草稿可能是上一账号回放/carry 来的，身份未落地前不发。 */
let qryAutoPending = false;
function runDslAuto() {
  if (docsAutoAllowed()) { qryAutoPending = false; void runDsl(); return; }
  qryAutoPending = true;
}
watch(() => [auth.probed, auth.authDisabled, auth.me?.username, store.target], () => {
  if (!qryAutoPending || !docsAutoAllowed()) return;
  qryAutoPending = false;
  void runDsl();
});
async function runDsl() {
  if (!cur.value || qryLoading.value) return;
  const seq = ++qrySeq;
  let bodyObj: any = null;
  try { bodyObj = JSON.parse(dsl.value); } catch { store.notify('warning', 'DSL 不是合法 JSON，先修好再执行'); return; }
  qryLoading.value = true;
  qryErr.value = '';
  qryErrRaw.value = null; /* ：原始错误对象随清（DslQueryView execQuery 同款） */
  qryProfileTree.value = null; /* 565：新执行清旧树（DQ execQuery 同款） */
  const idx = cur.value;
  /* 1439：快照取发送时的 DSL——await 期间继续改稿，结果回来仍要标过期 */
  const qrySigAtSend = dsl.value;
  const signal = qryQr.begin(); /*  P0-A：signal 传 post() init；取消以 AbortError 落此 */
  try {
    /* 字段源到位再裁决直方图字段（runDocs 同款等位语义，ensure 幂等+缓存） */
    await ensureIhFields();
    /* from/size 注入：顶层对象才覆写（数组/标量体原样透传）；与查询工作台同语义 */
    if (bodyObj && typeof bodyObj === 'object' && !Array.isArray(bodyObj)) {
      bodyObj.from = (qryPage.value - 1) * qrySize.value;
      bodyObj.size = qrySize.value;
    }
    /* 直方图注入链（useHistAgg 统一件，DQ execQuery 同链）——顶层对象才注入
       （数组/标量体原样透传）；ES 拒绝剥聚合降级重试一次（不连坐主查询），session 拉黑该索引 */
    const histInjected = bodyObj && typeof bodyObj === 'object' && !Array.isArray(bodyObj)
      ? qryHist.applyHistToBody(bodyObj) : false;
    let r: SearchResp;
    try {
      /* profileOn 开走 /cluster/profile（响应同形，树回填见下）；关走既有通道零变 */
      r = profileOn.value
        ? await api.profile(idx, JSON.stringify(bodyObj), signal) as SearchResp
        : await api.clusterQuery(idx, JSON.stringify(bodyObj), qrySize.value, signal);
    } catch (e: any) {
      /*  降级（DQ 同款）：自动注入的直方图聚合被 ES 拒不许连坐主查询——剥 __hist 重试一次 */
      if (!qryHist.shouldDegrade(e, histInjected)) throw e;
      qryHist.stripHist(bodyObj);
      r = profileOn.value
        ? await api.profile(idx, JSON.stringify(bodyObj), signal) as SearchResp
        : await api.clusterQuery(idx, JSON.stringify(bodyObj), qrySize.value, signal);
      qryHist.markBroken();
    }
    if (idx !== cur.value) return;
    /* totalGte 归一（totalOf 共用件）——与 DslQueryView 同款「命中数为下界」+ 标注 */
    qryResp.value = { ...r, totalGte: r.totalGte ?? totalOf(r.hits as any).gte };
    /* Profile 树回填（DQ execQuery 同判据 shards[0].searches[0].query[0]；
       无 profile 键（普通通道/响应缺树）树不渲染=空态折叠） */
    const penv = r as any;
    const pRoot = penv?.profile?.shards?.[0]?.searches?.[0]?.query?.[0];
    if (pRoot) { qryProfileTree.value = pRoot; qryProfileTotal.value = pRoot.time_in_nanos || 1; }
    qryHist.onResp(r); /* ：响应 aggregations.__hist 回填直方图桶 */
    /* 二次嗅探重放（runDocs 同链同注释）——bodyObj 复用主查询体（已含 from/size，
       未注入分支下无降级改动），顶层对象才补注（数组/标量体不重放） */
    if (!histInjected && qryResp.value && !qryHist.histBuckets.value.length
      && bodyObj && typeof bodyObj === 'object' && !Array.isArray(bodyObj)) {
      const sniffed = qryHist.sniffFromHits(qryResp.value.hits || []);
      if (sniffed) {
        qryHist.injectField(bodyObj, sniffed);
        try {
          const r2 = await api.clusterQuery(idx, JSON.stringify(bodyObj), qrySize.value, signal);
          if (idx === cur.value) qryHist.onResp(r2);
        } catch (e: any) {
          if (e?.name !== 'AbortError') qryHist.markBroken();
        }
      }
    }
    /* 跨模式查询历史接线（DslQueryView 同款 push 形态）——就地 DSL 不再断链 */
    useQueryHistoryStore().push('dsl', qrySigAtSend, idx, r.took);
    markQryRun(qrySigAtSend);
  } catch (e: any) {
    /*  P0-A：用户主动取消不算错误，不进 qryErr 红条（DslQueryView  同语义）；
       过期拍静默（世代双支，与 docs 链同构） */
    if (e?.name === 'AbortError') { if (seq === qrySeq) store.notify('info', '已取消查询'); }
    else {
      /* 错误人话化——docs tab 534 同款口径（裸 e.message 是 ES 原始串一坨，
         friendlyEsError 提 reason/映射常见场景），模板 ih-qerr 形态保持 */
      qryErr.value = '查询失败：' + friendlyEsError(String(e?.message ?? e));
      qryErrRaw.value = e; /* ：原始对象旁路（errMeta 读 code/endpoint，DslQueryView :1079 同款） */
      qryResp.value = null;
      useQueryHistoryStore().push('dsl', qrySigAtSend, idx, -1, false); /* ：失败也标记（红点口径） */
    }
  } finally {
    if (seq === qrySeq) { qryLoading.value = false; qryQr.finish(); }
  }
}

/* ==== ：查询 tab 页内历史（u/Kibana 对标第四维—— push 只写不显，此处补显）====
   mode=dsl 单档全量（不做 index 过滤，Lead 裁决简单优先）；回放必须走 runDslNew→runDsl
   既有 JSON 合法性门（runDsl parse）与 from/size 注入草稿路径，不得绕过；
   push 存的是编辑器原文（dsl.value 即草稿串），回放安全 */
const qh = useQueryHistoryStore();
const histOpen = ref(false);
/* 并显 lucene 行（docs 检索历史 只写不显，K3 补入口闭环；
   dsl 行为既有语义零触；lucene 行回放/带出分派见 replayIhHist/ihHistNewTab 门控） */
const histRows = computed(() => qh.items.filter(i => i.mode === 'dsl' || i.mode === 'lucene'));
function replayIhHist(row: { query: string; mode?: string }, runIt: boolean) {
  /* lucene 行回 docs 检索框（docsQ 草稿路径 + runDocsNew 既有执行链）；
     dsl 行原路径不绕 runDslNew 门（JSON 合法性门 + from/size 注入，锁意零触） */
  if (row.mode === 'lucene') {
    tab.value = 'docs';
    docsQ.value = row.query;
    docsPage.value = 1; /* runDocsNew 原语义：历史回放从第 1 页看起 */
    histOpen.value = false;
    if (runIt) runDocsAuto();
    return;
  }
  dsl.value = row.query;
  qryPage.value = 1; /* runDslNew 原语义 */
  histOpen.value = false;
  if (runIt) runDslAuto();
}
/* 历史行带到 DevTools 新 Tab（openQryInDevTools :252 _prefill 通道平移）——
   lucene 行不适用（DevTools Tab body 是 DSL 语义），notify 引导走 docs 检索框回放；
   dsl 行组装 POST /{index}/_search -d body（行自持 query/index） */
function ihHistNewTab(h: { query?: string; index?: string; mode?: string }) {
  if (h.mode && h.mode !== 'dsl') { store.notify('info', 'Lucene 检索词请回 docs 检索框回放（DevTools 新 Tab 仅收 DSL）'); return; }
  if (!canDevtools.value) { store.notify('warning', 'DevTools 入口需要 DevTools/REST 页写权限或 ADMIN'); return; }
  const idxPath = (h.index ? '/' + h.index : '') + '/_search';
  let body = h.query || '';
  try { body = JSON.stringify(JSON.parse(stripJsonComments(body)), null, 2); } catch { /* 非 JSON 原样带过去 */ }
  writeStoredRaw(sessionStorage, 'esquerystudio.devtools.open', JSON.stringify({
    title: h.index || '_search',
    method: 'POST',
    path: idxPath,
    body,
    run: true,
  }));
  histOpen.value = false;
  router.push('/devtools');
}

/* 历史行一键转收藏（QueryHubView  favHistRow 复制适配——不改共享件，
   也不回改 QueryHubView）。本页无命名弹窗，直写 DslQueryView「保存的搜索」存储 es_query_saved
   （条目形状 {dsl,ts,idx,name} 与 DslQueryView HistItem 同构兼容）；读侧 try+Array.isArray 容错
   （DevToolsView histAllRead 先例）；同名已存跳过——confirmSave 的覆盖确认是 DslQueryView 页内链，
   这里不越权静默覆盖。行级门与 QueryHistoryPanel 面板门同构：非 dsl 行不写（本页 histRows 已滤
   mode='dsl'，此守卫为双保险——面板行级门形态见 QueryHistoryPanel.vue 'fav' 分支）。 */
function favHistRow(it: { mode?: string; query: string; index?: string; ts?: number }) {
  if ((it.mode && it.mode !== 'dsl') || !it.query) return;
  let saved: { name?: string; dsl: string; ts: number; idx?: string; layout?: unknown }[] = [];
  try {
    const r = JSON.parse(localStorage.getItem('es_query_saved') || '[]');
    if (Array.isArray(r)) saved = r;
  } catch { /* 坏值按空处理 */ }
  const name = '收藏 ' + new Date(it.ts ?? Date.now()).toLocaleString('zh-CN', { hour12: false });
  if (saved.some(s => s.name === name)) { store.notify('info', '同名收藏已存在，未重复写入'); return; }
  saved.unshift({ dsl: it.query, ts: it.ts ?? Date.now(), idx: it.index, name });
  try {
    writeStoredRaw(localStorage, 'es_query_saved', JSON.stringify(saved));
    store.notify('success', '已转收藏（保存的搜索）——到查询工作台 DSL 页「保存的搜索」查看');
  } catch {
    store.notify('error', '收藏写入失败（本地存储空间不足）');
  }
}

/* 历史行一键复制 curl（面板 'curl' action 宿主组装，DevToolsView histCurl 手法平移）——
   本页行恒 mode='dsl' 查询体：POST {index}/_search（行无索引回落全局 _search），body=DSL 原文
   （单引号转义防注入断串）；写剪贴板走 copyText 既有单源 */
function histCurl(h: { query: string; index?: string }) {
  const path = (h.index ? '/' + h.index : '') + '/_search';
  const c = `curl -X POST '${window.location.origin}${path}'` +
    (h.query ? ` -H 'Content-Type: application/json' -d '${h.query.replace(/'/g, "'\\''")}'` : '');
  copyText(c).then(ok => store.notify(ok ? 'success' : 'error', ok ? 'curl 已复制' : '复制失败'));
}

/* docs/query 两 tab 工具行 cURL 快速复制（DevToolsView copyCurl/histCurl 手法）——
 docs 档对 buildDocsDslWithSort() 包一层组串（源码锁钉 buildDocsDsl 调用字面，
 原函数零改，排序/分页随当前态）；query 档用编辑器 DSL 原文（执行什么复制什么）；
 body 单引号转义防注入断串，写剪贴板走 copyText 既有单源 + notify 反馈 */
function copyDocsCurl() {
  const path = '/' + cur.value + '/_search';
  const c = `curl -X POST '${window.location.origin}${path}'` +
    ` -H 'Content-Type: application/json' -d '${buildDocsDslWithSort().replace(/'/g, "'\\''")}'`;
  copyText(c).then(ok => store.notify(ok ? 'success' : 'error', ok ? 'curl 已复制' : '复制失败'));
}
function copyQryCurl() {
  const path = '/' + cur.value + '/_search';
  const c = `curl -X POST '${window.location.origin}${path}'` +
    (dsl.value.trim() ? ` -H 'Content-Type: application/json' -d '${dsl.value.replace(/'/g, "'\\''")}'` : '');
  copyText(c).then(ok => store.notify(ok ? 'success' : 'error', ok ? 'curl 已复制' : '复制失败'));
}

/* ==== ：文档查看/编辑/删除（docs 与 query 两个结果表共用） ==== */
const docOpen = ref(false);
const docEditMode = ref(false);
const docSaving = ref(false);
const activeDoc = ref<SearchHit | null>(null);
const docEditText = ref('');
/* ═══ ：文档编辑弹窗 JsonArea 定高升三档（dq.docH 同款档序列，ih.docH 落盘）═══
 首档=原固定值 min(60vh,420px) 零漂移；档钮在弹窗编辑工具行（dq 文档弹窗 :500 同款「高」钮）。
 外包容器静态 style 字面是 docModalHeightsAssist 黑名单锁面（零触），运行时档经
 style 覆盖 static style 的 height 位（Vue 合并规则动态优先）。 */
const DOC_H_TIERS: string[] = ['min(60vh,420px)', 'min(70vh,560px)', 'min(80vh,700px)'];
const { v: docH, cycle: cycleDocH } = useTierCycle('ih.docH', DOC_H_TIERS);
function openDoc(hit: SearchHit, goEdit = false) {
  activeDoc.value = hit;
  docEditText.value = JSON.stringify(hit._source, null, 2);
  docEditMode.value = goEdit;
  docOpen.value = true;
}
/* tree 档导航条直达（行集 = _id 与源字段平铺）：重组回 SearchHit 时把行首 _id 剥出
 _source（元数据字段写回文档体会被 ES 拒收），保存链仍走 updateDocument + 当前索引名 */
function openAltDocAt(rows: Array<Record<string, any>>, i: number, goEdit = false) {
  const row = rows[i];
  if (!row) return;
  const { _id, ...src } = row;
  openDoc({ _id: String(_id ?? ''), _index: cur.value, score: 1, _score: 1, _source: src } as SearchHit, goEdit);
}
async function copyDoc() {
  if (await copyText(docEditText.value)) store.notify('success', '文档 JSON 已复制');
}
async function saveDoc() {
  /* 写权限守卫落执行体——Ctrl+S 键盘通道不经按钮，闸收本体 */
  if (!canWrite.value) { store.notify('error', '当前身份无文档写权限'); return; }
  if (docSaving.value) return; /* ：函数体级防重入 */
  if (!activeDoc.value) return;
  try { JSON.parse(docEditText.value); } catch { store.notify('error', 'JSON 不合法'); return; }
  docSaving.value = true;
  try {
    await api.updateDocument(cur.value, activeDoc.value._id, docEditText.value);
    store.notify('success', '文档已更新：' + activeDoc.value._id);
    docOpen.value = false;
    refreshHits();
  } catch (e: any) {
    store.notify('error', '保存失败: ' + friendlyEsError(String(e?.message ?? e))); /* ：裸 e.message 人话化（XmigrateView w80 先例） */
  } finally {
    docSaving.value = false;
  }
}
/* 编辑态补键盘保存路径——Ctrl/Cmd+S=saveDoc（此前保存只有鼠标路径）。
 DslQueryView onKeySave 同款 window 监听；JsonArea 桥只有 Ctrl+Enter（es-execute 语义不合保存），
 且组件不改（文件锁），故取视图级监听最轻路径。编辑弹窗开着才响应（查看态/弹窗关不拦浏览器
 「保存网页」默认）；Monaco 无 Ctrl+S 内建绑定，preventDefault 顺带掐掉浏览器保存弹窗；
 监听随弹窗态挂摘（onDrawerKeydown 同范式），卸载兜底清理 */
function onDocSaveKey(e: KeyboardEvent) {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
  if (!docOpen.value || !docEditMode.value) return;
  e.preventDefault();
  saveDoc();
}
/* KeepAlive 离页必须摘掉隐藏写键：否则在别的页面按 Ctrl+S 仍会触发本页 saveDoc
 （文档弹窗开着+编辑态时监听才挂；旧实现只在弹窗态变化时摘，离页不摘）。 */
const hubActive = ref(true);
function syncDocSaveListener() {
  if (hubActive.value && docOpen.value && docEditMode.value) window.addEventListener('keydown', onDocSaveKey);
  else window.removeEventListener('keydown', onDocSaveKey);
}
watch([docOpen, docEditMode, hubActive], syncDocSaveListener);
onActivated(() => { hubActive.value = true; });
onDeactivated(() => { hubActive.value = false; });
onBeforeUnmount(() => window.removeEventListener('keydown', onDocSaveKey));

/* 文档/DSL 两个结果表引用：删除成功后精确清理勾选（防幽灵 id 流入批量操作） */
const docsTbl = ref<InstanceType<typeof ResultTable> | null>(null);
const qryTbl = ref<InstanceType<typeof ResultTable> | null>(null);
/* W4：单条文档删除合并 askConfirm（直挂 ConfirmModal 退役）——
 facts 具名行沿用口径（索引/文档 ID），正文只留动作语句 */
async function askDelDoc(hit: SearchHit) {
  /* 执行体首行守卫——行内删除钮/Del 键/右键菜单同汇入本函数，点位隐藏挡不住键盘旁路 */
  if (!canDeleteDoc.value) { store.notify('warning', '删除需专项或 ADMIN 角色'); return; }
  if (!await askConfirm({
    title: '删除文档',
    message: '将删除该文档，不可恢复。',
    level: 'warn',
    okText: '删除',
    dismissable: true,
    facts: [{ label: '索引', value: cur.value }, { label: '文档 ID', value: hit._id || '-' }],
  })) return;
  try {
    await api.deleteById(cur.value, hit._id);
    store.notify('success', '已删除文档：' + hit._id);
    /* 删除成功即从表格勾选集剔除该 id，防幽灵勾选流入后续批量操作 */
    docsTbl.value?.clearSelected([hit._id]);
    qryTbl.value?.clearSelected([hit._id]);
    refreshHits();
  } catch (e: any) {
    store.notify('error', '删除失败: ' + friendlyEsError(String(e?.message ?? e))); /* ：裸 e.message 人话化（w80 先例） */
  }
}

/* W4：批量文档删除合并 askConfirm——critical 守卫（输入文档数）语义原样 */
async function askBatchDel(ids: string[]) {
  if (!canDeleteDoc.value) { store.notify('warning', '删除需专项或 ADMIN 角色'); return; }
  if (!await askConfirm({
    title: '批量删除文档',
    message: '将删除选中的文档，不可恢复。',
    level: 'critical',
    guardText: String(ids.length),
    okText: '批量删除',
    facts: [{ label: '索引', value: cur.value }, { label: '文档数', value: String(ids.length) }],
  })) return;
  const failures: string[] = [];
  for (const id of ids) {
    try { await api.deleteById(cur.value, id); } catch { failures.push(id); }
  }
  if (failures.length) store.notify('error', `批量删除失败 ${failures.length} 条`);
  else store.notify('success', `已删除 ${ids.length} 条文档`);
  /* 只剔除删除成功的 id；失败的保留勾选让用户重试或手动清理 */
  docsTbl.value?.clearSelected(ids.filter(id => !failures.includes(id)));
  qryTbl.value?.clearSelected(ids.filter(id => !failures.includes(id)));
  refreshHits();
}

/* 写操作后刷新当前 Tab 的命中集（删改后结果表不说谎） */
function refreshHits() {
  if (tab.value === 'query' && qryResp.value) runDsl();
  else if (docsRan.value) runDocs();
}

/* Tab 首次进文档页自动拉一批（免手动点检索才见数据） */
watch(tab, t => { if (t === 'docs' && cur.value && !docsRan.value && !docsLoading.value) runDocsAuto(); });

watch(cur, () => {
  loadDetail(true);
  /* 切索引后旧命中集/查询结果属于上个索引，必须清场避免误导；文档页激活中则自动重拉 */
  docsHits.value = []; docsTotal.value = 0; docsTook.value = -1; docsRan.value = false; docsPage.value = 1; /* 切索引翻页归位 */
  docsShards.value = null; /* ：切索引黄条随旧命中集清场（qryResp=null 同语义） */
  docsSort.value = null; /* ：切索引清排序态——排序属于当前索引维度，新索引回原始序 */
  docsErr.value = ''; docsErrRaw.value = null; /* ：错误条属上个索引的检索，随切清场（qryErr 同款） */
  qryResp.value = null; qryErr.value = ''; qryPage.value = 1; qryProfileTree.value = null; /* ：查询 tab 翻页同步归位 */
  docsHist.reset(); qryHist.reset(); /* ：切索引清直方图桶态（ES 拒绝拉黑按索引维度保留，DQ 同语义） */
  if (tab.value === 'docs' && cur.value) runDocsAuto();
});
onMounted(() => {
  if (!store.indices.length) store.loadIndices();
  /* 1125：挂载期两处读取（别名清单 / 当前索引详情）此前不过身份门——宿主换 token 的
     窗口里 probed 未落地，旧 target 的别名与 mapping 会先拉回来（结果串到新账号界面）。
     runDocsAuto 已有自己的 autoRun 门，这里只补这两条。 */
  if (indexHubReadReady()) { loadAliases(); if (cur.value) { loadDetail(); if (tab.value === 'docs') runDocsAuto(); } }
  else indexHubPendingBoot = true;
});
const indexHubReadReady = () => auth.authDisabled || !auth.probeStarted
  || (auth.probed && auth.me != null && auth.canReadPage('indices', store.target));
let indexHubPendingBoot = false;
watch(() => [auth.probed, auth.authDisabled, auth.me?.username, store.target], () => {
  if (!indexHubPendingBoot || !indexHubReadReady()) return;
  indexHubPendingBoot = false;
  loadAliases();
  if (cur.value) { loadDetail(); if (tab.value === 'docs') runDocsAuto(); }
});

/* ==== 操作 ==== */
/* 相关性实验室联动入口——与 DslQueryView 同一 sessionStorage 契约
 （esquerystudio.link.rankdebug/xray），query 取本页 qry tab 的 DSL 草稿。
 裸 setItem 合并 useLinkCarry 统一件（键前缀/序列化契约不变）；
 payload 逐字保持 {index,id,query}/{index,id}——index 顺修 ref 直传旧账
 （原 index: cur 序列化的是 Ref 对象，消费方读到的是壳不是值），统一传 cur.value 字符串 */
const rankDebugCarry = useLinkCarry<{ index: string; id: string; query: string }>('rankdebug');
const xrayCarry = useLinkCarry<{ index: string; id: string }>('xray');
function whyHit(hit: SearchHit) {
  rankDebugCarry.send({ index: cur.value, id: hit._id, query: dsl.value });
  goto('/rank-debug');
}
function xrayHit(hit: SearchHit) {
  xrayCarry.send({ index: cur.value, id: hit._id });
  goto('/query-xray');
}
function goto(path: string) {
  if (cur.value) store.pick(cur.value);
  router.push(path);
}
async function copyName() {
  if (await copyText(cur.value)) store.notify('success', '已复制：' + cur.value); /* */
  else store.notify('error', '复制失败，请手动选中后 Ctrl+C');
}

/* W3 D8：列表行 hover 复制（click.stop 不触发行选中） */
async function doCopyName(name: string) {
  if (await copyText(name)) store.notify('success', '已复制：' + name); /* */
  else store.notify('error', '复制失败，请手动选中后 Ctrl+C');
}

/* 1142：索引行右键菜单——动作全是本页既有能力的快捷入口（select/tab/goto/复制），
 不新增写操作；分组只收低频项，避免一级 >6 平铺。 */
const idxMenu = ref<{ x: number; y: number; name: string } | null>(null);
function openIdxMenu(e: MouseEvent, name: string) {
  idxMenu.value = { x: e.clientX, y: e.clientY, name };
}
function onIdxMenuKey(e: KeyboardEvent, name: string) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  idxMenu.value = { ...menuKeyAnchor(e), name };
}
/* bar-extra 槽里的两枚图标钮，在工具行右键的「更多…」里给出等价的可读菜单项。
   工具行右键是「表格操作那个表头」的完整入口——只加图标钮不进菜单，
   窄档里就只剩一排无文字图标，用户只能靠试。
   「操作提示」原本只活在图标钮的 title 里，菜单里给一条同文的 toast，读得到也存不住丢失。 */
const docsBarMenuExtra = computed<CcmItem[]>(() => [
  { key: 'ih-raw-io-docs', label: '查看原始 IO（最近一次检索请求/响应）', icon: Terminal, run: () => openRawIo('query') },
  {
    key: 'ih-ops-tip-docs', label: '表格操作提示（快捷键 / 就地编辑）', icon: Info,
    run: () => store.notify('info', `Ctrl+F 查找高亮；双击单元格就地编辑（保存即全量覆盖 _source）${canWrite.value ? '' : '；当前角色只读，双击不会进入编辑'}；↑↓ 行导航、Enter 打开文档`, { duration: 12000 }),
  },
]);
const queryBarMenuExtra = computed<CcmItem[]>(() => [
  { key: 'ih-raw-io-query', label: '查看原始 IO（最近一次查询请求/响应）', icon: Terminal, run: () => openRawIo('query') },
  {
    key: 'ih-ops-tip-query', label: '查询操作提示（快捷键 / 深调入口）', icon: Info,
    run: () => store.notify('info', `对 ${cur.value} 就地执行 DSL（Ctrl+Enter）；变量/聚合可视化/Profile 去「查询工作台」；表格内 Ctrl+F 查找、↑↓ 行导航、Enter 打开文档`, { duration: 12000 }),
  },
]);
const idxMenuItems = computed<CcmItem[]>(() => {
  const m = idxMenu.value; if (!m) return [];
  const nm = m.name;
  const goTab = (t: TabKey) => () => { select(nm); tab.value = t; };
  return [
    { key: 'open', label: '选中并打开工作区', icon: Boxes, run: () => select(nm) },
    { key: 'copy-name', label: '复制索引名', icon: Copy, run: () => void doCopyName(nm) },
    {
      key: 'tabs-group', label: '打开分页…', icon: List, sep: true, children: [
        { key: 'tab-docs', label: '文档', icon: FileSearch, run: goTab('docs') },
        { key: 'tab-query', label: '查询', icon: Search, run: goTab('query') },
        { key: 'tab-mapping', label: 'Mapping', icon: FolderTree, run: goTab('mapping') },
        { key: 'tab-settings', label: 'Settings', icon: Sliders, run: goTab('settings') },
        { key: 'tab-shards', label: '分片', icon: Boxes, run: goTab('shards') },
        { key: 'tab-ops', label: '运维', icon: Hammer, run: goTab('ops') },
      ],
    },
    {
      key: 'goto-group', label: '在其它页打开…', icon: ExternalLink, children: [
        { key: 'goto-search', label: '查询工作台（预填此索引）', icon: Search, run: () => { store.pick(nm); goto('/search?mode=dsl'); } },
        { key: 'goto-browser', label: '数据浏览器', icon: FileSearch, run: () => { store.pick(nm); router.push({ path: '/browser', query: { idx: nm } }); } },
        { key: 'goto-aliases', label: '别名管理', icon: Link2, run: () => { store.pick(nm); goto('/aliases'); } },
      ],
    },
  ];
});

/* ═══ ：分片分布复制（运维真实高频——贴工单/群聊问「为什么黄了」）═══ */
async function copyShardTable() {
  const rows = shardsByNode.value.flatMap(grp =>
    grp.shards.map(s => ({ node: grp.node, shard: s.shard, prirep: s.prirep === 'p' ? 'P' : 'R', state: s.state, docs: s.docs, store: fmtSize(s.storeBytes) })));
  const esc = (v: any) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const md = [
    `| 节点 | 分片 | 主/副 | 状态 | 文档 | 存储 |`,
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map(r => `| ${esc(r.node)} | ${r.shard} | ${r.prirep} | ${esc(r.state)} | ${fmtNum(r.docs)} | ${esc(r.store)} |`),
  ].join('\n');
  if (await copyText(md)) store.notify('success', `已复制 ${rows.length} 条分片分布（Markdown）`);
}
async function copyShardLocate(node: string, s: any) {
  const loc = `${cur.value} [${s.shard}] ${s.prirep === 'p' ? '主' : '副本'} @ ${node} · ${s.state}`;
  if (await copyText(loc)) store.notify('success', '已复制分片定位'); /* */
  else store.notify('error', '复制失败，请手动选中后 Ctrl+C');
}

/* 行高三档合并 useTablePrefs 既有内核（同键 es_tbl_rowh/同循环序/同档位文案）——
 手写 readIhRowH/cycleRowH/IH_ROWH_LABEL 退役；行高是全局阅读偏好（口径），
 维度传 null 即纯全局档，左列表与 RT/QRT 工具行同一颗钮同一份记忆 */
const { rowH, rowHLabel, cycleRowH } = useTablePrefs(ref<string | null>(null), ref<string[]>([]));
/* 行级执行世代守卫（raceGuard858 同款，与 docs/qry 链同构）：执行钮无 disabled 面，
   双击/换操作连点即双在途——过期拍的 AbortError 与用户取消同形，按世代甄别播报；
   opsKey 与 finish 同收世代（过期拍清 opsKey 会让在途新拍的执行钮文案回「执行」、
   取消钮消失，过期拍 finish 会清掉新拍的 AbortController） */
let opsSeq = 0;
async function opRaw(method: string, path: string, okMsg: string, reloadList = false) {
  /* raw 系全走 /cluster/raw（ADMIN 域）——行级执行钮无 disabled 面，守卫落执行体 */
  if (!canAdmin.value) { store.notify('warning', '原始透传需 ADMIN 角色'); return; }
  const seq = ++opsSeq;
  opsKey.value = path; /* P0-A：行级执行读秒锚（执行钮文案换字+瞬时取消钮） */
  try {
    const signal = opsQr.begin();
    await api.raw(method, path, undefined, signal);
    store.notify('success', okMsg + '：' + cur.value);
    if (reloadList) store.loadIndices();
  } catch (e: any) {
    /* 用户主动取消不算错误（AbortError 由 opsQr.cancel() 触发）；过期拍静默 */
    if (e?.name === 'AbortError') { if (seq === opsSeq) store.notify('info', '已取消操作'); }
    else store.notify('error', '操作失败: ' + (e?.message || e));
  } finally {
    if (seq === opsSeq) { opsKey.value = ''; opsQr.finish(); }
  }
}
async function askForceMerge() {
  if (!canAdmin.value) { store.notify('warning', '原始透传需 ADMIN 角色'); return; }
  if (!await askConfirm({
    title: 'ForceMerge 段合并',
    message: `将对 ${cur.value} 执行 force merge max_num_segments=1：大索引可能长时间占用 IO 且不可中断，建议低峰期执行。`,
    okText: '开始合并',
  })) return;
  opRaw('POST', `/${cur.value}/_forcemerge?max_num_segments=1`, 'ForceMerge 已完成（同步，耗时取决于索引大小）');
}
async function askClose() {
  if (!canAdmin.value) { store.notify('warning', '原始透传需 ADMIN 角色'); return; }
  if (!await askConfirm({
    title: '关闭索引',
    message: `关闭后 ${cur.value} 不可读写（数据保留，可随时重新打开），依赖此索引的业务查询会立刻报错。`,
    okText: '关闭索引',
  })) return;
  opRaw('POST', `/${cur.value}/_close`, '索引已关闭', true);
}
/* 打开索引补轻确认——「影响读写」组对称性（关闭有确认、打开此前直执行）。
 有意关闭的索引被误打开后，依赖方查询/写入会恢复打到它；虽然可逆（再关掉），但来回
 折腾且中间窗口可能产生脏写，warn 确认讲清后果即可。 */
async function askOpen() {
  if (!canAdmin.value) { store.notify('warning', '原始透传需 ADMIN 角色'); return; }
  if (!await askConfirm({
    title: '打开索引',
    message: `${cur.value} 将恢复读写，依赖此索引的业务查询/写入会立即恢复打到它。若它此前是被有意关闭的（如隔离问题数据），请先确认故障已处理。`,
    okText: '打开索引',
  })) return;
  opRaw('POST', `/${cur.value}/_open`, '索引已重新打开', true);
}

/* 热参数内联调整：refresh_interval / 副本数（改完回读 settings 保证摄要卡同步） */
const RI_OPTS = ['1s', '5s', '30s', '60s', '-1'].map(v => ({ label: v === '-1' ? '-1（关闭）' : v, value: v }));
/* 当前值为自定义档位（如 2s）时动态并入选项去重——原固定五档 select 显示空 */
const riOpts = computed(() => {
  const cv = settingOf('refresh_interval');
  if (!cv || RI_OPTS.some(o => o.value === cv)) return RI_OPTS;
  return [{ label: cv + '（当前值）', value: cv }, ...RI_OPTS];
});
const riDraft = ref('1s');
const repDraft = ref('1');
watch(settings, () => {
  riDraft.value = settingOf('refresh_interval') || '1s';
  repDraft.value = settingOf('number_of_replicas') || '1';
});
async function applySetting(body: Record<string, any>, okMsg: string) {
  if (!canSettings.value) { store.notify('warning', '索引设置需专项角色'); return; }
  try {
    await api.updateIndexSettings(cur.value, JSON.stringify(body));
    store.notify('success', okMsg + '：' + cur.value);
    loadDetail(true);
  } catch (e: any) {
    store.notify('error', '修改失败: ' + friendlyEsError(String(e?.message ?? e))); /* ：裸 e.message 人话化（w80 先例） */
  }
}
function applyRefreshInterval() {
  applySetting({ 'index.refresh_interval': riDraft.value }, `refresh_interval 已改为 ${riDraft.value}`);
}
async function applyReplicas() {
  const n = Number(repDraft.value);
  if (!Number.isInteger(n) || n < 0) { store.notify('warning', '副本数需为非负整数'); return; }
  applySetting({ 'index.number_of_replicas': n }, `副本数已改为 ${n}`);
}
async function unblock() {
  if (!await askConfirm({
    title: '解除写阻塞',
    message: `将清除 ${cur.value} 的 blocks.${blocked.value}。若是磁盘水位触发的阻塞，不先释放磁盘空间会很快再次触发。`,
    okText: '解除阻塞',
  })) return;
  applySetting({ ['index.blocks.' + blocked.value]: null }, '写阻塞已解除');
}

/* 删除（critical 守卫）。 W4：直挂 ConfirmModal 合并 askConfirm——
 facts 具名行 label 集与 BrowserView askDel 同款，别名段在场时追加「别名指向」行；
 别名后果语句留正文（askConfirm message 为纯文本，原 warn 色强调以文字保全语义） */
async function askDelIndex() {
  if (!canOps.value) { store.notify('warning', '删除需专项或 ADMIN 角色'); return; }
  const idx = cur.value;
  /* facts 抽出调用块（confirmAudit 六百字符扫描窗内保持可审计形态） */
  const facts = [
    { label: '索引', value: idx },
    { label: '文档数', value: fmtNum(curInfo.value?.['docs.count']) },
    { label: '存储', value: curInfo.value?.['store.size'] || '-' },
    ...(curAliases.value.length ? [{ label: '别名指向', value: curAliases.value.map(a => a.alias).join('、') }] : []),
  ];
  const aliasNote = curAliases.value.length
    ? ` 该索引当前被 ${curAliases.value.length} 个别名指向，删除后这些别名的查询/写入将立即报错。` : '';
  if (!await askConfirm({
    title: '删除索引',
    message: `将永久删除该索引，数据不可恢复。${aliasNote} 请输入索引名确认。`,
    level: 'critical',
    guardText: idx,
    okText: '永久删除',
    facts,
  })) return;
  try {
    await api.deleteIndex(idx);
    store.notify('success', `索引 ${idx} 已删除`);
    if (store.pickedIdx === idx) store.pick('');
    cur.value = '';
    store.loadIndices();
    loadAliases();
  } catch (e: any) {
    store.notify('error', '删除失败: ' + friendlyEsError(String(e?.message ?? e))); /* ：裸 e.message 人话化（w80 先例） */
  }
}
</script>

<style scoped>
.ih-page { display: flex; flex-direction: column; height: 100%; min-height: 0; position: relative; }
/* 执行进度条贴页顶 */
.ih { display: flex; gap: var(--sp-3); flex: 1; min-height: 0; }

/* 左列表 */
/* .ih-left 只在抽屉里存在(fixed 浮层);列宽拖拽/折叠竖条随之退役。
 宽度改三档数据驱动(usePref 记忆,内联 style 承载):常规 clamp(400px,32vw,560px)/
 宽 clamp(480px,40vw,720px)/吃满 86vw——本条只留定位与钳制不变量,原单档 clamp 合并为「常规」档 */
.ih-left { position: relative; max-width: 86vw; display: flex; flex-direction: column; padding: var(--sp-3); min-height: 0; }
.ih-drawer-mask { position: fixed; inset: 0; z-index: var(--z-drawer-mask, 250); background: var(--mask); backdrop-filter: blur(3px); }
/* v3.0.1 实报「贴左一点点很小气」:加宽至 32vw(400-560px),与视口留 16px 呼吸位,大圆角+深阴影提质感 */
.ih-drawer { position: fixed; left: 16px; top: 16px; bottom: 16px; z-index: var(--z-drawer, 251); border-radius: var(--r-l); overflow: hidden; box-shadow: var(--shadow-pop); background: var(--bg0); } /* ：557 摘壳时「bg0 直贴」注释声称但声明从未落位——面板底一直透 mask 半透明（亮色 35% 灰黑=实报「亮色主体看不清」真凶），补 bg0 兑现注释语义，遮罩回归关闭+层级本职 */
/* 折叠钮（ih-lbar 头部）+ 折叠恢复竖条 */
/* 健康过滤 chips 换行收纳（窄列不再横向溢出截断 red）；
 seg 钮 flex 结构居中（对称对齐：与 BrowserView 健康 seg 同律，
 色点垂直居中由 align-items:center 结构承担，inline 基线搁置退役） */
.ih-seg-wrap { flex-wrap: wrap; row-gap: var(--sp-1); }
.ih-seg-wrap > button { margin-right: var(--sp-1); }
.ih-seg button { display: inline-flex; align-items: center; }
.ih-seg .ih-hdot { margin-right: var(--sp-1); }
.ih-collapse-btn { display: inline-flex; align-items: center; padding: var(--sp-0); border: 0; background: none; color: var(--tx2); cursor: pointer; border-radius: var(--r-xs); flex-shrink: 0; }
.ih-collapse-btn:hover { color: var(--tx0); background: var(--bg2); }
/* 索引列表开关上的全量计数徽标（页头钮显眼度：不看 title 不知列表内索引数） */
.ih-ilct { margin-left: var(--sp-1h); opacity: .72; font-size: var(--fs-2xs); }
/* 放大/还原双态钮实装（与折叠钮同款视觉、独立语义类 spec 选择器隔离）；on 态随选中语言走品牌色 */
.ih-fs-btn.on { color: var(--ac-hi); }
/* 聚焦态（放大）——工作区整行铺满全屏面（fixed inset12，z 走既有 --z-focus=300）；
 面内工作区卡片头自带还原钮（历史事故防线：面盖页头时还原路径仍在面内可点） */
.ih.fs-active { position: fixed; inset: 12px; z-index: var(--z-focus, 300); background: var(--bg0); }
.ih-lbar { display: flex; gap: var(--sp-1h); margin-bottom: var(--sp-2); }
/* 搜索框弹性下限：左栏被拖窄（如 264px）时工具行换行收纳，绝不让输入框塌成 0（文案被剪） */
.ih-lbar { flex-wrap: wrap; row-gap: var(--sp-1); }
.ih-search { position: relative; flex: 1 1 118px; min-width: 108px; }
.ih-lbar .hn { flex-shrink: 0; }
.ih-search-ic { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); color: var(--tx2); pointer-events: none; }
/* B：排序控件（字段下拉 + 升/降切换），紧凑适配窄左栏 */
.ih-sort-sel { flex-shrink: 0; max-width: 82px; padding: var(--sp-1) 3px; font-size: var(--fs-xs); border: 1px solid var(--line); border-radius: var(--r-xs); background: var(--bg2); color: var(--tx0); }
.ih-sort-dir { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: 1px solid var(--line); border-radius: var(--r-xs); background: var(--bg2); color: var(--tx1); cursor: pointer; }
.ih-sort-dir:hover { color: var(--tx0); border-color: var(--ac); }
.ih-seg { margin-bottom: var(--sp-2); }
/* --sp 收口：正值档位 4px→var(--sp-1)（负值 -4px 刻意保字面， 头注④口径） */
.ih-list { flex: 1; min-height: 0; margin: 0 -4px; padding: 0 var(--sp-1); }
.ih-row {
  display: flex; align-items: center; gap: 7px; padding: 7px var(--sp-2); border-radius: var(--r-s);
  cursor: pointer; transition: background var(--tr);
}
/* v3.0.1 行高三档:紧凑 3px/标准 7px/宽松 12px——与 RT/QRT 根类驱动同语义 */
.ih-row.ih-compact { padding: 3px var(--sp-2); }
.ih-row.ih-cozy { padding: var(--sp-3) var(--sp-2); }
.ih-rowh-btn {
  display: inline-flex; align-items: center; gap: var(--sp-1); margin-left: auto;
  padding: var(--sp-0) 7px; border: 1px solid var(--line); border-radius: 5px;
  background: none; color: var(--tx2); font-size: var(--fs-xs); cursor: pointer; flex-shrink: 0;
}
.ih-rowh-btn:hover { color: var(--ac); border-color: var(--ac); }
/* 聚焦面语义已上移至 .ih.fs-active（包整行），本条历史注释随之退役 */.ih-row:nth-child(even) { background: var(--hl-soft); }
.ih-row:hover { background: var(--bg2); }
.ih-row.on { background: var(--ac-soft); }
/* v3.0.1 实报「索引名截断看不全」：去中段省略硬截断（原 midEllipsis 已于 退役）,改 anywhere 换行两行封顶——
 索引名是 mono 连续串,ellipsis+nowrap 在窄列下只剩前缀;title 恒有全文兜底 */
.ih-row-nm { flex: 1; min-width: 0; font-size: var(--fs-sm); color: var(--tx0); overflow-wrap: anywhere; word-break: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.35; }
.ih-row.on .ih-row-nm { color: var(--ac-hi); }
.ih-row-docs { flex-shrink: 0; font-size: var(--fs-2xs); color: var(--tx2); }
.ih-row-main { flex: 1; min-width: 0; }
.ih-row-top { display: flex; align-items: center; gap: 7px; }
.ih-row-meta { font-size: var(--fs-2xs); color: var(--tx2); margin-top: var(--sp-0); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ih-row-alias {
  flex-shrink: 0; font-size: var(--fs-2xs); padding: 0 5px; border-radius: var(--r-xs); line-height: 15px;
  color: var(--dv-purple); background: color-mix(in srgb, var(--dv-purple) 12%, transparent);
}
.ih-row-copy {
  flex-shrink: 0; display: inline-flex; border: none; background: none; color: var(--tx2);
  cursor: pointer; padding: var(--sp-0); border-radius: var(--r-xs); opacity: 0; transition: opacity var(--tr);
}
.ih-row:hover .ih-row-copy, .ih-row-copy:focus-visible { opacity: 1; }
.ih-row-copy:hover { color: var(--tx0); background: var(--bg3); }
/* 当前命中行：柔底 + 左侧强调条 + 焦点环（.hit-cur 由 useHitScroll 运行时挂/摘） */
.ih-row.hit-cur { background: var(--ac-soft) !important; box-shadow: inset 3px 0 0 var(--ac-hi), var(--focus-ring); }
/* 键盘导航高亮（与 hit-cur 同视觉语言，略淡一档区分「浏览中」与「搜索命中」） */
.ih-list:focus-visible { outline: 2px solid var(--ac); outline-offset: -2px; border-radius: var(--r-s); }
.ih-row.ih-kb-focus { background: var(--ac-soft); box-shadow: inset 3px 0 0 var(--ac-hi); }
.ih-kbd-hint { margin-left: var(--sp-2); font-size: var(--fs-2xs); color: var(--tx2); opacity: .85; }
.ih-lfoot { padding-top: var(--sp-2); font-size: var(--fs-xs); color: var(--tx2); text-align: right; border-top: 1px solid var(--line); margin-top: var(--sp-2); }
/* 健康色点 8px=全站圆点单源（MetaStrip .ms-dot / HistoryChart .hc-chip 同径） */
.ih-hdot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.ih-hdot.lg { width: 10px; height: 10px; }

/* 右详情 */
.ih-right { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--sp-3); }
/* 引导态三规则（原「.ih-guide」64px 手写居中与 ih-guide-t/-s 文案档）
 随空框退役——EmptyState centered 直贴，留白/图标柔光/文案档归组件单源 */

/* v3.0.1:头部条(单卡第一段,下接 tabs)——flex-wrap 让元信息串窄屏自然换行 */
/* 1026：索引名行冻结（行冻结全站推广续）——.ih-hd 是当前索引的上下文行（健康点/索引名/
 状态/元信息/动作），吸附滚动容器 .ih-right（scroll-y）顶：文档/查询结果滚深后仍知道
 「在看哪个索引」。实底 + 负边距拉满 .ih-ws 内宽防内容缝隙滚过；z-index 压内容让位弹层 */
.ih-hd { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-1h) var(--sp-3); padding: var(--sp-2h) 14px; flex-wrap: wrap; position: sticky; top: 0; z-index: 20; margin: 0 -14px; background: var(--bg1); border-bottom: 1px solid var(--line); }
.ih-hd-l { display: flex; align-items: center; gap: 9px; min-width: 0; }
.ih-hd-nm { font-size: var(--fs-xl); font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ih-hd-acts { display: flex; gap: var(--sp-1h); flex-wrap: wrap; }
/* inline 元信息串(替代 KPI 大卡)合并 MetaStrip 统一件：mono/值亮/标签暗/·分隔/items 形态全由
 统一件承担；仅剩插槽别名段局部样式与单位字号归位——统一件的单位是 fs-xs，本处历史形态
 fs-2xs 小一档（ 意图：数值亮 b / 单位暗小一档），保视觉不回退（手写
 .ih-meta-sep 随组件「默认插槽自动 .ms-sep」退役，规则删除） */
.ih-meta-pos .ih-meta-alias i { font-style: normal; color: var(--tx2); font-size: var(--fs-xs); }
.ih-meta-pos .ih-meta-alias b { color: var(--tx0); font-weight: 600; font-variant-numeric: tabular-nums; }
.ih-meta-pos .ih-meta-alias .ih-link { margin-left: 3px; }
.ih-meta-pos .ih-meta-alias .dim { font-size: var(--fs-xs); }
.ih-meta-pos :deep(.ms-unit) { font-size: var(--fs-2xs); }

.ih-tabs { border-bottom: 1px solid var(--line); border-radius: 0; display: flex; align-items: center; padding: 0 var(--sp-1h); }
/* min-height:180px 定底退役改 0 自撑——矮内容 tab 不再被强行撑高，
 空态/骨架由 EmptyState/SkeletonBox 自身留白承担（§四态位置口径） */
.ih-tab-body { padding: var(--sp-3) 14px; min-height: 0; }
/* 1384：文档 tab 的表格档撑满剩余高度。
   实测（1440×900）：.ih-tab-body 高 497 而 .rt-wrap 只有 240 —— 链上
   .ih-ws(block) / .ih-tab-body(block) 不吃 flex，.fs-body > * 又是 flex:0 0 auto，
   于是表格停在自己的 max-height 上，下方留 248px 空白。这正是用户反复说的
   「默认可视表格特别窄，下面还有那么多空间」。
   只对「文档 tab + 表格视图」生效：settings/mapping/shards/ops/query 各 tab 与
   JSON/Tree 视图的高度语义（自有档位、内容自适应）一律不动。 */
.ih-ws.ih-ws-fill, .ih-tab-body.ih-fill { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
.ih-tab-body.ih-fill { padding-bottom: 0; }
.ih-tab-body.ih-fill > .fs { flex: 1 1 auto; min-height: 0; }
.ih-tab-body.ih-fill > .fs > .fs-body > .rt { flex: 1 1 auto; min-height: 0; }

.ih-tip { font-size: var(--fs-xs); color: var(--tx2); margin-bottom: var(--sp-2h); line-height: 1.5; }
.ih-link { color: var(--ac-hi); cursor: pointer; }
.ih-link:hover { text-decoration: underline; }

/* Settings 热参数摘要： .ih-kv border+bg2 小卡格退役 → MetaStrip 行内裸排
 （页头 ihMeta 同统一件承担形态；tip 钮随行内右侧） */
.ih-kv-ms { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; margin-bottom: var(--sp-3); }
.ih-kv-ms .ih-tip-btn { flex-shrink: 0; }
/* SettingsGrid 中文释义旁列（视图侧 SETTINGS_CATALOG 速查段）：mono 小字暗色，与网格留一档间距 */
.ih-catalog-ms { margin-bottom: var(--sp-2h); }

/* 分片：状态汇总 + 节点分组块矩阵 */
.ih-sh-sum { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; margin-bottom: var(--sp-3); }
.ih-sh-total { font-size: var(--fs-xs); color: var(--tx2); }
.ih-sh-node { margin-bottom: var(--sp-2h); }
.ih-sh-node-nm { display: flex; align-items: center; gap: var(--sp-1h); font-size: var(--fs-sm); color: var(--tx1); margin-bottom: var(--sp-1h); }
.ih-sh-node-nm.bad { color: var(--err); }
/* P2：计数 chip 改用 StatusPill 中性档——尺寸/色值归 .pill 单源，本类仅作 DOM 锚 */
.ih-sh-blocks { display: flex; flex-wrap: wrap; gap: 5px; }
.ih-sh-block {
  position: relative; width: 38px; height: 30px; border-radius: var(--r-s);
  display: flex; align-items: center; justify-content: center;
  font-size: var(--fs-sm); font-weight: 650; cursor: copy; transition: transform var(--tr);
}
.ih-sh-block:hover { transform: translateY(-1px); }
.ih-sh-block.pri { background: var(--ac-soft); color: var(--ac-hi); border: 1px solid var(--ac); }
.ih-sh-block.rep { background: var(--bg2); color: var(--tx1); border: 1px dashed var(--line); }
.ih-sh-block.bad { background: var(--err-soft); color: var(--err); border: 1px solid var(--err); }
.ih-sh-pr { position: absolute; right: 2px; bottom: 0; font-size: var(--fs-2xs); font-variant-numeric: tabular-nums; opacity: .7; }
.ih-sh-lg { display: inline-block; width: 11px; height: 11px; border-radius: 3px; vertical-align: -1px; }
.ih-sh-lg.pri { background: var(--ac-soft); border: 1px solid var(--ac); }
.ih-sh-lg.rep { background: var(--bg2); border: 1px dashed var(--line); }

/* 运维操作：风险分区操作中心。
 卡中卡降层（照 IndexSettings ir-card 三分节范式）——分节间上边框
 分隔（危险区分节分隔线走 err 档），原 margin-bottom 链退役；.ih-op-hd 走全局 .sec-t 档 */
.ih-op-sec + .ih-op-sec { margin-top: var(--sp-3); padding-top: var(--sp-3); border-top: 1px solid var(--line); }
.ih-op-sec.danger { border-top-color: var(--err-line); }
/* 分节标题：形态归全局 .sec-t（fs-sm/600/tx1），本类只留 flex 排布与风险徽标落位 */
.ih-op-hd { display: flex; align-items: center; gap: var(--sp-1h); margin-bottom: var(--sp-2); }
/* .ih-op-t 换挂全局 .sec-t（弱分节），本地形态规则随之退役，只留 flex 骨架差异 */
.ih-op-t { display: flex; align-items: center; gap: var(--sp-1h); }
/* P2：ih-op-risk 手写胶囊（fs-2xs+三档色值）改用 StatusPill 统一件——
 尺寸/色值归 .pill 单源（safe→g/warn→y/crit→r tone ），本类仅作 DOM 锚外挂 pill 根
 （552 sg-badge 先例），规则随装退役 */
.ih-op-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: var(--sp-2); }
/* 操作项描边小卡壳退役（卡中卡第三层框清）——降为分节网格区块，
 仅危险区保留描边档（不可逆动作的视觉警示不降）；padding 裸 11px 顺手归 --sp 梯 */
.ih-op-card {
  display: flex; flex-direction: column; gap: var(--sp-1h); padding: var(--sp-2h) var(--sp-3);
}
.ih-op-sec.danger .ih-op-card { border: 1px solid color-mix(in srgb, var(--err) 35%, var(--line)); border-radius: var(--r-s); }
.ih-op-card .btn { align-self: flex-start; }
.ih-op-d { font-size: var(--fs-xs); color: var(--tx1); line-height: 1.5; flex: 1; }
.ih-op-inline { display: flex; align-items: center; gap: var(--sp-1h); }

/* 文档/查询 Tab；：工具行窄宽换行收纳（LuceneInput/检索/翻页/跳转/档位钮一排不再溢出） */
.ih-docs-bar { display: flex; align-items: center; gap: var(--sp-2); row-gap: var(--sp-1h); margin-bottom: var(--sp-2h); flex-wrap: wrap; }
.ih-q { flex: 1; min-width: 0; }
/* .ih-qerr 私造红壳（border+err-soft+radius+err 色）退役 → 全局 .err-bar 形态
 （role=alert/重试钮/errPreHtml+errMeta 双参，theme.css :554 单源；DslQueryView dq-err 554
 先例）。本组只留落位节奏与 pre 排版（顶对齐+弹性让宽+max(240px,42vh) 钳制 uq-err 同口径）；
 docs tab err-bar（ih-docs-err）同步裸插值升级 pre 双参共用此组 */
.ih-qerr, .ih-docs-err { align-items: flex-start; }
.ih-qerr { margin-top: var(--sp-2h); margin-bottom: 0; }
/* 有旧结果的检索失败：错误条压在结果表上方，给结果表留出下边距，不与工具行贴死 */
.ih-docs-err-inline { margin-bottom: var(--sp-2); }
/* pre 在 inline 档限高更紧（240px 已是半屏，盖过结果表），正文让位给表格 */
.ih-docs-err-inline pre { max-height: 132px; }
.ih-docs-err-acts { display: flex; align-items: center; gap: var(--sp-1h); flex: none; flex-wrap: wrap; }
.ih-docs-err-note { font-size: var(--fs-xs); color: var(--tx2); }
.ih-qerr pre, .ih-docs-err pre {
  flex: 1 1 auto; min-width: 0; font-size: var(--fs-xs); color: var(--tx1); line-height: 1.5;
  white-space: pre-wrap; word-break: normal; overflow-wrap: anywhere; margin: 0;
  max-height: max(240px, 42vh); overflow: auto;
}
/* 部分分片失败黄条（DQ .dq-partial 同语言扁平化——warn 色文字+warn-soft 底+
 --r-s 圆角，无新壳边框；role=status 提示档非 alert 档）。独立块不进 ih-qerr v-if/v-else-if
 链，高度链零触（内容增量不进 min-height 链）；与相邻 RT/err-bar 的 margin 在块流塌陷不叠加 */
.ih-partial { display: flex; align-items: center; gap: var(--sp-1h); padding: 5px var(--sp-2h); margin-bottom: var(--sp-2); font-size: var(--fs-xs); color: var(--warn); background: var(--warn-soft); border-radius: var(--r-s); }
.ih-partial svg { flex-shrink: 0; }
.ih-partial span { flex: 1; }
.ih-partial-x { border: 0; background: none; color: var(--tx2); cursor: pointer; padding: 0 var(--sp-0); display: inline-flex; }
.ih-partial-x:hover { color: var(--err); }

/* ═══ ：两 tab 结果表视图形式切换（DQ 同款最小集，类名 ih-* 避让 DQ 作用域）═══
 seg 防换行（bar 内横排，DQ :deep(.seg) nowrap 同义）；alt 体 border-top 分节
 （ DQ 同语言，无四边框壳）；三视图 max-height 56vh 一口径（ vh 统一族）。
 高度链零触：表格 max-height 与编辑器高度档不动，本组规则只作用于新增 alt 体。
 json/tree 两容器的 56vh 局部变量化（--ih-alt-cap 单点，值零变零视觉，
 为后续档位留单点；cards 档同值未变量化不动） */
.ih-view-seg { flex-wrap: nowrap; }
.ih-alt-body { border-top: 1px solid var(--line); margin-top: var(--sp-2); padding-top: var(--sp-1h); }
.ih-json-wrap { max-height: var(--ih-alt-cap, 56vh); }
.ih-tree-view { max-height: var(--ih-alt-cap, 56vh); padding: var(--sp-2); }
.ih-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--sp-2h); max-height: 56vh; }
/* 卡片内脏六规则退役（随 alt 体改用 AltHitsViews，内脏样式迁组件 scoped
 逐值同源渲染零变化；容器 .ih-cards 网格留宿主） */

/* 查询 tab DSL 编辑器高度四档——S/M/L 定高经内联 height 吃 editorTiers 统一件档位，
 满档沿用 42vh 视口弹性（口径）；JsonArea fill 模式吃满容器高（ja 自带 flex:1 +
 monaco-host height auto 接管），与结果表竖向合理分配。
 P2：qryH 拖柄自定态走 dslWrapStyle 内联 px（>0 覆写档位，ih-h-full 不叠加） */
.ih-dsl-wrap { display: flex; flex-direction: column; }
.ih-dsl-wrap.ih-h-full { min-height: max(168px, 42vh); }
/* 两处 fill JsonArea 外框视图侧退壳（557 ST/——视图 style 追加同
 选择器独立规则，JsonArea 组件本体零触）：query tab DSL 编辑器与 doc 编辑弹窗的外包
 容器自带定位，.ja 的 border/radius/bg0 双层框感剥掉（bg0 透明后吃容器底色） */
.ih-dsl-wrap :deep(.ja), .ih-doc-edit-ja :deep(.ja) { border: none; border-radius: 0; box-shadow: none; background: transparent; }
/* P2：拖柄落位（dq-height-handle 同款） */
.ih-qry-handle { flex-shrink: 0; margin: var(--sp-1) 0; }
/* Profile 开关（DQ 执行行 dq-sw 激活胶囊同语言，26px 控制线档；ih-sw 本页落款避让） */
.ih-sw { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 var(--sp-2); font-size: var(--fs-sm); color: var(--tx1); cursor: pointer; user-select: none; border-radius: var(--r-s); border: 1px solid transparent; flex-shrink: 0; white-space: nowrap; transition: background var(--tr), color var(--tr), border-color var(--tr); }
.ih-sw.on { background: var(--ac-soft); color: var(--ac); border-color: var(--ac-line); font-weight: 600; }
.ih-sw.on input { accent-color: var(--ac); }

/* 编辑器高度档位钮组（查询工作台 dq-eh 同款视觉，贴执行行尾） */
.ih-eh { display: flex; gap: var(--sp-0); flex-shrink: 0; margin-left: auto; }
.ih-eh-btn { border: 1px solid var(--line); background: var(--bg1); color: var(--tx2); font-size: var(--fs-xs); line-height: 1; padding: var(--sp-1) var(--sp-2); cursor: pointer; border-radius: 3px; }
.ih-eh-btn:hover { color: var(--tx1); border-color: var(--ac-line); }
.ih-eh-btn.on { color: var(--ac-hi); border-color: var(--ac-line); background: var(--ac-soft); }
/* 字号 seg 尺寸锚（DevTools .dt-font-seg 同形——.seg 全局基类+本页档钮压尺寸） */
.ih-font-seg { flex-shrink: 0; }
.ih-font-seg button { padding: 0 var(--sp-1h); font-size: var(--fs-xs); line-height: 1.8; }

/* ═══ 语义高亮批：索引工作区语义色分档落地 ═══ */
/* 抽屉搜索命中：索引名子串 <mark> 改 --ac-soft 底（任务 spec 档）——MarkText 全局是
 琥珀档，在窄列表行里过跳，品牌青柔底与选中语言同系；覆盖只限本抽屉，不动全站收口 */
.ih-row-nm :deep(.mt-mark) { background: var(--ac-soft); color: var(--ac-hi); font-weight: 600; border-radius: 2px; padding: 0 1px; }
/* 选中/命中/键盘浏览行自身已是 --ac-soft 底：命中 mark 提浓一档（--ac-line）防同色相溶 */
.ih-row.on .ih-row-nm :deep(.mt-mark), .ih-row.hit-cur .ih-row-nm :deep(.mt-mark),
.ih-row.ih-kb-focus .ih-row-nm :deep(.mt-mark) { background: var(--ac-line); color: var(--tx0); }
/* tab 计数角标：mono 小字随未选中态走 --tx2，选中态继承分色（theme.css ih-t-*.on） */
.ih-tabs .ih-tab-n { margin-left: var(--sp-1); font-size: var(--fs-2xs); color: var(--tx2); font-variant-numeric: tabular-nums; }
.ih-tabs .on .ih-tab-n { color: inherit; opacity: .72; }
/* Lucene 括号纠错提示条：警告档 --warn，纯提示不拦截执行；紧跟检索行下方（略收 bar 下边距）。
 --sp 收口：margin 档位 10px→var(--sp-2h)（-5px 负值与 gap 5px 奇数刻意保字面） */
.ih-qlint { display: flex; align-items: center; gap: 5px; margin: -5px 0 var(--sp-2h); font-size: var(--fs-xs); color: var(--warn); }
.ih-qlint svg { flex-shrink: 0; }

/* ih-card-flush 大卡壳退役（「头部连体卡去内边距」壳随退役删除）——
 .ih-ws 分节容器直贴：.ih-hd/.ih-tabs 两条 border-bottom+表格自带边框承接分节
 （547 壳退役语言；528 豁免裁决同步更新：cardPrimitiveVerdict547/emptyFrameZero547/
 paneShellWave547 三处字面锁改退役形断言） */

/* 900 紧凑微调档（ 口径；本页此前零 @media）——头部/工具行
 （ih-lbar/ih-docs-bar/ih-hd/seg）在 530/已带 flex-wrap，此处收尾补：
 ① 运维操作卡内联行允许换行（110px 下拉+按钮在窄卡不溢出）；
 ② 头部卡与 tab 内容区侧距收窄给表格让宽（横滚兜底在全局 .tbl-wrap，不重复造）。
 901 补集锁步见 responsiveGuard239 锚④（theme.css min-width:901px） */
@media (max-width: 900px) {
  .ih-op-inline { flex-wrap: wrap; }
  /* --sp 收口：档位 10px→var(--sp-2h)（纯等值替换，900 档断言不受影响） */
  .ih-hd { padding: var(--sp-2) var(--sp-2h); }
  .ih-tab-body { padding: var(--sp-2) var(--sp-2h); }
}

/* 1100 窄档（此前全页仅 900 微调档）——治 ih-hd 行（索引名长串+5 钮+
 MetaStrip 元信息串）与 ih-tabs 行（6 页签+对账+档位/刷新钮群）窄档挤压：
 头部收窄侧距+折行让宽，页签行放开折行（右钮群换行不再挤页签）；对齐 900 档
 「只加换行容许与钳制」口径，高度链基础值零触（padding 收窄非定高面，表格
 横滚兜底在全局 .tbl-wrap 不重复造） */
@media (max-width: 1100px) {
  .ih-hd { padding: var(--sp-2) var(--sp-2h); row-gap: var(--sp-1); }
  .ih-hd-nm { font-size: var(--fs-lg); }
  .ih-hd-acts { row-gap: var(--sp-1); }
  .ih-tabs { flex-wrap: wrap; row-gap: var(--sp-1); padding: var(--sp-1) var(--sp-1h); }
  .ih-tab-body { padding: var(--sp-2) var(--sp-2h); }
}
</style>
