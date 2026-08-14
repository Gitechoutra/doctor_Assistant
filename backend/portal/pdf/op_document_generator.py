"""The OP registration slip — what reception hands over (or a doctor's queue
card links back to) the moment a patient is admitted and queued.

Not a clinical document: no summary, no prescription, no verification or
signature block, since nothing about it needs a doctor to stand behind it —
it just records that this patient was registered, who is treating them, and
where to find them. Letterhead and footer are shared with the consultation
and case reports so all three read as the same hospital's paperwork.

Deliberately carries no payment information: `Appointment.payment_type` is a
front-desk bookkeeping field, not something that belongs on paper the patient
walks away with.
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from config.config import get_config
from portal.helpers.datetime_helper import to_utc_iso
from portal.pdf.report_generator import (
    SLATE_100,
    SLATE_400,
    STYLE_DOC_META,
    STYLE_DOC_TITLE,
    STYLE_HOSPITAL_META,
    STYLE_HOSPITAL_NAME,
    _hospital_lines,
    _info_row,
    _logo,
)


def generate_op_document_pdf(appointment, output_path):
    """Renders one OP's registration slip into a hospital-letterhead PDF."""
    patient = appointment.patient
    # The doctor this OP was raised against, which is what the slip in the
    # patient's hand names. Only OPs raised before reception stamped the doctor
    # onto the appointment fall back to the patient's current assignment — for
    # those there is nothing else to print.
    doctor = appointment.doctor or (patient.assigned_doctor if patient else None)

    config = get_config()
    hospital = config.HOSPITAL
    generated_at = to_utc_iso(appointment.created_at)

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        title=f"OP Registration — {patient.name if patient else 'Patient'}",
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
        Paragraph("OP Registration", STYLE_DOC_TITLE),
        Paragraph(f"Ref: {appointment.code}", STYLE_DOC_META),
        Paragraph(f"Generated {generated_at}", STYLE_DOC_META),
    ]

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
    story.append(Spacer(1, 14 * mm))
    story.append(HRFlowable(width="100%", color=SLATE_100, thickness=1))
    story.append(Spacer(1, 6 * mm))

    # --- Patient / OP details ------------------------------------------------
    doctor_name = doctor.user.name if doctor and doctor.user else "—"
    rows = [
        _info_row("Patient Name", patient.name if patient else "—")
        + _info_row("Patient ID", patient.code if patient else "—"),
        _info_row("OP Number", appointment.code)
        + _info_row("Department", appointment.department.name if appointment.department else "—"),
        _info_row("Assigned Doctor", doctor_name)
        + _info_row("Date & Time", generated_at),
    ]
    info_style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]
    if appointment.reason:
        # A label/value pair, then the reason spanning the rest of the row —
        # it's prose, not a fourth column-sized fact.
        rows.append(_info_row("Reason for visit", appointment.reason) + ["", ""])
        info_style.append(("SPAN", (1, -1), (3, -1)))

    info_table = Table(rows, colWidths=[30 * mm, 55 * mm, 30 * mm, 55 * mm])
    info_table.setStyle(TableStyle(info_style))
    story.append(info_table)

    def draw_footer(canvas, document):
        """Hospital footer on every page, so a detached second page is still
        identifiable."""
        canvas.saveState()
        width, _height = A4
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
            f"{appointment.code} · Page {document.page}",
        )
        canvas.setFont("Helvetica-Oblique", 6.5)
        canvas.drawCentredString(
            width / 2, y - 8, "This is a computer-generated OP registration slip."
        )
        canvas.restoreState()

    doc.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
