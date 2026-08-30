#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <objc/runtime.h>

static char codeTwoBackdropKey;
static char codeTwoFillRestoreFrameKey;

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

static BOOL performFillAction(NSWindow *window) {
  NSScreen *screen = window.screen ?: NSScreen.mainScreen;
  if (screen == nil) return NO;

  NSRect visibleFrame = screen.visibleFrame;
  NSValue *restoreValue = objc_getAssociatedObject(window, &codeTwoFillRestoreFrameKey);
  BOOL isFilled = NSEqualRects(NSIntegralRect(window.frame), NSIntegralRect(visibleFrame));
  NSRect targetFrame;

  if (isFilled && restoreValue != nil) {
    targetFrame = restoreValue.rectValue;
    objc_setAssociatedObject(
      window,
      &codeTwoFillRestoreFrameKey,
      nil,
      OBJC_ASSOCIATION_RETAIN_NONATOMIC
    );
  } else {
    objc_setAssociatedObject(
      window,
      &codeTwoFillRestoreFrameKey,
      [NSValue valueWithRect:window.frame],
      OBJC_ASSOCIATION_RETAIN_NONATOMIC
    );
    targetFrame = visibleFrame;
  }

  [window setFrame:targetFrame display:YES animate:YES];
  return YES;
}

static BOOL performTitlebarDoubleClick(NSWindow *window) {
  if (window == nil) return NO;

  NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
  NSString *action = [defaults stringForKey:@"AppleActionOnDoubleClick"];
  if (action == nil) {
    action = [defaults boolForKey:@"AppleMiniaturizeOnDoubleClick"]
      ? @"Minimize"
      : @"Maximize";
  }

  if ([action caseInsensitiveCompare:@"Fill"] == NSOrderedSame) {
    return performFillAction(window);
  }

  objc_setAssociatedObject(
    window,
    &codeTwoFillRestoreFrameKey,
    nil,
    OBJC_ASSOCIATION_RETAIN_NONATOMIC
  );

  if ([action caseInsensitiveCompare:@"Minimize"] == NSOrderedSame) {
    [window performMiniaturize:nil];
    return YES;
  }
  if ([action caseInsensitiveCompare:@"Maximize"] == NSOrderedSame) {
    [window performZoom:nil];
    return YES;
  }
  if ([action caseInsensitiveCompare:@"None"] == NSOrderedSame) return YES;
  return NO;
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

uint32_t codetwoPerformTitlebarDoubleClick(void *windowPointer) {
  if (windowPointer == NULL) return 0;

  NSWindow *window = (__bridge NSWindow *)windowPointer;
  if ([NSThread isMainThread]) return performTitlebarDoubleClick(window) ? 1 : 0;

  __block BOOL handled = NO;
  dispatch_sync(dispatch_get_main_queue(), ^{
    handled = performTitlebarDoubleClick(window);
  });
  return handled ? 1 : 0;
}

static BOOL setDockBadgeCount(uint32_t count) {
  NSDockTile *dockTile = NSApp.dockTile;
  if (dockTile == nil) return NO;

  dockTile.badgeLabel = count > 0
    ? [NSString stringWithFormat:@"%u", count]
    : nil;
  return YES;
}

uint32_t codetwoSetDockBadgeCount(uint32_t count) {
  if ([NSThread isMainThread]) return setDockBadgeCount(count) ? 1 : 0;

  __block BOOL updated = NO;
  dispatch_sync(dispatch_get_main_queue(), ^{
    updated = setDockBadgeCount(count);
  });
  return updated ? 1 : 0;
}

enum CodeTwoAppshotPermission : uint32_t {
  CodeTwoAppshotPermissionScreenRecording = 1 << 0,
  CodeTwoAppshotPermissionAccessibility = 1 << 1,
  CodeTwoAppshotPermissionAvailable = 1 << 2,
};

static uint32_t appshotPermissionStatus(void) {
  uint32_t status = CodeTwoAppshotPermissionAvailable;
  if (CGPreflightScreenCaptureAccess()) {
    status |= CodeTwoAppshotPermissionScreenRecording;
  }
  if (AXIsProcessTrusted()) {
    status |= CodeTwoAppshotPermissionAccessibility;
  }
  return status;
}

uint32_t codetwoAppshotPermissionStatus(void) {
  return appshotPermissionStatus();
}

uint32_t codetwoRequestAppshotPermissions(uint32_t requestedPermissions) {
  if ((requestedPermissions & CodeTwoAppshotPermissionScreenRecording) &&
      !CGPreflightScreenCaptureAccess()) {
    CGRequestScreenCaptureAccess();
  }
  if (requestedPermissions & CodeTwoAppshotPermissionAccessibility) {
    NSDictionary *options = @{(__bridge NSString *)kAXTrustedCheckOptionPrompt: @YES};
    AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
  }
  return appshotPermissionStatus();
}

uint32_t codetwoCommandKeyState(void) {
  uint32_t state = 0;
  CGEventSourceStateID source = kCGEventSourceStateCombinedSessionState;
  if (CGEventSourceKeyState(source, 55)) state |= 1;
  if (CGEventSourceKeyState(source, 54)) state |= 2;
  return state;
}

static void addTextValue(NSMutableOrderedSet<NSString *> *values, CFTypeRef value) {
  if (value == NULL) return;
  NSString *text = nil;
  if (CFGetTypeID(value) == CFStringGetTypeID()) {
    text = (__bridge NSString *)value;
  } else if (CFGetTypeID(value) == CFAttributedStringGetTypeID()) {
    text = [(__bridge NSAttributedString *)value string];
  } else if (CFGetTypeID(value) == CFNumberGetTypeID()) {
    text = [(__bridge NSNumber *)value stringValue];
  }
  text = [text stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
  if (text.length > 0 && text.length <= 20000) [values addObject:text];
}

static void collectAccessibilityText(
  AXUIElementRef element,
  NSMutableOrderedSet<NSString *> *values,
  NSUInteger depth,
  NSUInteger *visited,
  NSUInteger limit
) {
  if (element == NULL || depth > 40 || *visited >= limit) return;
  *visited += 1;

  CFStringRef attributes[] = {
    kAXTitleAttribute,
    kAXValueAttribute,
    kAXDescriptionAttribute,
    kAXHelpAttribute,
    kAXSelectedTextAttribute,
  };
  for (NSUInteger index = 0; index < sizeof(attributes) / sizeof(attributes[0]); index++) {
    CFTypeRef value = NULL;
    if (AXUIElementCopyAttributeValue(element, attributes[index], &value) == kAXErrorSuccess) {
      addTextValue(values, value);
    }
    if (value != NULL) CFRelease(value);
  }

  CFTypeRef childrenValue = NULL;
  if (
    AXUIElementCopyAttributeValue(element, kAXChildrenAttribute, &childrenValue) == kAXErrorSuccess &&
    childrenValue != NULL &&
    CFGetTypeID(childrenValue) == CFArrayGetTypeID()
  ) {
    NSArray *children = (__bridge NSArray *)childrenValue;
    for (id child in children) {
      collectAccessibilityText((__bridge AXUIElementRef)child, values, depth + 1, visited, limit);
      if (*visited >= limit) break;
    }
  }
  if (childrenValue != NULL) CFRelease(childrenValue);
}

static NSDictionary *frontmostWindow(NSString *excludedBundleIdentifier) {
  CFArrayRef raw = CGWindowListCopyWindowInfo(
    kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
    kCGNullWindowID
  );
  if (raw == NULL) return nil;
  NSArray *windows = CFBridgingRelease(raw);
  for (NSDictionary *window in windows) {
    NSNumber *layer = window[(id)kCGWindowLayer];
    NSNumber *alpha = window[(id)kCGWindowAlpha];
    NSNumber *pidValue = window[(id)kCGWindowOwnerPID];
    NSNumber *number = window[(id)kCGWindowNumber];
    NSDictionary *bounds = window[(id)kCGWindowBounds];
    if (layer.integerValue != 0 || alpha.doubleValue <= 0 || number == nil || bounds == nil) continue;
    NSRunningApplication *application = [NSRunningApplication runningApplicationWithProcessIdentifier:pidValue.intValue];
    if ([application.bundleIdentifier isEqualToString:excludedBundleIdentifier]) continue;
    CGRect frame = CGRectZero;
    if (!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)bounds, &frame)) continue;
    if (frame.size.width < 80 || frame.size.height < 60) continue;
    return window;
  }
  return nil;
}

