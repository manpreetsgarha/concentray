import { Platform } from "react-native";
import {
  pickFilesFromDocument,
  type FileInputDocument,
  type PickFilesOptions,
  type UploadDraft,
} from "./uploadPicker";

export type { UploadDraft } from "./uploadPicker";

export function pickFilesForUpload(options?: PickFilesOptions): Promise<UploadDraft[]> {
  if (Platform.OS !== "web") {
    return Promise.resolve([]);
  }

  const doc = (globalThis as { document?: FileInputDocument }).document;
  if (!doc) {
    return Promise.resolve([]);
  }

  return pickFilesFromDocument(doc, options);
}

export async function pickFileForUpload(options?: Omit<PickFilesOptions, "multiple">): Promise<UploadDraft | null> {
  const drafts = await pickFilesForUpload({ ...options, multiple: false });
  return drafts[0] ?? null;
}
