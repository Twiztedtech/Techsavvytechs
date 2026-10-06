import type { SiteSurvey, SurveyRecord } from './types';

type QueuedBody = Record<string, unknown>;

// A survey served from the phone's cache is the copy from the last time we had
// signal. Anything the technician has done since is sitting in the offline
// queue, not on the server. Laying those queued changes over the cached copy
// means the survey looks the way they left it, even after the app was closed
// and reopened with no signal. Pure, so it is easy to test.
export function overlayQueuedChanges(survey: SiteSurvey, queued: QueuedBody[]): SiteSurvey {
  const mine = queued.filter((body) => body.id === survey.id);
  if (!mine.length || !survey.modules) return survey;

  let modules = survey.modules.map((module) => ({ ...module, answers: { ...module.answers }, records: [...module.records] }));
  let attachments = [...(survey.attachments || [])];
  const moduleOf = (key: unknown) => modules.find((module) => module.id === key || module.moduleKey === key);

  mine.forEach((body, index) => {
    const module = moduleOf(body.moduleKey);
    if (body.action === 'saveModule' && module) {
      module.answers = { ...module.answers, ...(body.answers as Record<string, string | number | boolean>) };
    } else if (body.action === 'upsertRecord' && module) {
      const recordId = String(body.recordId || '');
      if (!recordId) return;
      const record = { ...(body.record as SurveyRecord), id: recordId };
      const at = module.records.findIndex((item) => item.id === recordId);
      if (at >= 0) module.records[at] = { ...module.records[at], ...record };
      else module.records.push(record);
    } else if (body.action === 'deleteRecord' && module) {
      module.records = module.records.filter((item) => item.id !== body.recordId);
      attachments = attachments.filter((photo) => photo.recordId !== body.recordId);
    } else if (body.action === 'uploadAttachment') {
      const dataUrl = String(body.dataUrl || '');
      if (!dataUrl) return;
      attachments.push({
        id: `offline-photo-${index}`,
        moduleKey: String(body.moduleKey || ''),
        recordId: body.recordId ? String(body.recordId) : undefined,
        caption: body.caption ? String(body.caption) : undefined,
        url: dataUrl,
        contentType: /^data:([^;,]+)/.exec(dataUrl)?.[1],
      });
    }
  });

  modules = modules.map((module) => ({ ...module }));
  return { ...survey, modules, attachments };
}
