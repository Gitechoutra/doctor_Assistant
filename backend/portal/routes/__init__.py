from portal.routes.audit_routes import audit_bp
from portal.routes.auth_routes import auth_bp
from portal.routes.dashboard_routes import dashboard_bp
from portal.routes.patient_routes import patient_bp
from portal.routes.pharmacy_routes import pharmacy_bp
from portal.routes.staff_routes import staff_bp
from portal.routes.case_routes import case_bp
from portal.routes.consultation_routes import consultation_bp
from portal.routes.knowledge_routes import knowledge_bp
from portal.routes.prescription_routes import prescription_bp
from portal.routes.department_routes import department_bp
from portal.routes.appointment_routes import appointment_bp
from portal.routes.emergency_routes import emergency_bp
from portal.routes.doctor_routes import doctor_bp
from portal.routes.report_routes import report_bp
from portal.routes.notification_routes import notification_bp
from portal.routes.nursing_routes import nursing_bp
from portal.routes.lab_routes import lab_bp
from portal.routes.shift_routes import shift_bp


def register_routes(app):
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")
    app.register_blueprint(patient_bp, url_prefix="/api/patients")
    app.register_blueprint(consultation_bp, url_prefix="/api/consultations")
    app.register_blueprint(case_bp, url_prefix="/api/cases")
    app.register_blueprint(knowledge_bp, url_prefix="/api/knowledge")
    app.register_blueprint(prescription_bp, url_prefix="/api/prescriptions")
    app.register_blueprint(department_bp, url_prefix="/api/departments")
    app.register_blueprint(appointment_bp, url_prefix="/api/appointments")
    app.register_blueprint(emergency_bp, url_prefix="/api/emergency")
    app.register_blueprint(doctor_bp, url_prefix="/api/doctors")
    app.register_blueprint(report_bp, url_prefix="/api/reports")
    app.register_blueprint(notification_bp, url_prefix="/api/notifications")
    app.register_blueprint(nursing_bp, url_prefix="/api/nursing")
    app.register_blueprint(audit_bp, url_prefix="/api/audit")
    app.register_blueprint(pharmacy_bp, url_prefix="/api/pharmacy")
    app.register_blueprint(staff_bp, url_prefix="/api/staff")
    app.register_blueprint(shift_bp, url_prefix="/api/shifts")
    app.register_blueprint(lab_bp, url_prefix="/api/lab")
