from portal.extensions import db
from portal.models.department import Department
from portal.models.doctor import Doctor
from portal.models.medicine import Medicine
from portal.models.branch import Branch
from portal.models.medicine_brand import MedicineBrand, StockBatch
from portal.models.nurse import Nurse
from portal.models.pharmacist import Pharmacist
from portal.models.role import DEFAULT_ROLES, Role
from portal.models.staff_profile import StaffProfile
from portal.models.user import User

DEPARTMENTS = ["Orthopedics", "Gynecology", "Gastroenterology", "General Medicine"]

FORMULARY = [
    ("Paracetamol 650mg", "Analgesic/Antipyretic", "1 Tablet", "Every 6 hours"),
    ("Vitamin C 500mg", "Supplement", "1 Tablet", "Once Daily"),
    ("Zincovit Tablet", "Supplement", "1 Tablet", "Once Daily"),
    ("ORS", "Rehydration", "1 Sachet", "As needed"),
    ("Cetirizine 10mg", "Antihistamine", "1 Tablet", "Once Daily"),
    ("Amoxicillin 500mg", "Antibiotic", "1 Capsule", "Every 8 hours"),
    ("Ibuprofen 400mg", "NSAID", "1 Tablet", "Every 8 hours"),
    ("Omeprazole 20mg", "Antacid", "1 Capsule", "Once Daily, before food"),
    ("Cough Syrup (Dextromethorphan)", "Antitussive", "10ml", "Every 8 hours"),
]

# (name, email, password, department, specialization, registration_no)
DOCTORS = [
    (
        "Dr. Sandeep Viswanadh",
        "sandeep.viswanadh@yasodhahospitals.com",
        "Doctor@123",
        "Orthopedics",
        "Orthopedic Surgeon",
        "12545",
    ),
    (
        "Dr. Sahithi",
        "sahithi@yasodhahospitals.com",
        "Doctor@123",
        "Gynecology",
        "Gynecologist",
        "12678",
    ),
    (
        "Dr. Arjun Mehta",
        "arjun.mehta@yasodhahospitals.com",
        "Doctor@123",
        "Gastroenterology",
        "Gastroenterologist",
        "12811",
    ),
]


# (name, email, password, department, employee_no, shift)
#
# The trailing shift is no longer seeded onto the nurse profile — shifts are
# scheduled by an administrator on the shift schedule, per date, and a seeded
# "normal" shift was a fact nobody had entered and nobody could rely on. The
# value is kept in this table only so the tuples still describe the intent
# behind each demo account.
NURSES = [
    (
        "Sr. Lakshmi Rao",
        "lakshmi.rao@yasodhahospitals.com",
        "Nurse@123",
        "Orthopedics",
        "NUR1001",
        "morning",
    ),
    (
        "Sr. Fatima Begum",
        "fatima.begum@yasodhahospitals.com",
        "Nurse@123",
        "Gynecology",
        "NUR1002",
        "evening",
    ),
    (
        "Sr. Joseph Thomas",
        "joseph.thomas@yasodhahospitals.com",
        "Nurse@123",
        "General Medicine",
        "NUR1003",
        "night",
    ),
]


# (name, code, city). Cross-branch search is meaningless with one branch, so
# the seed ships three.
BRANCHES = [
    ("Yasodha Hospitals — Kakinada", "KKD", "Kakinada"),
    ("Yasodha Hospitals — Rajahmundry", "RJY", "Rajahmundry"),
    ("Yasodha Hospitals — Vizag", "VZG", "Visakhapatnam"),
]

# (name, email, password, department, lab department, employee code)
# Seeded so a fresh install has a working laboratory: a doctor ordering a test
# needs somebody to assign it to.
LAB_TECHNICIANS = [
    (
        "Anita Sharma",
        "anita.lab@yasodhahospitals.com",
        "LabTech@123",
        "General Medicine",
        "Haematology",
        "LAB2001",
    ),
    (
        "Kiran Babu",
        "kiran.lab@yasodhahospitals.com",
        "LabTech@123",
        "General Medicine",
        "Biochemistry",
        "LAB2002",
    ),
]

# (name, email, password, branch code, license no)
PHARMACISTS = [
    ("Ravi Teja", "ravi.pharmacy@yasodhahospitals.com", "Pharma@123", "KKD", "AP-PH-4471"),
    ("Sneha Reddy", "sneha.pharmacy@yasodhahospitals.com", "Pharma@123", "RJY", "AP-PH-5528"),
]

