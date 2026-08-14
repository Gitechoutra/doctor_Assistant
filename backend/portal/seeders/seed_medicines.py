"""Seeds the practice's prescribing catalogue (`medicine_brands`).

The clinical formulary itself (`medicines`) is the short generic vocabulary
the AI is given, reconciled from `models/medicine.DEFAULT_FORMULARY` on every
application start (see `helpers/bootstrap.ensure_medicines`). This module
seeds the far longer list of actual products a doctor writes on a
prescription — a brand, a strength, a form — and links each back to its
generic where one matches.

Reconciled at boot as well as by `python -m portal.seeds`, because an empty
`medicine_brands` table is not a cosmetic gap: it is a prescription picker
with nothing in it, and a doctor hand-typing every line of every
prescription. A practice that has never run a seed command still gets a
working formulary.

Brands are matched by (brand_name, strength) — the same pair the table's
unique constraint uses — and only ever inserted, never updated: re-running
this is a no-op for anything already present, and it never touches a brand
that was added or edited by hand afterwards, seeded or not.

The eighth field of each row is a leftover from the hospital version, where a
brand was tagged to the departments that stocked it. A practice has one
catalogue and one doctor, so it is read and discarded rather than deleted from
several hundred literal rows — see `seed_medicine_brands`.
"""

from portal.extensions import db
from portal.models.medicine import DEFAULT_FORMULARY, Medicine
from portal.models.medicine_brand import MedicineBrand

