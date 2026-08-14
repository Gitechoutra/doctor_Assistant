from datetime import date, datetime

from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from config.config import get_config

BRAND_PURPLE = colors.HexColor("#5b4bd1")
BRAND_DEEP = colors.HexColor("#4c3eb0")
SLATE_700 = colors.HexColor("#334155")
SLATE_500 = colors.HexColor("#64748b")
SLATE_400 = colors.HexColor("#94a3b8")
SLATE_100 = colors.HexColor("#f1f5f9")
EMERALD = colors.HexColor("#047857")
AMBER = colors.HexColor("#b45309")

styles = getSampleStyleSheet()
STYLE_HOSPITAL_NAME = ParagraphStyle(
    "HospitalName", parent=styles["Heading1"], fontSize=17, textColor=BRAND_PURPLE, spaceAfter=0, leading=20
)
STYLE_HOSPITAL_META = ParagraphStyle(
    "HospitalMeta", parent=styles["Normal"], fontSize=7.5, textColor=SLATE_500, leading=10
)
STYLE_DOC_TITLE = ParagraphStyle(
    "DocTitle", parent=styles["Normal"], fontSize=11, textColor=SLATE_500, alignment=2
)
STYLE_DOC_META = ParagraphStyle(
    "DocMeta", parent=styles["Normal"], fontSize=7.5, textColor=SLATE_400, alignment=2, leading=10
)
STYLE_SECTION = ParagraphStyle(
    "Section", parent=styles["Heading3"], fontSize=11, textColor=BRAND_PURPLE, spaceBefore=12, spaceAfter=4
)
STYLE_BODY = ParagraphStyle("Body", parent=styles["Normal"], fontSize=10, textColor=SLATE_700, leading=14)
STYLE_LABEL = ParagraphStyle("Label", parent=styles["Normal"], fontSize=8, textColor=SLATE_500)
STYLE_VALUE = ParagraphStyle("Value", parent=styles["Normal"], fontSize=10, textColor=SLATE_700)
STYLE_FOOTER = ParagraphStyle(
    "Footer", parent=styles["Normal"], fontSize=8, textColor=SLATE_500, alignment=1, leading=11
)
STYLE_DISCLAIMER = ParagraphStyle(
    "Disclaimer", parent=styles["Normal"], fontSize=8, textColor=SLATE_500, leading=11
)
STYLE_TABLE_CELL = ParagraphStyle(
    "TableCell", parent=styles["Normal"], fontSize=9, textColor=SLATE_700, leading=12
)
STYLE_QR_CAPTION = ParagraphStyle(
    "QrCaption", parent=styles["Normal"], fontSize=6.5, textColor=SLATE_400, alignment=1, leading=8
)


def _age_from_dob(dob):
    if not dob:
        return None
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def _info_row(label, value):
    return [Paragraph(label.upper(), STYLE_LABEL), Paragraph(value or "—", STYLE_VALUE)]


def _logo(size=16 * mm):
    """The hospital mark, drawn rather than loaded.

    Keeping it as vector primitives means the PDF needs no image asset on
    disk and can't break if one goes missing — the frontend's SVG logo would
    need an extra dependency (svglib) to render here.
    """
    drawing = Drawing(size, size)
    drawing.add(Rect(0, 0, size, size, rx=size * 0.28, ry=size * 0.28,
                     fillColor=BRAND_PURPLE, strokeColor=None))
    # Inner "speech bubble" nod to the consultation app's icon.
    drawing.add(Rect(size * 0.24, size * 0.34, size * 0.52, size * 0.36, rx=size * 0.1, ry=size * 0.1,
                     fillColor=colors.white, strokeColor=None))
    drawing.add(Rect(size * 0.33, size * 0.24, size * 0.16, size * 0.16, rx=size * 0.04, ry=size * 0.04,
                     fillColor=colors.white, strokeColor=None))
    drawing.add(String(size * 0.5, size * 0.44, "Y", fontSize=size * 0.3, fillColor=BRAND_DEEP,
                       textAnchor="middle", fontName="Helvetica-Bold"))
    return drawing


def _qr_code(value, size=22 * mm):
    """QR linking back to this consultation, so a printed page can be traced
    to the record. Returns None if there's nothing meaningful to encode."""
    if not value:
        return None
    widget = qr.QrCodeWidget(value)
    x1, y1, x2, y2 = widget.getBounds()
    drawing = Drawing(size, size, transform=[size / (x2 - x1), 0, 0, size / (y2 - y1), 0, 0])
    drawing.add(widget)
    return drawing


def _hospital_lines(hospital):
    contact = " · ".join(filter(None, [hospital.get("phone"), hospital.get("email")]))
    return list(filter(None, [hospital.get("address"), contact, hospital.get("website")]))


PRESCRIPTION_TABLE_STYLE = TableStyle(
    [
        ("BACKGROUND", (0, 0), (-1, 0), SLATE_100),
        ("TEXTCOLOR", (0, 0), (-1, 0), SLATE_500),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, SLATE_100),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TEXTCOLOR", (0, 1), (-1, -1), SLATE_700),
    ]
)


