// Turns approved survey data into labor estimate lines. The hour allowances are
// starting points the estimator edits before creating the quote, so they live
// in one table instead of being buried in the handler.
export const LABOR_HOURS = {
  cableDrop: 1.0, // pull, terminate and test one drop
  conduitPerFoot: 0.05,
  camera: 1.5, // mount, aim, terminate and configure
  register: 1.0,
  donorAntenna: 3.0,
  rfCommissioning: 2.0, // per RF survey job, once
  closeoutShare: 0.1, // testing, labeling and documentation as a share of the rest
};

const round = (value) => Math.round(value * 100) / 100;

export function buildLaborItems({ modules = [], rate = 0 }) {
  const recordsOf = (id) => modules.find((module) => module.id === id)?.records || [];
  const lines = [];
  const add = (key, description, hours) => {
    if (!Number.isFinite(hours) || hours <= 0) return;
    lines.push({ key, description, quantity: round(hours), unitPrice: rate, driver: key });
  };

  const cabling = recordsOf('structured_cabling');
  const drops = cabling.reduce((sum, record) => sum + Math.max(0, Number(record.dropCount) || 0), 0);
  add('cable_drops', `Cable installation: ${drops} drop${drops === 1 ? '' : 's'}`, drops * LABOR_HOURS.cableDrop);
  const conduitFeet = cabling.filter((record) => record.conduitRequired).reduce((sum, record) => sum + Math.max(0, Number(record.estimatedFeet) || 0), 0);
  add('conduit', `Conduit installation: ${Math.round(conduitFeet)} ft`, conduitFeet * LABOR_HOURS.conduitPerFoot);

  const cameras = recordsOf('camera_security').length;
  add('cameras', `Camera installation and setup: ${cameras}`, cameras * LABOR_HOURS.camera);
  const registers = recordsOf('pos_register').length;
  add('registers', `POS / register infrastructure: ${registers}`, registers * LABOR_HOURS.register);

  const rf = recordsOf('rf_signal');
  const donors = new Set(rf.filter((record) => record.donorCandidate).map((record) => String(record.azimuth || 'unspecified'))).size;
  add('rf_donors', `Donor antenna installation: ${donors}`, donors * LABOR_HOURS.donorAntenna);
  if (rf.length) add('rf_commissioning', 'RF system commissioning and verification', LABOR_HOURS.rfCommissioning);

  const base = lines.reduce((sum, line) => sum + line.quantity, 0);
  add('closeout', 'Testing, labeling and closeout documentation', base * LABOR_HOURS.closeoutShare);
  return lines;
}
