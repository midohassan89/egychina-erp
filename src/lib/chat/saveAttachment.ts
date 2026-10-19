import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "text/plain": "txt",
};

export function isChatAttachmentPath(value: string) {
  return /^\/uploads\/chat\/[a-zA-Z0-9.-]+$/.test(value);
}

/** Save a chat image or file under public/uploads/chat without changing the uploads route. */
export async function saveChatAttachment(file: File) {
  const extension = EXTENSIONS[file.type];
  if (!extension) {
    throw new Error("نوع الملف غير مدعوم");
  }
  if (file.size <= 0 || file.size > 8 * 1024 * 1024) {
    throw new Error("حجم الملف يجب أن يكون أقل من 8 ميجا");
  }
  const filename = `${randomUUID()}.${extension}`;
  const directory = path.join(process.cwd(), "public", "uploads", "chat");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, filename), Buffer.from(await file.arrayBuffer()));
  return {
    url: `/uploads/chat/${filename}`,
    attachmentType: file.type.startsWith("image/") ? "IMAGE" : "FILE",
  };
}
