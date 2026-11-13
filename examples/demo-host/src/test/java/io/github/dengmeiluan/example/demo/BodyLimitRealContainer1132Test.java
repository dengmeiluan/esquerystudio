package io.github.dengmeiluan.example.demo;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 1132：写请求体积门在**真实 Tomcat** 下不得误伤正常请求。
 *
 * <p>背景：拦截器新增了「写请求必须带 Content-Length」的判定（防 chunked 绕过 32MB 上限）。
 * 这条规则一旦判错，会把所有正常写请求打成 411——而单测用的是手写桩，
 * 桩的 `getContentLengthLong()` 行为与真实容器未必一致。所以必须有真容器覆盖：
 * 发一个真实 POST，确认拿到的是业务响应（401/400 等）而不是 411。</p>
 *
 * <p>用 {@code /auth/login} 作为探针：它在未绑定集群时也在白名单内可直达控制器，
 * 且不依赖任何外部 ES。</p>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"esquerystudio.elasticsearch.console.home-dir=target/demo-body-probe",
                "esquerystudio.elasticsearch.console.sqlite-path=target/demo-body-probe/jobs.db"})
class BodyLimitRealContainer1132Test {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate rest;

    private ResponseEntity<String> postLogin(String json) {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        return rest.postForEntity("http://localhost:" + port + "/internal/es/index/auth/login",
                new HttpEntity<>(json, h), String.class);
    }

    @Test
    void 正常JSON登录请求不被体积门误拦() {
        ResponseEntity<String> r = postLogin("{\"username\":\"nobody\",\"password\":\"x\"}");
        assertTrue(r.getStatusCodeValue() != 411,
                "正常带 Content-Length 的写请求不得被判 411（实际 " + r.getStatusCodeValue() + "）");
        /* 业务层应当拒绝这个账号（不存在/口令错），但**不是**体积门 */
        /* 未绑定集群时拦截器先给 409 SETUP_REQUIRED（设计如此）；关键是**不是 411**。
           这条断言的目的是证明体积门没有误伤正常写请求，不绑定具体业务码。 */
        assertTrue(r.getStatusCodeValue() < 500,
                "应返回业务拒绝而非 5xx（实际 " + r.getStatusCodeValue() + "）");
    }

    @Test
    void 空体登录请求同样不被体积门误拦() {
        /* 空 JSON：Content-Length=0，是最容易被「<0 才算未知」判错打到的边界 */
        ResponseEntity<String> r = postLogin("{}");
        assertTrue(r.getStatusCodeValue() != 411,
                "空体写请求不得被判 411（实际 " + r.getStatusCodeValue() + "）");
    }

    /**
     * 超出上限的写请求必须被拒（真容器）。
     *
     * <p>实测：33MB 请求在到达拦截器之前就被 Tomcat 断开（`Connection reset by peer`），
     * 因为容器层有更早的体积保护。所以这里同时接受两种拒绝形态——
     * 「连接被断」或「413」——**只要不是被当作正常请求处理**。
     * 拦截器的 413 分支是纵深防御的第二层（例如容器 maxPostSize 被调大时兜底），
     * 单测已直接覆盖该分支。</p>
     */
    @Test
    void 超出上限的写请求在真容器里被拒() {
        StringBuilder sb = new StringBuilder("{\"username\":\"");
        while (sb.length() < 33 * 1024 * 1024) sb.append('a');
        sb.append("\",\"password\":\"x\"}");
        try {
            ResponseEntity<String> r = postLogin(sb.toString());
            assertEquals(413, r.getStatusCodeValue(),
                    "若容器放行到应用层，拦截器必须 413（实际 " + r.getStatusCodeValue() + "）");
            assertTrue(String.valueOf(r.getBody()).contains("BODY_TOO_LARGE"),
                    "拒绝语义要说清上限：" + r.getBody());
        } catch (org.springframework.web.client.ResourceAccessException reset) {
            /* 容器先断：同样是「没有被当作正常请求处理」，符合预期 */
            assertTrue(String.valueOf(reset.getMessage()).contains("reset")
                            || String.valueOf(reset.getMessage()).contains("Connection"),
                    "只接受连接层拒绝：" + reset.getMessage());
        }
    }
}
