"""The consolidated report for a whole course of treatment.

One document covering every consultation session in chronological order —
each with the summary, symptoms, assistive diagnosis and the prescription
issued that day — followed by the single final prescription merged from all of
them. This is what the patient leaves with when treatment ends; the
single-session report in `report_generator` remains what is printed after an
individual visit.

Layout primitives (letterhead, styles, the medicine table, the verification
line) are shared with the single-session report so both documents read as the
same practice's paperwork.
"""

from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from config.config import get_config
from portal.pdf.report_generator import (
    BRAND_PURPLE,
    SLATE_100,
    SLATE_400,
    SLATE_500,
    STYLE_BODY,
    STYLE_DISCLAIMER,
    STYLE_DOC_META,
    STYLE_DOC_TITLE,
    STYLE_PRACTICE_META,
    STYLE_PRACTICE_NAME,
    STYLE_LABEL,
    STYLE_QR_CAPTION,
    STYLE_SECTION,
    _age_from_dob,
    _practice_lines,
    _info_row,
    _logo,
    _qr_code,
    prescription_table,
    verification_line,
)

STYLE_SESSION_HEADING = ParagraphStyle(
    "SessionHeading",
    parent=STYLE_SECTION,
    fontSize=12,
    spaceBefore=14,
    spaceAfter=2,
)
STYLE_SESSION_META = ParagraphStyle(
    "SessionMeta", parent=STYLE_LABEL, fontSize=8, textColor=SLATE_500, spaceAfter=4
)
STYLE_SUBSECTION = ParagraphStyle(
    "SubSection",
    parent=STYLE_LABEL,
    fontSize=8.5,
    textColor=SLATE_500,
    spaceBefore=7,
    spaceAfter=2,
)
STYLE_FINAL_HEADING = ParagraphStyle(
    "FinalHeading", parent=STYLE_SECTION, fontSize=13, spaceBefore=6, spaceAfter=6
)


def _advice_list(lines):
    items = [ListItem(Paragraph(line, STYLE_BODY)) for line in lines if line]
    return ListFlowable(items, bulletType="bullet", start="•") if items else None


def _session_block(session):
    """One consultation session, rendered exactly as it was recorded.

    Reads from the session's own stored summary and prescription — the
    consolidation never rewrites these, so what appears here is what the
    doctor signed off on the day.
    """
    story = []
    summary = session.summary
    when = session.ended_at or session.started_at
    when_label = when.strftime("%d %B %Y, %I:%M %p") if when else "Date not recorded"
    duration = session.duration_seconds
    duration_label = f" · {duration // 60} min" if duration else ""

    story.append(Paragraph(f"Session {session.session_number}", STYLE_SESSION_HEADING))
    story.append(Paragraph(f"{when_label}{duration_label}", STYLE_SESSION_META))
    story.append(HRFlowable(width="100%", color=SLATE_100, thickness=1))

    if not summary:
        story.append(Paragraph("No summary was recorded for this session.", STYLE_BODY))
        return story

    story.append(Paragraph("CLINICAL SUMMARY", STYLE_SUBSECTION))
    story.append(Paragraph(summary.summary or "—", STYLE_BODY))

    if summary.symptoms:
        story.append(Paragraph("SYMPTOMS", STYLE_SUBSECTION))
        story.append(Paragraph(summary.symptoms, STYLE_BODY))

    story.append(Paragraph("POSSIBLE DIAGNOSIS (ASSISTIVE)", STYLE_SUBSECTION))
    story.append(Paragraph(summary.possible_diagnosis or "—", STYLE_BODY))

    story.append(Paragraph("PRESCRIBED AT THIS SESSION", STYLE_SUBSECTION))
    if session.prescriptions:
        story.append(prescription_table(session.prescriptions))
        story.append(Spacer(1, 4))
        story.append(
            verification_line(
                session.prescription_verified_at,
                session.verified_by.name if session.verified_by else None,
                what="session prescription",
            )
        )
    else:
        story.append(Paragraph("No medicines prescribed at this session.", STYLE_BODY))

    advice = _advice_list((summary.follow_up_advice or "").splitlines())
    if advice:
        story.append(Paragraph("FOLLOW-UP GIVEN", STYLE_SUBSECTION))
        story.append(advice)

    return story


