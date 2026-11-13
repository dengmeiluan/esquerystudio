<template>
  <div class="xm">
    <!-- 页头统一 PageHeader：原「新建迁移」卡头的展开/收起入口上移至页头 actions（入口保留不丢） -->
    <!-- w80:副标题与分组编号同步收敛为三步(原副标题承诺四步、组内只见 1/2 的断链修复) -->
    <PageHeader :icon="Rocket" title="跨集群迁移" subtitle="旧集群 → 宿主集群 · ① 连接检查 → ② 选源 → ③ 定目标">
      <template #actions>
        <button :aria-label="formOpen ? '收起表单' : '展开表单'" class="btn sm ghost" @click="formOpen = !formOpen" :title="formOpen ? '收起表单' : '展开表单'">
          <ChevronDown :size="12" :style="{ transform: formOpen ? 'rotate(180deg)' : '', transition: 'transform var(--tr)' }" />
        </button>
      </template>
    </PageHeader>
    <!-- P2：执行进度条（ind-bar 全站范式；连接检查 checking/启动迁移 starting 任一在途即点亮，
 绝对定位零高度占位纯 CSS 动画——fetchCfg 复用 checking 同亮，拉取预览也有反馈） -->
    <div class="xm-progress ind-bar" :class="{ on: checking || starting }"></div>
    <!-- 新建迁移。：.card 壳退役 → border-top 分节（202 .xm-res 同语言）；
 卡 padding 由 .xm-new-t 落位类与 form/cfg/actions 落位 margin 承接（盒模型尺寸等值） -->
    <div class="xm-new">
      <div class="card-t xm-new-t">
<Rocket :size="13" /> 新建跨集群迁移
      </div>
      <!-- 草稿恢复徽标（DraftBadge 统一件）——conn/连接档案/form 草稿恢复时提示，一键清本页四把会话稿 -->
      <div v-if="xmDraftRestored" class="xm-draft-row"><DraftBadge @clear="clearDrafts" /></div>

      <template v-if="formOpen">
        <!-- w80:连接区并入第 1 组(三组统一编号——1 连接检查/2 选源/3 定目标,副标题同步) -->
        <div class="xm-form">
          <!-- ── 第 1 步:连接检查(旧集群) ──
 分节标题走全局 .sec-t 档（531 上半刀去 background 之后的下半刀：
 border 壳退役→border-top 分隔，编号语义保留） -->
          <div class="xm-group">
            <div class="xm-g-hd sec-t"><span class="xm-g-num">1</span> 连接旧集群</div>
            <!-- 已存连接下拉——服务端按档案取密，明文不经前端；留「手动输入…」回退；
 补 filterable（连接档案多时不可用，TopBar 索引下拉同款） -->
            <div class="xm-src-pick">
              <label>源集群</label>
              <n-select v-model:value="srcConnId" :options="connOpts" :render-label="renderConnOpt" size="small" filterable
                style="max-width:420px" placeholder="手动输入连接信息" @update:value="onSrcConnChange" />
            </div>

            <template v-if="!srcConnId && !connModel">
              <!-- 连接串粘贴 -->
              <div class="xm-paste">
                <input v-model="connUrl" class="inp mono" placeholder="粘贴连接串一键填充：http(s)://user:pass@host:port" @keydown.enter="parseUrl" />
                <button class="btn sm" @click="parseUrl">解析</button>
              </div>

              <!-- 连接表单（RemoteSourceFields 统一件合并：状态 conn 仍在父（草稿/redact/onMounted 清密码
 语义原地），组件只做展示与编辑回传；.xm-conn/「连接检查」/placeholder^="host" 为挂载型
 spec 的 DOM 锚点，由组件保真渲染） -->
              <RemoteSourceFields :conn="conn" testable :test-busy="checking" @update:conn="conn = $event" @test="check" />
              <div class="xm-tip">凭据仅在内存流转、绝不持久化；host/用户名/密码均支持 <span class="mono">${ENV_VAR}</span> 引用服务端环境变量。</div>
            </template>
            <div v-else class="xm-conn xm-src-picked">
              <!-- w80:逐字拷贝 ClusterSwitcher 的 .cs-hdot 三条改本地语义类 .xm-hdot(视觉等价,本页不引该组件) -->
              <span class="xm-hdot" :class="hdotCls(pickedConn?.health)"></span>
              <span class="mono">{{ pickedConn?.scheme }}://{{ pickedConn?.host }}:{{ pickedConn?.port }}</span>
              <span class="xm-tip" style="margin:0">凭据由服务端从连接档案取用，明文不经前端</span>
              <button v-if="canOps" class="btn sm" style="margin-left:auto" :disabled="checking" @click="check"><PlugZap :size="12" /> {{ checking ? '检查中…' : '连接检查' }}</button>
            </div>

            <!-- G3-B2：连接检查失败内联面板（全文+重试）——不再仅 toast 后索引区消隐、失败现场归零。
 裸插值换 errPreHtml+errMeta 双参（TaskTreeView 547 口径） -->
            <div v-if="checkErr" role="alert" class="err-bar rise-in xm-conn-err">
              <span class="xm-err-txt" v-html="errPreHtml(checkErr, errMeta(checkErrRaw))"></span>
              <button v-if="canOps" class="btn sm" :disabled="checking" @click="check"><RefreshCw :size="12" /> 重试</button>
            </div>
          </div>

          <!-- ── 第 2 步:选源(旧集群) ── -->
          <div class="xm-group">
            <div class="xm-g-hd sec-t"><span class="xm-g-num">2</span> 从旧集群选一个要迁走的索引</div>
            <!-- 手写受控下拉（@focus/@blur/mousedown.prevent 三件套）迁 usePopupList 统一骨架
 （IndexPicker 同款消费形态）：↑↓/Enter/Esc 键盘导航、aria combobox、点击外部关闭由骨架带来；
 cap 30 保留原 slice(0,30) 口径，就地渲染保持原 .xm-drop absolute 随根形态 -->
            <div class="xm-f-row" ref="srcRootEl">
              <input :value="form.sourceIndex" class="inp mono xm-idx-inp" placeholder="输入索引名,或从下方清单点选"
                spellcheck="false" autocomplete="off" role="combobox" aria-autocomplete="list"
                :aria-expanded="srcOpen ? 'true' : 'false'" :aria-controls="srcListId"
                :aria-activedescendant="srcOpen && srcItems[srcCursor] ? srcItemId(srcCursor) : undefined"
                @focus="srcOpenPanel" @input="onSrcInput" @keydown="srcOnKey" />
              <div v-if="srcOpen && srcItems.length" class="xm-drop" ref="srcListEl" role="listbox" :id="srcListId">
                <!-- 候选行纯文本 → MarkText 命中高亮（kw=源输入框值，chips 区同款） -->
                <div v-for="(it, i) in srcItems" :key="it.index" class="xm-drop-item mono" :class="{ act: i === srcCursor }"
                  role="option" :id="srcItemId(i)" :aria-selected="i === srcCursor"
                  @mouseenter="srcCursor = i" @click="pickSrc(it)"><MarkText :text="it.index" :kw="form.sourceIndex" /></div>
                <div v-if="srcFiltered.length > 30" class="xm-drop-more">…还有 {{ srcFiltered.length - 30 }} 个,输入关键词过滤</div>
              </div>
            </div>
            <!-- w80:chips 快捷清单并入第 2 步组内——原与第 1 步下拉同清单双 UI 双过滤词
 （remoteKw/srcKw 各一份），收敛为过滤词一份=源输入框值，remoteKw 退役 -->
            <div v-if="remoteIndices.length" class="xm-remote">
              <div class="xm-r-t sec-t">快捷清单（{{ remoteIndices.length }}，点击选为源）：</div>
              <div class="xm-r-list">
                <span v-for="ri in filteredRemote" :key="ri.index" class="chip mono" :class="{ on: form.sourceIndex === ri.index }" role="button" tabindex="0"
                  :aria-label="'选取源索引 ' + ri.index"
                  @click="form.sourceIndex = ri.index; if (!form.destIndex) form.destIndex = ri.index"
                  @keydown.enter.prevent="form.sourceIndex = ri.index; if (!form.destIndex) form.destIndex = ri.index"
                  @keydown.space.prevent="form.sourceIndex = ri.index; if (!form.destIndex) form.destIndex = ri.index">
                  <MarkText :text="ri.index" :kw="form.sourceIndex" /> <span style="color:var(--tx2)">{{ fmtNum(ri['docs.count']) }}</span>
                </span>
                <span v-if="remoteOverflow" class="xm-r-more">还有 {{ remoteOverflow }} 个，输入关键字过滤</span>
              </div>
            </div>
            <div v-if="!remoteIndices.length" class="xm-hint-line">← 先点上方「连接检查」拉取旧集群索引清单,或直接手输索引名</div>
          </div>

          <!-- ── 第 3 步:定目标(宿主集群) ── -->
          <div class="xm-group">
            <div class="xm-g-hd sec-t"><span class="xm-g-num">3</span> 在宿主集群定一个目标索引</div>
            <!-- 目标下拉同迁 usePopupList（骨架语义见源下拉处批注） -->
            <div class="xm-f-row" ref="dstRootEl">
              <input :value="form.destIndex" class="inp mono xm-idx-inp" placeholder="搜索宿主已有索引,或输入新索引名"
                spellcheck="false" autocomplete="off" role="combobox" aria-autocomplete="list"
                :aria-expanded="dstOpen ? 'true' : 'false'" :aria-controls="dstListId"
                :aria-activedescendant="dstOpen && dstItems[dstCursor] ? dstItemId(dstCursor) : undefined"
                @focus="dstOpenPanel" @input="onDstInput" @keydown="dstOnKey" />
              <div v-if="dstOpen && dstItems.length" class="xm-drop" ref="dstListEl" role="listbox" :id="dstListId">
                <!-- 候选行纯文本 → MarkText 命中高亮（kw=目标输入框值） -->
                <div v-for="(it, i) in dstItems" :key="it.index" class="xm-drop-item mono" :class="{ act: i === dstCursor }"
                  role="option" :id="dstItemId(i)" :aria-selected="i === dstCursor"
                  @mouseenter="dstCursor = i" @click="pickDst(it)"><MarkText :text="it.index" :kw="form.destIndex" /></div>
                <div v-if="dstFiltered.length > 30" class="xm-drop-more">…还有 {{ dstFiltered.length - 30 }} 个,输入关键词过滤</div>
              </div>
            </div>

            <!-- 建索引模式:同一行,不再单独行 -->
            <div class="xm-f-row xm-inline">
              <span class="xm-inline-lb">建索引方式</span>
              <div class="seg">
                <button v-for="m in destModes" :key="m.k" :class="{ on: form.destCreateMode === m.k }" @click="form.destCreateMode = m.k" :title="m.tip">{{ m.t }}</button>
              </div>
            </div>

            <!-- indexKey:只在 FROM_ENTITY 时显示 -->
            <div v-if="form.destCreateMode === 'FROM_ENTITY'" class="xm-f-row xm-inline xm-key-row">
              <span class="xm-inline-lb">业务实体</span>
              <n-select v-model:value="form.indexKey" :options="keyOpts" clearable size="small" filterable
                placeholder="从已注册的业务实体类中选一个（starter 启动时自动注册）" style="flex:1" />
              <span class="xm-hint-line" style="margin:0">按 Java 实体的 @Field 注解推导 mapping/settings 建索引</span>
            </div>

            <!-- 调优档:同一行 -->
            <div class="xm-f-row xm-inline">
              <span class="xm-inline-lb">迁移速度</span>
              <!-- emoji ⚡/🪶 → lucide 图标（Zap/Feather，全站图标语言统一） -->
              <div class="seg">
                <button :class="{ on: form.tuneMode === 'AGGRESSIVE' }" @click="form.tuneMode = 'AGGRESSIVE'" title="大批次多并发,速度优先（离线时段推荐）"><Zap :size="11" /> 极速</button>
                <button :class="{ on: form.tuneMode === 'GENTLE' }" @click="form.tuneMode = 'GENTLE'" title="小批次少并发,在线优先（业务高峰推荐）"><Feather :size="11" /> 温和</button>
              </div>
            </div>

            <!-- 高级:默认折叠 -->
            <details class="xm-adv-details">
              <summary>高级参数（通常不需要改）</summary>
              <div class="xm-adv">
                <label class="xm-adv-f"><span>并行路数</span><input v-model.number="form.slices" class="inp mono" type="number" min="0" placeholder="自动" title="sliced scroll 并行路数（留空/0=服务端默认）" style="width:72px" /></label>
                <label class="xm-adv-f"><span>批大小</span><input v-model.number="form.batchSize" class="inp mono" type="number" min="0" placeholder="默认" title="每批 bulk 写入文档数（留空/0=调优档默认）" style="width:82px" /></label>
                <label class="xm-adv-f"><span>scroll 秒</span><input v-model.number="form.scrollKeepAliveSec" class="inp mono" type="number" min="0" placeholder="默认" title="scroll 上下文存活秒（留空/0=调优档默认）" style="width:72px" /></label>
                <label class="xm-fm"><input type="checkbox" v-model="form.forceMerge" /> 收尾合并段</label>
              </div>
            </details>
          </div>
        </div>

        <!-- 源配置预览 -->
        <!-- W2：pre→JsonArea readonly 接线（「不做」裁决重估）——
 ① readonly 通道已补（JsonArea ）；② 高度模型确定解成立：
 rows=min(内容行数,封顶行数) → height=rows*19+16 是纯内容函数，无 DOM 测量、
 无回写回路（红线「高度棘轮/循环扩大」不触）。「随内容生长至封顶」语义保全：
 小配置少行、大配置封顶 10 行（10*19+16=206px ≈ 原 .xm-cfg 裸 pre 时代 max-height
 默认 200px，行粒度取整）。拖拽 resize:vertical+pointerup 落盘（xm·cfgMaxH）随裸 pre
 退役，__tests__ 全量 grep 无该偏好稿/裸 pre 类名的既有锁（无锁）；
 每块新增复制钮（裸 pre 时代无复制入口），Monaco 自带高亮与 JSON 校验圆点 -->
        <div v-if="form.destCreateMode === 'COPY_FROM_SOURCE'" class="xm-cfg">
          <button v-if="canOps" class="btn sm" :disabled="!form.sourceIndex || checking" @click="fetchCfg"><FileDown :size="11" /> {{ checking ? '拉取中…' : '拉取源 mapping/settings 预览' }}</button>
          <!-- 原始 IO 钮上移 .xm-actions 行常驻渲染——钮原被本分节 COPY_FROM_SOURCE
 v-if 包裹，NONE/FROM_ENTITY/REBUILD 三档模式下连接检查/启动迁移 IO 都入记录环
 （'/xmigrate/'）却全页无取数入口；钮形/aria/特征串零触（rawIo545 锁保全） -->
          <!-- 预览行数三档循环钮（useTierCycle 消费形态照抄 IlmView 宽/CV 高钮）——
 10/20/40 落盘键 xm.cfgRows，默认档 10=540 封顶值既有视觉零变化 -->
          <button class="btn sm ghost" :title="'配置预览行数档：' + cfgCapRows + ' 行（点击切换）'" @click="cycleCfgRows">行数</button>
          <!-- 拉取失败内联面板（连接检查失败面板同族形态）：全文可回看+原始对象旁路+重试 -->
          <div v-if="cfgErr" role="alert" class="err-bar rise-in xm-cfg-err">
            <span class="xm-err-txt" v-html="errPreHtml(cfgErr, errMeta(cfgErrRaw))"></span>
            <button v-if="canOps" class="btn sm" :disabled="checking" @click="fetchCfg"><RefreshCw :size="12" /> 重试</button>
          </div>
          <template v-if="cfgPreview">
            <div class="xm-cfg-grid">
              <!-- P2：分节标题升 .sec-t 档（.xm-g-hd 先例同款，形态归全局单源）。
 裸英文标签补中文弱化小字（K6 扫尾；class 计数随 554 锁零触） -->
              <div><div class="xm-cfg-t sec-t">mapping <span class="dim">字段映射</span></div><JsonArea :model-value="cfgMappingText" readonly :rows="cfgRows(cfgMappingText)" /></div>
              <div><div class="xm-cfg-t sec-t">settings <span class="dim">索引设置</span></div><JsonArea :model-value="cfgSettingsText" readonly :rows="cfgRows(cfgSettingsText)" /></div>
            </div>
          </template>
        </div>

        <!-- G3-B3：启动失败内联面板（全文+重试）——重试重开确认弹层，warn 级确认不旁路。
 裸插值换 errPreHtml+errMeta 双参（TaskTreeView 547 口径） -->
        <div v-if="startErr" role="alert" class="err-bar rise-in xm-start-err">
          <span class="xm-err-txt" v-html="errPreHtml(startErr, errMeta(startErrRaw))"></span>
          <button v-if="canOps && canDestOps" class="btn sm" @click="openStartConfirm"><RotateCcw :size="12" /> 重试</button>
        </div>

        <div class="xm-actions">
          <!-- F4：索引名非法的内联红字——按钮 disabled 只说「点不了」，这行才说为什么 -->
          <span v-if="idxNameError" class="xm-idx-err">{{ idxNameError }}</span>
          <!-- 原始 IO 快查钮常驻位（自 .xm-cfg 分节上移，钮形/aria/特征串零触）——
 margin-right:auto 靠行首（F4 红字同语言），启动钮仍在行尾 -->
          <button class="btn sm ghost" style="margin-right:auto" aria-label="查看原始 IO（迁移接口）" title="最近一次迁移接口调用的请求/响应原文" @click="openRawIo"><Terminal :size="11" /> 原始 IO</button>
          <button v-if="canOps" class="btn pri" :disabled="!canStart || starting" @click="openStartConfirm">
            <Rocket :size="13" /> {{ starting ? '启动中 ' + startSecs + 's' : '启动迁移' }}
          </button>
          <span v-else class="dim" style="font-size: var(--fs-xs)">迁移发起需 REBUILD_OP/ADMIN 角色</span>
        </div>
      </template>
    </div>

    <!-- 作业列表。：表格包裹壳退役（.card + padding:0/overflow:hidden 内联随壳
 退役）→ 538 SystemView .sy-res / 546 BrowserView .bw-res 同语言 border-top 分节；
 card-t 内联 padding 迁 .xm-res-t 落位类（盒模型尺寸零变动，QRT 本就全出血） -->
    <div class="xm-res">
      <div class="card-t xm-res-t">
