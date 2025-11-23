// /app/api/uposatha-check/route.ts
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

/**
 * ENV required:
 * - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 * - EMAIL_FROM, EMAIL_TO
 *
 * Note: This file formats dates as dd/mm/yyyy and includes expanded
 * canonical-based benefits text for observing the Eight Uposatha Precepts.
 */

// ---- helpers ----
function moonAge(date: Date): number {
    // Xấp xỉ tuổi trăng (0..29) -> trả về ngày âm 1..30
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
    let jd = c + e + day - 694039.09; // days from lunar epoch
    jd /= 29.5305882; // lunar cycles
    jd = jd - Math.floor(jd);
    let age = Math.round(jd * 29.5305882);
    if (age < 0) age += 29;
    return age === 0 ? 30 : age;
}

function isUposathaLunarDay(lunarDay: number) {
    return lunarDay === 8 || lunarDay === 14 || lunarDay === 15 || lunarDay === 30;
}

function formatVietnamDate(d: Date) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

/**
 * Canonically-inspired benefits text (concise, suitable for email).
 * Based on Pāli discourses about Uposatha and virtue (sīla), e.g. suttas
 * in the Uposathavagga (AN) and Dhammapada passages describing virtue's fruit.
 */

// ---- build email contents ----
function buildPlainText(
    found: { date: string; lunarDay: number; type: "today" | "upcoming" }[],
    todayStr: string
) {
    const header =
        found[0].type === "today"
            ? `Hôm nay (${found[0].date}) có khả năng là ngày Uposatha (ngày âm ≈ ${found[0].lunarDay}).`
            : `Sắp có ngày Uposatha: (gần nhất: ${found[0].date} — âm ≈ ${found[0].lunarDay})`;

    const list = found.map((f) => `- ${f.date} (ngày âm ≈ ${f.lunarDay}) — ${f.type}`).join("\n");

    const meaning = [
        "Ý nghĩa của ngày Uposatha:",
        "Uposatha (Bố-tát) là ngày thanh tịnh theo truyền thống Nguyên thủy — thời điểm để quay về giới-định-tuệ, làm mới đời sống phạm hạnh, tăng cường thiền và phát triển trí tuệ.",
    ].join("\n");

    const benefitsExpanded = [
        "Lợi ích khi thọ trì Bát Quan Trai (tóm tắt, dựa trên tinh thần kinh điển Pāli):",
        "",
        "1) Nền tảng cho trí tuệ (Paṭipatti → Paññā):",
        "   Giữ giới làm cho thân khẩu ý an; khi tâm không loạn, trí tuệ dễ phát sinh (nhấn mạnh trong nhiều suttas và Dhammapada).",
        "",
        "2) An tịnh nội tâm và khả năng nhập định:",
        "   Hạn chế hành vi gây phiền não giúp tâm nhẹ, thuận cho thiền định và trải nghiệm jhāna nhỏ (AN suttas nêu lợi ích định khi giữ giới).",
        "",
        "3) Giảm nghiệp xấu và tăng phước:",
        "   Giữ giới là hành động tạo thiện nghiệp; kinh điển nhiều lần khẳng định giữ giới đem lại quả thiện trong đời này và đời sau.",
        "",
        "4) Giảm tham, sân, si và phóng dật:",
        "   Các giới như kiêng rượu, không giải trí, không tô điểm… giúp giảm các duyên kéo tâm ra ngoài, gia tăng tĩnh lặng.",
        "",
        "5) Thực tập như người xuất gia trong một ngày:",
        "   Quan sát Bát Quan Trai giúp tạo duyên cho tinh tấn, khiêm cung và gieo duyên cho đời sống đạo sâu hơn.",
        "",
        "6) Hợp xã hội và củng cố cộng đồng đạo đức:",
        "   Việc chung tu (cư sĩ và Tăng Ni) làm tăng hoà hợp, củng cố giới pháp trong cộng đồng.",
        "",
        "7) Lợi ích ứng dụng thực tế:",
        "   - Tâm an giúp ra quyết định sáng suốt hơn;\n   - Giảm hành vi gây hại với bản thân và người khác;\n   - Kích thích lòng từ, bố thí và hộ trì cộng đồng.",
        "",
        "Ghi chú: phần mô tả trên là diễn dịch ngắn gọn dựa trên các phần trình bày lợi ích giữ sīla trong Uposatha-related suttas và Dhammapada.",
    ].join("\n");

    const footer = [
        "",
        "Nguồn tham khảo (tóm tắt): Uposathavagga (Aṅguttara Nikāya), các suttas về Atthangika Uposatha; Dhammapada (về công đức sīla).",
        "",
        "— Trân trọng,",
        "Uposatha Notifier",
    ].join("\n");

    return [header, "", list, "", meaning, "", benefitsExpanded, "", footer].join("\n");
}

