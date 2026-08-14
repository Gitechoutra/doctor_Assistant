from flask import Blueprint, request
from flask_jwt_extended import jwt_required

from portal.extensions import db
from portal.helpers.decorators import role_required
from portal.helpers.response import error, success
from portal.models.department import Department

department_bp = Blueprint("departments", __name__)


@department_bp.get("")
@jwt_required()
def list_departments():
    departments = Department.query.order_by(Department.name).all()
    return success([d.to_dict() for d in departments])


@department_bp.get("/<int:department_id>")
@jwt_required()
def get_department(department_id):
    department = Department.query.get(department_id)
    if not department:
        return error("Department not found", status=404)
    return success(department.to_dict())


@department_bp.post("")
@role_required("admin")
def create_department():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()

    if not name:
        return error("name is required", status=422)

    if Department.query.filter_by(name=name).first():
        return error("A department with this name already exists", status=409)

    department = Department(name=name)
    db.session.add(department)
    db.session.commit()

    return success(department.to_dict(), message="Department created", status=201)
