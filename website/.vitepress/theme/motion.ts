// Terminal landing scroll motion. Everything is gated behind the
// "motion-ready" class set here at hydration, so without JavaScript (or with
// prefers-reduced-motion) the page renders fully visible and static.

const WIDE_VIEWPORT = "(min-width: 1181px)";
const SCRUB_STAGE_CLASSES = ["stage-2", "stage-3", "stage-4"] as const;

export function initLandingMotion(): void {
  if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
    return;
  }

  const root = document.querySelector<HTMLElement>(".codetwo-home");
  if (!root) {
    return;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reducedMotion.matches) {
    return;
  }

  root.classList.add("motion-ready");

  // ------------------------------------------------------------------
  // Command typewriter: stash the original text, clear the element, and
  // retype it when the observer reports it on screen.
  // ------------------------------------------------------------------

  const commands = Array.from(
    root.querySelectorAll<HTMLElement>('[data-motion="type"]'),
  );
  for (const command of commands) {
    command.dataset.typeText = (command.textContent ?? "").trim();
    command.textContent = "";
  }

  // A command that ends up above the viewport (fast scroll past it) must
  // never stay blank, so show it instantly instead of typing.
  const finishCommand = (command: HTMLElement) => {
    if (command.dataset.typeDone) {
      return;
    }
    command.dataset.typeDone = "true";
    command.classList.remove("is-typing");
    command.textContent = command.dataset.typeText ?? "";
  };

  const typeCommand = (command: HTMLElement) => {
    if (command.dataset.typeDone) {
      return;
    }
    command.dataset.typeDone = "true";
    const text = command.dataset.typeText ?? "";
    command.classList.add("is-typing");
    let shown = 0;
    const tick = () => {
      shown += 1;
      command.textContent = text.slice(0, shown);
      if (shown < text.length) {
        window.setTimeout(tick, 24 + Math.random() * 10);
      } else {
        command.classList.remove("is-typing");
      }
    };
    tick();
  };

  const finishCommandsAboveViewport = () => {
    for (const command of commands) {
      if (command.dataset.typeDone) {
        continue;
      }
      if (command.getBoundingClientRect().bottom < 0) {
        finishCommand(command);
      }
    }
  };

  // ------------------------------------------------------------------
  // Staggered reveals: lists mark their items with a per-index delay.
  // ------------------------------------------------------------------

  for (const group of Array.from(
    root.querySelectorAll<HTMLElement>("[data-motion-stagger]"),
  )) {
    const step = Number(group.dataset.motionStagger || "") || 70;
    Array.from(group.children).forEach((child, index) => {
      (child as HTMLElement).style.setProperty(
        "--motion-delay",
        `${Math.min(index * step, 620)}ms`,
      );
    });
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }
        observer.unobserve(entry.target);
        const el = entry.target as HTMLElement;
        if (el.dataset.motion === "type") {
          typeCommand(el);
        } else {
          el.classList.add("is-visible");
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -7% 0px" },
  );

  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-motion]"))) {
    observer.observe(el);
  }

  // ------------------------------------------------------------------
  // Architecture scroll scrub: the flow sticks near the viewport center
  // inside a tall stage, and stage classes assemble the diagram as the
  // visitor scrolls. Reversible; disabled below 1181px.
  // ------------------------------------------------------------------

  const stage = root.querySelector<HTMLElement>("[data-architecture-stage]");
  const flow = root.querySelector<HTMLElement>("[data-architecture-flow]");
  const wideViewport = window.matchMedia(WIDE_VIEWPORT);
  let scrubbing = false;

  const setFlowStage = (stageName: string, on: boolean) => {
    flow?.classList.toggle(stageName, on);
  };

  const updateScrub = () => {
    if (!scrubbing || !stage) {
      return;
    }
    const rect = stage.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const stickyStart = Math.max(0, viewportHeight * 0.5 - 200);
    const stickyEnd = viewportHeight - rect.height;
    const span = Math.max(1, stickyStart - stickyEnd);
    const progress = Math.min(
      1,
      Math.max(0, (stickyStart - rect.top) / span),
    );
    setFlowStage("stage-2", progress >= 0.16);
    setFlowStage("stage-3", progress >= 0.4);
    setFlowStage("stage-4", progress >= 0.64);
  };

  const applyScrubLayout = () => {
    const shouldScrub = Boolean(stage && flow) && wideViewport.matches;
    if (shouldScrub === scrubbing) {
      return;
    }
    scrubbing = shouldScrub;
    root.classList.toggle("scrub-active", shouldScrub);
    if (!shouldScrub && flow) {
      for (const stageName of SCRUB_STAGE_CLASSES) {
        flow.classList.remove(stageName);
      }
    }
    updateScrub();
  };

  // ------------------------------------------------------------------
  // Hero screenshot parallax plus the shared rAF scroll loop.
  // ------------------------------------------------------------------

  const heroShot = root.querySelector<HTMLElement>("[data-parallax]");
  let frame = 0;
  const onScroll = () => {
    if (frame) {
      return;
    }
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      updateScrub();
      finishCommandsAboveViewport();
      if (heroShot) {
        const drift = Math.min(90, Math.max(0, window.scrollY * 0.07));
        heroShot.style.transform = `translate3d(0, ${drift.toFixed(1)}px, 0)`;
      }
    });
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  wideViewport.addEventListener("change", applyScrubLayout);

  const onReducedMotionChange = () => {
    if (!reducedMotion.matches) {
      return;
    }
    root.classList.remove("motion-ready", "scrub-active");
    if (flow) {
      for (const stageName of SCRUB_STAGE_CLASSES) {
        flow.classList.remove(stageName);
      }
    }
    observer.disconnect();
  };
  reducedMotion.addEventListener("change", onReducedMotionChange);

  applyScrubLayout();
  onScroll();
}
