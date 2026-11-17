import 'dotenv/config';
import mongoose from 'mongoose';
import User from './models/User.js';
import PortalState from './models/PortalState.js';

await mongoose.connect(process.env.MONGO_URI);

const SA_EMAIL = 'superadmin@tervies.com';
const doc = await PortalState.findOne({ key: 'allocations' }).lean();
const map = doc?.value || {};

function findList(bucket, email, name) {
  if (!bucket || typeof bucket !== 'object') return [];
  for (const k of [email, name]) {
    if (k && Array.isArray(bucket[k]) && bucket[k].length > 0) return bucket[k];
  }
  return [];
}

const users = await User.find({ role: 'team', status: 'approved' }).lean();

for (const u of users) {
  const email = String(u.email || '').trim().toLowerCase();
  const name  = String(u.name  || '').trim().toLowerCase();
  const tenantId = u.tenantId || null;
  const ownerAdminEmail = u.ownerAdminEmail ? String(u.ownerAdminEmail).trim().toLowerCase() : null;
  const isInternal = u.isInternal === true || (!tenantId && !ownerAdminEmail);

  const resolve = (prefix) => {
    if (ownerAdminEmail) {
      const found = findList(map[prefix + '_' + ownerAdminEmail], email, name);
      if (found.length > 0) return found;
    }
    if (isInternal) {
      const found = findList(map[prefix + '_' + SA_EMAIL], email, name);
      if (found.length > 0) return found;
    }
    return [];
  };

  const clients = resolve('clientAllocations');
  const vendors = resolve('vendorAllocations');
  const checks  = resolve('checkAllocations');

  console.log(JSON.stringify({ name: u.name, email: u.email, clients, vendors, checks }));
}
process.exit(0);
