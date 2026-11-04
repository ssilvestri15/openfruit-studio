import { registerSemanticProviders } from './lspProviders';
import type * as Monaco from 'monaco-editor';

// Rich SwiftUI & Swift 6 Completion Database
const SWIFT_KEYWORDS = [
  { label: 'func', detail: 'Function declaration', snippet: 'func ${1:name}(${2:params}) -> ${3:ReturnType} {\n\t$0\n}' },
  { label: 'struct', detail: 'Structure declaration', snippet: 'struct ${1:Name} {\n\t$0\n}' },
  { label: 'class', detail: 'Class declaration', snippet: 'class ${1:Name} {\n\t$0\n}' },
  { label: 'enum', detail: 'Enumeration declaration', snippet: 'enum ${1:Name} {\n\tcase ${2:first}\n}' },
  { label: 'protocol', detail: 'Protocol declaration', snippet: 'protocol ${1:Name} {\n\t$0\n}' },
  { label: 'actor', detail: 'Swift Concurrency Actor', snippet: 'actor ${1:Name} {\n\t$0\n}' },
  { label: 'extension', detail: 'Type extension', snippet: 'extension ${1:Type} {\n\t$0\n}' },
  { label: 'guard let', detail: 'Guard unwrapping statement', snippet: 'guard let ${1:unwrapped} = ${2:optional} else {\n\treturn\n}' },
  { label: 'if let', detail: 'Optional binding if statement', snippet: 'if let ${1:unwrapped} = ${2:optional} {\n\t$0\n}' },
  { label: 'switch', detail: 'Pattern matching switch', snippet: 'switch ${1:value} {\ncase ${2:pattern}:\n\t$0\ndefault:\n\tbreak\n}' },
  { label: 'import', detail: 'Import module', snippet: 'import ${1:SwiftUI}' },
  { label: 'async/await', detail: 'Async function', snippet: 'func ${1:fetchData}() async throws -> ${2:Data} {\n\t$0\n}' },
  { label: 'init', detail: 'Initializer', snippet: 'init(${1:params}) {\n\t$0\n}' },
  { label: 'mutating func', detail: 'Mutating structure method', snippet: 'mutating func ${1:action}() {\n\t$0\n}' }
];

const SWIFTUI_WRAPPERS = [
  { label: '@State', detail: 'SwiftUI mutable state within a View', snippet: '@State private var ${1:name}: ${2:Type} = ${3:value}' },
  { label: '@Binding', detail: 'Two-way binding to state owned elsewhere', snippet: '@Binding var ${1:name}: ${2:Type}' },
  { label: '@Environment', detail: 'Read from SwiftUI environment', snippet: '@Environment(\\.${1:dismiss}) private var ${1:dismiss}' },
  { label: '@Observable', detail: 'Swift 6 observation macro for classes', snippet: '@Observable\nclass ${1:Model} {\n\tvar ${2:property}: ${3:String} = ""\n}' },
  { label: '@FocusState', detail: 'Focus state for text fields', snippet: '@FocusState private var ${1:isFocused}: Bool' },
  { label: '@AppStorage', detail: 'Persistent UserDefaults backed property', snippet: '@AppStorage("${1:key}") private var ${2:value} = ${3:defaultValue}' },
  { label: '@Namespace', detail: 'Namespace for matched geometry effects', snippet: '@Namespace private var ${1:animation}' }
];

const SWIFTUI_VIEWS = [
  { label: 'VStack', detail: 'Vertical stack layout', snippet: 'VStack(alignment: .${1:leading}, spacing: ${2:16}) {\n\t$0\n}' },
  { label: 'HStack', detail: 'Horizontal stack layout', snippet: 'HStack(alignment: .${1:center}, spacing: ${2:12}) {\n\t$0\n}' },
  { label: 'ZStack', detail: 'Overlaying depth stack layout', snippet: 'ZStack {\n\t$0\n}' },
  { label: 'Text', detail: 'Text display view', snippet: 'Text("${1:Hello, World!}")' },
  { label: 'Button', detail: 'Interactive button control', snippet: 'Button(action: {\n\t$1\n}) {\n\tText("${2:Titolo}")\n}' },
  { label: 'Image', detail: 'System symbol or asset image', snippet: 'Image(systemName: "${1:sparkles}")' },
  { label: 'NavigationStack', detail: 'Root navigation container', snippet: 'NavigationStack {\n\t${1:ContentView()}\n\t\t.navigationTitle("${2:Titolo}")\n}' },
  { label: 'NavigationLink', detail: 'Navigation destination transition', snippet: 'NavigationLink(destination: ${1:DetailView()}) {\n\t${2:Label("Dettaglio", systemImage: "chevron.right")}\n}' },
  { label: 'ScrollView', detail: 'Scrollable container', snippet: 'ScrollView {\n\tVStack(spacing: ${1:16}) {\n\t\t$0\n\t}\n\t.padding()\n}' },
  { label: 'List', detail: 'Vertical scrollable list of rows', snippet: 'List(${1:items}) { ${2:item} in\n\tText(${2:item}.name)\n}' },
  { label: 'ForEach', detail: 'Dynamic view generation from collections', snippet: 'ForEach(${1:items}) { ${2:item} in\n\t$0\n}' },
  { label: 'Spacer', detail: 'Flexible expanding space', snippet: 'Spacer()' },
  { label: 'Divider', detail: 'Visual separation line', snippet: 'Divider()' },
  { label: 'TextField', detail: 'Text entry input control', snippet: 'TextField("${1:Placeholder}", text: $${2:text})' },
  { label: 'Toggle', detail: 'Switch toggle control', snippet: 'Toggle("${1:Attiva}", isOn: $${2:isOn})' },
  { label: 'Slider', detail: 'Continuous value selection slider', snippet: 'Slider(value: $${1:value}, in: ${2:0...100})' },
  { label: 'ProgressView', detail: 'Progress indicator spinner or bar', snippet: 'ProgressView("${1:Caricamento...}")' },
  { label: 'AsyncImage', detail: 'Asynchronously loaded remote image', snippet: 'AsyncImage(url: URL(string: "${1:https://...}")) {\n\t$0\n}' }
];