# (brand_name, generic_name, used_for, category, manufacturer, form, strength,
#  _departments)
#
# `_departments` is ignored — see the module docstring.
MEDICINE_BRANDS = [
    ("Dolo 650", "Paracetamol", "Fever, mild to moderate pain, headache, body ache",
     "Analgesic/Antipyretic", "Micro Labs", "tablet", "650mg", "ALL"),
    ("Crocin Advance", "Paracetamol", "Fever and headache relief",
     "Analgesic/Antipyretic", "GSK", "tablet", "500mg", "ALL"),
    ("Augmentin 625 Duo", "Amoxicillin + Clavulanic Acid",
     "Bacterial infections of the chest, throat, skin and urinary tract",
     "Antibiotic", "GSK", "tablet", "625mg",
     ["General Medicine", "ENT", "Urology"]),
    ("Azithral 500", "Azithromycin", "Respiratory, skin and ENT bacterial infections",
     "Antibiotic", "Alembic", "tablet", "500mg",
     ["ENT", "Pulmonology", "Dermatology"]),
    ("Pan 40", "Pantoprazole", "Acidity, gastric reflux, stomach ulcers",
     "Antacid", "Alkem", "tablet", "40mg",
     ["Gastroenterology", "General Medicine"]),
    ("Zerodol SP", "Aceclofenac + Paracetamol + Serratiopeptidase",
     "Pain and swelling in arthritis, injury and post-surgery",
     "NSAID", "Ipca", "tablet", "100mg",
     ["Orthopedics", "General Medicine"]),
    ("Cetzine", "Cetirizine", "Allergy, running nose, sneezing, skin rash",
     "Antihistamine", "GSK", "tablet", "10mg", "ALL"),
    ("Normal Saline 0.9%", "Sodium Chloride", "IV fluid for dehydration and electrolyte balance",
     "IV Fluid", "Baxter", "iv_fluid", "500ml", "ALL"),
    ("Ondem 4", "Ondansetron", "Nausea and vomiting, including post-operative and chemotherapy-induced",
     "Antiemetic", "Alkem", "injection", "4mg",
     ["Gastroenterology", "Oncology", "General Medicine"]),
    ("Ascoril LS", "Levosalbutamol + Ambroxol + Guaifenesin",
     "Wet cough with chest congestion", "Antitussive", "Glenmark", "syrup", "100ml",
     ["Pulmonology", "ENT", "General Medicine"]),

    ("Ecosprin 75", "Aspirin",
     "Heart attack prevention, blood thinning, reduces stroke and clotting risk",
     "Antiplatelet", "USV", "tablet", "75mg", ["Cardiology"]),
    ("Concor 5", "Bisoprolol",
     "High blood pressure, chest pain (angina), irregular heartbeat, palpitations",
     "Beta-blocker", "Merck", "tablet", "5mg", ["Cardiology"]),

    ("Candid-B Cream", "Clotrimazole + Beclomethasone",
     "Fungal skin infection, itching, ringworm, eczema, rash",
     "Antifungal/Steroid", "Glenmark", "ointment", "20g", ["Dermatology"]),
    ("Atarax 25", "Hydroxyzine",
     "Skin allergy, itching, hives, urticaria, allergic skin reaction",
     "Antihistamine", "Pfizer", "tablet", "25mg", ["Dermatology"]),

    ("Glycomet 500", "Metformin",
     "Type 2 diabetes, high blood sugar, excessive thirst and urination",
     "Antidiabetic", "USV", "tablet", "500mg", ["Endocrinology"]),
    ("Eltroxin 50", "Levothyroxine",
     "Hypothyroidism, low thyroid, fatigue, weight gain, cold intolerance",
     "Thyroid Hormone", "GSK", "tablet", "50mcg", ["Endocrinology"]),

    ("Otrivin Nasal Spray", "Xylometazoline",
     "Blocked nose, nasal congestion, sinusitis, breathing difficulty",
     "Decongestant", "GSK", "drops", "0.1%", ["ENT"]),
    ("Sinarest Tablet", "Paracetamol + Phenylephrine + Chlorpheniramine",
     "Common cold, sinus pressure, runny nose, sneezing, congestion",
     "Cold & Sinus Relief", "Centaur", "tablet", "500mg", ["ENT", "General Medicine"]),

    ("Eldoper", "Loperamide", "Acute diarrhea, loose motions, frequent watery stools",
     "Antidiarrheal", "Torrent", "capsule", "2mg", ["Gastroenterology"]),
    ("Cremaffin Plus Syrup", "Liquid Paraffin + Milk of Magnesia",
     "Constipation, difficulty passing stools, bloating",
     "Laxative", "Abbott", "syrup", "225ml", ["Gastroenterology"]),

    ("Electral Powder", "Oral Rehydration Salts",
     "Dehydration, diarrhea, excessive sweating, fluid and electrolyte loss",
     "Rehydration", "FDC", "sachet", "21.8g", ["General Medicine"]),
    ("Combiflam", "Ibuprofen + Paracetamol",
     "Fever with body pain, headache, toothache, muscle pain",
     "Analgesic", "Sanofi", "tablet", "400mg+325mg", ["General Medicine"]),

    ("Meftal Spas", "Mefenamic Acid + Dicyclomine",
     "Menstrual cramps, period pain, abdominal cramps",
     "Analgesic/Antispasmodic", "Blue Cross", "tablet", "250mg+10mg", ["Gynecology"]),
    ("Susten 200", "Micronized Progesterone",
     "Threatened miscarriage, luteal phase support, irregular periods",
     "Hormonal Support", "Sun Pharma", "capsule", "200mg", ["Gynecology"]),

    ("Lasix 40", "Furosemide",
     "Fluid retention, swelling (edema), high blood pressure in kidney disease",
     "Diuretic", "Sanofi", "tablet", "40mg", ["Nephrology"]),
    ("Nodosis 500", "Sodium Bicarbonate",
     "Metabolic acidosis, chronic kidney disease management",
     "Alkalizer", "USV", "tablet", "500mg", ["Nephrology"]),

    ("Encorate 500", "Sodium Valproate",
     "Seizures, epilepsy, migraine prevention",
     "Anticonvulsant", "Sun Pharma", "tablet", "500mg", ["Neurology"]),
    ("Gabapin 300", "Gabapentin",
     "Nerve pain, tingling and numbness, seizures",
     "Nerve Pain Relief", "Intas", "capsule", "300mg", ["Neurology"]),

    ("Emeset 8", "Ondansetron",
     "Nausea and vomiting from chemotherapy or radiotherapy",
     "Antiemetic", "Cipla", "tablet", "8mg", ["Oncology"]),
    ("Folvite 5", "Folic Acid",
     "Anemia during cancer treatment, low blood counts",
     "Supplement", "GSK", "tablet", "5mg", ["Oncology"]),

    ("Moxicip Eye Drops", "Moxifloxacin",
     "Bacterial eye infection, conjunctivitis (red eye), eye discharge",
     "Antibiotic Eye Drop", "Cipla", "drops", "0.5%", ["Ophthalmology"]),
    ("Refresh Tears Eye Drops", "Carboxymethylcellulose",
     "Dry eyes, eye irritation, redness, burning sensation",
     "Lubricant", "Allergan", "drops", "0.5%", ["Ophthalmology"]),

    ("Shelcal 500", "Calcium + Vitamin D3",
     "Bone weakness, fracture healing, osteoporosis, joint pain",
     "Supplement", "Torrent", "tablet", "500mg", ["Orthopedics"]),
    ("Calcirol Sachet", "Cholecalciferol",
     "Vitamin D deficiency, bone and joint pain, muscle weakness",
     "Vitamin D Supplement", "Cadila", "sachet", "60000 IU", ["Orthopedics"]),

    ("Calpol Syrup", "Paracetamol",
     "Fever and pain in children",
     "Analgesic/Antipyretic", "GSK", "syrup", "125mg/5ml", ["Pediatrics"]),
    ("Practin Syrup", "Cyproheptadine",
     "Loss of appetite, allergy symptoms in children",
     "Appetite Stimulant/Antihistamine", "Cadila", "syrup", "2mg/5ml", ["Pediatrics"]),

    ("Nexito 10", "Escitalopram",
     "Depression, anxiety, panic attacks",
     "Antidepressant", "Sun Pharma", "tablet", "10mg", ["Psychiatry"]),
    ("Restyl 0.25", "Alprazolam",
     "Anxiety, panic disorder, sleep difficulty due to stress",
     "Anti-anxiety", "Sun Pharma", "tablet", "0.25mg", ["Psychiatry"]),

    ("Asthalin Inhaler", "Salbutamol",
     "Asthma, wheezing, breathlessness, bronchospasm",
     "Bronchodilator", "Cipla", "inhaler", "100mcg", ["Pulmonology"]),
    ("Budecort Inhaler", "Budesonide",
     "Asthma maintenance, COPD, chronic wheezing",
     "Steroid Inhaler", "Cipla", "inhaler", "200mcg", ["Pulmonology"]),

    ("Cifran 500", "Ciprofloxacin",
     "Urinary tract infection, burning sensation during urination",
     "Antibiotic", "Ranbaxy", "tablet", "500mg", ["Urology"]),
    ("Veltam 0.4", "Tamsulosin",
     "Enlarged prostate, difficulty urinating, weak urine stream",
     "Alpha Blocker", "Micro Labs", "capsule", "0.4mg", ["Urology"]),
]