def prescription_table(prescriptions, extra_column=None):
    """The medicine table, shared by the single-session and case reports.

    `extra_column` is (heading, value_fn) for the consolidated report's
    provenance column — where in the course of treatment each medicine came
    from, which a single-session report has no use for.
    """
    header = ["#", "Medicine", "Dosage", "Frequency", "Duration", "Qty"]
    widths = [7 * mm, 45 * mm, 25 * mm, 45 * mm, 26 * mm, 22 * mm]
    if extra_column:
        header.append(extra_column[0])
        # Taken out of the widest free-text columns so the table still fits
        # the page rather than overflowing the right margin.
        widths = [7 * mm, 38 * mm, 22 * mm, 36 * mm, 22 * mm, 18 * mm, 27 * mm]

    rows = [header]
    for index, p in enumerate(prescriptions, start=1):
        # The label line goes under the medicine name rather than in its own
        # column: it is a sentence, and a sixth narrow column would wrap it
        # into an unreadable stack.
        name = p.medicine_name
        instructions = getattr(p, "instructions", None) or (
            p.brand.usage_instructions if getattr(p, "brand", None) else None
        )
        if instructions:
            name = f"{name}<br/><font size=7.5 color='#64748b'>{instructions}</font>"
        row = [
            Paragraph(str(index), STYLE_TABLE_CELL),
            Paragraph(name, STYLE_TABLE_CELL),
            Paragraph(p.dose or "—", STYLE_TABLE_CELL),
            Paragraph(p.frequency or "—", STYLE_TABLE_CELL),
            Paragraph(p.duration or "—", STYLE_TABLE_CELL),
            Paragraph(getattr(p, "quantity", None) or "—", STYLE_TABLE_CELL),
        ]
        if extra_column:
            row.append(Paragraph(extra_column[1](p) or "—", STYLE_TABLE_CELL))
        rows.append(row)

    table = Table(rows, colWidths=widths, repeatRows=1)
    table.setStyle(PRESCRIPTION_TABLE_STYLE)
    return table


def verification_line(verified_at, verifier_name, what="prescription"):
    """The single most important thing a reader of a printed prescription
    needs: whether a doctor actually stood behind it."""
    if verified_at:
        verifier = verifier_name or "the treating doctor"
        verified_on = verified_at.strftime("%d %b %Y at %H:%M UTC")
        return Paragraph(
            f"<b>Verified</b> — {what} reviewed and approved by {verifier} on {verified_on}.",
            ParagraphStyle("Verified", parent=STYLE_DISCLAIMER, textColor=EMERALD),
        )
    return Paragraph(
        f"<b>NOT VERIFIED</b> — this {what} has not been signed off by the treating doctor.",
        ParagraphStyle("Unverified", parent=STYLE_DISCLAIMER, textColor=AMBER),
    )


