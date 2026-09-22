// TechSavvy LLC — general Service Agreement used by the public /agreement
// signing page. This establishes the ongoing working relationship, rate
// terms, and independent contractor status between TechSavvy and a
// customer; individual jobs are then issued as Work Orders under it rather
// than each requiring a new signed contract. This is generic boilerplate —
// have counsel review it before relying on it for a real engagement.
// Sections flagged `requiresInitial` must be individually initialed before
// the agreement can be submitted.

export type AgreementSection = {
  id: string;
  heading: string;
  paragraphs: string[];
  requiresInitial: boolean;
};

export const COMPANY = {
  legalName: "TechSavvy LLC",
  hq: "Fairfield, CA 94533",
  phone: "(707) 653-6702",
  email: "support@techsavvytechs.com",
  website: "techsavvytechs.com",
};

export const AGREEMENT_TITLE = "Service Agreement";

// Fixed company-wide policy, not negotiated per customer -- only the two
// dollar rates below are customer-specific.
export const STANDARD_HOURS_LABEL = "7:00 AM to 5:00 PM";
export const DEFAULT_MINIMUM_HOURS = 2;

const money = (value: number) =>
  value > 0 ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "";

export function buildAgreementSections(input: {
  customerName: string;
  businessName: string;
  address: string;
  standardRate: number;
  nightRate: number;
  minimumHours: number;
}): AgreementSection[] {
  const customer = input.businessName?.trim() || input.customerName?.trim() || "Customer";
  const standardRateLabel = money(input.standardRate);
  const nightRateLabel = money(input.nightRate);
  const minimumHours = input.minimumHours > 0 ? input.minimumHours : DEFAULT_MINIMUM_HOURS;
  return [
    {
      id: "parties",
      heading: "1. Parties & Effective Date",
      requiresInitial: false,
      paragraphs: [
        `This Service Agreement ("Agreement") is entered into between ${COMPANY.legalName} ("TechSavvy," "we," or "us"), headquartered at ${COMPANY.hq}, and ${customer} ("Customer," "you"), effective as of the date this Agreement is signed below.`,
        "This Agreement is a general, ongoing agreement governing the working relationship between TechSavvy and Customer. It does not by itself authorize any specific job. Each individual job is authorized by a separate Work Order, quote, dispatch confirmation, or job ticket issued under this Agreement, which sets out that job's specific scope, site, schedule, and pricing.",
      ],
    },
    {
      id: "scope",
      heading: "2. Scope of Services",
      requiresInitial: true,
      paragraphs: [
        "TechSavvy provides low-voltage cabling (including certified Cat6/Cat6A and multi-mode fiber installation), network infrastructure and architecture, managed IT (MSP) services, and RF/cell signal boosting and coverage solutions, together with related field service, technology installation, and technician staffing/subcontract work of the general type TechSavvy performs from time to time.",
        "This Agreement covers all such work Customer engages TechSavvy to perform, whether or not that specific service line is separately advertised by TechSavvy at the time of the engagement, and whether TechSavvy performs the work directly, through its own technicians, or through qualified subcontractors under Section 10.",
        "The specific scope, deliverables, site(s), schedule, and any fixed or estimated pricing for a given job will be documented in the Work Order, quote, or job ticket issued for that job. Work outside a given Work Order's scope, including additional materials, labor, or site conditions discovered after work begins, will be documented in a written change order or updated quote before it is performed and billed.",
      ],
    },
    {
      id: "contractor-status",
      heading: "3. Independent Contractor Status",
      requiresInitial: true,
      paragraphs: [
        "TechSavvy is an independent contractor, not an employee, agent, joint venturer, or partner of Customer. TechSavvy controls the means, methods, and manner by which its work is performed, including the personnel (its own employees or qualified subcontractors) it assigns to a job. Nothing in this Agreement creates an employment relationship between Customer and TechSavvy or any TechSavvy technician.",
        "Customer will not withhold taxes from amounts paid to TechSavvy, and TechSavvy is solely responsible for its own and its personnel's taxes, workers' compensation coverage, benefits, and insurance. TechSavvy technicians are not entitled to any employee benefit, insurance, or compensation program Customer maintains for its own employees.",
      ],
    },
    {
      id: "rates",
      heading: "4. Fees & Billable Rates",
      requiresInitial: true,
      paragraphs: [
        standardRateLabel && nightRateLabel
          ? `Customer agrees to the following hourly billing rates for work performed under this Agreement and any Work Order issued under it: a standard rate of ${standardRateLabel} per hour for work performed during standard business hours, ${STANDARD_HOURS_LABEL}; and a night rate of ${nightRateLabel} per hour for work performed outside standard business hours (before 7:00 AM or after 5:00 PM), including weekends and holidays unless otherwise agreed in the applicable Work Order.`
          : `Customer agrees to TechSavvy's standard and night hourly billing rates as stated on the cover of this Agreement, applicable to work performed under this Agreement and any Work Order issued under it. TechSavvy's standard business hours are ${STANDARD_HOURS_LABEL}; work performed outside that window is billed at the night rate.`,
        `All service calls and dispatches are subject to a minimum billable time of ${minimumHours} hour${minimumHours === 1 ? "" : "s"}, regardless of actual time on site, unless a different minimum is stated in the applicable Work Order. Rates apply per technician dispatched unless a different arrangement is documented in the applicable Work Order.`,
        "A specific job's fixed-price or not-to-exceed pricing, if any, will be stated in that job's quote or Work Order and controls over the hourly rates above for that job only. Invoices are due upon receipt unless other terms are agreed to in writing. Late payments may accrue interest at the maximum rate allowed by California law and may result in suspension of ongoing services until the account is brought current. Customer is responsible for any collection costs, including reasonable attorneys' fees, incurred in recovering unpaid amounts.",
      ],
    },
    {
      id: "term",
      heading: "5. Term & Scheduling",
      requiresInitial: false,
      paragraphs: [
        "This Agreement begins on the effective date above and remains in effect for all jobs Customer and TechSavvy agree to under it, until terminated by either party as described in Section 9.",
        "Scheduling for each job is coordinated in advance and confirmed in that job's Work Order or dispatch confirmation. TechSavvy will make commercially reasonable efforts to meet agreed-upon dates but is not liable for delays caused by site access issues, third-party equipment or carrier delays, permitting, weather, or other circumstances outside TechSavvy's reasonable control.",
      ],
    },
    {
      id: "customer-responsibilities",
      heading: "6. Site Access & Customer Responsibilities",
      requiresInitial: false,
      paragraphs: [
        "Customer will provide TechSavvy technicians with safe, timely access to each work site, including any required parking, keys, badges, or escort. Customer is responsible for disclosing known hazards (electrical, structural, environmental, or otherwise) and for any pre-existing wiring, equipment, or building conditions not caused by TechSavvy.",
        "Customer is responsible for ensuring it has authority to grant access to each site and to authorize the work described in the applicable Work Order.",
      ],
    },
    {
      id: "warranty",
      heading: "7. Warranty",
      requiresInitial: true,
      paragraphs: [
        "TechSavvy warrants that services will be performed in a workmanlike manner consistent with industry standards. Workmanship on cabling and installation labor is warranted for 90 days from completion of the applicable job unless a longer period is stated in that job's quote or Work Order.",
        "This warranty does not cover damage from misuse, unauthorized modification, third-party work, power surges, acts of nature, or normal wear. Equipment and materials carry only the warranty provided by their manufacturer. EXCEPT AS STATED IN THIS SECTION, TECHSAVVY MAKES NO OTHER WARRANTIES, EXPRESS OR IMPLIED, INCLUDING ANY IMPLIED WARRANTY OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.",
      ],
    },
    {
      id: "liability",
      heading: "8. Limitation of Liability",
      requiresInitial: true,
      paragraphs: [
        "To the fullest extent permitted by law, TechSavvy's total liability arising out of or related to this Agreement or any Work Order issued under it will not exceed the amount Customer paid TechSavvy for the specific job giving rise to the claim in the twelve (12) months preceding the claim.",
        "Neither party will be liable to the other for indirect, incidental, special, or consequential damages, including lost profits or lost data, even if advised of the possibility of such damages. Nothing in this section limits liability for gross negligence, willful misconduct, or bodily injury or death caused by a party's negligence.",
      ],
    },
    {
      id: "insurance",
      heading: "9. Insurance",
      requiresInitial: false,
      paragraphs: [
        "TechSavvy maintains commercial general liability insurance and will provide a certificate of insurance upon Customer's reasonable request.",
      ],
    },
    {
      id: "termination",
      heading: "10. Termination",
      requiresInitial: true,
      paragraphs: [
        "Either party may terminate this Agreement for a material breach that remains uncured 15 days after written notice. Customer remains responsible for payment of all services performed and materials procured, on any job, up to the effective date of termination.",
        "Either party may otherwise terminate this Agreement for convenience with 30 days' written notice. Termination of this Agreement does not affect any Work Order already in progress unless the parties agree otherwise in writing.",
      ],
    },
    {
      id: "subcontractors",
      heading: "11. Subcontractors & Personnel",
      requiresInitial: false,
      paragraphs: [
        "TechSavvy may perform services using its own employees or qualified subcontractors and technicians, and remains responsible for the quality of work performed on its behalf under this Agreement, consistent with the independent contractor relationship described in Section 3.",
      ],
    },
    {
      id: "confidentiality",
      heading: "12. Confidentiality",
      requiresInitial: false,
      paragraphs: [
        "Each party will keep the other's non-public business, network, and site information confidential and use it only to perform under this Agreement, except as required by law.",
      ],
    },
    {
      id: "general",
      heading: "13. Governing Law & General Provisions",
      requiresInitial: false,
      paragraphs: [
        "This Agreement is governed by the laws of the State of California, without regard to conflict-of-law principles. Any dispute not resolved informally will be subject to the exclusive jurisdiction of the state and federal courts located in California.",
        "This Agreement, together with any Work Order, quote, or job ticket issued under it, is the entire agreement between the parties regarding its subject matter and supersedes prior discussions. It may only be amended in writing signed by both parties. If any provision is held unenforceable, the remaining provisions remain in full force.",
      ],
    },
  ];
}