def seed_formulary():
    """Creates any missing formulary entry from DEFAULT_FORMULARY. Returns the
    names it created.

    Belt-and-braces: `ensure_medicines` already guarantees these exist on
    every application start, so this only matters for a database `python -m
    portal.seeds` is run against directly, without the app having started.
    """
    existing = {name for (name,) in db.session.query(Medicine.name).all()}
    missing = [row for row in DEFAULT_FORMULARY if row[0] not in existing]

    for name, category, dose, frequency in missing:
        db.session.add(
            Medicine(name=name, category=category, default_dose=dose, default_frequency=frequency)
        )
    if missing:
        db.session.commit()

    return [row[0] for row in missing]


def seed_medicine_brands():
    """Creates any missing brand, linking it to its formulary generic when one
    matches. Returns the brand names it created — a brand that already exists
    is left exactly as it is."""
    created = []

    for brand_name, generic, used_for, category, maker, form, strength, _departments in (
        MEDICINE_BRANDS
    ):
        if MedicineBrand.query.filter_by(brand_name=brand_name, strength=strength).first():
            continue

        medicine = (
            Medicine.query.filter(Medicine.name.ilike(f"%{generic.split()[0]}%")).first()
            if generic
            else None
        )
        db.session.add(
            MedicineBrand(
                brand_name=brand_name,
                generic_name=generic,
                used_for=used_for,
                category=category,
                manufacturer=maker,
                form=form,
                strength=strength,
                medicine_id=medicine.id if medicine else None,
            )
        )
        created.append(brand_name)

    db.session.commit()
    return created


def run():
    """The `python -m portal.seeds` entry point. Reports to stdout."""
    formulary_created = seed_formulary()
    brands_created = seed_medicine_brands()

    if formulary_created:
        print(f"  Formulary   -> added {len(formulary_created)}: {', '.join(formulary_created)}")
    else:
        print(f"  Formulary   -> all {len(DEFAULT_FORMULARY)} already present")

    if brands_created:
        print(f"  Medicines   -> added {len(brands_created)} brand(s)")
    else:
        print(f"  Medicines   -> all {len(MEDICINE_BRANDS)} brands already present")
