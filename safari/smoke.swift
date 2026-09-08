// Runs the production extension in an isolated WebKit extension context.
// A loopback DeepLX fixture tests the translation pipeline without an API key.
import Cocoa
import WebKit

@MainActor final class TestTab: NSObject, WKWebExtensionTab {
  let view: WKWebView
  unowned let owner: TestWindow
  init(view: WKWebView, owner: TestWindow) {
    self.view = view
    self.owner = owner
  }
  func webView(for context: WKWebExtensionContext) -> WKWebView? { view }
  func window(for context: WKWebExtensionContext) -> (any WKWebExtensionWindow)? { owner }
  func activate(for context: WKWebExtensionContext, completionHandler: @escaping (Error?) -> Void) {
    owner.active = self
    completionHandler(nil)
  }
}
@MainActor final class TestWindow: NSObject, WKWebExtensionWindow {
  var list: [TestTab] = []
  var active: TestTab?
  func tabs(for context: WKWebExtensionContext) -> [any WKWebExtensionTab] { list }
  func activeTab(for context: WKWebExtensionContext) -> (any WKWebExtensionTab)? { active }
}
@MainActor final class TestBrowser: NSObject, WKWebExtensionControllerDelegate {
  let window = TestWindow()
  func webExtensionController(
    _ controller: WKWebExtensionController, openWindowsFor context: WKWebExtensionContext
  ) -> [any WKWebExtensionWindow] { [window] }
  func webExtensionController(
    _ controller: WKWebExtensionController, openNewTabUsing config: WKWebExtension.TabConfiguration,
    for context: WKWebExtensionContext,
    completionHandler: @escaping ((any WKWebExtensionTab)?, Error?) -> Void
  ) {
    let view = WKWebView(
      frame: NSRect(x: 0, y: 0, width: 900, height: 700),
      configuration: context.webViewConfiguration!)
    let tab = TestTab(view: view, owner: window)
    window.list.append(tab)
    controller.didOpenTab(tab)
    if let url = config.url, url.scheme == context.baseURL.scheme {
      view.load(URLRequest(url: url))
    }
    completionHandler(tab, nil)
  }
}
@MainActor final class Navigation: NSObject, WKNavigationDelegate {
  func webView(
    _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) { print("NAV FAILED: \(error)") }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    print("NAV OK: \(webView.url?.absoluteString ?? "nil")")
  }
}
@MainActor func waitFor(_ view: WKWebView, _ expression: String, _ description: String) async throws
{
  for _ in 0..<100 {
    if (try? await view.evaluateJavaScript(expression)) as? Bool == true { return }
    try await Task.sleep(for: .milliseconds(300))
  }
  throw NSError(
    domain: "ReadFrogSmoke", code: 1, userInfo: [NSLocalizedDescriptionKey: description])
}
func require(_ condition: Bool, _ message: String) throws {
  if !condition {
    throw NSError(domain: "ReadFrogSmoke", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
}
@main struct Smoke {
  @MainActor static func main() async {
    _ = NSApplication.shared
    do {
      let ext = try await WKWebExtension(
        resourceBaseURL: URL(fileURLWithPath: CommandLine.arguments[1]))
      for error in ext.errors {
        let detail = error as NSError
        print("Manifest error: domain=\(detail.domain) code=\(detail.code) details=\(detail.userInfo)")
      }
      try require(ext.errors.isEmpty, "Manifest errors: \(ext.errors)")
      let controller = WKWebExtensionController(configuration: .nonPersistent())
      let context = WKWebExtensionContext(for: ext)
      let delegate = TestBrowser()
      controller.delegate = delegate
      for permission in ext.requestedPermissions {
        context.setPermissionStatus(.grantedExplicitly, for: permission)
      }
      for pattern in ext.requestedPermissionMatchPatterns {
        context.setPermissionStatus(.grantedExplicitly, for: pattern)
      }
      try controller.load(context)
      try await context.loadBackgroundContent()
      let options = WKWebView(
        frame: NSRect(x: 0, y: 0, width: 1100, height: 850),
        configuration: context.webViewConfiguration!)
      options.load(URLRequest(url: context.baseURL.appendingPathComponent("options.html")))
      try await waitFor(
        options, "document.body?.innerText.includes('API Providers') === true",
        "Options did not render")
      let nativeWindow = NSWindow(
        contentRect: NSRect(x: 0, y: 0, width: 1100, height: 850), styleMask: [.titled],
        backing: .buffered, defer: false)
      nativeWindow.contentView = options
      nativeWindow.orderBack(nil)
      let bootstrap = try await options.callAsyncJavaScript(
        """
        const {config} = await browser.storage.local.get('config');
        if (!config) throw Error('Background did not initialize config');
        const provider = {id:'safari-smoke',name:'Safari smoke',enabled:true,provider:'deeplx',baseURL:origin+'/translate'};
        config.providersConfig.push(provider);
        config.pageTranslation.providerId=provider.id;
        config.language.targetCode='cmn';
        config.pageTranslation.page.autoTranslatePatterns=[];
        config.pageTranslation.page.minCharactersPerNode=1;
        config.pageTranslation.page.minWordsPerNode=1;
        await browser.storage.local.set({config});
        const tts = await browser.runtime.sendMessage({id:1,type:'ttsPlaybackPrepare',timestamp:Date.now()});
        if (!tts?.res?.ok) throw Error('Background DOM audio unavailable: '+JSON.stringify(tts));
        return document.body.innerText.includes('API Providers');
        """, arguments: ["origin": CommandLine.arguments[2]], in: nil, contentWorld: .page)
      try require(bootstrap as? Bool == true, "Options UI did not render")
      if CommandLine.arguments.count > 3 {
        let shot = try await options.takeSnapshot(configuration: nil)
        let png = NSBitmapImageRep(data: shot.tiffRepresentation!)!.representation(
          using: .png, properties: [:])!
        try png.write(
          to: URL(fileURLWithPath: CommandLine.arguments[3]).appendingPathComponent("options.png"))
      }
      print("PASS: config initialized, options rendered, DOM audio prepared")
      let pageConfig = WKWebViewConfiguration()
      pageConfig.webExtensionController = controller
      let page = WKWebView(
        frame: NSRect(x: 0, y: 0, width: 1100, height: 850), configuration: pageConfig)
      let navigation = Navigation()
      page.navigationDelegate = navigation
      nativeWindow.contentView = page
      let tab = TestTab(view: page, owner: delegate.window)
      delegate.window.list.append(tab)
      delegate.window.active = tab
      controller.didOpenTab(tab)
      page.load(URLRequest(url: URL(string: CommandLine.arguments[2])!))
      try await waitFor(
        page, "document.body?.innerText.includes('Reading every day') === true",
        "Fixture did not load")
      try await Task.sleep(for: .seconds(1))
      let toggled = try await options.callAsyncJavaScript(
        """
        const tabs=await browser.tabs.query({});
        const tab=tabs.find(t=>t.url?.startsWith(origin));
        if(!tab) throw Error('Fixture tab not found: '+JSON.stringify(tabs));
        return JSON.stringify(await browser.runtime.sendMessage({id:2,type:'tryToSetEnablePageTranslationByTabId',data:{tabId:tab.id,enabled:true},timestamp:Date.now()}));
        """, arguments: ["origin": CommandLine.arguments[2]], in: nil, contentWorld: .page)
      print("translation toggle: \(toggled ?? "nil")")
      var translated = false
      for _ in 0..<60 {
        let text = try await page.evaluateJavaScript("document.body.innerText") as? String ?? ""
        if text.contains("这是 Safari 的测试翻译") {
          translated = true
          print("translated page: \(text)")
          break
        }
        try await Task.sleep(for: .milliseconds(300))
      }
      if !translated {
        print("page HTML: \(try await page.evaluateJavaScript("document.body.innerHTML") ?? "nil")")
      }
      try require(translated, "Page translation did not appear")
      if CommandLine.arguments.count > 3 {
        let shot = try await page.takeSnapshot(configuration: nil)
        let png = NSBitmapImageRep(data: shot.tiffRepresentation!)!.representation(
          using: .png, properties: [:])!
        try png.write(
          to: URL(fileURLWithPath: CommandLine.arguments[3]).appendingPathComponent(
            "translated.png"))
      }
      let restored = try await options.callAsyncJavaScript(
        """
        const tab=(await browser.tabs.query({})).find(t=>t.url?.startsWith(origin));
        return JSON.stringify(await browser.runtime.sendMessage({id:3,type:'tryToSetEnablePageTranslationByTabId',data:{tabId:tab.id,enabled:false},timestamp:Date.now()}));
        """, arguments: ["origin": CommandLine.arguments[2]], in: nil, contentWorld: .page)
      print("restore toggle: \(restored ?? "nil")")
      try await waitFor(
        page, "!document.body.innerText.includes('这是 Safari 的测试翻译')", "Translation did not clear")
      let original = try await page.evaluateJavaScript("document.body.innerText") as? String ?? ""
      try require(
        !original.contains("这是 Safari 的测试翻译") && original.contains("Reading every day"),
        "Original page not restored")
      try require(context.errors.isEmpty, "Runtime errors: \(context.errors)")
      print(
        "PASS: real WebKit content injection, background messaging, provider request, bilingual DOM, and restore"
      )
      exit(0)
    } catch {
      print("FAILED: \(error)")
      exit(1)
    }
  }
}
