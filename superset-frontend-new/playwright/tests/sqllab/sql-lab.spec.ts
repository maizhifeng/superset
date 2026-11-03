import { test, expect, type Locator, type Page } from "@playwright/test";
import { loginViaUi } from "../../helpers/credentials";

// The SQL Lab remembers the last database/schema in localStorage; seeding them
// avoids having to drive the database picker before running a query.
const SQL_DATABASE_ID = process.env.E2E_SQL_DATABASE ?? "2";
const SQL_SCHEMA = process.env.E2E_SQL_SCHEMA ?? "inland_sdk_log";

/**
 * Open /sqllab with a preselected database and switch the first query tab from
 * the visual builder to the SQL editor, which is what renders CodeMirror.
 */
async function openSqlEditor(page: Page): Promise<Locator> {
  await page.evaluate(
    ([databaseId, schema]) => {
      window.localStorage.setItem("superset-sql-lab-last-database", databaseId);
      window.localStorage.setItem("superset-sql-lab-last-schema", schema);
    },
    [SQL_DATABASE_ID, SQL_SCHEMA] as const,
  );
  await page.goto("/sqllab");

  const switchToSql = page.getByRole("button", {
    name: "跳转到 SQL 编辑器",
  });
  await expect(switchToSql).toBeVisible({ timeout: 10000 });
  await switchToSql.click();

  const editor = page.locator(".cm-content").first();
  await expect(editor).toBeVisible({ timeout: 10000 });
  return editor;
}

