#import <AppKit/AppKit.h>

typedef void (*CodeTwoTouchBarAction)(const char *contributionKey, const char *itemId);
uint32_t codetwoConfigureTouchBar(void *windowPointer, CodeTwoTouchBarAction action);
uint32_t codetwoUpdateTouchBar(void *windowPointer, const char *json);
void codetwoClearTouchBar(void *windowPointer);
void codetwoDisposeTouchBar(void *windowPointer);

static NSString *invokedContribution = nil;
static NSString *invokedItem = nil;

static void recordInvocation(const char *contributionKey, const char *itemId) {
  invokedContribution = [NSString stringWithUTF8String:contributionKey];
  invokedItem = [NSString stringWithUTF8String:itemId];
}

static int fail(NSString *message) {
  NSLog(@"Touch Bar harness failed: %@", message);
  return 1;
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    [NSApplication sharedApplication];
    NSWindow *window = [[NSWindow alloc]
      initWithContentRect:NSMakeRect(0, 0, 800, 600)
      styleMask:NSWindowStyleMaskTitled
      backing:NSBackingStoreBuffered
      defer:NO];
    if (!codetwoConfigureTouchBar((__bridge void *)window, recordInvocation)) {
      return fail(@"configuration was rejected");
    }
    const char *json = "[{\"contributionKey\":\"monitor:agents\",\"id\":\"session-1\",\"label\":\"Fix flaky test\",\"detail\":\"RUNNING\",\"state\":\"running\",\"enabled\":true,\"accessibilityLabel\":\"Fix flaky test, running\"}]";
    if (!codetwoUpdateTouchBar((__bridge void *)window, json)) {
      return fail(@"valid document was rejected");
    }
    NSTouchBar *touchBar = window.touchBar;
    if (touchBar.defaultItemIdentifiers.count != 1) return fail(@"item was not rendered");
    NSTouchBarItemIdentifier identifier = touchBar.defaultItemIdentifiers.firstObject;
    NSTouchBarItem *item = [touchBar.delegate touchBar:touchBar makeItemForIdentifier:identifier];
    if (![item isKindOfClass:NSCustomTouchBarItem.class]) return fail(@"item is not host-owned");
    NSButton *button = (NSButton *)((NSCustomTouchBarItem *)item).view;
    if (![button.title containsString:@"Fix flaky test"] ||
        ![button.bezelColor isEqual:NSColor.systemBlueColor]) {
      return fail(@"semantic running state was not mapped");
    }
    if (argc > 1 && strcmp(argv[1], "--visual") == 0) {
      [window makeKeyAndOrderFront:nil];
      [NSApp activateIgnoringOtherApps:YES];
      [[NSRunLoop currentRunLoop]
        runUntilDate:[NSDate dateWithTimeIntervalSinceNow:20.0]];
    }
    [button performClick:nil];
    if (![invokedContribution isEqualToString:@"monitor:agents"] ||
        ![invokedItem isEqualToString:@"session-1"]) {
      return fail(@"tap was not routed to the owning item");
    }
    codetwoClearTouchBar((__bridge void *)window);
    if (window.touchBar != nil) return fail(@"cleanup left the Touch Bar installed");
    if (!codetwoUpdateTouchBar((__bridge void *)window, json) || window.touchBar == nil) {
      return fail(@"clear prevented a later refresh");
    }
    codetwoDisposeTouchBar((__bridge void *)window);
    if (window.touchBar != nil) return fail(@"dispose left the Touch Bar installed");
    NSLog(@"Touch Bar harness passed");
    return 0;
  }
}