# (brand, generic, used_for, category, manufacturer, form, strength,
#  departments, {branch: qty})
#
# `departments` is either "ALL" — the medicine ships to every department via
# `for_all_departments`, for things every ward reaches for (analgesics, IV
# fluids) — or a list of department names to link individually through
# `medicine_departments`. `used_for` doubles as the symptom/indication text a
# pharmacist searches by; there is no separate symptoms table (see
# MedicineBrand's docstring), so this free-text field is where that lives.
#
# Spread across branches on purpose: some brands are missing from Kakinada so
# the cross-branch lookup has something real to find.
BRAND_CATALOGUE = [
    # --- Originally seeded, now retrofitted with department coverage -------
    ("Dolo 650", "Paracetamol", "Fever, mild to moderate pain, headache, body ache",
     "Analgesic/Antipyretic", "Micro Labs", "tablet", "650mg",
     "ALL", {"KKD": 240, "RJY": 180, "VZG": 90}),
    ("Crocin Advance", "Paracetamol", "Fever and headache relief",
     "Analgesic/Antipyretic", "GSK", "tablet", "500mg",
     "ALL", {"KKD": 60, "VZG": 120}),
    ("Augmentin 625 Duo", "Amoxicillin + Clavulanic Acid",
     "Bacterial infections of the chest, throat, skin and urinary tract",
     "Antibiotic", "GSK", "tablet", "625mg",
     ["General Medicine", "ENT", "Urology"], {"KKD": 45, "RJY": 80}),
    ("Azithral 500", "Azithromycin", "Respiratory, skin and ENT bacterial infections",
     "Antibiotic", "Alembic", "tablet", "500mg",
     ["ENT", "Pulmonology", "Dermatology"], {"RJY": 65, "VZG": 40}),
    ("Pan 40", "Pantoprazole", "Acidity, gastric reflux, stomach ulcers",
     "Antacid", "Alkem", "tablet", "40mg",
     ["Gastroenterology", "General Medicine"], {"KKD": 150, "RJY": 95}),
    ("Zerodol SP", "Aceclofenac + Paracetamol + Serratiopeptidase",
     "Pain and swelling in arthritis, injury and post-surgery",
     "NSAID", "Ipca", "tablet", "100mg",
     ["Orthopedics", "General Medicine"], {"KKD": 18, "VZG": 70}),
    ("Cetzine", "Cetirizine", "Allergy, running nose, sneezing, skin rash",
     "Antihistamine", "GSK", "tablet", "10mg",
     "ALL", {"KKD": 200, "RJY": 140}),
    ("Normal Saline 0.9%", "Sodium Chloride", "IV fluid for dehydration and electrolyte balance",
     "IV Fluid", "Baxter", "iv_fluid", "500ml",
     "ALL", {"KKD": 35, "RJY": 50, "VZG": 25}),
    ("Ondem 4", "Ondansetron", "Nausea and vomiting, including post-operative and chemotherapy-induced",
     "Antiemetic", "Alkem", "injection", "4mg",
     ["Gastroenterology", "Oncology", "General Medicine"], {"RJY": 30}),
    ("Ascoril LS", "Levosalbutamol + Ambroxol + Guaifenesin",
     "Wet cough with chest congestion", "Antitussive", "Glenmark", "syrup", "100ml",
     ["Pulmonology", "ENT", "General Medicine"], {"VZG": 55}),

    # --- Cardiology ----------------------------------------------------------
    ("Ecosprin 75", "Aspirin",
     "Heart attack prevention, blood thinning, reduces stroke and clotting risk",
     "Antiplatelet", "USV", "tablet", "75mg",
     ["Cardiology"], {"KKD": 120, "RJY": 90, "VZG": 60}),
    ("Concor 5", "Bisoprolol",
     "High blood pressure, chest pain (angina), irregular heartbeat, palpitations",
     "Beta-blocker", "Merck", "tablet", "5mg",
     ["Cardiology"], {"KKD": 80, "RJY": 55, "VZG": 40}),

    # --- Dermatology -----------------------------------------------------
    ("Candid-B Cream", "Clotrimazole + Beclomethasone",
     "Fungal skin infection, itching, ringworm, eczema, rash",
     "Antifungal/Steroid", "Glenmark", "ointment", "20g",
     ["Dermatology"], {"KKD": 40, "RJY": 30, "VZG": 20}),
    ("Atarax 25", "Hydroxyzine",
     "Skin allergy, itching, hives, urticaria, allergic skin reaction",
     "Antihistamine", "Pfizer", "tablet", "25mg",
     ["Dermatology"], {"KKD": 70, "RJY": 50, "VZG": 35}),

    # --- Endocrinology -----------------------------------------------------
    ("Glycomet 500", "Metformin",
     "Type 2 diabetes, high blood sugar, excessive thirst and urination",
     "Antidiabetic", "USV", "tablet", "500mg",
     ["Endocrinology"], {"KKD": 100, "RJY": 70, "VZG": 50}),
    ("Eltroxin 50", "Levothyroxine",
     "Hypothyroidism, low thyroid, fatigue, weight gain, cold intolerance",
     "Thyroid Hormone", "GSK", "tablet", "50mcg",
     ["Endocrinology"], {"KKD": 60, "RJY": 40, "VZG": 30}),

    # --- ENT -----------------------------------------------------------------
    ("Otrivin Nasal Spray", "Xylometazoline",
     "Blocked nose, nasal congestion, sinusitis, breathing difficulty",
     "Decongestant", "GSK", "drops", "0.1%",
     ["ENT"], {"KKD": 30, "RJY": 20, "VZG": 15}),
    ("Sinarest Tablet", "Paracetamol + Phenylephrine + Chlorpheniramine",
     "Common cold, sinus pressure, runny nose, sneezing, congestion",
     "Cold & Sinus Relief", "Centaur", "tablet", "500mg",
     ["ENT", "General Medicine"], {"KKD": 90, "RJY": 65, "VZG": 45}),

    # --- Gastroenterology ----------------------------------------------------
    ("Eldoper", "Loperamide", "Acute diarrhea, loose motions, frequent watery stools",
     "Antidiarrheal", "Torrent", "capsule", "2mg",
     ["Gastroenterology"], {"KKD": 70, "RJY": 50, "VZG": 35}),
    ("Cremaffin Plus Syrup", "Liquid Paraffin + Milk of Magnesia",
     "Constipation, difficulty passing stools, bloating",
     "Laxative", "Abbott", "syrup", "225ml",
     ["Gastroenterology"], {"KKD": 40, "RJY": 30, "VZG": 20}),

    # --- General Medicine ------------------------------------------------
    ("Electral Powder", "Oral Rehydration Salts",
     "Dehydration, diarrhea, excessive sweating, fluid and electrolyte loss",
     "Rehydration", "FDC", "sachet", "21.8g",
     ["General Medicine"], {"KKD": 100, "RJY": 75, "VZG": 55}),
    ("Combiflam", "Ibuprofen + Paracetamol",
     "Fever with body pain, headache, toothache, muscle pain",
     "Analgesic", "Sanofi", "tablet", "400mg+325mg",
     ["General Medicine"], {"KKD": 110, "RJY": 80, "VZG": 60}),

    # --- Gynecology --------------------------------------------------------
    ("Meftal Spas", "Mefenamic Acid + Dicyclomine",
     "Menstrual cramps, period pain, abdominal cramps",
     "Analgesic/Antispasmodic", "Blue Cross", "tablet", "250mg+10mg",
     ["Gynecology"], {"KKD": 65, "RJY": 45, "VZG": 30}),
    ("Susten 200", "Micronized Progesterone",
     "Threatened miscarriage, luteal phase support, irregular periods",
     "Hormonal Support", "Sun Pharma", "capsule", "200mg",
     ["Gynecology"], {"KKD": 35, "RJY": 25, "VZG": 15}),

    # --- Nephrology --------------------------------------------------------
    ("Lasix 40", "Furosemide",
     "Fluid retention, swelling (edema), high blood pressure in kidney disease",
     "Diuretic", "Sanofi", "tablet", "40mg",
     ["Nephrology"], {"KKD": 55, "RJY": 40, "VZG": 25}),
    ("Nodosis 500", "Sodium Bicarbonate",
     "Metabolic acidosis, chronic kidney disease management",
     "Alkalizer", "USV", "tablet", "500mg",
     ["Nephrology"], {"KKD": 45, "RJY": 30, "VZG": 20}),

    # --- Neurology -----------------------------------------------------------
    ("Encorate 500", "Sodium Valproate",
     "Seizures, epilepsy, migraine prevention",
     "Anticonvulsant", "Sun Pharma", "tablet", "500mg",
     ["Neurology"], {"KKD": 50, "RJY": 35, "VZG": 25}),
    ("Gabapin 300", "Gabapentin",
     "Nerve pain, tingling and numbness, seizures",
     "Nerve Pain Relief", "Intas", "capsule", "300mg",
     ["Neurology"], {"KKD": 60, "RJY": 40, "VZG": 30}),

    # --- Oncology --------------------------------------------------------
    ("Emeset 8", "Ondansetron",
     "Nausea and vomiting from chemotherapy or radiotherapy",
     "Antiemetic", "Cipla", "tablet", "8mg",
     ["Oncology"], {"KKD": 40, "RJY": 30, "VZG": 20}),
    ("Folvite 5", "Folic Acid",
     "Anemia during cancer treatment, low blood counts",
     "Supplement", "GSK", "tablet", "5mg",
     ["Oncology"], {"KKD": 55, "RJY": 35, "VZG": 25}),

    # --- Ophthalmology -------------------------------------------------------
    ("Moxicip Eye Drops", "Moxifloxacin",
     "Bacterial eye infection, conjunctivitis (red eye), eye discharge",
     "Antibiotic Eye Drop", "Cipla", "drops", "0.5%",
     ["Ophthalmology"], {"KKD": 30, "RJY": 20, "VZG": 15}),
    ("Refresh Tears Eye Drops", "Carboxymethylcellulose",
     "Dry eyes, eye irritation, redness, burning sensation",
     "Lubricant", "Allergan", "drops", "0.5%",
     ["Ophthalmology"], {"KKD": 25, "RJY": 18, "VZG": 12}),

    # --- Orthopedics -----------------------------------------------------
    ("Shelcal 500", "Calcium + Vitamin D3",
     "Bone weakness, fracture healing, osteoporosis, joint pain",
     "Supplement", "Torrent", "tablet", "500mg",
     ["Orthopedics"], {"KKD": 90, "RJY": 65, "VZG": 45}),
    ("Calcirol Sachet", "Cholecalciferol",
     "Vitamin D deficiency, bone and joint pain, muscle weakness",
     "Vitamin D Supplement", "Cadila", "sachet", "60000 IU",
     ["Orthopedics"], {"KKD": 40, "RJY": 30, "VZG": 20}),

    # --- Pediatrics --------------------------------------------------------
    ("Calpol Syrup", "Paracetamol",
     "Fever and pain in children",
     "Analgesic/Antipyretic", "GSK", "syrup", "125mg/5ml",
     ["Pediatrics"], {"KKD": 70, "RJY": 50, "VZG": 35}),
    ("Practin Syrup", "Cyproheptadine",
     "Loss of appetite, allergy symptoms in children",
     "Appetite Stimulant/Antihistamine", "Cadila", "syrup", "2mg/5ml",
     ["Pediatrics"], {"KKD": 35, "RJY": 25, "VZG": 15}),

    # --- Psychiatry ------------------------------------------------------
    ("Nexito 10", "Escitalopram",
     "Depression, anxiety, panic attacks",
     "Antidepressant", "Sun Pharma", "tablet", "10mg",
     ["Psychiatry"], {"KKD": 45, "RJY": 30, "VZG": 20}),
    ("Restyl 0.25", "Alprazolam",
     "Anxiety, panic disorder, sleep difficulty due to stress",
     "Anti-anxiety", "Sun Pharma", "tablet", "0.25mg",
     ["Psychiatry"], {"KKD": 40, "RJY": 28, "VZG": 18}),

    # --- Pulmonology -------------------------------------------------------
    ("Asthalin Inhaler", "Salbutamol",
     "Asthma, wheezing, breathlessness, bronchospasm",
     "Bronchodilator", "Cipla", "inhaler", "100mcg",
     ["Pulmonology"], {"KKD": 40, "RJY": 28, "VZG": 18}),
    ("Budecort Inhaler", "Budesonide",
     "Asthma maintenance, COPD, chronic wheezing",
     "Steroid Inhaler", "Cipla", "inhaler", "200mcg",
     ["Pulmonology"], {"KKD": 35, "RJY": 24, "VZG": 15}),

    # --- Urology -----------------------------------------------------------
    ("Cifran 500", "Ciprofloxacin",
     "Urinary tract infection, burning sensation during urination",
     "Antibiotic", "Ranbaxy", "tablet", "500mg",
     ["Urology"], {"KKD": 65, "RJY": 45, "VZG": 30}),
    ("Veltam 0.4", "Tamsulosin",
     "Enlarged prostate, difficulty urinating, weak urine stream",
     "Alpha Blocker", "Micro Labs", "capsule", "0.4mg",
     ["Urology"], {"KKD": 40, "RJY": 28, "VZG": 18}),
]


