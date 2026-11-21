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
            <div class="xm-g-hd sec-t"><span class="xm-g-num">2</span> {{ batchMode ? '从旧集群勾选要批量迁走的索引' : '从旧集群选一个要迁走的索引' }}
              <!-- 多选批量开关：开=清单逐行勾选+目标名按前缀映射（生产一族索引同步测试环境场景）；
               关=单源向导既有行为零变化 -->
              <div class="seg" style="margin-left:auto" role="group" aria-label="多选批量模式开关">
                <button data-test="xm-batch-toggle" :class="{ on: batchMode }" :aria-pressed="batchMode ? 'true' : 'false'"
                  :title="batchMode ? '切回单索引向导' : '开启多选：勾选清单索引，目标名按「源前缀→目标前缀」映射后逐个下发'"
                  @click="toggleBatchMode">多选批量</button>
              </div>
            </div>
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
            <template v-if="!batchMode">
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
            </template>
            <!-- 批量多选：已选 chips 可单个移除 + 清单逐行勾选（NCheckbox，过滤词仍是上方源输入框值） -->
            <template v-else>
              <div v-if="batchSel.length" class="xm-batch-sel">
                <span class="dim">已选 {{ batchSel.length }}：</span>
                <span v-for="nm in batchSel" :key="nm" class="chip mono on">{{ nm }}<button class="xm-batch-x" :aria-label="'移除源索引 ' + nm" :title="'移除 ' + nm" @click="toggleBatchSel(nm)">×</button></span>
                <button class="btn sm ghost" @click="batchSel = []" title="清空全部勾选">清空已选</button>
              </div>
              <div v-if="remoteIndices.length" class="xm-remote">
                <div class="xm-r-t sec-t">快捷清单（命中 {{ batchListFiltered.length }}/{{ remoteIndices.length }}，勾选加入批量）：</div>
                <!-- 批量清单独立过滤框（单选清单仍用源输入框过滤）+ 窗口化渲染（默认 50 条+显示更多步进） -->
                <n-input v-model:value="batchListKw" size="small" clearable data-test="xm-remote-kw"
                  class="xm-remote-kw" placeholder="过滤索引名（默认显示 50 条，命中实时计数）" />
                <div class="xm-r-list">
                  <span v-for="ri in batchListShown" :key="ri.index" class="xm-batch-item">
                    <n-checkbox :checked="batchSel.includes(ri.index)" :aria-label="'勾选源索引 ' + ri.index" @update:checked="toggleBatchSel(ri.index)" />
                    <span class="mono">{{ ri.index }}</span> <span style="color:var(--tx2)">{{ fmtNum(ri['docs.count']) }}</span>
                  </span>
                  <button v-if="batchListShown.length < batchListFiltered.length" class="btn sm ghost xm-r-more-btn"
                    data-test="xm-remote-more" @click="batchListLimit += XM_REMOTE_STEP">显示更多（还有 {{ batchListFiltered.length - batchListShown.length }} 个）</button>
                </div>
              </div>
            </template>
            <div v-if="!remoteIndices.length" class="xm-hint-line">← 先点上方「连接检查」拉取旧集群索引清单,或直接手输索引名</div>
          </div>

          <!-- ── 第 3 步:定目标(宿主集群) ── -->
          <div class="xm-group">
            <div class="xm-g-hd sec-t"><span class="xm-g-num">3</span> {{ batchMode ? '在宿主集群定目标前缀（批量映射）' : '在宿主集群定一个目标索引' }}</div>
            <!-- 目标下拉同迁 usePopupList（骨架语义见源下拉处批注） -->
            <div v-if="!batchMode" class="xm-f-row" ref="dstRootEl">
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
            <!-- 批量模式：目标索引不逐个输入——「源前缀 → 目标前缀」两输入框 + 实时映射预览表。
                 映射规则=纯字符串前缀替换：源名命中源前缀则替换为「目标前缀+余段」，不命中保持原名；
                 两个前缀都留空=同名迁移。非法目标名行内红字标注且该行不进提交集 -->
            <div v-else class="xm-batch-mapbox">
              <div class="xm-f-row xm-inline xm-batch-pref">
                <span class="xm-inline-lb">源前缀</span>
                <input v-model="batchSrcPrefix" data-test="xm-batch-srcprefix" class="inp mono" spellcheck="false" autocomplete="off"
                  placeholder="如 onshore-bond-basic_（留空=全部命中）" />
                <span class="dim">→</span>
                <span class="xm-inline-lb">目标前缀</span>
                <input v-model="batchDstPrefix" data-test="xm-batch-dstprefix" class="inp mono" spellcheck="false" autocomplete="off"
                  placeholder="如 uat_onshore-bond-basic_（都留空=同名迁移）" />
              </div>
              <!-- 前缀映射预设（localStorage xm-batch-presets-v1）：NSelect 加载 / 按名保存 / 删除选中 -->
              <div class="xm-f-row xm-inline xm-batch-preset">
                <span class="xm-inline-lb">映射预设</span>
                <n-select v-model:value="batchPresetId" :options="batchPresetOpts" size="small" clearable filterable
                  placeholder="选择预设加载前缀映射" style="width:200px" data-test="xm-batch-preset-pick"
                  @update:value="onBatchPresetPick" />
                <input v-model="batchPresetName" data-test="xm-batch-preset-name" class="inp mono" spellcheck="false" autocomplete="off" placeholder="预设名" />
                <button class="btn sm ghost" data-test="xm-batch-preset-save" title="按预设名保存当前源/目标前缀映射">保存预设</button>
                <button class="btn sm ghost" :disabled="!batchPresetId" title="删除当前选中的映射预设" @click="delBatchPreset">删除预设</button>
              </div>
              <table v-if="batchMapRows.length" class="xm-batch-tbl" data-test="xm-batch-map">
                <thead><tr><th>源索引</th><th class="dim">映射</th><th>目标索引</th></tr></thead>
                <tbody>
                  <tr v-for="r in batchMapRows" :key="r.src" :class="{ 'xm-batch-bad': !!r.err }">
                    <td class="mono">{{ r.src }}</td>
                    <td class="dim">→</td>
                    <td class="mono">{{ r.dst }}<span v-if="r.err" class="xm-batch-err">{{ r.err }}（该行不提交）</span></td>
                  </tr>
                </tbody>
              </table>
              <div v-else class="xm-hint-line">← 勾选源索引后在此实时预览目标名映射</div>
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

            <!-- 高级:默认折叠——原生 details/summary 升档 CollapsePanel 统一折叠件（默认收起不变） -->
            <CollapsePanel title="高级参数（通常不需要改）" v-model:open="advOpen" class="xm-adv-details">
              <div class="xm-adv">
                <!-- 三个数值档：原生 number 升档 NInputNumber（min=0/placeholder/title 语义保留；
                     留空=null 提交侧 || 0 归一口径不变） -->
                <label class="xm-adv-f"><span>并行路数</span><n-input-number v-model:value="form.slices" :min="0" size="small" :show-button="false" placeholder="自动" class="xm-adv-i" title="sliced scroll 并行路数（留空/0=服务端默认）" style="width:72px" /></label>
                <label class="xm-adv-f"><span>批大小</span><n-input-number v-model:value="form.batchSize" :min="0" size="small" :show-button="false" placeholder="默认" class="xm-adv-i" title="每批 bulk 写入文档数（留空/0=调优档默认）" style="width:82px" /></label>
                <label class="xm-adv-f"><span>scroll 秒</span><n-input-number v-model:value="form.scrollKeepAliveSec" :min="0" size="small" :show-button="false" placeholder="默认" class="xm-adv-i" title="scroll 上下文存活秒（留空/0=调优档默认）" style="width:72px" /></label>
                <n-checkbox v-model:checked="form.forceMerge" size="small" class="xm-fm">收尾合并段</n-checkbox>
                <!-- 应用推荐：preflight.recommended 一键回填（预检未拉过则现拉一次） -->
                <button class="btn sm ghost" data-test="xm-adv-recommend" :disabled="advRecBusy"
                  title="按 preflight 预检推荐回填并行路数/批大小" @click="applyRecommended"><Wand2 :size="11" /> 应用推荐</button>
              </div>
            </CollapsePanel>
          </div>
        </div>

        <!-- 源配置预览（全模式可见：后端 fetch-config 不区分建索引模式，「已存在」模式下
	 运维同样需要拉取源 mapping/settings 与目标人工对比；原 COPY_FROM_SOURCE 分节门退役） -->
        <!-- W2：pre→JsonArea readonly 接线（「不做」裁决重估）——
	 ① readonly 通道已补（JsonArea ）；② 高度模型确定解成立：
	 rows=min(内容行数,封顶行数) → height=rows*19+16 是纯内容函数，无 DOM 测量、
	 无回写回路（红线「高度棘轮/循环扩大」不触）。「随内容生长至封顶」语义保全：
	 小配置少行、大配置封顶 10 行（10*19+16=206px ≈ 原 .xm-cfg 裸 pre 时代 max-height
	 默认 200px，行粒度取整）。拖拽 resize:vertical+pointerup 落盘（xm·cfgMaxH）随裸 pre
	 退役，__tests__ 全量 grep 无该偏好稿/裸 pre 类名的既有锁（无锁）；
	 每块新增复制钮（裸 pre时代无复制入口），Monaco 自带高亮与 JSON 校验圆点 -->
        <div class="xm-cfg">
          <button v-if="canOps" class="btn sm" :disabled="!form.sourceIndex || checking" @click="fetchCfg"><FileDown :size="11" /> {{ checking ? '拉取中…' : '拉取源 mapping/settings 预览' }}</button>
          <!-- 原始 IO 钮上移 .xm-actions 行常驻渲染——钮原被本分节 COPY_FROM_SOURCE
 v-if 包裹，NONE/FROM_ENTITY/REBUILD 三档模式下连接检查/启动迁移 IO 都入记录环
 （'/xmigrate/'）却全页无取数入口；钮形/aria/特征串零触（rawIo545 锁保全） -->
          <!-- 预览行数三档循环钮（useTierCycle 消费形态照抄 IlmView 宽/CV 高钮）——
 10/20/40 落盘键 xm.cfgRows，默认档 10=540 封顶值既有视觉零变化 -->
          <button class="btn sm ghost" :title="'配置预览行数档：' + cfgCapRows + ' 行（点击切换）'" @click="cycleCfgRows">行数</button>
          <!-- 预检报告（openStartConfirm 已拉过 preflight 后可开）：索引画像/预估/建议 -->
          <button class="btn sm ghost" data-test="xm-pf-btn" :disabled="!preflight" @click="preflightOpen = true"><FileSearch :size="11" /> 预检报告</button>
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

          <!-- 结构同步·兼容性自适应：按源索引的 mapping/settings 在宿主集群创建目标索引——
               生产→UAT 跨厂商场景里，厂商私有 settings（如 index.apack.*）与自定义分词组件在
               目标不可用时由服务端多轮试建自动剔除/降级，完成后回报告说明「剔了什么、为什么」。
               目标名默认同名/预填目标表单值（用户改过即脱离跟随）；源索引未选时入口禁用 -->
          <div v-if="canOps" class="xm-sync-row">
            <span class="xm-inline-lb">同步结构到目标</span>
            <input v-model="syncDest" data-test="xm-sync-dest" class="inp mono xm-sync-inp" spellcheck="false" autocomplete="off"
              :disabled="syncing" placeholder="目标索引名（默认与源同名）" title="在宿主集群要创建的目标索引名" @input="syncDestTouched = true" />
            <n-checkbox v-model:checked="syncAliases" size="small" data-test="xm-sync-aliases">同时迁移别名</n-checkbox>
            <Tip text="两段式：先 dryRun 预览兼容计划（每刀带理由，不落盘），再按计划创建；目标不兼容的厂商私有 settings 与分词组件自动剔除或降级，别名可选随迁；目标已存在将失败（不覆盖既有索引）" long>
              <button class="btn sm" data-test="xm-sync-btn" :disabled="!form.sourceIndex || syncing"
                @click="openSyncPreview"><ArrowRightLeft :size="11" /> {{ syncing ? '同步中…' : '预览兼容计划' }}</button>
            </Tip>
          </div>
          <!-- 请求层失败（4xx/5xx）：内联错误面板（拉取失败面板同族形态），
               服务端错误全文 +「未创建索引」如实告知，不冒充报告 -->
          <div v-if="syncErr" role="alert" class="err-bar rise-in xm-sync-err" data-test="xm-sync-err">
            <span class="xm-err-txt" v-html="errPreHtml(syncErr, errMeta(syncErrRaw))"></span>
          </div>
          <!-- 同步报告（执行结果，v2 布局）：成败徽标 + 源→目标 vendor 芯片对 + 版本对/收敛轮次 +
               planned「矩阵预剔除」/reactive「报错兜底剔除」三清单（每刀带 reason）+ advice 建议 +
               别名段 + 警告折叠；空清单不渲染空区块，零剔除显示正面态；created=false 失败头照常展示已剔除清单 -->
          <div v-if="syncReport" class="xm-sync-report" data-test="xm-sync-report" role="status">
            <div class="xm-sync-hd">
              <StatusPill :tone="syncReport.created ? 'g' : 'r'" :label="syncReport.created ? '结构已同步' : '同步未成功'" />
              <MetaStrip class="xm-sync-meta" :items="syncMetaItems" />
            </div>
            <div class="xm-plan-vendor" data-test="xm-sync-vendor">
              <span class="chip mono">{{ syncSideLabel(syncReport.source, syncReport.sourceVersion) }}</span>
              <ArrowRightLeft :size="12" class="xm-plan-var" aria-hidden="true" />
              <span class="chip mono">{{ syncSideLabel(syncReport.target, syncReport.targetVersion) }}</span>
            </div>
            <div v-if="!syncReport.created" role="alert" class="xm-sync-lasterr" data-test="xm-sync-fail">
              未创建索引<template v-if="syncReport.lastError">：{{ syncReport.lastError }}</template>
            </div>
            <template v-for="sec in syncReportSections" :key="sec.key">
              <div v-if="sec.count" class="xm-sync-sec" :data-test="'xm-sync-' + sec.key">
                <div class="xm-sync-t sec-t">{{ sec.title }} <span class="dim">（{{ sec.count }} 项）</span></div>
                <ul v-if="sec.data.removedSettings?.length" class="xm-sync-list">
                  <li v-for="s in sec.data.removedSettings" :key="s.key"><code>{{ s.key }}</code><span class="xm-sync-why">{{ s.reason }}</span></li>
                </ul>
                <ul v-if="sec.data.removedAnalysis?.length" class="xm-sync-list">
                  <li v-for="a in sec.data.removedAnalysis" :key="a.kind + ':' + a.name">
                    <StatusPill :label="a.kind" /><code>{{ a.name }}</code><span class="xm-sync-why">{{ a.reason }}</span>
                  </li>
                </ul>
                <table v-if="sec.data.downgradedFields?.length" class="xm-sync-tbl">
                  <thead><tr><th>字段</th><th>属性</th><th>降级</th><th>原因</th></tr></thead>
                  <tbody>
                    <tr v-for="d in sec.data.downgradedFields" :key="d.field + '.' + d.attr">
                      <td><code>{{ d.field }}</code></td>
                      <td><code>{{ d.attr }}</code></td>
                      <td><code>{{ d.from }}</code> → <code>{{ d.to }}</code></td>
                      <td class="xm-sync-why">{{ d.reason }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
            <div v-if="syncAdviceOf(syncReport).length" class="xm-sync-sec" data-test="xm-sync-advice">
              <div class="xm-sync-t sec-t">建议</div>
              <ul class="xm-sync-list">
                <li v-for="(a, i) in syncAdviceOf(syncReport)" :key="i">
                  <StatusPill :label="syncAdviceKindZh(a.kind)" tone="b" /><span class="xm-sync-why">{{ a.message }}</span>
                </li>
              </ul>
            </div>
            <div v-if="syncReport.aliases && (syncReport.aliases.skipped?.length || syncReport.aliases.synced?.length)"
                 class="xm-sync-sec" data-test="xm-sync-aliases">
              <div class="xm-sync-t sec-t">别名随迁 <span class="dim">（同步 {{ syncReport.aliases.synced?.length || 0 }} / 跳过 {{ syncReport.aliases.skipped?.length || 0 }}）</span></div>
              <div v-if="syncReport.aliases.synced?.length" class="xm-plan-alias-row">
                <span class="dim">已同步</span>
                <span v-for="a in syncReport.aliases.synced" :key="a" class="chip mono">{{ a }}</span>
              </div>
              <div v-if="syncReport.aliases.skipped?.length" class="xm-plan-alias-row">
                <span class="dim">已跳过</span>
                <span v-for="a in syncReport.aliases.skipped" :key="a" class="chip mono xm-plan-skip">{{ a }}</span>
              </div>
            </div>
            <CollapsePanel v-if="syncReport.warnings?.length" v-model:open="syncWarnOpen" title="同步警告"
              :count="syncReport.warnings.length" class="xm-sync-warns-cp" data-test="xm-sync-warnings">
              <ul class="xm-sync-warns">
                <li v-for="(w, i) in syncReport.warnings" :key="i">{{ w }}</li>
              </ul>
            </CollapsePanel>
            <div v-if="syncReport.created && syncAllCompatible" class="xm-sync-allpass" data-test="xm-sync-allpass">
              <CheckCircle2 :size="12" /> 全部属性兼容，未剔除任何项
            </div>
            <div v-if="syncReport.created" class="xm-sync-next">
              <button class="btn sm" data-test="xm-sync-continue" title="目标索引结构已就绪，回填目标索引后在下方启动迁移搬运数据"
                @click="continueToMigrate"><Rocket :size="11" /> 继续迁移数据</button>
            </div>
          </div>
        </div>

        <!-- G3-B3：启动失败内联面板（全文+重试）——重试重开确认弹层，warn 级确认不旁路。
 裸插值换 errPreHtml+errMeta 双参（TaskTreeView 547 口径） -->
        <div v-if="startErr" role="alert" class="err-bar rise-in xm-start-err">
          <span class="xm-err-txt" v-html="errPreHtml(startErr, errMeta(startErrRaw))"></span>
          <button v-if="canOps && canDestOps" class="btn sm" @click="openStartConfirm"><RotateCcw :size="12" /> 重试</button>
        </div>

        <div class="xm-actions">
          <!-- F4：索引名非法的内联红字——按钮 disabled 只说「点不了」，这行才说为什么
               （批量模式不读单源/单目标输入，红字不显） -->
          <span v-if="idxNameError && !batchMode" class="xm-idx-err">{{ idxNameError }}</span>
          <!-- 原始 IO 快查钮常驻位（自 .xm-cfg 分节上移，钮形/aria/特征串零触）——
 margin-right:auto 靠行首（F4 红字同语言），启动钮仍在行尾 -->
          <button class="btn sm ghost" style="margin-right:auto" aria-label="查看原始 IO（迁移接口）" title="最近一次迁移接口调用的请求/响应原文" @click="openRawIo"><Terminal :size="11" /> 原始 IO</button>
          <template v-if="!batchMode">
            <button v-if="canOps" class="btn primary" :disabled="!canStart || starting" @click="openStartConfirm">
              <Rocket :size="13" /> {{ starting ? '启动中 ' + startSecs + 's' : '启动迁移' }}
            </button>
            <span v-else class="dim" style="font-size: var(--fs-xs)">迁移发起需 REBUILD_OP/ADMIN 角色</span>
          </template>
          <template v-else>
            <!-- 批量提交：循环逐个 start（失败不中断），确认弹层先列全部映射对 -->
            <button v-if="canOps" class="btn primary" data-test="xm-batch-submit" :disabled="!canBatchStart || starting" @click="openBatchConfirm">
              <Rocket :size="13" /> {{ starting ? '下发中…' : '批量迁移 ' + batchPairs.length + ' 个' }}
            </button>
            <span v-else class="dim" style="font-size: var(--fs-xs)">迁移发起需 REBUILD_OP/ADMIN 角色</span>
          </template>
        </div>
      </template>
      <!-- 批量下发结果：表单收起后仍可见。渐进式清单（成功/失败随完成更新）+ 终态汇总 +
           失败明细可复制 + 失败行一键重下发；勾选「先同步结构」时先逐索引 dryRun 预览，
           预览完成停在 xm-batch-apply 等确认，确认后逐个创建再下发数据 -->
      <div v-if="batchResult" class="xm-batch-result" data-test="xm-batch-result" role="status">
        <b>{{ batchSummaryText }}</b>
        <button v-if="batchResult.fail.length" class="btn sm ghost" @click="copyBatchFails"><ClipboardCopy :size="11" /> 复制失败清单</button>
        <button v-if="batchResult.fail.length && batchFlowPhase !== 'previewed'" class="btn sm ghost" data-test="xm-batch-retry"
          :disabled="starting" title="对下发失败的行按保存的启动参数一键重下发" @click="retryBatchFails"><RotateCcw :size="11" /> 重试失败项</button>
        <button v-if="batchFlowPhase === 'previewed'" class="btn sm primary" data-test="xm-batch-apply"
          :disabled="starting" @click="runBatchCreateAndStart"><ArrowRightLeft :size="11" /> 按预览创建并迁移</button>
        <ul class="xm-batch-rows">
          <li v-for="r in batchResult.rows" :key="r.src" class="mono" :class="{ 'xm-batch-row-fail': r.state === 'fail' || r.state === 'create-fail' || r.state === 'preview-fail' }">
            {{ r.src }} → {{ r.dst }}：<span class="xm-batch-row-st">{{ batchRowStateText(r) }}</span>
            <span v-if="r.state === 'previewed' && (r.previewReactive || 0) > 0" class="chip xm-batch-risk" title="报错兜底剔除属高风险：目标试建时多次报错回退，建议人工核对计划">兜底 {{ r.previewReactive }} 刀</span>
          </li>
        </ul>
      </div>
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
        <!-- 历史治理（对齐 adhoc 表头清理形态）：批量清理 7 天前终态记录（确认后调批量 DELETE）；
         仅清记录，不影响 ES 索引与已迁移数据 -->
        <button class="btn sm ghost" data-test="xm-cleanup" :disabled="jobsLoading" title="清理 7 天前已结束（成功/失败/中止/中断）的迁移作业记录；进行中作业不受影响，仅清记录不影响 ES 索引" @click="doCleanupJobs"><Trash2 :size="11" /> 清理 7 天前</button>
        <button class="btn sm ghost" style="margin-left:auto" :disabled="!jobs.length" @click="exportMd" title="复制当前视图为 Markdown 表（群聊/工单直贴）"><ClipboardList :size="11" /> Markdown</button>
        <button class="btn sm ghost" :disabled="!jobs.length" @click="exportTsv" title="复制当前视图为 TSV（Excel 可直接粘贴）"><ClipboardCopy :size="11" /> 导出 TSV</button>
        <button aria-label="刷新任务列表" class="btn sm ghost" @click="loadJobs" title="刷新任务列表"><RefreshCw :size="11" /></button>
      </div>
      <!-- 健康摘要条：从已加载 jobs 前端派生（零请求）——总数/运行中/成功/失败/中止/平均速率/
           冲突总数一排统计芯片；无作业隐藏（空态由下方 EmptyState 承担，不摆一排 0） -->
      <div v-if="jobs.length" class="xm-health" data-test="xm-health" role="status" aria-label="迁移作业健康摘要">
        <span class="chip">总数 {{ jobs.length }}</span>
        <span class="chip">运行中 {{ healthSummary.running }}</span>
        <span class="chip xm-h-ok">成功 {{ healthSummary.done }}</span>
        <span class="chip xm-h-err">失败 {{ healthSummary.failed }}</span>
        <span class="chip">中止/中断 {{ healthSummary.aborted }}</span>
        <span v-if="healthSummary.avgRate != null" class="chip">平均速率 {{ fmtNum(healthSummary.avgRate) }} docs/s</span>
        <span v-if="healthSummary.conflicts" class="chip xm-h-warn">冲突总数 {{ fmtNum(healthSummary.conflicts) }}</span>
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
        <!-- 条数三档切换（选择落 localStorage 记忆；后端上限 500） -->
        <div class="seg xm-jobs-limit" role="group" aria-label="作业表加载条数档">
          <button v-for="n in JOBS_LIMIT_TIERS" :key="n" :class="{ on: jobsLimit === n }"
            :title="'加载最近 ' + n + ' 条迁移作业'" @click="setJobsLimit(n)">{{ n }}</button>
        </div>
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
          <span class="mono" @contextmenu.stop.prevent="openJobMenu($event, rowJob(row))">{{ rowJob(row)?.destIndex }}</span>
          <!-- 目标索引跳转芯片（本地集群索引， QRT 同范式）；源索引属远程集群不跳 -->
          <button class="xm-idx-go" :aria-label="'打开索引工作区：' + rowJob(row)?.destIndex" title="打开索引工作区" @click.stop="gotoIdx(rowJob(row)?.destIndex)"><ExternalLink :size="11" /></button>
        </template>
        <template #cell-源="{ row }">
          <!-- 动态拼接 title 迁 Tip 统一件（原生 title 60+ 字符禁用口径）；右键列=行作业菜单 -->
          <Tip :text="rowJob(row)?.sourceIndex + ' ← ' + rowJob(row)?.remoteEndpoint + '（点击复制）'" long>
            <span class="mono xm-src-cell" style="cursor:pointer"
              role="button" tabindex="0" :aria-label="'复制源信息：' + (rowJob(row)?.sourceIndex || '')"
              @click.stop="copySrc(row)" @keydown.enter.prevent="copySrc(row)" @keydown.space.prevent="copySrc(row)"
              @contextmenu.stop.prevent="openJobMenu($event, rowJob(row))">{{ rowJob(row)?.sourceIndex }} ← {{ rowJob(row)?.remoteEndpoint }}</span>
          </Tip>
        </template>
        <!-- 进度槽：进度条 + migrated/total meta + 观测行（耗时人话化 / sliceMigrated Σ
	 速率 docs/s / 失败切片红 chip）——旧 JSON 无新字段时全部静默降级不显（null 安全） -->
        <template #cell-进度="{ row }">
          <!-- 1122：手搓进度条（.xm-p-track/.xm-p-fill）换 ProgressTrack 统一件（size=xs 行内档）——
               不确定态/确定态/色档语义映射：total 未知=value null（光条流动）、RUNNING=primary、
               其余=success（原 .xm-p-fill 默认 ok 绿档等值）；读数口径 pctOf 不变 -->
          <ProgressTrack :value="indeterminate(rowJob(row)) ? null : pctOf(rowJob(row))"
            :max="100" size="xs" :state="progressStateOf(rowJob(row))" />
          <!-- 进度 meta 手滚 mono 串 → MetaStrip 统一件（items+tone 分档：
 运行中 info / 完成 ok / 其余中性灰；「迁移中 N 条（总量未知）」「N/T（P%）」文案语义逐字对位，
 原本地 xm-p-run/xm-p-ok 色档规则随装退役由 tone 承担） -->
          <MetaStrip class="xm-p-meta" :items="progressMeta(rowJob(row))" />
          <!-- 速率趋势线：(t, migrated) 环形缓冲序列（轮询采样），DONE/FAILED 保留最后曲线。
               单元素 v-for 充当模板局部变量：sparkOf 每行只求值一次（原 v-if 与 :data
               双调各建一次数组），引用稳定后 SparkLine 的 pts computed 不重算 -->
          <template v-for="sp in [sparkOf(rowJob(row))]" :key="'sp'">
            <SparkLine v-if="sp.length >= 2" class="xm-p-spark" :data="sp" :w="96" :h="16" />
          </template>
          <div v-if="elapsedMsOf(rowJob(row)) != null" class="xm-p-obs mono">
            <span :title="'耗时（' + (rowJob(row)?.finishedAtMs ? '已完成' : '进行中') + '）'">{{ fmtElapsed(elapsedMsOf(rowJob(row))!) }}</span>
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
        <!-- 行级行动注入位（原「操作」列合并）：详情/中止/续跑/去查询验证/复制错误样本/作业行菜单 -->
        <template #row-actions="{ row }">
          <!-- 作业详情回放（纯读，不限状态/权限）：message 全文+错误/冲突样本+逐片矩阵+savedSettings -->
          <button aria-label="作业详情：message 全文/错误与冲突样本/逐片进度/保存的 settings" class="btn sm ghost" title="作业详情：message 全文、错误与冲突样本、逐片进度、保存的 settings" @click.stop="openDetail(rowJob(row))"><FileSearch :size="11" /></button>
          <!-- 1122 运行中动态调速：RUNNING 行调 throttle 端点改写入速率（-1 恢复不限速） -->
          <button v-if="canJobOps(rowJob(row)) && rowJob(row)?.status === 'RUNNING'" aria-label="调速" class="btn sm ghost"
            title="动态调速：调整该运行中作业的写入速率（-1 恢复不限速）" data-test="xm-throttle-btn"
            @click.stop="openThrottle(rowJob(row))"><Gauge :size="11" /></button>
          <button aria-label="中止迁移：停止拉取，目标索引已写入的数据保留（不自动清理）" v-if="canJobOps(rowJob(row)) && rowJob(row)?.status === 'RUNNING'" class="btn sm danger" title="中止迁移：停止拉取，目标索引已写入的数据保留（不自动清理）" :disabled="aborting" @click.stop="askAbort(rowJob(row))"><OctagonX :size="11" :class="{ spinning: aborting }" /></button>
          <button aria-label="断点续跑" v-if="canJobOps(rowJob(row)) && canDestOps && ['FAILED','ABORTED','INTERRUPTED'].includes(rowJob(row)?.status ?? '')" class="btn sm" @click.stop="askResume(rowJob(row))" title="断点续跑"><RotateCcw :size="11" /></button>
          <!-- 联动性：迁移完成一键去查询工作台验证目标索引（对齐托管重建「去查询验证」深链） -->
          <button aria-label="去查询验证：在查询工作台打开目标索引" v-if="rowJob(row)?.status === 'DONE' && rowJob(row)?.destIndex" class="btn sm" :title="'验证迁移结果：在查询工作台打开「' + rowJob(row)?.destIndex + '」'" @click.stop="goVerify(rowJob(row))"><SearchCheck :size="11" /></button>
          <!-- 错误样本全量复制（诚实口径）——展开详情降维 JsonTree 后复制入口上移行尾 -->
          <button v-if="rowJob(row)?.errorSamples?.length" class="btn sm ghost" :aria-label="'复制全部 ' + rowJob(row)?.errorSamples.length + ' 条错误样本'"
            title="复制全部错误样本" @click.stop="copyErrSamples(rowJob(row))"><ClipboardList :size="11" /></button>
          <!-- 历史治理：行级删除仅终态行在场（进行中作业不渲染删除入口，后端也仅受理终态） -->
          <button v-if="XM_TERMINAL_STATUS.includes(rowJob(row)?.status)" aria-label="删除记录" class="btn sm ghost"
                  title="删除该作业记录（仅清记录，不影响 ES 索引与已迁移数据）"
                  @click.stop="doDeleteJob(rowJob(row))"><Trash2 :size="11" /></button>
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
      <!-- 续跑手动连接三件（host/port/用户名/密码）合并 RemoteSourceFields 统一件
       （手动输入区与本页第 1 步同语言；testable 缺省 false=无检查钮，原弹窗本就无）；
       状态仍留父侧 resumeConn（resumeConnId 选中档案时整块消隐语义不变） -->
      <div v-if="!resumeConnId">
        <RemoteSourceFields :conn="resumeConn" @update:conn="resumeConn = $event" />
      </div>
      <div v-else class="xm-tip" style="margin:0">凭据由服务端从连接档案「{{ connName(resumeConnId) }}」取用，明文不经前端。</div>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:var(--sp-2)">
          <button class="btn" @click="resumeOpen = false">取消</button>
          <button v-if="canJobOps(actJob) && canDestOps" class="btn primary" :disabled="resuming" @click="doResume">续跑</button>
        </div>
      </template>
    </n-modal>

    <!-- 1122 运行中动态调速弹层：NInputNumber（min=-1，-1=不限速，0 拒绝并提示就地报错）
         调 api.xb.throttle；成功 toast + 作业表刷新，失败（非运行态/网络）弹层内如实展示 -->
    <n-modal v-model:show="throttleOpen" preset="card" title="运行中调速" style="width:440px;max-width:92vw" :bordered="false">
      <div class="xm-tip" style="margin:0 0 var(--sp-2)">
        作业 <b class="mono">{{ throttleJob?.jobId }}</b>（{{ throttleJob?.sourceIndex }} → {{ throttleJob?.destIndex }}）
      </div>
      <div class="xm-throttle-row">
        <span class="xm-inline-lb">速率上限</span>
        <n-input-number v-model:value="throttleRps" :min="-1" size="small" :show-button="false" placeholder="docs/s"
          data-test="xm-throttle-rps" class="xm-throttle-inp" title="每秒写入文档数（docs/s）；-1=不限速" />
        <span class="dim">docs/s</span>
        <Tip text="速率 docs/s：-1=不限速（恢复全速），0 将被拒绝（停止写入请用「中止迁移」）。服务端为 reindex task 级限速；浏览器模式为批粒度限速（每批 bulk 之间按上限间隔），并在事件时间线留 THROTTLE 事件痕" long>
          <span class="dim xm-throttle-what">这是什么？</span>
        </Tip>
      </div>
      <div v-if="throttleErr" role="alert" class="xm-detail-rc-err" data-test="xm-throttle-err">{{ throttleErr }}</div>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:var(--sp-2)">
          <button class="btn" :disabled="throttling" @click="throttleOpen = false">取消</button>
          <button class="btn primary" data-test="xm-throttle-apply" :disabled="throttling" @click="doThrottle">{{ throttling ? '调速中…' : '应用调速' }}</button>
        </div>
      </template>
    </n-modal>

    <!-- 结构同步·兼容计划预览弹层（dryRun 结果，未创建索引）：源→目标 vendor 芯片对 +
         planned「矩阵预剔除」/reactive「报错兜底剔除」三清单（每刀带 reason——这是核心价值：
         每一刀都有理由）+ advice 建议（kind 徽标）+ 别名段 + 警告折叠；底部 CTA「按此计划创建」
         走现有确认弹层二次确认后以 dryRun=false 落地执行 -->
    <n-modal v-model:show="syncPlanOpen" preset="card" title="兼容计划预览（dryRun，未创建索引）" style="width:640px;max-width:92vw" :bordered="false">
      <div v-if="syncPlan" class="xm-plan" data-test="xm-sync-plan" role="status">
        <div class="xm-plan-hd">
          <MetaStrip :items="syncPlanMetaItems" />
        </div>
        <div class="xm-plan-vendor" data-test="xm-plan-vendor">
          <!-- vendor 芯片 evidence 可回查：probe 快照的判定依据（如 'plugin:analysis-ik'）
               悬浮可查，缺席（旧后端）不渲染 Tip、芯片裸显 -->
          <Tip v-if="syncEvidenceOf(syncPlan.source)" long :text="'判定依据：' + syncEvidenceOf(syncPlan.source)"><span class="chip mono">{{ syncSideLabel(syncPlan.source, syncPlan.sourceVersion) }}</span></Tip>
          <span v-else class="chip mono">{{ syncSideLabel(syncPlan.source, syncPlan.sourceVersion) }}</span>
          <ArrowRightLeft :size="12" class="xm-plan-var" aria-hidden="true" />
          <Tip v-if="syncEvidenceOf(syncPlan.target)" long :text="'判定依据：' + syncEvidenceOf(syncPlan.target)"><span class="chip mono">{{ syncSideLabel(syncPlan.target, syncPlan.targetVersion) }}</span></Tip>
          <span v-else class="chip mono">{{ syncSideLabel(syncPlan.target, syncPlan.targetVersion) }}</span>
        </div>
        <div class="xm-tip" style="margin:0">源 <b class="mono">{{ syncPlan.source?.index || form.sourceIndex }}</b> → 目标 <b class="mono">{{ syncPlan.destIndex }}</b>（{{ syncPlan.rounds ?? 0 }} 轮收敛推演）</div>
        <template v-for="sec in syncPlanSections" :key="sec.key">
          <div v-if="sec.count" class="xm-sync-sec" :data-test="'xm-plan-' + sec.key">
            <div class="xm-sync-t sec-t">{{ sec.title }} <span class="dim">（{{ sec.count }} 项）</span></div>
            <ul v-if="sec.data.removedSettings?.length" class="xm-sync-list">
              <li v-for="s in sec.data.removedSettings" :key="s.key"><code>{{ s.key }}</code><span class="xm-sync-why">{{ s.reason }}</span></li>
            </ul>
            <ul v-if="sec.data.removedAnalysis?.length" class="xm-sync-list">
              <li v-for="a in sec.data.removedAnalysis" :key="a.kind + ':' + a.name">
                <StatusPill :label="a.kind" /><code>{{ a.name }}</code><span class="xm-sync-why">{{ a.reason }}</span>
              </li>
            </ul>
            <table v-if="sec.data.downgradedFields?.length" class="xm-sync-tbl">
              <thead><tr><th>字段</th><th>属性</th><th>降级</th><th>原因</th></tr></thead>
              <tbody>
                <tr v-for="d in sec.data.downgradedFields" :key="d.field + '.' + d.attr">
                  <td><code>{{ d.field }}</code></td>
                  <td><code>{{ d.attr }}</code></td>
                  <td><code>{{ d.from }}</code> → <code>{{ d.to }}</code></td>
                  <td class="xm-sync-why">{{ d.reason }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <div v-if="syncAdviceOf(syncPlan).length" class="xm-sync-sec" data-test="xm-plan-advice">
          <div class="xm-sync-t sec-t">建议</div>
          <ul class="xm-sync-list">
            <li v-for="(a, i) in syncAdviceOf(syncPlan)" :key="i">
              <StatusPill :label="syncAdviceKindZh(a.kind)" tone="b" /><span class="xm-sync-why">{{ a.message }}</span>
            </li>
          </ul>
        </div>
        <div v-if="syncPlan.aliases && (syncPlan.aliases.skipped?.length || syncPlan.aliases.synced?.length)"
             class="xm-sync-sec" data-test="xm-plan-aliases">
          <div class="xm-sync-t sec-t">别名随迁计划 <span class="dim">（将同步 {{ syncPlan.aliases.synced?.length || 0 }} / 跳过 {{ syncPlan.aliases.skipped?.length || 0 }}）</span></div>
          <div v-if="syncPlan.aliases.synced?.length" class="xm-plan-alias-row">
            <span class="dim">将同步</span>
            <span v-for="a in syncPlan.aliases.synced" :key="a" class="chip mono">{{ a }}</span>
          </div>
          <div v-if="syncPlan.aliases.skipped?.length" class="xm-plan-alias-row">
            <span class="dim">将跳过</span>
            <span v-for="a in syncPlan.aliases.skipped" :key="a" class="chip mono xm-plan-skip">{{ a }}</span>
          </div>
        </div>
        <!-- 1122 v3：适配后目标结构预览——body.settings/body.mappings 折叠 JSON（JsonArea
             readonly+自带复制钮，源配置预览同语言）+ planDigest 短码（Tip 解释防漂移语义）；
             body/digest 缺席（v2 旧后端）整区不渲染 -->
        <div v-if="syncPlanBodyReady" class="xm-sync-sec" data-test="xm-plan-body">
          <div class="xm-sync-t sec-t">适配后目标结构预览
            <Tip v-if="syncPlan?.planDigest" long text="planDigest 是适配后 create body 的 16 位摘要；「按此计划创建」时自动携带 expectPlanDigest=该摘要——源结构若在预览后发生变化，创建将被 409 PLAN_DRIFT 拒绝（PUT 前拦截），防止按过期计划建索引">
              <span class="chip mono" data-test="xm-plan-digest" title="计划摘要短码（planDigest）">{{ syncPlan.planDigest }}</span>
            </Tip>
          </div>
          <CollapsePanel v-if="planBodyText('settings')" v-model:open="planBodySettingsOpen"
            title="body.settings（适配后将在目标创建的 settings）" class="xm-plan-body-cp" data-test="xm-plan-body-settings">
            <JsonArea :model-value="planBodyText('settings')" readonly :rows="cfgRows(planBodyText('settings'))" />
          </CollapsePanel>
          <CollapsePanel v-if="planBodyText('mappings')" v-model:open="planBodyMappingsOpen"
            title="body.mappings（适配后字段映射）" class="xm-plan-body-cp" data-test="xm-plan-body-mappings">
            <JsonArea :model-value="planBodyText('mappings')" readonly :rows="cfgRows(planBodyText('mappings'))" />
          </CollapsePanel>
        </div>
        <div v-if="syncPlanAllCompatible" class="xm-sync-allpass" data-test="xm-plan-allpass">
          <CheckCircle2 :size="12" /> 全部属性兼容，计划零剔除
        </div>
        <CollapsePanel v-if="syncPlan.warnings?.length" v-model:open="syncPlanWarnOpen" title="推演警告"
          :count="syncPlan.warnings.length" class="xm-sync-warns-cp" data-test="xm-plan-warnings">
          <ul class="xm-sync-warns">
            <li v-for="(w, i) in syncPlan.warnings" :key="i">{{ w }}</li>
          </ul>
        </CollapsePanel>
        <div v-if="syncPlan.lastError" role="alert" class="xm-sync-lasterr" data-test="xm-plan-lasterr">{{ syncPlan.lastError }}</div>
      </div>
      <template #footer>
        <div class="xm-plan-ft">
          <span class="dim xm-plan-ft-tip">按此计划创建将在目标集群实际建索引（可先勾选/取消上方「同时迁移别名」再执行）</span>
          <button class="btn" :disabled="syncing" @click="syncPlanOpen = false">关闭</button>
          <button v-if="syncPlan?.dryRun === true" class="btn primary" data-test="xm-sync-apply" :disabled="syncing"
            @click="applySyncPlan"><Rocket :size="11" /> 按此计划创建</button>
        </div>
      </template>
    </n-modal>

    <!-- 启动预检报告弹层（preflight 快照，openStartConfirm 拉取后可开）：预估行（源体积/源文档数/
         预计耗时/分片）+ 索引画像区（字段类型分布 chips / 源别名 chips）+ advice 动作芯片区
         （每条 code 映射下一步动作，version_gap 可展开提示文案） -->
    <n-modal v-model:show="preflightOpen" preset="card" title="启动预检报告（preflight）" style="width:560px;max-width:92vw" :bordered="false">
      <div v-if="preflight" class="xm-pf" data-test="xm-preflight">
        <div class="xm-pf-hd">
          <MetaStrip :items="preflightMetaItems" data-test="xm-pf-meta" />
          <!-- 1122 可选件：能力对比（compareCapabilities 只读探测）——版本差/厂商切换/
               插件差/风险矩阵；手输源连接（无 srcConnId）不可比对，如实禁用 -->
          <button class="btn sm ghost" data-test="xm-pf-capbtn" :disabled="!srcConnId || capDiffLoading"
            :title="srcConnId ? '比对源/目标集群能力（版本差/厂商/插件/风险矩阵）' : '需选择已授权的源连接档案后可比对（手输连接不支持）'"
            @click="doCompareCaps"><GitCompareArrows :size="11" /> {{ capDiffLoading ? '比对中…' : '能力对比' }}</button>
        </div>
        <div v-if="capDiff || capDiffErr" class="xm-pf-sec" data-test="xm-pf-capdiff">
          <div class="sec-t">集群能力对比 <span class="dim">（双侧探测快照）</span></div>
          <div v-if="capDiffLoading" class="dim">对比中…</div>
          <div v-else-if="capDiffErr" role="alert" class="xm-detail-rc-err" data-test="xm-pf-capdiff-err">{{ capDiffErr }}</div>
          <template v-else>
            <MetaStrip v-if="capDiffMeta.length" :items="capDiffMeta" />
            <ul v-if="capDiff?.diff?.risks?.length" class="xm-pf-risks">
              <li v-for="(r, i) in capDiff.diff.risks" :key="i" class="xm-pf-risk">
                <StatusPill :label="capSevZh(r.severity)" :tone="capSevTone(r.severity)" />
                <span class="xm-pf-msg">{{ r.message }}</span>
                <span v-if="r.action" class="dim xm-pf-risk-act">{{ r.action }}</span>
              </li>
            </ul>
            <div v-else class="dim xm-detail-none">未发现能力差异风险</div>
          </template>
        </div>
        <div v-if="pfFieldTypes.length" class="xm-pf-sec" data-test="xm-pf-fieldtypes">
          <div class="sec-t">字段类型分布 <span class="dim">（{{ pfFieldTypes.length }} 类，按字段数降序）</span></div>
          <div class="xm-pf-chips">
            <span v-for="ft in pfFieldTypes" :key="ft.type" class="chip mono">{{ ft.type }} <span class="dim">{{ fmtNum(ft.n) }}</span></span>
          </div>
        </div>
        <div v-if="pfAliases.length" class="xm-pf-sec" data-test="xm-pf-aliases">
          <div class="sec-t">源别名 <span class="dim">（{{ pfAliases.length }} 个）</span></div>
          <div class="xm-pf-chips">
            <span v-for="a in pfAliases" :key="a" class="chip mono">{{ a }}</span>
          </div>
        </div>
        <div v-if="preflightAdvice.length" class="xm-pf-sec" data-test="xm-pf-advice">
          <div class="sec-t">预检建议 <span class="dim">（{{ preflightAdvice.length }} 条）</span></div>
          <div v-for="(a, i) in preflightAdvice" :key="i" class="xm-pf-adv">
            <button class="chip xm-pf-act" :aria-expanded="pfAdvOpen[a.code] ? 'true' : 'false'"
              :title="pfActionOf(a.code).title" @click="togglePfAdv(a.code)">{{ pfActionOf(a.code).label }}</button>
            <span class="xm-pf-msg">{{ a.message }}</span>
            <div v-if="pfActionOf(a.code).detail && pfAdvOpen[a.code]" class="xm-pf-detail">{{ pfActionOf(a.code).detail }}</div>
          </div>
        </div>
        <div v-if="!pfFieldTypes.length && !pfAliases.length && !preflightAdvice.length" class="dim xm-detail-none">
          预检未回传画像数据（旧后端），仅有启动判定（目标存在性等已在确认弹层呈现）
        </div>
      </div>
    </n-modal>

    <!-- 批量迁移确认弹层（resume 弹窗同形态 n-modal preset=card）：列全部映射对，
         建索引方式/迁移速度等策略与向导共用；REBUILD 档每行红色警示，确认钮文案升级 -->
    <n-modal v-model:show="batchConfirmOpen" preset="card" title="启动批量跨集群迁移" style="width:560px;max-width:92vw" :bordered="false">
      <div class="xm-tip" style="margin:0 0 var(--sp-2)">将从 {{ batchSrcDesc }} 批量搬运 {{ batchPairs.length }} 个索引到本集群，逐个下发、失败不中断（策略与向导共用）。</div>
      <div v-if="form.destCreateMode === 'REBUILD'" class="xm-batch-warn" role="alert">
        ⚠ 删旧重建模式:每个目标索引及其全部数据将被删除,然后按源结构重建并全量迁入。此操作不可撤销!
      </div>
      <div class="xm-batch-cfm-list">
        <div v-for="r in batchPairs" :key="r.src" class="xm-batch-cfm-row">
          <span class="mono">{{ r.src }} → {{ r.dst }}</span>
          <span v-if="form.destCreateMode === 'REBUILD'" class="xm-batch-del">将删除目标索引现有数据</span>
        </div>
      </div>
      <!-- 先同步结构：勾选后批量流程先逐索引 dryRun 预览（剔除计数+风险徽标），确认后逐个创建，再进入数据迁移下发 -->
      <n-checkbox v-model:checked="batchSyncFirst" size="small" class="xm-batch-syncfirst" data-test="xm-batch-syncfirst">
        先同步结构（逐索引预览→执行）
      </n-checkbox>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:var(--sp-2)">
          <button class="btn" :disabled="starting" @click="batchConfirmOpen = false">取消</button>
          <button class="btn danger" :disabled="starting" @click="doBatchStart">
            {{ form.destCreateMode === 'REBUILD' ? '确认删除并迁移 ' + batchPairs.length + ' 个索引' : '启动 ' + batchPairs.length + ' 个迁移' }}
          </button>
        </div>
      </template>
    </n-modal>

    <!-- 作业详情回放弹窗（resume 弹窗同形态 n-modal preset=card）：六区全读——
         message 全文（StatusPill tooltip 藏着的原文）/ errorSamples（复制复用 copyErrSamples）/
         conflictSamples（后端环形 1000 采样 _id，展示+一键复制每行一个）/ formatlessDateFields
         告知条（job doc 自持，jobs REST 即带出；观测级被脱敏或旧作业缺字段→「无」，不冒充）/
         sliceStatus·sliceMigrated·sliceErrors 逐片矩阵 / savedSettings（折叠面板）。
         数据经 detailJobId 从 jobsById 反查：轮询刷新拍自动换最新 doc，行被过滤/删除则弹窗内容消隐 -->
    <n-modal v-model:show="detailOpen" preset="card" title="作业详情" style="width:640px;max-width:92vw" :bordered="false">
      <div v-if="detailJobLive" class="xm-detail" data-test="xm-detail">
        <div class="xm-detail-sec" data-test="xm-detail-msg">
          <div class="xm-detail-t sec-t">message <span class="dim">全文</span></div>
          <pre class="xm-detail-pre mono">{{ detailJobLive.message || '（无）' }}</pre>
        </div>
        <div class="xm-detail-sec" data-test="xm-detail-errors">
          <div class="xm-detail-t sec-t">错误样本 <span class="dim">（{{ (detailJobLive.errorSamples || []).length }} 条）</span>
            <button v-if="(detailJobLive.errorSamples || []).length" class="btn sm ghost xm-detail-cp-btn" :aria-label="'复制全部 ' + (detailJobLive.errorSamples || []).length + ' 条错误样本'" title="复制全部错误样本" @click="copyErrSamples(detailJobLive)"><ClipboardList :size="11" /> 复制全部</button>
          </div>
          <ul v-if="(detailJobLive.errorSamples || []).length" class="xm-detail-list">
            <li v-for="(e, i) in detailJobLive.errorSamples" :key="i" class="mono">{{ e }}</li>
          </ul>
          <div v-else class="dim xm-detail-none">无</div>
        </div>
        <div class="xm-detail-sec" data-test="xm-detail-conflicts">
          <div class="xm-detail-t sec-t">冲突 _id 样本 <span class="dim">（已显示 {{ detailConflictIds.length }} 条 / 总冲突 {{ fmtNum(detailJobLive.conflicts ?? 0) }}）</span>
            <button v-if="(detailJobLive.conflictSamples || []).length" class="btn sm ghost xm-detail-cp-btn" aria-label="复制冲突 _id 样本列表（每行一个）" title="复制冲突 _id 列表（每行一个）" @click="copyConflictSamples(detailJobLive)"><ClipboardList :size="11" /> 复制 _id 列表</button>
          </div>
          <!-- 后端环形采样上限 1000（MAX_CONFLICT_SAMPLES），全量计数以 conflicts 字段为准；
               默认显示 job doc 自带样本前 50 条，「加载全部冲突」走游标分页端点逐页拉满 -->
          <div class="xm-tip" style="margin:0 0 var(--sp-1)">样本上限 1000，总冲突 {{ fmtNum(detailJobLive.conflicts ?? 0) }}——目标已存在同 _id 按 create 语义跳过（幂等），非失败。</div>
          <ul v-if="detailConflictIds.length" class="xm-detail-list">
            <li v-for="(c, i) in detailConflictIds" :key="i" class="mono">{{ c }}</li>
          </ul>
          <div v-else class="dim xm-detail-none">无</div>
          <button v-if="!detailConflictsAllLoaded" class="btn sm ghost xm-detail-cp-btn" data-test="xm-conflicts-loadall"
            :disabled="detailConflictsLoading || !(detailJobLive.conflicts > 0 || (detailJobLive.conflictSamples || []).length)"
            :title="'游标分页拉取全部冲突 _id 样本（环形上限 1000），当前已显示 ' + detailConflictIds.length + ' 条'"
            @click="loadAllConflicts"><Scale :size="11" /> {{ detailConflictsLoading ? '加载中…' : '加载全部冲突' }}</button>
        </div>
        <!-- 目标对账（只读拉取，任意状态可发起）：源/目标文档数比对（diff≠0 红警示+差值 /
             =0 绿对齐徽标）+ 冲突 _id 样本折叠区（展开时读取，截断 50 + 共 N 条）。
             快照语义不自动轮询；读取失败如实展示错误（浏览器模式两读取端点已映射），不静默降级 -->
        <div class="xm-detail-sec" data-test="xm-detail-reconcile">
          <div class="xm-detail-t sec-t">目标对账 <span class="dim">（源/目标文档数比对）</span>
            <button class="btn sm ghost xm-detail-cp-btn" data-test="xm-reconcile-run" :disabled="reconciling"
                    title="按作业源连接比对源/目标索引文档数（快照，不随轮询刷新）" @click="doReconcile"><Scale :size="11" /> {{ reconciling ? '对账中…' : '对账' }}</button>
          </div>
          <div v-if="reconcileErr" role="alert" class="xm-detail-rc-err" data-test="xm-reconcile-err">{{ reconcileErr }}</div>
          <div v-else-if="reconcileResult" class="xm-detail-rc-row" data-test="xm-reconcile-result">
            <span class="dim">源 {{ fmtNum(reconcileResult.sourceCount) }} / 目标 {{ fmtNum(reconcileResult.destCount) }}</span>
            <span v-if="reconcileDiff === 0"><StatusPill tone="g" label="一致" /></span>
            <template v-else-if="reconcileDiff != null">
              <StatusPill tone="r" :label="'差 ' + fmtRcDiff(reconcileDiff, true)" />
              <span class="xm-detail-rc-diff">目标与源文档数差 {{ fmtRcDiff(reconcileDiff) }}——可能存在其它写入方或迁移前残留，请人工核对</span>
            </template>
            <span v-else class="dim">差值未知（任一侧文档数取数失败），请以两侧计数人工核对</span>
          </div>
          <div v-else class="dim xm-detail-none">点「对账」按作业源连接比对源/目标索引文档数</div>
          <CollapsePanel v-model:open="reconcileConflictsOpen" title="冲突 _id 样本（对账读取）" class="xm-detail-cp">
            <div v-if="reconcileConflictsErr" role="alert" class="xm-detail-rc-err" data-test="xm-reconcile-conflicts-err">{{ reconcileConflictsErr }}</div>
            <template v-else-if="reconcileConflictsRead">
              <ul v-if="reconcileConflictIds.length" class="xm-detail-list">
                <li v-for="c in reconcileConflictIds.slice(0, 50)" :key="c" class="mono">{{ c }}</li>
              </ul>
              <div v-if="reconcileConflictIds.length > 50 || reconcileConflictsTotal > reconcileConflictIds.length"
                   class="dim xm-detail-none" data-test="xm-reconcile-conflicts-more">
                …截断展示前 {{ Math.min(reconcileConflictIds.length, 50) }} 条样本，共 {{ fmtNum(reconcileConflictsTotal) }} 条冲突<template v-if="reconcileConflictsTruncated">（样本环形截断）</template>
              </div>
              <div v-if="!reconcileConflictIds.length" class="dim xm-detail-none">{{ reconcileConflictsTotal > 0 ? '共 ' + fmtNum(reconcileConflictsTotal) + ' 条冲突，无 _id 样本（旧作业未采样）' : '无版本冲突' }}</div>
            </template>
            <div v-else class="dim xm-detail-none">{{ reconcileConflictsLoading ? '读取中…' : '展开读取冲突 _id 样本（截断展示 50 条）' }}</div>
          </CollapsePanel>
        </div>
        <div class="xm-detail-sec" data-test="xm-detail-formatless">
          <div class="xm-detail-t sec-t">无 format 的 date 字段 <span class="dim">（作业完成后仍须可见）</span></div>
          <!-- 如实告知而非警报：迁移既不造成也不修复这些字段的解析风险，源什么样目标就什么样 -->
          <div v-if="(detailJobLive.formatlessDateFields || []).length" class="xm-detail-note">
            目标 mapping 中以下 {{ detailJobLive.formatlessDateFields.length }} 个 date 字段未声明 format：<span class="mono">{{ detailJobLive.formatlessDateFields.join('、') }}</span>——迁移不造成也不修复该风险（源什么样目标就什么样），查询侧自行按需处理。
          </div>
          <div v-else class="dim xm-detail-none">无</div>
        </div>
        <div class="xm-detail-sec" data-test="xm-detail-slices">
          <div class="xm-detail-t sec-t">逐片进度 <span class="dim">（sliceStatus / sliceMigrated / sliceErrors）</span></div>
          <table v-if="detailSliceRows.length" class="xm-detail-tbl">
            <thead><tr><th>slice</th><th>状态</th><th>已迁</th><th>失败</th></tr></thead>
            <tbody>
              <tr v-for="r in detailSliceRows" :key="r.id" :class="{ 'xm-detail-sfail': r.status === 'FAILED' || r.status === 'ABORTED' }">
                <td class="mono">#{{ r.id }}</td><td>{{ sliceStatusZh(r.status) }}</td>
                <td class="mono">{{ r.migrated }}</td><td class="mono">{{ r.errors }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="dim xm-detail-none">无逐片数据</div>
        </div>
        <div class="xm-detail-sec" data-test="xm-detail-settings">
          <!-- savedSettings：调优前目标索引原始 settings 快照（收尾/中止/续跑据此还原）——低频核对项，默认折叠（开合记忆） -->
          <CollapsePanel v-model:open="detailSettingsOpen" title="savedSettings（调优前目标索引原始 settings）" class="xm-detail-cp">
            <pre class="xm-detail-pre mono">{{ detailSettingsText }}</pre>
          </CollapsePanel>
        </div>
        <!-- 第七区：事件时间线（api.xb.events 只读回放）——level 着色 info 灰/warn 黄/error 红，
             最新在上；轮询跟随详情刷新节奏（loadJobs 拍），拉取失败就地重试错误卡不静默。
             1122 升级：筛选芯片（全部/门禁/错误/终态——芯片集自适应只出有命中事件的档）+
             自动滚动开关（默认开，展开/新事件到达滚回最新=顶部）+ 跨天 dayLabel 分组段头；
             折叠记忆（xm-detail-open-keys）不触 -->
        <div class="xm-detail-sec" data-test="xm-detail-events">
          <CollapsePanel v-model:open="detailEventsOpen" title="事件时间线（最新在上）" :count="detailEvents.length" class="xm-detail-cp">
            <div v-if="detailEventsErr" role="alert" class="xm-detail-rc-err" data-test="xm-detail-events-err">
              事件读取失败：{{ detailEventsErr }}<template v-if="detailEvents.length">（下方保留上次成功的事件快照）</template>
              <button class="btn sm" :disabled="detailEventsBusy" @click="refreshDetailEvents(true)"><RefreshCw :size="12" /> 重试</button>
            </div>
            <div v-if="detailEventsBusy && !detailEvents.length" class="dim">事件读取中…</div>
            <template v-else-if="detailEvents.length">
              <!-- 筛选芯片行（固定头不随内容滚）：当前档位芯片高亮；自动滚动开关默认开 -->
              <div class="xm-ev-tools">
                <button v-for="f in evFilterChips" :key="f.v" type="button" class="chip xm-ev-fchip"
                  :class="{ on: evFilter === f.v }" :data-test="'xm-evt-filter-' + f.v"
                  :aria-pressed="evFilter === f.v ? 'true' : 'false'"
                  :title="f.v === 'all' ? '全部事件（不筛选）' : '只看' + f.label + '类事件'"
                  @click="evFilter = f.v">{{ f.label }}</button>
                <n-checkbox v-model:checked="evAutoScroll" size="small" class="xm-ev-autoscroll" data-test="xm-evt-autoscroll">
                  自动滚动到最新
                </n-checkbox>
              </div>
              <!-- 跨天分组：事件 ts 降序（最新在上），天段同序——今天/昨天/MM-DD（dayLabel 单源） -->
              <div v-if="filteredEvents.length" ref="evLineEl" class="xm-ev-line" data-test="xm-events-line">
                <template v-for="g in groupedEvents" :key="g.day">
                  <div class="xm-ev-day" data-test="xm-ev-day" :data-day="g.day">{{ g.day }}</div>
                  <div v-for="(ev, i) in g.evs" :key="i" class="xm-ev" :class="'xm-ev-' + (ev.level || 'info')">
                    <span class="xm-ev-ts mono">{{ fmtHms(Number(ev.ts)) }}</span>
                    <StatusPill :label="String(ev.stage || '—')" :tone="evLevelTone(ev.level)" />
                    <span class="xm-ev-msg">{{ ev.message }}</span>
                  </div>
                </template>
              </div>
              <div v-else class="dim xm-detail-none" data-test="xm-evt-empty">当前筛选无命中事件</div>
            </template>
            <div v-else class="dim xm-detail-none">暂无事件记录</div>
          </CollapsePanel>
        </div>
      </div>
      <template #footer>
        <div class="xm-detail-ft">
          <!-- 以此参数新建：作业参数回填向导（连接/索引/参数/tuneMode/destCreateMode）并滚回向导区 -->
          <button class="btn sm" data-test="xm-detail-newfrom" @click="newFromDetail"><Rocket :size="11" /> 以此参数新建</button>
          <button class="btn sm ghost" title="下载作业完整对象 JSON（排障/归档直用）" @click="exportDetailJson"><FileJson :size="11" /> 导出快照 JSON</button>
          <button class="btn sm ghost" title="复制 Markdown 工单贴片（概要/参数/进度/对账/冲突计数/收尾结论）" @click="exportDetailMd"><ClipboardList :size="11" /> 复制工单贴片</button>
          <button class="btn" style="margin-left:auto" @click="detailOpen = false">关闭</button>
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
import { ref, reactive, computed, h, onMounted, onActivated, onBeforeUnmount, watch, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAutoRefresh } from '../composables/useAutoRefresh';
import { Rocket, ChevronDown, PlugZap, FileDown, RefreshCw, ListTodo, OctagonX, RotateCcw, ClipboardCopy, ClipboardList, SearchCheck, Copy, Zap, Feather, ExternalLink, MoreHorizontal, Terminal, FileSearch, Trash2, Scale, ArrowRightLeft, CheckCircle2, Wand2, FileJson, Download, Gauge, GitCompareArrows } from 'lucide-vue-next';
import { NSelect, NModal, NInputNumber, NCheckbox, NInput } from 'naive-ui';
/* 折叠壳统一件（原生 details/summary 升档） */
import CollapsePanel from '../components/CollapsePanel.vue';
import Tip from '../components/Tip.vue'; /* 长文本悬浮提示统一件（原生 title 60+ 字符禁用口径） */
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
import { writeStoredRaw } from '../utils/safeJson'; /* 存储写通道单源（配额/隐私模式吞异常回执布尔） */
/* err-bar 双参改用（errMetaPave547 TaskTreeView 口径——errPreHtml+errMeta，
 错误原文全文不回退，仅头部追加 code 徽标/「失败于 端点」元信息行） */
import { errPreHtml, errMeta } from '../utils/errPre';
import type { ConnHealth } from '../api';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useScopedDraft, useScopedDraftState } from '../composables/useScopedDraft';
import { usePref } from '../composables/urlState'; /* ：xm.recentKeys 最近选用置顶（预览限高稿 cfgMaxH 已随 pre 退役） */
import { useTierCycle } from '../composables/useTierCycle'; /* ：配置预览行数三档（xm.cfgRows，Ilm/CV 同款消费形态） */
/* 1122 单源接线：fmtHms（事件时刻）/fmtElapsed（humanElapsed 本地版逐字收口）/dayLabel（时间线跨天段头）
 三格式化函数迁 utils/format 单源，本地同名实现退役 */
import { fmtNum, fmtSize, fmtTime, statusColor, downloadText, fmtHms, fmtElapsed, dayLabel } from '../utils/format';
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
import SparkLine from '../components/SparkLine.vue'; /* 速率趋势迷你线（进度列消费 migrated 环形缓冲序列） */
import ProgressTrack from '../components/ProgressTrack.vue'; /* 1122：进度列手搓进度条换统一件（确定/不确定双态） */
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
/* ═══ 作业详情回放弹窗（纯读六区）——数据经 detailJobId 从 jobsById 反查，
 轮询刷新拍自动换最新 doc；行被过滤/删除后反查落空则弹窗内容消隐，不冒充 ═══ */
const detailOpen = ref(false);
const detailJobId = ref('');
/* 分区折叠记忆（settings/events）：开合落 localStorage xm-detail-open-keys——
   上次展开的核对项下次打开仍在场，不强制每次复位；坏快照回空集（全部收起） */
const XM_DETAIL_OPEN_KEYS = 'xm-detail-open-keys';
function loadDetailOpenKeys(): Set<string> {
  try {
    const rawOpenKeys = localStorage.getItem(XM_DETAIL_OPEN_KEYS);
    const arrOpenKeys = rawOpenKeys ? JSON.parse(rawOpenKeys) : null;
    return new Set(Array.isArray(arrOpenKeys) ? arrOpenKeys.map(String) : []);
  } catch { return new Set(); }
}
function persistDetailOpenKey(key: string, open: boolean) {
  const set = loadDetailOpenKeys();
  if (open) set.add(key); else set.delete(key);
  writeStoredRaw(localStorage, XM_DETAIL_OPEN_KEYS, JSON.stringify([...set].sort())); /* 写失败不炸（内存态照常） */
}
const detailSettingsOpen = ref(loadDetailOpenKeys().has('settings'));
watch(detailSettingsOpen, v => persistDetailOpenKey('settings', v));
const detailEventsOpen = ref(loadDetailOpenKeys().has('events'));
watch(detailEventsOpen, v => persistDetailOpenKey('events', v));
const detailJobLive = computed(() => jobsById.value.get(detailJobId.value));
function openDetail(j: any) {
  detailJobId.value = String(j?.jobId ?? '');
  /* 对账快照/冲突样本/事件时间线同样随开窗复位：换作业后旧结果不得残留冒充 */
  reconcileResult.value = null;
  reconcileErr.value = '';
  reconcileConflictsOpen.value = false;
  reconcileConflictsRead.value = false;
  reconcileConflictsErr.value = '';
  reconcileConflictIds.value = [];
  reconcileConflictsTotal.value = 0;
  reconcileConflictsTruncated.value = false;
  detailConflictIds.value = (Array.isArray(j?.conflictSamples) ? j.conflictSamples.map(String) : []).slice(0, XM_DETAIL_CONFLICT_PAGE);
  detailConflictsAllLoaded.value = false;
  evFilter.value = 'all'; /* 1122：换作业打开详情，筛选档复位「全部」（新事件集的档位集可能不同） */
  detailEvents.value = [];
  detailEventsErr.value = '';
  detailOpen.value = true;
  void refreshDetailEvents(true);
}
/* ═══ 事件时间线（第七区，api.xb.events 只读）：打开详情拉一次，之后跟随作业表轮询拍
 静默刷新（错误态不自动重试——就地重试钮，避免轮询失败每拍刷错误文案）；最新在上 ═══ */
const detailEvents = ref<any[]>([]);
const detailEventsErr = ref('');
const detailEventsBusy = ref(false);
let detailEventsSeq = 0;
async function refreshDetailEvents(explicit = false) {
  const jobId = detailJobId.value;
  if (!jobId || detailEventsBusy.value) return;
  if (!explicit && detailEventsErr.value) return; /* 错误态只走就地重试 */
  const seq = ++detailEventsSeq;
  detailEventsBusy.value = true;
  if (explicit) detailEventsErr.value = '';
  try {
    const r = await api.xb.events(jobId, detailJobLive.value?.srcConnId || undefined);
    if (seq !== detailEventsSeq) return;
    const list = Array.isArray(r?.events) ? [...r.events] : [];
    list.sort((a, b) => Number(b?.ts ?? 0) - Number(a?.ts ?? 0));
    detailEvents.value = list;
    detailEventsErr.value = '';
  } catch (e: any) {
    if (seq !== detailEventsSeq) return;
    /* 失败保旧数据（与 loadJobs 全失败保留上一轮视图同口径）：已渲染事件不因单拍
       失败被错误卡顶替，错误条与旧快照并存 */
    detailEventsErr.value = friendlyApiError(e);
  } finally {
    if (seq === detailEventsSeq) detailEventsBusy.value = false;
  }
}
/* 事件 level 着色：info 灰 / warn 黄 / error 红（StatusPill n/y/r 档，未知按 info） */
function evLevelTone(level: any): 'n' | 'y' | 'r' {
  const s = String(level || 'info');
  if (s === 'warn') return 'y';
  if (s === 'error') return 'r';
  return 'n';
}
/* ═══ 1122：时间线筛选芯片（全部/门禁/错误/终态）+ 自动滚动 + 跨天分组 ═══
 分类语义映射 xmigrate 事件：GATE_ 前缀或确认类=门禁、ERROR 与失败类=错误、终态
 DONE/ABORTED/INTERRUPTED=终态；其余归「全部」不单独出档。芯片集自适应——
 只显示有命中事件的档（事件集无门禁类则不出门禁芯片，AdhocRebuild ar-ev-fchip 同形态） */
type EvCat = 'gate' | 'error' | 'final';
const EV_CAT_LABELS: Record<EvCat, string> = { gate: '门禁', error: '错误', final: '终态' };
function evCategory(ev: any): EvCat | null {
  const stage = String(ev?.stage ?? '').toUpperCase();
  if (stage.startsWith('GATE_') || stage.includes('CONFIRM')) return 'gate';
  if (String(ev?.level ?? '') === 'error' || stage.includes('FAIL') || stage === 'ERROR') return 'error';
  if (stage === 'DONE' || stage === 'ABORTED' || stage === 'INTERRUPTED') return 'final';
  return null;
}
const evFilter = ref<'all' | EvCat>('all');
/* 自动滚动默认开（新事件到达/展开时滚回最新=顶部，最新在上）；勾掉后翻历史不被打扰 */
const evAutoScroll = ref(true);
const evFilterChips = computed(() => {
  const cats = new Set(detailEvents.value.map(evCategory).filter(Boolean) as EvCat[]);
  const order: EvCat[] = ['gate', 'error', 'final'];
  return [
    { v: 'all' as const, label: '全部' },
    ...order.filter(c => cats.has(c)).map(c => ({ v: c, label: EV_CAT_LABELS[c] })),
  ];
});
/* 筛选后事件：当前档在事件集刷新后无命中档时回落「全部」（档位移除后不悬空） */
const filteredEvents = computed(() => {
  if (evFilter.value === 'all') return detailEvents.value;
  if (!evFilterChips.value.some(c => c.v === evFilter.value)) return detailEvents.value;
  return detailEvents.value.filter(ev => evCategory(ev) === evFilter.value);
});
/* 跨天分组：detailEvents 已按 ts 降序（最新在上），顺序遍历同天归段——段头今天/昨天/MM-DD */
const groupedEvents = computed(() => {
  const groups: { day: string; evs: any[] }[] = [];
  for (const ev of filteredEvents.value) {
    const ts = Number(ev?.ts);
    const day = Number.isFinite(ts) && ts > 0 ? dayLabel(ts) : '未知时间';
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.evs.push(ev);
    else groups.push({ day, evs: [ev] });
  }
  return groups;
});
/* 自动滚动：最新在上 → 滚回容器顶部。触发口=①折叠区展开 ②新事件到达（长度变化或
 首条换引用；轮询同内容刷新拍不打扰翻历史）。容器限高内滚（.xm-ev-line max-height） */
const evLineEl = ref<HTMLElement | null>(null);
async function scrollEvToLatest() {
  await nextTick();
  if (evAutoScroll.value && evLineEl.value) evLineEl.value.scrollTop = 0;
}
watch(detailEventsOpen, open => { if (open) void scrollEvToLatest(); });
watch(detailEvents, (cur, prev) => {
  if (!detailEventsOpen.value || !evAutoScroll.value) return;
  /* 无新事件的刷新拍不打扰翻历史——真实轮询每拍都是全新 JSON 对象，引用比较恒不等，
   必须按数据身份（同长度且首条 ts 相同）判「无新事件」 */
  if (cur.length === prev.length && Number(cur[0]?.ts ?? 0) === Number(prev[0]?.ts ?? 0)) return;
  void scrollEvToLatest();
});
/* ═══ 冲突样本（详情冲突区）：默认显示 job doc 自带样本前 50 条；「加载全部冲突」走游标
 分页端点逐页追加拉满（服务端环上限 1000），total 以 job.conflicts 全量计数为准 ═══ */
const XM_DETAIL_CONFLICT_PAGE = 50;
const XM_CONFLICT_RING_CAP = 1000;
const detailConflictIds = ref<string[]>([]);
const detailConflictsAllLoaded = ref(false);
const detailConflictsLoading = ref(false);
async function loadAllConflicts() {
  const jobId = detailJobId.value;
  if (!jobId || detailConflictsLoading.value) return;
  detailConflictsLoading.value = true;
  try {
    const all: string[] = [];
    let cursor: string | undefined;
    /* 页数防御上限：cursor 异常循环时最多 10 页（每页 200）兜底退出 */
    for (let page = 0; page < 10; page++) {
      const r = await api.xb.conflicts(jobId, { cursor, limit: 200 }, detailJobLive.value?.srcConnId || undefined);
      const batch = Array.isArray(r?.samples) ? r.samples.map((s: any) => String(s?._id ?? s)) : [];
      all.push(...batch);
      detailConflictIds.value = all.slice(); /* 逐页追加渐进呈现 */
      cursor = r?.nextCursor || undefined;
      if (!cursor || all.length >= XM_CONFLICT_RING_CAP) break;
    }
    detailConflictsAllLoaded.value = true;
    store.notify('info', `已加载全部冲突样本 ${all.length} 条（总冲突 ${fmtNum(Number(detailJobLive.value?.conflicts ?? 0))}）`);
  } catch (e: any) {
    store.notify('error', '冲突样本加载失败：' + friendlyApiError(e));
  } finally { detailConflictsLoading.value = false; }
}
/* 以此参数新建：详情弹窗入口（回填向导并滚回向导区，逻辑复用行菜单同函数） */
function newFromDetail() {
  const j = detailJobLive.value;
  if (!j) return;
  detailOpen.value = false;
  newMigrationFromJob(j);
}
/* 导出快照 JSON：作业完整对象原样落文件（排障/归档直用，不做字段裁剪） */
function exportDetailJson() {
  const j = detailJobLive.value;
  if (!j) return;
  const name = `xm-job-${j.jobId || 'snapshot'}.json`;
  downloadText(name, prettyJson(j), 'application/json');
  store.notify('success', `已导出作业快照：${name}`);
}
/* 工单贴片 Markdown：概要/参数/进度/对账/冲突计数/收尾结论（作业表 MD 导出同语言，群聊直贴） */
async function exportDetailMd() {
  const j = detailJobLive.value;
  if (!j) return;
  const esc = (v: any) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const lines: string[] = [
    `## 迁移作业 ${j.jobId}`,
    `- 状态：${statusZh(j.status) || String(j.status ?? '')}${j.message ? `｜${esc(j.message)}` : ''}`,
    `- 源 → 目标：\`${esc(j.sourceIndex)}\`（${esc(j.remoteEndpoint)}）→ \`${esc(j.destIndex)}\``,
    `- 参数：建索引 ${j.destCreateMode || '—'} / 速度 ${j.tuneMode || '—'} / 并行 ${j.slices ?? '自动'} / 批大小 ${j.batchSize ?? '默认'}`,
    `- 进度：${fmtNum(j.migrated)} / ${j.total ? fmtNum(j.total) : '未知'}（${pctOf(j)}%），耗时 ${elapsedMsOf(j) != null ? fmtElapsed(elapsedMsOf(j)!) : '—'}`,
    `- 冲突计数：${fmtNum(j.conflicts ?? 0)}（跳过，幂等非失败）· 错误：${fmtNum(j.errors ?? 0)}`,
  ];
  if (reconcileResult.value) {
    lines.push(`- 对账：源 ${fmtNum(reconcileResult.value.sourceCount)} / 目标 ${fmtNum(reconcileResult.value.destCount)}`
      + (reconcileDiff.value == null ? '（差值未知，任一侧取数失败）' : reconcileDiff.value === 0 ? '（一致）' : `（差 ${fmtRcDiff(reconcileDiff.value, true)}）`));
  } else {
    lines.push('- 对账：未发起（可在详情弹窗点「对账」比对源/目标文档数）');
  }
  const slices = detailSliceRows.value;
  if (slices.length) lines.push(`- 逐片：${slices.map(s => `#${s.id} ${sliceStatusZh(s.status)}`).join('、')}`);
  lines.push(`- 收尾结论：${j.status === 'DONE' ? '迁移完成（跳过=目标已存在同 _id，幂等非失败）'
    : j.status === 'FAILED' ? `迁移失败${j.message ? '：' + esc(j.message) : ''}`
    : (j.status === 'ABORTED' || j.status === 'INTERRUPTED') ? '已中止/中断（凭据重供后可断点续跑）'
    : '迁移进行中'}`);
  const okCopy = await copyText(lines.join('\n'));
  store.notify(okCopy ? 'success' : 'error', okCopy ? '工单贴片已复制（Markdown）' : '复制失败');
}
/* 冲突 _id 样本复制：每行一个（grep/按 _id 批量核对直用），与错误样本复制同款诚实计数 */
function copyConflictSamples(j: any) {
  const list: string[] = j.conflictSamples || [];
  copyText(list.join('\n')).then(ok => store.notify(ok ? 'success' : 'error', ok ? `已复制 ${list.length} 条冲突 _id 样本（每行一个）` : '复制失败'));
}
/* 逐片矩阵行：sliceStatus/sliceMigrated/sliceErrors 三 Map 按 key 并集组装
 （旧文档缺任一 Map 静默降级：状态 '—'、计数 0） */
const detailSliceRows = computed(() => {
  const j = detailJobLive.value;
  if (!j) return [];
  const ids = new Set([...Object.keys(j.sliceStatus || {}), ...Object.keys(j.sliceMigrated || {}), ...Object.keys(j.sliceErrors || {})]);
  return [...ids].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b)).map(id => ({
    id,
    status: String((j.sliceStatus || {})[id] ?? '—'),
    migrated: Number((j.sliceMigrated || {})[id] ?? 0),
    errors: Number((j.sliceErrors || {})[id] ?? 0),
  }));
});
const SLICE_STATUS_ZH: Record<string, string> = { PENDING: '待启动', RUNNING: '运行中', DONE: '完成', FAILED: '失败', ABORTED: '已中止' };
function sliceStatusZh(s: string): string { return SLICE_STATUS_ZH[s] || s; }
/* savedSettings 只读展示（4 项 settings 快照）；空对象/被脱敏（观测级 job doc 剥离）→「（无）」 */
const detailSettingsText = computed(() => {
  const s = detailJobLive.value?.savedSettings;
  return s && Object.keys(s).length ? prettyJson(s) : '（无）';
});
/* ═══ 目标对账（详情弹窗）：reconcile=源/目标文档数比对快照（按钮触发，不随轮询刷新）；
 conflicts=冲突 _id 样本（折叠区展开时首次读取，截断展示 50）。
 reconcile/conflicts/events 三读取端点浏览器模式均已映射（双侧 _count / 本地样本环 /
 派生事件环），读取失败走通用错误展示，不静默降级 ═══ */
const reconciling = ref(false);
const reconcileResult = ref<any>(null);
const reconcileErr = ref('');
const reconcileDiff = computed(() => {
  const d = reconcileResult.value?.diff;
  if (d == null) return null; /* Number(null)===0 陷阱：null（任一侧取数失败）不得冒充 diff=0 一致 */
  const n = Number(d);
  return Number.isFinite(n) ? n : null;
});
/* diff 显示层：null（旧后端未回传）显示 '—'；abs=true 取绝对值（徽标差值档） */
function fmtRcDiff(n: number | null, abs = false): string {
  if (n == null) return '—';
  return fmtNum(abs ? Math.abs(n) : n);
}
async function doReconcile() {
  const j = detailJobLive.value;
  const jobId = String(j?.jobId ?? '');
  if (!jobId || reconciling.value) return;
  reconciling.value = true;
  reconcileErr.value = '';
  try {
    reconcileResult.value = await api.xb.reconcileJob(jobId, j?.srcConnId || undefined);
  } catch (e: any) {
    reconcileResult.value = null;
    reconcileErr.value = '对账失败：' + friendlyApiError(e);
  } finally { reconciling.value = false; }
}
/* 冲突 _id 样本折叠区：展开时首次读取（后端 {samples,total,truncated}——samples 环形
 截断样本、total 全量冲突计数；数组形态兜底兼容）；作业 doc 的 conflictSamples
 与此处按需读取互补，展示截断 50 条 */
const reconcileConflictsOpen = ref(false);
const reconcileConflictsLoading = ref(false);
const reconcileConflictsRead = ref(false);
const reconcileConflictsErr = ref('');
const reconcileConflictIds = ref<string[]>([]);
const reconcileConflictsTotal = ref(0);
const reconcileConflictsTruncated = ref(false);
watch(reconcileConflictsOpen, async (open) => {
  const j = detailJobLive.value;
  const jobId = String(j?.jobId ?? '');
  if (!open || !jobId || reconcileConflictsRead.value || reconcileConflictsLoading.value) return;
  reconcileConflictsLoading.value = true;
  reconcileConflictsErr.value = '';
  try {
    const r = await api.xb.conflictsJob(jobId, j?.srcConnId || undefined);
    const list: unknown[] = Array.isArray(r) ? r : Array.isArray(r?.samples) ? r.samples : [];
    /* 双形态兼容：服务端 REST 回 [{_id,ts}] 对象样本，浏览器桥回 string[]（loadAllConflicts 同款写法） */
    reconcileConflictIds.value = list.map((s: any) => String(s?._id ?? s));
    const total = Number(r?.total);
    reconcileConflictsTotal.value = Number.isFinite(total) ? total : list.length;
    reconcileConflictsTruncated.value = !!r?.truncated;
    reconcileConflictsRead.value = true;
  } catch (e: any) {
    reconcileConflictsErr.value = '冲突样本读取失败：' + friendlyApiError(e);
  } finally { reconcileConflictsLoading.value = false; }
});
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
/* 高级参数折叠态（原 details 无受控态；升档 CollapsePanel 后显式落位，默认收起不变） */
const advOpen = ref(false);
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
/* ═══ 批量清单窗口化：独立过滤词（NInput）+ 默认 50 条 +「显示更多」步进（每次 +50），
   过滤词变更窗口复位；命中计数在清单标题（单选清单过滤词仍=源输入框值，双轨互不影响） ═══ */
const XM_REMOTE_STEP = 50;
const batchListKw = ref('');
const batchListLimit = ref(XM_REMOTE_STEP);
const batchListFiltered = computed(() => {
  const kw = batchListKw.value.trim().toLowerCase();
  if (!kw) return remoteIndices.value;
  return remoteIndices.value.filter(r => String(r.index).toLowerCase().includes(kw));
});
const batchListShown = computed(() => batchListFiltered.value.slice(0, batchListLimit.value));
watch(batchListKw, () => { batchListLimit.value = XM_REMOTE_STEP; });
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

/* ═══ 结构同步·兼容性自适应（sync-structure）：按源索引 mapping/settings 在宿主集群
 创建目标索引。场景：生产集群（如阿里云 ES）结构同步到 UAT（如腾讯云 ES）——厂商私有
 settings（index.apack.*）与自定义分词组件在目标不可用，多轮试建自动剔除/降级，
 回三清单报告（剔了什么/为什么）。报告字段：created/destIndex/rounds/removedSettings/
 removedAnalysis/downgradedFields/warnings/sourceVersion/targetVersion（lastError 缺席时
 失败原因只在请求层错误面板）。浏览器模式同样执行自适应同步（源连接直连读取 + 宿主
 集群创建，口径与服务端一致）；作业对账 reconcile/conflicts 读取端点浏览器模式已映射
 （读取失败如实呈现错误，不静默降级） ═══ */
const syncing = ref(false);
const syncReport = ref<any>(null);
/* dryRun 计划（弹层）：与执行报告（syncReport，inline）同一 v2 结构分开展示 */
const syncPlan = ref<any>(null);
const syncPlanOpen = ref(false);
const syncWarnOpen = ref(false);
const syncPlanWarnOpen = ref(false);
const syncErr = ref(''); // 请求层失败内联面板状态位（cfgErr 同族形态）
const syncErrRaw = ref<unknown>(null); // 原始错误对象旁路（喂 errMeta，同 cfgErrRaw）
/* 别名随迁开关（dryRun 预览与执行共用；预览弹层 footer 提示可在执行前调整） */
const syncAliases = ref(false);
/* 目标索引名：默认同名/预填目标表单值；用户改过即脱离跟随（清空=显式留空，不回弹） */
const syncDest = ref('');
const syncDestTouched = ref(false);
watch(() => [form.value.destIndex, form.value.sourceIndex] as const, ([d, s]) => {
  if (!syncDestTouched.value) syncDest.value = d || s || '';
}, { immediate: true });
/* ═══ v2 计划报告归一：planned=矩阵预剔除（推演阶段确定性砍掉）/reactive=报错兜底剔除
 （试建报错后逐项回退）。旧后端顶层三清单回退进 planned，reactive 归空组——显示层
 单源，请求体/报告原文零改写 ═══ */
function syncGroupOf(r: any, key: 'planned' | 'reactive') {
  if (key === 'planned') return r?.planned ?? {
    removedSettings: r?.removedSettings ?? [],
    removedAnalysis: r?.removedAnalysis ?? [],
    downgradedFields: r?.downgradedFields ?? [],
  };
  return r?.reactive ?? { removedSettings: [], removedAnalysis: [], downgradedFields: [] };
}
function planCount(g: any): number {
  return (g?.removedSettings?.length || 0) + (g?.removedAnalysis?.length || 0) + (g?.downgradedFields?.length || 0);
}
const SYNC_PLAN_SECTIONS: { key: 'planned' | 'reactive'; title: string }[] = [
  { key: 'planned', title: '矩阵预剔除' },
  { key: 'reactive', title: '报错兜底剔除' },
];
function sectionsOf(r: any) {
  return SYNC_PLAN_SECTIONS.map(s => {
    const data = syncGroupOf(r, s.key);
    return { key: s.key, title: s.title, data, count: planCount(data) };
  });
}
const syncReportSections = computed(() => sectionsOf(syncReport.value));
const syncPlanSections = computed(() => sectionsOf(syncPlan.value));
/* 源→目标 vendor 芯片标签：vendor.label+version（unknown/缺席如实显示，不冒充探测结果） */
function syncSideLabel(node: any, legacyVersion?: any): string {
  const vendor = node?.vendor?.label ? String(node.vendor.label)
    : node?.vendor?.id ? String(node.vendor.id) : '未知厂商';
  const ver = node?.version ?? legacyVersion ?? '版本未知';
  return `${vendor} ${ver}`;
}
/* vendor 判定依据（probe 快照 vendor.evidence，如 'plugin:analysis-ik'/'distribution:default'）：
   缺席（旧后端报告）返回空串——Tip 不渲染，芯片裸显降级 */
function syncEvidenceOf(node: any): string {
  const ev = node?.vendor?.evidence;
  return ev ? String(ev) : '';
}
/* advice kind 徽标中文化：分片/副本/存储/ILM（未命中枚举回显原文，不吞信息） */
const SYNC_ADVICE_KIND_ZH: Record<string, string> = { shard: '分片', replica: '副本', storage: '存储', ilm: 'ILM' };
function syncAdviceKindZh(k: any): string { return SYNC_ADVICE_KIND_ZH[String(k)] || String(k ?? '建议'); }
function syncAdviceOf(r: any): any[] { return Array.isArray(r?.advice) ? r.advice : []; }
/* 零剔除判定：planned+reactive 全空（warnings/advice 与剔除正交，不计入） */
const syncAllCompatible = computed(() => syncReportSections.value.every(s => !s.count));
const syncPlanAllCompatible = computed(() => syncPlanSections.value.every(s => !s.count));
/* 报告头部元信息：目标索引 + 源版本→目标版本对 + 收敛轮次（版本取数失败显示「未知」不冒充） */
function syncVersionPair(r: any): string {
  const sv = r?.source?.version ?? r?.sourceVersion ?? '未知';
  const tv = r?.target?.version ?? r?.targetVersion ?? '未知';
  return `${sv} → ${tv}`;
}
const syncMetaItems = computed<MetaStripItem[]>(() => {
  const r = syncReport.value;
  if (!r) return [];
  return [
    ...(r.destIndex ? [{ value: String(r.destIndex), label: '目标索引' }] : []),
    { value: syncVersionPair(r), label: '版本对' },
    { value: Number(r.rounds ?? 0), unit: '轮', label: '收敛' },
  ];
});
const syncPlanMetaItems = computed<MetaStripItem[]>(() => {
  const r = syncPlan.value;
  if (!r) return [];
  return [
    ...(r.destIndex ? [{ value: String(r.destIndex), label: '目标索引' }] : []),
    { value: syncVersionPair(r), label: '版本对' },
    { value: Number(r.rounds ?? 0), unit: '轮', label: '收敛' },
  ];
});
/* ═══ 1122 v3：适配后 create body 预览（dryRun 计划弹层）——body.settings/mappings
 折叠 JSON（JsonArea readonly 自带复制钮+语法高亮，源配置预览同语言；行数随内容生长
 封顶走 cfgRows 既有档）；planDigest 短码 + 执行自动携带 expectPlanDigest（见 syncReq）。
 v2 旧后端 body/planDigest 缺席 → 整区不渲染（不冒充） ═══ */
const planBodySettingsOpen = ref(false);
const planBodyMappingsOpen = ref(false);
function planBodyText(part: 'settings' | 'mappings'): string {
  const v = syncPlan.value?.body?.[part];
  if (v == null || (typeof v === 'object' && !Object.keys(v).length)) return '';
  return prettyJson(v);
}
const syncPlanBodyReady = computed(() =>
  !!syncPlan.value?.planDigest || !!planBodyText('settings') || !!planBodyText('mappings'));
function syncUnmappedMsg(e: any): string {
  /* 浏览器模式已实现自适应同步；若仍走到此分支，说明端点覆盖缺失，如实呈现不冒充 */
  return e?.code === 'BROWSER_MODE_UNMAPPED'
    ? '浏览器模式未映射结构同步端点（端点覆盖缺失，请反馈补齐），未创建索引'
    : '';
}
/* 请求体单源：dryRun 预览与落地执行同构（dryRun/syncAliases 差一参）。
 1122 v3：执行（dryRun=false）自动携带 expectPlanDigest=最近一次 dryRun 计划的
 planDigest——服务端 PUT 前比对，源结构漂移即 409 PLAN_DRIFT 拒绝；预览请求
 与旧后端（无 digest 回传）不带该参 */
function syncReq(dest: string, dryRun: boolean): any {
  const req: any = { sourceIndex: form.value.sourceIndex, destIndex: dest, dryRun, syncAliases: syncAliases.value };
  if (srcConnId.value) req.srcConnId = srcConnId.value;
  else req.conn = connBody();
  if (!dryRun && syncPlan.value?.planDigest) req.expectPlanDigest = String(syncPlan.value.planDigest);
  return req;
}
/* 第一段：预览兼容计划（dryRun=true，只读推演不落盘）——无确认窗直接请求，报告进弹层 */
async function openSyncPreview() {
  if (!canOps.value) { store.notify('warning', '结构同步需专项或 ADMIN 角色'); return; }
  if (connModel.value && !srcConnId.value) { store.notify('warning', '连接模型下必须选择已授权的源连接档案'); return; }
  if (!form.value.sourceIndex || syncing.value) return;
  syncing.value = true;
  syncErr.value = '';
  syncErrRaw.value = null;
  syncReport.value = null;
  try {
    const dest = syncDest.value.trim() || form.value.sourceIndex;
    const r = await api.xb.syncStructure(syncReq(dest, true), srcConnId.value || undefined);
    syncPlan.value = r;
    syncPlanOpen.value = true;
  } catch (e: any) {
    syncPlan.value = null;
    syncErr.value = syncUnmappedMsg(e) || '结构同步失败：' + friendlyApiError(e) + '（未创建索引）';
    syncErrRaw.value = e;
    store.notify('error', syncErr.value);
  } finally { syncing.value = false; }
}
/* 第二段：按计划创建——dryRun 报告底部 CTA，走确认弹层二次确认后以 dryRun=false 执行 */
async function applySyncPlan() {
  const dest = String(syncPlan.value?.destIndex || syncDest.value.trim() || form.value.sourceIndex || '');
  if (!dest || syncing.value) return;
  syncing.value = true;
  try {
    const ok = await askConfirm({
      title: '同步结构到目标集群',
      message: `按源索引「${form.value.sourceIndex}」的 mapping/settings 在本集群创建「${dest}」：目标不兼容的厂商私有 settings 与分词组件将自动剔除或降级，完成后给出逐项报告。不会覆盖既有索引：目标已存在将直接失败。`,
      level: 'warn',
      okText: '同步',
      facts: [
        { label: '源索引', value: form.value.sourceIndex },
        { label: '目标索引', value: dest },
        { label: '覆盖语义', value: '不会覆盖既有索引：目标已存在将失败' },
        ...(syncAliases.value ? [{ label: '别名随迁', value: '勾选：源索引别名将随结构一并同步' }] : []),
        /* 1122 v3：digest 在场时执行自动带 expectPlanDigest（漂移 409 拒绝）——facts 可见 */
        ...(syncPlan.value?.planDigest ? [{ label: '计划摘要', value: syncPlan.value.planDigest + '（源结构漂移将拒绝创建）' }] : []),
      ],
    });
    if (!ok) return;
    syncPlanOpen.value = false;
    await doSyncStructure(dest);
  } finally { syncing.value = false; }
}
async function doSyncStructure(dest: string) {
  syncErr.value = '';
  syncErrRaw.value = null;
  syncReport.value = null;
  try {
    const r = await api.xb.syncStructure(syncReq(dest, false), srcConnId.value || undefined);
    syncReport.value = r;
    if (r?.created) {
      /* 成功联动：目标表单为空则回填（不覆盖用户已输值），迁移向导直接可用；
       目标名输入钉住本拍结果（脱离表单跟随），后续改动不漂移已落地的报告 */
      syncDestTouched.value = true;
      syncDest.value = String(r.destIndex || dest);
      if (!form.value.destIndex) form.value.destIndex = String(r.destIndex || dest);
      store.notify('success', `结构同步完成：${r.destIndex || dest} 已创建`);
    } else {
      store.notify('error', '结构同步未创建索引（见下方报告）');
    }
  } catch (e: any) {
    /* 请求层失败（4xx/5xx/浏览器 501）：内联面板留全文（cfgErr 同族形态）——
       报告字段缺席时错误只有这里，「未创建索引」如实告知 */
    syncReport.value = null;
    syncErr.value = syncUnmappedMsg(e) || '结构同步失败：' + friendlyApiError(e) + '（未创建索引）';
    syncErrRaw.value = e;
    store.notify('error', syncErr.value);
  }
}
/* 报告落地后的快捷动作：确保目标已回填 + toast 提示（不强行跳转，由用户在下方自行启动） */
function continueToMigrate() {
  const dest = String(syncReport.value?.destIndex || syncDest.value || '');
  if (!dest) { store.notify('warning', '目标索引名缺失，请先在目标索引输入框填写'); return; }
  if (!form.value.destIndex) form.value.destIndex = dest;
  store.notify('info', `目标索引「${dest}」结构已就绪，可在下方启动迁移继续搬运数据`);
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
/* ═══ 预检报告弹层（画像读侧）：预估行 + 字段类型分布 + 源别名 + advice 动作芯片。
   数据源=启动确认链拉过的 preflight 快照（不另发请求）；openStartConfirm 每次重拉 ═══ */
const preflightOpen = ref(false);
const pfAdvOpen = reactive<Record<string, boolean>>({});
const preflightMetaItems = computed<MetaStripItem[]>(() => {
  const pf = preflight.value;
  if (!pf) return [];
  return [
    ...(pf.sourceBytes != null ? [{ value: fmtSize(pf.sourceBytes), label: '源体积' }] : []),
    ...(pf.srcDocCount != null ? [{ value: fmtNum(pf.srcDocCount), label: '源文档数' }] : []),
    ...(pf.estSeconds != null ? [{ value: fmtElapsed(Number(pf.estSeconds) * 1000), label: '预计耗时' }] : []),
    ...(pf.srcShards != null ? [{ value: Number(pf.srcShards), unit: '片', label: '源分片' }] : []),
    ...(pf.destShards != null ? [{ value: Number(pf.destShards), unit: '片', label: '目标分片' }] : []),
  ];
});
/* 字段类型分布：fieldTypeCounts 按计数降序（同级字母序稳定） */
const pfFieldTypes = computed(() => {
  const c = preflight.value?.fieldTypeCounts;
  if (!c || typeof c !== 'object') return [];
  return Object.entries(c as Record<string, unknown>)
    .map(([type, n]) => ({ type, n: Number(n) || 0 }))
    .sort((a, b) => b.n - a.n || a.type.localeCompare(b.type));
});
const pfAliases = computed(() => Array.isArray(preflight.value?.sourceAliases)
  ? preflight.value.sourceAliases.map(String) : []);
/* ═══ 1122 可选件：集群能力对比（compareCapabilities 只读探测）——预检报告弹层入口，
 按需拉取（不随弹层自动发）：diff 摘要行（版本差/厂商切换/插件差/节点规模比）+
 risks 矩阵（severity 徽标 + message + action 建议）。手输源连接（无 srcConnId）不可
 比对（按钮禁用+title 说明）；失败如实展示（不静默） ═══ */
const capDiff = ref<any>(null);
const capDiffLoading = ref(false);
const capDiffErr = ref('');
async function doCompareCaps() {
  if (!srcConnId.value) { store.notify('warning', '能力对比需选择已授权的源连接档案（手输连接不支持）'); return; }
  if (capDiffLoading.value) return;
  capDiffLoading.value = true;
  capDiffErr.value = '';
  try {
    capDiff.value = await api.xb.compareCapabilities({
      srcConnId: srcConnId.value,
      sourceIndex: form.value.sourceIndex || undefined,
      destConnId: store.target || 'host',
      destIndex: form.value.destIndex || undefined,
    }, srcConnId.value || undefined);
  } catch (e: any) {
    capDiff.value = null;
    capDiffErr.value = '能力对比失败：' + friendlyApiError(e);
  } finally { capDiffLoading.value = false; }
}
const capDiffMeta = computed<MetaStripItem[]>(() => {
  const d = capDiff.value?.diff;
  if (!d) return [];
  const items: MetaStripItem[] = [];
  if (d.versionGap != null && d.versionGap !== '') items.push({ value: String(d.versionGap), label: '版本差' });
  if (d.vendorChanged) items.push({ value: '是', label: '厂商切换', tone: 'warn' });
  if (Array.isArray(d.pluginsOnlyInSource) && d.pluginsOnlyInSource.length) {
    items.push({ value: d.pluginsOnlyInSource.join('、'), label: '仅源有插件', tone: 'warn' });
  }
  if (Array.isArray(d.pluginsOnlyInTarget) && d.pluginsOnlyInTarget.length) {
    items.push({ value: d.pluginsOnlyInTarget.join('、'), label: '仅目标有插件' });
  }
  if (d.nodeScale != null && d.nodeScale !== '') items.push({ value: String(d.nodeScale), label: '节点规模比' });
  return items;
});
/* severity 中文化+色档（未知枚举回显原文/中性档，不吞信息） */
const CAP_SEV_ZH: Record<string, string> = { high: '高风险', error: '错误', medium: '注意', warn: '注意', warning: '注意', info: '提示', low: '低' };
function capSevZh(s: any): string { return CAP_SEV_ZH[String(s ?? '').toLowerCase()] || String(s ?? '提示'); }
function capSevTone(s: any): 'r' | 'y' | 'n' {
  const v = String(s ?? '').toLowerCase();
  if (v === 'high' || v === 'error') return 'r';
  if (v === 'medium' || v === 'warn' || v === 'warning') return 'y';
  return 'n';
}
const preflightAdvice = computed(() => Array.isArray(preflight.value?.advice) ? preflight.value.advice : []);
/* advice code → 动作芯片（label=下一步动作；detail=可展开提示文案，仅 version_gap） */
const PF_ADVICE_ACTIONS: Record<string, { label: string; detail?: string }> = {
  formatless_date: { label: '同步结构时自动降级' },
  version_gap: {
    label: '查看兼容建议',
    detail: '源/目标集群大版本有差：mapping 与分析组件可能不兼容——先「预览兼容计划」看逐项剔除清单与理由，确认可接受后再创建/迁移。',
  },
  shard_oversize: { label: '预览兼容计划看分片建议' },
  alias_attached: { label: '别名随迁需勾选同步别名' },
};
function pfActionOf(code: any): { label: string; detail?: string; title: string } {
  const hit = PF_ADVICE_ACTIONS[String(code)];
  return { label: hit?.label || '查看详情', detail: hit?.detail, title: hit?.label || '预检建议' };
}
function togglePfAdv(code: any) {
  const k = String(code);
  pfAdvOpen[k] = !pfAdvOpen[k];
}
/* 应用推荐（高级参数区）：preflight.recommended 一键回填 slices/batchSize（0/缺席不动=不冒充）；
   requestsPerSecond 表单不自持（xmigrate start 无此参），仅在 toast 里如实告知推荐值 */
const advRecBusy = ref(false);
async function applyRecommended() {
  if (advRecBusy.value) return;
  if (!form.value.sourceIndex) { store.notify('warning', '先选源索引，预检才能给出推荐参数'); return; }
  advRecBusy.value = true;
  try {
    if (!preflight.value?.recommended) {
      try {
        preflight.value = await api.xb.preflight({ sourceIndex: form.value.sourceIndex, destIndex: form.value.destIndex }, srcConnId.value || undefined);
      } catch { /* 预检失败走下方「未回传」如实告知，不冒充 */ }
    }
    const rec = preflight.value?.recommended;
    if (!rec || (rec.slices == null && rec.batchSize == null && rec.requestsPerSecond == null)) {
      store.notify('warning', '预检未回传推荐参数（旧后端或预检失败），参数未改动');
      return;
    }
    if (Number(rec.slices) > 0) form.value.slices = Number(rec.slices);
    if (Number(rec.batchSize) > 0) form.value.batchSize = Number(rec.batchSize);
    store.notify('success', `已应用推荐参数：并行 ${rec.slices ?? '自动'} 路 / 批大小 ${rec.batchSize ?? '默认'}`
      + (rec.requestsPerSecond != null ? `（推荐限速 ${rec.requestsPerSecond}/s，迁移档不自持限速参数）` : ''));
  } finally { advRecBusy.value = false; }
}
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
    /* 预检预估行：源体积/源文档数/预计耗时（preflight 回传才有，缺失不出=不冒充） */
    const pf = preflight.value;
    if (pf?.sourceBytes != null) facts.push({ label: '源体积', value: fmtSize(pf.sourceBytes) });
    if (pf?.srcDocCount != null) facts.push({ label: '源文档数', value: fmtNum(pf.srcDocCount) });
      if (pf?.estSeconds != null) facts.push({ label: '预计耗时', value: fmtElapsed(Number(pf.estSeconds) * 1000) });
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
/* 作业表条数三档（30/100/500；后端 clamp [1,500]，档值均合法）——原写死 30 改工具行
 三档切换，选择经 usePref 落 localStorage（esquerystudio.pref.xm.jobsLimit）跨会话记忆；
 读侧挡坏档值（手改 localStorage 的越档值回落默认 30） */
const JOBS_LIMIT_TIERS = [30, 100, 500];
const jobsLimitPref = usePref<number>('xm.jobsLimit', 30);
const jobsLimit = computed(() =>
  JOBS_LIMIT_TIERS.includes(Number(jobsLimitPref.value)) ? Number(jobsLimitPref.value) : 30);
function setJobsLimit(n: number) {
  if (jobsLimit.value === n) return;
  jobsLimitPref.value = n;
  loadJobs();
}
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
/* 1122 ProgressTrack 色档映射：RUNNING=primary（原 .run 渐变 ac 档）、其余=success
 （原 .xm-p-fill 默认 ok 绿档）——旧视觉两档等值承接，不引入新分档 */
function progressStateOf(j: any): 'primary' | 'success' {
  return j?.status === 'RUNNING' ? 'primary' : 'success';
}
/* 人话化耗时（＜1s / 42s / 3m05s / 2h05m / 1d3h）→ fmtElapsed 单源（本地版逐字收口） */
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

/* 速率趋势环形缓冲——按 jobId 维护 (t, migrated) 采样点（loadJobs 轮询拍 push，cap 60）；
 值未变的拍不推点（缓冲不被平段灌满），终态后不再变化=DONE/FAILED 自然保留最后曲线。
 SparkLine 消费 migrated 序列（DiagView dg-spark 同款 w=96/h=16 档）；组件内存态，
 刷新页面重建（首拍单点不绘，≥2 点才接线） */
const XM_RATE_CAP = 60;
const rateHist = reactive(new Map<string, { t: number; m: number }[]>());
function pushRateSamples() {
  const now = Date.now();
  for (const j of jobs.value) {
    const id = String(j?.jobId ?? '');
    if (!id) continue;
    let buf = rateHist.get(id);
    if (!buf) { buf = []; rateHist.set(id, buf); }
    const m = Number(j.migrated || 0);
    if (buf.length && buf[buf.length - 1].m === m) continue;
    buf.push({ t: now, m });
    if (buf.length > XM_RATE_CAP) buf.shift();
  }
}
/* jobId → 速率序列缓存（与 rateHist 同生命周期：作业对象上无挂载位，行槽经
   rowJob 反查 jobId 再取序列——缓存让「同 buf 状态」在多次模板求值间引用恒定） */
const sparkCache = new Map<string, { s: number[]; t: number }>();
function sparkOf(j: any): number[] {
  const id = String(j?.jobId ?? '');
  const buf = rateHist.get(id);
  if (!buf || !buf.length) return [];
  /* 序列缓存：buf 只在 migrated 变化的拍收新点（上方守卫），末点时间戳相同即
     序列未变——复用同一数组引用，SparkLine pts computed 随之跳过重算。非响应
     缓存安全性：无新采样点的渲染拍曲线本就不该动（终态保留最后曲线同语义） */
  const top = buf[buf.length - 1];
  const hit = sparkCache.get(id);
  if (hit && hit.t === top.t) return hit.s;
  const s = buf.map(p => p.m);
  sparkCache.set(id, { s, t: top.t });
  return s;
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
    value: fmtElapsed(Math.round((remain / rate) * 1000)),
    label: '预计剩余',
    tone: 'info',
    tip: '预计剩余 =（total − migrated）/ 速率（ΣsliceMigrated/耗时，估算值随波动刷新）',
  };
}
/* 跳过段——conflicts>0 才出（0 不显）：目标已存在同 _id 按 create 语义跳过，
 属幂等保护而非失败，与「错误」列分开口径（tip 说明语义防误读为出错） */
function skippedMeta(j: any): MetaStripItem | null {
  const n = Number(j?.conflicts || 0);
  if (!n) return null;
  return { value: fmtNum(n), label: '跳过', tip: '目标已存在同 _id 按 create 语义跳过（幂等），非失败' };
}
/* DONE 目标对账段——用宿主索引清单（挂载时 api.xb.destIndices 已拉，行含 docs.count）
 按 destIndex 取目标实存 docs 数，与已处理量（migrated+conflicts=新写入+跳过）对比；
 差异≠0 挂 warn 请人工核对（可能存在其它写入方或迁移前残留）。清单无该索引（事后被删/
 清单拉取失败）不显示——不冒充对账通过；数据在挂载时已拉，此处纯组装零请求 */
function destReconcileMeta(j: any): MetaStripItem | null {
  if (j?.status !== 'DONE' || !j?.destIndex) return null;
  const hit = hostIndices.value.find(h => String(h.index) === String(j.destIndex));
  const actual = Number(hit?.['docs.count']);
  if (!hit || !Number.isFinite(actual)) return null;
  const diff = actual - (Number(j.migrated || 0) + Number(j.conflicts || 0));
  if (diff === 0) return null;
  /* 续跑作业：被中止 slice 重跑时其上轮已写入部分会以 409 计入 conflicts，与历史基线
     口径重叠（同批文档两侧各计一次），差值偏高属预期——降级为参考语态不告警 */
  const resumed = j.priorMigrated != null || j.priorConflicts != null;
  return {
    value: `目标实存 ${fmtNum(actual)}`,
    unit: resumed ? `· 含续跑基线差 ${fmtNum(diff)}（参考）` : `· 与已处理差 ${fmtNum(diff)}`,
    tone: resumed ? undefined : 'warn',
    tip: resumed
      ? '续跑作业的已处理量含历史基线与重放跳过的口径重叠，差值仅供参考，不代表缺数据'
      : '目标索引实存 docs 数与本次已处理量（新写入+跳过）不一致，可能存在其它写入方或迁移前残留数据，请人工核对',
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
  const skip = skippedMeta(j);
  const rec = destReconcileMeta(j);
  return [{
    value: fmtNum(j.migrated),
    unit: '/' + (j.total != null ? fmtNum(j.total) : '?') + '（' + pctOf(j) + '%）',
    tone: j.status === 'RUNNING' ? 'info' : j.status === 'DONE' ? 'ok' : undefined,
  }, ...(skip ? [skip] : []), ...(cp ? [cp] : []), ...(eta ? [eta] : []), ...(rec ? [rec] : [])];
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
    const r = await api.xb.jobs(jobsLimit.value, srcConnId.value || undefined);
    if (seq !== jobsSeq) return; // 已有更新拍入列：本拍整拍作废，不动任何状态
    jobs.value = Array.isArray(r) ? r : [];
    pushRateSamples(); /* 速率环形缓冲随拍采样（弃拍在上方 return，不采旧数据） */
    /* 详情弹窗打开时事件时间线随本拍刷新（跟随作业表轮询节奏；错误态只走就地重试） */
    if (detailOpen.value && detailJobId.value) void refreshDetailEvents(false);
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
/* ═══ 历史治理（对齐 AdhocRebuildView deleteJob/cleanupJobs 交互骨架）：
 单条删除仅终态（后端也仅受理终态，行级删除钮同判只在场终态行）；
 批量清理 7 天前终态记录。两者都仅清记录，不影响 ES 索引与已迁移数据 ═══ */
const XM_TERMINAL_STATUS = ['DONE', 'FAILED', 'ABORTED', 'INTERRUPTED'];
async function doDeleteJob(j: any) {
  const jobId = String(j?.jobId ?? '');
  if (!jobId) return;
  const ok = await askConfirm({
    level: 'warn',
    title: '删除迁移作业记录',
    message: `将删除作业 ${jobId} 的记录（仅清记录，不影响 ES 索引与已迁移数据）。`,
    okText: '删除记录',
    facts: [
      { label: 'jobId', value: jobId },
      { label: '状态', value: statusZh(j?.status) || String(j?.status ?? '') },
      { label: '目标索引', value: String(j?.destIndex || '-') },
    ],
  });
  if (!ok) return;
  try {
    await api.xb.deleteJob(jobId, j?.srcConnId || undefined);
    store.notify('success', '已删除作业记录');
    /* 本地移除该行：删除语义确定（204），不必整表重拉——轮询拍/RUNNING 守卫照常 */
    jobs.value = jobs.value.filter(x => String(x.jobId) !== jobId);
  } catch (e: any) {
    store.notify('error', '删除失败：' + friendlyApiError(e));
  }
}
async function doCleanupJobs() {
  const ok = await askConfirm({
    level: 'warn',
    title: '清理 7 天前的终态迁移作业记录',
    message: '将删除 7 天前已结束（成功/失败/中止/中断）的迁移作业记录；进行中的作业不受影响。仅清记录，不影响 ES 索引。',
    okText: '清理',
  });
  if (!ok) return;
  try {
    const r = await api.xb.cleanupJobs(7, srcConnId.value || undefined);
    store.notify('success', `已清理 ${Number(r?.deleted) || 0} 条 7 天前的终态记录`);
    loadJobs();
  } catch (e: any) {
    store.notify('error', '清理失败：' + friendlyApiError(e));
  }
}
/* ?jobId= 深链读侧（此前跳转裸 push('/xmigrate') 只能落作业表顶部——526 遗留收口）。
 读侧三口范式同 AdhocRebuildView ?index=：① 挂载 ② onActivated（KeepAlive 回流口——本页暂不在
 App.vue 白名单，入名单前先备好消费口）③ watch（SPA 内同页重入，组件实例复用、onMounted 不再跑，
 仅在 jobId「从无到有/值变化」时消费，消费后的摘除不回环）；loadJobs 后 locateJobRow 定位+行强调
 （行未渲染/被 kw 过滤时静默跳过——locateJobRow 既有语义）；消费后历史 replace 只摘 jobId——
 刷新/回退不再重定位（AdhocRebuild 一次性上下文用后即清同款）。
 ?source= 深链同函数并入（IndexHub 索引行右键「跨集群迁移此索引…」回填源索引输入）：
 回填后展开表单组（向导第一步即在场），摘链口径与 jobId 一致（用后即清） */
const route = useRoute();
/* 消费口世代：挂载/KeepAlive 回流/watch 三口可并发入列，旧口在 await loadJobs 期间
 被新口顶替后，定位与摘链权整体让位（行高亮与 URL 清理都只归最新口） */
let dlSeq = 0;
function queryStr(key: string): string {
  const q = (route.query as Record<string, unknown>)[key];
  return Array.isArray(q) ? String(q[0] ?? '') : q != null ? String(q) : '';
}
async function consumeDeepLinks() {
  const jobId = queryStr('jobId');
  const source = queryStr('source');
  const seq = ++dlSeq;
  await loadJobs();
  if (seq !== dlSeq) return; // 已有更新消费口入列：定位与摘链权让位
  if (jobId) locateJobRow(jobId);
  if (source) {
    form.value.sourceIndex = source; /* 深链回填源索引（写草稿=与手输同口径） */
    formOpen.value = true; /* 表单组展开：第 2 步选源直接在场 */
  }
  if (!jobId && !source) return;
  const rest = { ...route.query };
  delete rest.jobId;
  delete rest.source;
  router.replace({ query: rest }).catch(() => {});
}
/** 1125：挂载期读取（作业清单/目标索引清单/indexKey）同样要过身份门——
    宿主换 token 的窗口里 probed 未落地，旧 target 与上一账号的作业行会先拉回来。
    与 DslQuery autoRunAllowed 同口径；不放行则挂起，身份落地补跑。 */
const xmReady = () => auth.authDisabled || !auth.probeStarted
  || (auth.probed && auth.me != null && auth.canReadPage('xmigrate', store.target));
let xmPendingBoot = false;
async function bootReads() {
  consumeDeepLinks(); /* 首载（无 ?jobId=/?source= 时即普通 loadJobs） */
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
/* 深链第二/三口——KeepAlive 回流与 SPA 内重入共用 consumeDeepLinks（见上注）；
 watch 双参并察（jobId/source 任一「从无到有/值变化」即消费，摘链后的清除拍不回环） */
onActivated(() => { consumeDeepLinks(); });
watch(() => [route.query.jobId, route.query.source], ([nj, ns], [oj, os]) => {
  if (nj === oj && ns === os) return;
  if (nj || ns) consumeDeepLinks();
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
  const st = String(j.status ?? '');
  const copyIdx = async (label: string, name: string | undefined) => {
    const ok = await copyText(String(name || ''));
    store.notify(ok ? 'success' : 'error', ok ? `已复制${label}` : '复制失败');
  };
  return [
    { key: 'copy-id', label: '复制 jobId', icon: Copy, run: () => copyJobId(j.jobId) },
    { key: 'copy-src-idx', label: '复制源索引名', icon: Copy, run: () => copyIdx('源索引名', j.sourceIndex) },
    { key: 'copy-dst-idx', label: '复制目标索引名', icon: Copy, run: () => copyIdx('目标索引名', j.destIndex) },
    { key: 'copy-row', label: '复制作业信息', icon: ClipboardCopy, run: async () => {
      const ok = await copyText(facts);
      store.notify(ok ? 'success' : 'error', ok ? '已复制作业信息' : '复制失败');
    } },
    /* 以此作业新建迁移（只增项不改既有项——xmigrateRowMenu 字面锁零触），
     回填逻辑见 newMigrationFromJob */
    { key: 'new-from-job', label: '以此作业新建迁移', icon: Rocket, run: () => newMigrationFromJob(j) },
    /* 右键直达动作（源/目标索引列与行尾菜单钮共用）：详情/调速（运行中）/续跑（非终态）/中止（运行中）/治理删除（终态） */
    { key: 'open-detail', label: '打开详情', icon: FileSearch, sep: true, run: () => openDetail(j) },
    ...(canJobOps(j) && canDestOps.value && ['FAILED', 'ABORTED', 'INTERRUPTED'].includes(st)
      ? [{ key: 'resume', label: '断点续跑', icon: RotateCcw, run: () => askResume(j) }] : []),
    ...(canJobOps(j) && st === 'RUNNING'
      ? [{ key: 'throttle', label: '调速', icon: Gauge, run: () => openThrottle(j) }] : []),
    ...(canJobOps(j) && st === 'RUNNING'
      ? [{ key: 'abort', label: '中止迁移', icon: OctagonX, danger: true, run: () => void askAbort(j) }] : []),
    ...(XM_TERMINAL_STATUS.includes(st)
      ? [{ key: 'del-job', label: '删除记录（治理）', icon: Trash2, danger: true, run: () => doDeleteJob(j) }] : []),
  ];
});

/* ═══ ：以作业为模板新建迁移 ═══
 job doc 自持 sourceIndex/destIndex/remoteEndpoint（resume 弹窗同源读法），回填
 「1 连接旧集群」（remoteEndpoint 解析 + 命中已存连接档案则选档案，明文不经前端；
 手动回退时密码不回填——凭据不自持不猜）与「2 源索引」「3 目标索引」；
 策略字段 MigrateJobES 同样持久化（destCreateMode/tuneMode/slices/batchSize），随作业
 回填——旧作业缺字段/空值回退 XM_FORM_DEFAULT，建索引方式另挡不可见档位（浏览器模式
 无 FROM_ENTITY，destModes 已过滤）；slices/batchSize 的 0=服务端默认，回填为 null
 还原「自动/默认」placeholder。scrollKeepAliveSec/forceMerge job doc 不自持，维持现值。
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
  const mode = String(j.destCreateMode || '');
  form.value.destCreateMode = destModes.value.some(o => o.k === mode) ? mode : XM_FORM_DEFAULT.destCreateMode;
  form.value.tuneMode = j.tuneMode || XM_FORM_DEFAULT.tuneMode;
  form.value.slices = Number(j.slices) > 0 ? Number(j.slices) : XM_FORM_DEFAULT.slices;
  form.value.batchSize = Number(j.batchSize) > 0 ? Number(j.batchSize) : XM_FORM_DEFAULT.batchSize;
  formOpen.value = true;
  /* 滚回向导区：详情/菜单入口都在页面下方，回填后直接定位第一步（scrollIntoView 缺席环境静默跳过） */
  void nextTick(() => {
    const anchor = document.querySelector('.xm-new');
    if (anchor && typeof (anchor as HTMLElement).scrollIntoView === 'function') {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  store.notify('info', `已按作业 ${j.jobId || ''} 回填源/目标索引${hit ? '与连接档案' : m ? '与连接信息' : ''}与策略（建索引方式/迁移速度/并行路数/批大小），请确认后启动`);
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
  /* 已处理口径 = 新写入（migrated）+ 已存在跳过（conflicts）+ 失败终态（errors）：
     重复迁移场景 migrated 恒 0 时不再假报 0%；进度条/导出 pct 列同一口径（exportTsv/exportMd 均经此函数） */
  return Math.min(100, Math.round((((j.migrated || 0) + (j.conflicts || 0) + (j.errors || 0)) / j.total) * 100));
}
/* W1 的 tfoot Σ 聚合随壳合并 QRT 内建（useAggRow：列头菜单「聚合行」开关，
 es_tbl_agg:xm-jobs 记忆；Σ 作用于过滤后集合——宿主传入的 jobRows 已过滤） */

/* ═══ 健康摘要条（表上方统计芯片，纯前端派生零请求）：平均速率=各作业速率（ΣsliceMigrated/
 耗时，rateOf 既有口径）的算术平均（仅计有速率作业，无可速率=null 不显示）；冲突总数=Σconflicts ═══ */
const healthSummary = computed(() => {
  const list = jobs.value;
  const running = list.filter(j => j.status === 'RUNNING').length;
  const done = list.filter(j => j.status === 'DONE').length;
  const failed = list.filter(j => j.status === 'FAILED').length;
  const aborted = list.filter(j => j.status === 'ABORTED' || j.status === 'INTERRUPTED').length;
  const rates = list.map(j => rateOf(j)).filter((v): v is number => v != null && v > 0);
  const avgRate = rates.length ? Math.round(rates.reduce((s, v) => s + v, 0) / rates.length) : null;
  const conflicts = list.reduce((s, j) => s + (Number(j.conflicts) || 0), 0);
  return { running, done, failed, aborted, avgRate, conflicts };
});

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

/* ═══ 多索引批量迁移（前端循环下发 N 个 start；后端单源单目标契约零改动） ═══
   场景：生产一族索引（如 onshore-bond-basic_* 共 20 个）同步到测试环境（目标加 uat_ 前缀）。
   模式开关切换：关=单源向导（既有行为零变化）；开=快捷清单逐行勾选 + 目标名按
   「源前缀→目标前缀」映射，确认弹层列全部映射对后逐个下发，失败不中断。 */
const batchMode = ref(false);
const batchSel = ref<string[]>([]);
const batchSrcPrefix = ref('');
const batchDstPrefix = ref('');
const batchConfirmOpen = ref(false);
/* ═══ 前缀映射预设（localStorage xm-batch-presets-v1，名称→映射行数组；当前单行前缀对，
   行数组形态留扩展）。读侧坏 JSON 静默丢弃（最坏=预设列表为空，不炸页面） ═══ */
const XM_BATCH_PRESETS_KEY = 'xm-batch-presets-v1';
const batchPresets = ref<Record<string, { srcPrefix: string; dstPrefix: string }[]>>({});
try {
  const rawPresets = localStorage.getItem(XM_BATCH_PRESETS_KEY);
  const parsedPresets = rawPresets ? JSON.parse(rawPresets) : null;
  if (parsedPresets && typeof parsedPresets === 'object' && !Array.isArray(parsedPresets)) batchPresets.value = parsedPresets;
} catch { /* 坏快照静默丢弃 */ }
const batchPresetId = ref<string | null>(null);
const batchPresetName = ref('');
const batchPresetOpts = computed(() => Object.keys(batchPresets.value)
  .sort((a, b) => a.localeCompare(b)).map(k => ({ label: k, value: k })));
function persistBatchPresets() {
  /* 配额满等写失败：提示但不打断（单源写通道吞异常回执布尔） */
  if (!writeStoredRaw(localStorage, XM_BATCH_PRESETS_KEY, JSON.stringify(batchPresets.value))) {
    store.notify('warning', '映射预设保存失败（本地存储不可用）');
  }
}
function onBatchPresetPick(v: string | null) {
  if (!v) return;
  const rows = batchPresets.value[v];
  if (!rows?.length) return;
  batchSrcPrefix.value = rows[0].srcPrefix || '';
  batchDstPrefix.value = rows[0].dstPrefix || '';
  batchPresetName.value = v;
  store.notify('info', `已加载映射预设「${v}」`);
}
function saveBatchPreset() {
  const name = batchPresetName.value.trim();
  if (!name) { store.notify('warning', '先填预设名再保存'); return; }
  batchPresets.value = { ...batchPresets.value, [name]: [{ srcPrefix: batchSrcPrefix.value, dstPrefix: batchDstPrefix.value }] };
  persistBatchPresets();
  batchPresetId.value = name;
  store.notify('success', `映射预设「${name}」已保存`);
}
function delBatchPreset() {
  const name = batchPresetId.value;
  if (!name) return;
  const next = { ...batchPresets.value };
  delete next[name];
  batchPresets.value = next;
  persistBatchPresets();
  batchPresetId.value = null;
  if (batchPresetName.value === name) batchPresetName.value = '';
  store.notify('info', `映射预设「${name}」已删除`);
}
/* ═══ 渐进式下发清单：batchRows=唯一真相（每行状态随完成更新），batchResult 由行集派生；
   phase：idle→(勾选先同步结构)preview→previewed(等确认)→creating→starting→done，
   未勾选时 idle→starting→done ═══ */
interface BatchFlowRow {
  src: string; dst: string;
  state: 'pending' | 'previewing' | 'previewed' | 'preview-fail' | 'creating' | 'created' | 'create-fail' | 'starting' | 'ok' | 'fail';
  reason: string;
  previewCuts?: number;   /* 已预览剔除刀数（planned+reactive） */
  previewReactive?: number; /* 报错兜底剔除刀数（>0 挂风险徽标） */
  req?: any;              /* 保存的 start 参数（失败行一键重下发用） */
}
const batchRows = ref<BatchFlowRow[]>([]);
const batchFlowPhase = ref<'idle' | 'preview' | 'previewed' | 'creating' | 'starting' | 'done'>('idle');
const batchSyncFirst = ref(false);
const batchResult = computed(() => !batchRows.value.length ? null : {
  ok: batchRows.value.filter(r => r.state === 'ok').length,
  fail: batchRows.value.filter(r => r.state === 'fail').map(r => ({ src: r.src, dst: r.dst, reason: r.reason })),
  rows: batchRows.value,
});
/* 汇总文案：进行中「下发中」/终态「已下发」（toast 与面板同口径） */
const batchSummaryText = computed(() => {
  const r = batchResult.value;
  if (!r) return '';
  const done = batchFlowPhase.value === 'done' || batchFlowPhase.value === 'previewed' || batchFlowPhase.value === 'idle';
  const head = done ? '批量迁移已下发' : '批量迁移下发中';
  return `${head}：成功 ${r.ok} / 失败 ${r.fail.length} / 共 ${r.rows.length}`;
});
function batchRowStateText(r: BatchFlowRow): string {
  switch (r.state) {
    case 'pending': return '排队中';
    case 'previewing': return '结构预览中…';
    case 'previewed': return `已预览 ${r.previewCuts ?? 0} 刀（未创建，等待确认）`;
    case 'preview-fail': return '结构预览失败：' + r.reason;
    case 'creating': return '结构创建中…';
    case 'created': return '结构已创建，待下发迁移';
    case 'create-fail': return '创建失败：' + r.reason;
    case 'starting': return '迁移下发中…';
    case 'ok': return '迁移已下发';
    case 'fail': return '下发失败：' + r.reason;
    default: return r.state;
  }
}

function toggleBatchMode() {
  batchMode.value = !batchMode.value;
  /* 关闭即清批量暂态：残留勾选/渐进清单重开时构成幽灵选择；前缀输入保留（重开微调常见） */
  if (!batchMode.value) { batchSel.value = []; batchRows.value = []; batchFlowPhase.value = 'idle'; }
}
function toggleBatchSel(nm: string) {
  const i = batchSel.value.indexOf(nm);
  if (i >= 0) batchSel.value.splice(i, 1);
  else batchSel.value.push(nm);
}
/* 前缀映射：纯字符串前缀替换——源名命中源前缀则替换为「目标前缀+余段」，不命中保持原名。
   两前缀皆空=空前缀恒命中且替换为空=同名迁移 */
function mapBatchDest(src: string, srcPrefix: string, dstPrefix: string): string {
  return src.startsWith(srcPrefix) ? dstPrefix + src.slice(srcPrefix.length) : src;
}
/* 实时映射预览行：非法目标名行内红字标注（idxNameProblem 同源规则），该行不进提交集 */
const batchMapRows = computed(() => batchSel.value.map(nm => {
  const dst = mapBatchDest(nm, batchSrcPrefix.value, batchDstPrefix.value);
  return { src: nm, dst, err: idxNameProblem(dst) };
}));
const batchPairs = computed(() => batchMapRows.value.filter(r => !r.err));
const canBatchStart = computed(() =>
  canDestOps.value &&
  (!connModel.value || !!srcConnId.value) &&
  (srcConnId.value || conn.value.host) &&
  batchPairs.value.length > 0 &&
  (form.value.destCreateMode !== 'FROM_ENTITY' || form.value.indexKey));
/* 批量确认弹层导语用的源端点描述（openStartConfirm srcDesc 同口径） */
const batchSrcDesc = computed(() => srcConnId.value
  ? (pickedConn.value?.name + '（' + pickedConn.value?.scheme + '://' + pickedConn.value?.host + ':' + pickedConn.value?.port + '）')
  : (conn.value.scheme + '://' + conn.value.host + ':' + conn.value.port));
function openBatchConfirm() {
  /* 权限执行体首行门（与 openStartConfirm 同口径） */
  if (!canOps.value || !canDestOps.value) { store.notify('warning', '迁移发起需要源连接与宿主目标集群的迁移写权限'); return; }
  if (!batchPairs.value.length) { store.notify('warning', '先勾选至少一个目标名合法的源索引'); return; }
  batchConfirmOpen.value = true;
}
async function doBatchStart() {
  /* 权限执行体首行门（覆盖弹窗 Enter/程序化通道） */
  if (!canOps.value || !canDestOps.value) { store.notify('warning', '迁移发起需要源连接与宿主目标集群的迁移写权限'); return; }
  if (starting.value) return;
  batchConfirmOpen.value = false;
  /* 复用启动互斥位 starting：顶部 ind-bar 进度条同拍点亮，单源启动钮/确认链互斥 */
  const pairs = batchPairs.value.slice(); /* 循环内勾选变动不影响本拍快照 */
  batchRows.value = pairs.map(p => ({ src: p.src, dst: p.dst, state: 'pending', reason: '' }));
  /* 勾选「先同步结构」：先逐索引 dryRun 预览（不落盘），预览完成停在 previewed 等确认 */
  if (batchSyncFirst.value) {
    starting.value = true;
    batchFlowPhase.value = 'preview';
    try { await runBatchPreview(); } finally { starting.value = false; }
    return;
  }
  starting.value = true;
  batchFlowPhase.value = 'starting';
  try { await startBatchRows(); } finally { starting.value = false; }
  finishBatch();
}
/* 单行 start 参数构造（向导共用策略） */
function buildStartReq(src: string, dst: string): any {
  const req: any = {
    sourceIndex: src, destIndex: dst,
    indexKey: form.value.indexKey || undefined,
    destCreateMode: form.value.destCreateMode, tuneMode: form.value.tuneMode,
    slices: form.value.slices || 0, batchSize: form.value.batchSize || 0,
    scrollKeepAliveSec: form.value.scrollKeepAliveSec || 0, forceMerge: form.value.forceMerge,
  };
  if (srcConnId.value) req.srcConnId = srcConnId.value;
  else req.conn = connBody();
  return req;
}
/* 单行下发：参数落行快照（失败行重试直接复用）；失败不中断由调用方循环语义承担 */
async function startOneRow(r: BatchFlowRow) {
  if (!r.req) r.req = buildStartReq(r.src, r.dst);
  r.state = 'starting';
  try {
    await api.xb.start(r.req, srcConnId.value || undefined);
    r.state = 'ok';
  } catch (e: any) {
    /* 失败不中断：记录后继续下一个，完成后汇总呈现 */
    r.state = 'fail';
    r.reason = friendlyApiError(e);
  }
}
/* 数据下发循环：pending/created 行逐个 start（渐进式更新，每行完成即落状态） */
async function startBatchRows() {
  for (const r of batchRows.value) {
    if (r.state !== 'pending' && r.state !== 'created') continue;
    await startOneRow(r);
  }
}
/* 阶段一（勾选先同步结构）：逐索引 dryRun 预览——剔除计数+风险刀数逐行落状态 */
async function runBatchPreview() {
  for (const r of batchRows.value) {
    if (r.state !== 'pending') continue;
    r.state = 'previewing';
    const req: any = { sourceIndex: r.src, destIndex: r.dst, dryRun: true, syncAliases: syncAliases.value };
    if (srcConnId.value) req.srcConnId = srcConnId.value;
    else req.conn = connBody();
    try {
      const plan = await api.xb.syncStructure(req, srcConnId.value || undefined);
      const secs = sectionsOf(plan);
      r.previewCuts = secs.reduce((s, x) => s + x.count, 0);
      r.previewReactive = secs.find(x => x.key === 'reactive')?.count || 0;
      r.state = 'previewed';
    } catch (e: any) {
      r.state = 'preview-fail';
      r.reason = friendlyApiError(e);
    }
  }
  batchFlowPhase.value = 'previewed';
  const okN = batchRows.value.filter(r => r.state === 'previewed').length;
  const riskN = batchRows.value.filter(r => (r.previewReactive || 0) > 0).length;
  store.notify('info', `结构预览完成：${okN}/${batchRows.value.length} 个索引可同步`
    + (riskN ? `（${riskN} 个含报错兜底剔除，请在清单中核对后确认）` : '——确认后按计划创建并迁移'));
  formOpen.value = false; /* 清单在下发结果区，收起表单露出结果区 */
}
/* 阶段二（预览确认后）：逐个 dryRun=false 创建，创建成功行接续数据下发 */
async function runBatchCreateAndStart() {
  if (starting.value) return;
  starting.value = true;
  batchFlowPhase.value = 'creating';
  try {
    for (const r of batchRows.value) {
      if (r.state !== 'previewed') continue; /* 预览失败行不创建不下发，现场保留待人工处理 */
      r.state = 'creating';
      const req: any = { sourceIndex: r.src, destIndex: r.dst, dryRun: false, syncAliases: syncAliases.value };
      if (srcConnId.value) req.srcConnId = srcConnId.value;
      else req.conn = connBody();
      try {
        await api.xb.syncStructure(req, srcConnId.value || undefined);
        r.state = 'created';
      } catch (e: any) {
        r.state = 'create-fail';
        r.reason = friendlyApiError(e);
      }
    }
    batchFlowPhase.value = 'starting';
    await startBatchRows();
  } finally {
    starting.value = false;
    finishBatch();
  }
}
/* 失败行一键重下发：按行保存的 start 参数原样重试（仅数据下发失败行） */
async function retryBatchFails() {
  if (starting.value) return;
  const fails = batchRows.value.filter(r => r.state === 'fail');
  if (!fails.length) return;
  starting.value = true;
  try {
    for (const r of fails) await startOneRow(r);
  } finally { starting.value = false; }
  finishBatch();
}
/* 终态收口：汇总 toast + 全成功清勾选 + 收起表单 + 刷新作业表 */
function finishBatch() {
  batchFlowPhase.value = 'done';
  const ok = batchRows.value.filter(r => r.state === 'ok').length;
  const fail = batchRows.value.filter(r => r.state === 'fail');
  store.notify(fail.length ? 'warning' : 'success', `批量迁移已下发：成功 ${ok} / 失败 ${fail.length}`,
    fail.length ? { action: { label: '复制失败清单', onClick: () => { void copyBatchFails(); } } } : undefined);
  if (!fail.length) batchSel.value = []; /* 全成功才清勾选；有失败保留便于核对重试 */
  formOpen.value = false;
  loadJobs();
}
/* 失败清单复制：每行一条「源 → 目标：原因」（grep/工单直贴） */
async function copyBatchFails() {
  const list = batchResult.value?.fail || [];
  if (!list.length) return;
  const okCopy = await copyText(list.map(f => `${f.src} → ${f.dst}：${f.reason}`).join('\n'));
  store.notify(okCopy ? 'success' : 'error', okCopy ? `已复制 ${list.length} 条失败明细（每行一条）` : '复制失败');
}

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
/* ═══ 1122：运行中动态调速（RUNNING 行行钮/行菜单入口）——弹层 NInputNumber 调
 api.xb.throttle：rps>0 限速 / -1 恢复不限速 / 0 与空值前端拒绝（0=停写语义，
 停止写入走「中止迁移」不发 0）。target 按作业源连接（abort 同款）；失败（作业已
 转终态/网络）弹层内 role=alert 如实展示，成功 toast + 作业表刷新 ═══ */
const throttleOpen = ref(false);
const throttleJob = ref<any>(null);
const throttleRps = ref<number | null>(-1);
const throttling = ref(false);
const throttleErr = ref('');
function openThrottle(j: any) {
  if (!j || j.status !== 'RUNNING') { store.notify('warning', '仅运行中的作业可调速'); return; }
  throttleJob.value = j;
  /* 回显当前生效速率：job doc 未回传 requestsPerSecond 时默认 -1（不限速） */
  throttleRps.value = j.requestsPerSecond != null ? Number(j.requestsPerSecond) : -1;
  throttleErr.value = '';
  throttleOpen.value = true;
}
async function doThrottle() {
  const j = throttleJob.value;
  if (!j || throttling.value) return;
  const rps = Number(throttleRps.value);
  if (throttleRps.value == null || !Number.isFinite(rps)) {
    store.notify('warning', '先填速率（docs/s）；-1 表示不限速'); return;
  }
  if (rps === 0) { store.notify('warning', '0 不允许：调速到 0 等于停写，如需停止请用「中止迁移」'); return; }
  if (rps < -1) { store.notify('warning', '速率下限 -1（不限速），不支持更小值'); return; }
  throttling.value = true;
  throttleErr.value = '';
  try {
    const r = await api.xb.throttle(String(j.jobId), rps, j.srcConnId || undefined);
    store.notify('success', rps < 0
      ? `已恢复不限速（${r?.jobId || j.jobId}）`
      : `已调速为 ${Number(r?.rps ?? rps)} docs/s（${r?.jobId || j.jobId}）`);
    throttleOpen.value = false;
    loadJobs();
  } catch (e: any) {
    /* 非运行态/网络失败如实展示（不冒充成功、不静默关弹层） */
    throttleErr.value = '调速失败：' + friendlyApiError(e);
  } finally { throttling.value = false; }
}
/* 调速弹层 Enter=提交（resume 弹窗同款；在途不放行） */
useModalEnter(throttleOpen, doThrottle, () => !throttling.value);
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
/* 高级参数折叠壳：details/summary 升档 CollapsePanel（展开钮/计数语汇归组件），本类只留外距 */
.xm-adv-details { margin-top: var(--sp-1); }
/* 数值档 NInputNumber：mono 字号沿原 .inp.mono 档（皮肤归 naive） */
.xm-adv-i { flex: none; }
.xm-adv-i :deep(.n-input__input-el) { font-family: var(--mono, monospace); font-size: var(--fs-xs); }
/* （续跑端口本地皮肤规则随三裸 input 合并 RemoteSourceFields 统一件退役——端口皮肤归组件内 .rsf-port） */

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
/* ── 多选批量迁移（第 2 步勾选清单 / 第 3 步前缀映射 / 确认弹层 / 结果面板） ── */
/* 已选 chips 行：单个移除 × 钮 + 清空 */
.xm-batch-sel { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-1h); margin-bottom: var(--sp-2); }
.xm-batch-x { margin-left: var(--sp-0); padding: 0 3px; border: 0; background: none; color: var(--tx2); cursor: pointer; font-size: var(--fs-xs); line-height: 1; }
.xm-batch-x:hover { color: var(--err); }
/* 清单勾选行：NCheckbox + 索引名 + docs 计数（chip 形态同语言） */
.xm-batch-item { display: inline-flex; align-items: center; gap: var(--sp-1h); padding: 1px var(--sp-1h); border: 1px solid var(--line); border-radius: var(--r-s); font-size: var(--fs-xs); cursor: pointer; }
/* 前缀映射输入行 + 实时预览表 */
.xm-batch-pref { margin-bottom: var(--sp-2); }
.xm-batch-pref .inp { width: min(240px, 100%); }
.xm-batch-tbl { width: 100%; border-collapse: collapse; font-size: var(--fs-xs); }
.xm-batch-tbl th, .xm-batch-tbl td { text-align: left; padding: 3px var(--sp-2); border-bottom: 1px solid var(--line); }
.xm-batch-tbl th { color: var(--tx2); font-weight: 500; }
.xm-batch-err { color: var(--err); margin-left: var(--sp-1h); }
.xm-batch-bad td { color: var(--err); }
/* 确认弹层：REBUILD 横幅与行级红色警示 */
.xm-batch-warn { color: var(--err); font-size: var(--fs-xs); margin-bottom: var(--sp-2); }
.xm-batch-cfm-list { max-height: 240px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.xm-batch-cfm-row { display: flex; align-items: baseline; gap: var(--sp-2); font-size: var(--fs-xs); word-break: break-all; }
.xm-batch-del { color: var(--err); }
/* 批量下发结果面板（表单收起后仍可见）；渐进式清单行样式见 .xm-batch-rows（随渐进清单升级接管旧 ul/li 规则） */
.xm-batch-result { margin: var(--sp-2) var(--sp-4) var(--sp-3); font-size: var(--fs-xs); display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); }
/* 壳 padding 退役，margin 左右落位承接 */
.xm-cfg { margin: var(--sp-3) var(--sp-4) 0; }
.xm-cfg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3); margin-top: var(--sp-3); }
/* 源配置预览两块只读 JsonArea 摘默认框（.ja 的 border/radius 双层框感剥掉，
 deep(.ja) 全站口径——DQ :2181/IH :2181/AR :2；JsonArea 组件本体零触，
 视图 style 追加独立规则；只读预览贴分节底直排） */
.xm-cfg-grid :deep(.ja) { border: none; border-radius: 0; }
/* P2：.xm-cfg-t 类型归全局 .sec-t（fs-sm/600/tx1，.xm-g-hd 先例同款），本类只留落位 */
.xm-cfg-t { margin-bottom: var(--sp-1); }
/* ── 结构同步（sync-structure）：入口行 + 请求层错误面板 + 报告区 ── */
.xm-sync-row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; margin-top: var(--sp-3); }
.xm-sync-inp { width: min(280px, 100%); }
.xm-sync-err { margin-top: var(--sp-2); }
.xm-sync-report { margin-top: var(--sp-3); border-top: 1px solid var(--line); padding-top: var(--sp-2); display: flex; flex-direction: column; gap: var(--sp-2); }
.xm-sync-hd { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
/* created=false 的失败头：红字定性（lastError 缺席时只有定性，不冒充原因） */
.xm-sync-lasterr { color: var(--err); font-size: var(--fs-xs); word-break: break-all; }
.xm-sync-sec { display: flex; flex-direction: column; gap: var(--sp-1); }
.xm-sync-t { margin-bottom: 0; }
/* 剔除清单行：code chip（全局 code:not(pre code) 自带 anywhere 换行）+ 弱化原因小字 */
.xm-sync-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--sp-1); }
.xm-sync-list li { display: flex; align-items: baseline; gap: var(--sp-2); flex-wrap: wrap; font-size: var(--fs-xs); }
.xm-sync-why { color: var(--tx2); font-size: var(--fs-xs); word-break: break-all; }
.xm-sync-tbl { width: 100%; border-collapse: collapse; font-size: var(--fs-xs); }
.xm-sync-tbl th, .xm-sync-tbl td { text-align: left; padding: 3px var(--sp-2); border-bottom: 1px solid var(--line); word-break: break-all; }
.xm-sync-tbl th { color: var(--tx2); font-weight: 500; }
/* 警告条逐条（warn 色区分于剔除清单的中性原因） */
.xm-sync-warns { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--sp-1); }
.xm-sync-warns li { color: var(--warn); font-size: var(--fs-xs); word-break: break-all; }
.xm-sync-allpass { color: var(--ok); font-size: var(--fs-xs); display: inline-flex; align-items: center; gap: var(--sp-1); }
.xm-sync-next { display: flex; gap: var(--sp-2); }
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
/* 1122：手搓进度条样式（.xm-p-track/.xm-p-fill/.xm-p-indet + 两 keyframes）随
 ProgressTrack 接线整体退役——轨道/填充/不确定态动画归组件 .pt-* 单源 */