<ListTodo :size="13" /> 迁移作业
        <!-- Markdown 复制与 TSV 并存（跟催场景贴群聊，Excel 场景走 TSV）——
 换壳 QRT 后仍走宿主 copyText（QRT 内建导出是下载文件，贴群场景要剪贴板）；
 行序经 qrtRef.getSortedRows() 取排序后行集（所见即所复，见 exportRows）。
 无作业时两导出钮 disabled 而非条件消失（工具行结构恒定）；margin-left:auto
 恒定钉在 Markdown 钮上，刷新钮不再随作业数条件推右（位置恒定） -->
        <button class="btn sm ghost" style="margin-left:auto" :disabled="!jobs.length" @click="exportMd" title="复制当前视图为 Markdown 表（群聊/工单直贴）"><ClipboardList :size="11" /> Markdown</button>
        <button class="btn sm ghost" :disabled="!jobs.length" @click="exportTsv" title="复制当前视图为 TSV（Excel 可直接粘贴）"><ClipboardCopy :size="11" /> 导出 TSV</button>
        <button aria-label="刷新任务列表" class="btn sm ghost" @click="loadJobs" title="刷新任务列表"><RefreshCw :size="11" /></button>
      </div>
      <!-- W1：作业表工具行——kw 过滤（状态/目标索引/源索引）；过滤绝不吞数据，
 n/m 命中数与清除钮可见。：排序/Σ 聚合/列管理交 QRT 内核（storage-key 记忆） -->
      <div v-if="jobs.length" class="xm-jobs-tools">
        <!-- kw 过滤改用 SearchFilterBar 统一件（559 TasksView tv-kw 先例；placeholder 逐字保留，
 Esc 清空/Enter 语义内建；xm-jobs-kw 类锚随 input-class 保留在 input 上—— DOM 锚字面保全，
 落位宽度随改用迁 wrap 根） -->
        <SearchFilterBar v-model="jobKw" class="xm-jobs-kw-wrap" input-class="inp xm-jobs-kw" placeholder="过滤：状态 / 目标索引 / 源索引" />
        <button v-if="jobKw" class="btn sm ghost" @click="jobKw = ''" title="清除过滤，恢复完整清单">清除过滤</button>
        <span v-if="jobKw" class="dim xm-jobs-hit">{{ filteredJobs.length }}/{{ jobs.length }} 条命中</span>
      </div>
      <!-- G3-B1：首载骨架前置（loading 初值 true + 无旧数据才出骨架，轮询/手动刷新不闪）；
 互斥链：骨架 → 表 → EmptyState（!loadErr 守卫） -->
      <!-- 审查 I1（-A2 形态收口）：err-bar 上移独立于互斥链（对齐 ClusterTopologyView 范式）——
 有旧数据时轮询/手动刷新失败也有渲染出口，不退化为仅 toast；失败不伪装空态。
 裸插值换 errPreHtml+errMeta 双参（TaskTreeView 547 口径） -->
      <div v-if="loadErr" role="alert" class="err-bar rise-in" style="margin:var(--sp-3) var(--sp-4)">
        <span class="xm-err-txt" v-html="errPreHtml(loadErr, errMeta(loadErrRaw))"></span>
        <button class="btn sm" @click="loadJobs"><RefreshCw :size="12" /> 重试</button>
      </div>
      <div v-if="jobsLoading && !jobs.length" class="xm-sk">
        <SkeletonBox height="30px" />
        <SkeletonBox height="30px" />
        <SkeletonBox height="30px" />
      </div>
      <!-- W-C：作业裸表换壳 QRT rows 型（DiagView/HealthReport 525 同款消费形态）——
 表头键盘可达（370）/排序记忆/列管理/Σ 聚合行/行展开（TableExpandRow）/行导航合并内核；
 富单元格走 #cell-<col> 槽（状态 pill/进度条/观测行），行级行动走 #row-actions 槽，
 行定位强调走 rowClass 契约挂 .xm-hit（527 深链定位链保全，见 jobRowCls） -->
      <!-- 补 fieldTypes（docs 数值列类型徽标+类型感知区间过滤白得；
 进度/冲突/错误=long、发起=date——四列全有 #cell-<col> 槽接管渲染，显示层零双重格式化）。
 补 export-name（内核导出文件名 xm-jobs-*）；semOn 经形态核对不接——
 八列全有 #cell- 槽接管显示（semOn 显示收益=0），且裸数字按值推断会把 0/1 值
 误挂 percent g 档 tone 类到 td（进度/冲突/错误列 0/1 是合法业务值），得不偿失 -->
      <QueryResultTable v-else-if="jobs.length" ref="qrtRef" :cols="XM_COLS" :rows="jobRows" sortable
        storage-key="xm-jobs" export-name="xm-jobs" :row-class="jobRowCls" max-height="none" empty-text="暂无迁移作业"
        :field-types="{ 进度: 'long', 冲突: 'long', 错误: 'long', 发起: 'date' }">
<template #cell-jobId="{ row }">
          <span class="mono cpy" :title="'点击复制 jobId: ' + row[0]" tabindex="0" role="button" @click.stop="copyJobId(String(row[0]))" @keydown.enter.prevent="copyJobId(String(row[0]))" @keydown.space.prevent="copyJobId(String(row[0]))">{{ row[0] }}</span>
</template>
        <!-- xmStatusZh 中文主显 + 英文枚举小字 en 档（519 范式，528 W-E 形态不回退）；结果文案上 title。
 手滚 pill 改用 StatusPill 统一件（n 档兜底——未命中枚举回显原文并进 title）；
 RUNNING dot-pulse 呼吸点随装退役（StatusPill 契约四项无插槽，运行中标识由 y 档色语义承担） -->
        <template #cell-状态="{ row }">
          <StatusPill :tone="statusTone(rowJob(row)?.status)"
            :label="statusZh(rowJob(row)?.status) || String(rowJob(row)?.status ?? '')"
            :en="statusZh(rowJob(row)?.status) ? rowJob(row)?.status : undefined"
            :title="xmStatusTitle(rowJob(row))" />
        </template>
        <template #cell-目标索引="{ row }">
          <span class="mono">{{ rowJob(row)?.destIndex }}</span>
          <!-- 目标索引跳转芯片（本地集群索引， QRT 同范式）；源索引属远程集群不跳 -->
          <button class="xm-idx-go" :aria-label="'打开索引工作区：' + rowJob(row)?.destIndex" title="打开索引工作区" @click.stop="gotoIdx(rowJob(row)?.destIndex)"><ExternalLink :size="11" /></button>
        </template>
        <template #cell-源="{ row }">
          <span class="mono xm-src-cell" :title="rowJob(row)?.sourceIndex + ' ← ' + rowJob(row)?.remoteEndpoint + '（点击复制）'" style="cursor:pointer"
            role="button" tabindex="0" :aria-label="'复制源信息：' + (rowJob(row)?.sourceIndex || '')"
            @click.stop="copySrc(row)" @keydown.enter.prevent="copySrc(row)" @keydown.space.prevent="copySrc(row)">{{ rowJob(row)?.sourceIndex }} ← {{ rowJob(row)?.remoteEndpoint }}</span>
        </template>
        <!-- 进度槽：进度条 + migrated/total meta + 观测行（耗时人话化 / sliceMigrated Σ
 速率 docs/s / 失败切片红 chip）——旧 JSON 无新字段时全部静默降级不显（null 安全） -->
        <template #cell-进度="{ row }">
          <div class="xm-p-track">
            <div v-if="indeterminate(rowJob(row))" class="xm-p-fill xm-p-indet"></div>
            <div v-else class="xm-p-fill" :class="{ run: rowJob(row)?.status === 'RUNNING' }" :style="{ width: pctOf(rowJob(row)) + '%' }"></div>
          </div>
          <!-- 进度 meta 手滚 mono 串 → MetaStrip 统一件（items+tone 分档：
 运行中 info / 完成 ok / 其余中性灰；「迁移中 N 条（总量未知）」「N/T（P%）」文案语义逐字对位，
 原本地 xm-p-run/xm-p-ok 色档规则随装退役由 tone 承担） -->
          <MetaStrip class="xm-p-meta" :items="progressMeta(rowJob(row))" />
          <div v-if="elapsedMsOf(rowJob(row)) != null" class="xm-p-obs mono">
            <span :title="'耗时（' + (rowJob(row)?.finishedAtMs ? '已完成' : '进行中') + '）'">{{ humanElapsed(elapsedMsOf(rowJob(row))!) }}</span>
            <span v-if="rateOf(rowJob(row)) != null" :title="'速率 = ΣsliceMigrated / 耗时'">· {{ fmtNum(rateOf(rowJob(row))!) }} docs/s</span>
          </div>
          <div v-if="sliceFailChips(rowJob(row)).length" class="xm-sfails">
            <span v-for="f in sliceFailChips(rowJob(row))" :key="f.id" class="chip mono xm-sfail"
              :title="'切片 #' + f.id + ' 失败 ' + f.n + ' 次'">#{{ f.id }} ×{{ f.n }}</span>
          </div>
        </template>
        <template #cell-冲突="{ row }">
          <span class="mono" :class="row[5] ? 'meta-warn' : ''">{{ fmtNum(row[5]) }}</span>
        </template>
        <template #cell-错误="{ row }">
          <span class="mono" :class="row[6] ? 'meta-err' : ''">{{ fmtNum(row[6]) }}</span>
        </template>
        <!-- TimeCell 合并：相对时间 + 悬浮带时区绝对时间（QRT 对 epoch 数值的人性化只作复制/导出 raw 兜底） -->
        <template #cell-发起="{ row }">
          <TimeCell v-if="row[7] != null" :ts="row[7]" />
          <span v-else class="qrt-null">∅</span>
        </template>
        <!-- 行级行动注入位（原「操作」列合并）：中止/续跑/去查询验证/复制错误样本/作业行菜单 -->
        <template #row-actions="{ row }">
          <button aria-label="中止迁移：停止拉取，目标索引已写入的数据保留（不自动清理）" v-if="canJobOps(rowJob(row)) && rowJob(row)?.status === 'RUNNING'" class="btn sm danger" title="中止迁移：停止拉取，目标索引已写入的数据保留（不自动清理）" :disabled="aborting" @click.stop="askAbort(rowJob(row))"><OctagonX :size="11" :class="{ spinning: aborting }" /></button>
          <button aria-label="断点续跑" v-if="canJobOps(rowJob(row)) && canDestOps && ['FAILED','ABORTED','INTERRUPTED'].includes(rowJob(row)?.status ?? '')" class="btn sm" @click.stop="askResume(rowJob(row))" title="断点续跑"><RotateCcw :size="11" /></button>
          <!-- 联动性：迁移完成一键去查询工作台验证目标索引（对齐托管重建「去查询验证」深链） -->
          <button aria-label="去查询验证：在查询工作台打开目标索引" v-if="rowJob(row)?.status === 'DONE' && rowJob(row)?.destIndex" class="btn sm" :title="'验证迁移结果：在查询工作台打开「' + rowJob(row)?.destIndex + '」'" @click.stop="goVerify(rowJob(row))"><SearchCheck :size="11" /></button>
          <!-- 错误样本全量复制（诚实口径）——展开详情降维 JsonTree 后复制入口上移行尾 -->
          <button v-if="rowJob(row)?.errorSamples?.length" class="btn sm ghost" :aria-label="'复制全部 ' + rowJob(row)?.errorSamples.length + ' 条错误样本'"
            title="复制全部错误样本" @click.stop="copyErrSamples(rowJob(row))"><ClipboardList :size="11" /></button>
          <!-- 作业行菜单（CellContextMenu）——行级 contextmenu 被 QRT 内核列管理占用，
 入口改行尾菜单钮（左键/右键皆开）；行展开由内核行尾钮/E 键承接 -->
          <button aria-label="作业行菜单" class="btn sm ghost" title="复制 jobId / 复制作业信息（右键本钮同效）"
            @click.stop="openJobMenu($event, rowJob(row))" @contextmenu.stop.prevent="openJobMenu($event, rowJob(row))"
            @keydown="onJobMenuKey($event, rowJob(row))"><MoreHorizontal :size="11" /></button>
