import { afterEach, describe, expect, test } from "bun:test";
import { GlobalWindow } from "happy-dom";
import { installTitlebarDoubleClick } from "../src/electrobun/titlebar";

const dom = new GlobalWindow({ url: "http://localhost/" });

afterEach(() => {
  dom.document.body.replaceChildren();
});

describe("macOS titlebar double-click", () => {
  test("dispatches only from draggable, noninteractive titlebar content", () => {
    const titlebar = dom.document.createElement("header");
    titlebar.className = "electrobun-webkit-app-region-drag";
    const blank = dom.document.createElement("span");
    const button = dom.document.createElement("button");
    button.className = "electrobun-webkit-app-region-no-drag";
    const buttonLabel = dom.document.createElement("span");
    button.append(buttonLabel);
    titlebar.append(blank, button);
    dom.document.body.append(titlebar);

    let actions = 0;
    const uninstall = installTitlebarDoubleClick(dom.document as unknown as Document, () => {
      actions += 1;
    });

    const dragDoubleClick = new dom.MouseEvent("dblclick", {
      bubbles: true,
      button: 0,
      cancelable: true,
    });
    blank.dispatchEvent(dragDoubleClick);
    expect(actions).toBe(1);
    expect(dragDoubleClick.defaultPrevented).toBe(true);

    buttonLabel.dispatchEvent(new dom.MouseEvent("dblclick", { bubbles: true, button: 0 }));
    dom.document.body.dispatchEvent(new dom.MouseEvent("dblclick", { bubbles: true, button: 0 }));
    blank.dispatchEvent(new dom.MouseEvent("dblclick", { bubbles: true, button: 2 }));
    expect(actions).toBe(1);

    uninstall();
    blank.dispatchEvent(new dom.MouseEvent("dblclick", { bubbles: true, button: 0 }));
    expect(actions).toBe(1);
  });
});
