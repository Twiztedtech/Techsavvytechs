export async function compressSurveyPhoto(file: File): Promise<string> {
  const bitmap = 'createImageBitmap' in window ? await createImageBitmap(file) : await loadImage(file);
  const max = 1920;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Photo processing is unavailable in this browser.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The selected photo could not be opened.')); };
    image.src = url;
  });
}
