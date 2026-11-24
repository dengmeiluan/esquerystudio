/*
 * Copyright 2026 Meiluan Deng
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package io.github.dengmeiluan.esquerystudio.console.xmigrate;

/**
 * 发起一次跨集群迁移的请求（面板 {@code POST start} 的 body）。
 *
 * <p>{@link #conn} 承载旧集群凭据，仅在内存流转，绝不持久化（见 {@link RemoteClusterConn}）。
 * 数值/枚举字段为空或非正时由 {@code CrossClusterMigrateService} 用 starter 默认配置回填。</p>
 */
public class MigrateRequest {

    /** 旧集群连接（含凭据，瞬态）。 */
    private RemoteClusterConn conn;

    /**
     *  可选：已存连接档案 id（与手输 {@link #conn} 二选一，非空优先）——
     * 服务端按 id 从控制集群取全量档案（含密码），明文不经前端回传；
     * 控制器层同时校验当前登录角色满足该档案的 minRole。
     */
    private String srcConnId;

    /** 旧集群源索引名（必填）。 */
    private String sourceIndex;

    /** 新集群目标索引名（必填）。 */
    private String destIndex;

    /** 可选：已注册的 indexKey；{@link DestCreateMode#FROM_ENTITY} 时必填。 */
    private String indexKey;

    /** 目标索引创建模式，默认 {@link DestCreateMode#NONE}。 */
    private DestCreateMode destCreateMode = DestCreateMode.NONE;

    /** 调优档，默认 {@link TuneMode#AGGRESSIVE}。 */
    private TuneMode tuneMode = TuneMode.AGGRESSIVE;

    /** sliced scroll 路数 / worker 数；≤0 用默认。 */
    private int slices;

    /** 每 scroll/bulk 批大小；≤0 用默认。 */
    private int batchSize;

    /** scroll 上下文存活秒；≤0 用默认。 */
    private int scrollKeepAliveSec;

    /** 收尾是否 forceMerge（默认 false，重操作按需开）。 */
    private boolean forceMerge;

    public RemoteClusterConn getConn() { return conn; }
    public void setConn(RemoteClusterConn conn) { this.conn = conn; }
    public String getSrcConnId() { return srcConnId; }
    public void setSrcConnId(String srcConnId) { this.srcConnId = srcConnId; }
    public String getSourceIndex() { return sourceIndex; }
    public void setSourceIndex(String sourceIndex) { this.sourceIndex = sourceIndex; }
    public String getDestIndex() { return destIndex; }
    public void setDestIndex(String destIndex) { this.destIndex = destIndex; }
    public String getIndexKey() { return indexKey; }
    public void setIndexKey(String indexKey) { this.indexKey = indexKey; }
    public DestCreateMode getDestCreateMode() { return destCreateMode; }
    public void setDestCreateMode(DestCreateMode destCreateMode) { this.destCreateMode = destCreateMode; }
    public TuneMode getTuneMode() { return tuneMode; }
    public void setTuneMode(TuneMode tuneMode) { this.tuneMode = tuneMode; }
    public int getSlices() { return slices; }
    public void setSlices(int slices) { this.slices = slices; }
    public int getBatchSize() { return batchSize; }
    public void setBatchSize(int batchSize) { this.batchSize = batchSize; }
    public int getScrollKeepAliveSec() { return scrollKeepAliveSec; }
    public void setScrollKeepAliveSec(int scrollKeepAliveSec) { this.scrollKeepAliveSec = scrollKeepAliveSec; }
    public boolean isForceMerge() { return forceMerge; }
    public void setForceMerge(boolean forceMerge) { this.forceMerge = forceMerge; }
}