function buildHtml(
    found: { date: string; lunarDay: number; type: "today" | "upcoming" }[],
    todayStr: string
) {
    const nearest = found[0];
    const subjectLine =
        nearest.type === "today"
            ? `Hôm nay: ${nearest.date} — (âm ≈ ${nearest.lunarDay})`
            : `Sắp tới: ${nearest.date} — (âm ≈ ${nearest.lunarDay})`;

    const rows = found
        .map(
            (f) =>
                `<li><strong>${f.date}</strong> — ngày âm ≈ ${f.lunarDay} <em>(${f.type})</em></li>`
        )
        .join("");

    const benefitsHtml = `
    <ol>
      <li><strong>Nền tảng cho trí tuệ:</strong> Giữ giới làm cho thân-khẩu-ý an tịnh; khi tâm an, trí tuệ (paññā) dễ phát sinh — một chủ đề lặp lại trong Dhammapada và nhiều suttas.</li>
      <li><strong>An tịnh nội tâm & khả năng nhập định:</strong> Hạn chế các duyên phiền não tạo điều kiện cho thiền và trạng thái tĩnh lặng (jhāna) — lợi ích được nhắc trong các suttas Uposatha/AN.</li>
      <li><strong>Giảm nghiệp xấu, tăng phước:</strong> Giữ giới là gieo nhân thiện, dẫn tới kết quả thuận lợi trong đời này và đời sau.</li>
      <li><strong>Giảm tham-sân-si:</strong> Các giới như kiêng rượu, giải trí, không tô điểm giúp giảm các duyên làm phân tán tâm.</li>
      <li><strong>Sống như người xuất gia trong một ngày:</strong> Tạo duyên cho tinh tấn, khiêm cung và gieo mầm tu tập lâu dài.</li>
      <li><strong>Hợp xã hội & hỗ trợ cộng đồng:</strong> Quan sát uposatha chung gia tăng hoà hợp và khuyến khích đời sống đạo đức cộng đồng.</li>
    </ol>
  `;

    const html = `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Thông báo Uposatha</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial; color:#111; padding:18px; background:#f4f6f8; }
      .card { max-width:720px; margin:auto; background:#fff; padding:18px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.06); }
      h1 { margin:0 0 6px 0; font-size:18px; }
      h2 { margin:12px 0 8px 0; font-size:15px; }
      p { margin:8px 0; }
      ul { margin:8px 0 12px 20px; }
      ol { margin:8px 0 12px 20px; }
      .note { background:#f7f9fb; padding:10px; border-radius:6px; font-size:13px; color:#333; }
      footer { margin-top:16px; color:#666; font-size:13px; }
      .date-pill { display:inline-block; background:#eef6ff; color:#064e9a; padding:6px 10px; border-radius:6px; font-weight:600; margin-bottom:10px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Thông báo Uposatha</h1>
      <div class="date-pill">${subjectLine}</div>

      <h2>Danh sách ngày được phát hiện</h2>
      <ul>${rows}</ul>

      <div class="note"><strong>Ghi chú:</strong> Kết quả xấp xỉ dựa trên tuổi trăng (moon age). Nếu cần độ chính xác theo lịch chùa/địa phương, hãy tham chiếu lịch chính thức.</div>

      <h2>Ý nghĩa của ngày Uposatha</h2>
      <p>Uposatha (Bố-tát) là ngày để làm mới đời sống giới-định-tuệ, tạm dừng thói quen thế gian và nuôi dưỡng tâm an lạc, theo tinh thần kinh điển Nguyên thủy.</p>

      <h2>Lợi ích khi thọ trì Bát Quan Trai (8 giới)</h2>
      ${benefitsHtml}

      <footer>
        <p>— Trân trọng,<br/>Uposatha Notifier</p>
        <p style="font-size:12px;color:#888;margin-top:10px;">Nguồn (tóm lược): Uposathavagga (Aṅguttara Nikāya), các suttas về Atthangika Uposatha; Dhammapada (về công đức sīla).</p>
      </footer>
    </div>
  </body>
  </html>`;

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
        secure: port === 465,
        auth: { user, pass },
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
export async function GET(request: Request) {
    try {
        // Optional: CRON_SECRET protection
        // const authHeader = request.headers.get("Authorization");
        // if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        //   return new Response("Unauthorized", { status: 401 });
        // }

        // Use VN date/time base (approximate UTC+7 conversion)
        const now = new Date();
        const todayVN = new Date(now.getTime() + (7 * 60 + now.getTimezoneOffset()) * 60000); // approximate convert to UTC+7
        const daysToCheck = 7;
        const found: { date: string; lunarDay: number; type: "today" | "upcoming" }[] = [];

        for (let i = 0; i < daysToCheck; i++) {
            const d = new Date(todayVN);
            d.setDate(todayVN.getDate() + i);
            const lunar = moonAge(d);
            if (isUposathaLunarDay(lunar)) {
                found.push({
                    date: formatVietnamDate(d),
                    lunarDay: lunar,
                    type: i === 0 ? "today" : "upcoming",
                });
            }
        }

        if (found.length === 0) {
            return NextResponse.json({
                ok: true,
                message: `Không tìm thấy ngày Uposatha trong ${daysToCheck} ngày kể từ ${formatVietnamDate(todayVN)}.`,
                checkedFrom: formatVietnamDate(todayVN),
                daysChecked: daysToCheck,
            });
        }

        // Build subject to include solar + lunar for nearest found
        const nearest = found[0];
        const subject = nearest.type === "today"
            ? `Thông báo: Hôm nay có khả năng là Uposatha — ${nearest.date} (âm ≈ ${nearest.lunarDay})`
            : `Thông báo: Sắp có Uposatha — ${nearest.date} (âm ≈ ${nearest.lunarDay})`;

        const plain = buildPlainText(found, formatVietnamDate(todayVN));
        const html = buildHtml(found, formatVietnamDate(todayVN));

        const info = await sendMail(subject, plain, html);

        return NextResponse.json({
            ok: true,
            message: "Đã phát hiện Uposatha và gửi email thông báo.",
            found,
            mail: { accepted: info.accepted, messageId: info.messageId },
        });
    } catch (err: any) {
        return NextResponse.json({ ok: false, error: err.message || String(err) }, { status: 500 });
    }
}