/* 进度 meta 换壳 MetaStrip——字号/mono/分隔归组件 .ms，wrapper 只留与进度条的
 间距（margin-top 3px 为视觉刻意值豁免保字面，--sp 梯无 3 档，与 .xm-sfails 同族）；
 原本地 xm-p-run（ac）/xm-p-ok（ok）色档规则随装退役，语义分档由 items tone（info/ok）承担 */
.xm-p-meta { margin-top: 3px; }
/* 观测行：耗时 + 速率 docs/s（旧 JSON 无新字段时不渲染）；
 margin-top 2px 合并 --sp-0 半档（ --sp 裸值合并） */
.xm-p-obs { font-size: var(--fs-2xs); color: var(--tx2); margin-top: var(--sp-0); display: flex; gap: var(--sp-1); }
/* 失败切片红 chip（sliceErrors 有值的切片）：进度列一眼锁定失败现场，不必展开 */
.xm-sfails { display: flex; flex-wrap: wrap; gap: var(--sp-1); margin-top: 3px; }
/* 速率趋势线（SparkLine svg 自带 display:block）——与 .xm-sfails 同款 3px 视觉间距 */
.xm-p-spark { margin-top: 3px; }
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
/* 条数三档切换（.seg 全局形态；margin-left:auto 钉行尾——过滤词宽度变化不推移档位） */
.xm-jobs-limit { margin-left: auto; }
/* ═══ 作业详情回放弹窗六区 ═══ */
.xm-detail { display: flex; flex-direction: column; gap: var(--sp-3); }
.xm-detail-sec { border-top: 1px solid var(--line); padding-top: var(--sp-2); }
.xm-detail-sec:first-child { border-top: 0; padding-top: 0; }
.xm-detail-t { display: flex; align-items: center; gap: var(--sp-1h); margin-bottom: var(--sp-1h); }
.xm-detail-cp-btn { margin-left: auto; }
.xm-detail-pre { margin: 0; padding: var(--sp-1h) var(--sp-2); background: var(--bg1); border: 1px solid var(--line); border-radius: var(--r-s); font-size: var(--fs-xs); white-space: pre-wrap; word-break: break-all; max-height: 160px; overflow-y: auto; }
.xm-detail-list { margin: 0; padding: 0; list-style: none; max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.xm-detail-list li { padding: 2px var(--sp-2); background: var(--bg1); border: 1px solid var(--line); border-radius: var(--r-xs); font-size: var(--fs-xs); word-break: break-all; }
.xm-detail-none { font-size: var(--fs-xs); }
.xm-detail-note { font-size: var(--fs-xs); color: var(--tx2); line-height: 1.6; }
.xm-detail-tbl { width: 100%; border-collapse: collapse; font-size: var(--fs-xs); }
.xm-detail-tbl th, .xm-detail-tbl td { text-align: left; padding: 3px var(--sp-2); border-bottom: 1px solid var(--line); }
.xm-detail-tbl th { color: var(--tx2); font-weight: 500; }
.xm-detail-tbl tr.xm-detail-sfail td { color: var(--err); }
.xm-detail-cp { margin: 0; }
/* 目标对账区：错误态红字与结果行（源/目标计数 + diff 徽标同排） */
.xm-detail-rc-err { font-size: var(--fs-xs); color: var(--err); }
.xm-detail-rc-row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; font-size: var(--fs-xs); }
.xm-detail-rc-diff { color: var(--err); font-size: var(--fs-xs); }
/* ── 结构同步·兼容计划弹层（dryRun 预览）与预检报告弹层 ── */
.xm-plan { display: flex; flex-direction: column; gap: var(--sp-2); }
.xm-plan-hd { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
/* 源→目标 vendor 芯片对：阿里云 ES 7.10 → 腾讯云 ES 7.14（unknown 如实显示） */
.xm-plan-vendor { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.xm-plan-var { color: var(--tx2); flex-shrink: 0; }
.xm-plan-alias-row { display: flex; align-items: center; gap: var(--sp-1h); flex-wrap: wrap; font-size: var(--fs-xs); }
.xm-plan-skip { color: var(--tx2); border-color: var(--line); }
.xm-plan-ft { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.xm-plan-ft-tip { font-size: var(--fs-xs); }
/* 1122 v3：适配后 body 预览折叠壳落位（JsonArea 摘默认框同 .xm-cfg-grid 口径） */
.xm-plan-body-cp { width: 100%; }
.xm-plan-body-cp :deep(.ja) { border: none; border-radius: 0; }
/* 预检报告弹层：画像区（字段类型分布/源别名 chips + advice 动作芯片行） */
.xm-pf { display: flex; flex-direction: column; gap: var(--sp-3); }
/* 1122：预检头部行（预估 MetaStrip + 能力对比入口同排，按钮钉右） */
.xm-pf-hd { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.xm-pf-hd .ms { flex: 1; }
/* 能力对比 risks 矩阵行：severity 徽标 + message + action 建议 */
.xm-pf-risks { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--sp-1); }
.xm-pf-risk { display: flex; align-items: baseline; gap: var(--sp-2); flex-wrap: wrap; font-size: var(--fs-xs); }
.xm-pf-risk-act { word-break: break-all; }
.xm-pf-sec { display: flex; flex-direction: column; gap: var(--sp-1h); }
.xm-pf-chips { display: flex; flex-wrap: wrap; gap: var(--sp-1h); }
.xm-pf-adv { display: flex; align-items: baseline; gap: var(--sp-2); flex-wrap: wrap; font-size: var(--fs-xs); }
.xm-pf-act { cursor: pointer; flex-shrink: 0; }
.xm-pf-msg { color: var(--tx2); word-break: break-all; }
.xm-pf-detail { flex-basis: 100%; padding: var(--sp-1) var(--sp-2); border-left: 2px solid var(--warn); color: var(--tx2); background: var(--bg1); border-radius: var(--r-xs); word-break: break-all; }
/* 同步警告折叠壳落位 */
.xm-sync-warns-cp { margin: 0; }
/* ── 批量区：映射预设行 / 先同步结构开关 / 渐进式下发清单 ── */
.xm-batch-preset { margin-bottom: var(--sp-2); }
.xm-batch-preset .inp { width: 140px; }
.xm-batch-syncfirst { margin-top: var(--sp-2); }
.xm-batch-rows { margin: 0; padding: 0; list-style: none; flex-basis: 100%; display: flex; flex-direction: column; gap: 2px; }
.xm-batch-rows li { word-break: break-all; color: var(--tx2); }
.xm-batch-rows li.xm-batch-row-fail { color: var(--err); }
.xm-batch-row-st { color: inherit; }
.xm-batch-risk { border-color: var(--warn); color: var(--warn); font-size: var(--fs-2xs); margin-left: var(--sp-1h); }
/* 批量清单独立过滤框（窗口化：默认 50+显示更多步进） */
.xm-remote-kw { width: min(280px, 100%); margin-bottom: var(--sp-2); }
.xm-r-more-btn { align-self: center; }
/* ── 健康摘要条（表上方统计芯片，纯前端派生） ── */
.xm-health { display: flex; align-items: center; gap: var(--sp-1h); padding: var(--sp-2) var(--sp-4) 0; flex-wrap: wrap; }
.xm-h-ok { border-color: var(--ok-line); color: var(--ok); }
.xm-h-err { border-color: var(--err-line); color: var(--err); }
.xm-h-warn { border-color: var(--warn-line); color: var(--warn); }
/* ── 详情弹窗：事件时间线（第七区，level 着色）与底部动作行 ── */
/* 1122：容器限高内滚（长作业时间线不撑爆弹层）+ 滚动锚（自动滚动 scrollTop=0=最新在上） */
.xm-ev-line { display: flex; flex-direction: column; gap: var(--sp-0); border-left: 2px solid var(--line); padding-left: var(--sp-2); margin-left: var(--sp-1); max-height: 280px; overflow-y: auto; }
/* 筛选芯片行（固定头不随内容滚）+ 自动滚动开关（AdhocRebuild ar-ev-tools 同形态） */
.xm-ev-tools { display: flex; align-items: center; gap: var(--sp-1h); flex-wrap: wrap; margin: var(--sp-1) 0 var(--sp-1h); }
.xm-ev-fchip { cursor: pointer; }
.xm-ev-autoscroll { margin-left: auto; }
/* 跨天段头：今天/昨天/MM-DD（dayLabel 单源）——浅档弱化不抢事件行视觉 */
.xm-ev-day { font-size: var(--fs-2xs); color: var(--tx1); font-weight: 600; padding: var(--sp-1h) 0 var(--sp-0); position: sticky; top: 0; background: var(--n-color, var(--bg1)); z-index: 1; }
.xm-ev { display: flex; align-items: baseline; gap: var(--sp-2); padding: var(--sp-0) var(--sp-1h); font-size: var(--fs-xs); }
.xm-ev-info { color: var(--tx2); }
.xm-ev-warn { background: color-mix(in srgb, var(--warn) 12%, transparent); }
.xm-ev-error { background: color-mix(in srgb, var(--err) 12%, transparent); }
.xm-ev-ts { color: var(--tx2); flex-shrink: 0; }
.xm-ev-msg { color: var(--tx2); word-break: break-all; }
.xm-detail-ft { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
/* ── 1122 运行中调速弹层：速率输入行（NInputNumber+Tip 语义说明） ── */
.xm-throttle-row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; margin-bottom: var(--sp-2); }
.xm-throttle-inp { width: 110px; }
.xm-throttle-inp :deep(.n-input__input-el) { font-family: var(--mono, monospace); }
.xm-throttle-what { cursor: help; font-size: var(--fs-xs); }
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
