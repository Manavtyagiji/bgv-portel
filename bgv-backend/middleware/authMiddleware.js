// bgv-backend/middleware/authMiddleware.js
import jwt  from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  let token;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) token = auth.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Not authorised — no token" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
    if (!req.user) return res.status(401).json({ error: "User not found" });
    if (req.user.status !== "approved")
      return res.status(403).json({ error: "Account not approved" });
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token invalid or expired" });
  }
};

export const adminOnly = (req, res, next) => {
  if (req.user && (req.user.role === "admin" || req.user.role === "superadmin"))
    return next();
  res.status(403).json({ error: "Admin access required" });
};

export const superAdminOnly = (req, res, next) => {
  if (req.user && req.user.role === "superadmin") return next();
  res.status(403).json({ error: "Super admin access required" });
};

// "manager" is a super-admin-side-only role that can access nearly
// everything super admin can except Cost Summary, Manage Users, and All
// Tenants — those keep using adminOnly/superAdminOnly above, unchanged.
// These two new middlewares are applied ONLY to the specific route files
// Manager needs (Client Contacts, Vendor Contacts, Pricing writes, Sent
// Reports) — adminOnly/superAdminOnly themselves are left exactly as they
// were so nothing already using them (Manage Users, password reset, record
// deletion, etc.) is affected.
export const adminOrManagerOnly = (req, res, next) => {
  if (req.user && (req.user.role === "admin" || req.user.role === "superadmin" || req.user.role === "manager"))
    return next();
  res.status(403).json({ error: "Admin access required" });
};

export const superAdminOrManagerOnly = (req, res, next) => {
  if (req.user && (req.user.role === "superadmin" || req.user.role === "manager")) return next();
  res.status(403).json({ error: "Super admin access required" });
};