def seed_branches():
    branches = {}
    for name, code, city in BRANCHES:
        branch = Branch.query.filter_by(code=code).first()
        if not branch:
            branch = Branch(name=name, code=code, city=city)
            db.session.add(branch)
            db.session.commit()
        branches[code] = branch
    return branches


def seed_pharmacists(branches):
    role = Role.query.filter_by(name="pharmacist").first()
    for name, email, password, branch_code, license_no in PHARMACISTS:
        user = User.query.filter_by(email=email).first()
        if not user:
            user = User(name=name, email=email, role_id=role.id)
            user.set_password(password)
            db.session.add(user)
            db.session.commit()
        if not Pharmacist.query.filter_by(user_id=user.id).first():
            db.session.add(
                Pharmacist(
                    user_id=user.id,
                    branch_id=branches[branch_code].id,
                    license_no=license_no,
                )
            )
            db.session.commit()


def seed_pharmacy_catalogue(branches, departments):
    from datetime import date, timedelta

    for (
        brand_name, generic, used_for, category, maker, form, strength,
        dept_spec, stock,
    ) in BRAND_CATALOGUE:
        brand = MedicineBrand.query.filter_by(brand_name=brand_name, strength=strength).first()
        if not brand:
            brand = MedicineBrand(
                brand_name=brand_name,
                generic_name=generic,
                used_for=used_for,
                category=category,
                manufacturer=maker,
                form=form,
                strength=strength,
                # Link to the clinical formulary where the generic matches, so
                # a prescription can be filled with this brand.
                medicine_id=(
                    Medicine.query.filter(Medicine.name.ilike(f"%{generic.split()[0]}%")).first().id
                    if Medicine.query.filter(Medicine.name.ilike(f"%{generic.split()[0]}%")).first()
                    else None
                ),
            )
            db.session.add(brand)
            db.session.commit()

        # Runs unconditionally, not just on creation: earlier seeds shipped
        # these 10 brands with no department at all, so a brand that already
        # exists still needs its department links backfilled.
        brand.for_all_departments = dept_spec == "ALL"
        if dept_spec != "ALL":
            for dept_name in dept_spec:
                dept = departments.get(dept_name)
                if dept and dept not in brand.departments:
                    brand.departments.append(dept)
        db.session.commit()

        for branch_code, quantity in stock.items():
            branch = branches[branch_code]
            exists = StockBatch.query.filter_by(branch_id=branch.id, brand_id=brand.id).first()
            if not exists:
                db.session.add(
                    StockBatch(
                        branch_id=branch.id,
                        brand_id=brand.id,
                        batch_no=f"B{brand.id:03d}{branch.code}",
                        expiry_date=date.today() + timedelta(days=420),
                        quantity=quantity,
                        mrp=round(12 + brand.id * 7.5, 2),
                        cost_price=round((12 + brand.id * 7.5) * 0.72, 2),
                    )
                )
        db.session.commit()