def generate_case_pdf(case, output_path):
    """Renders a whole course of treatment into one practice-letterhead PDF."""
    patient = case.patient
    doctor = case.doctor
    sessions = [s for s in case.sessions if s.status == "completed"]

    config = get_config()
    practice = config.PRACTICE
    generated_at = datetime.now()

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        title=f"Consolidated Medical Report — {patient.name if patient else 'Patient'}",
        author=practice.get("name") or "MediAssist AI",
    )
    story = []

    # --- Letterhead ---------------------------------------------------------
    practice_block = [Paragraph(practice.get("name") or "MediAssist AI", STYLE_PRACTICE_NAME)]
    for line in _practice_lines(practice):
        practice_block.append(Paragraph(line, STYLE_PRACTICE_META))

    right_block = [
        Paragraph("Consolidated Medical Report", STYLE_DOC_TITLE),
        Paragraph(f"Ref: {case.code}", STYLE_DOC_META),
        Paragraph(
            f"{len(sessions)} consultation session{'' if len(sessions) == 1 else 's'}",
            STYLE_DOC_META,
        ),
        Paragraph(f"Generated {generated_at.strftime('%d %b %Y, %I:%M %p')}", STYLE_DOC_META),
    ]

    header = Table([[_logo(), practice_block, right_block]], colWidths=[20 * mm, 90 * mm, 60 * mm])
    header.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (0, 0), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(header)
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", color=BRAND_PURPLE, thickness=1.5))
    story.append(Spacer(1, 10))

    # --- Patient / doctor / treatment period --------------------------------
    age = _age_from_dob(patient.dob) if patient else None
    age_gender = " / ".join(
        filter(
            None,
            [
                f"{age} yrs" if age is not None else None,
                (patient.gender or "").capitalize() if patient else None,
            ],
        )
    )
    first = sessions[0] if sessions else None
    last = sessions[-1] if sessions else None
    started = (first.started_at or first.created_at) if first else case.opened_at
    ended = (last.ended_at or last.started_at) if last else case.closed_at
    period = " – ".join(
        filter(
            None,
            [
                started.strftime("%d %b %Y") if started else None,
                ended.strftime("%d %b %Y") if ended else None,
            ],
        )
    )

    doctor_name = doctor.user.name if doctor and doctor.user else "—"
    doctor_credentials = " · ".join(
        filter(
            None,
            [
                doctor.specialization if doctor else None,
                f"Reg. No. {doctor.registration_no}" if doctor and doctor.registration_no else None,
            ],
        )
    )

    info_table = Table(
        [
            _info_row("Patient Name", patient.name if patient else "—")
            + _info_row("Doctor", doctor_name),
            _info_row("Patient ID", f"PAT{patient.id:04d}" if patient else "—")
            + _info_row("Qualification", (doctor.qualification if doctor else None) or "—"),
            _info_row("Age / Gender", age_gender or "—")
            + _info_row("Credentials", doctor_credentials or "—"),
            _info_row("Contact", (patient.phone if patient else None) or "—")
            + _info_row("Treatment Period", period or "—"),
        ],
        colWidths=[30 * mm, 55 * mm, 30 * mm, 55 * mm],
    )
    info_table.setStyle(
        TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)])
    )
    story.append(info_table)
    story.append(HRFlowable(width="100%", color=SLATE_100, thickness=1))

    # --- Overview of the whole course ---------------------------------------
    story.append(Paragraph("Overall Summary", STYLE_SECTION))
    story.append(Paragraph(case.final_summary or "—", STYLE_BODY))

    if case.progression:
        story.append(Paragraph("Progression Across Sessions", STYLE_SECTION))
        story.append(Paragraph(case.progression, STYLE_BODY))

    story.append(Paragraph("Final Assessment (Assistive)", STYLE_SECTION))
    story.append(Paragraph(case.final_diagnosis or "—", STYLE_BODY))
    story.append(
        Paragraph(
            "Assistive only — generated by AI from the consultation transcripts, not a "
            "confirmed diagnosis. Verified and issued under the treating doctor's supervision.",
            STYLE_DISCLAIMER,
        )
    )

    # --- Every session, in order --------------------------------------------
    story.append(Paragraph("Consultation Sessions", STYLE_SECTION))
    story.append(
        Paragraph(
            "Each session below is reproduced as it was recorded and signed off on the day. "
            "Later sessions never modify earlier ones.",
            STYLE_DISCLAIMER,
        )
    )
    if sessions:
        for session in sessions:
            story.extend(_session_block(session))
    else:
        story.append(Paragraph("No completed sessions on this case.", STYLE_BODY))

    # --- The consolidated prescription --------------------------------------
    # On its own page: this is the sheet that gets handed to a chemist, and
    # it must not arrive split across a page break in the middle of the
    # medicine list or trailing a session's older prescription.
    story.append(PageBreak())
    story.append(Paragraph("Final Consolidated Prescription", STYLE_FINAL_HEADING))
    story.append(
        Paragraph(
            "The medication list for this course of treatment as a whole, merged from all "
            f"{len(sessions)} session{'' if len(sessions) == 1 else 's'} above. Where a medicine "
            "was prescribed more than once, the most recent instructions apply. This list "
            "supersedes the individual session prescriptions.",
            STYLE_DISCLAIMER,
        )
    )
    story.append(Spacer(1, 8))

    if case.final_prescriptions:
        story.append(
            prescription_table(
                case.final_prescriptions,
                extra_column=(
                    "From",
                    lambda p: p.note
                    or (
                        f"Session {p.source_session_number}"
                        if p.source_session_number
                        else "Added by doctor"
                    ),
                ),
            )
        )
    else:
        story.append(
            Paragraph("No ongoing medication at the end of this course of treatment.", STYLE_BODY)
        )

    story.append(Spacer(1, 8))
    story.append(
        verification_line(
            case.final_verified_at,
            case.verified_by.name if case.verified_by else None,
            what="consolidated prescription",
        )
    )

    final_follow_up = _advice_list((case.final_follow_up_advice or "").splitlines())
    if final_follow_up:
        story.append(Paragraph("Follow-up Instructions", STYLE_SECTION))
        story.append(final_follow_up)

    final_lifestyle = _advice_list((case.final_lifestyle_advice or "").splitlines())
    if final_lifestyle:
        story.append(Paragraph("Lifestyle Advice", STYLE_SECTION))
        story.append(final_lifestyle)

    # --- QR code + signature -------------------------------------------------
    story.append(Spacer(1, 20))

    qr_drawing = _qr_code(f"{config.PORTAL_BASE_URL}/dashboard/cases/{case.id}")
    qr_cell = (
        [qr_drawing, Spacer(1, 2), Paragraph("Scan to open<br/>this case", STYLE_QR_CAPTION)]
        if qr_drawing
        else []
    )

    sig_lines = [f"<b>{doctor_name}</b>"]
    if doctor and doctor.specialization:
        sig_lines.append(doctor.specialization)
    if doctor and doctor.registration_no:
        sig_lines.append(f"Reg. No. {doctor.registration_no}")
    if doctor and doctor.qualification:
        sig_lines.append(doctor.qualification)

    signature_block = [
        Paragraph("_______________________", ParagraphStyle("SigLine", parent=STYLE_BODY, alignment=2)),
        Spacer(1, 3),
        Paragraph("<br/>".join(sig_lines), ParagraphStyle("Sig", parent=STYLE_BODY, alignment=2, leading=12)),
        Spacer(1, 2),
        Paragraph("Doctor's Signature", ParagraphStyle("SigCaption", parent=STYLE_LABEL, alignment=2)),
    ]

    footer_table = Table([[qr_cell, signature_block]], colWidths=[30 * mm, 140 * mm])
    footer_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (0, 0), "TOP"),
                ("VALIGN", (1, 0), (1, 0), "BOTTOM"),
                ("LEFTPADDING", (0, 0), (0, 0), 0),
            ]
        )
    )
    story.append(footer_table)

    def draw_footer(canvas, document):
        """Practice footer on every page — this document runs to several, and
        a detached one still has to be identifiable."""
        canvas.saveState()
        width, _ = A4
        y = 12 * mm
        canvas.setStrokeColor(SLATE_100)
        canvas.setLineWidth(0.5)
        canvas.line(20 * mm, y + 8, width - 20 * mm, y + 8)

        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(SLATE_400)
        left = " · ".join(filter(None, [practice.get("name"), practice.get("phone")]))
        canvas.drawString(20 * mm, y, left)
        canvas.drawRightString(width - 20 * mm, y, f"{case.code} · Page {document.page}")
        canvas.setFont("Helvetica-Oblique", 6.5)
        canvas.drawCentredString(
            width / 2, y - 8, "This is a computer-generated report issued by the treating doctor."
        )
        canvas.restoreState()

    doc.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
    return output_path
