import 'dotenv/config';
import mongoose from 'mongoose';
import PortalState from './models/PortalState.js';

await mongoose.connect(process.env.MONGO_URI);

const doc = await PortalState.findOne({ key: 'allocations' }).lean();
const map = doc?.value || {};

console.log('--- All top-level allocation bucket keys ---');
console.log(Object.keys(map).join('\n'));

console.log('');
console.log('--- Every bucket that mentions hr@trueverificationservices.in ---');
const target = 'hr@trueverificationservices.in';
for (const [bucketKey, bucketVal] of Object.entries(map)) {
  if (bucketVal && typeof bucketVal === 'object' && !Array.isArray(bucketVal)) {
    for (const [memberEmail, list] of Object.entries(bucketVal)) {
      if (memberEmail.toLowerCase() === target) {
        console.log(bucketKey + ' => ' + JSON.stringify(list));
      }
    }
  }
}

console.log('');
console.log('--- Full content of checkAllocations_superadmin@tervies.com ---');
console.log(JSON.stringify(map['checkAllocations_superadmin@tervies.com'] || 'MISSING KEY', null, 2));

process.exit(0);
