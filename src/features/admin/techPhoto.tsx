export function TechAvatar({ name, photoUrl, size = 32 }: { name?: string; photoUrl?: string; size?: number }) {
  const initials = (name || "T").split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();
  const style = { width: size, height: size };
  return photoUrl ? (
    <img src={photoUrl} alt={name || "Technician"} style={style} className="shrink-0 rounded-full object-cover" />
  ) : (
    <span style={style} className="grid shrink-0 place-items-center rounded-full bg-crm-ink text-[10px] font-bold text-crm-canvas">
      {initials}
    </span>
  );
}

// Resizes an image file to a square-cropped JPEG data URL (~256px) so it can
// be stored directly on the contractor record without Storage rules.
export async function resizeProfilePhoto(file: File, size = 256): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process this image.");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.85);
}