static BOOL writeJSONResult(NSDictionary *result, char *buffer, uint32_t capacity) {
  if (buffer == NULL || capacity == 0) return NO;
  NSError *error = nil;
  NSData *data = [NSJSONSerialization dataWithJSONObject:result options:0 error:&error];
  if (data == nil || data.length + 1 > capacity) return NO;
  memcpy(buffer, data.bytes, data.length);
  buffer[data.length] = '\0';
  return YES;
}

static int appshotFailure(NSString *code, NSString *message, char *buffer, uint32_t capacity) {
  writeJSONResult(@{ @"ok": @NO, @"code": code, @"message": message }, buffer, capacity);
  return -1;
}

int32_t codetwoCaptureAppshot(
  const char *outputPath,
  const char *excludedBundleIdentifier,
  char *resultBuffer,
  uint32_t resultCapacity
) {
  @autoreleasepool {
    if (outputPath == NULL || resultBuffer == NULL) return -1;
    if (!CGPreflightScreenCaptureAccess()) {
      CGRequestScreenCaptureAccess();
      return appshotFailure(
        @"screen_recording_denied",
        @"Allow Screen Recording in System Settings, then try again.",
        resultBuffer,
        resultCapacity
      );
    }

    NSString *excluded = excludedBundleIdentifier == NULL
      ? @""
      : [NSString stringWithUTF8String:excludedBundleIdentifier];
    NSDictionary *window = frontmostWindow(excluded);
    if (window == nil) {
      return appshotFailure(
        @"window_not_found",
        @"No frontmost application window is available to capture.",
        resultBuffer,
        resultCapacity
      );
    }

    CGWindowID windowID = [window[(id)kCGWindowNumber] unsignedIntValue];
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    CGImageRef image = CGWindowListCreateImage(
      CGRectNull,
      kCGWindowListOptionIncludingWindow,
      windowID,
      kCGWindowImageBoundsIgnoreFraming | kCGWindowImageBestResolution
    );
#pragma clang diagnostic pop
    if (image == NULL) {
      return appshotFailure(
        @"capture_failed",
        @"The frontmost window could not be captured.",
        resultBuffer,
        resultCapacity
      );
    }

    size_t width = CGImageGetWidth(image);
    size_t height = CGImageGetHeight(image);
    const CGFloat maxDimension = 2400.0;
    CGFloat scale = MIN(1.0, maxDimension / MAX((CGFloat)width, (CGFloat)height));
    size_t outputWidth = MAX(1, (size_t)floor(width * scale));
    size_t outputHeight = MAX(1, (size_t)floor(height * scale));
    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
    CGContextRef bitmapContext = colorSpace == NULL ? NULL : CGBitmapContextCreate(
      NULL,
      outputWidth,
      outputHeight,
      8,
      outputWidth * 4,
      colorSpace,
      kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big
    );
    if (colorSpace != NULL) CGColorSpaceRelease(colorSpace);
    if (bitmapContext == NULL) {
      CGImageRelease(image);
      return appshotFailure(
        @"image_processing_failed",
        @"The Appshot image could not be prepared.",
        resultBuffer,
        resultCapacity
      );
    }
    CGContextSetInterpolationQuality(bitmapContext, kCGInterpolationHigh);
    CGContextDrawImage(
      bitmapContext,
      CGRectMake(0, 0, outputWidth, outputHeight),
      image
    );
    CGImageRelease(image);
    CGImageRef scaledImage = CGBitmapContextCreateImage(bitmapContext);
    CGContextRelease(bitmapContext);
    if (scaledImage == NULL) {
      return appshotFailure(
        @"image_processing_failed",
        @"The Appshot image could not be prepared.",
        resultBuffer,
        resultCapacity
      );
    }
    NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc] initWithCGImage:scaledImage];
    CGImageRelease(scaledImage);
    NSData *png = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
    NSString *path = [NSString stringWithUTF8String:outputPath];
    if (png == nil || ![png writeToFile:path atomically:YES]) {
      return appshotFailure(
        @"write_failed",
        @"The Appshot image could not be stored.",
        resultBuffer,
        resultCapacity
      );
    }

    pid_t pid = [window[(id)kCGWindowOwnerPID] intValue];
    NSRunningApplication *application = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
    NSString *appName = window[(id)kCGWindowOwnerName] ?: application.localizedName ?: @"Application";
    NSString *windowTitle = window[(id)kCGWindowName] ?: @"Window";
    NSMutableOrderedSet<NSString *> *textValues = [NSMutableOrderedSet orderedSet];
    BOOL trusted = AXIsProcessTrusted();
    NSUInteger visited = 0;
    if (trusted) {
      AXUIElementRef app = AXUIElementCreateApplication(pid);
      CFTypeRef focusedWindow = NULL;
      AXError focusedError = AXUIElementCopyAttributeValue(app, kAXFocusedWindowAttribute, &focusedWindow);
      if (focusedError == kAXErrorSuccess && focusedWindow != NULL) {
        collectAccessibilityText(
          (AXUIElementRef)focusedWindow,
          textValues,
          0,
          &visited,
          12000
        );
      } else {
        collectAccessibilityText(app, textValues, 0, &visited, 12000);
      }
      if (focusedWindow != NULL) CFRelease(focusedWindow);
      CFRelease(app);
    }
    NSString *text = [[textValues array] componentsJoinedByString:@"\n"];
    BOOL truncated = visited >= 12000 || text.length > 240000;
    if (text.length > 240000) text = [text substringToIndex:240000];

    NSDictionary *result = @{
      @"ok": @YES,
      @"app_name": appName,
      @"window_title": windowTitle,
      @"text": text,
      @"text_truncated": @(truncated),
      @"width": @(outputWidth),
      @"height": @(outputHeight),
      @"accessibility": @(trusted),
    };
    if (!writeJSONResult(result, resultBuffer, resultCapacity)) {
      return appshotFailure(
        @"result_too_large",
        @"The captured window text was too large to attach.",
        resultBuffer,
        resultCapacity
      );
    }
    return 0;
  }
}