</template>
      </QueryResultTable>
      <!-- G3-C1：空态归位 EmptyState 组件（S6），不再用旧全局 .empty 裸文案；
 !loadErr 守卫（-A2）：失败时只剩顶部 err-bar，不并存「暂无迁移作业」 -->
      <EmptyState v-else-if="!loadErr" :icon="ListTodo" text="暂无迁移作业" hint="上方新建迁移，或点右上角刷新" />
    </div>

    <!-- W4：启动/中止确认直挂 ConfirmModal 退役，合并全局 askConfirm
 （openStartConfirm/askAbort 内联承载；F3 警告分支在 preflight 落定后随弹层一次呈现） -->

    <!-- resume modal -->
    <n-modal v-model:show="resumeOpen" preset="card" title="续跑迁移（重新供给旧集群凭据）" style="width:480px;max-width:92vw" :bordered="false">
      <div class="xm-tip" style="margin-bottom:var(--sp-3)">目标：<b class="mono">{{ actJob?.sourceIndex }}</b> → <b class="mono">{{ actJob?.destIndex }}</b>（{{ actJob?.remoteEndpoint }}）</div>
      <!-- 续跑同样可引用已存连接档案；：补 filterable（与源集群下拉同款） -->
      <div style="margin-bottom:var(--sp-2)">
        <n-select v-model:value="resumeConnId" :options="resumeOpts" :render-label="renderConnOpt" size="small" filterable placeholder="手动输入连接信息" />
      </div>
      <div v-if="!resumeConnId" class="xm-conn" style="flex-wrap:wrap">
        <input v-model="resumeConn.host" class="inp mono" placeholder="host 或 ${HOST_REF}" style="flex:2;min-width:140px" />
        <input v-model.number="resumeConn.port" class="inp mono" type="number" placeholder="9200" style="width:90px" />
        <input v-model="resumeConn.username" class="inp mono" placeholder="用户名" style="flex:1;min-width:100px" />
        <input v-model="resumeConn.password" class="inp mono pw-mask" type="text" autocomplete="off" placeholder="密码（可用${PWD_REF}）" style="flex:1;min-width:130px" />
      </div>
      <div v-else class="xm-tip" style="margin:0">凭据由服务端从连接档案「{{ connName(resumeConnId) }}」取用，明文不经前端。</div>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:var(--sp-2)">
          <button class="btn" @click="resumeOpen = false">取消</button>
          <button v-if="canJobOps(actJob) && canDestOps" class="btn pri" :disabled="resuming" @click="doResume">续跑</button>
        </div>
      </template>
    </n-modal>

    <!-- 作业行右键菜单（CellContextMenu 第四场景）——复制/详情直达，移出行消失 -->
    <CellContextMenu v-if="jobMenu" :x="jobMenu.x" :y="jobMenu.y" :title="jobMenu.job.destIndex || jobMenu.job.jobId"
      :items="jobMenuItems" @close="jobMenu = null" />

    <!-- 原始 IO 弹窗（宿主受控开关；rec=最近一条 /xmigrate/ 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, h, onMounted, onActivated, onBeforeUnmount, watch, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAutoRefresh } from '../composables/useAutoRefresh';
import { Rocket, ChevronDown, PlugZap, FileDown, RefreshCw, ListTodo, OctagonX, RotateCcw, ClipboardCopy, ClipboardList, SearchCheck, Copy, Zap, Feather, ExternalLink, MoreHorizontal, Terminal } from 'lucide-vue-next';
import { NSelect, NModal } from 'naive-ui';
import MarkText from '../components/MarkText.vue';
import PageHeader from '../components/PageHeader.vue'; /* 页头统一件（AdhocRebuild/Ilm 同范式） */
import RemoteSourceFields from '../components/RemoteSourceFields.vue'; /* 远程源连接表单统一件（RA 同款合并） */
import QueryResultTable from '../components/QueryResultTable.vue'; /* W-C：作业裸表换壳 QRT rows 型 */
import StatusPill from '../components/StatusPill.vue'; /* ：状态手滚 pill 改用统一件（ 范式） */
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue'; /* ：进度 meta 手滚 mono 串换统一件 */
import { api, ioRecorder, type RawIoRec } from '../api';
import { isBrowserMode } from '../platform/browserApi';
/* 原始请求/响应快查弹窗（源配置预览分节消费，ioRecorder 记录环取数） */
import RawIoModal from '../components/RawIoModal.vue';
import { friendlyApiError } from '../utils/esError';
/* err-bar 双参改用（errMetaPave547 TaskTreeView 口径——errPreHtml+errMeta，
 错误原文全文不回退，仅头部追加 code 徽标/「失败于 端点」元信息行） */
import { errPreHtml, errMeta } from '../utils/errPre';
import type { ConnHealth } from '../api';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useScopedDraft, useScopedDraftState } from '../composables/useScopedDraft';
import { usePref } from '../composables/urlState'; /* ：xm.recentKeys 最近选用置顶（预览限高稿 cfgMaxH 已随 pre 退役） */
import { useTierCycle } from '../composables/useTierCycle'; /* ：配置预览行数三档（xm.cfgRows，Ilm/CV 同款消费形态） */
import { fmtNum, fmtTime, statusColor } from '../utils/format';
/* W4：迁移阶段枚举 → 中文名映射收口 utils/esEnumZh（xmStatusZh，
 别名保模板 statusZh 字面量；纯显示层，数据/排序/导出仍用原枚举） */
import { xmStatusZh as statusZh } from '../utils/esEnumZh';
import { askConfirm } from '../composables/confirm';
import { prettyJson } from '../utils/jsonc';
import { copyText } from '../utils/format';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import TimeCell from '../components/TimeCell.vue';
import SkeletonBox from '../components/SkeletonBox.vue';
import EmptyState from '../components/EmptyState.vue';
import CellContextMenu from '../components/CellContextMenu.vue';
import { useModalEnter } from '../composables/useModalEnter';
import { usePopupList } from '../composables/usePopupList'; /* ：手写下拉统一骨架 */
import { useQueryRun } from '../composables/useQueryRun'; /* ：启动行读秒（AdhocRebuild :433 范式） */
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* ：作业表 kw 过滤胶囊统一件（559 TasksView tv-kw 先例） */
import DraftBadge from '../components/DraftBadge.vue'; /* ：草稿恢复徽标统一件 */
import JsonArea from '../components/JsonArea.vue'; /* W2：源配置预览只读渲染统一件（readonly 通道 + 行数封顶高度模型） */

const store = useAppStore();
/* 权限门禁——迁移发起/中止/续跑=/xmigrate/start|abort|resume=REBUILD 档（rank3+） */
const auth = useAuthStore();
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/xmigrate/start', srcConnId.value || store.target));
/* 迁移写入端恒为宿主：发起/续跑必须同时持有宿主连接的 xmigrate 写键（后端 requireDestWrite 同源） */
const canDestOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/xmigrate/start', 'host'));
/* 作业操作按作业源连接写键裁决（后端按 job.srcConnId 校验）；旧版/手输作业在连接模型下不展示操作 */
const canJobOps = (job: any): boolean => {
  if (!job) return false;
  if (auth.isAdmin()) return true;
  /* 作业归属（后端 1007）：续跑/中止仅创建者本人或 ADMIN；legacy 无 owner 维持连接级。
     进度仍对同源连接成员可见（团队排障），只是不展示这两颗不可逆动作钮。 */
  const owner = job.ownerUsername ? String(job.ownerUsername).trim() : '';
  if (owner && owner !== (auth.me?.username || '')) return false;
  const src = job.srcConnId ? String(job.srcConnId).trim() : '';
  const connModel = auth.grantedPages != null && auth.grantedPages.some(g => g.startsWith('conn:'));
  if (!src && connModel) return false;
  return auth.canEndpoint('ops', 'POST', '/internal/es/xmigrate/abort', src || store.target);
};
const router = useRouter();
/* 目标索引直达索引工作区 */
/* 错误样本全量复制（诚实口径） */
function copyErrSamples(j: any) {
  const text = (j.errorSamples || []).join('\n');
  copyText(text).then(ok => store.notify(ok ? 'success' : 'error', ok ? `已复制 ${j.errorSamples.length} 条错误样本` : '复制失败'));
}
function gotoIdx(idx?: string) {
  if (!idx) return;
  router.push({ path: '/indices', query: { idx } });
}

const DEST_MODES = [
  { k: 'NONE', t: '已存在', tip: '目标索引必须已建好，迁移只写数据不改结构（适合日常增量）' },
  { k: 'COPY_FROM_SOURCE', t: '按源结构建', tip: '目标不存在时，按源索引的 mapping/settings 建同名新索引（忠实继承源集群结构）' },
  { k: 'FROM_ENTITY', t: '按实体建', tip: '目标不存在时，按业务侧实体类注解(@Field)推导建索引（需选 indexKey）' },
  { k: 'REBUILD', t: '删旧重建', tip: '⚠ 先删除已有目标索引（含全部数据!），再按源结构建新索引，然后全量迁入（用于目标脏了想从头来）' },
] as const;
/* 浏览器模式没有服务端 @Mapping 注册表：FROM_ENTITY 不可兑现，直接收起该档，
   不让用户选到一个必然报错的入口（手输/草稿恢复也归一到「已存在」）。 */
const destModes = computed(() => isBrowserMode
  ? DEST_MODES.filter(m => m.k !== 'FROM_ENTITY')
  : [...DEST_MODES]);

/* formOpen 落盘（usePref 'xm.formOpen'，默认 true=既有行为零变化；
 550 轨2 ② DevTools dt.histOpen 同范式——展开/收起跨会话记忆） */
const formOpen = usePref('xm.formOpen', true);
const connUrl = ref('');
/* w53:连接串非密码部分进草稿(host/port/username 刷新/切走不丢);password 会话内存态——
 安全天条:密码不落盘,刷新后需重输但其余字段全在(比整表清空好一个量级)。 */
const connDraft = useScopedDraftState<any>('conn', { route: 'xmigrate' },
  { scheme: 'http', host: '', port: 9200, username: '', password: '' });
const conn = connDraft.state;
/* 挂载后立即清 password 草稿残留(useScopedDraftState 恢复整个对象,但 password 不该在存储里) */
onMounted(() => { conn.value.password = ''; });

