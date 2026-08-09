export const qboEnvironment = process.env.QBO_ENVIRONMENT === 'production'
  ? 'production'
  : 'sandbox';

export const qboCompanyBaseUrl = (realmId) => {
  const host = qboEnvironment === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
  return `${host}/v3/company/${realmId}`;
};
