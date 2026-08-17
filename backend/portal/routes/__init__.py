"""Every API surface MediAssist AI exposes.

Thirteen blueprints, down from twenty. What went, and why: the hospital modules
this practice has no equivalent of — the emergency board, the nursing record,
the pharmacy counter, the laboratory, the shift rota, staff management and the
department directory. Their routes are gone rather than left registered and
unreachable, so a stale bookmark gets a 404 from the router instead of a 403
from a module nobody maintains.
"""

from portal.routes.appointment_routes import appointment_bp
from portal.routes.audit_routes import audit_bp
from portal.routes.auth_routes import auth_bp
from portal.routes.case_routes import case_bp
from portal.routes.consultation_routes import consultation_bp
from portal.routes.dashboard_routes import dashboard_bp
from portal.routes.doctor_routes import doctor_bp
from portal.routes.knowledge_routes import knowledge_bp
from portal.routes.notification_routes import notification_bp
from portal.routes.pa_routes import pa_bp
from portal.routes.patient_routes import patient_bp
from portal.routes.prescription_routes import prescription_bp
from portal.routes.report_routes import report_bp


def register_routes(app):
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")
    app.register_blueprint(patient_bp, url_prefix="/api/patients")
    app.register_blueprint(consultation_bp, url_prefix="/api/consultations")
    app.register_blueprint(case_bp, url_prefix="/api/cases")
    app.register_blueprint(knowledge_bp, url_prefix="/api/knowledge")
    app.register_blueprint(prescription_bp, url_prefix="/api/prescriptions")
    app.register_blueprint(appointment_bp, url_prefix="/api/appointments")
    app.register_blueprint(doctor_bp, url_prefix="/api/doctors")
    # The desk's accounts, created by the doctor -- see routes/pa_routes.
    app.register_blueprint(pa_bp, url_prefix="/api/pas")
    app.register_blueprint(report_bp, url_prefix="/api/reports")
    app.register_blueprint(notification_bp, url_prefix="/api/notifications")
    app.register_blueprint(audit_bp, url_prefix="/api/audit")