def seed_roles():
    """Reconciles the roles table against models/role.DEFAULT_ROLES.

    Migration 9a51dd64f4ba already guarantees these exist, so this is a
    belt-and-braces pass for a database that predates it — and it refreshes
    descriptions, so editing the wording in one place is enough.
    """
    for name, description in DEFAULT_ROLES:
        role = Role.query.filter_by(name=name).first()
        if role:
            role.description = description
        else:
            db.session.add(Role(name=name, description=description))
    db.session.commit()


def seed_departments():
    """Ensures `DEPARTMENTS` exist, then returns *every* department keyed by
    name — not just the ones in that list. Migration f7a3c58e91b2 seeds a
    further 12 clinical departments (Cardiology, Dermatology, ...) directly at
    migration time, and the pharmacy catalogue below needs to look all 16 up
    by name to link a brand to the department that prescribes it."""
    for name in DEPARTMENTS:
        if not Department.query.filter_by(name=name).first():
            db.session.add(Department(name=name))
    db.session.commit()
    return {d.name: d for d in Department.query.all()}


def seed_admin():
    admin_role = Role.query.filter_by(name="admin").first()
    if not User.query.filter_by(email="admin@yasodhahospitals.com").first():
        admin = User(name="Admin", email="admin@yasodhahospitals.com", role_id=admin_role.id)
        admin.set_password("Admin@123")
        db.session.add(admin)
        db.session.commit()


