import { Platform } from "react-native";

export interface UploadDraft {
  filename: string;
  mime_type: string;
  size_bytes: number;
  data_base64: string;
}

export function pickFileForUpload(): Promise<UploadDraft | null> {
  if (Platform.OS !== "web") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) {
      resolve(null);
      return;
    }

    const input = doc.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*,text/plain,text/csv,.txt,.csv";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result ?? "");
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        resolve({
          filename: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          data_base64: base64
        });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.click();
  });
}
