export interface UploadDraft {
  filename: string;
  mime_type: string;
  size_bytes: number;
  data_base64: string;
}

export interface PickFilesOptions {
  accept?: string;
  multiple?: boolean;
}

export interface FileInputElement {
  type: string;
  accept: string;
  multiple: boolean;
  files?: ArrayLike<File> | Iterable<File> | null;
  onchange: (() => void) | null;
  oncancel?: (() => void) | null;
  click: () => void;
}

export interface FileInputDocument {
  createElement(tagName: "input"): FileInputElement;
}

function readFileAsUploadDraft(file: File): Promise<UploadDraft> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve({
        filename: file.name,
        mime_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        data_base64: base64,
      });
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export function pickFilesFromDocument(
  doc: FileInputDocument,
  options?: PickFilesOptions,
  readDraft: (file: File) => Promise<UploadDraft> = readFileAsUploadDraft
): Promise<UploadDraft[]> {
  return new Promise((resolve, reject) => {
    const input = doc.createElement("input");
    input.type = "file";
    input.accept = options?.accept ?? "image/*,video/*,text/plain,text/csv,.txt,.csv";
    input.multiple = Boolean(options?.multiple);
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      if (files.length === 0) {
        resolve([]);
        return;
      }
      Promise.all(files.map((file) => readDraft(file)))
        .then(resolve)
        .catch(reject);
    };
    input.oncancel = () => resolve([]);
    input.click();
  });
}