test.describe("SQL Lab", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUi(page);
    await page.waitForURL("/", { timeout: 15000 });
  });

  test("does not bulk-prefetch column metadata for every table", async ({
    page,
  }) => {
    // 逐表列元数据请求：GET /api/v1/database/{id}/table/{table}/{schema}/。
    // 注意 /tables/（复数，表清单接口）不能被这个正则匹配到。
    const metadataRequests: string[] = [];
    page.on("request", (request) => {
      if (/\/api\/v1\/database\/\d+\/table\//.test(request.url())) {
        metadataRequests.push(request.url());
      }
    });

    // 表清单返回即旧实现开始全量预取的时刻：改前会立刻以 CONCURRENCY=4
    // 逐批发出 1035 张表（inland_sdk_log）的列元数据请求，约 13 分钟发完。
    const tablesLoaded = page.waitForResponse(
      (response) =>
        /\/api\/v1\/database\/\d+\/tables\//.test(response.url()) &&
        response.status() === 200,
      { timeout: 30000 },
    );
    await openSqlEditor(page);
    await tablesLoaded;

    // 5s 窗口内不展开任何表：不应有任何逐表元数据请求，更不允许批量增长。
    await page.waitForTimeout(5000);
    expect(metadataRequests.length).toBeLessThan(10);
    // 强断言：改前首批 4 个请求会在表清单返回后立即发出，这里必然 > 0。
    expect(metadataRequests).toHaveLength(0);
  });

  test("format uses the shared dataset-edit formatter (uppercase keywords)", async ({
    page,
  }) => {
    const editor = await openSqlEditor(page);
    await editor.click();
    await editor.fill("select a,b,count(*) as c from t where x=1 and y=2");

    await page.getByRole("button", { name: "格式化" }).first().click();

    // 与 /dataset/edit 的 SqlQueryEditor 共用 formatSqlText：方言感知 +
    // 关键字大写 + 换行缩进；此前 SQL Lab 用通用方言且保留小写。
    await expect
      .poll(async () => (await editor.innerText()).slice(0, 120), {
        timeout: 5000,
      })
      .toContain("SELECT");
    const formatted = await editor.innerText();
    expect(formatted).toContain("FROM");
    expect(formatted).toContain("AS c");
    expect(formatted).not.toMatch(/\bselect\b/);
  });

  test("SQL editor uses the shared mono font stack (same as dataset edit)", async ({
    page,
  }) => {
    const editor = await openSqlEditor(page);
    await expect(editor).toBeVisible();

    const style = await editor.evaluate((el) => {
      const content = getComputedStyle(el);
      const scroller = el.closest(".cm-scroller");
      return {
        fontFamily: content.fontFamily,
        scrollerFontFamily: scroller
          ? getComputedStyle(scroller).fontFamily
          : "",
        fontSize: content.fontSize,
      };
    });

    // 数据集编辑页 SqlQueryEditor 用 @/theme/typography 的 monoFontFamily；
    // SQL Lab 此前硬编码字体栈（缺 JetBrains Mono），Windows 上会回退到
    // Consolas 导致两处编辑器字形不一致。
    expect(style.fontFamily).toContain("JetBrains Mono");
    expect(style.fontFamily).toContain("Cascadia Code");
    expect(style.fontFamily).toContain("Consolas");
    expect(style.scrollerFontFamily).toContain("JetBrains Mono");
    expect(style.fontSize).toBe("13px");
  });

  test("database browser is distinct from the page in notion theme", async ({
    page,
  }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        "starfly-theme",
        JSON.stringify({ state: { theme: "notion" }, version: 0 }),
      );
      localStorage.setItem("superset-sql-lab-last-database", "2");
      localStorage.setItem("superset-sql-lab-last-schema", "inland_sdk_log");
      localStorage.setItem("superset-sql-lab-sidebar-open", "1");
    });
    await page.goto("/sqllab");
    await page
      .getByRole("button", { name: "跳转到 SQL 编辑器" })
      .first()
      .click();

    const title = page.getByText("数据库浏览器", { exact: true });
    await expect(title).toBeVisible({ timeout: 10000 });

    // notion 主题下 body 与 Paper 曾同为 #ffffff 且无阴影 → 侧边栏完全不可见。
    const { sidebarBg, bodyBg } = await title.evaluate((el) => {
      let node: HTMLElement | null = el as HTMLElement;
      while (node && !node.classList?.contains("MuiPaper-root")) {
        node = node.parentElement;
      }
      return {
        sidebarBg: node ? getComputedStyle(node).backgroundColor : "",
        bodyBg: getComputedStyle(document.body).backgroundColor,
      };
    });
    expect(sidebarBg).not.toBe(bodyBg);

    // 收起 / 展开按钮可用（收起态同样需要可见）。
    await page.getByRole("button", { name: "隐藏数据库浏览器" }).click();
    await expect(
      page.getByRole("button", { name: "显示数据库浏览器" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "显示数据库浏览器" }).click();
    await expect(title).toBeVisible();
  });

  test("editor and results are side by side on wide screens, stacked when narrow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1640, height: 980 });
    const editor = await openSqlEditor(page);
    await expect(editor).toBeVisible();

    const content = page.getByTestId("sqllab-content");
    await expect(content).toHaveAttribute("data-layout", "side-by-side");

    const editorBox = await page
      .getByTestId("sqllab-editor-pane")
      .boundingBox();
    const resultsBox = await page
      .getByTestId("sqllab-results-pane")
      .boundingBox();
    expect(editorBox && resultsBox).toBeTruthy();
    if (editorBox && resultsBox) {
      // 左右分布：结果区在编辑区右侧，且两栏高度接近（编辑器铺满高度）。
      expect(resultsBox.x).toBeGreaterThan(editorBox.x + editorBox.width - 4);
      expect(Math.abs(resultsBox.height - editorBox.height)).toBeLessThan(40);
    }

    // 窄屏回退为上下堆叠。
    await page.setViewportSize({ width: 1000, height: 800 });
    await expect(content).toHaveAttribute("data-layout", "stacked");
  });

  test("shows an explicit permission message when execute is forbidden", async ({
    page,
  }) => {
    const editor = await openSqlEditor(page);
    await page.route("**/api/v1/sqllab/execute/**", (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ message: "Forbidden" }),
      }),
    );

    await editor.click();
    await editor.fill("SELECT 1");
    await page.getByRole("button", { name: "运行" }).first().click();

    // 不再显示 "Forbidden"/"执行查询时发生错误" 这类模糊文本，
    // 而是明确告知缺少哪些角色、该找谁开通。
    const message = page.getByText(/当前账号没有执行 SQL 的权限/);
    await expect(message).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/sql_lab/)).toBeVisible();
    await expect(page.getByText(/Forbidden/)).toHaveCount(0);
  });

  test("switching tabs restores the edited SQL", async ({ page }) => {
    const editor = await openSqlEditor(page);
    await editor.click();
    await editor.fill("SELECT 42 AS answer");
    await expect(editor).toContainText("SELECT 42 AS answer");

    // 新建一个 SQL 标签页，新标签应是空的。
    await page.getByRole("button", { name: "新建标签页" }).click();
    await page.getByRole("menuitem", { name: "新建 SQL 查询" }).click();
    const freshEditor = page.locator(".cm-content").first();
    await expect(freshEditor).not.toContainText("SELECT 42 AS answer");

    await freshEditor.click();
    await freshEditor.fill("SELECT 7 AS seven");

    // 切回第一个标签：未"运行"过、只存在于编辑器里的内容也必须恢复
    //（标签页只在切换/新建/关闭/执行等边界落盘）。
    await page.getByText("未命名查询 1", { exact: true }).click();
    await expect(page.locator(".cm-content").first()).toContainText(
      "SELECT 42 AS answer",
    );
    await expect(page.locator(".cm-content").first()).not.toContainText(
      "SELECT 7 AS seven",
    );
  });

  test("navigates to SQL Lab from home", async ({ page }) => {
    await page.getByText("SQL 实验室", { exact: true }).first().click();
    await expect(page).toHaveURL(/\/sqllab/, { timeout: 10000 });
  });

  test("displays SQL editor", async ({ page }) => {
    await openSqlEditor(page);

    // CodeMirror content area plus the run button.
    await expect(
      page.getByRole("button", { name: "运行" }).first(),
    ).toBeVisible();
  });

  test("execute returns results", async ({ page }) => {
    const editor = await openSqlEditor(page);
    await editor.click();
    await editor.fill("SELECT 1 AS one");

    await page.getByRole("button", { name: "运行" }).first().click();

    // Either a result grid or an explicit error alert must appear.
    await expect(
      page.locator("table").or(page.getByRole("alert")).first(),
    ).toBeVisible({ timeout: 20000 });
  });

  test("Ctrl+Enter in the editor dispatches a single execute request", async ({
    page,
  }) => {
    const editor = await openSqlEditor(page);
    await editor.click();
    await editor.fill("SELECT 1 AS one");

    // Count execute POSTs before triggering the shortcut.
    const executeRequests: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().includes("/sqllab/execute")
      ) {
        executeRequests.push(request.url());
      }
    });

    const firstResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/sqllab/execute"),
      { timeout: 30000 },
    );
    await editor.press("Control+Enter");
    await firstResponse;
    // Give a hypothetical duplicate request time to land before asserting.
    await page.waitForTimeout(1500);

    // A single shortcut press must execute the query exactly once: the
    // CodeMirror keymap and the SqlEditor global shortcut used to both fire.
    expect(executeRequests).toHaveLength(1);

    // The execution renders either a result grid or an error alert.
    await expect(
      page.locator("table").or(page.getByRole("alert")).first(),
    ).toBeVisible({ timeout: 20000 });
  });

  test("a stale failing execution never renders next to a newer result", async ({
    page,
  }) => {
    const editor = await openSqlEditor(page);
    await editor.click();
    await editor.fill("SELECT 1 AS one");

    // Reproduce the reported cold-start race: the first execution fails (400)
    // but its response is held until the second execution has already
    // succeeded and rendered its result. The stale failure must not leak an
    // error alert next to the valid result table.
    let executeCalls = 0;
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    await page.route("**/api/v1/sqllab/execute/", async (route) => {
      executeCalls += 1;
      if (executeCalls === 1) {
        await firstGate;
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ message: "模拟冷启动竞态失败" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "success",
            columns: [{ name: "one" }],
            data: [{ one: 1 }],
            query: {
              rows: 1,
              sql: "SELECT 1 AS one",
              state: "success",
              queryId: 1,
              limit: 1000,
              limitingFactor: "",
              progress: 100,
            },
          }),
        });
      }
    });

    // Two overlapping executions; the older one is still in flight.
    await editor.press("Control+Enter");
    await page.waitForTimeout(300);
    await editor.press("Control+Enter");

    // The newer execution's result is rendered while the older one is pending.
    await expect(page.locator("table").first()).toBeVisible({ timeout: 15000 });

    // Release the stale 400 last: it must be dropped, not surfaced.
    releaseFirst();
    await page.waitForTimeout(2000);
    expect(executeCalls).toBe(2);
    await expect(page.getByText("模拟冷启动竞态失败")).toHaveCount(0);
    await expect(page.locator("table").first()).toBeVisible();
  });
});
