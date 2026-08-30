#import <AppKit/AppKit.h>
#import <stdint.h>
#import <unistd.h>

extern uint32_t codetwoPerformTitlebarDoubleClick(void *windowPointer);

static void setDoubleClickAction(NSString *action) {
  NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
  [defaults setVolatileDomain:@{ @"AppleActionOnDoubleClick": action } forName:NSArgumentDomain];
}

static void settleWindow(void) {
  [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.35]];
}

static BOOL framesMatch(NSRect first, NSRect second) {
  return NSEqualRects(NSIntegralRect(first), NSIntegralRect(second));
}

static int fail(NSString *message) {
  fprintf(stderr, "%s\n", message.UTF8String);
  return 1;
}

int main(void) {
  @autoreleasepool {
    [NSApplication sharedApplication];
    NSWindow *window = [[NSWindow alloc]
      initWithContentRect:NSMakeRect(240, 180, 640, 480)
      styleMask:(NSWindowStyleMaskTitled
        | NSWindowStyleMaskClosable
        | NSWindowStyleMaskMiniaturizable
        | NSWindowStyleMaskResizable)
      backing:NSBackingStoreBuffered
      defer:NO
    ];
    [window orderFront:nil];

    setDoubleClickAction(@"None");
    NSRect unchangedFrame = window.frame;
    if (codetwoPerformTitlebarDoubleClick((__bridge void *)window) != 1) {
      return fail(@"None was not recognized");
    }
    if (!framesMatch(window.frame, unchangedFrame)) return fail(@"None changed the window frame");

    setDoubleClickAction(@"Fill");
    NSRect fillRestoreFrame = window.frame;
    if (codetwoPerformTitlebarDoubleClick((__bridge void *)window) != 1) {
      return fail(@"Fill was not recognized");
    }
    settleWindow();
    if (!framesMatch(window.frame, window.screen.visibleFrame)) {
      return fail(@"Fill did not use the visible screen frame");
    }
    codetwoPerformTitlebarDoubleClick((__bridge void *)window);
    settleWindow();
    if (!framesMatch(window.frame, fillRestoreFrame)) {
      return fail(@"A second Fill did not restore the prior frame");
    }

    setDoubleClickAction(@"Maximize");
    if (codetwoPerformTitlebarDoubleClick((__bridge void *)window) != 1) {
      return fail(@"Maximize was not recognized");
    }
    settleWindow();
    if (!window.isZoomed) return fail(@"Maximize did not enter the AppKit zoomed state");
    codetwoPerformTitlebarDoubleClick((__bridge void *)window);
    settleWindow();

    setDoubleClickAction(@"Minimize");
    if (codetwoPerformTitlebarDoubleClick((__bridge void *)window) != 1) {
      return fail(@"Minimize was not recognized");
    }
    settleWindow();
    if (!window.isMiniaturized) return fail(@"Minimize did not miniaturize the window");
    [window deminiaturize:nil];
    settleWindow();

    setDoubleClickAction(@"FutureAction");
    NSRect unknownFrame = window.frame;
    if (codetwoPerformTitlebarDoubleClick((__bridge void *)window) != 0) {
      return fail(@"An unknown preference did not fail closed");
    }
    if (!framesMatch(window.frame, unknownFrame)) {
      return fail(@"An unknown preference changed the window frame");
    }

    [window close];
    puts("native titlebar double-click harness passed");
    fflush(stdout);
    _exit(0);
  }
}