def seed_receptionist():
    receptionist_role = Role.query.filter_by(name="receptionist").first()
    if not User.query.filter_by(email="reception@yasodhahospitals.com").first():
        receptionist = User(
            name="Reception Desk",
            email="reception@yasodhahospitals.com",
            role_id=receptionist_role.id,
        )
        receptionist.set_password("Reception@123")
        db.session.add(receptionist)
        db.session.commit()


def seed_doctors(departments):
    doctor_role = Role.query.filter_by(name="doctor").first()
    for name, email, password, dept_name, specialization, reg_no in DOCTORS:
        user = User.query.filter_by(email=email).first()
        if not user:
            user = User(name=name, email=email, role_id=doctor_role.id)
            user.set_password(password)
            db.session.add(user)
            db.session.commit()

        if not Doctor.query.filter_by(user_id=user.id).first():
            doctor = Doctor(
                user_id=user.id,
                department_id=departments[dept_name].id,
                specialization=specialization,
                registration_no=reg_no,
            )
            db.session.add(doctor)
            db.session.commit()


def seed_nurses(departments):
    nurse_role = Role.query.filter_by(name="nurse").first()
    for name, email, password, dept_name, employee_no, _shift in NURSES:
        user = User.query.filter_by(email=email).first()
        if not user:
            user = User(name=name, email=email, role_id=nurse_role.id)
            user.set_password(password)
            db.session.add(user)
            db.session.commit()

        if not Nurse.query.filter_by(user_id=user.id).first():
            # No `shift=`: a nurse starts with no scheduled shift at all, and
            # gets one only when an administrator schedules it.
            db.session.add(
                Nurse(
                    user_id=user.id,
                    department_id=departments[dept_name].id,
                    employee_no=employee_no,
                )
            )
            db.session.commit()


