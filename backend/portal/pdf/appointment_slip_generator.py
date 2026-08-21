"""The appointment slip — what the PA hands the patient when they book.

Not a clinical document: no summary, no prescription, no signature block,
since nothing about it needs the doctor to stand behind it. It records that
this patient has an appointment, with whom, and when. Letterhead and footer
are shared with the consultation and case reports so all three read as the
same practice's paperwork.
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from config.config import get_config
from portal.helpers.datetime_helper import to_local_iso, to_utc_iso
from portal.pdf.report_generator import (
    SLATE_100,
    SLATE_400,
    STYLE_DOC_META,
    STYLE_DOC_TITLE,
    STYLE_PRACTICE_META,
    STYLE_PRACTICE_NAME,
    _info_row,
    _logo,
    _practice_lines,
)


def generate_appointment_slip_pdf(appointment, output_path):
    """Renders one appointment's slip onto the practice's letterhead."""
    patient = appointment.patient
    doctor = appointment.doctor or (patient.assigned_doctor if patient else None)

    config = get_config()
    practice = config.PRACTICE
    booked_at = to_utc_iso(appointment.created_at)
    # What the patient actually needs off this piece of paper: when to come.
    # Falls back to the booking time for a walk-in, which has no future slot.
    #
    # `to_local_iso`, not `to_utc_iso`: `scheduled_at` is local wall time (see
    # helpers/datetime_helper), so stamping a 'Z' on it labels 09:00 as UTC and
    # anyone reading the slip in the practice's own zone is out by the offset --
    # 09:00 printed as 14:30 on an IST desk. The walk-in fallback is genuinely
    # UTC and keeps its marker.
    appointment_time = (
        to_local_iso(appointment.scheduled_at) if appointment.scheduled_at else booked_at
    )

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        title=f"Appointment — {patient.name if patient else 'Patient'}",
        author=practice.get("name") or "MediAssist AI",
    )
    story = []

    # --- Letterhead: logo + practice details --------------------------------
    practice_block = [
        Paragraph(practice.get("name") or "MediAssist AI", STYLE_PRACTICE_NAME)
    ]
    for line in _practice_lines(practice):
        practice_block.append(Paragraph(line, STYLE_PRACTICE_META))

    right_block = [
        Paragraph("Appointment", STYLE_DOC_TITLE),
        Paragraph(f"Ref: {appointment.code}", STYLE_DOC_META),
        Paragraph(f"Booked {booked_at}", STYLE_DOC_META),
    ]

    header = Table(
        [[_logo(), practice_block, right_block]],
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

    # --- Patient / appointment details ---------------------------------------
    doctor_name = doctor.user.name if doctor and doctor.user else "—"
    rows = [
        _info_row("Patient Name", patient.name if patient else "—")
        + _info_row("Patient ID", patient.code if patient else "—"),
        _info_row("Appointment No.", appointment.code)
        + _info_row("Status", appointment.status_label),
        _info_row("Doctor", doctor_name) + _info_row("Date & Time", appointment_time),
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

    info_table = Table(rows, colWidths=[32 * mm, 53 * mm, 32 * mm, 53 * mm])
    info_table.setStyle(TableStyle(info_style))
    story.append(info_table)

    def draw_footer(canvas, document):
        """Practice footer on every page, so a detached second page is still
        identifiable."""
        canvas.saveState()
        width, _height = A4
        y = 12 * mm
        canvas.setStrokeColor(SLATE_100)
        canvas.setLineWidth(0.5)
        canvas.line(20 * mm, y + 8, width - 20 * mm, y + 8)

        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(SLATE_400)
        left = " · ".join(filter(None, [practice.get("name"), practice.get("phone")]))
        canvas.drawString(20 * mm, y, left)
        canvas.drawRightString(
            width - 20 * mm,
            y,
            f"{appointment.code} · Page {document.page}",
        )
        canvas.setFont("Helvetica-Oblique", 6.5)
        canvas.drawCentredString(
            width / 2, y - 8, "This is a computer-generated appointment slip."
        )
        canvas.restoreState()

    doc.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
