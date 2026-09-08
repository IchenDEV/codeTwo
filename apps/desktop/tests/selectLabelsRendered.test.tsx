// @ts-nocheck
import { expect, test } from "bun:test";

import { activateDom, mount, flush } from "./domTestHarness";

activateDom();
const {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} = await import("../src/components/ui/select");

test("a closed Select displays its declared label before the menu is ever opened", async () => {
  const view = mount(
    <Select value="all">
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="all">全部类别</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
  await flush();
  expect(
    view.container.querySelector('[data-slot="select-trigger"]').textContent
  ).toContain("全部类别");
  view.unmount();
});
