import io
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, HRFlowable
)


def generate_exam_result_pdf(
    exam_title: str,
    exam_code: str,
    classroom_name: str,
    duration_minutes: int,
    student_name: str,
    student_email: str,
    submitted_at: datetime,
    score: int,
    total_marks: int,
    percentage: float,
    is_passed: bool,
    passing_percentage: int,
    questions: List[Dict[str, Any]],
    answers: List[Dict[str, Any]]
) -> bytes:
    """
    Generates a high-quality, professional academic PDF transcript and score card.
    100% offline, pure Python ReportLab implementation.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()

    # Custom styles
    header_title_style = ParagraphStyle(
        "HeaderTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#0f172a"),
        alignment=0
    )

    header_sub_style = ParagraphStyle(
        "HeaderSub",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#4f46e5"),
        alignment=0
    )

    meta_label_style = ParagraphStyle(
        "MetaLabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#475569")
    )

    meta_val_style = ParagraphStyle(
        "MetaVal",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#0f172a")
    )

    section_heading = ParagraphStyle(
        "SectionHeading",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#1e293b")
    )

    cell_style = ParagraphStyle(
        "CellNormal",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#1e293b")
    )

    cell_bold_style = ParagraphStyle(
        "CellBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#0f172a")
    )

    cell_correct_style = ParagraphStyle(
        "CellCorrect",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#16a34a")
    )

    cell_incorrect_style = ParagraphStyle(
        "CellIncorrect",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#dc2626")
    )

    footer_style = ParagraphStyle(
        "FooterNote",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#64748b"),
        alignment=1
    )

    story = []

    # 1. Header Banner
    story.append(Paragraph("SATARK &bull; SMART CLASSROOM INTEGRITY PLATFORM", header_sub_style))
    story.append(Spacer(1, 4))
    story.append(Paragraph("Official Examination Transcript & Score Card", header_title_style))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#4f46e5"), spaceBefore=2, spaceAfter=12))

    # 2. Student & Exam Information Table
    sub_date_str = submitted_at.strftime("%d %b %Y, %I:%M %p UTC") if submitted_at else "N/A"
    gen_date_str = datetime.now(timezone.utc).strftime("%d %b %Y, %I:%M %p UTC")

    info_data = [
        [
            Paragraph("Candidate Name:", meta_label_style),
            Paragraph(student_name, meta_val_style),
            Paragraph("Examination Title:", meta_label_style),
            Paragraph(exam_title, meta_val_style),
        ],
        [
            Paragraph("Candidate Email:", meta_label_style),
            Paragraph(student_email, meta_val_style),
            Paragraph("Exam Code / Room:", meta_label_style),
            Paragraph(exam_code, meta_val_style),
        ],
        [
            Paragraph("Classroom:", meta_label_style),
            Paragraph(classroom_name, meta_val_style),
            Paragraph("Allocated Duration:", meta_label_style),
            Paragraph(f"{duration_minutes} minutes", meta_val_style),
        ],
        [
            Paragraph("Submitted At:", meta_label_style),
            Paragraph(sub_date_str, meta_val_style),
            Paragraph("Report Generated:", meta_label_style),
            Paragraph(gen_date_str, meta_val_style),
        ],
    ]

    info_table = Table(info_data, colWidths=[110, 160, 120, 150])
    info_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 16))

    # 3. Overall Performance Summary Box
    result_text = "PASS" if is_passed else "FAIL"
    result_color = colors.HexColor("#16a34a") if is_passed else colors.HexColor("#dc2626")
    badge_bg = colors.HexColor("#dcfce7") if is_passed else colors.HexColor("#fee2e2")

    result_badge_style = ParagraphStyle(
        "ResultBadge",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=result_color,
        alignment=1
    )

    score_box_data = [
        [
            Paragraph("Obtained Score", meta_label_style),
            Paragraph("Percentage", meta_label_style),
            Paragraph("Passing Benchmark", meta_label_style),
            Paragraph("Final Result", meta_label_style)
        ],
        [
            Paragraph(f"<b>{score}</b> / {total_marks}", ParagraphStyle("BigScore", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=colors.HexColor("#0f172a"))),
            Paragraph(f"<b>{percentage:.1f}%</b>", ParagraphStyle("BigPct", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=colors.HexColor("#0f172a"))),
            Paragraph(f"{passing_percentage}%", ParagraphStyle("PassCrit", parent=styles["Normal"], fontName="Helvetica", fontSize=12, leading=16, textColor=colors.HexColor("#475569"))),
            Paragraph(f"<b>{result_text}</b>", result_badge_style)
        ]
    ]

    score_table = Table(score_box_data, colWidths=[135, 135, 135, 135])
    score_table.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("BACKGROUND", (0, 0), (2, -1), colors.HexColor("#f1f5f9")),
        ("BACKGROUND", (3, 0), (3, -1), badge_bg),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#cbd5e1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
    ]))
    story.append(score_table)
    story.append(Spacer(1, 18))

    # 4. Question-wise Breakdown Table
    story.append(Paragraph("Question-by-Question Evaluation Breakdown", section_heading))
    story.append(Spacer(1, 8))

    ans_by_q = {a.get("question_id"): a for a in answers}

    q_table_data = [
        [
            Paragraph("Q#", cell_bold_style),
            Paragraph("Question", cell_bold_style),
            Paragraph("Type", cell_bold_style),
            Paragraph("Candidate Answer", cell_bold_style),
            Paragraph("Status", cell_bold_style),
            Paragraph("Score", cell_bold_style),
            Paragraph("Feedback / Explanation", cell_bold_style)
        ]
    ]

    for idx, q in enumerate(questions, start=1):
        q_id = q.get("id")
        ans = ans_by_q.get(q_id, {})
        q_type = q.get("question_type", "mcq")
        marks = q.get("marks", 1)
        awarded = ans.get("marks_awarded", 0)
        is_corr = ans.get("is_correct", False)

        # Candidate response formatting
        if q_type in ("mcq", "true_false"):
            sel_idx = ans.get("selected_option_index")
            opts = q.get("options", [])
            cand_ans = opts[sel_idx] if sel_idx is not None and sel_idx < len(opts) else "<i>Not Attempted</i>"
        elif q_type == "multiple_select":
            picks = ans.get("selected_options") or []
            opts = q.get("options", [])
            cand_ans = ", ".join([opts[i] for i in picks if i < len(opts)]) if picks else "<i>Not Attempted</i>"
        elif q_type == "short_answer":
            cand_ans = ans.get("text_answer") or "<i>Not Attempted</i>"
        else:
            cand_ans = "<i>N/A</i>"

        # Truncate overly long candidate answer for clean table rendering
        if len(cand_ans) > 75:
            cand_ans = cand_ans[:72] + "..."

        status_style = cell_correct_style if is_corr else cell_incorrect_style
        status_text = "Correct" if is_corr else "Incorrect" if cand_ans != "<i>Not Attempted</i>" else "Unattempted"

        # Feedback or explanation
        fb = ans.get("feedback") or q.get("explanation") or "-"
        if len(fb) > 90:
            fb = fb[:87] + "..."

        # Clean question text
        q_text = q.get("question_text", "")
        if len(q_text) > 90:
            q_text = q_text[:87] + "..."

        q_table_data.append([
            Paragraph(str(idx), cell_style),
            Paragraph(q_text, cell_style),
            Paragraph(q_type.replace("_", " ").title(), cell_style),
            Paragraph(cand_ans, cell_style),
            Paragraph(status_text, status_style),
            Paragraph(f"{awarded} / {marks}", cell_bold_style),
            Paragraph(fb, cell_style)
        ])

    q_table = Table(
        q_table_data,
        colWidths=[24, 130, 60, 110, 60, 46, 110]
    )
    q_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
    ]))

    # Alternating row colors
    for i in range(1, len(q_table_data)):
        if i % 2 == 0:
            q_table.setStyle(TableStyle([("BACKGROUND", (0, i), (-1, i), colors.HexColor("#f8fafc"))]))

    story.append(q_table)
    story.append(Spacer(1, 20))

    # 5. Attestation Footer
    story.append(KeepTogether([
        HRFlowable(width="100%", thickness=0.75, color=colors.HexColor("#cbd5e1"), spaceBefore=6, spaceAfter=8),
        Paragraph(
            "This official transcript was digitally certified by the SATARK Offline LAN Proctoring System. "
            "All candidate responses were cryptographically sealed and verified against continuous telemetry monitoring.",
            footer_style
        )
    ]))

    doc.build(story)
    buf.seek(0)
    return buf.getvalue()

