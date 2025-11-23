// /app/api/uposatha-check/route.ts
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

/**
 * Cấu hình email bằng biến môi trường:
 * - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 * - EMAIL_FROM (ví dụ: 'Your Name <no-reply@domain.com>')
 * - EMAIL_TO (ví dụ: 'chien@example.com')
 *
 * Vercel: set trong Project Settings -> Environment Variables
 */

// ---- helpers ----
function moonAge(date: Date): number {
    // Xấp xỉ tuổi trăng (0..29) -> trả về ngày âm 1..30
    // Công thức đơn giản thường dùng trên web để ước lượng phase.
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    let year = d.getUTCFullYear();
    let month = d.getUTCMonth() + 1; // 1..12
    const day = d.getUTCDate();

    if (month < 3) {
        year--;
        month += 12;
    }
    month++;

    const c = Math.floor(365.25 * year);
    const e = Math.floor(30.6 * month);
    let jd = c + e + day - 694039.09; // ngày từ epoch trăng
    jd /= 29.5305882; // số chu kỳ trăng
    jd = jd - Math.floor(jd);
    let age = Math.round(jd * 29.5305882);
    if (age < 0) age += 29;
    // chuyển về 1..30
    return age === 0 ? 30 : age;
}

function isUposathaLunarDay(lunarDay: number) {
    // Theo truyền thống: các ngày uposatha thường là ngày 8, 14, 15, 30 (âm lịch)
    return lunarDay === 8 || lunarDay === 14 || lunarDay === 15 || lunarDay === 30;
}

function formatDate(d: Date) {
    return d.toISOString().slice(0, 10);
}

function buildPlainText(found: { date: string; lunarDay: number; type: "today" | "upcoming" }[], todayStr: string) {
    const header = found[0].type === "today"
        ? `Hôm nay (${found[0].date}) có khả năng là ngày Uposatha (ngày âm ${found[0].lunarDay}).`
        : `Sắp có ngày Uposatha:`;

    const list = found.map(f => `- ${f.date} (ngày âm ≈ ${f.lunarDay}) - ${f.type}`).join("\n");

    const meaning = [
        "Ý nghĩa của ngày Uposatha:",
        "Uposatha là ngày thanh tịnh trong truyền thống Phật giáo Nguyên thủy — thời điểm để quay về giới-định-tuệ, làm mới đời sống phạm hạnh, và nuôi dưỡng tâm an lạc.",
    ].join("\n");

    const benefits = [
        "Lợi ích khi thọ trì Bát Quan Trai (8 giới):",
        "1) Tăng trưởng phước báu; 2) Tâm an tịnh, giảm phiền não; 3) Tăng trưởng trí tuệ; 4) Buông bỏ dính mắc; 5) Gieo nhân tái sinh tốt; 6) Gần gũi đời sống xuất gia tạm thời.",
    ].join("\n\n");

    const footer = [
        "Lưu ý: kết quả xấp xỉ dựa trên tuổi trăng (moon age). Nếu cần độ chính xác cao theo lịch chùa/địa phương, vui lòng dùng nguồn lịch chính thức.",
        "",
        "— Trân trọng,",
        "Uposatha Notifier"
    ].join("\n");

    return [header, "", list, "", meaning, "", benefits, "", footer].join("\n");
}

