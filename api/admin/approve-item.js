import { adminDb, requireAdmin } from '../lib/firebase-admin.js';
import { createQBOBillForTimecard } from '../lib/qbo-helper.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  try {
    // 1. Verify admin permissions
    await requireAdmin(req);

    const { timecardId, itemType, status, feedback } = req.body;
    if (!timecardId || !itemType || !status) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const docRef = adminDb.collection('time_entries').doc(timecardId);
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      return res.status(404).json({ error: 'Time entry not found.' });
    }

    const timecard = snapshot.data();
    const updates = {
      [`${itemType}Status`]: status,
      updatedAt: new Date().toISOString()
    };

    if (status === 'rejected' && feedback) {
      updates[`${itemType}Feedback`] = feedback;
    }

    // Update specific line item
    await docRef.update(updates);

    // Fetch updated document
    const updatedSnap = await docRef.get();
    const updatedTimecard = { id: updatedSnap.id, ...updatedSnap.data() };

    // Update overall status
    const statuses = [
      updatedTimecard.laborStatus || 'pending',
      updatedTimecard.suppliesStatus || 'pending',
      updatedTimecard.travelStatus || 'pending'
    ];

    let newOverallStatus = 'pending';
    if (statuses.every(s => s === 'approved')) {
      newOverallStatus = 'approved';
    } else if (statuses.every(s => s === 'rejected')) {
      newOverallStatus = 'rejected';
    } else if (statuses.some(s => s === 'approved')) {
      newOverallStatus = 'approved';
    }

    await docRef.update({ status: newOverallStatus });
    updatedTimecard.status = newOverallStatus;

    // Check if fully approved (all line items approved) to trigger email and QBO sync
    const isFullyApproved = statuses.every(s => s === 'approved');

    if (isFullyApproved) {
      const jobDate = new Date(updatedTimecard.date);
      const payoutDueDate = new Date(jobDate);
      payoutDueDate.setDate(payoutDueDate.getDate() + 15);
      const formattedDueDate = payoutDueDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Find contractor email & name
      let techEmail = updatedTimecard.technicianEmail;
      let techName = updatedTimecard.technicianName;
      if (!techEmail && updatedTimecard.technicianUid) {
        const contractorSnap = await adminDb.collection('contractors')
          .where('authUid', '==', updatedTimecard.technicianUid)
          .limit(1)
          .get();
        if (!contractorSnap.empty) {
          techEmail = contractorSnap.docs[0].data().email;
          techName = contractorSnap.docs[0].data().name;
        }
      }

      // 1. Send Email Notification via Resend API
      if (techEmail) {
        const apiKey = process.env.RESEND_API_KEY;
        const sender = process.env.EMAIL_FROM || 'TechSavvy Contractor Portal <support@techsavvytechs.com>';
        const supportEmail = process.env.SUPPORT_EMAIL || 'support@techsavvytechs.com';

        if (apiKey) {
          const laborAmt = Number(updatedTimecard.totalHours || 0) * (updatedTimecard.rate || 75);
          const suppliesAmt = Number(updatedTimecard.suppliesCost || 0);
          const travelAmt = Number(updatedTimecard.travelCost || 0);
          const totalPayable = laborAmt + suppliesAmt + travelAmt;

          try {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'User-Agent': 'TechSavvy-Contractor-Portal/1.0',
              },
              body: JSON.stringify({
                from: sender,
                reply_to: supportEmail,
                to: [techEmail],
                subject: `Timecard Approved: ${updatedTimecard.jobSite} (${updatedTimecard.date})`,
                html: `
                  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;line-height:1.55">
                    <h1 style="color:#16a34a;font-size:24px">Timecard Approved</h1>
                    <p>Hello ${techName || 'there'},</p>
                    <p>Your timecard and expense items for <strong>${updatedTimecard.jobSite}</strong> have been reviewed and approved.</p>
                    <div style="background:#f8fafc;padding:15px;border-radius:6px;margin:15px 0;border:1px solid #e2e8f0">
                      <strong>Job Site:</strong> ${updatedTimecard.jobSite}<br/>
                      <strong>Service Date:</strong> ${updatedTimecard.date}<br/>
                      <strong>Total Approved Payable:</strong> $${totalPayable.toFixed(2)}
                    </div>
                    <p><strong>Payment Terms:</strong> Payment will be disbursed within <strong>15 days</strong> of task completion.</p>
                    <p><strong>Estimated Payout Date:</strong> <span style="color:#16a34a;font-weight:700">${formattedDueDate}</span></p>
                  </div>
                `
              })
            });
          } catch (emailErr) {
            console.error('Failed to send resend approval email:', emailErr);
          }
        }
      }

      // 2. Trigger QuickBooks Online Bill Sync
      try {
        const qboResult = await createQBOBillForTimecard(updatedTimecard, payoutDueDate);
        await docRef.update({
          qbStatus: 'synced',
          qboBillId: qboResult.Bill?.Id || '',
          qboSyncedAt: new Date().toISOString()
        });
      } catch (qboError) {
        console.error('QBO Sync Error:', qboError);
        await docRef.update({
          qbStatus: 'failed',
          qboSyncError: qboError.message
        });
      }
    }

    return res.status(200).json({ success: true, status: newOverallStatus });

  } catch (error) {
    console.error('Approve item error:', error);
    return res.status(500).json({ error: error.message });
  }
}