/* 已存连接下拉——选中则服务端按档案取密，明文不经前端；''=手动输入回退 */
const srcConnIdDraft = useScopedDraft('src-conn-id', { route: 'xmigrate' });
const srcConnId = srcConnIdDraft.text;
/* 连接模型下源必须是已授权档案（后端 requireSourceWrite 拒绝手输）；
   非连接模型保留手输回退。连接目录本身也按 canSeeConn 过滤，未授权连接名不外泄。 */
const connModel = computed(() => Array.isArray(auth.grantedPages)
  && auth.grantedPages.some(g => g.startsWith('conn:')));
const connOpts = computed(() => [
  ...(connModel.value ? [] : [{ label: '手动输入…', value: '' }]),
  ...store.conns.filter(c => auth.canSeeConn(c.id))
    .map(c => ({ label: `${c.name}（${c.host}:${c.port}）`, value: c.id, health: c.health })),
]);
/* 续跑只能沿用作业源档案（后端同口径）；连接模型下把下拉钉死在该档案。 */
const resumeOpts = computed(() => {
  if (!connModel.value || !actJob.value?.srcConnId) return connOpts.value;
  return connOpts.value.filter(o => o.value === String(actJob.value.srcConnId).trim());
});
function renderConnOpt(opt: any) {
  if (!opt.value) return opt.label;
  // 下拉菜单 teleport 到 body，scoped 样式覆盖不到——状态点用内联样式
  const s = opt.health?.status || 'UNKNOWN';
  const bg = s === 'GREEN' ? 'var(--ok)' : s === 'RED' ? 'var(--err)' : 'var(--tx2)';
  return h('span', { style: 'display:inline-flex;align-items:center;gap:var(--sp-1h)' }, [
    h('span', { style: `display:inline-block;width:7px;height:7px;border-radius:50%;flex-shrink:0;background:${bg};${s === 'UNKNOWN' ? 'opacity:.55' : ''}` }),
    opt.label,
  ]);
}
const pickedConn = computed(() => store.conns.find(c => c.id === srcConnId.value));
function hdotCls(h2?: ConnHealth) {
  const s = h2?.status || 'UNKNOWN';
  return { green: s === 'GREEN', red: s === 'RED', unknown: s === 'UNKNOWN' };
}
function connName(id: string) {
  return store.conns.find(c => c.id === id)?.name || id;
}
function onSrcConnChange() {
  // 换源即失效：旧集群索引列表与配置预览都是上一个源的产物
  remoteIndices.value = [];
  cfgPreview.value = null;
  checkErr.value = ''; // G3-B2：换源后旧源的失败面板一并失效
}

const XM_FORM_DEFAULT = ({
  sourceIndex: '', destIndex: '', indexKey: null,
  destCreateMode: 'NONE', tuneMode: 'AGGRESSIVE',
  /* 高级参数初始留空：侧栏裸 0 会盖掉 placeholder，运维分不清「0」是填过还是默认；提交时 || 0 归一 */
  slices: null, batchSize: null, scrollKeepAliveSec: null, forceMerge: false,
});
/* 草稿：表单草稿迁 useScopedDraftState（按集群目标隔离；不含凭据字段），
 启动成功后的清除语义保留（clear()）。 */
const formDraft = useScopedDraftState<any>('form', { route: 'xmigrate',}, XM_FORM_DEFAULT);
const form = formDraft.state;
/* 浏览器模式隐藏 FROM_ENTITY 后，恢复的旧草稿不能停留在不可见档位。 */
if (isBrowserMode && form.value.destCreateMode === 'FROM_ENTITY') form.value.destCreateMode = 'NONE';
/* 第 2 步宿主目标索引默认回填顶栏选中（ 单一真相）：一次性初值，仅空时回填——
 不改用户已输/草稿恢复值；写类视图不做持续 follow（ 白名单口径，防「A 的目标
 被顶栏切换悄悄改掉」），要换目标由用户显式改输入。 */
if (!form.value.destIndex && store.pickedIdx) form.value.destIndex = store.pickedIdx;
const keyOpts = ref<{ label: string; value: string }[]>([]);
/* 迁移 key 下拉 localeCompare 字母序 + 最近选用置顶——
 选中即记录（去重 unshift，cap 5：太长置顶区挤占字母序视野），usePref 落盘刷新保持。
 纯显示层排序：api.keys 原始清单与提交值零触碰 */
const recentKeys = usePref<string[]>('xm.recentKeys', []);
function sortKeyOpts(list: { label: string; value: string }[]): { label: string; value: string }[] {
  const rank = (v: string) => {
    const i = recentKeys.value.indexOf(v);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...list].sort((a, b) => rank(a.value) - rank(b.value) || a.value.localeCompare(b.value));
}
watch(() => form.value.indexKey, (v) => {
  if (!v) return;
  recentKeys.value = [v, ...recentKeys.value.filter(k => k !== v)].slice(0, 5);
});
/* 目标（宿主）索引清单：xb.destIndices 控制面端点，与迁移写入端严格同源 */
const hostIndices = ref<any[]>([]);
/* w57:目标索引是否已存在(用于确认弹层差异化提示) */
const destExists = computed(() => hostIndices.value.some(h => h.index === form.value.destIndex));
/* F3：preflight 失败时「删数据警告消失」的病根是警告分支都包在 preflight?.destExists 里。
 统一走 destExistsSafe：preflight 有结果用它的判定，没有则降级用界面已有数据
 （hostIndices 清单）兜底——警告的有无绝不因一次请求失败而翻转。 */
const destExistsSafe = computed(() =>
  preflight.value ? !!preflight.value.destExists : destExists.value);


function parseUrl() {
  const s = connUrl.value.trim();
  if (!s) return;
  try {
    const m = s.match(/^(?:(https?):\/\/)?(?:([^:@/]+)(?::([^@/]*))?@)?([^:/]+)(?::(\d+))?/);
    if (!m || !m[4]) throw new Error('无法解析');
    conn.value = {
      scheme: m[1] || 'http', host: m[4], port: m[5] ? Number(m[5]) : 9200,
      username: m[2] || '', password: m[3] || '',
    };
    store.notify('success', '已解析连接串');
  } catch (e: any) { store.notify('error', '连接串解析失败: ' + friendlyApiError(e)); } /* w80：裸 e.message → friendlyEsError */
}

/* 连接检查 */
const checking = ref(false);
const checkErr = ref(''); // G3-B2：连接检查失败内联面板状态位
const checkErrRaw = ref<unknown>(null); // ：原始错误对象旁路（catch 压串丢 code/endpoint，喂 errMeta）
const remoteIndices = ref<any[]>([]);
/* w59:下拉过滤（清单仍按输入关键字过滤）。
 套 fieldSearch 同款 rank 排序（精确=0 > 前缀=1 > 包含=2，同级字母序）——
 纯 includes 序把精确命中淹没在中间 */
const srcFiltered = computed(() => {
  const kw = form.value.sourceIndex?.trim().toLowerCase() || '';
  const list = remoteIndices.value;
  if (!kw) return list;
  const rankOf = (n: string) => (n = n.toLowerCase()) === kw ? 0 : n.startsWith(kw) ? 1 : 2;
  return list
    .filter(r => String(r.index).toLowerCase().includes(kw))
    .sort((a, b) => rankOf(String(a.index)) - rankOf(String(b.index)) || String(a.index).localeCompare(String(b.index)));
});
const dstFiltered = computed(() => {
  const kw = form.value.destIndex?.trim().toLowerCase() || '';
  const list = hostIndices.value;
  if (!kw) return list;
  const rankOf = (n: string) => (n = n.toLowerCase()) === kw ? 0 : n.startsWith(kw) ? 1 : 2;
  return list
    .filter(h => String(h.index).toLowerCase().includes(kw))
    .sort((a, b) => rankOf(String(a.index)) - rankOf(String(b.index)) || String(a.index).localeCompare(String(b.index)));
});
/* ══ ：源/目标索引手写受控下拉迁 usePopupList 统一骨架（IndexPicker 同款消费形态） ══
 键盘 ↑↓/Enter/Esc、aria combobox 关联、点击外部关闭由骨架带来；手写 @focus/@blur/
 mousedown.prevent 三件套退役。to:false = 就地渲染（保持原 .xm-drop absolute 随根定位，
 place() 的 fixed 坐标不参与）；cap 30 保留原 slice(0,30) 口径（items computed 等价截断，
 超出走关键词过滤提示行）。源=旧集群索引清单（remoteIndices）、目标=宿主集群清单（hostIndices）。 */
const XM_DROP_CAP = 30;
const srcItems = computed(() => srcFiltered.value.slice(0, XM_DROP_CAP).map(ri => ({ index: String(ri.index) })));
const dstItems = computed(() => dstFiltered.value.slice(0, XM_DROP_CAP).map(hi => ({ index: String(hi.index) })));
function pickSrc(it: { index: string }) { form.value.sourceIndex = it.index; srcClose(); }
function pickDst(it: { index: string }) { form.value.destIndex = it.index; dstClose(); }
const {
  open: srcOpen, cursor: srcCursor, listId: srcListId, itemId: srcItemId,
  rootEl: srcRootEl, listEl: srcListEl, openPanel: srcOpenPanel, close: srcClose, onKey: srcOnKey,
} = usePopupList<{ index: string }>({
  items: () => srcItems.value,
  onChoose: pickSrc,
  to: () => false,
  idPrefix: 'xm-src',
  activeSelector: '.xm-drop-item.act',
});
const {
  open: dstOpen, cursor: dstCursor, listId: dstListId, itemId: dstItemId,
  rootEl: dstRootEl, listEl: dstListEl, openPanel: dstOpenPanel, close: dstClose, onKey: dstOnKey,
} = usePopupList<{ index: string }>({
  items: () => dstItems.value,
  onChoose: pickDst,
  to: () => false,
  idPrefix: 'xm-dst',
  activeSelector: '.xm-drop-item.act',
});
/* 输入即开面板 + 光标复位（IndexPicker onInput 同款语义） */
function onSrcInput(e: Event) {
  form.value.sourceIndex = (e.target as HTMLInputElement).value;
  srcCursor.value = 0;
  if (!srcOpen.value) srcOpenPanel();
}
function onDstInput(e: Event) {
  form.value.destIndex = (e.target as HTMLInputElement).value;
  dstCursor.value = 0;
  if (!dstOpen.value) dstOpenPanel();
}
/* w80:chips 快捷清单过滤词一份=源输入框值（原独立 remoteKw 退役——同清单双 UI 双过滤词收敛）；
 旧集群索引可能上百个：截断 60 条 + 提示行避免页面被撑爆 */
const filteredRemote = computed(() => {
  const kw = form.value.sourceIndex?.trim().toLowerCase() || '';
  const list = kw ? remoteIndices.value.filter(r => String(r.index).toLowerCase().includes(kw)) : remoteIndices.value;
  return list.slice(0, 60);
});
const remoteOverflow = computed(() => {
  const kw = form.value.sourceIndex?.trim().toLowerCase() || '';
  const total = kw ? remoteIndices.value.filter(r => String(r.index).toLowerCase().includes(kw)).length : remoteIndices.value.length;
  return Math.max(0, total - 60);
});
function connBody() {
  const c: any = { scheme: conn.value.scheme, host: conn.value.host, port: conn.value.port || 9200 };
  if (conn.value.username) c.username = conn.value.username;
  if (conn.value.password) c.password = conn.value.password;
  return c;
}
async function check() {
  /* 探测面（服务端按任意连接串建连）与迁移写同档 rank3——按钮 v-if 之外的直调也收口 */
  if (!canOps.value) { store.notify('warning', '迁移探测需专项或 ADMIN 角色'); return; }
  if (connModel.value && !srcConnId.value) { store.notify('warning', '连接模型下必须选择已授权的源连接档案'); return; }
  /* 在途互斥闸：闸读收本体首行——fetchCfg 复用 checking 做闸（拉取在途直接短路）
 既有形态在本体收敛，失败面板重试钮同拍双击的两拍 connectCheck 随之消除 */
  if (checking.value) return;
  if (!srcConnId.value && !conn.value.host) { store.notify('warning', '先填 host'); return; }
  checking.value = true;
  checkErr.value = '';
  checkErrRaw.value = null;
  try {
    remoteIndices.value = await api.xb.connectCheck(srcConnId.value ? {} : connBody(), srcConnId.value || undefined);
    store.notify('success', `连接成功，旧集群 ${remoteIndices.value.length} 个索引`);
  } catch (e: any) {
    remoteIndices.value = [];
    /* G3-B2：失败不再仅 toast——内联面板留全文可回看（证书/认证/超时排障需要），toast 同步保留；
 原始对象旁路（errMeta 读 code/endpoint） */
    checkErr.value = '连接失败：' + friendlyApiError(e);
    checkErrRaw.value = e;
    store.notify('error', checkErr.value);
  } finally { checking.value = false; }
}

/* 源配置预览 */
const cfgPreview = ref<any>(null);
const cfgErr = ref(''); // 拉取失败内联面板状态位（连接检查失败面板同族形态）
const cfgErrRaw = ref<unknown>(null); // ：原始错误对象旁路（catch 压串丢 code/endpoint，喂 errMeta）
/* W2：配置预览文本体——prettyJson 兜底原文（解析失败回显原串，校验圆点诚实报非法）；
 highlightJson v-html 通道随裸 pre 退役（Monaco 自带高亮）。封顶 10 行
 （10*19+16=206px ≈ 原 cfgMaxH 默认 200px）；cfgRows=min(内容行数,封顶) 纯内容函数，
 无 DOM 测量、无回写回路——「随内容生长至封顶」确定解（红线：高度棘轮/循环扩大不触） */