function buildHtml(found: { date: string; lunarDay: number; type: "today" | "upcoming" }[], todayStr: string) {
    const subjectLine = found[0].type === "today"
        ? `Hôm nay (${found[0].date}) có khả năng là ngày Uposatha (ngày âm ${found[0].lunarDay}).`
        : `Sắp có ngày Uposatha`;

    const rows = found.map(f => `<li><strong>${f.date}</strong> — ngày âm ≈ ${f.lunarDay} (${f.type})</li>`).join("");

    const html = `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Thông báo Uposatha</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial; color: #111; line-height: 1.5; padding: 20px; }
      .card { border-radius: 8px; padding: 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); max-width: 680px; margin: auto; background: #fff; }
      h1 { font-size: 18px; margin: 0 0 12px 0; }
      h2 { font-size: 15px; margin: 14px 0 8px 0; }
      p { margin: 8px 0; }
      ul { margin: 8px 0 12px 20px; }
      footer { margin-top: 18px; font-size: 13px; color: #555; }
      .note { background:#f7f8fa; padding:10px; border-radius:6px; font-size:13px; color:#333; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Thông báo Uposatha</h1>
      <p>${subjectLine}</p>

      <h2>Danh sách ngày được phát hiện</h2>
      <ul>
        ${rows}
      </ul>

      <div class="note">
        <strong>Ghi chú:</strong> Kết quả là xấp xỉ dựa trên tuổi trăng (moon age). Nếu cần độ chính xác cao theo lịch chùa/địa phương, vui lòng tham khảo nguồn lịch chính thức.
      </div>

      <h2>Ý nghĩa của ngày Uposatha</h2>
      <p>Uposatha (Bố-tát) là ngày thanh tịnh trong truyền thống Phật giáo Nguyên thủy. Đây là thời điểm để cư sĩ và Tăng Ni tạm dừng những thói quen thế gian, quay về giới-định-tuệ, làm mới đời sống phạm hạnh và nuôi dưỡng tâm an lạc.</p>

      <h2>Lợi ích khi thọ trì Bát Quan Trai (8 giới)</h2>
      <ol>
        <li><strong>Tăng trưởng phước báu:</strong> Giữ giới trong sạch tạo nền tảng phước đức mạnh mẽ.</li>
        <li><strong>Tâm an tịnh:</strong> Giảm tham, sân, si; dễ nhiếp tâm vào thiền định.</li>
        <li><strong>Tăng trưởng trí tuệ:</strong> Tâm lắng, dễ thấy rõ bản chất các hiện tượng.</li>
        <li><strong>Buông bỏ dính mắc:</strong> Giảm lệ thuộc vào tiện nghi, giải trí, từ đó tự chủ hơn.</li>
        <li><strong>Gieo nhân tốt cho tương lai:</strong> Nhiều kinh cho rằng phước từ việc giữ giới dẫn đến đời sống thuận lợi và tái sinh tốt.</li>
        <li><strong>Gần gũi đời sống xuất gia:</strong> Một ngày sống như người xuất gia, gieo duyên cho sự tinh tấn lâu dài.</li>
      </ol>

      <footer>
        <p>— Trân trọng,<br/>Uposatha Notifier</p>
      </footer>
    </div>
  </body>
  </html>
  `;

    return html;
}

// ---- mail sender ----
async function sendMail(subject: string, text: string, html: string) {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.EMAIL_FROM;
    const to = process.env.EMAIL_TO;

    if (!host || !user || !pass || !from || !to) {
        throw new Error(
            "Missing SMTP or email env vars. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM, EMAIL_TO"
        );
    }

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // true nếu port 465
        auth: {
            user,
            pass,
        },
    });

    const info = await transporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
    });

    return info;
}

// ---- main handler ----
export async function GET() {
    try {
        const today = new Date();
        const daysToCheck = 7; // kiểm tra hôm nay + (daysToCheck-1) ngày sau
        const found: { date: string; lunarDay: number; type: "today" | "upcoming" }[] = [];

        for (let i = 0; i < daysToCheck; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            const lunar = moonAge(d);
            if (isUposathaLunarDay(lunar)) {
                found.push({
                    date: formatDate(d),
                    lunarDay: lunar,
                    type: i === 0 ? "today" : "upcoming",
                });
            }
        }

        if (found.length === 0) {
            // Không có Uposatha trong window đã chọn -> trả về JSON, không gửi mail
            return NextResponse.json({
                ok: true,
                message: `Không tìm thấy ngày Uposatha trong ${daysToCheck} ngày kể từ ${formatDate(today)}.`,
                checkedFrom: formatDate(today),
                daysChecked: daysToCheck,
            });
        }

        // Build email content
        const subject = found.some(f => f.type === "today") ? `Thông báo: Hôm nay có khả năng là Uposatha` : `Thông báo: Sắp có Uposatha`;
        const plain = buildPlainText(found, formatDate(today));
        const html = buildHtml(found, formatDate(today));

        // Gửi mail
        const info = await sendMail(subject, plain, html);

        return NextResponse.json({
            ok: true,
            message: "Đã phát hiện Uposatha và gửi email thông báo.",
            found,
            mail: {
                accepted: info.accepted,
                messageId: info.messageId,
            },
        });
    } catch (err: any) {
        return NextResponse.json({ ok: false, error: err.message || String(err) }, { status: 500 });
    }
}