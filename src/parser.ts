import * as vscode from "vscode";
import * as logger from "./logger"
import * as sax from "sax";

interface EditInfo {
  length: number;
  offset: number;
  text: string;
}

export function getEdits(
  document: vscode.TextDocument,
  xml: string,
  codeContent: string,
): Promise<vscode.TextEdit[]> {
  return new Promise<vscode.TextEdit[]>((resolve, reject) => {
    // Use strict XML parsing
    const options = {
      trim: false,
      normalize: false,
      strict: true,
      lowercase: true,
    };

    const parser = sax.parser(true, options);
    const edits: vscode.TextEdit[] = [];
    let currentEdit: EditInfo | undefined;

    // Create a reusable buffer for UTF-8 calculations
    const textEncoder = new TextEncoder();
    const getUtf8Length = (str: string, start: number, len: number): number => {
      return textEncoder.encode(str.substring(start, start + len)).length;
    };

    const byteToOffset = (editInfo: EditInfo): EditInfo => {
      const content = codeContent;
      let bytePos = 0;
      let charPos = 0;

      // Find the character position that corresponds to the byte offset
      while (bytePos < editInfo.offset && charPos < content.length) {
        bytePos += getUtf8Length(content, charPos, 1);
        charPos++;
      }
      editInfo.offset = charPos;

      // Calculate the length in characters
      const byteEnd = bytePos + editInfo.length;
      let charEnd = charPos;
      while (bytePos < byteEnd && charEnd < content.length) {
        bytePos += getUtf8Length(content, charEnd, 1);
        charEnd++;
      }
      editInfo.length = charEnd - charPos;

      return editInfo;
    };

    const handleError = (error: Error): void => {
      logger.log(`XML parsing error: ${error.message}`);
      reject(error);
    };

    parser.onerror = handleError;

    parser.onopentag = (tag) => {
      if (currentEdit) {
        handleError(new Error("Malformed XML: nested replacement tags"));
        return;
      }

      switch (tag.name.toLowerCase()) {
        case "replacements":
          return;

        case "replacement": {
          const length = tag.attributes.length;
          const offset = tag.attributes.offset;

          if (typeof length !== "string" || typeof offset !== "string") {
            handleError(new Error("Malformed XML: missing required attributes"));
            return;
          }

          currentEdit = {
            length: parseInt(length),
            offset: parseInt(offset),
            text: "",
          };
          byteToOffset(currentEdit);
          break;
        }

        default:
          handleError(new Error(`Unexpected XML tag: ${tag.name}`));
      }
    };

    parser.ontext = (text) => {
      if (!currentEdit) {
        return;
      }
      currentEdit.text = text;
    };

    parser.onclosetag = (_) => {
      if (!currentEdit) {
        return;
      }

      try {
        const start = document.positionAt(currentEdit.offset);
        const end = document.positionAt(currentEdit.offset + currentEdit.length);
        const editRange = new vscode.Range(start, end);
        edits.push(new vscode.TextEdit(editRange, currentEdit.text));
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "unknown error";
        handleError(new Error(`Failed to create edit: ${errorMessage}`));
        return;
      }

      currentEdit = undefined;
    };

    parser.onend = () => {
      if (currentEdit) {
        handleError(new Error("Malformed XML: unclosed replacement tag"));
        return;
      }
      resolve(edits);
    };

    try {
      parser.write(xml);
      parser.end();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "unknown error";
      handleError(new Error(`XML processing error: ${errorMessage}`));
    }
  });
}
