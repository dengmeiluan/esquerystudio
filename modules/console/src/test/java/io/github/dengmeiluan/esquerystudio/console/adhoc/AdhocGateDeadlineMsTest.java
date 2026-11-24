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

package io.github.dengmeiluan.esquerystudio.console.adhoc;

import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import org.junit.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 门超时死线透出（toMap 的 {@code gateDeadlineMs}）测试。
 *
 * <p><b>本断言声称防的失败模式</b>：控制台只有 {@code awaitConfirmSince}（进了门）而拿不到
 * 「还有多久超时」——超时预算 {@code confirmTimeoutMs} 是服务端配置，前端无从得知，
 * 倒计时/超时提示只能瞎猜。透出 {@code gateDeadlineMs = awaitConfirmSince + confirmTimeoutMs}
 * 后，未进门为 null（字段缺席不渲染），进门即有确定死线。</p>
 *
 * <p>直接驱动生产方法 {@link AdhocRebuildService#awaitSwitchConfirm}（confirmTimeoutMs=0
 * 立即超时收尾，与既有门竞态测试同一手法），判别落在 toMap 输出的真实数值上。</p>
 */
public class AdhocGateDeadlineMsTest {

    private static AdhocRebuildJob pausingJob(String jobId) {
        return new AdhocRebuildJob(jobId, "logical", AdhocRebuildJob.Strategy.WRITE_BLOCK,
                true, "src_idx", "dest_idx", "updateTime", 120_000L, false, true);
    }

    /** 未进门/未裁决：gateDeadlineMs 缺席（null），控制台按字段缺席不渲染。 */
    @Test
    public void toMap_gateDeadlineAbsentBeforeEnteringGate() {
        assertThat(pausingJob("job-idle").toMap().get("gateDeadlineMs"))
                .as("未进入 AWAIT_CONFIRM 时不得伪造死线")
                .isNull();
    }

    /** 进门即透出：gateDeadlineMs == awaitConfirmSince + confirmTimeoutMs（此处 timeout=0，死线即进门时刻）。 */
    @Test
    public void awaitSwitchConfirm_publishesDeadlineOnEnteringGate() throws Exception {
        AdhocRebuildService service = new AdhocRebuildService(new EsIndexAdmin(null) {
            @Override
            public void setIndexWriteBlock(String index, boolean writeBlocked) {
                // no-op：WRITE_BLOCK 超时路径会尝试解除阻断
            }
        }, () -> null, 0L);
        AdhocRebuildJob job = pausingJob("job-gate");

        service.awaitSwitchConfirm(job); // timeout=0：立即走超时收尾

        Object deadline = job.toMap().get("gateDeadlineMs");
        assertThat(deadline).as("进入门后死线必须透出（数值型）").isInstanceOf(Number.class);
        assertThat(((Number) deadline).longValue())
                .as("gateDeadlineMs = awaitConfirmSince + confirmTimeoutMs（同源计算，不另取时钟）")
                .isEqualTo(job.getAwaitConfirmSince() + 0L);
    }

    /** 非零超时配置下差值恰为 confirmTimeoutMs（防「死线=进门时刻」的恒等实现碰巧通过上一条）。 */
    @Test
    public void awaitSwitchConfirm_deadlineIncludesConfiguredTimeout() throws Exception {
        AdhocRebuildService service = new AdhocRebuildService(new EsIndexAdmin(null) {
            @Override
            public void setIndexWriteBlock(String index, boolean writeBlocked) {
                // no-op
            }
        }, () -> null, 1L); // 1ms：首轮循环即超时（超时判定先于 sleep）
        AdhocRebuildJob job = pausingJob("job-gate-1ms");

        service.awaitSwitchConfirm(job);

        assertThat(((Number) job.toMap().get("gateDeadlineMs")).longValue())
                .isEqualTo(job.getAwaitConfirmSince() + 1L);
    }

    /** retry 复位后死线归零（新一轮未进门不得残留上一轮死线）。 */
    @Test
    public void resetForRetry_clearsGateDeadline() throws Exception {
        AdhocRebuildService service = new AdhocRebuildService(new EsIndexAdmin(null) {
            @Override
            public void setIndexWriteBlock(String index, boolean writeBlocked) {
                // no-op
            }
        }, () -> null, 0L);
        AdhocRebuildJob job = pausingJob("job-again");
        service.awaitSwitchConfirm(job);
        assertThat(job.toMap().get("gateDeadlineMs")).isNotNull();

        job.resetForRetry();

        assertThat(job.toMap().get("gateDeadlineMs"))
                .as("重试复位后应回到未进门语义（null）")
                .isNull();
    }
}
