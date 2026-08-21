#import <AppKit/AppKit.h>
#import <objc/runtime.h>

static char codeTwoBackdropKey;

enum CodeTwoWindowEffect : uint32_t {
  CodeTwoWindowEffectShadow = 1 << 0,
  CodeTwoWindowEffectBackdrop = 1 << 1,
};

static BOOL restoreWindowShadow(NSWindow *window) {
  if (window == nil) return NO;

  window.hasShadow = YES;
  [window invalidateShadow];
  return window.hasShadow;
}

static BOOL installWindowBackdrop(NSWindow *window) {
  NSView *contentView = window.contentView;
  if (contentView == nil) return NO;

  NSVisualEffectView *backdrop = objc_getAssociatedObject(window, &codeTwoBackdropKey);
  if (backdrop == nil) {
    backdrop = [[NSVisualEffectView alloc] initWithFrame:contentView.bounds];
    backdrop.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    backdrop.blendingMode = NSVisualEffectBlendingModeBehindWindow;
    backdrop.material = NSVisualEffectMaterialSidebar;
    backdrop.state = NSVisualEffectStateFollowsWindowActiveState;
    [contentView addSubview:backdrop positioned:NSWindowBelow relativeTo:nil];
    objc_setAssociatedObject(
      window,
      &codeTwoBackdropKey,
      backdrop,
      OBJC_ASSOCIATION_RETAIN_NONATOMIC
    );
  }

  return backdrop.superview == contentView;
}

static uint32_t configureWindowEffects(NSWindow *window) {
  uint32_t effects = 0;
  if (restoreWindowShadow(window)) effects |= CodeTwoWindowEffectShadow;
  if (installWindowBackdrop(window)) effects |= CodeTwoWindowEffectBackdrop;
  return effects;
}

uint32_t codetwoConfigureWindowEffects(void *windowPointer) {
  if (windowPointer == NULL) return 0;

  NSWindow *window = (__bridge NSWindow *)windowPointer;
  if ([NSThread isMainThread]) return configureWindowEffects(window);

  __block uint32_t configuredEffects = 0;
  dispatch_sync(dispatch_get_main_queue(), ^{
    configuredEffects = configureWindowEffects(window);
  });
  return configuredEffects;
}
