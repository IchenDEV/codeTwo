// @ts-nocheck
import { expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { activateDom, dom } from "./domTestHarness";

activateDom();
const { BrowserWebview } = await import("../src/browser/Browser");

test("the native custom element receives a CSS class attribute for panel-sized bounds", () => {
  const markup = renderToStaticMarkup(
    <BrowserWebview label="browser-test" url="https://example.com" visible />
  );
  const container = dom.document.createElement("div");
  container.innerHTML = markup;
  const element = container.querySelector("electrobun-webview");
  expect(element.classList.contains("h-full!")).toBe(true);
  expect(element.classList.contains("w-full!")).toBe(true);
  expect(element.hasAttribute("sandbox")).toBe(true);
});
