import React, { useMemo } from "react";
import CodeMirror, { Extension } from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { oneDark } from "@codemirror/theme-one-dark";

export interface CodeMirrorEditorProps {
  value: string;
  language: "c" | "cpp" | "java" | "python";
  onChange: (val: string) => void;
  height?: string;
  readOnly?: boolean;
  className?: string;
}

export const CodeMirrorEditor: React.FC<CodeMirrorEditorProps> = ({
  value,
  language,
  onChange,
  height = "100%",
  readOnly = false,
  className = "",
}) => {
  const extensions = useMemo<Extension[]>(() => {
    const list: Extension[] = [oneDark];
    if (language === "python") {
      list.push(python());
    } else if (language === "c" || language === "cpp") {
      list.push(cpp());
    } else if (language === "java") {
      list.push(java());
    }
    return list;
  }, [language]);

  return (
    <div className={`w-full h-full overflow-hidden text-sm font-mono rounded-b-xl ${className}`}>
      <CodeMirror
        value={value}
        height={height}
        theme={oneDark}
        extensions={extensions}
        onChange={onChange}
        readOnly={readOnly}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightSpecialChars: true,
          history: true,
          foldGutter: true,
          drawSelection: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          syntaxHighlighting: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          rectangularSelection: true,
          crosshairCursor: true,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          closeBracketsKeymap: true,
          defaultKeymap: true,
          searchKeymap: true,
          historyKeymap: true,
          foldKeymap: true,
          completionKeymap: true,
          lintKeymap: true,
        }}
        style={{
          height: "100%",
          fontSize: "13.5px",
        }}
      />
    </div>
  );
};

