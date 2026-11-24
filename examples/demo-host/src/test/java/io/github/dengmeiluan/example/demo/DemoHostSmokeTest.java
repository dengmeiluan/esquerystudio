package io.github.dengmeiluan.example.demo;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.web.server.LocalServerPort;
import org.springframework.http.ResponseEntity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 示例宿主冒烟：空环境起完整上下文——嵌入式形态（mode=console）下
 * 控制台入口页、Setup 向导、实体自动注册扫描器全部就位。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"esquerystudio.elasticsearch.console.home-dir=target/demo-bootstrap",
                "esquerystudio.elasticsearch.console.sqlite-path=target/demo-bootstrap/jobs.db"})
class DemoHostSmokeTest {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate rest;

    @Test
    public void bootsEmbeddedConsoleWithoutAnyHost() {
        ResponseEntity<String> page =
                rest.getForEntity("http://localhost:" + port + "/esquerystudio.html", String.class);
        assertEquals(200, page.getStatusCodeValue(), "console entry page must be served");

        ResponseEntity<String> status =
                rest.getForEntity("http://localhost:" + port + "/internal/es/index/setup/status", String.class);
        assertEquals(200, status.getStatusCodeValue(), "setup status must answer");
        assertTrue(status.getBody().contains("\"bound\":false"),
                "fresh demo must start unbound (Setup wizard first): " + status.getBody());
    }
}
