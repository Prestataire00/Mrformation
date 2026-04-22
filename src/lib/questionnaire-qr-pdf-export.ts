import jsPDF from "jspdf";

interface QRToken {
  token: string;
  learner: { first_name: string; last_name: string };
}

export async function exportQuestionnaireQRPdf(options: {
  tokens: QRToken[];
  questionnaireTitle: string;
  sessionTitle: string;
  baseUrl: string;
}): Promise<jsPDF> {
  const { tokens, questionnaireTitle, sessionTitle, baseUrl } = options;
  const QRCode = (await import("qrcode")).default;

  const doc = new jsPDF({ format: "a4" });
  const perPage = 6;

  for (let i = 0; i < tokens.length; i++) {
    if (i > 0 && i % perPage === 0) doc.addPage();

    const idx = i % perPage;
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = 20 + col * 90;
    const y = 30 + row * 85;

    const tok = tokens[i];
    const url = `${baseUrl}/questionnaire/${tok.token}`;
    const qrDataUrl = await QRCode.toDataURL(url, { width: 200, margin: 1 });

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`${tok.learner.last_name?.toUpperCase()} ${tok.learner.first_name}`, x, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(questionnaireTitle, x, y + 5);
    doc.text(sessionTitle, x, y + 10);

    doc.addImage(qrDataUrl, "PNG", x, y + 14, 55, 55);

    doc.setFontSize(5);
    doc.setTextColor(120);
    doc.text(url.length > 55 ? url.slice(0, 52) + "..." : url, x, y + 73);
    doc.setTextColor(0);
  }

  return doc;
}
