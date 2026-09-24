export const SURVEY_MODULES = {
  common_site: {
    key: 'common_site',
    title: 'Site conditions',
    version: 1,
    fields: ['accessNotes', 'parkingNotes', 'ceilingType', 'ceilingHeight', 'powerNotes', 'networkNotes', 'safetyNotes'],
  },
  structured_cabling: {
    key: 'structured_cabling',
    title: 'Structured cabling & devices',
    version: 1,
    recordType: 'cable_run',
  },
  camera_security: {
    key: 'camera_security',
    title: 'Cameras & physical security',
    version: 1,
    recordType: 'camera_location',
    fields: [
      { key: 'label', label: 'Camera label', type: 'text' },
      { key: 'location', label: 'Location', type: 'text' },
      { key: 'environment', label: 'Environment', type: 'select', options: ['Indoor', 'Outdoor', 'Covered outdoor'] },
      { key: 'mountingHeight', label: 'Mounting height', type: 'number' },
      { key: 'fieldOfView', label: 'Field of view', type: 'text' },
      { key: 'lighting', label: 'Lighting conditions', type: 'text' },
      { key: 'lensRequirements', label: 'Lens requirements', type: 'text' },
      { key: 'nvrLocation', label: 'NVR location', type: 'text' },
      { key: 'poeRequired', label: 'PoE required', type: 'checkbox' },
      { key: 'partType', label: 'Camera SKU / part type', type: 'text' },
      { key: 'notes', label: 'Placement notes', type: 'textarea' },
    ],
  },
  pos_register: {
    key: 'pos_register',
    title: 'POS & register infrastructure',
    version: 1,
    recordType: 'register_location',
    fields: [
      { key: 'label', label: 'Register label', type: 'text' },
      { key: 'location', label: 'Counter / location', type: 'text' },
      { key: 'equipmentModel', label: 'Equipment model', type: 'text' },
      { key: 'peripherals', label: 'Scanner / printer peripherals', type: 'text' },
      { key: 'vlan', label: 'Network / VLAN', type: 'text' },
      { key: 'dedicatedCircuit', label: 'Dedicated circuit available', type: 'checkbox' },
      { key: 'upsAvailable', label: 'UPS available', type: 'checkbox' },
      { key: 'counterPenetration', label: 'Counter penetration required', type: 'checkbox' },
      { key: 'partType', label: 'Equipment SKU / part type', type: 'text' },
      { key: 'notes', label: 'Installation notes', type: 'textarea' },
    ],
  },
  rf_signal: {
    key: 'rf_signal',
    title: 'RF signal & antenna design',
    version: 1,
    recordType: 'rf_measurement',
  },
  floor_plan: {
    key: 'floor_plan',
    title: 'Floor plan pins & markup',
    version: 1,
    recordType: 'floor_plan_pin',
    fields: [
      { key: 'label', label: 'Pin label', type: 'text' },
      { key: 'pinType', label: 'Pin type', type: 'select', options: ['Cable drop', 'Camera', 'Register', 'Access point', 'Antenna', 'Pathway', 'Hazard', 'Other'] },
      { key: 'x', label: 'Horizontal position', type: 'number' },
      { key: 'y', label: 'Vertical position', type: 'number' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
};

export function snapshotModule(key) {
  const definition = SURVEY_MODULES[key];
  if (!definition) throw new Error(`Unknown survey module: ${key}`);
  return JSON.parse(JSON.stringify(definition));
}
