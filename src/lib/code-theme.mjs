// Articles and comments share these scopes. The colors live in type-stage.css.
/** @satisfies {import('shiki').ThemeRegistration} */
const codeTheme = {
    "name": "bbb",
    "type": "dark",
    "semanticHighlighting": true,
    "colors": {
      "editor.background": "#22262b",
      "editor.foreground": "#e9ebee",
      "editor.lineHighlightBackground": "#2e3237",
      "editorLineNumber.foreground": "#99a1aa",
      "editorLineNumber.activeForeground": "#e9ebee",
      "editorGutter.background": "#22262b",
      "editorWidget.background": "#1c1f23",
      "editorWidget.border": "#2b3037",
      "panel.border": "#2b3037",
      "focusBorder": "#e9a83c",
      "editorError.foreground": "#f0655f",
      "editorWarning.foreground": "#e8c547",
      "editorInfo.foreground": "#6fb6ef",
      "editorHint.foreground": "#8a929b",
      "titleBar.activeBackground": "#1c1f23",
      "titleBar.activeForeground": "#99a1aa",
      "tab.activeBackground": "#22262b",
      "tab.activeForeground": "#e9ebee",
      "tab.inactiveBackground": "#1c1f23",
      "tab.inactiveForeground": "#99a1aa",
      "tab.border": "#2b3037",
      "editorGroupHeader.tabsBackground": "#1c1f23",
      "editorGroupHeader.tabsBorder": "#2b3037",
      "terminal.background": "#22262b",
      "terminal.foreground": "#e9ebee"
    },
    "tokenColors": [
      {
        "settings": {
          "foreground": "var(--fg)"
        }
      },
      {
        "scope": [
          "comment",
          "punctuation.definition.comment"
        ],
        "settings": {
          "foreground": "var(--tok-com)",
          "fontStyle": "italic"
        }
      },
      {
        "scope": [
          "string",
          "string.quoted",
          "string.template",
          "punctuation.definition.string"
        ],
        "settings": {
          "foreground": "var(--tok-str)"
        }
      },
      {
        "scope": [
          "constant.numeric",
          "constant.language",
          "constant.character",
          "constant"
        ],
        "settings": {
          "foreground": "var(--tok-num)"
        }
      },
      {
        "scope": [
          "keyword",
          "storage",
          "storage.type",
          "storage.modifier",
          "keyword.control",
          "keyword.operator.expression",
          "variable.language"
        ],
        "settings": {
          "foreground": "var(--tok-key)"
        }
      },
      {
        "scope": [
          "entity.name.function",
          "support.function",
          "meta.function-call.generic",
          "entity.name.function.member"
        ],
        "settings": {
          "foreground": "var(--tok-fn)"
        }
      },
      {
        "scope": [
          "entity.name.type",
          "entity.name.class",
          "entity.name.namespace",
          "support.type",
          "support.class",
          "entity.other.inherited-class"
        ],
        "settings": {
          "foreground": "var(--tok-type)"
        }
      },
      {
        "scope": [
          "variable",
          "variable.other",
          "meta.definition.variable",
          "entity.name.variable"
        ],
        "settings": {
          "foreground": "var(--fg)"
        }
      },
      {
        "scope": [
          "keyword.operator",
          "punctuation"
        ],
        "settings": {
          "foreground": "var(--fg-dim)"
        }
      },
      {
        "scope": [
          "entity.name.tag"
        ],
        "settings": {
          "foreground": "var(--tok-key)"
        }
      },
      {
        "scope": [
          "entity.other.attribute-name"
        ],
        "settings": {
          "foreground": "var(--tok-fn)"
        }
      },
      {
        "scope": [
          "invalid",
          "invalid.illegal"
        ],
        "settings": {
          "foreground": "var(--sev-error)"
        }
      }
    ]
};

export default codeTheme;
