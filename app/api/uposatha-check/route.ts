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
    return (age === 0 ? 30 : age);
}

function isUposathaLunarDay(lunarDay: number) {
    // Theo truyền thống: các ngày uposatha thường là ngày 8, 14, 15, 30 (âm lịch)
    return lunarDay === 8 || lunarDay === 14 || lunarDay === 15 || lunarDay === 30;
}

function formatDate(d: Date) {
    return d.toISOString().slice(0, 10);
}

// ---- mail sender ----
async function sendMail(subject: string, text: string) {
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
        secure: port === 465, // true nếu port 465, với Mailjet thường là false trên 587
        auth: {
            user,
            pass,
        },
        // Mailjet không bắt buộc TLS bắt buộc ở cấu hình bạn gửi, nên để mặc định.
        // Nếu cần ép TLS: thêm `requireTLS: true`
        // Nếu gặp vấn đề cert: thêm `tls: { rejectUnauthorized: false }` (không khuyến khích trên prod)
    });

    const info = await transporter.sendMail({
        from,
        to,
        subject,
        text,
    });

    return info;
}

// ---- main handler ----
export async function GET() {
    try {
        const today = new Date();
        const daysToCheck = 7; // kiểm tra hôm nay + 6 ngày sau (tùy bạn chỉnh)
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

        // Build email
        const lines = [
            found[0].type === "today" ? `Hôm nay (${found[0].date}) có khả năng là ngày Uposatha (ngày âm ${found[0].lunarDay}).` : `Sắp có ngày Uposatha:`,
            "",
            ...found.map(f => `- ${f.date} (ngày âm ≈ ${f.lunarDay}) - ${f.type}`),
            "",
            "Lưu ý: đây là kết quả xấp xỉ dựa trên tuổi trăng (moon age). Nếu cần độ chính xác cao theo lịch âm/chư Tăng hoặc lịch chùa, vui lòng dùng nguồn lịch chính thức.",
        ];
        const subject = found.some(f => f.type === "today") ? `Thông báo: Hôm nay là Uposatha` : `Thông báo: Sắp có Uposatha`;
        const text = lines.join("\n");

        // Gửi mail
        const info = await sendMail(subject, text);

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