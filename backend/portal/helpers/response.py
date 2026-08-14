from flask import jsonify


def success(data=None, message="OK", status=200):
    return jsonify({"success": True, "message": message, "data": data}), status


def error(message="Something went wrong", status=400, errors=None):
    return jsonify({"success": False, "message": message, "errors": errors}), status
