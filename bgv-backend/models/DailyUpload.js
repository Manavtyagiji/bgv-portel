// bgv-backend/models/DailyUpload.js
// New collection — stores metadata + saved path for each "Upload Daily Excel" file.
// Does NOT touch the existing records collection.

import mongoose from "mongoose";

const dailyUploadSchema = new mongoose.Schema(
  {
    originalFilename: { type: String, required: true, trim: true },
    filePath:         { type: String, required: true },          // filename inside uploads-excel/
    uploaderEmail:    { type: String, required: true, lowercase: true, trim: true },
    uploaderRole:     { type: String, trim: true, default: "" },
    tenantId:         { type: String, trim: true, default: "" },
    totalRows:        { type: Number, default: 0 },              // total data rows in Excel
    importedRows:     { type: Number, default: 0 },              // rows actually saved as records
    dailyUploadId:    { type: String, default: "" },             // shared ID written to every record from this upload
  },
  { timestamps: true }
);

export default mongoose.model("DailyUpload", dailyUploadSchema);