const cfgMappingText = computed(() => prettyJson(cfgPreview.value?.mapping ?? ''));
const cfgSettingsText = computed(() => prettyJson(cfgPreview.value?.settings ?? ''));
const XM_CFG_CAP_ROWS = 10;
/* 预览行数封顶改三档循环（useTierCycle 统一件，IlmView ilm.listW /
 ConfigValidatorView issuesH 同款消费形态）——10/20/40 落盘键 xm.cfgRows，
 默认档 10=原封顶值既有视觉零变化；cfgRows 仍纯内容函数 min(内容行数,档值)，
 无 DOM 测量、无回写回路（高度红线不触） */
const { v: cfgCapRows, cycle: cycleCfgRows } = useTierCycle('xm.cfgRows', [XM_CFG_CAP_ROWS, 20, 40], XM_CFG_CAP_ROWS);
function cfgRows(text: string) { return Math.min(text.split('\n').length, cfgCapRows.value); }
async function fetchCfg() {
  if (!canOps.value) { store.notify('warning', '迁移探测需专项或 ADMIN 角色'); return; }
  if (connModel.value && !srcConnId.value) { store.notify('warning', '连接模型下必须选择已授权的源连接档案'); return; }
  if (checking.value) return; /* 提交防重：复用连接检查的 checking 状态位，拉取在途直接短路 */
  checking.value = true;
  cfgErr.value = '';
  cfgErrRaw.value = null;
  try {
    cfgPreview.value = await api.xb.fetchConfig(srcConnId.value ? {} : connBody(), form.value.sourceIndex, srcConnId.value || undefined);
  } catch (e: any) {
    /* 失败与连接检查同款内联面板：全文可回看+原始对象旁路，toast 同步保留
   （w80：裸 e.message → friendlyApiError） */
    cfgErr.value = '拉取失败：' + friendlyApiError(e);
    cfgErrRaw.value = e;
    store.notify('error', cfgErr.value);
  } finally { checking.value = false; }
}

