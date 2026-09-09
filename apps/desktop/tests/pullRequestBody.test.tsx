import { expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { PullRequestBody } from "../src/github/PullRequestBody";

test("PR descriptions render links, checked tasks and tables without raw HTML", () => {
  const html = renderToStaticMarkup(
    <PullRequestBody
      body={
        "[Docs](https://example.com)\n\n- [x] Verified\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n<script>alert(1)</script>"
      }
    />
  );
  expect(html).toContain('href="https://example.com"');
  expect(html).toContain('type="checkbox"');
  expect(html).toContain('checked=""');
  expect(html).toContain("<table>");
  expect(html).not.toContain("<script>");
});
