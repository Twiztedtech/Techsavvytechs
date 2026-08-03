import 'dotenv/config';
import { adminAuth } from '../api/lib/firebase-admin.js';

const email = process.argv[2] || process.env.INITIAL_ADMIN_EMAIL;
if (!email) throw new Error('Usage: node scripts/set_admin_claim.js <admin-email>');
const user = await adminAuth.getUserByEmail(email);
await adminAuth.setCustomUserClaims(user.uid, { admin: true });
console.log(`Admin claim applied to ${email}. Ask the user to sign out and back in.`);
