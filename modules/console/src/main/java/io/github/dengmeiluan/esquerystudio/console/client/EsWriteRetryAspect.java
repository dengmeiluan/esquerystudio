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

package io.github.dengmeiluan.esquerystudio.console.client;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.core.annotation.Order;

/**
 * ES 写操作横切之「重试」切面：业务侧（client）机制。
 *
 * <p><b> #70</b>：本切面拦的是<b>业务应用自己</b>的 ES 写入，因此与 {@code ConsoleAssetGuard}、
 * {@code StaleWriteBlockDetector} 同属 {@code client} 包，并在两种模式下都装配。
 * 此前它被放进 {@code ConsoleModeConfiguration}，导致唯一的受益方——业务应用——反而没有它。</p>
 *
 * <p><b>为什么不再有「重建窗口」闸门</b>：原实现要求 {@code RebuildAuditStore.isWindowOpen(indexKey)}
 * 为真才重试。 之后重建状态只活在 宿主，业务侧既拿不到该信息也不该拿；且
 * {@code RebuildAuditStore} 与整个 {@code audit/} 包在阶段⑤删除清单上。
 * 判定「可否重试」的真正安全边界是 {@link EsWriteRetryTemplate} 的异常识别——
 * cluster_block / 429 / 网络抖动是<b>自解释</b>的瞬时失败，无需知道是否有重建在跑；
 * 其余异常一律立即抛出。故闸门去除后保护范围扩大到<b>任何</b>瞬时写失败，这是改进而非副作用。</p>
 *
 * <p>幂等性前提见 {@link EsWriteRetryTemplate}：save 为按 _id upsert、delete 按 _id/query，
 * 均幂等，故整段写操作重试安全。</p>
 *
 * <p>顺序 Order(1)；原与 {@code EsOpsAuditAspect} Order(0) 外层配对，后者已随阶段⑤退役。</p>
 *
 * @author aicoding
 */
@Aspect
@Order(1)
public class EsWriteRetryAspect {

    private final EsWriteRetryTemplate retryTemplate;

    public EsWriteRetryAspect(EsWriteRetryTemplate retryTemplate) {
        this.retryTemplate = retryTemplate;
    }

    @Around("execution(* org.springframework.data.elasticsearch.core.ElasticsearchOperations+.save(..))"
            + " || execution(* org.springframework.data.elasticsearch.core.ElasticsearchOperations+.delete(..))"
            + " || execution(* org.springframework.data.elasticsearch.core.ElasticsearchOperations+.index(..))"
            + " || execution(* org.springframework.data.elasticsearch.core.ElasticsearchOperations+.bulkIndex(..))"
            + " || execution(* org.springframework.data.elasticsearch.core.ElasticsearchOperations+.bulkUpdate(..))"
            + " || execution(* org.springframework.data.elasticsearch.core.ElasticsearchOperations+.update(..))")
    public Object retryAround(ProceedingJoinPoint pjp) throws Throwable {
        String action = pjp.getSignature().toShortString();
        return retryTemplate.execute(action, () -> {
            try {
                return pjp.proceed();
            } catch (Error err) {
                throw err;
            } catch (Exception ex) {
                throw ex;
            } catch (Throwable t) {
                throw new RuntimeException("非预期 Throwable 被切面捕获 (action=" + action + "): " + t.getMessage(), t);
            }
        });
    }
}
