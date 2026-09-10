/** Whether a technician (contractor doc) may be emailed/texted about job events. */
export function technicianNotifiable(technician) {
  return {
    canEmail: technician?.notificationPreferences?.email !== false,
    canSms:
      technician?.mobileVerified === true &&
      technician?.smsConsent?.optedIn === true &&
      technician?.notificationPreferences?.sms !== false,
  };
}

/** Whether a client-portal participant may be texted about job events. */
export function customerNotifiable(customer) {
  return { canSms: customer?.smsConsent?.optedIn === true };
}
