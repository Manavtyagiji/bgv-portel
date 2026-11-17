import Client from "../models/Client.js";

const norm = (v="") => String(v).toLowerCase().trim();

/* CLIENT */
export const createClient = async (req, res) => {
  const doc = await Client.create({ type:"client", name:req.body.name });
  res.json(doc);
};

export const getClients = async (req, res) => {
  const list = await Client.find({ type:"client" });
  res.json(list);
};

/* TAC */
export const getTenantCodes = async (req,res)=>{
  const list = await Client.find({ type:"tenantCode" });
  res.json(list);
};

export const createTenantCode = async (req,res)=>{
  const code = "TAC-"+Math.random().toString(36).slice(2,8).toUpperCase();

  const doc = await Client.create({
    type:"tenantCode",
    code,
    label:req.body.label || "",
  });

  res.json(doc);
};

/* TENANT */
export const saveTenant = async (req,res)=>{
  const t = await Client.create({
    type:"tenant",
    tenantId:req.body.tenantId,
    name:req.body.name,
    adminEmail:norm(req.body.adminEmail),
    adminAccessCode:req.body.adminAccessCode,
    accessCodeUsed:req.body.accessCodeUsed
  });

  res.json(t);
};

export const getTenants = async (req,res)=>{
  const t = await Client.find({ type:"tenant" });
  res.json(t);
};

/* ALLOCATION */
export const saveAllocation = async (req,res)=>{
  const { adminEmail, memberEmail, clients } = req.body;

  const doc = await Client.findOneAndUpdate(
    { type:"allocation", adminEmail:norm(adminEmail), memberEmail:norm(memberEmail) },
    { type:"allocation", adminEmail:norm(adminEmail), memberEmail:norm(memberEmail), clients },
    { upsert:true, new:true }
  );

  res.json(doc);
};

export const getAllocations = async (req,res)=>{
  const list = await Client.find({
    type:"allocation",
    adminEmail:norm(req.query.adminEmail)
  });
  res.json(list);
};
