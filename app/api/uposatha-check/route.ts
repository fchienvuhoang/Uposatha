// /app/api/uposatha-check/route.ts
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

/**
 * ENV required:
 * - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 * - EMAIL_FROM (e.g. 'Your Name <no-reply@domain.com>')
 * - EMAIL_TO (comma-separated list, e.g. 'a@x.com,b@y.com')
 *
 * Note: dates formatted as dd/mm/yyyy. Email includes full benefits text
 * of observing the Eight Uposatha Precepts (Bát Quan Trai).
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

// ---- full benefits text (plain + html) ----
function buildPlainText(
    found: { date: string; lunarDay: number; type: "today" | "upcoming" }[],
    todayStr: string
) {
    const header =
        found[0].type === "today"
            ? `Hôm nay (${found[0].date}) có khả năng là ngày Uposatha (ngày âm ≈ ${found[0].lunarDay}).`
            : `Sắp có ngày Uposatha: (gần nhất: ${found[0].date} — âm ≈ ${found[0].lunarDay})`;

    const list = found.map((f) => `- ${f.date} (âm ≈ ${f.lunarDay}) — ${f.type}`).join("\n");

    const intro = [
        "Ý nghĩa của ngày Uposatha:",
        "Uposatha (Bố-tát) là ngày thanh tịnh theo truyền thống Nguyên thủy — thời điểm để quay về giới-định-tuệ, làm mới đời sống phạm hạnh, tăng cường thiền và phát triển trí tuệ.",
        "",
    ].join("\n");

    const benefits = [
        "LỢI ÍCH KHI THỌ TRÌ BÁT QUAN TRAI (ĐẦY ĐỦ)",
        "",
        "1) Tăng trưởng phước báu lớn (puñña):",
        "   Đức Phật dạy rằng người giữ giới thanh tịnh trong ngày Uposatha tạo được phước báu lớn, vượt qua nhiều hình thức bố thí. Phước này đem lại an vui trong hiện tại và quả lành trong tương lai.",
        "",
        "2) Tâm không hối hận → an lạc → dễ nhập định:",
        "   Giới trong sạch dẫn đến không hối hận, hoan hỷ, hỷ, an tịnh, lạc và định (samādhi). Khi giữ 8 giới, tâm nhẹ, dễ tập trung và dễ vào các trạng thái an tĩnh của thiền.",
        "",
        "3) Giảm tham – sân – si rõ rệt:",
        "   Bát Quan Trai cắt đứt các duyên khiến tâm phóng dật (ăn uống phi thời, trang điểm, giải trí, v.v.), giúp tâm trở lại trạng thái thanh khiết, nhẹ và sáng.",
        "",
        "4) Tạo duyên sinh lên cõi chư thiên (deva):",
        "   Nhiều đoạn kinh nêu rằng phước do giữ giới (đặc biệt nếu thực hành thường xuyên) có thể đưa tới sinh về các cõi Thiên Dục, hưởng thọ an lạc và phước báu. Đây là quả báo thiện do sīla tạo ra.",
        "",
        "5) Sống như người xuất gia trong một ngày:",
        "   Bát Quan Trai là một phiên bản nhẹ của giới luật xuất gia — một ngày sống đời Phạm hạnh — tạo duyên cho tinh tấn, khiêm cung và gieo mầm tu tập lâu dài.",
        "",
        "6) Tịnh hoá nghiệp quá khứ:",
        "   Giữ giới giúp 'đốt bớt' nghiệp nhỏ và chặn nghiệp bất thiện mới phát sinh; giới được ví như lá chắn bảo vệ khỏi nghiệp xấu.",
        "",
        "7) Tâm sáng suốt, dễ phát sinh trí tuệ (paññā):",
        "   Khi tâm không còn tham dục và phân tán, chánh niệm mạnh, nhận thức rõ vô thường, khổ, vô ngã — tiền đề cho trí tuệ phát triển.",
        "",
        "8) Giảm nghiệp liên quan đến sắc dục & dính mắc:",
        "   Giới cấm dâm dục trong Bát Quan Trai giúp giảm dính mắc, tăng tự chủ nội tâm, là nền tảng cho thiền bền vững.",
        "",
        "9) Giảm nghiện công nghệ, giải trí, mạng xã hội:",
        "   Hạn chế giải trí và ca nhạc giúp giảm kích thích liên tục, làm tăng khả năng tĩnh lặng và chánh niệm trong đời sống hàng ngày.",
        "",
        "10) Lợi ích cho sức khoẻ — đặc biệt tiêu hoá:",
        "   Không ăn chiều giúp hệ tiêu hoá nghỉ ngơi, ổn định đường huyết, ngủ sâu hơn và cải thiện sức khỏe tổng quát.",
        "",
        "11) Tăng khả năng kiểm soát bản thân (viriya):",
        "   Một ngày hoàn toàn kiềm chế thói quen tăng nghị lực: nói 'không' với ham muốn, giúp xây dựng ý chí bền bỉ.",
        "",
        "12) Góp phần xây dựng cộng đồng đạo đức:",
        "   Thực hành Uposatha theo nhóm tăng hoà hợp, lan tỏa giá trị giữ giới trong gia đình và cộng đồng, gieo duyên lành cho người thân.",
        "",
        "TÓM TẮT:",
        " - Phước lớn, an lạc hiện tại và quả lành sau này.",
        " - Tăng định, trí tuệ và giảm phiền não.",
        " - Gieo duyên xuất gia tạm thời, có thể dẫn tới đời sống tu học sâu hơn.",
        "",
        "Nguồn tham khảo: tóm lược từ tinh thần kinh điển Nguyên thủy (Uposathavagga, Aṅguttara Nikāya; Dhammapada).",
        "",
        "— Trân trọng,",
        "Uposatha Notifier",
    ].join("\n");

    return [header, "", list, "", intro, benefits].join("\n");
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
        .map((f) => `<li><strong>${f.date}</strong> — âm ≈ ${f.lunarDay} <em>(${f.type})</em></li>`)
        .join("");

    const benefitsHtml = `
    <h3>LỢI ÍCH KHI THỌ TRÌ BÁT QUAN TRAI (CHI TIẾT)</h3>
    <ol>
      <li><strong>Tăng trưởng phước báu lớn (puñña):</strong> Giữ giới thanh tịnh tạo phước lớn, an vui hiện tại và quả lành trong tương lai.</li>
      <li><strong>Tâm không hối hận → an lạc → dễ nhập định:</strong> Giới trong sạch dẫn tới chuỗi: không hối hận → hoan hỷ → an tịnh → lạc → định.</li>
      <li><strong>Giảm tham – sân – si:</strong> Bát Quan Trai cắt đứt các duyên khiến tâm phóng dật, giúp tâm trở nên thanh khiết và nhẹ nhàng.</li>
      <li><strong>Tạo duyên sinh lên cõi chư thiên (deva):</strong> Phước do giữ giới thường có thể dẫn tới sinh về các cõi thiên, hưởng an lạc.</li>
      <li><strong>Sống như người xuất gia trong một ngày:</strong> Phiên bản nhẹ của đời xuất gia, tạo duyên cho tinh tấn và gieo mầm tu tập.</li>
      <li><strong>Tịnh hoá nghiệp quá khứ:</strong> Giới giúp làm sạch nhiều nghiệp nhỏ và ngăn chặn nghiệp bất thiện mới.</li>
      <li><strong>Tâm sáng suốt, dễ phát sinh trí tuệ (paññā):</strong> Tâm bớt phân tán, chánh niệm mạnh, dẫn tới hiểu biết sâu sắc về pháp.</li>
      <li><strong>Giảm nghiệp liên quan đến sắc dục & dính mắc:</strong> Giới cấm dâm dục giúp tăng tự chủ và giảm dính mắc.</li>
      <li><strong>Giảm nghiện công nghệ & giải trí:</strong> Hạn chế giải trí giúp tăng khả năng tĩnh lặng và chánh niệm.</li>
      <li><strong>Lợi ích cho sức khoẻ (tiêu hoá):</strong> Không ăn chiều giúp hệ tiêu hoá nghỉ ngơi, ngủ sâu hơn và cải thiện sức khỏe.</li>
      <li><strong>Tăng khả năng kiểm soát bản thân (viriya):</strong> Việc kiên trì một ngày giúp tăng nghị lực và khả năng nói 'không' với ham muốn.</li>
      <li><strong>Góp phần xây dựng cộng đồng đạo đức:</strong> Thực hành chung tăng hoà hợp, lan tỏa giữ giới trong gia đình và xã hội.</li>
    </ol>
    <p><strong>Tóm tắt:</strong> Phước lớn, tăng định-trí tuệ, giảm phiền não, gieo duyên cho đời tu học và có lợi cho sức khoẻ cũng như cộng đồng.</p>
    <p style="font-size:12px;color:#666;">Nguồn tham khảo: tóm lược từ tinh thần kinh điển Nguyên thủy (Uposathavagga, Aṅguttara Nikāya; Dhammapada).</p>
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

      ${benefitsHtml}

      <footer>
        <p>— Trân trọng,<br/>Uposatha Notifier</p>
      </footer>
    </div>
  </body>
  </html>`;

    return html;
}

// ---- mail sender (supports multiple recipients via EMAIL_TO comma-separated) ----
async function sendMail(subject: string, text: string, html: string) {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.EMAIL_FROM || "";
    const toRaw = process.env.EMAIL_TO || "";

    if (!host || !user || !pass || !from || !toRaw) {
        throw new Error(
            "Missing SMTP or email env vars. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM, EMAIL_TO"
        );
    }

    // parse recipients: support "a@x.com, b@y.com"
    const toList = toRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
    });

    const info = await transporter.sendMail({
        from,
        to: toList, // array accepted by nodemailer
        subject,
        text,
        html,
    });

    return { info, toList };
}

// ---- main handler ----
export async function GET(request: Request) {
    try {
        // Optional: CRON_SECRET protection (uncomment to enable)
        // const authHeader = request.headers.get("Authorization");
        // if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        //   return new Response("Unauthorized", { status: 401 });
        // }

        // VN time approx (convert to UTC+7 baseline)
        const now = new Date();
        const todayVN = new Date(now.getTime() + (7 * 60 + now.getTimezoneOffset()) * 60000);
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

        // Build subject including nearest solar + lunar
        const nearest = found[0];
        const subject = nearest.type === "today"
            ? `Thông báo: Hôm nay có khả năng là Uposatha — ${nearest.date} (âm ≈ ${nearest.lunarDay})`
            : `Thông báo: Sắp có Uposatha — ${nearest.date} (âm ≈ ${nearest.lunarDay})`;

        const plain = buildPlainText(found, formatVietnamDate(todayVN));
        const html = buildHtml(found, formatVietnamDate(todayVN));

        const { info, toList } = await sendMail(subject, plain, html);

        return NextResponse.json({
            ok: true,
            message: "Đã phát hiện Uposatha và gửi email thông báo.",
            found,
            recipients: toList,
            mail: { accepted: info.accepted, messageId: info.messageId },
        });
    } catch (err: any) {
        return NextResponse.json({ ok: false, error: err.message || String(err) }, { status: 500 });
    }
}