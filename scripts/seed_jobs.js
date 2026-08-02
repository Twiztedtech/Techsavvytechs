import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase Config
const firebaseConfigPath = path.join(__dirname, '..', 'firebase-applet-config.json');
if (!fs.existsSync(firebaseConfigPath)) {
  console.error('Firebase config file not found at:', firebaseConfigPath);
  process.exit(1);
}
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);

const initialJobs = [
  { id: 'j-101', name: 'Mars Davis - High Voltage', address: '1200 Industrial Pkwy, Fairfield, CA 94533', notes: 'High voltage junction box assembly' },
  { id: 'j-102', name: 'Substation Alpha - Conduit Run', address: '450 Energy Way, Sacramento, CA 95814', notes: 'North wall conduit run' },
  { id: 'j-103', name: 'Data Center B - Fiber Racks', address: '880 Silicon Blvd, San Jose, CA 95131', notes: 'Rack 4 patch panels' },
  { id: 'j-104', name: 'Solar Array Site 4 - Inverters', address: '3100 Sun Valley Rd, Fresno, CA 93706', notes: 'Inverter bank inspection' },
];

async function seedJobs() {
  console.log('Authenticating anonymously...');
  try {
    await signInAnonymously(auth);
    console.log('Authenticated successfully!');
  } catch (authError) {
    console.warn('Anonymous auth failed, trying without authentication:', authError.message);
  }

  console.log('Seeding initial job sites to Firestore...');
  try {
    for (const job of initialJobs) {
      const docRef = doc(db, 'jobs', job.id);
      await setDoc(docRef, job, { merge: true });
      console.log(`Seeded job site: ${job.name} -> Firestore ID: ${job.id}`);
    }
    console.log('Successfully seeded initial job sites!');
  } catch (error) {
    console.error('Seeding failed:', error);
  }
}

seedJobs();