const SWIFTUI_MODIFIERS = [
  { label: '.padding()', detail: 'Standard padding around view', snippet: '.padding(${1:16})' },
  { label: '.foregroundStyle()', detail: 'Set view foreground style / color', snippet: '.foregroundStyle(${1:.primary})' },
  { label: '.background()', detail: 'Layer background view or color', snippet: '.background(${1:Color.fruitBg})' },
  { label: '.font()', detail: 'Set typography size and weight', snippet: '.font(.system(size: ${1:16}, weight: .${2:semibold}))' },
  { label: '.frame()', detail: 'Set dimensions constraints', snippet: '.frame(maxWidth: .infinity, alignment: .${1:leading})' },
  { label: '.cornerRadius()', detail: 'Round view corners', snippet: '.cornerRadius(${1:12})' },
  { label: '.clipShape()', detail: 'Clip to shape', snippet: '.clipShape(${1:RoundedRectangle(cornerRadius: 16)})' },
  { label: '.shadow()', detail: 'Add drop shadow', snippet: '.shadow(color: Color.black.opacity(0.15), radius: 8, x: 0, y: 4)' },
  { label: '.navigationTitle()', detail: 'Set title in NavigationStack bar', snippet: '.navigationTitle("${1:Titolo}")' },
  { label: '.toolbar()', detail: 'Add toolbar items', snippet: '.toolbar {\n\tToolbarItem(placement: .primaryAction) {\n\t\t$0\n\t}\n}' },
  { label: '.onAppear()', detail: 'Trigger action when view appears', snippet: '.onAppear {\n\t$0\n}' },
  { label: '.onChange()', detail: 'Trigger action on state change', snippet: '.onChange(of: ${1:value}) { oldValue, newValue in\n\t$0\n}' },
  { label: '.sheet()', detail: 'Present modal sheet', snippet: '.sheet(isPresented: $${1:showSheet}) {\n\t$0\n}' },
  { label: '.opacity()', detail: 'Set view transparency', snippet: '.opacity(${1:0.8})' },
  { label: '.animation()', detail: 'Apply explicit animation', snippet: '.animation(.spring(duration: 0.35), value: ${1:selected})' }
];

const SWIFT_HOVER_DOCS: Record<string, string> = {
  'View': '**protocol View**\n\nA type that represents part of the user interface of an app and provides modifiers that you use to configure views.\n\n*Conforms to SwiftUI.View*',
  'NavigationStack': '**struct NavigationStack<Data, Root>**\n\nA view that displays a root view and enables you to present additional views over the root view.\n\nReplaces deprecated `NavigationView` in iOS 16+.',
  'VStack': '**struct VStack<Content>**\n\nA view that arranges its subviews in a vertical line with configurable alignment and spacing.',
  'HStack': '**struct HStack<Content>**\n\nA view that arranges its subviews in a horizontal line.',
  'ZStack': '**struct ZStack<Content>**\n\nA view that overlays its subviews, aligning them in both axes.',
  '@State': '**@propertyWrapper struct State<Value>**\n\nA property wrapper type that can read and write a value managed by SwiftUI. When the value changes, SwiftUI updates the parts of the view hierarchy that depend on the value.',
  '@Binding': '**@propertyWrapper struct Binding<Value>**\n\nA property wrapper type that can read and write a value owned by a source of truth, such as a `@State` property on another view.',
  '@Observable': '**@attached(member) @attached(extension) macro Observable()**\n\nDefines and implements observation support for a class in Swift 6 and iOS 17+.',
  'Text': '**struct Text**\n\nA view that displays one or more lines of read-only text with rich formatting and dynamic type support.',
  'Button': '**struct Button<Label>**\n\nA control that initiates an action when tapped or clicked.',
  'padding': '**func padding(_ length: CGFloat? = nil) -> some View**\n\nPads this view using the specified amount of space.'
};

let isRegistered = false;

