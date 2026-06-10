import { expect, test } from "@playwright/test";

import { shouldExpectImagePlayground } from "./mock-api";

const sessionToken = "portal-image-session-v1.payload.sig";
const baseUrl = process.env.E2E_BASE_URL ?? "https://test.easyapi.work";

test.describe.serial("image playground embed light theme", () => {
  test("iframe document stays light when the OS color scheme is dark", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.route("https://portal.example.test/embed-host", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: [
          "<!doctype html>",
          "<html>",
          "<body>",
          '<iframe title="生图 Playground" src="/playground/embed/?theme=light"></iframe>',
          "</body>",
          "</html>",
        ].join(""),
      });
    });
    await page.route("**/playground/embed/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: [
          "<!doctype html>",
          "<html>",
          "<head>",
          '<meta name="color-scheme" content="light">',
          '<script id="ezapi-embed-light-theme-state">(function(){try{var d=document.documentElement;d.dataset.theme="light";d.classList.remove("dark");d.classList.add("light");localStorage.setItem("theme","light");localStorage.setItem("color-theme","light");localStorage.setItem("vite-ui-theme","light");sessionStorage.setItem("theme","light");var strip=function(root){if(!root||!root.querySelectorAll)return;var nodes=[root].concat(Array.prototype.slice.call(root.querySelectorAll("[class*=dark\\\\:]")));nodes.forEach(function(el){if(!el.className||typeof el.className!=="string")return;var next=el.className.split(/\\s+/).filter(function(name){return name.indexOf("dark:")!==0}).join(" ");if(next!==el.className)el.className=next;});};var observe=function(){strip(document.body);new MutationObserver(function(records){records.forEach(function(record){if(record.type==="attributes"){strip(record.target)}else{record.addedNodes.forEach(strip)}})}).observe(document.body,{attributes:true,attributeFilter:["class"],childList:true,subtree:true});};if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",observe,{once:true})}else{observe()}}catch(e){}})();</script>',
          '<style id="ezapi-embed-light-theme">:root{color-scheme:light}html.light body,html[data-theme="light"] body{background:#f9fafb!important;color:#111827!important}</style>',
          "</head>",
          '<body><main data-testid="embed-light-root">Light image playground</main></body>',
          "</html>",
        ].join(""),
      });
    });

    await page.goto("https://portal.example.test/embed-host");

    const iframe = page.frameLocator('iframe[title="生图 Playground"]');
    await expect(iframe.getByTestId("embed-light-root")).toBeVisible();

    const colors = await iframe.locator("body").evaluate((body) => {
      const style = window.getComputedStyle(body);
      const root = document.documentElement;
      return {
        backgroundColor: style.backgroundColor,
        color: style.color,
        rootClass: root.className,
        rootTheme: root.dataset.theme,
        localTheme: localStorage.getItem("theme"),
        sessionTheme: sessionStorage.getItem("theme"),
        darkMediaMatches: window.matchMedia("(prefers-color-scheme: dark)")
          .matches,
      };
    });

    expect(colors.darkMediaMatches).toBe(true);
    expect(colors.rootClass).toContain("light");
    expect(colors.rootTheme).toBe("light");
    expect(colors.localTheme).toBe("light");
    expect(colors.sessionTheme).toBe("light");
    expect(colors.backgroundColor).toBe("rgb(249, 250, 251)");
    expect(colors.color).toBe("rgb(17, 24, 39)");
  });

  test("/playground/embed/ HTML contains light theme injection", async ({
    page,
  }) => {
    test.skip(
      !shouldExpectImagePlayground(),
      "IMAGE_PLAYGROUND_INTERNAL_URL is required for live embed proxy HTML.",
    );

    const response = await page.request.get(
      `/playground/embed/?apiKey=${sessionToken}`,
      {
        headers: {
          referer: `${baseUrl}/dashboard/playground`,
        },
      },
    );
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]?.toLowerCase()).toContain(
      "text/html",
    );

    const html = await response.text();
    expect(html).toContain('<meta name="color-scheme" content="light">');
    expect(html).toContain('id="ezapi-embed-light-theme-state"');
    expect(html).toContain('dataset.theme="light"');
    expect(html).toContain('localStorage.setItem("theme","light")');
    expect(html).toContain('querySelectorAll("[class*=dark\\\\:]")');
    expect(html).toContain(`./assets/index-`);
    expect(html).not.toContain(`apiKey=${sessionToken}`);
    expect(html).toContain('id="ezapi-embed-config-bootstrap"');
    expect(html).toContain('id="ezapi-embed-light-theme"');
    expect(html).toContain(":root{color-scheme:light}");
    expect(html).toContain("html.light body");
  });

  test("live embed iframe renders the upstream UI in light mode", async ({
    page,
  }) => {
    test.skip(
      !shouldExpectImagePlayground(),
      "IMAGE_PLAYGROUND_INTERNAL_URL is required for live iframe rendering.",
    );

    await page.emulateMedia({ colorScheme: "dark" });
    await page.route("**/dashboard/playground", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: [
          "<!doctype html>",
          "<html>",
          "<body>",
          `<iframe title="生图 Playground" src="/playground/embed?apiKey=${sessionToken}" style="width:1200px;height:900px;border:0"></iframe>`,
          "</body>",
          "</html>",
        ].join(""),
      });
    });

    const failedEmbedResponses: string[] = [];
    page.on("response", (response) => {
      if (
        response.url().includes("/playground/embed") &&
        response.status() >= 400
      ) {
        failedEmbedResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto("/dashboard/playground");

    const frameElement = await page
      .locator('iframe[title="生图 Playground"]')
      .elementHandle();
    expect(frameElement).not.toBeNull();
    const frame = await frameElement?.contentFrame();
    expect(frame).not.toBeNull();

    await frame?.waitForLoadState("domcontentloaded");
    await frame?.waitForLoadState("networkidle").catch(() => undefined);
    await page.waitForTimeout(3_000);

    const colors = await frame?.locator("body").evaluate((body) => {
      const style = window.getComputedStyle(body);
      const root = document.documentElement;
      return {
        backgroundColor: style.backgroundColor,
        bodyClass: document.body.className,
        color: style.color,
        darkMediaMatches: window.matchMedia("(prefers-color-scheme: dark)")
          .matches,
        rootChildren: document.querySelector("#root")?.children.length ?? 0,
        rootClass: root.className,
        rootTheme: root.dataset.theme,
        text: document.body.innerText,
      };
    });

    expect(failedEmbedResponses).toEqual([]);
    expect(colors?.darkMediaMatches).toBe(true);
    expect(colors?.rootClass).toContain("light");
    expect(colors?.rootTheme).toBe("light");
    expect(colors?.bodyClass).not.toContain("dark:");
    expect(colors?.rootChildren).toBeGreaterThan(0);
    expect(colors?.text).toContain("GPT Image Playground");
    expect(colors?.backgroundColor).toBe("rgb(249, 250, 251)");
    expect(colors?.color).toBe("rgb(17, 24, 39)");
  });
});