/* 原始 IO 快查（预览分节）——取记录环最近一条 /xmigrate/ 记录
 （fetch-config/preflight/connect-check 等本页 xb 调用皆算）开弹窗；无记录时 EmptyState 引导 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
/* 判空同步更新（DslQueryView 550 口径逐字平移）——无记录 notify 引导不开空弹窗 */
function openRawIo() {
  const rec = ioRecorder.last('/xmigrate/');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

/* 启动 */
const starting = ref(false);
/* 启动行读秒（AdhocRebuildView :433 范式；starting 布尔与 qr 状态并存，
 互斥口径照 SqlBridgeView doStart 守卫双查先例）——api.xb.start 签名无 signal 参，
 begin() 只供计时（elapsedMs 100ms tick 驱动「启动中 X.Xs」读秒），不做竞态丢弃 */
const qr = useQueryRun();
const startSecs = computed(() => (qr.elapsedMs.value / 1000).toFixed(1));
const startErr = ref(''); // G3-B3：启动失败内联面板状态位
const startErrRaw = ref<unknown>(null); // ：原始错误对象旁路（喂 errMeta，同 checkErrRaw）
const preflight = ref<any>(null); // 启动前预检（dest 是否已存在）
/* W4：启动确认直挂 ConfirmModal 合并 askConfirm——preflight 先行落定，
 弹层一次性呈现完整警告分支（F3：REBUILD 删数据警示绝不允许缺席，故不参与
 dismissable 会话跳过——同 title 下后续作业的删数据警示不得被静默吞掉）。
 destExists 统一取 destExistsSafe（preflight 缺席时用 hostIndices 兜底）。 */
async function openStartConfirm() {
  /* 权限执行体首行门：放在 preflight/确认窗之前——无权限者不得看到预检与启动弹层 */
  if (!canOps.value || !canDestOps.value) { store.notify('warning', '迁移发起需要源连接与宿主目标集群的迁移写权限'); return; }
  /* 闸读收本体首行+置位前移到第一个 await 之前：preflight 与确认窗挂起期间启动钮
 即禁用，二击不再穿透双开确认窗（确认服务是全局单例，二次请求会把先开的弹层按取消
 静默收掉）；取消路径由 finally 复位防闸死，成功路径随 doStart 完成统一复位 */
  if (starting.value) return;
  starting.value = true;
  try {
    preflight.value = null;
    try {
      preflight.value = await api.xb.preflight({ sourceIndex: form.value.sourceIndex, destIndex: form.value.destIndex }, srcConnId.value || undefined);
    } catch {
      /* F3：预检失败不阻断启动，但不能静默——用户须知道弹层警告此刻是降级口径
   （以界面已有数据为准），而不是「确认过没有风险」 */
      store.notify('warning', 'preflight 请求失败，确认弹层的警告将以界面已有数据为准');
    }
    const srcDesc = srcConnId.value
      ? (pickedConn.value?.name + '（' + pickedConn.value?.scheme + '://' + pickedConn.value?.host + ':' + pickedConn.value?.port + '）')
      : (conn.value.scheme + '://' + conn.value.host + ':' + conn.value.port);
    /* 警告分支逐字保留原弹层三分支文案（原 <b> 强调在纯文本 message 中降为文字语义） */
    let warn = '';
    if (form.value.destCreateMode === 'REBUILD') {
      warn = `⚠ 删旧重建模式:目标索引 ${form.value.destIndex} 及其全部数据将被删除,然后按源结构重建并全量迁入。此操作不可撤销!`;
    } else if (destExistsSafe.value) {
      warn = `目标索引 ${form.value.destIndex} 已存在:同名文档将被跳过,结果是合并而非重建。如需清空重来,请改选「删旧重建」模式。`;
    } else if (form.value.destCreateMode === 'NONE' && !destExistsSafe.value) {
      warn = `⚠ 目标索引 ${form.value.destIndex} 尚不存在——将以动态映射自动创建（mapping 可能不符合预期）,建议改用「按源结构建」。`;
    }
    /* facts 抽出调用块（confirmAudit 六百字符扫描窗内保持可审计形态） */
    const facts = [
      { label: '源集群', value: srcDesc },
      { label: '源索引', value: form.value.sourceIndex },
      { label: '目标索引', value: form.value.destIndex },
    ];
    if (!await askConfirm({
      title: '启动跨集群迁移',
      message: `将从 ${srcDesc} 的 ${form.value.sourceIndex} 搬运到本集群 ${form.value.destIndex}。` + (warn ? ' ' + warn : ''),
      level: 'warn',
      okText: '启动',
      facts,
    })) return;
    await doStart();
  } finally { starting.value = false; }
}
/* F4：ES 索引名硬规则前置校验——非法字符 \ / ? " < > | , # 与大写字母在启动前
 用人话拦下，不等 bulk 跑一半才报难懂的 invalid_index_name_exception。
 （逗号一并禁止：多目标写法本向导不支持；host/凭据的 ${ENV_VAR} 引用与索引名无关。） */
function idxNameProblem(name: string): string {
  const badChar = name.match(/[\\/?"<>|,#]/);
  if (badChar) return '含非法字符 "' + badChar[0] + '"';
  if (/[A-Z]/.test(name)) return '含大写字母（ES 索引名必须小写）';
  return '';
}
const idxNameError = computed(() => {
  const sp = idxNameProblem(form.value.sourceIndex || '');
  if (sp) return '源索引名' + sp;
  const dp = idxNameProblem(form.value.destIndex || '');
  if (dp) return '目标索引名' + dp;
  return '';
});
const canStart = computed(() =>
  canDestOps.value &&
  (!connModel.value || !!srcConnId.value) &&
  (srcConnId.value || conn.value.host) && form.value.sourceIndex && form.value.destIndex &&
  (form.value.destCreateMode !== 'FROM_ENTITY' || form.value.indexKey) &&
  !idxNameError.value);
async function doStart() {
  /* 权限执行体首行门（启动钮/重试钮之外的深链/程序化通道） */
  if (!canOps.value || !canDestOps.value) { store.notify('warning', '迁移发起需要源连接与宿主目标集群的迁移写权限'); return; }
  /* starting 闸已收 openStartConfirm 本体（唯一调用点，置位前移到确认窗之前）——
 此处只保留 qr 运行态防御查；starting 置位/复位由外层 try/finally 统一承担 */
  if (qr.running.value) return;
  startErr.value = '';
  startErrRaw.value = null;
  qr.begin(); /* ：读秒计时（start 无 signal 参，不接竞态丢弃） */
  try {
    const req: any = {
      sourceIndex: form.value.sourceIndex, destIndex: form.value.destIndex,
      indexKey: form.value.indexKey || undefined,
      destCreateMode: form.value.destCreateMode, tuneMode: form.value.tuneMode,
      slices: form.value.slices || 0, batchSize: form.value.batchSize || 0,
      scrollKeepAliveSec: form.value.scrollKeepAliveSec || 0, forceMerge: form.value.forceMerge,
    };
    if (srcConnId.value) req.srcConnId = srcConnId.value;
    else req.conn = connBody();
    const r = await api.xb.start(req, srcConnId.value || undefined);
    store.notify('success', '迁移已启动: ' + (r?.jobId || ''), { action: { label: '查看进度', onClick: () => { formOpen.value = false; locateJobRow(String(r?.jobId || '')); } } });
    formOpen.value = false;
    formDraft.clear();
    loadJobs();
  } catch (e: any) {
    /* G3-B3：启动失败不再仅 toast——内联面板留全文（后端校验长错误可回看），重试重开确认弹层；
 原始对象旁路（errMeta 读 code/endpoint） */
    startErr.value = '启动失败：' + friendlyApiError(e);
    startErrRaw.value = e;
    store.notify('error', startErr.value);
  }
  finally { qr.finish(); }
}

/* 作业列表 */
const jobs = ref<any[]>([]);
/* w80：「查看进度」定位高亮——作业表通常在页下方，滚动定位该 jobId 行并挂高亮类（2.5s 自熄），
 不再是只收起表单的空操作；行未渲染（列表暂未含新作业）时静默跳过。
 换壳 QRT：data-job 属性契约不可用（内核渲染 tr），定位链改 rowClass 契约挂
 .xm-hit 类（527 深链读侧三口范式与 locateJobRow 语义原样保全）。 */
const hitJobId = ref('');
let hitTimer: any = null;
function locateJobRow(jobId: string) {
  if (!jobId) return;
  hitJobId.value = jobId; // 先挂类：.xm-hit 由 rowClass 契约依 hitJobId 渲染（旧 data-job 查询锚已随裸表退役）
  void nextTick(() => {
    const row = document.querySelector('.qrt-tbl tr.xm-hit');
    if (!row) { hitJobId.value = ''; return; } // 行未渲染（列表暂未含新作业/被过滤）：静默跳过不残留
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (hitTimer) clearTimeout(hitTimer);
    hitTimer = setTimeout(() => { hitJobId.value = ''; }, 2500);
  });
}
/* 卸载清 timer——组件销毁后定时器仍会把 hitJobId 置空一次（无害但悬空），
 卸载时显式回收 */
onBeforeUnmount(() => { if (hitTimer) clearTimeout(hitTimer); });
/* 中止撤销窗的 3s 定时器同样不得跨页存活。 */
onBeforeUnmount(() => { if (abortTimer) { clearTimeout(abortTimer); abortTimer = null; } });
const loadErr = ref('');
const loadErrRaw = ref<unknown>(null); // ：原始错误对象旁路（喂 errMeta，同 checkErrRaw）
/* G3-B1：loading 初值 true——首载未完成前不渲染空态（ B6 Watcher 范式）；
 try/finally 保证复位，轮询/手动刷新时 jobs 已有旧数据不闪骨架 */
const jobsLoading = ref(true);

/* ═══ W-C：QRT rows 型数据面 ═══
 列集：jobId（行身份+专职复制）/ 状态 / 目标索引 / 源 / 进度(=migrated 数值，Σ 聚合落此列) /
 冲突 / 错误 / 发起(epoch)。kw 过滤保留宿主侧（filteredJobs）；排序/Σ 聚合/列管理交内核
 （storage-key="xm-jobs" 记忆：排序 es_tbl_sort:xm-jobs:*、聚合 es_tbl_agg:xm-jobs）。 */
const XM_COLS = ['jobId', '状态', '目标索引', '源', '进度', '冲突', '错误', '发起'];
const jobKw = ref('');
/* 草稿恢复徽标——conn/src-conn-id/form 三把内容稿任一恢复即提示；
 list-sort 排序偏好稿随排序合并 QRT 内核（es_tbl_sort 记忆）退役，
 「清除」覆盖本页三把会话稿。 */
const xmDraftRestored = computed(() =>
  connDraft.restored.value || srcConnIdDraft.restored.value || formDraft.restored.value);
function clearDrafts() {
  connDraft.clear();
  srcConnIdDraft.clear();
  formDraft.clear();
}
const filteredJobs = computed(() => {
  const kw = jobKw.value.trim().toLowerCase();
  if (!kw) return jobs.value;
  return jobs.value.filter(j => [j.status, j.destIndex, j.sourceIndex].some(v => String(v ?? '').toLowerCase().includes(kw)));
});
const jobRows = computed(() => filteredJobs.value.map(j => [
  String(j.jobId ?? ''), j.status ?? null, j.destIndex ?? null, j.sourceIndex ?? null,
  Number(j.migrated ?? 0), Number(j.conflicts ?? 0), Number(j.errors ?? 0), j.createTime ?? null,
] as (string | number | null)[]));
/* 槽/row-actions/rowClass 里从矩阵行反查作业对象（row[0]=jobId 唯一键；DiagView row[0] 同手法） */
const jobsById = computed(() => {
  const m = new Map<string, any>();
  for (const j of jobs.value) m.set(String(j.jobId), j);
  return m;
});
function rowJob(row: any[] | undefined): any {
  return row ? jobsById.value.get(String(row[0])) : undefined;
}
/* StatusPill tone 字面量收窄（BulkEditorView statusPillCls 同法）——
 statusColor 返回 string，StatusPill 契约 tone 为五档联合 */
function statusTone(s: any): 'g' | 'y' | 'r' | 'b' | 'n' {
  return statusColor(s) as 'g' | 'y' | 'r' | 'b' | 'n';
}
/* 状态 pill title——作业 message 优先；未命中枚举（原文回显）时原文进 title 兜底 */
function xmStatusTitle(j: any): string | undefined {
  if (!j) return undefined;
  return j.message || (statusZh(j.status) ? undefined : String(j.status ?? '')) || undefined;
}
/* 527 深链定位链：rowClass 契约（内核 W-D）——命中行 tr 挂 .xm-hit（样式经 :deep 生效） */
function jobRowCls(row: any[]): string | undefined {
  return hitJobId.value && String(row?.[0]) === hitJobId.value ? 'xm-hit' : undefined;
}

/* ── 进度列观测行（主菜：耗时/速率/失败切片）——旧 JSON 无新字段全静默降级 ── */
function elapsedMsOf(j: any): number | null {
  if (!j?.startedAtMs) return null; // 旧文档无 startedAtMs：不显耗时（不假装已知）
  return Math.max(0, (j.finishedAtMs ?? Date.now()) - j.startedAtMs);
}
/* 人话化：＜1s / 42s / 3m05s / 2h05m / 1d3h */
function humanElapsed(ms: number): string {
  if (ms < 1000) return '<1s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm' + String(s % 60).padStart(2, '0') + 's';
  const hr = Math.floor(m / 60);
  if (hr < 24) return hr + 'h' + String(m % 60).padStart(2, '0') + 'm';
  return Math.floor(hr / 24) + 'd' + (hr % 24) + 'h';
}
/* 速率 = ΣsliceMigrated / 耗时秒（任务书口径）；耗时不足 1s 或零搬运不出（防除零与抖动） */
function rateOf(j: any): number | null {
  const ms = elapsedMsOf(j);
  if (!ms || ms < 1000) return null;
  const done = Object.values(j?.sliceMigrated || {}).reduce((s: number, v) => s + (Number(v) || 0), 0);
  return done > 0 ? Math.round(done / (ms / 1000)) : null;
}
/* 失败切片红 chip：sliceErrors 有值的切片（sliceId, 次数）；无字段/无值返回空=不渲染 */
function sliceFailChips(j: any): { id: string; n: number }[] {
  const se = j?.sliceErrors;
  if (!se) return [];
  return Object.entries(se)
    .filter(([, n]) => Number(n) > 0)
    .map(([id, n]) => ({ id, n: Number(n) }));
}

/* 切片 checkpoint 观测段——sliceStatus 聚合人话「已完成 x/y 片」；有 FAILED/ABORTED
 切片附「中断于 slice N（共 M 片）」。后端零改（sliceStatus Map 既有数据，后端 SLICE_*
 PENDING/RUNNING/DONE/FAILED 四档；ABORTED 为防御档），MetaStrip text 段并入 progressMeta
 输出链（不新增独立行容器）；旧 JSON 无字段/空 Map 静默降级不显（529 观测行同口径）。 */
function sliceCheckpointMeta(j: any): MetaStripItem | null {
  const ss = j?.sliceStatus as Record<string, string> | null | undefined;
  if (!ss || typeof ss !== 'object') return null;
  const entries = Object.entries(ss);
  if (!entries.length) return null;
  const total = entries.length;
  const done = entries.filter(([, v]) => v === 'DONE').length;
  const failed = entries.find(([, v]) => v === 'FAILED' || v === 'ABORTED');
  return { text: failed
    ? `已完成 ${done}/${total} 片，中断于 slice ${failed[0]}（共 ${total} 片）`
    : `已完成 ${done}/${total} 片` };
}

/* 进度 meta → MetaStrip items（tone 分档：运行中 info / 完成 ok / 其余中性灰）。
 文案与原手滚 mono 串逐字对位（「迁移中 N 条（总量未知）」/「N/T（P%）」）；
 total 未知时段 tip 说明「不冒充 0%」的降级口径，显示层换壳、数据与导出零触碰。
 尾随并入 checkpoint 观测段（sliceCheckpointMeta，两分支统一并链）。
 P2：尾随再并入 ETA 段（etaMeta，MetaStrip value+label 形态 tone=info；
 速率缺失/非正、total 未知、余量非正一律不出=不冒充，rateOf 既有差分件零触）。 */
function etaMeta(j: any): MetaStripItem | null {
  const rate = rateOf(j);
  if (!rate || rate <= 0 || !j?.total) return null;
  const remain = Number(j.total) - Number(j.migrated || 0);
  if (!Number.isFinite(remain) || remain <= 0) return null;
  return {
    value: humanElapsed(Math.round((remain / rate) * 1000)),
    label: '预计剩余',
    tone: 'info',
    tip: '预计剩余 =（total − migrated）/ 速率（ΣsliceMigrated/耗时，估算值随波动刷新）',
  };
}
function progressMeta(j: any): MetaStripItem[] {
  if (!j) return [];
  const cp = sliceCheckpointMeta(j);
  const eta = etaMeta(j);
  if (indeterminate(j)) {
    return [
      ...(j.status === 'RUNNING' ? [{ text: '迁移中' }] : []),
      {
        value: fmtNum(j.migrated),
        unit: '条（总量未知）',
        tone: j.status === 'RUNNING' ? 'info' : undefined,
        tip: '总量未回传，进度不可判定（不冒充 0%）',
      },
      ...(cp ? [cp] : []),
      ...(eta ? [eta] : []),
    ];
  }
  return [{
    value: fmtNum(j.migrated),
    unit: '/' + (j.total != null ? fmtNum(j.total) : '?') + '（' + pctOf(j) + '%）',
    tone: j.status === 'RUNNING' ? 'info' : j.status === 'DONE' ? 'ok' : undefined,
  }, ...(cp ? [cp] : []), ...(eta ? [eta] : [])];
}

/* 世代守卫：刷新/重试/操作成功回调/轮询 tick/深链多通道可并发入列，每拍入列即
 取得唯一落案权——慢拍旧回包不得覆写新拍列表、旧拍失败不得把新拍成功面改写成
 错误条、骨架闸只归最新拍收（互斥裸闸不可用：会拦死首载与深链 reentry） */
let jobsSeq = 0;
async function loadJobs() {
  // 后端异常/权限不足时可能回 null/对象，归一成数组防 jobRows 展开报错
  const seq = ++jobsSeq;
  jobsLoading.value = true;
  try {
    /* 连接模型未选源连接即引导，不发必败请求：作业列表按源连接档案判权拉取
       （api 层随 X-Es-Target），未选源连接回落宿主必 403——连接检查/取配置的
       「连接模型下必须选择已授权的源连接档案」同款前置口径；引导走既有错误条
       （选中源连接后的刷新/轮询照常走下方请求分支并复位） */
    if (connModel.value && !srcConnId.value) {
      loadErr.value = '请先选择源连接：迁移作业列表按所选源连接加载';
      loadErrRaw.value = null;
      return;
    }
    const r = await api.xb.jobs(30, srcConnId.value || undefined);
    if (seq !== jobsSeq) return; // 已有更新拍入列：本拍整拍作废，不动任何状态
    jobs.value = Array.isArray(r) ? r : [];
    loadErr.value = '';
    loadErrRaw.value = null;
  } catch (e: any) {
    if (seq !== jobsSeq) return; // 旧拍失败同样丢弃：不得把新拍成功面改写成失败
    /* toast 轰炸防御——轮询修好后后端故障期会每 3s 轰一次 notify；改仅首败
 toast（OverviewView:202-），err-bar 常驻承担可见性。loadErr 语义=失败
 标记：下一轮成功复位（上方 try 内既有 ''），恢复后再遇新故障才再报 */
    const firstFail = !loadErr.value;
    loadErr.value = '加载迁移作业失败：' + friendlyApiError(e);
    loadErrRaw.value = e; /* ：原始对象旁路（errMeta 读 code/endpoint） */
    if (firstFail) store.notify('error', loadErr.value);
  } finally { if (seq === jobsSeq) jobsLoading.value = false; }
}
/* ?jobId= 深链读侧（此前跳转裸 push('/xmigrate') 只能落作业表顶部——526 遗留收口）。
 读侧三口范式同 AdhocRebuildView ?index=：① 挂载 ② onActivated（KeepAlive 回流口——本页暂不在
 App.vue 白名单，入名单前先备好消费口）③ watch（SPA 内同页重入，组件实例复用、onMounted 不再跑，
 仅在 jobId「从无到有/值变化」时消费，消费后的摘除不回环）；loadJobs 后 locateJobRow 定位+行强调
 （行未渲染/被 kw 过滤时静默跳过——locateJobRow 既有语义）；消费后历史 replace 只摘 jobId——
 刷新/回退不再重定位（AdhocRebuild 一次性上下文用后即清同款） */
const route = useRoute();
/* 消费口世代：挂载/KeepAlive 回流/watch 三口可并发入列，旧口在 await loadJobs 期间
 被新口顶替后，定位与摘链权整体让位（行高亮与 URL 清理都只归最新口） */
let dlSeq = 0;
async function consumeJobDeepLink() {
  const q = route.query.jobId;
  const jobId = Array.isArray(q) ? String(q[0] ?? '') : q != null ? String(q) : '';
  const seq = ++dlSeq;
  await loadJobs();
  if (seq !== dlSeq) return; // 已有更新消费口入列：定位与摘链权让位
  if (!jobId) return;
  locateJobRow(jobId);
  const rest = { ...route.query };
  delete rest.jobId;
  router.replace({ query: rest }).catch(() => {});
}
/** 1125：挂载期读取（作业清单/目标索引清单/indexKey）同样要过身份门——
    宿主换 token 的窗口里 probed 未落地，旧 target 与上一账号的作业行会先拉回来。
    与 DslQuery autoRunAllowed 同口径；不放行则挂起，身份落地补跑。 */
const xmReady = () => auth.authDisabled || !auth.probeStarted
  || (auth.probed && auth.me != null && auth.canReadPage('xmigrate', store.target));
let xmPendingBoot = false;
async function bootReads() {
  consumeJobDeepLink(); /* 首载（无 ?jobId= 时即普通 loadJobs） */
  store.loadConns(); // ：连接下拉数据源
  // 目标索引补全清单：迁移写入端（宿主）索引，拿不到不阻塞（纯补全增强）。
  // 静默吞改可见提示：清单恒按宿主控制面授权（api 层固定 X-Es-Target=host），
  // 纯连接授权拿不到属预期——降级不阻断迁移主流程，但缺清单要让用户知道原因。
  api.xb.destIndices().then(list => { hostIndices.value = list || []; }).catch((e: any) => {
    store.notify('warning', '目标索引清单加载失败（需宿主或静态页授权，目标索引列表不可用）：' + friendlyApiError(e));
  });
  /* 装载即排序（字母序 + 最近选用置顶，见 sortKeyOpts） */
  try { keyOpts.value = sortKeyOpts((await api.keys()).map((k: string) => ({ label: k, value: k }))); }
  catch (e: any) { store.notify('warning', 'indexKey 清单加载失败（不影响手输）：' + friendlyApiError(e)); } /* w80：裸 e.message → friendlyEsError */
}
onMounted(() => {
  if (xmReady()) void bootReads();
  else xmPendingBoot = true;
});
watch(() => [auth.probed, auth.authDisabled, auth.me?.username, store.target], () => {
  if (!xmPendingBoot || !xmReady()) return;
  xmPendingBoot = false;
  void bootReads();
});
/* 深链第二/三口——KeepAlive 回流与 SPA 内重入共用 consumeJobDeepLink（见上注） */
onActivated(() => { consumeJobDeepLink(); });
watch(() => route.query.jobId, (nv, ov) => {
  if (nv === ov) return;
  if (nv) consumeJobDeepLink();
});
/* 联动性：迁移完成一键去查询工作台验证目标索引——
 与托管重建「去查询验证」同一深链模式（store.pick 全局选中 + idx query） */
async function goVerify(j: any) {
  if (j.destIndex) store.pick(j.destIndex);
  router.push({ path: '/search', query: j.destIndex ? { idx: j.destIndex } : {} });
  /* 目标索引存在性预检——DONE 任务的 dest 可能事后被删（r98 案实证），
 提前警示防「跳过去才看到 404」；清单拉取失败不阻断跳转主流程。 */
  try {
    const list: any[] = (await api.clusterIndices()) || [];
    const names = list.map((x: any) => x?.index ?? x?.name ?? x);
    if (j.destIndex && !names.includes(j.destIndex)) {
      store.notify('warning', `目标索引「${j.destIndex}」在宿主集群已不存在（可能迁移后被删除），查询将报 404`);
    }
  } catch { /* 预检失败不打扰跳转 */ }
}
/* ═══ ：作业行菜单（dbx 行菜单）——复制 jobId/作业信息；
 换壳 QRT：行级 contextmenu 让位内核列管理（全站 QRT 消费方一致口径），
 菜单入口改行尾菜单钮（左键/右键皆开）；「展开详情」条目退役——行展开由内核行尾钮/
 焦点行 E 键承接（TableExpandRow，宿主不可程序化控制）；列管理白得内核 ColPicker ═══ */
const jobMenu = ref<{ x: number; y: number; job: any } | null>(null);
function copySrc(row: any) {
  const j = rowJob(row);
  void copyText(j?.sourceIndex + ' ← ' + j?.remoteEndpoint).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制源信息' : '复制失败'));
}
function openJobMenu(e: MouseEvent, job: any) {
  /* 键盘 Enter 激活按钮走原生 click，坐标是 0,0——落锚回退到按钮盒 */
  const at = e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : menuKeyAnchor(e);
  jobMenu.value = { ...at, job };
}
function onJobMenuKey(e: KeyboardEvent, job: any) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  jobMenu.value = { ...menuKeyAnchor(e), job };
}
const jobMenuItems = computed(() => {
  const m = jobMenu.value; if (!m) return [];
  const j = m.job;
  const facts = `jobId=${j.jobId} status=${j.status} dest=${j.destIndex || '-'} source=${j.sourceIndex || '-'} migrated=${j.migrated ?? '?'}/${j.total ?? '?'} conflicts=${j.conflicts ?? 0} errors=${j.errors ?? 0}`;
  return [
    { key: 'copy-id', label: '复制 jobId', icon: Copy, run: () => copyJobId(j.jobId) },
    { key: 'copy-row', label: '复制作业信息', icon: ClipboardCopy, run: async () => {
      const ok = await copyText(facts);
      store.notify(ok ? 'success' : 'error', ok ? '已复制作业信息' : '复制失败');
    } },
    /* 以此作业新建迁移（只增项不改既有项——xmigrateRowMenu 字面锁零触），
 回填逻辑见 newMigrationFromJob */
    { key: 'new-from-job', label: '以此作业新建迁移', icon: Rocket, run: () => newMigrationFromJob(j) },
  ];
});

/* ═══ ：以作业为模板新建迁移 ═══
 job doc 自持 sourceIndex/destIndex/remoteEndpoint（resume 弹窗同源读法），回填
 「1 连接旧集群」（remoteEndpoint 解析 + 命中已存连接档案则选档案，明文不经前端；
 手动回退时密码不回填——凭据不自持不猜）与「2 源索引」「3 目标索引」；
 策略字段（建索引方式/调优档/高级参数）job doc 不自持 → 置 XM_FORM_DEFAULT 默认并以
 toast 说明，让用户显式确认后再启动。本页向导无独立 step 变量，表单三组即向导——
 formOpen 强制展开即「回到第一步」。换源即失效语义随选档案/手动切换一并触发
 （onSrcConnChange 清旧清单与预览，既有口径）。 */
function newMigrationFromJob(j: any) {
  jobMenu.value = null;
  const m = String(j.remoteEndpoint || '').match(/^(https?):\/\/([^:]+):(\d+)/);
  const hit = m ? store.conns.find(c => c.scheme === m[1] && c.host === m[2] && String(c.port) === m[3]) : undefined;
  if (hit) {
    const changed = srcConnId.value !== hit.id;
    srcConnId.value = hit.id;
    if (changed) onSrcConnChange();
  } else if (m) {
    if (srcConnId.value) { srcConnId.value = ''; onSrcConnChange(); }
    conn.value = { scheme: m[1], host: m[2], port: Number(m[3]), username: conn.value.username || '', password: '' };
  }
  form.value.sourceIndex = j.sourceIndex || '';
  form.value.destIndex = j.destIndex || '';
  form.value.destCreateMode = XM_FORM_DEFAULT.destCreateMode;
  form.value.tuneMode = XM_FORM_DEFAULT.tuneMode;
  formOpen.value = true;
  store.notify('info', `已按作业 ${j.jobId || ''} 回填源/目标索引${hit ? '与连接档案' : m ? '与连接信息' : ''}；建索引方式/迁移速度不随作业保存，已重置默认，请确认后启动`);
}

/* 导出行集：QRT 排序/过滤后的可见行（所见即所复）——经 expose.getSortedRows 拿排序后
 矩阵再反查作业对象；内核未就绪时回退宿主过滤行集（保底，正常路径不走） */
const qrtRef = ref<InstanceType<typeof QueryResultTable> | null>(null);
function exportRows(): any[] {
  const matrix = qrtRef.value?.getSortedRows?.() as any[][] | undefined;
  const src = matrix && matrix.length ? matrix : jobRows.value;
  return src.map(r => rowJob(r)).filter(Boolean);
}

/* 导出可见作业为 TSV（Excel 可直接粘贴） */
async function exportTsv() {
  const rows = exportRows();
  if (!rows.length) { store.notify('warning', '无表格结果可导出'); return; }
  const header = ['jobId', 'status', 'destIndex', 'sourceIndex', 'remoteEndpoint', 'migrated', 'total', 'pct', 'conflicts', 'errors', 'createTime'];
  const lines = [header.join('\t')];
  for (const j of rows) {
    lines.push([
      j.jobId || '', j.status || '', j.destIndex || '', j.sourceIndex || '', j.remoteEndpoint || '',
      j.migrated ?? '', j.total ?? '', pctOf(j), j.conflicts ?? 0, j.errors ?? 0,
      /* 本地时区格式化（fmtTime 钉死 Asia/Shanghai），不用 toISOString——UTC 会让 Excel 里的时间差 8 小时 */
      j.createTime ? fmtTime(j.createTime) : '',
    ].map(v => String(v).replace(/[\t\r\n]/g, ' ')).join('\t'));
  }
  const ok = await copyText(lines.join('\n'));
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${rows.length} 行 TSV 到剪贴板` : '复制失败');
}
/* 迁移任务 Markdown 表（群聊/工单跟催直贴；行序=QRT 排序后所见即所得） */
async function exportMd() {
  const rows = exportRows();
  if (!rows.length) { store.notify('warning', '无表格结果可导出'); return; }
  const esc = (v: any) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const md = [
    '| jobId | 状态 | 目标索引 | 迁移/总量 | 进度 | 冲突 | 错误 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(j => `| \`${esc(j.jobId)}\` | ${esc(j.status)} | \`${esc(j.destIndex)}\` | ${fmtNum(j.migrated)} / ${j.total ? fmtNum(j.total) : '未知'} | ${pctOf(j)}% | ${j.conflicts ?? 0} | ${j.errors ?? 0} |`),
  ].join('\n');
  const ok = await copyText(md);
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${rows.length} 行（Markdown）` : '复制失败');
}
/* total 未知（后端未回传或总量为 0）→ 进度不可判定，不再渲染误导性「0%」 */
function totalUnknown(j: any): boolean {
  return !j.total;
}
function indeterminate(j: any): boolean {
  return totalUnknown(j) && j.status !== 'DONE';
}
function pctOf(j: any): number {
  if (totalUnknown(j)) return j.status === 'DONE' ? 100 : 0;
  return Math.min(100, Math.round(((j.migrated || 0) / j.total) * 100));
}
/* W1 的 tfoot Σ 聚合随壳合并 QRT 内建（useAggRow：列头菜单「聚合行」开关，
 es_tbl_agg:xm-jobs 记忆；Σ 作用于过滤后集合——宿主传入的 jobRows 已过滤） */

/* RUNNING 轮询合并 useAutoRefresh——KeepAlive/页面隐藏/卸载全链停续
 （此前裸 setInterval 在后台标签页照跑）；guard 验 running 状态（本视图无 loading 锁）。
 轮询静默修复（件）——ms getter 只在 start() 采样一次
 （useAutoRefresh 契约「间隔变更由调用方重启」）：零 RUNNING 挂载时不排表，首作业转
 RUNNING 后无人重启 → 轮询永不启动；RUNNING 中挂载转终态同理永不停表。抽 hasRunningJob
 computed + watch → restart() 双向接线（转 RUNNING 启表、转终态停表，启停判据与 ms
 同源；OverviewView 每轮 restart 先例）。不新增 setOn（ 总数 13 守恒） */
const hasRunningJob = computed(() => jobs.value.some(j => j.status === 'RUNNING'));
const xmRefresher = useAutoRefresh(loadJobs, {
  ms: () => (hasRunningJob.value ? 3000 : 0),
});
xmRefresher.setOn(true);
watch(hasRunningJob, () => xmRefresher.restart());

/* abort / resume */
const actJob = ref<any>(null);
const resumeOpen = ref(false);
const resumeConn = ref<any>({ scheme: 'http', host: '', port: 9200, username: '', password: '' });
const resumeConnId = ref('');
/* W4：中止确认直挂 ConfirmModal 合并 askConfirm——warn 级白得
 dismissable（已有 3s 撤销窗兜底、已搬运数据保留，适合会话级防呆）。
 闸读收本体首行+置位前移到确认窗之前：挂起期间中止钮即禁用，二击不再穿透双开确认窗；
 取消路径 finally 复位防闸死——提交路径 submitted 守护外层不复位，aborting 钉到
 API 落定（复位权在撤销回调与延时回调） */
async function askAbort(j: any) {
  if (aborting.value) return;
  aborting.value = true;
  let submitted = false;
  try {
    actJob.value = j;
    if (!await askConfirm({
      title: '中止迁移',
      message: `将中止作业 ${j.jobId} 并还原目标索引 settings。已搬运数据保留。确认后仍有 3 秒撤销窗。`,
      level: 'warn',
      okText: '中止',
      dismissable: true,
    })) return;
    await doAbort();
    submitted = true;
  } finally {
    if (!submitted) aborting.value = false;
  }
}
function askResume(j: any) {
  actJob.value = j;
  const m = String(j.remoteEndpoint || '').match(/^(https?):\/\/([^:]+):(\d+)/);
  if (m) resumeConn.value = { scheme: m[1], host: m[2], port: Number(m[3]), username: '', password: '' };
  // 端点匹配到已存档案则默认选中（少一次手输），匹配不到回退手动
  resumeConnId.value = (connModel.value && j.srcConnId)
    ? String(j.srcConnId).trim()
    : ((m && store.conns.find(c => c.scheme === m[1] && c.host === m[2] && String(c.port) === m[3])?.id) || '');
  resumeOpen.value = true;
}
/* aborting 闸收 askAbort 本体（置位前移到确认窗之前，唯一调用点已闸）：生命周期按
 「从确认起钉住到 API 落定（含 3s 撤销窗）」——复位权在撤销回调、延时回调与外层取消
 分支；双击确认/重复开弹窗不会重复排第二个 setTimeout；中止钮 :disabled+spinning 同形 */
const aborting = ref(false);
let abortTimer: any = null;
async function doAbort() {
  /* 权限执行体首行门（行级中止钮已有 v-if，此处覆盖菜单/程序化通道） */
  if (!canJobOps(actJob.value)) { store.notify('warning', '迁移操作需专项或 ADMIN 角色'); return; }
  const job = actJob.value;
  if (!job) return;
  const jobId = job.jobId;
  let cancelled = false;
  store.notify('info', `将于 3s 后中止 ${jobId}`, {
    duration: 3000,
    action: { label: '撤销', onClick: () => { cancelled = true; aborting.value = false; store.notify('info', '已撤销中止'); } }
  });
  if (abortTimer) clearTimeout(abortTimer);
  abortTimer = setTimeout(async () => {
    abortTimer = null;
    if (cancelled) return;
    /* 离页/降权后不补发：定时窗口内权限可能已变，发车前再判一次执行体。 */
    if (!canJobOps(job)) { aborting.value = false; return; }
    try {
      await api.xb.abort(jobId, job.srcConnId || undefined);
      store.notify('success', '已中止 ' + jobId);
      loadJobs();
    } catch (e: any) { store.notify('error', '中止失败: ' + friendlyApiError(e)); } /* w80：裸 e.message → friendlyEsError */
    finally { aborting.value = false; }
  }, 3000);
}
async function copyJobId(id: string) {
  const ok = await copyText(id);
  store.notify(ok ? 'success' : 'error', ok ? '已复制 jobId' : '复制失败');
}
/* 提交防重（INTERACTION 范式）：续跑是写操作，在途时双击/Enter 重复下发直接短路 */
const resuming = ref(false);
async function doResume() {
  /* 权限执行体首行门（续跑钮已有 v-if，此处覆盖弹窗 Enter/程序化通道） */
  if (!canJobOps(actJob.value) || !canDestOps.value) { store.notify('warning', '续跑需要源连接与宿主目标集群的迁移写权限'); return; }
  if (connModel.value && actJob.value?.srcConnId
    && String(resumeConnId.value || '').trim() !== String(actJob.value.srcConnId).trim()) {
    store.notify('warning', '续跑必须使用该作业的源连接档案');
    return;
  }
  if (resuming.value) return;
  resumeOpen.value = false;
  resuming.value = true;
  try {
    const c: any = { scheme: resumeConn.value.scheme, host: resumeConn.value.host, port: resumeConn.value.port || 9200 };
    if (resumeConn.value.username) c.username = resumeConn.value.username;
    if (resumeConn.value.password) c.password = resumeConn.value.password;
    await api.xb.resume(actJob.value.jobId, resumeConnId.value ? {} : c, resumeConnId.value || undefined);
    store.notify('success', '已续跑 ' + actJob.value.jobId);
    loadJobs();
  } catch (e: any) { store.notify('error', '续跑失败: ' + friendlyApiError(e)); } /* w80：裸 e.message → friendlyEsError */
  finally { resuming.value = false; }
}
/* 续跑凭据弹窗 Enter=提交（can 门与主按钮 disabled 同口径——resuming 在途不放行，
 原注释「首行即关弹窗天然防连按」不够：resume 已关但 API 在途时再按 Enter 仍会重复下发） */
useModalEnter(resumeOpen, doResume, () => !resuming.value && canJobOps(actJob.value) && canDestOps.value);
</script>

<style scoped>
.xm { display: flex; flex-direction: column; gap: var(--sp-3); position: relative; }
/* 页根 gap 承担区块间距，PageHeader 自带 margin-bottom 归零（AdhocRebuildView 同款） */
.xm > .ph { margin-bottom: 0; }
/* P2：执行进度条（ind-bar 全站范式，DevTools dt-progress 同款 absolute 零高度占位） */
.xm-progress { position: absolute; top: 0; left: 0; right: 0; color: var(--ac); }
/* 新建迁移 .card 壳退役 → border-top 分节（下方 .xm-res 同语言）——
 卡 padding 由 .xm-new-t 落位类与 draft-row/form/cfg/actions 落位 margin 承接（盒模型等值）；
 与作业列表分节的块间距仍由页根 .xm flex gap 承担 */
.xm-new { border-top: 1px solid var(--border); }
.xm-new-t { padding: var(--sp-3) var(--sp-4) 0; }
.xm-sk { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-3) var(--sp-4); }
.xm-conn-err { margin-top: var(--sp-2); }
.xm-cfg-err { margin-top: var(--sp-2); }
/* 壳 padding 退役，左右落位 margin 承接（err 红框语义零触，只动定位） */
.xm-start-err { margin: var(--sp-3) var(--sp-4) 0; }
.xm-src-pick { display: flex; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-3); }
.xm-src-pick > label { font-size: var(--fs-sm); color: var(--tx1); flex-shrink: 0; }
/* .xm-src-picked border 盒退役——选中态回显降为 inline 行（.xm-conn flex 骨架承担，
 凭据说明/检查钮原位），类保留作 DOM 锚 */
/* w80：逐字拷贝 ClusterSwitcher 的 .cs-hdot 三条改本地语义类——模板已用 .xm-hdot，
 本页不引该组件，不再借他页类名（视觉等价：中性点/绿点/红点三态） */
.xm-hdot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: var(--tx2); opacity: .55; }
.xm-hdot.green { background: var(--ok); opacity: 1; box-shadow: 0 0 0 3px var(--ok-line); }
.xm-hdot.red { background: var(--err); opacity: 1; box-shadow: 0 0 0 3px var(--err-line); }
.xm-paste { display: flex; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.xm-conn { display: flex; gap: var(--sp-2); align-items: center; flex-wrap: wrap; }
.xm-tip { font-size: var(--fs-xs); color: var(--tx2); margin-top: var(--sp-2); }
/* w59:分组步骤式布局。：三分节去 background 降视觉重量（组壳原 --bg1 底与卡片
 --bg0 叠两层灰阶，编号+边框已足够承载 1/2/3 步骤语义；边框与编号原样保留）。
 分节降层下半刀——border 壳退役，分节改 border-top 行首分隔+sec-t 标题档
 （IndexHub ih-op-sec/DevTools dt-hist 同语言；常规流零高度链）。
 531 旧 border 盒死规则（本行一直被下行覆盖压死）退役删除——
 / rebuildFlat534:94 两处 531 字面锁同步更新（死规则退役改 not 锚） */
.xm-group { margin-bottom: 0; padding: var(--sp-2) 0 0; border: 0; border-top: 1px solid var(--line); border-radius: 0; }
/* 三步向导全宽纵排——.xm-form 2 列 grid 下三组呈之字排布，grid-column 全宽让
 连接/选源/定目标三组阅读顺序归位；独立规则追加（上方锁面字面零触），.xm-cfg-grid 双列保留 */
.xm-group { grid-column: 1 / -1; }
/* 分节标题形态归全局 .sec-t（fs-sm/600/tx1），本类只留 flex 排布与编号落位 */
.xm-g-hd { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2); }
.xm-g-num { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: var(--ac); color: var(--bg0); font-size: var(--fs-xs); font-weight: 650; }
.xm-hint-line { font-size: var(--fs-xs); color: var(--muted); padding: var(--sp-1) 0; }
.xm-inline { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.xm-inline-lb { font-size: var(--fs-xs); color: var(--tx2); white-space: nowrap; min-width: 72px; }
.xm-key-row { padding: var(--sp-1) 0; }
.xm-adv-details { margin-top: var(--sp-1); }
.xm-adv-details summary { font-size: var(--fs-xs); color: var(--muted); cursor: pointer; padding: var(--sp-1) 0; }
.xm-adv-details[open] summary { color: var(--tx1); }

/* w59:受控下拉(替代 datalist — 位置/大小可控,有过滤)。
 w80:原「.xm-f-row position:relative 与 display:flex 分居两处双定义」合并为一条;
 `.xm-f-row > label` 死规则删除(表单行子标签早已改 span.xm-inline-lb,label 子元素零引用) */
.xm-f-row { position: relative; display: flex; align-items: center; gap: var(--sp-3); }
.xm-drop {
  /* z 档位说明：50=页内局部层级——只盖同卡片表单流的就地 absolute 下拉，
 不出页、不与全局浮层阶梯（--z-popover 1150 / --z-ctx 1200 右键菜单档）争层；
 层级语义不同，勿硬归 --z-* token */
  position: absolute; top: 100%; left: 0; right: 0; z-index: 50;
  max-height: 200px; overflow-y: auto;
  background: var(--bg0); border: 1px solid var(--line); border-radius: var(--r-s);
  box-shadow: var(--shadow-pop);
}
.xm-drop-item { padding: 5px var(--sp-2h); font-size: var(--fs-sm); cursor: pointer; }
/* usePopupList 骨架高亮行（原仅 :hover，键盘 ↑↓ 候选不可见）——色档同 hover。
 fallback 硬编码退役 → var(--hl-soft) 裸 token（主题换肤/浅色档不脱钩，纯等值） */
.xm-drop-item:hover, .xm-drop-item.act { background: var(--hl-soft); color: var(--ac); }
.xm-drop-more { padding: var(--sp-1) var(--sp-2h); font-size: var(--fs-2xs); color: var(--muted); border-top: 1px solid var(--line); }
.xm-idx-inp { width: 100%; }
/* 草稿恢复徽标行（AdhocRebuildView ar-draft-row 同款形态）；：壳 padding
 退役，落位 margin 承接左右留白（顶距近似原卡 padding-top，底距保分节间距） */
.xm-draft-row { margin: var(--sp-2) var(--sp-4) var(--sp-2); }

/* .xm-remote border 盒退役→border-top 分节分隔+sec-t 标题档（与 xm-group 同刀；
 900 档 `.xm-remote { padding: var(--sp-2); }` 字面被 锁保留——窄档仅有
 轻微内衬，宽档行内裸排） */
.xm-remote { margin-top: var(--sp-3); border: 0; border-top: 1px solid var(--line); padding: var(--sp-2) 0 0; }
.xm-r-t { margin-bottom: var(--sp-2); display: flex; align-items: center; gap: var(--sp-2); }
/* w80：.xm-r-kw 死样式删除（remoteKw 过滤输入框随双轨收敛退役，模板零引用） */
.xm-r-more { font-size: var(--fs-xs); color: var(--tx2); align-self: center; }
.xm-r-list { display: flex; flex-wrap: wrap; gap: var(--sp-2); max-height: 120px; overflow-y: auto; }
/* 壳 padding 退役，margin 左右落位承接（grid 骨架零触） */
.xm-form { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3) var(--sp-4); margin: var(--sp-4) var(--sp-4) 0; }
.xm-adv { display: flex; gap: var(--sp-3); align-items: center; flex-wrap: wrap; }
.xm-adv-f { display: flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-xs); color: var(--tx2); }
.xm-fm { display: flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-xs); color: var(--tx1); }
/* 壳 padding 退役，margin 左右落位承接 */
.xm-cfg { margin: var(--sp-3) var(--sp-4) 0; }
.xm-cfg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3); margin-top: var(--sp-3); }
/* 源配置预览两块只读 JsonArea 摘默认框（.ja 的 border/radius 双层框感剥掉，
 deep(.ja) 全站口径——DQ :2181/IH :2181/AR :2；JsonArea 组件本体零触，
 视图 style 追加独立规则；只读预览贴分节底直排） */
.xm-cfg-grid :deep(.ja) { border: none; border-radius: 0; }
/* P2：.xm-cfg-t 类型归全局 .sec-t（fs-sm/600/tx1，.xm-g-hd 先例同款），本类只留落位 */
.xm-cfg-t { margin-bottom: var(--sp-1); }
/* W2：配置预览裸 pre 样式随 JsonArea 接线退役（外壳/工具行/高度归统一件，类名字面随锁规避） */
/* 壳 padding 退役，margin 四向落位承接（右下留白归位） */
.xm-actions { margin: var(--sp-4) var(--sp-4) var(--sp-3); display: flex; justify-content: flex-end; }
/* F4：启动按钮左侧的内联校验红字（margin-right:auto 把按钮推回右侧） */
.xm-idx-err { margin-right: auto; align-self: center; font-size: var(--fs-sm); color: var(--err); }
/* ── 换壳 QRT 后的作业表样式（表骨架/行高/展开行归内核）── */
/* 作业列表包裹壳（.card + padding:0/overflow:hidden 内联）退役 → border-top
 分节（538 .sy-res / 546 .bw-res 同语言）；card-t 原内联 padding 迁落位类（盒模型尺寸零变动） */
.xm-res { border-top: 1px solid var(--border); }
.xm-res-t { padding: var(--sp-3) var(--sp-4) 0; }
/* 527 深链定位强调：QRT 内核渲染的 tr 不带本组件 scopeId，:deep 穿透（rowClass 契约挂类） */
.xm :deep(tr.xm-hit > td) { background: var(--hl-soft); box-shadow: inset 3px 0 0 var(--ac); }
/* 源列：原 mono-trunc 语义保留（槽内宽度受限，超出省略+title 全文） */
.xm-src-cell { display: inline-block; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; color: var(--tx1); font-size: var(--fs-xs); }
.xm-idx-go {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; padding: 0; margin-left: 5px; vertical-align: middle;
  border: 1px solid var(--line); border-radius: var(--r-xs);
  background: var(--bg1); color: var(--tx2); cursor: pointer; transition: all .12s;
}
.xm-idx-go:hover { color: var(--ac-hi); border-color: var(--ac-line); background: var(--ac-soft); }
.xm-p-track { height: 5px; background: var(--bg2); border-radius: 3px; overflow: hidden; }
.xm-p-fill { height: 100%; background: var(--ok); transition: width 500ms ease-out; }
.xm-p-fill.run { background: linear-gradient(90deg, var(--ac), var(--dv-cyan)); }
/* total 未知时的不确定态：斜纹流动 + 呼吸，代替误导性 0% 满格 */
.xm-p-indet {
  width: 100%;
  background: repeating-linear-gradient(
    -45deg,
    color-mix(in srgb, var(--ac) 65%, transparent) 0 6px,
    color-mix(in srgb, var(--ac) 28%, transparent) 6px 12px
  );
  animation: xm-indet-slide 1s linear infinite, xm-indet-breathe 1.6s ease-in-out infinite;
}
@keyframes xm-indet-slide { from { background-position: 0 0; } to { background-position: 17px 0; } }
@keyframes xm-indet-breathe { 0%, 100% { opacity: .5; } 50% { opacity: 1; } }
/* 进度 meta 换壳 MetaStrip——字号/mono/分隔归组件 .ms，wrapper 只留与进度条的
 间距（margin-top 3px 为视觉刻意值豁免保字面，--sp 梯无 3 档，与 .xm-sfails 同族）；
 原本地 xm-p-run（ac）/xm-p-ok（ok）色档规则随装退役，语义分档由 items tone（info/ok）承担 */
.xm-p-meta { margin-top: 3px; }
/* 观测行：耗时 + 速率 docs/s（旧 JSON 无新字段时不渲染）；
 margin-top 2px 合并 --sp-0 半档（ --sp 裸值合并） */
.xm-p-obs { font-size: var(--fs-2xs); color: var(--tx2); margin-top: var(--sp-0); display: flex; gap: var(--sp-1); }
/* 失败切片红 chip（sliceErrors 有值的切片）：进度列一眼锁定失败现场，不必展开 */
.xm-sfails { display: flex; flex-wrap: wrap; gap: var(--sp-1); margin-top: 3px; }
.xm-sfail { border-color: var(--err-line); color: var(--err); font-size: var(--fs-2xs); }
/* W1：作业表工具行（kw 过滤宿主侧保留；排序/Σ/列管理随壳归内核） */
.xm-jobs-tools { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-4) 0; flex-wrap: wrap; }
/* width:240px → min(240px,100%) 极窄溢出钳制（529 responsive 带兜底范式，
 AnalysisSettingsView:366 min(320px,100%) 同款；900 档 100% 独占行不变。
 改用 SFB 后类锚随 input-class 留在 input 上） */
.xm-jobs-kw { width: min(240px, 100%); }
/* SFB 胶囊壳落位宽（TasksView tv-kw-wrap 先例；box-sizing 含壳边框） */
.xm-jobs-kw-wrap { width: min(240px, 100%); box-sizing: border-box; }
.xm-jobs-hit { font-size: var(--fs-xs); }
/* G3-C2： 标准断点——双栏（表单/配置预览）堆叠为单栏 */
@media (max-width: 1100px) {
  .xm-form, .xm-cfg-grid { grid-template-columns: 1fr; }
}
/* 900 紧凑微调档（ 口径：局部紧凑微调一律 900）——连接/源选择/表单行
 窄视口允许换行不硬挤；作业表工具行 kw 输入独占一行（.xm-jobs-tools 已 wrap）。
 查漏补齐：启动行动作行允许换行（红字+按钮不硬挤）、快捷清单侧距收窄 */
@media (max-width: 900px) {
  .xm-paste, .xm-src-pick, .xm-f-row { flex-wrap: wrap; }
  .xm-jobs-kw { width: 100%; }
  .xm-jobs-kw-wrap { width: 100%; }
  .xm-actions { flex-wrap: wrap; gap: var(--sp-2); }
  .xm-remote { padding: var(--sp-2); }
}
</style>