def generate_consultation_pdf(consultation, output_path):
    """Renders a consultation's summary into a hospital-letterhead-style PDF."""
    patient = consultation.patient
    doctor = consultation.doctor
    summary = consultation.summary
    prescriptions = consultation.prescriptions

    config = get_config()
    hospital = config.HOSPITAL
    generated_at = datetime.now()

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        title=f"Consultation Report — {patient.name if patient else 'Patient'}",
        author=hospital.get("name") or "Hospital",
    )
    story = []

    # --- Letterhead: logo + hospital details -------------------------------
    hospital_block = [Paragraph(hospital.get("name") or "Hospital", STYLE_HOSPITAL_NAME)]
    if hospital.get("tagline"):
        hospital_block.append(Paragraph(hospital["tagline"], STYLE_HOSPITAL_META))
    for line in _hospital_lines(hospital):
        hospital_block.append(Paragraph(line, STYLE_HOSPITAL_META))

    right_block = [
        Paragraph("Consultation Report", STYLE_DOC_TITLE),
        Paragraph(f"Ref: CONS-{consultation.id:05d}", STYLE_DOC_META),
        Paragraph(f"Generated {generated_at.strftime('%d %b %Y, %I:%M %p')}", STYLE_DOC_META),
    ]
    # A session inside a longer course of treatment says so, so this page is
    # never mistaken for the record of the whole treatment — that document is
    # the case report, produced when the case closes.
    case = consultation.case
    if case and len(case.sessions) > 1:
        right_block.append(
            Paragraph(
                f"Session {consultation.session_number} of {len(case.sessions)} · {case.code}",
                STYLE_DOC_META,
            )
        )

    header = Table(
        [[_logo(), hospital_block, right_block]],
        colWidths=[20 * mm, 95 * mm, 55 * mm],
    )
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

    # --- Patient / doctor / visit ------------------------------------------
    age = _age_from_dob(patient.dob) if patient else None
    age_gender = " / ".join(
        filter(None, [f"{age} yrs" if age is not None else None,
                      (patient.gender or "").capitalize() if patient else None])
    )
    visit_dt = consultation.started_at or consultation.created_at
    visit_date = visit_dt.strftime("%d %B %Y") if visit_dt else "—"
    visit_time = visit_dt.strftime("%I:%M %p") if visit_dt else "—"

    doctor_name = doctor.user.name if doctor and doctor.user else "—"
    doctor_credentials = " · ".join(
        filter(None, [
            doctor.specialization if doctor else None,
            f"Reg. No. {doctor.registration_no}" if doctor and doctor.registration_no else None,
        ])
    )

    info_table = Table(
        [
            _info_row("Patient Name", patient.name if patient else "—")
            + _info_row("Doctor", doctor_name),
            _info_row("Patient ID", f"PAT{patient.id:04d}" if patient else "—")
            + _info_row("Department", doctor.department.name if doctor and doctor.department else "—"),
            _info_row("Age / Gender", age_gender or "—")
            + _info_row("Credentials", doctor_credentials or "—"),
            _info_row("Contact", (patient.phone if patient else None) or "—")
            + _info_row("Date & Time", f"{visit_date}, {visit_time}"),
        ],
        colWidths=[30 * mm, 55 * mm, 30 * mm, 55 * mm],
    )
    info_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    story.append(info_table)
    story.append(HRFlowable(width="100%", color=SLATE_100, thickness=1))

    # --- Clinical summary ---------------------------------------------------
    story.append(Paragraph("Clinical Summary", STYLE_SECTION))
    story.append(Paragraph(summary.summary or "—", STYLE_BODY))

    # No symptoms or diagnosis section: the issued prescription carries what
    # the patient is to take and to do, not the presentation it was reasoned
    # from. `symptoms` and `possible_diagnosis` are still generated and still
    # on the record — they are simply not part of this document.

    # --- Prescription --------------------------------------------------------
    story.append(Paragraph("Prescription", STYLE_SECTION))
    if prescriptions:
        story.append(prescription_table(prescriptions))
    else:
        story.append(Paragraph("No medicines prescribed.", STYLE_BODY))

    story.append(Spacer(1, 6))
    story.append(
        verification_line(
            consultation.prescription_verified_at,
            consultation.verified_by.name if consultation.verified_by else None,
        )
    )

    # --- Instructions & advice -------------------------------------------------
    if summary.follow_up_advice:
        story.append(Paragraph("Follow-up Instructions", STYLE_SECTION))
        items = [ListItem(Paragraph(a, STYLE_BODY)) for a in summary.follow_up_advice.splitlines() if a]
        story.append(ListFlowable(items, bulletType="bullet", start="•"))

    if summary.lifestyle_advice:
        story.append(Paragraph("Lifestyle Advice", STYLE_SECTION))
        items = [ListItem(Paragraph(a, STYLE_BODY)) for a in summary.lifestyle_advice.splitlines() if a]
        story.append(ListFlowable(items, bulletType="bullet", start="•"))

    # --- QR code + signature ----------------------------------------------------
    story.append(Spacer(1, 20))

    qr_target = f"{config.PORTAL_BASE_URL}/dashboard/consultations/{consultation.id}"
    qr_drawing = _qr_code(qr_target)
    qr_cell = (
        [qr_drawing, Spacer(1, 2), Paragraph("Scan to open<br/>this record", STYLE_QR_CAPTION)]
        if qr_drawing
        else []
    )

    sig_lines = [f"<b>{doctor_name}</b>"]
    if doctor and doctor.specialization:
        sig_lines.append(doctor.specialization)
    if doctor and doctor.registration_no:
        sig_lines.append(f"Reg. No. {doctor.registration_no}")
    if doctor and doctor.department:
        sig_lines.append(doctor.department.name)

    signature_block = [
        Paragraph("_______________________", ParagraphStyle("SigLine", parent=STYLE_BODY, alignment=2)),
        Spacer(1, 3),
        Paragraph(
            "<br/>".join(sig_lines),
            ParagraphStyle("Sig", parent=STYLE_BODY, alignment=2, leading=12),
        ),
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
        """Hospital footer on every page, so a detached second page is still
        identifiable."""
        canvas.saveState()
        width, _ = A4
        y = 12 * mm
        canvas.setStrokeColor(SLATE_100)
        canvas.setLineWidth(0.5)
        canvas.line(20 * mm, y + 8, width - 20 * mm, y + 8)

        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(SLATE_400)
        left = " · ".join(filter(None, [hospital.get("name"), hospital.get("phone")]))
        canvas.drawString(20 * mm, y, left)
        canvas.drawRightString(
            width - 20 * mm,
            y,
            f"CONS-{consultation.id:05d} · Page {document.page}",
        )
        canvas.setFont("Helvetica-Oblique", 6.5)
        canvas.drawCentredString(
            width / 2, y - 8, "This is a computer-generated report issued by the treating doctor."
        )
        canvas.restoreState()

    doc.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
    return output_path