export function registerSwiftLanguageFeatures(monaco: typeof Monaco) {
  if (isRegistered) return;
  isRegistered = true;
  registerSemanticProviders(monaco);

  // 1. Completion Provider
  monaco.languages.registerCompletionItemProvider('swift', {
    triggerCharacters: ['.', '(', '@', ' '],
    provideCompletionItems: async (model, position, _context, token) => {
      const word = model.getWordUntilPosition(position);
      const lineContent = model.getLineContent(position.lineNumber);
      const beforeCursor = lineContent.substring(0, position.column - 1).trim();

      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };

      const items: any[] = [];

      // Try SourceKit-LSP first
      const api = (window as any).openfruitApi;
      if (api?.lspCompletion && model.uri) {
        try {
          const lspResult = await api.lspCompletion(
            model.uri.toString(),
            position.lineNumber - 1,
            position.column - 1
          );
          if (token.isCancellationRequested) return { suggestions: [] };
          if (lspResult) {
            const rawItems = Array.isArray(lspResult) ? lspResult : lspResult.items;
            if (Array.isArray(rawItems) && rawItems.length > 0) {
              for (const lspItem of rawItems.slice(0, 30)) {
                items.push({
                  label: lspItem.label,
                  kind: monaco.languages.CompletionItemKind[(['Text', 'Method', 'Function', 'Constructor', 'Field', 'Variable', 'Class', 'Interface', 'Module', 'Property', 'Unit', 'Value', 'Enum', 'Keyword', 'Snippet', 'Color', 'File', 'Reference', 'Folder', 'EnumMember', 'Constant', 'Struct', 'Event', 'Operator', 'TypeParameter'][lspItem.kind - 1] || 'Text') as keyof typeof monaco.languages.CompletionItemKind],
                  detail: lspItem.detail || 'SourceKit-LSP',
                  documentation: lspItem.documentation?.value || lspItem.documentation,
                  insertText: lspItem.textEdit?.newText ?? lspItem.insertText ?? lspItem.label,
                  insertTextRules: lspItem.insertTextFormat === 2 ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
                  range: lspItem.textEdit?.range ? {
                    startLineNumber: lspItem.textEdit.range.start.line + 1,
                    startColumn: lspItem.textEdit.range.start.character + 1,
                    endLineNumber: lspItem.textEdit.range.end.line + 1,
                    endColumn: lspItem.textEdit.range.end.character + 1
                  } : range
                });
              }
            }
          }
        } catch (e) {
          // SourceKit query timed out, fallback to rich catalog
        }
      }

      // If user typed dot '.', suggest SwiftUI modifiers
      if (beforeCursor.endsWith('.')) {
        for (const mod of SWIFTUI_MODIFIERS) {
          items.push({
            label: mod.label.replace('.', ''),
            kind: monaco.languages.CompletionItemKind.Method,
            detail: mod.detail,
            documentation: `SwiftUI View Modifier\n${mod.detail}`,
            insertText: mod.snippet.replace(/^\./, ''),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range
          });
        }
        return { suggestions: items };
      }

      // If user typed '@', suggest property wrappers
      if (beforeCursor.endsWith('@')) {
        for (const wrap of SWIFTUI_WRAPPERS) {
          items.push({
            label: wrap.label.replace('@', ''),
            kind: monaco.languages.CompletionItemKind.Keyword,
            detail: wrap.detail,
            insertText: wrap.snippet.replace(/^@/, ''),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range
          });
        }
        return { suggestions: items };
      }

      // SwiftUI Views
      for (const view of SWIFTUI_VIEWS) {
        items.push({
          label: view.label,
          kind: monaco.languages.CompletionItemKind.Class,
          detail: view.detail,
          insertText: view.snippet,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range
        });
      }

      // Swift Keywords & Snippets
      for (const kw of SWIFT_KEYWORDS) {
        items.push({
          label: kw.label,
          kind: monaco.languages.CompletionItemKind.Keyword,
          detail: kw.detail,
          insertText: kw.snippet,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range
        });
      }

      // SwiftUI Modifiers without leading dot
      for (const mod of SWIFTUI_MODIFIERS) {
        items.push({
          label: mod.label,
          kind: monaco.languages.CompletionItemKind.Method,
          detail: mod.detail,
          insertText: mod.snippet,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range
        });
      }

      return { suggestions: items };
    }
  });

  // 2. Hover Provider
  monaco.languages.registerHoverProvider('swift', {
    provideHover: async (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const api = (window as any).openfruitApi;
      if (api?.lspHover && model.uri) {
        try {
          const lspHover = await api.lspHover(
            model.uri.toString(),
            position.lineNumber - 1,
            position.column - 1
          );
          if (lspHover && lspHover.contents) {
            const contents = Array.isArray(lspHover.contents)
              ? lspHover.contents.map((c: any) => ({ value: c.value || c }))
              : [{ value: lspHover.contents.value || lspHover.contents }];
            return { contents };
          }
        } catch (e) {}
      }

      // Built-in Swift / SwiftUI docs fallback
      const doc = SWIFT_HOVER_DOCS[word.word];
      if (doc) {
        return {
          contents: [{ value: doc }]
        };
      }

      return null;
    }
  });
}