def seed_lab_technicians(departments):
    """Lab technicians have no operational profile table of their own — the
    laboratory joins on `users` directly — so this only needs the account and
    the HR profile that holds which bench they work."""
    role = Role.query.filter_by(name="lab_technician").first()
    for name, email, password, dept_name, lab_department, employee_code in LAB_TECHNICIANS:
        user = User.query.filter_by(email=email).first()
        if not user:
            user = User(name=name, email=email, role_id=role.id)
            user.set_password(password)
            db.session.add(user)
            db.session.commit()

        if not StaffProfile.query.filter_by(user_id=user.id).first():
            db.session.add(
                StaffProfile(
                    user_id=user.id,
                    department_id=departments[dept_name].id,
                    lab_department=lab_department,
                    employee_code=employee_code,
                    designation="Lab Technician",
                )
            )
            db.session.commit()


def seed_formulary():
    for name, category, dose, frequency in FORMULARY:
        if not Medicine.query.filter_by(name=name).first():
            db.session.add(
                Medicine(name=name, category=category, default_dose=dose, default_frequency=frequency)
            )
    db.session.commit()


def run():
    """Seeds the reference data the app can't run without: roles, departments,
    the formulary and the staff logins.

    Patients are deliberately not seeded. A patient with no assigned doctor is
    invisible to every doctor (see helpers/patient_access), so demo rows only
    ever showed up as clutter on the admin's list — real patients come in
    through the front desk.
    """
    seed_roles()
    departments = seed_departments()
    seed_admin()
    seed_receptionist()
    seed_doctors(departments)
    seed_nurses(departments)
    seed_formulary()
    branches = seed_branches()
    seed_lab_technicians(departments)
    seed_pharmacists(branches)
    seed_pharmacy_catalogue(branches, departments)
    print("Seed complete.")
    print("  Admin        -> admin@yasodhahospitals.com / Admin@123")
    print("  Receptionist -> reception@yasodhahospitals.com / Reception@123")
    for _name, email, password, dept_name, _spec, _reg in DOCTORS:
        print(f"  Doctor -> {email} / {password}  ({dept_name})")
    for _name, email, password, dept_name, _emp, _shift in NURSES:
        print(f"  Nurse  -> {email} / {password}  ({dept_name})")
    for _name, email, password, _dept, lab_dept, _emp in LAB_TECHNICIANS:
        print(f"  Lab    -> {email} / {password}  ({lab_dept})")
    for _name, email, password, branch_code, _lic in PHARMACISTS:
        print(f"  Pharmacy -> {email} / {password}  ({branch_code})")
    print(f"  Seeded {len(FORMULARY)} formulary medicines, "
          f"{len(BRANCHES)} branches, {len(BRAND_CATALOGUE)} pharmacy brands")
