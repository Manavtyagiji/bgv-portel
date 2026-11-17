import XLSX from "xlsx";
import nodemailer from "nodemailer";

export const sendReport = async (req, res) => {
  try {
    const { cases, type, company, month, email, phone } = req.body;

    if (!cases || !cases.length) {
      return res.status(400).json({ error: "No data found" });
    }

    // 🧾 Create Excel
    const rows = cases.map((row, index) => ({
      "S.NO": index + 1,
      "Candidate Name": row["Candidate Name"] || "",
      "Client Name": row["Client Name"] || "",
      "Check Name": row["Check Name"] || "",
      "Status": row["Status"] || "",
      "City": row["City"] || "",
      "Price": row.rate || 0
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");

    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

    // 📧 Send Email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    if (email) {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: `${type} Report - ${company} - ${month}`,
        text: "Please find attached report.",
        attachments: [
          {
            filename: `${company}_${month}.xlsx`,
            content: buffer,
          },
        ],
      });
    }

    // 📱 WhatsApp (Send Link)
    let whatsappLink = "";
    if (phone) {
      const message = `Report ready for ${company} (${month}). Please download from system.`;
      whatsappLink = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    }

    res.json({
      success: true,
      message: "Report sent successfully",
      whatsappLink,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};