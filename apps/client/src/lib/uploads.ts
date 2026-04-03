import { Platform } from "react-native";

export interface UploadDraft {
  filename: string;
  mime_type: string;
  size_bytes: number;
  data_base64: string;
}

interface PickFilesOptions {
  accept?: string;
  multiple?: boolean;
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

export function pickFilesForUpload(options?: PickFilesOptions): Promise<UploadDraft[]> {
  if (Platform.OS !== "web") {
    return Promise.resolve([]);
  }

  return new Promise((resolve) => {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) {
      resolve([]);
      return;
    }

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
      Promise.all(files.map(readFileAsUploadDraft))
        .then(resolve)
        .catch(() => resolve([]));
    };
    input.click();
  });
}

export async function pickFileForUpload(options?: Omit<PickFilesOptions, "multiple">): Promise<UploadDraft | null> {
  const drafts = await pickFilesForUpload({ ...options, multiple: false });
  return drafts[0] ?? null;
}
